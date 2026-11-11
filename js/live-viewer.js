/**
 * 中正國小少棒隊 (JHONG JHENG ELEMENTARY SCHOOL)
 * 家長專屬手機即時觀賽轉播引擎 (Read-Only Parent Live Viewer)
 */

class ParentLiveViewer {
    constructor() {
        this.activeChannel = 'intra'; // 'intra' | 'external'
        this.channels = {
            intra: null,
            external: null
        };
        this.lastSeenPlayKeys = {
            intra: null,
            external: null
        };
        this.voiceEnabled = false;
        this._hrAnimId = null;
        this._hrHideTimer = null;
    }

    get liveState() {
        return this.channels[this.activeChannel];
    }

    set liveState(val) {
        this.channels[this.activeChannel] = val;
    }

    init() {
        // 支援網址參數 ?fb= 自動帶入 Firebase 網址
        const params = new URLSearchParams(window.location.search);
        const fbParam = params.get('fb');
        if (fbParam && window.store) {
            window.store.setFirebaseUrl(fbParam);
        }

        // 支援網址參數 ?channel= 或 ?ch= 指定直接開啟「校內 (intra)」或「對外 (external)」頻道
        const chParam = (params.get('channel') || params.get('ch') || '').toLowerCase();
        if (chParam === 'external' || chParam === 'ext') {
            this.activeChannel = 'external';
        } else if (chParam === 'intra') {
            this.activeChannel = 'intra';
        }

        // 讀取本機各頻道快照
        try {
            const rawIntra = localStorage.getItem('YOUTH_BASEBALL_JJ_LIVE_INTRA_V5') || localStorage.getItem('YOUTH_BASEBALL_JJ_LIVE_V5') || localStorage.getItem('YOUTH_BASEBALL_JJ_LIVE_V3');
            if (rawIntra) {
                const parsed = JSON.parse(rawIntra);
                if (parsed && parsed.awayTeamId && parsed.homeTeamId) {
                    this.channels.intra = this.normalizeState(parsed);
                }
            }
        } catch (e) {}

        try {
            const rawExt = localStorage.getItem('YOUTH_BASEBALL_JJ_LIVE_EXT_V5');
            if (rawExt) {
                const parsed = JSON.parse(rawExt);
                if (parsed && parsed.awayTeamId && parsed.homeTeamId) {
                    this.channels.external = this.normalizeState(parsed);
                }
            }
        } catch (e) {}

        // 若未帶參數且校內沒在打、但對外賽正在打，自動優先切到對外頻道
        if (!chParam && !this.channels.intra && this.channels.external) {
            this.activeChannel = 'external';
        }

        // 綁定雙頻道切換按鈕
        document.getElementById('channel-btn-intra')?.addEventListener('click', () => this.switchChannel('intra'));
        document.getElementById('channel-btn-external')?.addEventListener('click', () => this.switchChannel('external'));

        this.render();
        this.startRealtimeSync();
    }

    switchChannel(ch) {
        if (ch !== 'intra' && ch !== 'external') return;
        this.activeChannel = ch;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('channel', ch);
            window.history.replaceState(null, '', url.toString());
        } catch (e) {}
        this.render();
    }

    renderChannelTabs() {
        const btnIntra = document.getElementById('channel-btn-intra');
        const dotIntra = document.getElementById('channel-dot-intra');
        const labelIntra = document.getElementById('channel-label-intra');

        const btnExt = document.getElementById('channel-btn-external');
        const dotExt = document.getElementById('channel-dot-external');
        const labelExt = document.getElementById('channel-label-external');

        const intra = this.channels.intra;
        const ext = this.channels.external;

        if (btnIntra && dotIntra && labelIntra) {
            btnIntra.classList.toggle('active', this.activeChannel === 'intra');
            dotIntra.classList.toggle('live', Boolean(intra));
            if (intra) {
                labelIntra.textContent = `🏟️ 校內實況 (${intra.awayScore}:${intra.homeScore})`;
            } else {
                labelIntra.textContent = '🏟️ 校內賽實況';
            }
        }

        if (btnExt && dotExt && labelExt) {
            btnExt.classList.toggle('active', this.activeChannel === 'external');
            btnExt.classList.toggle('channel-ext', true);
            dotExt.classList.toggle('live', Boolean(ext));
            if (ext) {
                labelExt.textContent = `🌏 對外代表隊 (${ext.awayScore}:${ext.homeScore})`;
            } else {
                labelExt.textContent = '🌏 對外代表隊';
            }
        }
    }

    normalizeState(st) {
        if (!st || typeof st !== 'object') return null;
        if (!st.bases || typeof st.bases !== 'object') {
            st.bases = { first: null, second: null, third: null };
        } else {
            if (st.bases.first === undefined) st.bases.first = null;
            if (st.bases.second === undefined) st.bases.second = null;
            if (st.bases.third === undefined) st.bases.third = null;
        }
        st.awayLineup = Array.isArray(st.awayLineup) ? st.awayLineup : Object.values(st.awayLineup || {});
        st.homeLineup = Array.isArray(st.homeLineup) ? st.homeLineup : Object.values(st.homeLineup || {});
        st.battingStats = (st.battingStats && typeof st.battingStats === 'object') ? st.battingStats : {};
        st.pitchingStats = (st.pitchingStats && typeof st.pitchingStats === 'object') ? st.pitchingStats : {};
        st.playByPlay = Array.isArray(st.playByPlay) ? st.playByPlay : Object.values(st.playByPlay || {});
        const maxInn = Number(st.maxInnings) || 4;
        if (!st.lineScore || typeof st.lineScore !== 'object') {
            st.lineScore = { away: Array(maxInn).fill(0), home: Array(maxInn).fill(0) };
        } else {
            st.lineScore.away = Array.isArray(st.lineScore.away) ? st.lineScore.away : Object.values(st.lineScore.away || [0]);
            st.lineScore.home = Array.isArray(st.lineScore.home) ? st.lineScore.home : Object.values(st.lineScore.home || [0]);
        }
        return st;
    }

    startRealtimeSync() {
        // 1. 區域網路 SSE 同步
        if (window.location.protocol !== 'file:' && typeof EventSource !== 'undefined') {
            try {
                const sse = new EventSource('/api/events');
                sse.onmessage = (ev) => {
                    try {
                        const msg = JSON.parse(ev.data);
                        if (msg.type === 'connected') {
                            if (msg.liveGames) {
                                this.applyIncomingChannelState('intra', msg.liveGames.intra);
                                this.applyIncomingChannelState('external', msg.liveGames.external);
                            } else if (msg.liveState) {
                                const ch = msg.liveState.isExternal ? 'external' : 'intra';
                                this.applyIncomingChannelState(ch, msg.liveState);
                            }
                        } else if (msg.type === 'live_updated') {
                            if (msg.liveGames) {
                                this.applyIncomingChannelState('intra', msg.liveGames.intra);
                                this.applyIncomingChannelState('external', msg.liveGames.external);
                            } else if (msg.channel) {
                                this.applyIncomingChannelState(msg.channel, msg.liveState);
                            } else if (msg.liveState) {
                                const ch = msg.liveState.isExternal ? 'external' : 'intra';
                                this.applyIncomingChannelState(ch, msg.liveState);
                            }
                        } else if (msg.type === 'data_updated' && msg.data && window.store) {
                            window.store.data = window.store.normalizeData(msg.data);
                            this.render();
                        }
                    } catch (e) {}
                };
            } catch (e) {}
        }

        // 2. Firebase 雲端每 2 秒高速輪詢同步
        this.pollCloud();
        setInterval(() => this.pollCloud(), 2000);
    }

    async pollCloud() {
        const fbUrl = window.store ? window.store.firebaseDbUrl : '';
        if (!fbUrl) return;
        try {
            const res = await fetch(`${fbUrl}/jj_baseball.json`, { cache: 'no-store' });
            if (!res.ok) return;
            const root = await res.json();
            if (root && root.league_data && window.store) {
                window.store.data = window.store.normalizeData(root.league_data);
            }

            // 雙頻道獨立更新
            let intraCloud = (root && root.live_intra && root.live_intra.state) ? root.live_intra.state : null;
            let extCloud = (root && root.live_external && root.live_external.state) ? root.live_external.state : null;

            // 向下相容 legacy live_game
            if (!intraCloud && !extCloud && root && root.live_game && root.live_game.state) {
                const legacy = root.live_game.state;
                if (legacy.isExternal) {
                    extCloud = legacy;
                } else {
                    intraCloud = legacy;
                }
            }

            this.applyIncomingChannelState('intra', intraCloud);
            this.applyIncomingChannelState('external', extCloud);

            const subEl = document.getElementById('viewer-sync-subtitle');
            if (subEl) subEl.textContent = '🔥 已連線雲端雙頻道轉播（每 2 秒自動同步球場實況）';
        } catch (e) {}
    }

    applyIncomingState(rawState) {
        const ch = (rawState && rawState.isExternal) ? 'external' : this.activeChannel;
        this.applyIncomingChannelState(ch, rawState);
    }

    applyIncomingChannelState(channel, rawState) {
        const ch = (channel === 'external') ? 'external' : 'intra';
        const normalized = rawState ? this.normalizeState(rawState) : null;

        // 若該頻道剛好是目前家長正在觀看的頻道，比對最新播報與全壘打動畫
        if (ch === this.activeChannel) {
            if (normalized && normalized.playByPlay && normalized.playByPlay.length > 0) {
                const topPlay = normalized.playByPlay[0];
                const playKey = `${normalized.id}_${normalized.playByPlay.length}_${topPlay.text}`;
                const isFirstLoad = (this.lastSeenPlayKeys[ch] === null);
                if (this.lastSeenPlayKeys[ch] !== playKey) {
                    this.lastSeenPlayKeys[ch] = playKey;
                    if (!isFirstLoad) {
                        this.onNewPlayArrived(topPlay);
                    }
                }
            } else if (!normalized) {
                this.lastSeenPlayKeys[ch] = null;
            }
        }

        this.channels[ch] = normalized;

        const timeEl = document.getElementById('viewer-last-update');
        if (timeEl) {
            timeEl.textContent = `最後同步：${new Date().toLocaleTimeString('zh-TW')}`;
        }
        this.render();
    }

    onNewPlayArrived(playItem) {
        const banner = document.getElementById('viewer-latest-play-box');
        if (banner) {
            banner.classList.add('flash');
            setTimeout(() => banner.classList.remove('flash'), 900);
        }

        if (playItem && playItem.text) {
            this.speakText(playItem.text);
            // 若最新播報包含「全壘打」，自動在家長手機上放煙火並顯示 HOME RUN! 電視牆
            if (playItem.text.includes('全壘打')) {
                this.triggerHomeRunJumbotron(playItem.text);
            }
        }
    }

    toggleVoice() {
        this.voiceEnabled = !this.voiceEnabled;
        const btn = document.getElementById('viewer-voice-btn');
        if (btn) {
            btn.textContent = this.voiceEnabled ? '🔊 語音轉播：開' : '🔇 語音轉播：關';
            btn.style.borderColor = this.voiceEnabled ? 'var(--jj-gold)' : 'var(--border-color)';
        }
        if (!this.voiceEnabled && ('speechSynthesis' in window)) {
            window.speechSynthesis.cancel();
        }
    }

    pickBestVoice() {
        if (!('speechSynthesis' in window)) return null;
        const all = window.speechSynthesis.getVoices() || [];
        const zhVoices = all.filter(v =>
            /zh|cmn|taiwan|chinese|國語|臺灣|台灣|美佳|meijia|hsiao|yunjhe|hanhan|zhiwei|yating/i.test(`${v.lang} ${v.name}`)
        );
        if (zhVoices.length === 0) return null;

        const scoreVoice = (v) => {
            const s = `${v.name} ${v.lang}`;
            let score = 0;
            if (/YunJhe.*Natural/i.test(s)) score += 1000;
            else if (/HsiaoChen.*Natural/i.test(s)) score += 980;
            else if (/HsiaoYu.*Natural/i.test(s)) score += 960;
            else if (/Natural|Neural/i.test(s) && /TW|Taiwan|臺灣|台灣/i.test(s)) score += 920;
            else if (/Google.*(國語|臺灣|台灣|zh-TW)/i.test(s)) score += 860;
            else if (/Meijia|美佳/i.test(s) && /Enhanced|Premium/i.test(s)) score += 850;
            else if (/Meijia|美佳|Siri/i.test(s)) score += 800;
            else if (/Online/i.test(s) && /TW|Taiwan/i.test(s)) score += 750;
            else if (/Natural|Neural/i.test(s)) score += 650;
            else if (/zh-TW|zh_TW|Taiwan|臺灣|台灣/i.test(s)) score += 500;
            else if (/zh-HK|zh-CN/i.test(s)) score += 200;
            if (/Desktop/i.test(s)) score -= 150;
            return score;
        };

        return zhVoices.sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
    }

    formatBaseballSpeechText(rawText) {
        if (!rawText) return '';
        let t = String(rawText).replace(/[⚾🔥🏃🚫⚡🏠🔔🏁]/g, '').trim();

        const spaceIdx = t.indexOf(' ');
        if (spaceIdx > 0) {
            const namePart = t.slice(0, spaceIdx).trim();
            const actionPart = t.slice(spaceIdx + 1).trim();
            t = `${namePart}，${actionPart}`;
        }

        t = t
            .replace(/^曾/g, '增')
            .replace(/曾聖壹/g, '增聖一')
            .replace(/余家樂/g, '余家勒')
            .replace(/許庭榞/g, '許庭元')
            .replace(/辛士宖/g, '辛士宏')
            .replace(/陳竑墐/g, '陳宏瑾')
            .replace(/陳逸釩/g, '陳逸凡')
            .replace(/吳苙均/g, '吳立均')
            .replace(/張焱融/g, '張諺融')
            .replace(/黃啟紘/g, '黃啟宏')
            .replace(/顏煜宸/g, '顏育辰')
            .replace(/蔡宇晟/g, '蔡宇成')
            .replace(/涂芳綵/g, '途芳彩')
            .replace(/何東芮/g, '何東瑞')
            .replace(/許佑銓/g, '許佑全')
            .replace(/郭宸汰/g, '郭辰泰')
            .replace(/林辰宥/g, '林辰右')
            .replace(/滾地出局/g, '滾弟出局')
            .replace(/滾地球/g, '滾弟球')
            .replace(/犧牲觸擊/g, '犧牲觸及')
            .replace(/跑回得分/g, '跑回德分')
            .replace(/得分/g, '德分')
            .replace(/好球進壘/g, '好球');

        return `${t}。`;
    }

    speakText(text) {
        if (!this.voiceEnabled || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const phoneticText = this.formatBaseballSpeechText(text);
            const utter = new SpeechSynthesisUtterance(phoneticText);
            const bestVoice = this.pickBestVoice();
            if (bestVoice) {
                utter.voice = bestVoice;
                utter.lang = bestVoice.lang || 'zh-TW';
            } else {
                utter.lang = 'zh-TW';
            }
            utter.rate = 1.0;
            utter.pitch = 1.0;
            utter.volume = 1.0;
            window.speechSynthesis.speak(utter);
        } catch (e) {}
    }

    playHomeRunFanfare() {
        if (!this.voiceEnabled) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const notes = [
                { f: 523.25, t: 0.0, d: 0.14 },
                { f: 659.25, t: 0.15, d: 0.14 },
                { f: 783.99, t: 0.30, d: 0.14 },
                { f: 1046.50, t: 0.46, d: 0.55 }
            ];
            notes.forEach(n => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(n.f, ctx.currentTime + n.t);
                gain.gain.setValueAtTime(0.001, ctx.currentTime + n.t);
                gain.gain.exponentialRampToValueAtTime(0.24, ctx.currentTime + n.t + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.t + n.d);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + n.t);
                osc.stop(ctx.currentTime + n.t + n.d + 0.02);
            });
        } catch (e) {}
    }

    triggerHomeRunJumbotron(bannerText) {
        const overlay = document.getElementById('v-hr-jumbotron-overlay');
        const banner = document.getElementById('v-hr-batter-banner');
        const canvas = document.getElementById('v-hr-fireworks-canvas');
        if (!overlay || !canvas) return;

        if (banner) banner.textContent = bannerText || '🔥 轟出全壘打！';
        overlay.classList.add('active');
        this.playHomeRunFanfare();

        const rect = overlay.getBoundingClientRect();
        canvas.width = Math.max(280, rect.width || 360);
        canvas.height = Math.max(240, rect.height || 295);
        const ctx = canvas.getContext('2d');

        const colors = ['#facc15', '#ef4444', '#38bdf8', '#34d399', '#f472b6', '#ffffff', '#fb923c'];
        const particles = [];

        const spawnBurst = (cx, cy) => {
            const color = colors[Math.floor(Math.random() * colors.length)];
            for (let i = 0; i < 36; i++) {
                const angle = (Math.PI * 2 * i) / 36 + (Math.random() - 0.5) * 0.2;
                const speed = 1.6 + Math.random() * 3.8;
                particles.push({
                    x: cx, y: cy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 0.6,
                    alpha: 1,
                    size: 2.2 + Math.random() * 2.2,
                    color
                });
            }
        };

        spawnBurst(canvas.width * 0.25, canvas.height * 0.32);
        spawnBurst(canvas.width * 0.75, canvas.height * 0.28);
        spawnBurst(canvas.width * 0.50, canvas.height * 0.22);

        let frame = 0;
        if (this._hrAnimId) cancelAnimationFrame(this._hrAnimId);

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            frame++;
            if (frame % 18 === 0) {
                spawnBurst(canvas.width * (0.15 + Math.random() * 0.7), canvas.height * (0.15 + Math.random() * 0.55));
            }
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.055;
                p.alpha -= 0.018;
                if (p.alpha <= 0) {
                    particles.splice(i, 1);
                    continue;
                }
                ctx.save();
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            this._hrAnimId = requestAnimationFrame(animate);
        };
        this._hrAnimId = requestAnimationFrame(animate);

        clearTimeout(this._hrHideTimer);
        this._hrHideTimer = setTimeout(() => this.hideHomeRunJumbotron(), 4500);
    }

    hideHomeRunJumbotron() {
        const overlay = document.getElementById('v-hr-jumbotron-overlay');
        if (overlay) overlay.classList.remove('active');
        if (this._hrAnimId) {
            cancelAnimationFrame(this._hrAnimId);
            this._hrAnimId = null;
        }
        clearTimeout(this._hrHideTimer);
    }

    teamBadgeHTML(teamId) {
        const t = window.store.getTeam(teamId);
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:800;background:${t.color}22;color:${t.color};border:1px solid ${t.color}66;">${t.emoji} ${t.name}</span>`;
    }

    render() {
        this.renderChannelTabs();
        const ch = this.activeChannel;
        const st = this.channels[ch];
        const badgeEl = document.getElementById('viewer-live-badge');

        if (st) {
            if (badgeEl) {
                badgeEl.className = 'live-status-pill';
                const chName = (ch === 'external') ? '🌏 對外代表隊' : '🏟️ 校內賽';
                badgeEl.innerHTML = `<span class="live-dot"></span><span>LIVE 【${chName}】即時轉播中</span>`;
            }
            this.renderActiveGame(st, true);
            return;
        }

        // 若該頻道目前無進行中比賽，尋找該頻道最近一場完賽紀錄回顧
        const allGames = (window.store && Array.isArray(window.store.data.games)) ? window.store.data.games : [];
        const lastGame = allGames.find(g => (ch === 'external') ? Boolean(g.isExternal) : !g.isExternal) || null;

        if (badgeEl) {
            badgeEl.className = 'live-status-pill standby';
            const chName = (ch === 'external') ? '對外代表隊' : '校內聯賽';
            badgeEl.innerHTML = lastGame
                ? `<span>🏁 【${chName}】目前無進行中賽事（顯示最新完賽結果）</span>`
                : `<span>⚾ 【${chName}】等待開賽中（球場開賽後將自動同步）</span>`;
        }

        if (lastGame) {
            this.renderFinishedGameReplay(lastGame);
        } else {
            this.renderStandbyEmpty(ch);
        }
    }

    renderActiveGame(st) {
        const awayTeam = window.store.getTeam(st.awayTeamId);
        const homeTeam = window.store.getTeam(st.homeTeamId);
        const isTop = st.half === 'top';
        const battingTeam = isTop ? awayTeam : homeTeam;
        const fieldingTeam = isTop ? homeTeam : awayTeam;
        const sameTeam = st.sameTeamPitcher !== false;
        const pitcherTeam = sameTeam ? battingTeam : fieldingTeam;

        const lineup = isTop ? st.awayLineup : st.homeLineup;
        const bIdx = isTop ? st.awayBatterIndex : st.homeBatterIndex;
        const orderNo = lineup.length > 0 ? (bIdx % lineup.length) + 1 : 1;
        const batterId = lineup.length > 0 ? lineup[bIdx % lineup.length] : null;
        const batter = batterId ? window.store.getPlayer(batterId) : null;

        const pitcherId = sameTeam
            ? (isTop ? st.awayPitcherId : st.homePitcherId)
            : (isTop ? st.homePitcherId : st.awayPitcherId);
        const pitcher = pitcherId ? window.store.getPlayer(pitcherId) : null;

        document.getElementById('viewer-tournament-title').textContent = `${st.date} ｜ ${st.tournament} (${st.maxInnings || 4}局制)`;
        document.getElementById('viewer-inning-badge').textContent = `${st.inning}局${isTop ? '上' : '下'}`;

        // 1. 逐局計分板
        const inningsCount = Math.max(st.maxInnings || 4, st.lineScore.away.length);
        let headCols = '<th class="team-col">對戰隊伍</th>';
        let awayCols = `<td class="team-col">${awayTeam.emoji} ${awayTeam.name} (先攻)</td>`;
        let homeCols = `<td class="team-col">${homeTeam.emoji} ${homeTeam.name} (後攻)</td>`;

        for (let i = 0; i < inningsCount; i++) {
            const isCurrent = (st.inning === i + 1);
            headCols += `<th style="${isCurrent ? 'color:var(--cpbl-gold);' : ''}">${i + 1}</th>`;
            awayCols += `<td style="${isCurrent && isTop ? 'background:rgba(203,176,99,0.25);color:#fff;' : ''}">${st.lineScore.away[i] ?? ''}</td>`;
            homeCols += `<td style="${isCurrent && !isTop ? 'background:rgba(203,176,99,0.25);color:#fff;' : ''}">${st.lineScore.home[i] ?? ''}</td>`;
        }

        headCols += '<th class="rhe-col">R</th><th class="rhe-col">H</th><th class="rhe-col">E</th>';
        awayCols += `<td class="rhe-col">${st.awayScore}</td><td>${st.awayHits}</td><td>${st.awayErrors}</td>`;
        homeCols += `<td class="rhe-col">${st.homeScore}</td><td>${st.homeHits}</td><td>${st.homeErrors}</td>`;

        document.getElementById('viewer-linescore-table').innerHTML = `
            <thead><tr>${headCols}</tr></thead>
            <tbody><tr>${awayCols}</tr><tr>${homeCols}</tr></tbody>
        `;

        // 2. B-S-O 燈號
        for (let i = 1; i <= 3; i++) document.getElementById(`v-dot-b-${i}`)?.classList.toggle('active-b', st.balls >= i);
        for (let i = 1; i <= 2; i++) document.getElementById(`v-dot-s-${i}`)?.classList.toggle('active-s', st.strikes >= i);
        for (let i = 1; i <= 2; i++) document.getElementById(`v-dot-o-${i}`)?.classList.toggle('active-o', st.outs >= i);

        const pLine = pitcher ? st.pitchingStats[pitcher.id] : null;
        const np = pLine ? pLine.np : 0;
        const pillEl = document.getElementById('viewer-pitch-count-pill');
        if (pillEl) {
            pillEl.textContent = `⚾ ${pitcherTeam.emoji}${pitcherTeam.name}投手 ${pitcher ? pitcher.name : ''}：${np} 球 (好球 ${pLine ? pLine.strikes : 0})`;
        }

        // 3. 球場橫幅與壘包跑者
        const modeBanner = document.getElementById('viewer-attack-defense-tag');
        if (modeBanner) {
            modeBanner.innerHTML = sameTeam
                ? `🔥 進攻 & 同隊投球：${battingTeam.emoji}${battingTeam.name} ｜ 🛡️ 場上守備：${fieldingTeam.emoji}${fieldingTeam.name}`
                : `🔥 進攻：${battingTeam.emoji}${battingTeam.name} ｜ 🛡️ 投球守備：${fieldingTeam.emoji}${fieldingTeam.name}`;
        }

        ['first', 'second', 'third'].forEach(baseKey => {
            const node = document.getElementById(`v-base-${baseKey}`);
            const nameSpan = document.getElementById(`v-runner-${baseKey}`);
            const runner = st.bases ? st.bases[baseKey] : null;
            if (node && nameSpan) {
                node.classList.toggle('occupied', Boolean(runner));
                nameSpan.textContent = runner ? `#${runner.number} ${runner.name}` : '空壘';
            }
        });

        // 4. 最新一球動態
        const latestPlayEl = document.getElementById('viewer-latest-play-text');
        if (latestPlayEl) {
            if (st.playByPlay && st.playByPlay.length > 0) {
                const top = st.playByPlay[0];
                latestPlayEl.textContent = top.text;
            } else {
                latestPlayEl.textContent = '等待紀錄中...';
            }
        }

        // 5. 目前場上打者 vs 投手
        const matchupEl = document.getElementById('viewer-matchup-info');
        if (matchupEl) {
            const bStat = batter ? st.battingStats[batter.id] : null;
            const ipStr = StatsEngine.formatIP(pLine ? pLine.outs : 0);
            matchupEl.innerHTML = `
                <div style="flex:1;min-width:190px;background:rgba(203,176,99,0.1);padding:10px 12px;border-radius:10px;border-left:4px solid ${battingTeam.color};">
                    <div style="font-size:0.76rem;color:var(--text-secondary);">🏏 目前打擊：${battingTeam.emoji}${battingTeam.name}（第 ${orderNo} 棒）</div>
                    <div style="font-size:1.1rem;font-weight:900;color:var(--cpbl-gold-light);margin-top:3px;">
                        #${batter ? batter.number : ''} ${batter ? batter.name : ''}
                        <small style="color:#cbd5e1;font-weight:600;">（本場 ${bStat ? bStat.ab : 0}支${bStat ? bStat.h : 0}，${bStat ? bStat.rbi : 0}打點）</small>
                    </div>
                </div>
                <div style="flex:1;min-width:190px;background:rgba(56,189,248,0.1);padding:10px 12px;border-radius:10px;border-left:4px solid ${pitcherTeam.color};">
                    <div style="font-size:0.76rem;color:var(--text-secondary);">⚾ 場上投手：${pitcherTeam.emoji}${pitcherTeam.name}</div>
                    <div style="font-size:1.1rem;font-weight:900;color:#93c5fd;margin-top:3px;">
                        #${pitcher ? pitcher.number : ''} ${pitcher ? pitcher.name : ''}
                        <small style="color:#cbd5e1;font-weight:600;">（${ipStr}局 / ${np}球 / ${pLine ? pLine.so : 0}K）</small>
                    </div>
                </div>
            `;
        }

        // 6. 即時文字播報列表（僅顯示選手名字＋好壞球或結果）
        const logContainer = document.getElementById('viewer-play-log');
        const countEl = document.getElementById('viewer-play-count');
        const logs = st.playByPlay || [];
        if (countEl) countEl.textContent = `共 ${logs.length} 則播報`;
        if (logContainer) {
            logContainer.innerHTML = logs.map(item => `
                <div class="play-log-item">
                    <span>${item.text}</span>
                </div>
            `).join('') || '<div style="color:var(--text-secondary);font-size:0.85rem;">尚無播報紀錄</div>';
        }

        // 7. 本場兩隊即時打擊 Box Score
        const boxTbody = document.getElementById('viewer-live-box-tbody');
        if (boxTbody) {
            const allLineupIds = Array.from(new Set([...(st.awayLineup || []), ...(st.homeLineup || []), ...Object.keys(st.battingStats || {})]));
            boxTbody.innerHTML = allLineupIds.map(pid => {
                const p = window.store.getPlayer(pid);
                const b = (st.battingStats || {})[pid];
                if (!p || !b) return '';
                return `
                    <tr>
                        <td class="align-left">${this.teamBadgeHTML(b.teamId || p.teamId)}</td>
                        <td class="align-left"><strong>#${p.number} ${p.name}</strong></td>
                        <td>${b.pa || 0}</td>
                        <td>${b.ab || 0}</td>
                        <td><strong style="color:var(--jj-gold-light);">${b.h || 0}</strong></td>
                        <td>${b.hr || 0}</td>
                        <td>${b.rbi || 0}</td>
                        <td>${b.r || 0}</td>
                        <td>${b.sb || 0}</td>
                    </tr>
                `;
            }).join('') || '<tr><td colspan="9">尚無打擊紀錄</td></tr>';
        }
    }

    renderFinishedGameReplay(g) {
        const awayTeam = window.store.getTeam(g.awayTeamId);
        const homeTeam = window.store.getTeam(g.homeTeamId);

        document.getElementById('viewer-tournament-title').textContent = `${g.date} ｜ ${g.tournament}`;
        document.getElementById('viewer-inning-badge').textContent = '🏁 比賽結束 (Final)';

        const awayArr = g.lineScore?.away || [g.awayScore];
        const homeArr = g.lineScore?.home || [g.homeScore];
        const inningsCount = Math.max(g.innings || 4, awayArr.length);

        let headCols = '<th class="team-col">對戰隊伍</th>';
        let awayCols = `<td class="team-col">${awayTeam.emoji} ${awayTeam.name} (先攻)</td>`;
        let homeCols = `<td class="team-col">${homeTeam.emoji} ${homeTeam.name} (後攻)</td>`;

        for (let i = 0; i < inningsCount; i++) {
            headCols += `<th>${i + 1}</th>`;
            awayCols += `<td>${awayArr[i] ?? ''}</td>`;
            homeCols += `<td>${homeArr[i] ?? ''}</td>`;
        }
        headCols += '<th class="rhe-col">R</th><th class="rhe-col">H</th><th class="rhe-col">E</th>';
        awayCols += `<td class="rhe-col">${g.awayScore}</td><td>${g.awayHits || 0}</td><td>${g.awayErrors || 0}</td>`;
        homeCols += `<td class="rhe-col">${g.homeScore}</td><td>${g.homeHits || 0}</td><td>${g.homeErrors || 0}</td>`;

        document.getElementById('viewer-linescore-table').innerHTML = `
            <thead><tr>${headCols}</tr></thead>
            <tbody><tr>${awayCols}</tr><tr>${homeCols}</tr></tbody>
        `;

        for (let i = 1; i <= 3; i++) document.getElementById(`v-dot-b-${i}`)?.classList.remove('active-b');
        for (let i = 1; i <= 2; i++) document.getElementById(`v-dot-s-${i}`)?.classList.remove('active-s');
        for (let i = 1; i <= 2; i++) document.getElementById(`v-dot-o-${i}`)?.classList.remove('active-o');
        document.getElementById('viewer-pitch-count-pill').textContent = `🏆 終場比數：${awayTeam.name} ${g.awayScore} : ${g.homeScore} ${homeTeam.name}`;

        document.getElementById('viewer-attack-defense-tag').innerHTML = `🏁 最新完賽回顧：${awayTeam.emoji}${awayTeam.name} ${g.awayScore} : ${g.homeScore} ${homeTeam.emoji}${homeTeam.name}`;
        ['first', 'second', 'third'].forEach(baseKey => {
            document.getElementById(`v-base-${baseKey}`)?.classList.remove('occupied');
            const nameSpan = document.getElementById(`v-runner-${baseKey}`);
            if (nameSpan) nameSpan.textContent = '空壘';
        });

        const logs = (g.playByPlay || []).slice().reverse();
        const latestPlayEl = document.getElementById('viewer-latest-play-text');
        if (latestPlayEl) {
            latestPlayEl.textContent = logs.length > 0 ? `【終場】${logs[0].text}` : `比賽結束：${awayTeam.name} ${g.awayScore} : ${g.homeScore} ${homeTeam.name}`;
        }

        document.getElementById('viewer-matchup-info').innerHTML = `
            <div style="width:100%;text-align:center;color:var(--jj-gold-light);font-weight:800;font-size:0.9rem;">
                ⚾ 下一場比賽開打時，此畫面將自動切換為即時實況轉播！
            </div>
        `;

        const countEl = document.getElementById('viewer-play-count');
        if (countEl) countEl.textContent = `共 ${logs.length} 則播報`;
        document.getElementById('viewer-play-log').innerHTML = logs.map(item => `
            <div class="play-log-item">
                <span class="play-log-inning">${item.inning || ''}</span>
                <span>${item.text}</span>
            </div>
        `).join('') || '<div style="color:var(--text-secondary);font-size:0.85rem;">本場無逐球文字紀錄</div>';

        const boxTbody = document.getElementById('viewer-live-box-tbody');
        if (boxTbody) {
            boxTbody.innerHTML = (g.battingStats || []).map(b => {
                const p = window.store.getPlayer(b.playerId) || { name: '選手', number: '' };
                return `
                    <tr>
                        <td class="align-left">${this.teamBadgeHTML(b.teamId)}</td>
                        <td class="align-left"><strong>#${p.number} ${p.name}</strong></td>
                        <td>${b.pa || 0}</td>
                        <td>${b.ab || 0}</td>
                        <td><strong style="color:var(--jj-gold-light);">${b.h || 0}</strong></td>
                        <td>${b.hr || 0}</td>
                        <td>${b.rbi || 0}</td>
                        <td>${b.r || 0}</td>
                        <td>${b.sb || 0}</td>
                    </tr>
                `;
            }).join('') || '<tr><td colspan="9">無打擊紀錄</td></tr>';
        }
    }

    renderStandbyEmpty(channel) {
        const isExt = (channel === 'external');
        document.getElementById('viewer-tournament-title').textContent = isExt
            ? '中正國小少棒代表隊 ‧ 對外正式/友誼賽'
            : '中正國小少棒隊 ‧ 隊內三隊爭霸聯賽';
        document.getElementById('viewer-inning-badge').textContent = '尚未開賽';
        document.getElementById('viewer-linescore-table').innerHTML = isExt
            ? `<thead><tr><th class="team-col">對戰隊伍</th><th>1</th><th>2</th><th>3</th><th>4</th><th class="rhe-col">R</th><th class="rhe-col">H</th><th class="rhe-col">E</th></tr></thead>
               <tbody><tr><td class="team-col">🦁 中正國小 (A隊) vs 外隊</td><td>-</td><td>-</td><td>-</td><td>-</td><td class="rhe-col">0</td><td>0</td><td>0</td></tr></tbody>`
            : `<thead><tr><th class="team-col">對戰隊伍</th><th>1</th><th>2</th><th>3</th><th>4</th><th class="rhe-col">R</th><th class="rhe-col">H</th><th class="rhe-col">E</th></tr></thead>
               <tbody><tr><td class="team-col">🔴 紅隊 / 🔵 藍隊 / ⚪ 白隊</td><td>-</td><td>-</td><td>-</td><td>-</td><td class="rhe-col">0</td><td>0</td><td>0</td></tr></tbody>`;
        document.getElementById('viewer-latest-play-text').textContent = `【${isExt ? '對外代表隊' : '校內三隊'}】目前尚無進行中的比賽，當球場紀錄員按下開賽後將自動同步畫面！`;
        document.getElementById('viewer-matchup-info').innerHTML = `
            <div style="width:100%;text-align:center;color:var(--text-secondary);font-size:0.88rem;">
                📡 ${isExt ? '🌏 對外賽' : '🏟️ 校內賽'}轉播頻道待命連線中...
            </div>
        `;
        document.getElementById('viewer-play-log').innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem;">等待比賽開始...</div>';
        document.getElementById('viewer-live-box-tbody').innerHTML = '<tr><td colspan="9">等待比賽開始...</td></tr>';
    }
}

window.liveViewer = new ParentLiveViewer();
document.addEventListener('DOMContentLoaded', () => window.liveViewer.init());
