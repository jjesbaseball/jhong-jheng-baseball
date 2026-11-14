/**
 * 國小少棒三隊聯盟紀錄、CPBL 數據排行榜與球員交易系統 - 主控制器 (App Controller V2)
 */

class BaseballApp {
    constructor() {
        this.currentTab = 'toplist'; // 'toplist' | 'scorebook' | 'trades' | 'games' | 'settings'
        this.dataMode = localStorage.getItem('JJ_DATA_MODE') === 'external' ? 'external' : 'intra'; // 'intra' | 'external'
        this.setupGameType = this.dataMode; // 'intra' | 'external'
        this.statsCategory = 'batting'; // 'batting' | 'pitching'
        this.teamFilter = 'ALL'; // 'ALL' | 't1' | 't2' | 't3'
        this.qualifyOnly = false;
        this.searchQuery = '';
        this.batSort = { key: 'avg', dir: 'desc' };
        this.pitSort = { key: 'era', dir: 'asc' };
        this.selectedBaseKey = null;
        this.voiceEnabled = localStorage.getItem('JJ_VOICE_ANNOUNCE') !== 'off';
        this.preferredVoiceURI = localStorage.getItem('JJ_PREFERRED_VOICE_URI') || '';
        this._hrAnimId = null;
        this._hrHideTimer = null;
        this.oppLineupMode = 'roster'; // 'roster' | 'quick'
        this.setupExtOrder = null; // 中正對外先發打序 (null 代表未初始化，[] 代表清空重排)
        this.setupOppOrder = null; // 外部對手先發打序 (null 代表未初始化，[] 代表清空重排)
        this.oppModalCurrentTeam = ''; // 秩序冊名冊彈窗目前選中的學校
        this.pdfParsedTeams = []; // PDF 解析暫存隊伍
    }

    setDataMode(mode) {
        this.dataMode = mode === 'external' ? 'external' : 'intra';
        this.setupGameType = this.dataMode;
        try {
            localStorage.setItem('JJ_DATA_MODE', this.dataMode);
        } catch (e) {}
        this.refreshAll();
    }

    init() {
        this.bindNavigation();
        this.initSpeechVoices();
        this.updateVoiceToggleUI();
        this.refreshAll();
    }

    bindNavigation() {
        document.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-tab');
                this.switchTab(target);
            });
        });
    }

    switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('[data-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
        });
        document.querySelectorAll('.tab-view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${tabName}`);
        });
        this.refreshAll();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    refreshAll() {
        this.renderHeaderBrand();
        this.renderLeagueStandings();
        this.renderTeamFilterPills();
        this.renderToplistView();
        this.renderScorebookView();
        this.renderTradesAndRosterView();
        this.renderGamesHistoryView();
        this.renderSettingsView();
    }

    teamBadgeHTML(teamId) {
        const t = window.store.getTeam(teamId);
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:800;background:${t.color}22;color:${t.color};border:1px solid ${t.color}66;">${t.emoji} ${t.name}</span>`;
    }

    renderHeaderBrand() {
        const s = window.store.data.settings || {};
        const titleEl = document.getElementById('header-team-name');
        const seasonEl = document.getElementById('header-season-badge');
        const subEl = document.getElementById('header-sub-title');
        if (titleEl) titleEl.textContent = s.leagueName || '國小少棒隊內三隊爭霸聯賽';
        if (seasonEl) seasonEl.textContent = s.seasonName || '115學年度賽季';
        if (subEl) {
            let syncText = '📱 支援電腦・平板・手機紀錄與跨裝置同步';
            if (window.store.firebaseConnected) {
                syncText = '🔥 Firebase 雲端即時資料庫已連線同步中';
            } else if (window.store.serverAvailable) {
                syncText = '🟢 多裝置即時推播同步已連線 (Node.js Live Server)';
            }
            subEl.textContent = `隊內三隊爭霸 ＆ 對外比賽數據系統 ｜ ${syncText}`;
        }

        const liveDot = document.getElementById('nav-live-dot');
        if (liveDot) {
            const isAnyLive = Boolean(window.scorebook?.channels?.intra || window.scorebook?.channels?.external || window.scorebook?.state);
            liveDot.style.display = isAnyLive ? 'inline-block' : 'none';
        }

        // 更新英雄橫幅的「隊內 vs 對外」模式切換膠囊按鈕與標題
        const isExt = this.dataMode === 'external';
        document.getElementById('btn-mode-intra')?.classList.toggle('active', !isExt);
        document.getElementById('btn-mode-external')?.classList.toggle('active', isExt);

        const heroTitle = document.getElementById('hero-mode-title');
        const heroDesc = document.getElementById('hero-mode-desc');
        const toplistTitle = document.getElementById('toplist-section-title');
        if (heroTitle) {
            heroTitle.textContent = isExt
                ? '🌏 中正國小少棒代表隊 ‧ 對外正式/友誼賽數據中心'
                : '🏟️ 中正國小少棒隊 ‧ 隊內三隊爭霸賽數據中心';
        }
        if (heroDesc) {
            heroDesc.textContent = isExt
                ? '目前顯示【🌏 對外比賽】獨立統計數據 ｜ 現場沒空記？可隨時點右側「📝 賽後補打紀錄」事後補登！'
                : '目前顯示【🏟️ 隊內三隊聯賽（紅・藍・白隊）】統計數據 ｜ 點擊右上方按鈕可一鍵切換至「🌏 對外比賽數據」！';
        }
        if (toplistTitle) {
            toplistTitle.textContent = isExt
                ? '🌏 對外比賽個人獎項排行榜 (TOP 5 Leaders)'
                : '🏆 隊內三隊個人獎項排行榜 (TOP 5 Leaders)';
        }
    }

    /* ======================================================================
       0. 三隊聯盟戰績排行看板 ／ 對外比賽戰績總覽看板
       ====================================================================== */
    renderLeagueStandings() {
        const container = document.getElementById('league-standings-container');
        if (!container) return;

        const eraBase = window.store.data.settings?.eraInningsBase || 4;

        // 若目前切換至「🌏 對外比賽對戰數據」模式，顯示中正國小對外總戰績看板
        if (this.dataMode === 'external') {
            const ext = StatsEngine.getExternalTeamSummary(window.store.data);
            const recentGamesHTML = (ext.gamesList || []).slice(0, 4).map(g => {
                const jjIsAway = g.awayTeamId === 'JJ';
                const ourScore = jjIsAway ? g.awayScore : g.homeScore;
                const oppScore = jjIsAway ? g.homeScore : g.awayScore;
                const oppTeam = window.store.getTeam(jjIsAway ? g.homeTeamId : g.awayTeamId, g.opponentName);
                const outcome = StatsEngine.getGameOutcome(g);
                const ourSide = jjIsAway ? 'away' : 'home';
                const resBadge = outcome.winner === ourSide
                    ? '<span style="color:#34d399;font-weight:900;">勝</span>'
                    : (outcome.winner === 'tie' ? '<span style="color:#fbbf24;font-weight:900;">和</span>' : '<span style="color:#f87171;font-weight:900;">敗</span>');
                const rulingTag = outcome.isRuling
                    ? `<span style="color:#fbbf24;font-size:0.72rem;font-weight:800;">(⚖️裁定${outcome.rulingNote ? ':' + outcome.rulingNote : ''})</span>`
                    : '';
                return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:rgba(6,21,39,0.7);border-radius:6px;font-size:0.8rem;cursor:pointer;${outcome.isRuling ? 'border:1px solid rgba(251,191,36,0.45);' : ''}" onclick="app.openGameBoxScoreModal('${g.id}')" title="點擊查看或編輯此場數據">
                        <span>📅 ${g.date} vs <strong>${oppTeam.name}</strong></span>
                        <span>${resBadge} <strong>${ourScore} : ${oppScore}</strong> ${rulingTag} ✏️</span>
                    </div>
                `;
            }).join('') || '<div style="font-size:0.82rem;color:var(--text-secondary);">尚無對外比賽紀錄，點擊右方「📝 賽後補打對外比賽紀錄」即可立刻新增！</div>';

            container.innerHTML = `
                <div class="summary-stat-card" style="border-top: 3px solid #38bdf8;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="font-size:1.05rem;font-weight:900;color:#fff;">🦁 中正國小 對外總戰績</span>
                        <span class="season-badge" style="color:#7dd3fc;border-color:#38bdf8;">共出賽 ${ext.g} 場</span>
                    </div>
                    <div class="stat-value" style="font-size:1.5rem;margin-bottom:4px;">
                        ${ext.w}勝 - ${ext.l}敗 - ${ext.t}和
                        <small style="font-size:0.85rem;color:#7dd3fc;font-weight:700;">(勝率 ${ext.winPct.toFixed(3)})</small>
                    </div>
                    <div style="display:flex;gap:12px;font-size:0.8rem;color:#cbd5e1;margin-top:6px;flex-wrap:wrap;">
                        <span>📊 總得分 <strong>${ext.rs}</strong></span>
                        <span>🛡️ 總失分 <strong>${ext.ra}</strong></span>
                        <span>📈 得失分差 <strong>${ext.runDiff >= 0 ? '+' + ext.runDiff : ext.runDiff}</strong></span>
                    </div>
                </div>

                <div class="summary-stat-card" style="border-top: 3px solid var(--jj-gold);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="font-size:1.05rem;font-weight:900;color:#fff;">🏏 對外團隊投打數據</span>
                        <span class="season-badge">對外累計</span>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;font-size:0.85rem;color:#e2e8f0;">
                        <div>團隊打擊率：<strong style="color:var(--jj-gold-light);font-size:1.05rem;">${StatsEngine.formatRate(ext.avg)}</strong></div>
                        <div>團隊 OPS：<strong style="color:#34d399;font-size:1.05rem;">${StatsEngine.formatRate(ext.ops)}</strong></div>
                        <div>安打 / 全壘打：<strong>${ext.h} / ${ext.hr}</strong></div>
                        <div>團隊盜壘成功：<strong>${ext.sb} 次</strong></div>
                        <div>團隊防禦率：<strong style="color:#7dd3fc;">${StatsEngine.formatERA(ext.era)}</strong></div>
                        <div>投手總三振：<strong>${ext.so} K (${ext.ipDisplay}局)</strong></div>
                    </div>
                </div>

                <div class="summary-stat-card" style="border-top: 3px solid #34d399;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-size:1.0rem;font-weight:900;color:#fff;">📋 近期對外比賽 ＆ 事後補打</span>
                        <button type="button" class="btn" style="padding:3px 10px;font-size:0.76rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#061527;font-weight:900;border-color:#fde68a;" onclick="app.openQuickBoxEntryModal(null, 'external')">
                            ➕ 補打對外比賽
                        </button>
                    </div>
                    <div style="display:grid;gap:5px;">
                        ${recentGamesHTML}
                    </div>
                </div>
            `;
            return;
        }

        const standings = StatsEngine.getTeamStandings(window.store.data);

        const cardsHTML = standings.map((tm, idx) => {
            const vsTexts = Object.entries(tm.vs).map(([oppId, rec]) => {
                const opp = window.store.getTeam(oppId);
                return `對${opp.name} ${rec.w}勝${rec.l}敗`;
            }).join(' ｜ ');

            return `
                <div class="summary-stat-card" style="border-top: 3px solid ${tm.color};">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="font-size:1.05rem;font-weight:900;color:#fff;">
                            ${idx === 0 ? '👑 ' : `#${idx + 1} `}${tm.emoji} ${tm.name}
                        </span>
                        <span class="season-badge" style="color:${tm.color};border-color:${tm.color}66;">
                            勝差 ${tm.gb === '-' ? '領先' : tm.gb}
                        </span>
                    </div>
                    <div class="stat-value" style="font-size:1.5rem;margin-bottom:4px;">
                        ${tm.w}勝 - ${tm.l}敗 - ${tm.t}和
                        <small style="font-size:0.85rem;color:var(--cpbl-gold-light);font-weight:700;">(勝率 ${tm.winPct.toFixed(3)})</small>
                    </div>
                    <div style="display:flex;gap:12px;font-size:0.8rem;color:#cbd5e1;margin-top:6px;flex-wrap:wrap;">
                        <span>🏏 打擊率 <strong>${StatsEngine.formatRate(tm.avg)}</strong></span>
                        <span>⚾ 防禦率(${eraBase}局) <strong>${StatsEngine.formatERA(tm.era)}</strong></span>
                        <span>📊 得失分 <strong>${tm.rs}:${tm.ra}</strong></span>
                    </div>
                    <div style="font-size:0.74rem;color:var(--text-secondary);margin-top:6px;">
                        🤝 ${vsTexts || '尚無對戰'}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = cardsHTML;
    }

    renderTeamFilterPills() {
        const bar = document.getElementById('team-filter-pills');
        if (!bar) return;
        const teams = window.store.data.teams || [];
        const allLabel = this.dataMode === 'external' ? '🦁 中正全隊對外排行' : '🏆 全聯盟三隊總排行';
        bar.innerHTML = `
            <button class="pill-btn ${this.teamFilter === 'ALL' ? 'active' : ''}" onclick="app.setTeamFilter('ALL')">${allLabel}</button>
            ${teams.map(t => `
                <button class="pill-btn ${this.teamFilter === t.id ? 'active' : ''}" onclick="app.setTeamFilter('${t.id}')">
                    ${t.emoji} ${t.name}
                </button>
            `).join('')}
        `;
    }

    setTeamFilter(teamId) {
        this.teamFilter = teamId;
        this.renderTeamFilterPills();
        this.renderToplistView();
    }

    /* ======================================================================
       1. CPBL 風格個人數據排行榜 (Toplist & Full Sortable Table)
       ====================================================================== */
    setStatsCategory(cat) {
        this.statsCategory = cat;
        document.getElementById('btn-cat-batting')?.classList.toggle('active', cat === 'batting');
        document.getElementById('btn-cat-pitching')?.classList.toggle('active', cat === 'pitching');
        this.renderToplistView();
    }

    toggleQualifyFilter(checked) {
        this.qualifyOnly = checked;
        this.renderToplistView();
    }

    setSearchQuery(val) {
        this.searchQuery = (val || '').trim().toLowerCase();
        this.renderStatsTable();
    }

    renderToplistView() {
        this.renderLeaderPodiums();
        this.renderStatsTable();
    }

    renderLeaderPodiums() {
        const grid = document.getElementById('toplist-podium-grid');
        if (!grid) return;

        const data = window.store.data;
        const eraBase = data.settings?.eraInningsBase || 4;

        if (this.statsCategory === 'batting') {
            const allList = StatsEngine.getBattingStatsList(data, this.teamFilter, this.dataMode);
            const activeList = allList.filter(p => p.pa > 0 || p.sb > 0 || p.r > 0 || p.rbi > 0);
            const categories = [
                { title: '打擊率', code: 'AVG', key: 'avg', fmt: v => StatsEngine.formatRate(v), filter: p => p.ab >= 1, desc: true },
                { title: '安打', code: 'H', key: 'h', fmt: v => `${v}`, filter: p => p.pa >= 1, desc: true },
                { title: '全壘打', code: 'HR', key: 'hr', fmt: v => `${v}`, filter: p => p.pa >= 1, desc: true },
                { title: '打點', code: 'RBI', key: 'rbi', fmt: v => `${v}`, filter: p => p.pa >= 1, desc: true },
                { title: '盜壘成功', code: 'SB', key: 'sb', fmt: v => `${v}`, filter: p => (p.pa >= 1 || p.sb >= 1), desc: true },
                { title: '整體攻擊指數', code: 'OPS', key: 'ops', fmt: v => StatsEngine.formatRate(v), filter: p => p.pa >= 1, desc: true }
            ];
            grid.innerHTML = categories.map((cat, idx) => this.buildPodiumCardHTML(activeList, cat, allList, idx)).join('');
        } else {
            const allList = StatsEngine.getPitchingStatsList(data, this.teamFilter, this.dataMode);
            const activeList = allList.filter(p => p.outs > 0 || p.g > 0);
            const categories = [
                { title: '防禦率', code: 'ERA', key: 'era', fmt: v => StatsEngine.formatERA(v), filter: p => p.outs >= 1, desc: false },
                { title: '勝投', code: 'W', key: 'w', fmt: v => `${v}`, filter: p => p.g >= 1, desc: true },
                { title: '奪三振', code: 'SO', key: 'so', fmt: v => `${v}`, filter: p => p.outs >= 1 || p.so >= 1, desc: true },
                { title: '救援成功', code: 'SV', key: 'sv', fmt: v => `${v}`, filter: p => p.g >= 1, desc: true },
                { title: '每局被上壘率', code: 'WHIP', key: 'whip', fmt: v => StatsEngine.formatERA(v), filter: p => p.outs >= 1, desc: false },
                { title: '奪三振率', code: `K/${eraBase}`, key: 'kRate', fmt: v => StatsEngine.formatERA(v), filter: p => p.outs >= 1, desc: true }
            ];
            grid.innerHTML = categories.map((cat, idx) => this.buildPodiumCardHTML(activeList, cat, allList, idx)).join('');
        }
    }

    getFallbackAvatarDataUri(p) {
        const teamId = p?.teamId || 't1';
        const capColor = teamId === 't1' ? '#dc2626' : (teamId === 't2' ? '#2563eb' : '#10345c');
        const capLetter = teamId === 't1' ? 'R' : (teamId === 't2' ? 'B' : 'W');
        const stripeColor = teamId === 't1' ? '#fca5a5' : (teamId === 't2' ? '#93c5fd' : '#cbb063');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240">
            <rect width="200" height="240" fill="#f4f6f9"/>
            <!-- 球衣肩膀與條紋 -->
            <path d="M20 240 C25 182 60 168 100 168 C140 168 175 182 180 240 Z" fill="#ffffff" stroke="#d8dee9" stroke-width="2"/>
            <line x1="55" y1="178" x2="50" y2="240" stroke="${stripeColor}" stroke-width="2.5"/>
            <line x1="75" y1="171" x2="72" y2="240" stroke="${stripeColor}" stroke-width="2.5"/>
            <line x1="125" y1="171" x2="128" y2="240" stroke="${stripeColor}" stroke-width="2.5"/>
            <line x1="145" y1="178" x2="150" y2="240" stroke="${stripeColor}" stroke-width="2.5"/>
            <!-- 球衣領口 -->
            <path d="M76 168 L100 202 L124 168" fill="none" stroke="${capColor}" stroke-width="5" stroke-linecap="round"/>
            <!-- 脖子與臉部 -->
            <rect x="84" y="138" width="32" height="36" rx="10" fill="#f1c27d"/>
            <ellipse cx="100" cy="106" rx="38" ry="44" fill="#ffdbac"/>
            <!-- 耳朵 -->
            <circle cx="61" cy="108" r="8" fill="#f1c27d"/>
            <circle cx="139" cy="108" r="8" fill="#f1c27d"/>
            <!-- 眼神與微笑 -->
            <circle cx="85" cy="104" r="4" fill="#1e293b"/>
            <circle cx="115" cy="104" r="4" fill="#1e293b"/>
            <path d="M78 94 Q85 90 92 94" fill="none" stroke="#334155" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M108 94 Q115 90 122 94" fill="none" stroke="#334155" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M87 124 Q100 135 113 124" fill="#ffffff" stroke="#b45309" stroke-width="2.2" stroke-linecap="round"/>
            <!-- 棒球帽 -->
            <path d="M60 84 C60 46 140 46 140 84 Z" fill="${capColor}"/>
            <path d="M54 82 Q100 72 146 82 L152 88 Q100 80 48 88 Z" fill="${capColor}"/>
            <text x="100" y="73" text-anchor="middle" fill="#ffffff" font-family="Arial Black, sans-serif" font-weight="900" font-size="22">${capLetter}</text>
        </svg>`;
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    getPlayerPhotoSrc(p) {
        if (p && p.photo && p.photo.trim() !== '') {
            return p.photo;
        }
        const safeName = p && p.name ? encodeURIComponent(p.name.trim()) : 'player';
        return `photos/${safeName}.jpg`;
    }

    buildPodiumCardHTML(list, cat, fallbackList = [], catIdx = 0) {
        let filtered = list.filter(cat.filter).sort((a, b) => {
            if (b[cat.key] === a[cat.key]) {
                return (b.h || b.so || 0) - (a.h || a.so || 0);
            }
            return cat.desc ? (b[cat.key] - a[cat.key]) : (a[cat.key] - b[cat.key]);
        });

        // 若該項目尚無完賽合格球員，取名單前 5 位選手展示 CPBL 排行榜照片卡片版型
        if (filtered.length < 5 && fallbackList.length > 0) {
            const existingIds = new Set(filtered.map(x => x.playerId));
            const offset = (catIdx * 3) % Math.max(1, fallbackList.length);
            const rotated = [...fallbackList.slice(offset), ...fallbackList.slice(0, offset)];
            for (const item of rotated) {
                if (!existingIds.has(item.playerId)) {
                    filtered.push(item);
                    existingIds.add(item.playerId);
                }
                if (filtered.length >= 5) break;
            }
        }

        const top5 = filtered.slice(0, 5);
        if (top5.length === 0) {
            return `
                <div class="toplist-card">
                    <div class="cpbl-podium-header">
                        <div class="cpbl-podium-title-group">
                            <span class="cpbl-podium-title">${cat.title}</span>
                            <span class="cpbl-podium-code">${cat.code}</span>
                        </div>
                    </div>
                    <div style="padding:24px;text-align:center;color:var(--text-secondary);font-size:0.88rem;">
                        尚無符合資格數據
                    </div>
                </div>
            `;
        }

        const first = top5[0];
        const photoSrc = this.getPlayerPhotoSrc(first);
        const fallbackUri = this.getFallbackAvatarDataUri(first);

        return `
            <div class="toplist-card">
                <div class="cpbl-podium-header">
                    <div class="cpbl-podium-title-group">
                        <span class="cpbl-podium-title">${cat.title}</span>
                        <span class="cpbl-podium-code">${cat.code}</span>
                    </div>
                    <span class="cpbl-podium-more" onclick="app.sortTableBy('${cat.key}');document.getElementById('cpbl-stats-thead')?.scrollIntoView({behavior:'smooth'});">
                        更多資訊 <span class="arrow-circle">&gt;</span>
                    </span>
                </div>
                <div class="cpbl-podium-body">
                    <div class="cpbl-leader-portrait-box" onclick="app.openPlayerModal('${first.playerId}')" title="點擊查看 #${first.number} ${first.name} 個人數據卡">
                        <img class="cpbl-leader-photo" src="${photoSrc}" alt="${first.name}" onerror="this.onerror=null;this.src='${fallbackUri}';">
                        <span class="cpbl-leader-num-corner">#${first.number}</span>
                    </div>
                    <div class="cpbl-leader-list">
                        ${top5.map((r, idx) => `
                            <div class="cpbl-rank-row ${idx === 0 ? 'rank-1' : ''}" onclick="app.openPlayerModal('${r.playerId}')">
                                <span class="cpbl-rank-badge ${idx === 0 ? 'r1' : 'r-other'}">${idx + 1}</span>
                                <span class="cpbl-player-label">${r.name}<span class="team-paren">(${r.teamName})</span></span>
                                <span class="cpbl-connect-line"></span>
                                <span class="cpbl-stat-num">${cat.fmt(r[cat.key])}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    sortTableBy(key) {
        if (this.statsCategory === 'batting') {
            if (this.batSort.key === key) {
                this.batSort.dir = this.batSort.dir === 'desc' ? 'asc' : 'desc';
            } else {
                this.batSort.key = key;
                this.batSort.dir = 'desc';
            }
        } else {
            if (this.pitSort.key === key) {
                this.pitSort.dir = this.pitSort.dir === 'desc' ? 'asc' : 'desc';
            } else {
                this.pitSort.key = key;
                this.pitSort.dir = (key === 'era' || key === 'whip') ? 'asc' : 'desc';
            }
        }
        this.renderStatsTable();
    }

    renderStatsTable() {
        const thead = document.getElementById('cpbl-stats-thead');
        const tbody = document.getElementById('cpbl-stats-tbody');
        const titleEl = document.getElementById('table-category-title');
        if (!thead || !tbody) return;

        const data = window.store.data;
        const modePrefix = this.dataMode === 'external' ? '🌏 【對外比賽】' : '🏟️ 【隊內三隊聯賽】';

        if (this.statsCategory === 'batting') {
            if (titleEl) titleEl.textContent = `📋 ${modePrefix}打擊成績總表（點擊欄位標題可排序，點擊球員可看個人明細）`;
            let rows = StatsEngine.getBattingStatsList(data, this.teamFilter, this.dataMode);
            if (this.qualifyOnly) {
                rows = rows.filter(r => r.pa >= 3);
            }
            if (this.searchQuery) {
                rows = rows.filter(r =>
                    r.name.toLowerCase().includes(this.searchQuery) ||
                    String(r.number).includes(this.searchQuery) ||
                    r.teamName.toLowerCase().includes(this.searchQuery)
                );
            }

            const { key, dir } = this.batSort;
            rows.sort((a, b) => dir === 'desc' ? (b[key] - a[key]) : (a[key] - b[key]));

            const cols = [
                { k: 'rank', label: '排名', noSort: true, left: true },
                { k: 'name', label: '球員', noSort: true, left: true },
                { k: 'team', label: '目前所屬隊伍', noSort: true, left: true },
                { k: 'g', label: '出賽G' },
                { k: 'pa', label: '打席PA' },
                { k: 'ab', label: '打數AB' },
                { k: 'avg', label: '打擊率AVG' },
                { k: 'h', label: '安打H' },
                { k: 'b2', label: '二安2B' },
                { k: 'b3', label: '三安3B' },
                { k: 'hr', label: '全壘打HR' },
                { k: 'tb', label: '壘打數TB' },
                { k: 'rbi', label: '打點RBI' },
                { k: 'r', label: '得分R' },
                { k: 'sb', label: '盜壘SB' },
                { k: 'bb', label: '四壞BB' },
                { k: 'so', label: '三振SO' },
                { k: 'obp', label: '上壘率OBP' },
                { k: 'slg', label: '長打率SLG' },
                { k: 'ops', label: 'OPS' }
            ];

            thead.innerHTML = `<tr>${cols.map(c => {
                const isSorted = key === c.k;
                const arrow = isSorted ? (dir === 'desc' ? ' ▼' : ' ▲') : '';
                return `<th class="${c.left ? 'align-left' : ''} ${isSorted ? 'sorted' : ''}"
                            ${c.noSort ? '' : `onclick="app.sortTableBy('${c.k}')"`}>${c.label}${arrow}</th>`;
            }).join('')}</tr>`;

            tbody.innerHTML = rows.map((r, idx) => {
                const hasTradedSplit = Object.keys(r.splitsByTeam || {}).length > 1;
                return `
                    <tr>
                        <td class="align-left"><span class="rank-num ${idx < 3 ? 'rank-' + (idx + 1) : ''}">${idx + 1}</span></td>
                        <td class="align-left">
                            <div class="player-link-cell" onclick="app.openPlayerModal('${r.playerId}')">
                                <span class="num-tag">#${r.number}</span>
                                <span>${r.name}</span>
                                ${hasTradedSplit ? '<span class="season-badge" title="本季曾交易轉隊">🔁交易</span>' : ''}
                            </div>
                        </td>
                        <td class="align-left">${this.teamBadgeHTML(r.teamId)}</td>
                        <td>${r.g}</td>
                        <td>${r.pa}</td>
                        <td>${r.ab}</td>
                        <td class="${key === 'avg' ? 'highlight-col' : ''}"><strong>${StatsEngine.formatRate(r.avg)}</strong></td>
                        <td class="${key === 'h' ? 'highlight-col' : ''}">${r.h}</td>
                        <td>${r.b2}</td>
                        <td>${r.b3}</td>
                        <td class="${key === 'hr' ? 'highlight-col' : ''}">${r.hr}</td>
                        <td>${r.tb}</td>
                        <td class="${key === 'rbi' ? 'highlight-col' : ''}">${r.rbi}</td>
                        <td>${r.r}</td>
                        <td class="${key === 'sb' ? 'highlight-col' : ''}">${r.sb}</td>
                        <td>${r.bb}</td>
                        <td>${r.so}</td>
                        <td>${StatsEngine.formatRate(r.obp)}</td>
                        <td>${StatsEngine.formatRate(r.slg)}</td>
                        <td class="${key === 'ops' ? 'highlight-col' : ''}"><strong>${StatsEngine.formatRate(r.ops)}</strong></td>
                    </tr>
                `;
            }).join('');
        } else {
            const eraBase = data.settings?.eraInningsBase || 4;
            if (titleEl) titleEl.textContent = `📋 ${modePrefix}投手成績總表（少棒 ${eraBase} 局制防禦率，點擊欄位可排序）`;
            let rows = StatsEngine.getPitchingStatsList(data, this.teamFilter, this.dataMode).filter(p => p.g > 0 || p.outs > 0 || !this.qualifyOnly);
            if (this.qualifyOnly) {
                rows = rows.filter(r => r.outs >= 6);
            }
            if (this.searchQuery) {
                rows = rows.filter(r =>
                    r.name.toLowerCase().includes(this.searchQuery) ||
                    String(r.number).includes(this.searchQuery) ||
                    r.teamName.toLowerCase().includes(this.searchQuery)
                );
            }

            const { key, dir } = this.pitSort;
            rows.sort((a, b) => dir === 'desc' ? (b[key] - a[key]) : (a[key] - b[key]));

            const cols = [
                { k: 'rank', label: '排名', noSort: true, left: true },
                { k: 'name', label: '投手', noSort: true, left: true },
                { k: 'team', label: '目前所屬隊伍', noSort: true, left: true },
                { k: 'g', label: '出賽G' },
                { k: 'gs', label: '先發GS' },
                { k: 'w', label: '勝W' },
                { k: 'l', label: '敗L' },
                { k: 'sv', label: '救援SV' },
                { k: 'outs', label: '局數IP' },
                { k: 'era', label: '防禦率ERA' },
                { k: 'whip', label: 'WHIP' },
                { k: 'np', label: '用球數NP' },
                { k: 'strikePct', label: '好球率%' },
                { k: 'h', label: '被安打H' },
                { k: 'hr', label: '被全壘HR' },
                { k: 'bb', label: '四壞BB' },
                { k: 'so', label: '奪三振SO' },
                { k: 'r', label: '失分R' },
                { k: 'er', label: '自責分ER' }
            ];

            thead.innerHTML = `<tr>${cols.map(c => {
                const isSorted = key === c.k;
                const arrow = isSorted ? (dir === 'desc' ? ' ▼' : ' ▲') : '';
                return `<th class="${c.left ? 'align-left' : ''} ${isSorted ? 'sorted' : ''}"
                            ${c.noSort ? '' : `onclick="app.sortTableBy('${c.k}')"`}>${c.label}${arrow}</th>`;
            }).join('')}</tr>`;

            tbody.innerHTML = rows.map((r, idx) => {
                const hasTradedSplit = Object.keys(r.splitsByTeam || {}).length > 1;
                return `
                    <tr>
                        <td class="align-left"><span class="rank-num ${idx < 3 ? 'rank-' + (idx + 1) : ''}">${idx + 1}</span></td>
                        <td class="align-left">
                            <div class="player-link-cell" onclick="app.openPlayerModal('${r.playerId}')">
                                <span class="num-tag">#${r.number}</span>
                                <span>${r.name}</span>
                                ${hasTradedSplit ? '<span class="season-badge" title="本季曾交易轉隊">🔁交易</span>' : ''}
                            </div>
                        </td>
                        <td class="align-left">${this.teamBadgeHTML(r.teamId)}</td>
                        <td>${r.g}</td>
                        <td>${r.gs}</td>
                        <td class="${key === 'w' ? 'highlight-col' : ''}">${r.w}</td>
                        <td>${r.l}</td>
                        <td class="${key === 'sv' ? 'highlight-col' : ''}">${r.sv}</td>
                        <td class="${key === 'outs' ? 'highlight-col' : ''}"><strong>${r.ipDisplay}</strong></td>
                        <td class="${key === 'era' ? 'highlight-col' : ''}"><strong>${StatsEngine.formatERA(r.era)}</strong></td>
                        <td class="${key === 'whip' ? 'highlight-col' : ''}">${StatsEngine.formatERA(r.whip)}</td>
                        <td>${r.np}</td>
                        <td>${r.strikePct.toFixed(0)}%</td>
                        <td>${r.h}</td>
                        <td>${r.hr}</td>
                        <td>${r.bb}</td>
                        <td class="${key === 'so' ? 'highlight-col' : ''}"><strong>${r.so}</strong></td>
                        <td>${r.r}</td>
                        <td>${r.er}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    /* ======================================================================
       2. 三隊雙邊對戰實戰計分本 (Dual-Team Live Scorebook View)
       ====================================================================== */
    switchScorebookChannel(ch) {
        if (!window.scorebook) return;
        window.scorebook.setChannel(ch);
        this.setupGameType = ch;
        this.renderScorebookView();
        this.renderHeaderBrand();
    }

    renderScorebookChannelTabs() {
        if (!window.scorebook) return;
        const activeCh = window.scorebook.activeChannel || 'intra';
        const intra = window.scorebook.channels?.intra;
        const ext = window.scorebook.channels?.external;

        const btnIntra = document.getElementById('sb-channel-btn-intra');
        const dotIntra = document.getElementById('sb-channel-dot-intra');
        const labelIntra = document.getElementById('sb-channel-label-intra');

        const btnExt = document.getElementById('sb-channel-btn-external');
        const dotExt = document.getElementById('sb-channel-dot-external');
        const labelExt = document.getElementById('sb-channel-label-external');

        if (btnIntra && dotIntra && labelIntra) {
            btnIntra.classList.toggle('active', activeCh === 'intra');
            dotIntra.classList.toggle('live', Boolean(intra));
            if (intra) {
                labelIntra.textContent = `🏟️ 校內比賽計分 (進行中 ${intra.awayScore}:${intra.homeScore})`;
            } else {
                labelIntra.textContent = '🏟️ 校內比賽計分本';
            }
        }

        if (btnExt && dotExt && labelExt) {
            btnExt.classList.toggle('active', activeCh === 'external');
            btnExt.classList.toggle('channel-ext', true);
            dotExt.classList.toggle('live', Boolean(ext));
            if (ext) {
                labelExt.textContent = `🌏 對外比賽計分 (進行中 ${ext.awayScore}:${ext.homeScore})`;
            } else {
                labelExt.textContent = '🌏 對外比賽計分本';
            }
        }
    }

    renderScorebookView() {
        this.renderScorebookChannelTabs();

        const setupPanel = document.getElementById('scorebook-setup-panel');
        const livePanel = document.getElementById('scorebook-live-panel');
        if (!setupPanel || !livePanel) return;

        const activeCh = window.scorebook ? window.scorebook.activeChannel : 'intra';
        const st = window.scorebook ? window.scorebook.channels[activeCh] : null;

        if (!st) {
            setupPanel.style.display = 'block';
            livePanel.style.display = 'none';
            // 同步切換開賽設定表單的遊戲類型 (校內三隊 vs 對外賽)
            this.setupGameType = activeCh;
            this.setSetupGameType(activeCh);
            this.renderNewGameSetupForm();
        } else {
            setupPanel.style.display = 'none';
            livePanel.style.display = 'block';
            this.renderLiveScorebookUI(st);
        }
    }

    renderNewGameSetupForm() {
        const teams = window.store.data.teams || [];
        const awaySelect = document.getElementById('setup-away-team');
        const homeSelect = document.getElementById('setup-home-team');
        const dateInput = document.getElementById('setup-game-date');

        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().slice(0, 10);
        }

        if (awaySelect && homeSelect && awaySelect.options.length === 0) {
            awaySelect.innerHTML = teams.map((t, i) => `<option value="${t.id}" ${t.id === 't1' ? 'selected' : (t.id !== 'tA' && i === 1 ? 'selected' : '')}>${t.emoji} ${t.name}</option>`).join('');
            homeSelect.innerHTML = teams.map((t, i) => `<option value="${t.id}" ${t.id === 't2' ? 'selected' : (t.id !== 'tA' && i === 2 ? 'selected' : '')}>${t.emoji} ${t.name}</option>`).join('');
        }

        // 若目前主畫面在「對外對戰數據」模式，預設同步切換計分本設定為對外賽
        if (this.dataMode === 'external' && this.setupGameType !== 'external') {
            this.setupGameType = 'external';
        }
        this.populateOpponentPresets();
        this.applySetupGameTypeUI();
        this.updateSetupTeamLineups();
    }

    setSetupGameType(type) {
        this.setupGameType = type === 'external' ? 'external' : 'intra';
        const tourInput = document.getElementById('setup-tournament');
        const inningsSel = document.getElementById('setup-innings');
        if (this.setupGameType === 'external') {
            if (tourInput && (tourInput.value.includes('隊內') || !tourInput.value.trim())) {
                tourInput.value = '對外友誼賽 / 盃賽';
            }
            if (inningsSel) inningsSel.value = '6';
            this.populateOpponentPresets();
        } else {
            if (tourInput && (tourInput.value.includes('對外') || !tourInput.value.trim())) {
                tourInput.value = '隊內三隊爭霸練習賽 (4局制)';
            }
            if (inningsSel) inningsSel.value = '4';
        }
        this.applySetupGameTypeUI();
        this.updateSetupTeamLineups();
    }

    applySetupGameTypeUI() {
        const isExt = this.setupGameType === 'external';
        document.getElementById('setup-type-intra')?.classList.toggle('active', !isExt);
        document.getElementById('setup-type-external')?.classList.toggle('active', isExt);

        const extFields = document.getElementById('setup-external-fields');
        const extLineup = document.getElementById('setup-external-lineup-box');
        const extOppBox = document.getElementById('setup-external-opp-box');
        const intraFields = document.getElementById('setup-intra-fields');
        const intraLineup = document.getElementById('setup-intra-lineup-grid');
        const pitcherModeGroup = document.getElementById('setup-pitcher-mode-group');

        if (extFields) extFields.style.display = isExt ? 'grid' : 'none';
        if (extLineup) extLineup.style.display = isExt ? 'block' : 'none';
        if (extOppBox) extOppBox.style.display = isExt ? 'block' : 'none';
        if (intraFields) intraFields.style.display = isExt ? 'none' : 'grid';
        if (intraLineup) intraLineup.style.display = isExt ? 'none' : 'grid';
        if (pitcherModeGroup) pitcherModeGroup.style.display = isExt ? 'none' : '';
    }

    populateOpponentPresets() {
        const select = document.getElementById('setup-opp-preset-select');
        const nameInput = document.getElementById('setup-opp-name');
        if (!select) return;

        const list = window.store.getOpponentTeamsList ? window.store.getOpponentTeamsList() : [];
        let curVal = nameInput ? nameInput.value.trim() : '';

        if (list.length === 0) {
            select.innerHTML = `
                <option value="">-- 尚未匯入對手（點右側 📄 匯入秩序冊 PDF）--</option>
                <option value="__manage__">📋 📄 匯入整本秩序冊 PDF / 建立新學校...</option>
            `;
            if (nameInput && (!nameInput.value || nameInput.value.includes('國小'))) {
                nameInput.value = '外校對手';
            }
            return;
        }

        if (!curVal || curVal === '外校對手') curVal = list[0];

        let html = '<option value="">-- 快速選擇預錄學校名冊 --</option>';
        list.forEach(teamName => {
            html += `<option value="${teamName}" ${teamName === curVal ? 'selected' : ''}>🏫 ${teamName}</option>`;
        });
        html += '<option value="__manage__">📋 📄 匯入整本秩序冊 PDF / 建立新學校...</option>';
        select.innerHTML = html;

        if (nameInput && (!nameInput.value || nameInput.value === '外校對手') && curVal) {
            nameInput.value = curVal;
        }
    }

    onOpponentPresetSelect(val) {
        if (val === '__manage__') {
            this.openOpponentRosterModal();
            return;
        }
        const nameInput = document.getElementById('setup-opp-name');
        if (nameInput && val) {
            nameInput.value = val;
        }
        this.updateSetupTeamLineups(true);
    }

    onOpponentNameInput(val) {
        const titleEl = document.getElementById('setup-opp-box-title');
        if (titleEl) {
            titleEl.textContent = `⚔️ ${val.trim() || '外校對手'} — 本場先發投手 ＆ 先發打序`;
        }
    }

    toggleOpponentLineupMode(mode) {
        this.oppLineupMode = (mode === 'quick') ? 'quick' : 'roster';
        const isRoster = (this.oppLineupMode === 'roster');
        document.getElementById('btn-opp-mode-roster')?.classList.toggle('active', isRoster);
        document.getElementById('btn-opp-mode-quick')?.classList.toggle('active', !isRoster);
        const rosterView = document.getElementById('opp-mode-roster-view');
        const quickView = document.getElementById('opp-mode-quick-view');
        if (rosterView) rosterView.style.display = isRoster ? 'block' : 'none';
        if (quickView) quickView.style.display = isRoster ? 'none' : 'block';
    }

    updateSetupTeamLineups(forceReset = false) {
        if (this.setupGameType === 'external') {
            // 1. 中正國小少棒代表隊打序與投手
            const allPlayers = window.store.getPlayersByTeam('JJ');
            if (forceReset || !Array.isArray(this.setupExtOrder)) {
                this.setupExtOrder = allPlayers.slice(0, 9).map(p => p.id);
            } else {
                this.setupExtOrder = this.setupExtOrder.filter(id => allPlayers.some(p => p.id === id));
            }
            const extSpSel = document.getElementById('setup-ext-jj-sp');
            if (extSpSel) {
                const prevSp = extSpSel.value;
                extSpSel.innerHTML = allPlayers.map(p => {
                    const isA = p.teamId === 'tA';
                    return `<option value="${p.id}" ${p.id === prevSp ? 'selected' : ''}>${isA ? '⭐ A隊 ' : ''}#${p.number} ${p.name} (${p.pos})</option>`;
                }).join('');
                if (!extSpSel.value && allPlayers.length > 0) {
                    extSpSel.value = allPlayers[0].id;
                }
            }
            this.renderSetupLineupBox('ext', allPlayers, this.setupExtOrder, 'setup-ext-jj-lineup-list');

            // 2. 外校對手學校打序與先發投手【彈性雙模式】
            const oppName = document.getElementById('setup-opp-name')?.value.trim() || '外校對手';
            const oppBoxTitle = document.getElementById('setup-opp-box-title');
            if (oppBoxTitle) {
                oppBoxTitle.textContent = `⚔️ ${oppName} — 本場先發投手 ＆ 先發打序`;
            }

            const oppPlayers = window.store.getOpponentPlayers ? window.store.getOpponentPlayers(oppName) : [];
            if (forceReset || this._lastSetupOppName !== oppName || !Array.isArray(this.setupOppOrder)) {
                this._lastSetupOppName = oppName;
                this.setupOppOrder = oppPlayers.slice(0, 9).map(p => p.id);
            } else {
                this.setupOppOrder = this.setupOppOrder.filter(id => oppPlayers.some(p => p.id === id));
            }

            const oppSpSel = document.getElementById('setup-ext-opp-sp');
            if (oppSpSel) {
                const prevOppSp = oppSpSel.value;
                oppSpSel.innerHTML = oppPlayers.map(p => {
                    return `<option value="${p.id}" ${p.id === prevOppSp ? 'selected' : ''}>#${p.number} ${p.name} (${p.pos || '投手'})</option>`;
                }).join('');
                if (!oppSpSel.value && oppPlayers.length > 0) {
                    oppSpSel.value = oppPlayers[0].id;
                }
            }
            this.renderSetupLineupBox('opp', oppPlayers, this.setupOppOrder, 'setup-ext-opp-lineup-list');
            return;
        }

        const awayTeamId = document.getElementById('setup-away-team')?.value || 't1';
        const homeTeamId = document.getElementById('setup-home-team')?.value || 't2';

        const awayPlayers = window.store.getPlayersByTeam(awayTeamId);
        const homePlayers = window.store.getPlayersByTeam(homeTeamId);

        if (forceReset || this._lastSetupAwayTeamId !== awayTeamId || !Array.isArray(this.setupAwayOrder)) {
            this._lastSetupAwayTeamId = awayTeamId;
            this.setupAwayOrder = awayPlayers.map(p => p.id);
        } else {
            this.setupAwayOrder = this.setupAwayOrder.filter(id => awayPlayers.some(p => p.id === id));
        }

        if (forceReset || this._lastSetupHomeTeamId !== homeTeamId || !Array.isArray(this.setupHomeOrder)) {
            this._lastSetupHomeTeamId = homeTeamId;
            this.setupHomeOrder = homePlayers.map(p => p.id);
        } else {
            this.setupHomeOrder = this.setupHomeOrder.filter(id => homePlayers.some(p => p.id === id));
        }

        const awaySpSel = document.getElementById('setup-away-sp');
        const homeSpSel = document.getElementById('setup-home-sp');
        if (awaySpSel) {
            const prevAwaySp = awaySpSel.value;
            awaySpSel.innerHTML = awayPlayers.map(p => `<option value="${p.id}" ${p.id === prevAwaySp ? 'selected' : ''}>#${p.number} ${p.name} (${p.pos})</option>`).join('');
        }
        if (homeSpSel) {
            const prevHomeSp = homeSpSel.value;
            homeSpSel.innerHTML = homePlayers.map(p => `<option value="${p.id}" ${p.id === prevHomeSp ? 'selected' : ''}>#${p.number} ${p.name} (${p.pos})</option>`).join('');
        }

        this.renderSetupLineupBox('away', awayPlayers, this.setupAwayOrder, 'setup-away-lineup-list');
        this.renderSetupLineupBox('home', homePlayers, this.setupHomeOrder, 'setup-home-lineup-list');
    }

    fillATeamSetupOrder() {
        const aPlayers = window.store.getPlayersByTeam('tA');
        this.setupExtOrder = aPlayers.slice(0, 9).map(p => p.id);
        this.updateSetupTeamLineups(false);
    }

    renderSetupLineupBox(side, allTeamPlayers, orderList, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const unpicked = allTeamPlayers.filter(p => !orderList.includes(p.id));
        const nextOrderNum = orderList.length + 1;

        let quickFillBtn = '';
        if (side === 'ext') {
            quickFillBtn = `
                <button type="button" class="btn" style="padding:4px 9px;font-size:0.76rem;background:rgba(245,158,11,0.25);border-color:#f59e0b;color:#fde68a;font-weight:900;" onclick="app.fillATeamSetupOrder()">
                    ⭐ A隊主力 1~9 棒一鍵排入
                </button>
            `;
        } else if (side === 'opp') {
            quickFillBtn = `
                <button type="button" class="btn" style="padding:4px 9px;font-size:0.76rem;background:rgba(56,189,248,0.2);border-color:#38bdf8;color:#7dd3fc;font-weight:800;" onclick="app.fillAllSetupOrder('opp')">
                    📋 依秩序冊前 9 棒一鍵排入
                </button>
            `;
        }

        const toolBarHTML = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                ${quickFillBtn}
                <button type="button" class="btn" style="padding:4px 9px;font-size:0.76rem;" onclick="app.clearSetupOrderForTap('${side}')">
                    👆 清空重排（依點擊順序排 1~N 棒）
                </button>
                <button type="button" class="btn" style="padding:4px 9px;font-size:0.76rem;" onclick="app.shuffleSetupOrder('${side}')">
                    🎲 隨機抽籤排棒
                </button>
                <button type="button" class="btn" style="padding:4px 9px;font-size:0.76rem;" onclick="app.fillAllSetupOrder('${side}')">
                    🔄 全員排入
                </button>
            </div>
        `;

        const activeRowsHTML = orderList.map((pid, idx) => {
            const p = window.store.getPlayer(pid);
            if (!p) return '';
            const isOpp = side === 'opp' || (p.teamId && p.teamId.startsWith('OPP'));
            const badgeHTML = isOpp
                ? '<span class="season-badge" style="background:#0284c7;color:#fff;">對手</span>'
                : this.teamBadgeHTML(p.teamId);
            const numColor = isOpp ? 'linear-gradient(135deg,#38bdf8,#0284c7)' : 'linear-gradient(135deg,var(--jj-gold-light),var(--jj-gold))';

            return `
                <div style="display:flex;align-items:center;gap:8px;background:var(--bg-primary);padding:7px 10px;border-radius:8px;border:1.5px solid var(--border-color);">
                    <span style="background:${numColor};color:#061527;font-weight:900;font-size:0.76rem;padding:2px 8px;border-radius:6px;min-width:54px;text-align:center;">
                        第 ${idx + 1} 棒
                    </span>
                    ${badgeHTML}
                    <span class="num-tag">#${p.number}</span>
                    <strong>${p.name}</strong>
                    <span style="color:var(--text-secondary);font-size:0.74rem;margin-left:auto;">${p.pos || '選手'}</span>
                    <div style="display:flex;gap:4px;">
                        <button type="button" class="btn" style="padding:2px 7px;font-size:0.76rem;" onclick="app.moveSetupOrder('${side}', ${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.35;padding:2px 7px;"' : ''}>⬆️</button>
                        <button type="button" class="btn" style="padding:2px 7px;font-size:0.76rem;" onclick="app.moveSetupOrder('${side}', ${idx}, 1)" ${idx === orderList.length - 1 ? 'disabled style="opacity:0.35;padding:2px 7px;"' : ''}>⬇️</button>
                        <button type="button" class="btn btn-danger" style="padding:2px 7px;font-size:0.76rem;" onclick="app.removeSetupOrderPlayer('${side}', '${pid}')" title="移出打序">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        const unpickedHTML = unpicked.length > 0 ? `
            <div style="margin-top:8px;padding:8px;background:rgba(6,21,39,0.65);border:1px dashed var(--jj-gold);border-radius:8px;">
                <div style="font-size:0.78rem;color:var(--jj-gold-light);font-weight:800;margin-bottom:6px;">
                    👇 點擊下方球員，依序排入【第 ${nextOrderNum} 棒】：
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${unpicked.map(p => {
                        const isA = p.teamId === 'tA';
                        const isOpp = side === 'opp' || (p.teamId && p.teamId.startsWith('OPP'));
                        const bgStyle = isOpp ? '#0e3a64' : (isA ? 'rgba(245,158,11,0.22)' : '#10345c');
                        const borderStyle = isOpp ? '#38bdf8' : (isA ? '#f59e0b' : 'var(--jj-gold)');
                        const colorStyle = isOpp ? '#7dd3fc' : (isA ? '#fde68a' : '#fff');
                        return `
                        <button type="button" class="btn" style="padding:6px 10px;font-size:0.82rem;background:${bgStyle};border-color:${borderStyle};color:${colorStyle};font-weight:${isA ? '800' : 'normal'};" onclick="app.addSetupOrderPlayer('${side}', '${p.id}')">
                            ${isA ? '⭐ A隊 ' : '➕ '}#${p.number} ${p.name}
                        </button>
                        `;
                    }).join('')}
                </div>
            </div>
        ` : '';

        el.innerHTML = toolBarHTML + (activeRowsHTML || '<div style="padding:10px;text-align:center;color:var(--text-secondary);font-size:0.84rem;">請點擊下方球員依序排入第 1 棒、第 2 棒...</div>') + unpickedHTML;
    }

    getSetupOrderRef(side) {
        if (side === 'ext') return this.setupExtOrder;
        if (side === 'opp') return this.setupOppOrder;
        return side === 'away' ? this.setupAwayOrder : this.setupHomeOrder;
    }

    clearSetupOrderForTap(side) {
        if (side === 'ext') this.setupExtOrder = [];
        else if (side === 'opp') this.setupOppOrder = [];
        else if (side === 'away') this.setupAwayOrder = [];
        else this.setupHomeOrder = [];
        this.updateSetupTeamLineups(false);
    }

    fillAllSetupOrder(side) {
        let players = [];
        if (side === 'ext') {
            players = window.store.getPlayersByTeam('JJ');
        } else if (side === 'opp') {
            const oppName = document.getElementById('setup-opp-name')?.value.trim() || '外校對手';
            players = window.store.getOpponentPlayers(oppName);
        } else {
            const teamId = document.getElementById(side === 'away' ? 'setup-away-team' : 'setup-home-team')?.value;
            players = window.store.getPlayersByTeam(teamId);
        }
        const list = this.getSetupOrderRef(side);
        players.forEach(p => {
            if (!list.includes(p.id)) list.push(p.id);
        });
        this.updateSetupTeamLineups(false);
    }

    shuffleSetupOrder(side) {
        this.fillAllSetupOrder(side);
        const list = this.getSetupOrderRef(side);
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        this.updateSetupTeamLineups(false);
    }

    moveSetupOrder(side, index, delta) {
        const list = this.getSetupOrderRef(side);
        const target = index + delta;
        if (target < 0 || target >= list.length) return;
        [list[index], list[target]] = [list[target], list[index]];
        this.updateSetupTeamLineups(false);
    }

    removeSetupOrderPlayer(side, pid) {
        if (side === 'ext') {
            this.setupExtOrder = (this.setupExtOrder || []).filter(id => id !== pid);
        } else if (side === 'opp') {
            this.setupOppOrder = (this.setupOppOrder || []).filter(id => id !== pid);
        } else if (side === 'away') {
            this.setupAwayOrder = this.setupAwayOrder.filter(id => id !== pid);
        } else {
            this.setupHomeOrder = this.setupHomeOrder.filter(id => id !== pid);
        }
        this.updateSetupTeamLineups(false);
    }

    addSetupOrderPlayer(side, pid) {
        const list = this.getSetupOrderRef(side);
        if (!list.includes(pid)) list.push(pid);
        this.updateSetupTeamLineups(false);
    }

    handleStartLiveGame() {
        const tournament = document.getElementById('setup-tournament')?.value.trim() || (this.setupGameType === 'external' ? '對外友誼賽 / 盃賽' : '隊內三隊爭霸練習賽 (4局制)');
        const date = document.getElementById('setup-game-date')?.value || new Date().toISOString().slice(0, 10);
        const innings = Number(document.getElementById('setup-innings')?.value) || 4;

        if (this.setupGameType === 'external') {
            const oppName = document.getElementById('setup-opp-name')?.value.trim() || '外校對手';
            const jjSide = document.getElementById('setup-jj-side')?.value || 'away';
            const jjSpId = document.getElementById('setup-ext-jj-sp')?.value || '';
            const jjLineup = [...(this.setupExtOrder || [])];

            if (jjLineup.length === 0) {
                alert('請確認中正國小已排入至少 1 位先發打序球員！');
                return;
            }

            let oppLineup = [];
            let oppStarterId = '';

            if (this.oppLineupMode === 'quick') {
                // ⚡ 快速預設模式：1~9棒自動生成
                oppLineup = Array.from({ length: 9 }, (_, i) => `opp_b_${i + 1}`);
                oppStarterId = 'opp_sp';
            } else {
                // 📋 秩序冊名單排打序模式
                oppLineup = [...(this.setupOppOrder || [])];
                if (oppLineup.length === 0) {
                    const oppPlayers = window.store.getOpponentPlayers(oppName);
                    oppLineup = oppPlayers.slice(0, 9).map(p => p.id);
                }
                oppStarterId = document.getElementById('setup-ext-opp-sp')?.value || (oppLineup[0] || 'opp_sp');
            }

            const oppTeamId = `OPP:${oppName}`;
            const awayTeamId = jjSide === 'away' ? 'JJ' : oppTeamId;
            const homeTeamId = jjSide === 'away' ? oppTeamId : 'JJ';
            const awayLineup = jjSide === 'away' ? jjLineup : oppLineup;
            const homeLineup = jjSide === 'away' ? oppLineup : jjLineup;
            const awayStarterId = jjSide === 'away' ? jjSpId : oppStarterId;
            const homeStarterId = jjSide === 'away' ? oppStarterId : jjSpId;

            window.scorebook.startNewGame({
                tournament, date, innings,
                sameTeamPitcher: false,
                isExternal: true,
                opponentName: oppName,
                awayTeamId, homeTeamId,
                awayLineup, homeLineup,
                awayStarterId, homeStarterId
            });

            this.refreshAll();
            return;
        }

        const awayTeamId = document.getElementById('setup-away-team')?.value;
        const homeTeamId = document.getElementById('setup-home-team')?.value;
        if (awayTeamId === homeTeamId) {
            alert('先攻隊伍與後攻隊伍不能相同，請選擇兩支不同的隊伍對戰！');
            return;
        }

        const sameTeamPitcher = document.getElementById('setup-pitcher-mode')?.value !== 'opponent';
        const awayStarterId = document.getElementById('setup-away-sp')?.value || '';
        const homeStarterId = document.getElementById('setup-home-sp')?.value || '';

        const awayLineup = [...(this.setupAwayOrder || [])];
        const homeLineup = [...(this.setupHomeOrder || [])];

        if (awayLineup.length === 0 || homeLineup.length === 0) {
            alert('請確認先攻與後攻隊伍皆已排入至少 1 位打序球員！');
            return;
        }

        window.scorebook.startNewGame({
            tournament, date, innings, sameTeamPitcher,
            isExternal: false,
            awayTeamId, homeTeamId,
            awayLineup, homeLineup,
            awayStarterId, homeStarterId
        });

        this.refreshAll();
    }

    renderLiveScorebookUI(st) {
        const awayTeam = window.store.getTeam(st.awayTeamId);
        const homeTeam = window.store.getTeam(st.homeTeamId);
        const { isTop, battingTeam, fieldingTeam, pitcherTeam } = window.scorebook.getActiveTeams();
        const { orderNo, batter, pitcher } = window.scorebook.getCurrentMatchup();
        const pTeam = pitcherTeam || battingTeam;

        document.getElementById('live-tournament-title').textContent = `${st.date} ｜ ${st.tournament} (${st.maxInnings || 4}局制)`;
        document.getElementById('live-inning-badge').textContent = window.scorebook.getInningLabel();

        // 逐局計分板 (預設 4 局)
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

        document.getElementById('live-linescore-table').innerHTML = `
            <thead><tr>${headCols}</tr></thead>
            <tbody>
                <tr>${awayCols}</tr>
                <tr>${homeCols}</tr>
            </tbody>
        `;

        // B-S-O 燈號
        for (let i = 1; i <= 3; i++) document.getElementById(`dot-b-${i}`)?.classList.toggle('active-b', st.balls >= i);
        for (let i = 1; i <= 2; i++) document.getElementById(`dot-s-${i}`)?.classList.toggle('active-s', st.strikes >= i);
        for (let i = 1; i <= 2; i++) document.getElementById(`dot-o-${i}`)?.classList.toggle('active-o', st.outs >= i);

        // 當前場上投手用球數監控
        const pLine = pitcher ? st.pitchingStats[pitcher.id] : null;
        const np = pLine ? pLine.np : 0;
        const warnLimit = window.store.data.settings?.pitchLimitWarning || 50;
        const maxLimit = window.store.data.settings?.pitchLimitMax || 65;
        const pillEl = document.getElementById('live-pitch-count-pill');
        if (pillEl) {
            pillEl.className = 'pitch-limit-pill ' + (np >= maxLimit ? 'danger' : (np >= warnLimit ? 'warn' : ''));
            pillEl.textContent = `⚾ ${pTeam.emoji}${pTeam.name}本隊投手 ${pitcher ? pitcher.name : ''}：${np} 球 (好球 ${pLine ? pLine.strikes : 0})`;
        }

        // 攻守隊伍橫幅
        const modeBanner = document.getElementById('live-attack-defense-tag');
        if (modeBanner) {
            modeBanner.className = 'attack-defense-tag batting';
            const modeText = st.sameTeamPitcher !== false
                ? `🔥 進攻 & 同隊投球：${battingTeam.emoji}${battingTeam.name} ｜ 🛡️ 場上守備：${fieldingTeam.emoji}${fieldingTeam.name}`
                : `🔥 進攻：${battingTeam.emoji}${battingTeam.name} ｜ 🛡️ 投球守備：${fieldingTeam.emoji}${fieldingTeam.name}`;
            modeBanner.innerHTML = modeText;
        }

        // 打者 vs 同隊投手雙邊即時焦點卡
        const matchupEl = document.getElementById('live-matchup-info');
        if (matchupEl) {
            const bStat = batter ? st.battingStats[batter.id] : null;
            const ipStr = StatsEngine.formatIP(pLine ? pLine.outs : 0);
            const pitcherRoleLabel = st.sameTeamPitcher !== false ? '⚾ 同隊投手（自己隊伍投球）' : '⚾ 對手場上投手';
            matchupEl.innerHTML = `
                <div style="flex:1;min-width:200px;background:rgba(203,176,99,0.1);padding:10px 12px;border-radius:10px;border-left:4px solid ${battingTeam.color};">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:0.76rem;color:var(--text-secondary);">🏏 目前打擊：${battingTeam.emoji}${battingTeam.name}（第 ${orderNo} 棒）</span>
                        <button class="btn" style="padding:2px 8px;font-size:0.74rem;" onclick="app.promptChangeBatter()">🔢 排序打序/換棒次</button>
                    </div>
                    <div style="font-size:1.1rem;font-weight:900;color:var(--cpbl-gold-light);margin-top:3px;">
                        #${batter ? batter.number : ''} ${batter ? batter.name : ''}
                        <small style="color:#cbd5e1;font-weight:600;">（今日 ${bStat ? bStat.ab : 0}支${bStat ? bStat.h : 0}，${bStat ? bStat.rbi : 0}打點）</small>
                    </div>
                </div>
                <div style="flex:1;min-width:200px;background:rgba(56,189,248,0.1);padding:10px 12px;border-radius:10px;border-left:4px solid ${pTeam.color};">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:0.76rem;color:var(--text-secondary);">${pitcherRoleLabel}：${pTeam.emoji}${pTeam.name}</span>
                        <button class="btn" style="padding:2px 8px;font-size:0.74rem;" onclick="app.openChangePitcherModal()">換投手</button>
                    </div>
                    <div style="font-size:1.1rem;font-weight:900;color:#93c5fd;margin-top:3px;">
                        #${pitcher ? pitcher.number : ''} ${pitcher ? pitcher.name : ''}
                        <small style="color:#cbd5e1;font-weight:600;">（${ipStr}局 / ${np}球 / ${pLine ? pLine.so : 0}K）</small>
                    </div>
                </div>
            `;
        }

        // 更新壘包顯示
        ['first', 'second', 'third'].forEach(baseKey => {
            const node = document.getElementById(`diamond-base-${baseKey}`);
            const nameSpan = document.getElementById(`diamond-runner-${baseKey}`);
            const runner = st.bases[baseKey];
            if (node && nameSpan) {
                node.classList.toggle('occupied', Boolean(runner));
                nameSpan.textContent = runner ? `#${runner.number} ${runner.name}` : '空壘 (點擊設定)';
            }
        });

        // 更新文字轉播（僅顯示選手名字＋好壞球或結果）
        const logContainer = document.getElementById('live-play-log');
        if (logContainer) {
            logContainer.innerHTML = (st.playByPlay || []).map(item => `
                <div class="play-log-item">
                    <span>${item.text}</span>
                </div>
            `).join('');
        }
    }

    shareParentLiveLink(targetChannel) {
        const ch = targetChannel || (window.scorebook ? window.scorebook.activeChannel : 'intra');
        const base = window.location.href.split('?')[0].split('#')[0].replace(/\/index\.html$/i, '/');
        const dir = base.endsWith('/') ? base : base.substring(0, base.lastIndexOf('/') + 1);
        const fbUrl = window.store ? window.store.firebaseDbUrl : '';
        const chParam = `channel=${ch}`;
        const fbParam = fbUrl ? `&fb=${encodeURIComponent(fbUrl)}` : '';
        const liveUrl = `${dir}live.html?${chParam}${fbParam}`;

        const chName = (ch === 'external') ? '🌏 對外代表隊比賽' : '🏟️ 校內三隊爭霸賽';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(liveUrl).then(() => {
                alert(`📺 家長專屬【${chName}】即時觀賽連結已複製！\n\n${liveUrl}\n\n（可直接貼到家長 LINE 群組，家長點開即直達該賽事實況轉播，無法修改紀錄）`);
            }).catch(() => {
                prompt(`請複製以下家長專屬【${chName}】觀賽連結傳至 LINE 群組：`, liveUrl);
            });
        } else {
            prompt(`請複製以下家長專屬【${chName}】觀賽連結傳至 LINE 群組：`, liveUrl);
        }
    }

    initSpeechVoices() {
        if (!('speechSynthesis' in window)) return;
        this.populateVoiceDropdown();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => this.populateVoiceDropdown();
        }
    }

    getScoredChineseVoices() {
        if (!('speechSynthesis' in window)) return [];
        const all = window.speechSynthesis.getVoices() || [];
        // 篩選中文/台灣語音，並依照「擬真自然度 (Natural / Neural / 台灣口音)」排序
        const zhVoices = all.filter(v =>
            /zh|cmn|taiwan|chinese|國語|臺灣|台灣|美佳|meijia|hsiao|yunjhe|hanhan|zhiwei|yating/i.test(`${v.lang} ${v.name}`)
        );

        const scoreVoice = (v) => {
            const s = `${v.name} ${v.lang}`;
            let score = 0;
            // 最優先：Microsoft Edge / Windows 11 Online Natural 超擬真台灣主播聲線
            if (/YunJhe.*Natural/i.test(s)) score += 1000;      // 雲哲（台灣男體育主播感）
            else if (/HsiaoChen.*Natural/i.test(s)) score += 980; // 曉臻（台灣女主播感）
            else if (/HsiaoYu.*Natural/i.test(s)) score += 960;   // 曉雨（台灣自然女聲）
            else if (/Natural|Neural/i.test(s) && /TW|Taiwan|臺灣|台灣/i.test(s)) score += 920;
            else if (/Google.*(國語|臺灣|台灣|zh-TW)/i.test(s)) score += 860; // Chrome 台灣雲端自然語音
            else if (/Meijia|美佳/i.test(s) && /Enhanced|Premium/i.test(s)) score += 850; // Apple 高音質美佳
            else if (/Meijia|美佳|Siri/i.test(s)) score += 800;
            else if (/Online/i.test(s) && /TW|Taiwan/i.test(s)) score += 750;
            else if (/Natural|Neural/i.test(s)) score += 650;
            else if (/zh-TW|zh_TW|Taiwan|臺灣|台灣/i.test(s)) score += 500;
            else if (/zh-HK|zh-CN/i.test(s)) score += 200;

            // 傳統離線 Desktop 機器人語音降權，避免優先被選中
            if (/Desktop/i.test(s)) score -= 150;
            return score;
        };

        return zhVoices.sort((a, b) => scoreVoice(b) - scoreVoice(a));
    }

    populateVoiceDropdown() {
        const sel = document.getElementById('voice-select-dropdown');
        if (!sel) return;
        const voices = this.getScoredChineseVoices();
        if (voices.length === 0) return;

        const formatVoiceLabel = (v) => {
            if (/YunJhe.*Natural/i.test(v.name)) return '🎙️ 台灣男主播 (雲哲 Natural 超擬真)';
            if (/HsiaoChen.*Natural/i.test(v.name)) return '🎙️ 台灣女主播 (曉臻 Natural 超擬真)';
            if (/HsiaoYu.*Natural/i.test(v.name)) return '🎙️ 台灣播報員 (曉雨 Natural 超擬真)';
            if (/Google.*(國語|臺灣|台灣)/i.test(v.name)) return '🎙️ Google 台灣自然語音';
            if (/Meijia|美佳/i.test(v.name)) return `🎙️ Apple 台灣語音 (${v.name})`;
            const isNatural = /Natural|Online|Neural/i.test(v.name);
            return `${isNatural ? '🌟 ' : ''}${v.name.replace(/Microsoft |Desktop |Online \(Natural\) - Chinese \(Taiwan\)/g, '').trim()} (${v.lang})`;
        };

        sel.innerHTML = `<option value="">🎙️ 自動最佳擬真主播 (${formatVoiceLabel(voices[0]).replace(/^🎙️ |^🌟 /, '')})</option>` +
            voices.map(v => `<option value="${v.voiceURI}" ${v.voiceURI === this.preferredVoiceURI ? 'selected' : ''}>${formatVoiceLabel(v)}</option>`).join('');
    }

    onVoiceSelectChange(voiceURI) {
        this.preferredVoiceURI = voiceURI || '';
        try {
            localStorage.setItem('JJ_PREFERRED_VOICE_URI', this.preferredVoiceURI);
        } catch (e) {}
        const sampleBatter = window.store?.data?.players?.[0]?.name || '賴冠融';
        this.speakActionText(`${sampleBatter} 一壘安打`);
    }

    pickBestVoice() {
        const voices = this.getScoredChineseVoices();
        if (voices.length === 0) return null;
        if (this.preferredVoiceURI) {
            const matched = voices.find(v => v.voiceURI === this.preferredVoiceURI);
            if (matched) return matched;
        }
        return voices[0];
    }

    /**
     * 台灣正式棒球比賽播報正音字典（修正破音字如「滾地(ㄉㄧˋ)出局」、罕見姓名與播報員自然斷句）
     */
    formatBaseballSpeechText(rawText) {
        if (!rawText) return '';
        let t = String(rawText).trim();

        // 1. 將「選手姓名 動作結果」中間加上自然播報停頓逗號「，」，避免姓名與動作連讀吃字
        const spaceIdx = t.indexOf(' ');
        if (spaceIdx > 0) {
            const namePart = t.slice(0, spaceIdx).trim();
            const actionPart = t.slice(spaceIdx + 1).trim();
            t = `${namePart}，${actionPart}`;
        }

        // 2. 姓氏與選手姓名破音字／罕見字正音（僅影響發音，不影響畫面文字）
        t = t
            .replace(/^曾/g, '增')       // 姓氏「曾」讀 ㄗㄥ (zēng)，避免讀成 ㄘㄥˊ (céng)
            .replace(/曾聖壹/g, '增聖一')
            .replace(/余家樂/g, '余家勒') // 「家樂」讀 ㄌㄜˋ (lè)，避免讀成 ㄩㄝˋ (yuè)
            .replace(/許庭榞/g, '許庭元') // 「榞」讀 ㄩㄢˊ (yuán)
            .replace(/辛士宖/g, '辛士宏') // 「宖」讀 ㄏㄨㄥˊ (hóng)
            .replace(/陳竑墐/g, '陳宏瑾') // 「竑墐」讀 ㄏㄨㄥˊ ㄐㄧㄣˇ
            .replace(/陳逸釩/g, '陳逸凡') // 「釩」讀 ㄈㄢˊ (fán)
            .replace(/吳苙均/g, '吳立均') // 「苙」讀 ㄌㄧˋ (lì)
            .replace(/張焱融/g, '張諺融') // 「焱」讀 ㄧㄢˋ (yàn)
            .replace(/黃啟紘/g, '黃啟宏') // 「紘」讀 ㄏㄨㄥˊ (hóng)
            .replace(/顏煜宸/g, '顏育辰') // 「煜宸」讀 ㄩˋ ㄔㄣˊ
            .replace(/蔡宇晟/g, '蔡宇成') // 「晟」讀 ㄔㄥˊ
            .replace(/涂芳綵/g, '途芳彩') // 「涂綵」讀 ㄊㄨˊ ㄘㄞˇ
            .replace(/何東芮/g, '何東瑞') // 「芮」讀 ㄖㄨㄟˋ
            .replace(/許佑銓/g, '許佑全') // 「銓」讀 ㄑㄩㄢˊ
            .replace(/郭宸汰/g, '郭辰泰') // 「宸汰」讀 ㄔㄣˊ ㄊㄞˋ
            .replace(/林辰宥/g, '林辰右') // 「宥」讀 ㄧㄡˋ
            .replace(/葉晁昕/g, '葉潮昕') // 「晁」讀 ㄔㄠˊ (cháo)
            .replace(/黃宥珽/g, '黃宥挺') // 「珽」讀 ㄊㄧㄥˇ (tǐng)
            .replace(/任愷頡/g, '任愷傑') // 「頡」讀 ㄐㄧㄝˊ (jié)
            .replace(/薛荻傑/g, '薛迪傑') // 「荻」讀 ㄉㄧˊ (dí)
            .replace(/李昕燁/g, '李昕夜') // 「燁」讀 ㄧㄝˋ (yè)
            .replace(/李昕郇/g, '李昕巡'); // 「郇」讀 ㄒㄩㄣˊ (xún)

        // 3. 正式棒球術語破音字強制校正
        t = t
            .replace(/滾地出局/g, '滾弟出局')   // 強制「地」讀四聲 ㄉㄧˋ (dì)，絕不讀成輕聲「滾的出局」
            .replace(/滾地球/g, '滾弟球')       // 強制「地」讀四聲 ㄉㄧˋ (dì)
            .replace(/犧牲觸擊/g, '犧牲觸及')   // 台灣棒球「觸擊」讀二聲 ㄔㄨˋ ㄐㄧˊ
            .replace(/跑回得分/g, '跑回德分')   // 強制「得」讀二聲 ㄉㄜˊ (dé)，避免讀成輕聲「的」
            .replace(/得分/g, '德分')           // 強制「得」讀二聲 ㄉㄜˊ (dé)
            .replace(/好球進壘/g, '好球')
            .replace(/Home Run/gi, '');         // 移除夾雜英文避免切換成生硬英文電子音

        return `${t}。`;
    }

    toggleVoiceAnnounce() {
        this.voiceEnabled = !this.voiceEnabled;
        try {
            localStorage.setItem('JJ_VOICE_ANNOUNCE', this.voiceEnabled ? 'on' : 'off');
        } catch (e) {}
        this.updateVoiceToggleUI();
        if (!this.voiceEnabled && ('speechSynthesis' in window)) {
            window.speechSynthesis.cancel();
        }
    }

    updateVoiceToggleUI() {
        const btn = document.getElementById('btn-toggle-voice');
        if (btn) {
            btn.textContent = this.voiceEnabled ? '🔊 語音播報：開' : '🔇 語音播報：關';
            btn.style.borderColor = this.voiceEnabled ? 'var(--jj-gold)' : 'var(--border-color)';
        }
    }

    speakActionText(text) {
        const toast = document.getElementById('voice-action-toast');
        if (toast) {
            toast.innerHTML = `🔊 播報：<span style="color:#fff;">【${text}】</span>`;
            toast.classList.add('speaking');
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => toast.classList.remove('speaking'), 1100);
        }

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
            // 使用自然真人語速與原始音高，避免變調產生機器人感
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
                { f: 523.25, t: 0.0, d: 0.14 },  // C5
                { f: 659.25, t: 0.15, d: 0.14 }, // E5
                { f: 783.99, t: 0.30, d: 0.14 }, // G5
                { f: 1046.50, t: 0.46, d: 0.55 } // C6
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

    triggerHomeRunJumbotron(batterBannerText) {
        const overlay = document.getElementById('hr-jumbotron-overlay');
        const banner = document.getElementById('hr-batter-banner');
        const canvas = document.getElementById('hr-fireworks-canvas');
        if (!overlay || !canvas) return;

        if (banner) {
            banner.textContent = batterBannerText || '🔥 轟出全壘打！';
        }

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
            const count = 36;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.2;
                const speed = 1.6 + Math.random() * 3.8;
                particles.push({
                    x: cx,
                    y: cy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 0.6,
                    alpha: 1,
                    size: 2.2 + Math.random() * 2.2,
                    color
                });
            }
        };

        // 初始連發煙火
        spawnBurst(canvas.width * 0.25, canvas.height * 0.32);
        spawnBurst(canvas.width * 0.75, canvas.height * 0.28);
        spawnBurst(canvas.width * 0.50, canvas.height * 0.22);

        let frame = 0;
        if (this._hrAnimId) cancelAnimationFrame(this._hrAnimId);

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            frame++;
            if (frame % 18 === 0) {
                const rx = canvas.width * (0.15 + Math.random() * 0.7);
                const ry = canvas.height * (0.15 + Math.random() * 0.55);
                spawnBurst(rx, ry);
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.055; // 重力下墜
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
        this._hrHideTimer = setTimeout(() => {
            this.hideHomeRunJumbotron();
        }, 4200);
    }

    hideHomeRunJumbotron() {
        const overlay = document.getElementById('hr-jumbotron-overlay');
        if (overlay) overlay.classList.remove('active');
        if (this._hrAnimId) {
            cancelAnimationFrame(this._hrAnimId);
            this._hrAnimId = null;
        }
        clearTimeout(this._hrHideTimer);
    }

    handlePitchBtn(type) {
        window.scorebook.recordPitch(type);
        const latestLog = window.scorebook.state?.playByPlay?.[0]?.text;
        if (latestLog) {
            this.speakActionText(latestLog);
        }
        this.renderScorebookView();
    }

    handlePlayBtn(type) {
        // 先擷取目前打者資訊供全壘打電視牆顯示
        const { battingTeam } = window.scorebook.getActiveTeams();
        const { batter } = window.scorebook.getCurrentMatchup();
        const batterBannerText = batter
            ? `${battingTeam ? battingTeam.emoji + battingTeam.name : ''} #${batter.number} ${batter.name} 轟出全壘打！`
            : '🔥 轟出全壘打！';

        window.scorebook.recordPlay({ type });
        const latestLog = window.scorebook.state?.playByPlay?.[0]?.text;
        if (latestLog) {
            this.speakActionText(latestLog);
        }
        this.renderScorebookView();

        if (type === 'HR') {
            this.triggerHomeRunJumbotron(batterBannerText);
        }
    }

    handleUndo() {
        if (window.scorebook.undo()) {
            this.renderScorebookView();
        } else {
            alert('目前已是最初步驟，無可復原紀錄。');
        }
    }

    onBaseClicked(baseKey) {
        const st = window.scorebook.state;
        if (!st) return;
        this.selectedBaseKey = baseKey;
        const runner = st.bases[baseKey];
        const baseTitleMap = { first: '一壘', second: '二壘', third: '三壘' };
        const { battingTeam } = window.scorebook.getActiveTeams();

        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');
        if (!modal || !title || !body) return;

        title.textContent = `🏃 ${baseTitleMap[baseKey]}跑者操作`;

        if (runner) {
            body.innerHTML = `
                <div style="margin-bottom:14px;padding:10px;background:var(--bg-primary);border-radius:8px;">
                    目前壘上跑者：<strong style="color:var(--cpbl-gold-light);font-size:1.05rem;">#${runner.number || ''} ${runner.name}</strong>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <button class="touch-btn btn-hit" onclick="app.execRunnerAction('SB')">
                        🏃 盜壘成功 (SB)<small>進一壘並記 1 次盜壘</small>
                    </button>
                    <button class="touch-btn btn-out" onclick="app.execRunnerAction('CS')">
                        🚫 盜壘失敗 (CS)<small>抓盜壘出局 (+1 Out)</small>
                    </button>
                    <button class="touch-btn btn-out" onclick="app.execRunnerAction('TAG_OUT')">
                        🛑 觸殺出局<small>牽制/夾殺/觸殺 (+1 Out)</small>
                    </button>
                    <button class="touch-btn btn-out" onclick="app.execRunnerAction('RUNNER_ERROR')">
                        💥 跑壘失誤<small>跑壘判斷失誤出局 (+1 Out)</small>
                    </button>
                    <button class="touch-btn btn-walk" onclick="app.execRunnerAction('WP')">
                        ⚡ 暴投/捕逸推進<small>推進一壘 (投手+1暴投)</small>
                    </button>
                    <button class="touch-btn btn-hr" onclick="app.execRunnerAction('SCORE')">
                        🏠 直接跑回得分<small>本壘得分 (+1 R)</small>
                    </button>
                </div>
                <div style="margin-top:12px;text-align:right;">
                    <button class="btn btn-danger" onclick="app.execRunnerAction('REMOVE')">移除此壘包跑者</button>
                </div>
            `;
        } else {
            const teamPlayers = window.store.getPlayersByTeam(battingTeam.id);
            body.innerHTML = `
                <p style="margin-bottom:10px;color:var(--text-secondary);font-size:0.88rem;">手動放置【${battingTeam.emoji}${battingTeam.name}】跑者上${baseTitleMap[baseKey]}（如突破僵局制或代跑）：</p>
                <select id="manual-runner-select" class="form-control" style="margin-bottom:12px;">
                    ${teamPlayers.map(p => `<option value="${p.id}">#${p.number} ${p.name}</option>`).join('')}
                </select>
                <button class="btn btn-primary" onclick="app.placeManualRunner()">確認放置跑者</button>
            `;
        }

        modal.classList.add('open');
    }

    execRunnerAction(action) {
        if (!this.selectedBaseKey) return;
        window.scorebook.handleRunnerAction(this.selectedBaseKey, action);
        if (action !== 'REMOVE') {
            const latestLog = window.scorebook.state?.playByPlay?.[0]?.text;
            if (latestLog) this.speakActionText(latestLog);
        }
        this.closeModal('runner-action-modal');
        this.renderScorebookView();
    }

    placeManualRunner() {
        const st = window.scorebook.state;
        if (!st || !this.selectedBaseKey) return;
        const pid = document.getElementById('manual-runner-select')?.value;
        const p = window.store.getPlayer(pid);
        if (p) {
            window.scorebook.pushHistory();
            st.bases[this.selectedBaseKey] = { playerId: p.id, teamId: p.teamId, name: p.name, number: p.number };
            window.scorebook.saveLiveState();
        }
        this.closeModal('runner-action-modal');
        this.renderScorebookView();
    }

    promptChangeBatter() {
        const st = window.scorebook.state;
        if (!st) return;
        const { isTop, battingTeam } = window.scorebook.getActiveTeams();
        const allTeamPlayers = window.store.getPlayersByTeam(battingTeam.id);
        const lineup = isTop ? st.awayLineup : st.homeLineup;
        const curBatterIdx = (isTop ? st.awayBatterIndex : st.homeBatterIndex) % Math.max(1, lineup.length);

        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = `🔢 排序【${battingTeam.emoji}${battingTeam.name}】本局打序 & 指定目前打者`;

        const unpicked = allTeamPlayers.filter(p => !lineup.includes(p.id));
        const nextOrderNum = lineup.length + 1;

        const rowsHTML = lineup.map((pid, idx) => {
            const p = window.store.getPlayer(pid);
            if (!p) return '';
            const isCurrent = (idx === curBatterIdx);
            return `
                <div style="display:flex;align-items:center;gap:8px;background:${isCurrent ? 'rgba(203,176,99,0.22)' : 'var(--bg-primary)'};padding:8px 10px;border-radius:8px;border:1.5px solid ${isCurrent ? 'var(--jj-gold)' : 'var(--border-color)'};margin-bottom:6px;">
                    <span style="background:linear-gradient(135deg,var(--jj-gold-light),var(--jj-gold));color:#061527;font-weight:900;font-size:0.76rem;padding:2px 8px;border-radius:6px;min-width:54px;text-align:center;">
                        第 ${idx + 1} 棒
                    </span>
                    <span class="num-tag">#${p.number}</span>
                    <strong>${p.name}</strong>
                    ${isCurrent ? '<span class="season-badge" style="background:#ef4444;color:#fff;border-color:#fff;">🔥目前打者</span>' : ''}
                    <div style="margin-left:auto;display:flex;gap:4px;">
                        ${!isCurrent ? `<button type="button" class="btn" style="padding:3px 8px;font-size:0.75rem;border-color:var(--jj-gold);color:var(--jj-gold-light);" onclick="app.setLiveBatterIndex(${idx})">🎯 設為目前打者</button>` : ''}
                        <button type="button" class="btn" style="padding:3px 7px;font-size:0.75rem;" onclick="app.moveLiveLineup(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.35;padding:3px 7px;"' : ''}>⬆️</button>
                        <button type="button" class="btn" style="padding:3px 7px;font-size:0.75rem;" onclick="app.moveLiveLineup(${idx}, 1)" ${idx === lineup.length - 1 ? 'disabled style="opacity:0.35;padding:3px 7px;"' : ''}>⬇️</button>
                        <button type="button" class="btn btn-danger" style="padding:3px 7px;font-size:0.75rem;" onclick="app.removeLiveLineupPlayer('${pid}')">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        const unpickedHTML = unpicked.length > 0 ? `
            <div style="margin-top:10px;padding:10px;background:rgba(6,21,39,0.65);border:1px dashed var(--jj-gold);border-radius:8px;">
                <div style="font-size:0.8rem;color:var(--jj-gold-light);font-weight:800;margin-bottom:6px;">
                    👇 點擊下方球員，依序排入【第 ${nextOrderNum} 棒】：
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${unpicked.map(p => `
                        <button type="button" class="btn" style="padding:6px 10px;font-size:0.82rem;" onclick="app.addLiveLineupPlayer('${p.id}')">
                            ➕ #${p.number} ${p.name}
                        </button>
                    `).join('')}
                </div>
            </div>
        ` : '';

        const canEditLivePlayer = Boolean(st.isExternal || (battingTeam.id && battingTeam.id.startsWith('OPP')));
        const curBatterPid = lineup[curBatterIdx] || lineup[0];
        const curBatterObj = curBatterPid ? window.store.getPlayer(curBatterPid) : null;
        const editSectionHTML = canEditLivePlayer ? `
            <div style="margin-top:14px;padding:12px;background:rgba(56,189,248,0.1);border:1.5px solid #38bdf8;border-radius:10px;">
                <div style="font-size:0.84rem;font-weight:800;color:#7dd3fc;margin-bottom:8px;">
                    ✏️ 現場即時更正/補填打者姓名與背號
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <select id="live-edit-player-target" class="form-control" style="flex:1.2;min-width:140px;" onchange="app.onLiveEditPlayerTargetChange(this.value)">
                        ${lineup.map(pid => {
                            const p = window.store.getPlayer(pid);
                            return `<option value="${pid}" ${pid === curBatterPid ? 'selected' : ''}>#${p ? p.number : ''} ${p ? p.name : pid}</option>`;
                        }).join('')}
                    </select>
                    <input type="text" id="live-edit-player-num" class="form-control" style="width:70px;" placeholder="背號" value="${curBatterObj ? curBatterObj.number : ''}">
                    <input type="text" id="live-edit-player-name" class="form-control" style="flex:1;min-width:110px;" placeholder="選手姓名" value="${curBatterObj ? curBatterObj.name : ''}">
                    <button type="button" class="btn btn-primary" style="white-space:nowrap;padding:6px 12px;font-size:0.82rem;" onclick="app.submitInGamePlayerEdit()">
                        儲存更名
                    </button>
                </div>
            </div>
        ` : '';

        body.innerHTML = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                <button type="button" class="btn" onclick="app.clearLiveLineupForTap()">👆 清空重排（依點擊順序決定 1~N 棒）</button>
                <button type="button" class="btn" onclick="app.shuffleLiveLineup()">🎲 隨機洗牌重排打序</button>
            </div>
            <div style="max-height:360px;overflow-y:auto;">
                ${rowsHTML || '<div style="padding:14px;text-align:center;color:var(--text-secondary);">請點擊下方球員依序排入第 1 棒、第 2 棒...</div>'}
                ${unpickedHTML}
            </div>
            ${editSectionHTML}
            <div style="margin-top:14px;display:flex;justify-content:flex-end;">
                <button type="button" class="btn btn-primary" onclick="app.closeModal('runner-action-modal');app.renderScorebookView();">✅ 完成打序調整</button>
            </div>
        `;
        modal.classList.add('open');
    }

    onLiveEditPlayerTargetChange(pid) {
        const p = window.store.getPlayer(pid);
        const numInput = document.getElementById('live-edit-player-num');
        const nameInput = document.getElementById('live-edit-player-name');
        if (p) {
            if (numInput) numInput.value = p.number;
            if (nameInput) nameInput.value = p.name;
        }
    }

    submitInGamePlayerEdit() {
        const targetSel = document.getElementById('live-edit-player-target');
        const numInput = document.getElementById('live-edit-player-num');
        const nameInput = document.getElementById('live-edit-player-name');
        if (!targetSel || !nameInput) return;
        const oldId = targetSel.value;
        const newName = nameInput.value.trim();
        const newNumber = numInput ? numInput.value.trim() : '';
        if (!newName) {
            alert('請輸入選手姓名！');
            return;
        }
        window.scorebook.updateInGamePlayer(oldId, newName, newNumber);
        this.renderScorebookView();
        this.promptChangeBatter();
    }

    submitInGamePitcherEdit(pitcherId) {
        const numInput = document.getElementById('live-edit-pitcher-num');
        const nameInput = document.getElementById('live-edit-pitcher-name');
        if (!pitcherId || !nameInput) return;
        const newName = nameInput.value.trim();
        const newNumber = numInput ? numInput.value.trim() : '';
        if (!newName) {
            alert('請輸入投手姓名！');
            return;
        }
        window.scorebook.updateInGamePlayer(pitcherId, newName, newNumber);
        this.renderScorebookView();
        this.openChangePitcherModal();
    }

    setLiveBatterIndex(idx) {
        const st = window.scorebook.state;
        if (!st) return;
        window.scorebook.pushHistory();
        if (st.half === 'top') st.awayBatterIndex = idx;
        else st.homeBatterIndex = idx;
        window.scorebook.saveLiveState();
        this.promptChangeBatter();
        this.renderScorebookView();
    }

    moveLiveLineup(index, delta) {
        const st = window.scorebook.state;
        if (!st) return;
        const isTop = st.half === 'top';
        const lineup = isTop ? st.awayLineup : st.homeLineup;
        const target = index + delta;
        if (target < 0 || target >= lineup.length) return;
        window.scorebook.pushHistory();
        [lineup[index], lineup[target]] = [lineup[target], lineup[index]];
        window.scorebook.saveLiveState();
        this.promptChangeBatter();
        this.renderScorebookView();
    }

    removeLiveLineupPlayer(pid) {
        const st = window.scorebook.state;
        if (!st) return;
        window.scorebook.pushHistory();
        if (st.half === 'top') {
            st.awayLineup = st.awayLineup.filter(id => id !== pid);
            st.awayBatterIndex = 0;
        } else {
            st.homeLineup = st.homeLineup.filter(id => id !== pid);
            st.homeBatterIndex = 0;
        }
        window.scorebook.saveLiveState();
        this.promptChangeBatter();
        this.renderScorebookView();
    }

    addLiveLineupPlayer(pid) {
        const st = window.scorebook.state;
        if (!st) return;
        window.scorebook.pushHistory();
        const lineup = st.half === 'top' ? st.awayLineup : st.homeLineup;
        if (!lineup.includes(pid)) {
            lineup.push(pid);
            window.scorebook.ensureBatterLine(pid);
        }
        window.scorebook.saveLiveState();
        this.promptChangeBatter();
        this.renderScorebookView();
    }

    clearLiveLineupForTap() {
        const st = window.scorebook.state;
        if (!st) return;
        window.scorebook.pushHistory();
        if (st.half === 'top') {
            st.awayLineup = [];
            st.awayBatterIndex = 0;
        } else {
            st.homeLineup = [];
            st.homeBatterIndex = 0;
        }
        window.scorebook.saveLiveState();
        this.promptChangeBatter();
        this.renderScorebookView();
    }

    shuffleLiveLineup() {
        const st = window.scorebook.state;
        if (!st) return;
        window.scorebook.pushHistory();
        const { isTop, battingTeam } = window.scorebook.getActiveTeams();
        const allIds = window.store.getPlayersByTeam(battingTeam.id).map(p => p.id);
        for (let i = allIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allIds[i], allIds[j]] = [allIds[j], allIds[i]];
        }
        if (isTop) {
            st.awayLineup = allIds;
            st.awayBatterIndex = 0;
        } else {
            st.homeLineup = allIds;
            st.homeBatterIndex = 0;
        }
        window.scorebook.saveLiveState();
        this.promptChangeBatter();
        this.renderScorebookView();
    }

    openChangePitcherModal() {
        const st = window.scorebook.state;
        if (!st) return;
        const { battingTeam, fieldingTeam, pitcherTeam } = window.scorebook.getActiveTeams();
        const activePitcherTeam = pitcherTeam || battingTeam;
        const { pitcher } = window.scorebook.getCurrentMatchup();
        const players = window.store.getPlayersByTeam(activePitcherTeam.id);

        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');
        title.textContent = `🔄 更換【${activePitcherTeam.emoji}${activePitcherTeam.name}】場上投手`;
        const canEditPitcher = Boolean(st.isExternal || (activePitcherTeam.id && activePitcherTeam.id.startsWith('OPP')));
        const pitcherEditHTML = canEditPitcher ? `
            <div style="margin-top:14px;padding:12px;background:rgba(56,189,248,0.1);border:1.5px solid #38bdf8;border-radius:10px;">
                <div style="font-size:0.84rem;font-weight:800;color:#7dd3fc;margin-bottom:8px;">
                    ✏️ 現場即時更正/補填目前場上投手姓名與背號
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <input type="text" id="live-edit-pitcher-num" class="form-control" style="width:70px;" placeholder="背號" value="${pitcher ? pitcher.number : ''}">
                    <input type="text" id="live-edit-pitcher-name" class="form-control" style="flex:1;min-width:110px;" placeholder="投手姓名" value="${pitcher ? pitcher.name : ''}">
                    <button type="button" class="btn btn-primary" style="white-space:nowrap;padding:6px 12px;font-size:0.82rem;" onclick="app.submitInGamePitcherEdit('${pitcher ? pitcher.id : ''}')">
                        儲存更名
                    </button>
                </div>
            </div>
        ` : '';

        body.innerHTML = `
            <div class="form-group" style="margin-bottom:12px;">
                <label>選擇【${activePitcherTeam.name}】接替登板投球的隊員：</label>
                <select id="new-pitcher-select" class="form-control">
                    ${players.map(p => `<option value="${p.id}" ${pitcher && p.id === pitcher.id ? 'selected' : ''}>#${p.number} ${p.name} (${p.pos})</option>`).join('')}
                </select>
            </div>
            <button class="btn btn-primary" onclick="app.confirmChangePitcher()">確認換投</button>
            ${pitcherEditHTML}
        `;
        modal.classList.add('open');
    }

    confirmChangePitcher() {
        const pid = document.getElementById('new-pitcher-select')?.value;
        if (pid) window.scorebook.changePitcher(pid);
        this.closeModal('runner-action-modal');
        this.renderScorebookView();
    }

    openFinalizeGameModal(mode = 'normal') {
        const rawSt = window.scorebook.state;
        if (!rawSt) {
            alert('目前沒有正在進行中的比賽可結算！');
            return;
        }
        const st = window.scorebook.normalizeState ? window.scorebook.normalizeState(rawSt) : rawSt;
        this._pendingFinalizeState = JSON.parse(JSON.stringify(st));
        try {
            localStorage.setItem('JJ_PENDING_FINALIZE_BACKUP', JSON.stringify(st));
        } catch (e) {}

        const isRulingMode = mode === 'ruling';
        const awayTeam = window.store.getTeam(st.awayTeamId, st.opponentName);
        const homeTeam = window.store.getTeam(st.homeTeamId, st.opponentName);
        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = isRulingMode
            ? '⚖️ 直接結束比賽（由紀錄組決定最終勝負）'
            : '🏁 結束比賽並結算兩隊成績入庫';

        let defaultOverride = '';
        if (isRulingMode) {
            if (st.awayTeamId === 'JJ') defaultOverride = 'away';
            else if (st.homeTeamId === 'JJ') defaultOverride = 'home';
            else defaultOverride = 'away';
        }
        const defaultNote = isRulingMode ? '對手棄賽' : '';

        const suggestedOutcome = StatsEngine.getGameOutcome({
            awayScore: st.awayScore,
            homeScore: st.homeScore,
            resultOverride: defaultOverride,
            rulingNote: defaultNote
        });
        const winTeamId = suggestedOutcome.winner === 'away' ? st.awayTeamId : (suggestedOutcome.winner === 'home' ? st.homeTeamId : '');
        const loseTeamId = suggestedOutcome.winner === 'away' ? st.homeTeamId : (suggestedOutcome.winner === 'home' ? st.awayTeamId : '');

        const allPitcherIds = Array.from(new Set([
            ...(Array.isArray(st.pitcherOrder) ? st.pitcherOrder : []),
            ...Object.keys(st.pitchingStats || {})
        ]));

        const pitcherRows = allPitcherIds.map(pid => {
            const p = window.store.getPlayer(pid) || { name: '投手', number: '' };
            const pl = (st.pitchingStats || {})[pid];
            if (!pl) return '';
            const tm = window.store.getTeam(pl.teamId, st.opponentName);
            // 預設自動預選勝投/敗投方便教練一鍵確認
            let defaultDec = pl.decision || '';
            if (!defaultDec && winTeamId && loseTeamId) {
                if (pl.teamId === winTeamId && pl.gs) defaultDec = 'W';
                else if (pl.teamId === loseTeamId && pl.gs) defaultDec = 'L';
            }
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                    <span>${tm.emoji} <strong>#${p.number} ${p.name}</strong> (${StatsEngine.formatIP(pl.outs)}局, 失${pl.r}分, ${pl.so}K)</span>
                    <select class="form-control pitcher-decision-select" data-pid="${pid}" data-tid="${pl.teamId || ''}" data-gs="${pl.gs ? 1 : 0}" style="width:155px;">
                        <option value="" ${defaultDec === '' ? 'selected' : ''}>無勝敗/中繼</option>
                        <option value="W" ${defaultDec === 'W' ? 'selected' : ''}>勝投 (W)</option>
                        <option value="L" ${defaultDec === 'L' ? 'selected' : ''}>敗投 (L)</option>
                        <option value="SV" ${defaultDec === 'SV' ? 'selected' : ''}>救援成功 (SV)</option>
                        <option value="HLD" ${defaultDec === 'HLD' ? 'selected' : ''}>中繼成功 (HLD)</option>
                    </select>
                </div>
            `;
        }).join('');

        const reasonChips = ['對手棄賽', '對方人數不足棄權', '大會時間到裁定', '天雨裁定結束', '違反大會規定奪權比賽'];

        body.innerHTML = `
            <div style="background:var(--bg-primary);padding:14px;border-radius:10px;margin-bottom:14px;text-align:center;">
                <div style="font-size:0.85rem;color:var(--text-secondary);">${st.tournament}</div>
                <div style="font-size:1.35rem;font-weight:900;color:var(--cpbl-gold);margin-top:4px;">
                    ${awayTeam.emoji}${awayTeam.name} ${st.awayScore} : ${st.homeScore} ${homeTeam.emoji}${homeTeam.name}
                </div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px;">
                    （目前進度：${st.inning}局${st.half === 'top' ? '上' : '下'}，現場球員投打統計將會完整保留）
                </div>
            </div>

            <div style="background:${isRulingMode ? 'rgba(245,158,11,0.14)' : 'rgba(15,23,42,0.55)'};border:1.5px solid ${isRulingMode ? '#f59e0b' : 'var(--border-color)'};border-radius:12px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:0.88rem;font-weight:900;color:${isRulingMode ? '#fbbf24' : 'var(--jj-gold-light)'};margin-bottom:8px;">
                    ⚖️ 比賽勝負結果判定（如對手棄賽／奪權比賽，不依目前比數結算，請由此指定勝方）：
                </div>
                <select id="finalize-result-override" class="form-control" style="font-weight:800;margin-bottom:8px;" onchange="app.onFinalizeRulingChange()">
                    <option value="" ${defaultOverride === '' ? 'selected' : ''}>📊 依目前現場比數自動判定勝負（${awayTeam.name} ${st.awayScore} : ${st.homeScore} ${homeTeam.name}）</option>
                    <option value="away" ${defaultOverride === 'away' ? 'selected' : ''}>🏆 紀錄組裁定【客隊：${awayTeam.emoji}${awayTeam.name}】獲勝（不看現狀比數）</option>
                    <option value="home" ${defaultOverride === 'home' ? 'selected' : ''}>🏆 紀錄組裁定【主隊：${homeTeam.emoji}${homeTeam.name}】獲勝（不看現狀比數）</option>
                    <option value="tie" ${defaultOverride === 'tie' ? 'selected' : ''}>🤝 紀錄組裁定【雙方平手 / 和局】（不看現狀比數）</option>
                </select>
                <div id="finalize-ruling-note-wrap" style="display:${defaultOverride ? 'block' : 'none'};">
                    <label style="font-size:0.78rem;color:#fde68a;font-weight:700;display:block;margin-bottom:4px;">📝 裁定原因 / 備註（將顯示於戰績表與比賽紀錄）：</label>
                    <input type="text" id="finalize-ruling-note" class="form-control" value="${defaultNote}" placeholder="例如：對手棄賽、對方人數不足棄權、大會裁定..." style="margin-bottom:6px;">
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        ${reasonChips.map(r => `<button type="button" class="btn" style="padding:3px 9px;font-size:0.74rem;border-color:rgba(251,191,36,0.5);color:#fde68a;" onclick="app.setFinalizeRulingNote('${r}')">${r}</button>`).join('')}
                    </div>
                </div>
            </div>

            <div style="margin-bottom:16px;">
                <div style="font-size:0.85rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">設定本場兩隊出場投手之勝投 / 敗投 / 救援紀錄：</div>
                ${pitcherRows || '<p style="font-size:0.85rem;color:var(--text-secondary);">無投手紀錄</p>'}
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
                <button type="button" class="btn" onclick="app.closeModal('runner-action-modal')">繼續記錄比賽</button>
                <button type="button" class="btn ${isRulingMode ? '' : 'btn-primary'}" style="${isRulingMode ? 'background:linear-gradient(135deg,#f59e0b,#d97706);color:#061527;font-weight:900;border-color:#fde68a;' : ''}" onclick="app.confirmFinalizeGame()">
                    ${isRulingMode ? '⚖️ 確認裁定結束並更新戰績' : '✅ 確認結算並更新戰績與排行榜'}
                </button>
            </div>
        `;
        modal.classList.add('open');
    }

    setFinalizeRulingNote(note) {
        const input = document.getElementById('finalize-ruling-note');
        if (input) input.value = note || '';
    }

    onFinalizeRulingChange() {
        const sel = document.getElementById('finalize-result-override');
        const noteWrap = document.getElementById('finalize-ruling-note-wrap');
        const noteInput = document.getElementById('finalize-ruling-note');
        if (!sel) return;

        const override = sel.value || '';
        if (noteWrap) {
            noteWrap.style.display = override ? 'block' : 'none';
        }
        if (override && noteInput && !noteInput.value.trim()) {
            noteInput.value = '對手棄賽';
        }

        const st = this._pendingFinalizeState || window.scorebook?.state;
        if (!st) return;

        const outcome = StatsEngine.getGameOutcome({
            awayScore: st.awayScore,
            homeScore: st.homeScore,
            resultOverride: override
        });
        const winTeamId = outcome.winner === 'away' ? st.awayTeamId : (outcome.winner === 'home' ? st.homeTeamId : '');
        const loseTeamId = outcome.winner === 'away' ? st.homeTeamId : (outcome.winner === 'home' ? st.awayTeamId : '');

        document.querySelectorAll('.pitcher-decision-select').forEach(pSel => {
            const tid = pSel.getAttribute('data-tid') || '';
            const isGs = pSel.getAttribute('data-gs') === '1';
            if (!isGs) return;
            if (winTeamId && tid === winTeamId) pSel.value = 'W';
            else if (loseTeamId && tid === loseTeamId) pSel.value = 'L';
            else if (outcome.winner === 'tie') pSel.value = '';
        });
    }

    confirmFinalizeGame() {
        try {
            const decisions = {};
            document.querySelectorAll('.pitcher-decision-select').forEach(sel => {
                const pid = sel.getAttribute('data-pid');
                if (pid && sel.value) decisions[pid] = sel.value;
            });

            const resultOverride = document.getElementById('finalize-result-override')?.value || '';
            const rulingNote = resultOverride ? (document.getElementById('finalize-ruling-note')?.value || '').trim() : '';

            let backupState = this._pendingFinalizeState || null;
            if (!backupState) {
                try {
                    const rawBackup = localStorage.getItem('JJ_PENDING_FINALIZE_BACKUP') || localStorage.getItem('YOUTH_BASEBALL_JJ_LIVE_V5') || localStorage.getItem('YOUTH_BASEBALL_JJ_LIVE_V3');
                    if (rawBackup) backupState = JSON.parse(rawBackup);
                } catch (e) {}
            }

            const finished = window.scorebook.finalizeGame(decisions, backupState, { resultOverride, rulingNote });
            this._pendingFinalizeState = null;
            try { localStorage.removeItem('JJ_PENDING_FINALIZE_BACKUP'); } catch (e) {}

            this.closeModal('runner-action-modal');
            this.switchTab('toplist');
            this.refreshAll();

            if (finished) {
                const awayT = window.store.getTeam(finished.awayTeamId, finished.opponentName);
                const homeT = window.store.getTeam(finished.homeTeamId, finished.opponentName);
                const outcome = StatsEngine.getGameOutcome(finished);
                const rulingSummary = outcome.isRuling
                    ? `\n⚖️ 紀錄組裁定：${outcome.winner === 'away' ? `${awayT.name} 獲勝` : (outcome.winner === 'home' ? `${homeT.name} 獲勝` : '雙方平手/和局')}${outcome.rulingNote ? `（原因：${outcome.rulingNote}）` : ''}`
                    : '';
                alert(`🎉 比賽結算完成！\n【${awayT.name} ${finished.awayScore} : ${finished.homeScore} ${homeT.name}】${rulingSummary}\n已自動更新戰績榜與個人數據排行榜！`);
            }
        } catch (err) {
            console.error('結算比賽時發生錯誤:', err);
            alert('結算比賽時發生問題：' + err.message);
        }
    }

    cancelLiveGame() {
        const activeCh = window.scorebook ? window.scorebook.activeChannel : 'intra';
        const chName = (activeCh === 'external') ? '【🌏 對外代表隊比賽】' : '【🏟️ 校內比賽】';
        if (!confirm(`確定要放棄目前正在記錄中的 ${chName} 嗎？\n此動作僅會清除該頻道的暫存，另一頻道的比賽不會受到影響。`)) return;
        if (window.scorebook && typeof window.scorebook.cancelLiveGame === 'function') {
            window.scorebook.cancelLiveGame(activeCh);
        } else {
            window.scorebook.state = null;
            window.scorebook.saveLiveState();
        }
        this.refreshAll();
    }

    /* ======================================================================
       3. 球員交易中心、照片批次上傳與三隊名冊管理 (Trade Center, Photos & Roster)
       ====================================================================== */
    renderTradesAndRosterView() {
        this.renderTradeMachine();
        this.renderTradeHistoryLog();
        this.renderPhotoUploadWall();
        this.renderRosterTable();
    }

    goToPhotoUploadSection() {
        this.switchView('trades');
        setTimeout(() => {
            document.getElementById('photo-batch-upload-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    }

    renderPhotoUploadWall() {
        const wall = document.getElementById('photo-upload-wall-grid');
        if (!wall) return;
        const players = window.store.data.players || [];

        wall.innerHTML = players.map(p => {
            const team = window.store.getTeam(p.teamId);
            const hasUploaded = Boolean(p.photo && p.photo.trim() !== '');
            const src = this.getPlayerPhotoSrc(p);
            const fallbackUri = this.getFallbackAvatarDataUri(p);
            return `
                <div class="photo-wall-item ${hasUploaded ? 'has-photo' : ''}" onclick="app.promptSinglePlayerPhoto('${p.id}')" title="點擊單獨上傳或更換「${p.name}」的照片">
                    <img class="photo-wall-avatar" src="${src}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallbackUri}';">
                    <div class="photo-wall-name">${p.name}</div>
                    <div class="photo-wall-meta">${team.emoji}#${p.number} ${hasUploaded ? '✅已上傳' : '📷待上傳'}</div>
                </div>
            `;
        }).join('');
    }

    promptSinglePlayerPhoto(playerId) {
        this._singleUploadPlayerId = playerId;
        const inp = document.getElementById('single-player-photo-input');
        if (inp) {
            inp.value = '';
            inp.click();
        }
    }

    async handleSinglePlayerPhotoUpload(event) {
        const file = event.target.files?.[0];
        const pid = this._singleUploadPlayerId;
        if (!file || !pid) return;

        const p = window.store.getPlayer(pid);
        if (!p) return;

        try {
            const dataUrl = await this.compressImageFileToDataURL(file);
            p.photo = dataUrl;
            window.store.save();
            this.refreshAll();
            const statusBar = document.getElementById('photo-upload-status-bar');
            if (statusBar) {
                statusBar.style.display = 'block';
                statusBar.innerHTML = `✅ 已成功更新 <strong>#${p.number} ${p.name}</strong> 的個人大頭照，並自動同步至排行榜與雲端資料庫！`;
            }
        } catch (err) {
            alert('照片讀取失敗：' + err.message);
        }
    }

    async handleFolderPhotoUpload(event) {
        const files = Array.from(event.target.files || []).filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
        if (files.length === 0) return;

        const statusBar = document.getElementById('photo-upload-status-bar');
        if (statusBar) {
            statusBar.style.display = 'block';
            statusBar.innerHTML = `⏳ 正在處理並壓縮 ${files.length} 張照片，請稍候...`;
        }

        const players = window.store.data.players || [];
        let matchedCount = 0;
        const matchedNames = [];
        const unmatchedFiles = [];

        for (const file of files) {
            // 去除副檔名，例如 "賴冠融.jpg" -> "賴冠融"，或支援 "10_賴冠融.png" / "賴冠融10.jpg"
            const rawBase = file.name.replace(/\.[^/.]+$/, '').trim();
            const cleanedName = rawBase.replace(/^[0-9#_\-\s]+|[0-9#_\-\s]+$/g, '').trim();

            const targetPlayer = players.find(p =>
                p.name === rawBase ||
                p.name === cleanedName ||
                rawBase.includes(p.name)
            );

            if (targetPlayer) {
                try {
                    const dataUrl = await this.compressImageFileToDataURL(file);
                    targetPlayer.photo = dataUrl;
                    matchedCount++;
                    matchedNames.push(`${targetPlayer.name}(#${targetPlayer.number})`);
                } catch (e) {
                    unmatchedFiles.push(file.name);
                }
            } else {
                unmatchedFiles.push(file.name);
            }
        }

        window.store.save();
        this.refreshAll();

        if (statusBar) {
            const unmatchedHint = unmatchedFiles.length > 0
                ? `<div style="margin-top:4px;color:#fbbf24;font-size:0.8rem;">⚠️ 未能自動配對的檔名（共 ${unmatchedFiles.length} 個，請確認檔名是否與球員姓名相同）：${unmatchedFiles.slice(0, 10).join('、')}${unmatchedFiles.length > 10 ? '...' : ''}</div>`
                : '';
            statusBar.innerHTML = `
                🎉 <strong>批次上傳完成！成功配對並更新 ${matchedCount} 位選手的照片！</strong>（已自動同步至排行榜與 Firebase 雲端）
                <div style="margin-top:4px;font-size:0.8rem;color:#cbd5e1;">✅ 已更新選手：${matchedNames.join('、') || '無'}</div>
                ${unmatchedHint}
            `;
        }

        event.target.value = '';
    }

    compressImageFileToDataURL(file, maxWidth = 260, maxHeight = 320, quality = 0.82) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('無法讀取圖片檔案'));
            reader.onload = e => {
                const img = new Image();
                img.onerror = () => reject(new Error('圖片格式無法解析'));
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = maxWidth;
                    canvas.height = maxHeight;
                    const ctx = canvas.getContext('2d');

                    // 白底（避免透明 PNG 轉 JPEG 變黑底）
                    ctx.fillStyle = '#f4f6f9';
                    ctx.fillRect(0, 0, maxWidth, maxHeight);

                    // 置中裁切 (object-fit: cover 偏上對齊人像頭部)
                    const imgRatio = img.width / img.height;
                    const targetRatio = maxWidth / maxHeight;
                    let sx = 0, sy = 0, sw = img.width, sh = img.height;

                    if (imgRatio > targetRatio) {
                        sw = img.height * targetRatio;
                        sx = (img.width - sw) / 2;
                    } else {
                        sh = img.width / targetRatio;
                        sy = Math.max(0, (img.height - sh) * 0.15); // 保留上方頭部與球帽
                    }

                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, maxWidth, maxHeight);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    renderTradeMachine() {
        const teams = window.store.data.teams || [];
        const selA = document.getElementById('trade-team-a');
        const selB = document.getElementById('trade-team-b');
        if (!selA || !selB) return;

        if (selA.options.length === 0) {
            selA.innerHTML = teams.map((t, i) => `<option value="${t.id}" ${i === 0 ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('');
            selB.innerHTML = teams.map((t, i) => `<option value="${t.id}" ${i === 1 ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('');
        }

        const teamAId = selA.value || 't1';
        const teamBId = selB.value || 't2';
        const listA = document.getElementById('trade-players-a');
        const listB = document.getElementById('trade-players-b');

        if (listA) {
            const playersA = window.store.getPlayersByTeam(teamAId);
            listA.innerHTML = playersA.map(p => `
                <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border-color);cursor:pointer;">
                    <input type="checkbox" class="trade-cb-a" value="${p.id}" style="width:17px;height:17px;">
                    <span class="num-tag">#${p.number}</span>
                    <strong>${p.name}</strong>
                    <span style="margin-left:auto;font-size:0.76rem;color:var(--text-secondary);">${p.pos}</span>
                </label>
            `).join('') || '<div style="color:var(--text-secondary);font-size:0.85rem;">該隊目前無球員</div>';
        }

        if (listB) {
            const playersB = window.store.getPlayersByTeam(teamBId);
            listB.innerHTML = playersB.map(p => `
                <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border-color);cursor:pointer;">
                    <input type="checkbox" class="trade-cb-b" value="${p.id}" style="width:17px;height:17px;">
                    <span class="num-tag">#${p.number}</span>
                    <strong>${p.name}</strong>
                    <span style="margin-left:auto;font-size:0.76rem;color:var(--text-secondary);">${p.pos}</span>
                </label>
            `).join('') || '<div style="color:var(--text-secondary);font-size:0.85rem;">該隊目前無球員</div>';
        }
    }

    executeTrade() {
        const teamAId = document.getElementById('trade-team-a')?.value;
        const teamBId = document.getElementById('trade-team-b')?.value;
        if (teamAId === teamBId) {
            alert('請選擇兩支不同的隊伍進行交易！');
            return;
        }

        const checkedA = Array.from(document.querySelectorAll('.trade-cb-a:checked')).map(cb => cb.value);
        const checkedB = Array.from(document.querySelectorAll('.trade-cb-b:checked')).map(cb => cb.value);

        if (checkedA.length === 0 && checkedB.length === 0) {
            alert('請至少勾選 1 位要交易或轉隊的球員！');
            return;
        }

        const teamA = window.store.getTeam(teamAId);
        const teamB = window.store.getTeam(teamBId);
        const note = document.getElementById('trade-note')?.value.trim() || '隊內戰力平衡交易調整';

        const fromPlayers = [];
        const toPlayers = [];

        checkedA.forEach(pid => {
            const p = window.store.getPlayer(pid);
            if (p) {
                fromPlayers.push({ id: p.id, name: p.name, number: p.number });
                p.teamId = teamBId;
                p.note = `由${teamA.name}交易加盟 ｜ ` + (p.note || '');
            }
        });

        checkedB.forEach(pid => {
            const p = window.store.getPlayer(pid);
            if (p) {
                toPlayers.push({ id: p.id, name: p.name, number: p.number });
                p.teamId = teamAId;
                p.note = `由${teamB.name}交易加盟 ｜ ` + (p.note || '');
            }
        });

        if (!window.store.data.trades) window.store.data.trades = [];
        window.store.data.trades.unshift({
            id: 'tr_' + Date.now(),
            date: new Date().toISOString().slice(0, 10),
            type: (fromPlayers.length > 0 && toPlayers.length > 0) ? 'trade' : 'transfer',
            fromTeamId: teamAId,
            toTeamId: teamBId,
            fromPlayers,
            toPlayers,
            note
        });

        if (document.getElementById('trade-note')) document.getElementById('trade-note').value = '';
        window.store.save();
        this.refreshAll();
        alert('🔁 球員交易已完成！球員已移籍至新隊伍，且交易前在原隊伍的比賽數據均完整保留。');
    }

    renderTradeHistoryLog() {
        const container = document.getElementById('trade-history-list');
        if (!container) return;
        const trades = window.store.data.trades || [];
        if (trades.length === 0) {
            container.innerHTML = '<div style="color:var(--text-secondary);font-size:0.88rem;">尚無球員交易紀錄</div>';
            return;
        }

        container.innerHTML = trades.map(tr => {
            const tmA = window.store.getTeam(tr.fromTeamId);
            const tmB = window.store.getTeam(tr.toTeamId);
            const aNames = (tr.fromPlayers || []).map(p => `#${p.number} ${p.name}`).join('、');
            const bNames = (tr.toPlayers || []).map(p => `#${p.number} ${p.name}`).join('、');

            let descHTML = '';
            if (aNames && bNames) {
                descHTML = `${this.teamBadgeHTML(tmA.id)} 送出 <strong>${aNames}</strong> ⇄ 與 ${this.teamBadgeHTML(tmB.id)} 交換 <strong>${bNames}</strong>`;
            } else if (aNames) {
                descHTML = `${this.teamBadgeHTML(tmA.id)} 將 <strong>${aNames}</strong> 轉隊至 ${this.teamBadgeHTML(tmB.id)}`;
            } else {
                descHTML = `${this.teamBadgeHTML(tmB.id)} 將 <strong>${bNames}</strong> 轉隊至 ${this.teamBadgeHTML(tmA.id)}`;
            }

            return `
                <div style="background:var(--bg-primary);border-left:4px solid var(--cpbl-gold);padding:12px 14px;border-radius:8px;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text-secondary);margin-bottom:4px;">
                        <span>📅 ${tr.date} ｜ 聯盟官方交易異動公告</span>
                    </div>
                    <div style="font-size:0.95rem;color:#fff;margin-bottom:4px;">${descHTML}</div>
                    ${tr.note ? `<div style="font-size:0.8rem;color:var(--cpbl-gold-light);">💬 備註：${tr.note}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    renderRosterTable() {
        const tbody = document.getElementById('roster-list-tbody');
        if (!tbody) return;
        const players = window.store.data.players || [];

        const batMap = {};
        StatsEngine.getBattingStatsList(window.store.data).forEach(b => { batMap[b.playerId] = b; });
        const pitMap = {};
        StatsEngine.getPitchingStatsList(window.store.data).forEach(p => { pitMap[p.playerId] = p; });

        tbody.innerHTML = players.map(p => {
            const b = batMap[p.id] || { avg: 0, h: 0, hr: 0, rbi: 0, sb: 0 };
            const pt = pitMap[p.id] || { ipDisplay: '0.0', era: 0, so: 0 };
            const batThrowLabel = `${p.throws === 'L' ? '左投' : '右投'}${p.bats === 'L' ? '左打' : (p.bats === 'S' ? '左右開弓' : '右打')}`;
            return `
                <tr>
                    <td class="align-left">${this.teamBadgeHTML(p.teamId)}</td>
                    <td class="align-left"><span class="num-tag">#${p.number}</span></td>
                    <td class="align-left">
                        <strong style="cursor:pointer;color:var(--cpbl-gold-light);" onclick="app.openPlayerModal('${p.id}')">${p.name}</strong>
                    </td>
                    <td class="align-left">${p.grade || ''}</td>
                    <td class="align-left">${p.pos || ''}</td>
                    <td class="align-left">${batThrowLabel}</td>
                    <td>${StatsEngine.formatRate(b.avg)} (${b.h}安/${b.rbi}點)</td>
                    <td>${pt.ipDisplay}局 (${pt.so}K)</td>
                    <td class="align-left" style="color:var(--text-secondary);max-width:220px;overflow:hidden;text-overflow:ellipsis;">${p.note || ''}</td>
                    <td>
                        <button class="btn" style="padding:4px 8px;font-size:0.78rem;" onclick="app.openEditPlayerModal('${p.id}')">編輯/換隊</button>
                        <button class="btn btn-danger" style="padding:4px 8px;font-size:0.78rem;" onclick="app.deletePlayer('${p.id}')">刪除</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    openEditPlayerModal(playerId = null) {
        const p = playerId ? window.store.getPlayer(playerId) : null;
        const teams = window.store.data.teams || [];
        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = p ? `✏️ 編輯球員資料：#${p.number} ${p.name}` : '➕ 新增少棒隊球員並分發隊伍';
        body.innerHTML = `
            <div class="form-grid">
                <div class="form-group">
                    <label>所屬隊伍</label>
                    <select id="edit-p-team" class="form-control">
                        ${teams.map(t => `<option value="${t.id}" ${p && p.teamId === t.id ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>背號</label>
                    <input type="text" id="edit-p-number" class="form-control" value="${p ? p.number : ''}" placeholder="例如：10">
                </div>
                <div class="form-group">
                    <label>球員姓名</label>
                    <input type="text" id="edit-p-name" class="form-control" value="${p ? p.name : ''}" placeholder="請輸入姓名">
                </div>
                <div class="form-group">
                    <label>年級</label>
                    <select id="edit-p-grade" class="form-control">
                        ${['六年級', '五年級', '四年級', '三年級', '二年級', '一年級'].map(g =>
                            `<option value="${g}" ${p && p.grade === g ? 'selected' : ''}>${g}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>守備位置</label>
                    <input type="text" id="edit-p-pos" class="form-control" value="${p ? p.pos : 'P / IF'}" placeholder="例如：P / SS / CF">
                </div>
                <div class="form-group">
                    <label>投打習慣</label>
                    <div style="display:flex;gap:6px;">
                        <select id="edit-p-throws" class="form-control">
                            <option value="R" ${!p || p.throws === 'R' ? 'selected' : ''}>右投</option>
                            <option value="L" ${p && p.throws === 'L' ? 'selected' : ''}>左投</option>
                        </select>
                        <select id="edit-p-bats" class="form-control">
                            <option value="R" ${!p || p.bats === 'R' ? 'selected' : ''}>右打</option>
                            <option value="L" ${p && p.bats === 'L' ? 'selected' : ''}>左打</option>
                            <option value="S" ${p && p.bats === 'S' ? 'selected' : ''}>左右開弓</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="form-group" style="margin-bottom:16px;">
                <label>教練備註 / 球員特點</label>
                <input type="text" id="edit-p-note" class="form-control" value="${p ? (p.note || '') : ''}">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button class="btn" onclick="app.closeModal('runner-action-modal')">取消</button>
                <button class="btn btn-primary" onclick="app.savePlayerForm('${playerId || ''}')">💾 儲存球員</button>
            </div>
        `;
        modal.classList.add('open');
    }

    savePlayerForm(playerId) {
        const teamId = document.getElementById('edit-p-team')?.value || 't1';
        const number = document.getElementById('edit-p-number')?.value.trim() || '0';
        const name = document.getElementById('edit-p-name')?.value.trim();
        const grade = document.getElementById('edit-p-grade')?.value || '六年級';
        const pos = document.getElementById('edit-p-pos')?.value.trim() || 'IF';
        const throws = document.getElementById('edit-p-throws')?.value || 'R';
        const bats = document.getElementById('edit-p-bats')?.value || 'R';
        const note = document.getElementById('edit-p-note')?.value.trim() || '';

        if (!name) {
            alert('請輸入球員姓名！');
            return;
        }

        if (playerId) {
            const p = window.store.getPlayer(playerId);
            if (p) Object.assign(p, { teamId, number, name, grade, pos, throws, bats, note });
        } else {
            window.store.data.players.push({
                id: 'p_' + Date.now(),
                teamId, number, name, grade, pos, throws, bats, note
            });
        }

        window.store.save();
        this.closeModal('runner-action-modal');
        this.refreshAll();
    }

    deletePlayer(playerId) {
        const p = window.store.getPlayer(playerId);
        if (!confirm(`確定要刪除球員「${p ? p.name : ''}」嗎？`)) return;
        window.store.data.players = window.store.data.players.filter(x => x.id !== playerId);
        window.store.save();
        this.refreshAll();
    }

    /**
     * CPBL 風格個人球員卡（同時呈現隊內三隊數據、對外代表隊數據與逐場明細）
     */
    openPlayerModal(playerId) {
        const p = window.store.getPlayer(playerId);
        if (!p) return;

        const mode = this.dataMode || 'intra';
        const bat = StatsEngine.getBattingStatsList(window.store.data, 'ALL', mode).find(x => x.playerId === playerId);
        const batIntra = StatsEngine.getBattingStatsList(window.store.data, 'ALL', 'intra').find(x => x.playerId === playerId);
        const batExt = StatsEngine.getBattingStatsList(window.store.data, 'ALL', 'external').find(x => x.playerId === playerId);
        const pitIntra = StatsEngine.getPitchingStatsList(window.store.data, 'ALL', 'intra').find(x => x.playerId === playerId);
        const pitExt = StatsEngine.getPitchingStatsList(window.store.data, 'ALL', 'external').find(x => x.playerId === playerId);
        const currentTeam = window.store.getTeam(p.teamId);

        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = `⚾ 球員個人數據卡：#${p.number} ${p.name}`;

        // 隊內 vs 對外雙軌總覽對照表
        const dualModeHTML = `
            <h4 style="color:var(--cpbl-gold-light);margin-bottom:6px;">📊 隊內聯賽 vs 對外代表隊 雙軌成績總覽</h4>
            <div class="table-scroll-wrapper" style="margin-bottom:14px;">
                <table class="cpbl-table">
                    <thead>
                        <tr>
                            <th class="align-left">賽事分類</th>
                            <th>出賽G</th><th>打數AB</th><th>安打H</th><th>打擊率AVG</th><th>全壘HR</th><th>打點RBI</th><th>盜壘SB</th><th>攻擊OPS</th>
                            <th>投球IP</th><th>奪三振K</th><th>防禦率ERA</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="${mode === 'intra' ? 'background:rgba(212,175,55,0.12);' : ''}">
                            <td class="align-left"><strong>🏟️ 隊內三隊賽</strong></td>
                            <td>${batIntra ? batIntra.g : 0}</td>
                            <td>${batIntra ? batIntra.ab : 0}</td>
                            <td><strong>${batIntra ? batIntra.h : 0}</strong></td>
                            <td><strong>${StatsEngine.formatRate(batIntra ? batIntra.avg : 0)}</strong></td>
                            <td>${batIntra ? batIntra.hr : 0}</td>
                            <td>${batIntra ? batIntra.rbi : 0}</td>
                            <td>${batIntra ? batIntra.sb : 0}</td>
                            <td>${StatsEngine.formatRate(batIntra ? batIntra.ops : 0)}</td>
                            <td>${pitIntra ? pitIntra.ipDisplay : '0.0'}</td>
                            <td>${pitIntra ? pitIntra.so : 0}</td>
                            <td>${pitIntra && pitIntra.outs > 0 ? StatsEngine.formatERA(pitIntra.era) : '-'}</td>
                        </tr>
                        <tr style="${mode === 'external' ? 'background:rgba(52,211,153,0.14);' : ''}">
                            <td class="align-left"><strong style="color:#6ee7b7;">🌏 對外代表隊</strong></td>
                            <td>${batExt ? batExt.g : 0}</td>
                            <td>${batExt ? batExt.ab : 0}</td>
                            <td><strong>${batExt ? batExt.h : 0}</strong></td>
                            <td><strong style="color:#6ee7b7;">${StatsEngine.formatRate(batExt ? batExt.avg : 0)}</strong></td>
                            <td>${batExt ? batExt.hr : 0}</td>
                            <td>${batExt ? batExt.rbi : 0}</td>
                            <td>${batExt ? batExt.sb : 0}</td>
                            <td>${StatsEngine.formatRate(batExt ? batExt.ops : 0)}</td>
                            <td>${pitExt ? pitExt.ipDisplay : '0.0'}</td>
                            <td>${pitExt ? pitExt.so : 0}</td>
                            <td>${pitExt && pitExt.outs > 0 ? StatsEngine.formatERA(pitExt.era) : '-'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

        // 檢查交易前後各隊分段數據
        const splitTeams = Object.values(batIntra?.splitsByTeam || {});
        const splitHTML = splitTeams.length > 0 ? `
            <h4 style="color:var(--cpbl-gold-light);margin-bottom:6px;">🔁 隊內各隊時期分段打擊成績 (Team Splits)</h4>
            <div class="table-scroll-wrapper" style="margin-bottom:14px;">
                <table class="cpbl-table">
                    <thead>
                        <tr><th class="align-left">效力隊伍</th><th>出賽G</th><th>打數AB</th><th>安打H</th><th>打擊率AVG</th><th>全壘HR</th><th>打點RBI</th><th>盜壘SB</th></tr>
                    </thead>
                    <tbody>
                        ${splitTeams.map(sp => `
                            <tr>
                                <td class="align-left">${this.teamBadgeHTML(sp.teamId)}</td>
                                <td>${sp.g}</td><td>${sp.ab}</td><td>${sp.h}</td>
                                <td><strong>${StatsEngine.formatRate(sp.ab > 0 ? sp.h / sp.ab : 0)}</strong></td>
                                <td>${sp.hr}</td><td>${sp.rbi}</td><td>${sp.sb}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        ` : '';

        const gameLogs = [];
        (window.store.data.games || []).forEach(g => {
            const bLine = (g.battingStats || []).find(x => x.playerId === playerId);
            const pLine = (g.pitchingStats || []).find(x => x.playerId === playerId);
            if (bLine || pLine) gameLogs.push({ game: g, bLine, pLine });
        });

        const photoSrc = this.getPlayerPhotoSrc(p);
        const fallbackUri = this.getFallbackAvatarDataUri(p);
        const modeTagLabel = mode === 'external' ? '🌏 對外賽' : '🏟️ 隊內賽';

        body.innerHTML = `
            <div style="display:flex;align-items:center;gap:16px;background:var(--bg-primary);padding:16px;border-radius:12px;margin-bottom:16px;border:1px solid ${currentTeam.color};flex-wrap:wrap;">
                <div style="position:relative;width:82px;height:102px;border-radius:10px;overflow:hidden;border:2px solid ${currentTeam.color};background:#f4f6f9;flex-shrink:0;cursor:pointer;" onclick="app.promptSinglePlayerPhoto('${p.id}')" title="點擊更換選手照片">
                    <img src="${photoSrc}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;object-position:top center;" onerror="this.onerror=null;this.src='${fallbackUri}';">
                    <span style="position:absolute;bottom:3px;right:3px;background:rgba(16,52,92,0.9);color:var(--jj-gold-light);font-size:0.7rem;font-weight:900;padding:1px 5px;border-radius:4px;">#${p.number}</span>
                </div>
                <div style="flex:1;min-width:180px;">
                    <div style="font-size:1.3rem;font-weight:900;color:#fff;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        ${p.name} ${this.teamBadgeHTML(p.teamId)} <span class="season-badge">${p.grade || ''}</span>
                    </div>
                    <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">
                        守備位置：${p.pos} ｜ ${p.throws === 'L' ? '左投' : '右投'}${p.bats === 'L' ? '左打' : '右打'}
                    </div>
                    ${p.note ? `<div style="font-size:0.8rem;color:var(--cpbl-gold-light);margin-top:2px;">💡 ${p.note}</div>` : ''}
                    <div style="margin-top:8px;">
                        <button type="button" class="btn" style="padding:4px 10px;font-size:0.76rem;" onclick="app.promptSinglePlayerPhoto('${p.id}')">📷 上傳/更換此選手照片</button>
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;text-align:center;">
                <div style="background:var(--bg-secondary);padding:10px;border-radius:10px;">
                    <div style="font-size:0.75rem;color:var(--text-secondary);">${modeTagLabel} 打擊率 AVG</div>
                    <div style="font-size:1.35rem;font-weight:900;color:var(--cpbl-gold);">${StatsEngine.formatRate(bat ? bat.avg : 0)}</div>
                </div>
                <div style="background:var(--bg-secondary);padding:10px;border-radius:10px;">
                    <div style="font-size:0.75rem;color:var(--text-secondary);">${modeTagLabel} 安打 / 全壘打</div>
                    <div style="font-size:1.35rem;font-weight:900;color:#fff;">${bat ? bat.h : 0} / ${bat ? bat.hr : 0}</div>
                </div>
                <div style="background:var(--bg-secondary);padding:10px;border-radius:10px;">
                    <div style="font-size:0.75rem;color:var(--text-secondary);">${modeTagLabel} 打點 / 盜壘</div>
                    <div style="font-size:1.35rem;font-weight:900;color:#fff;">${bat ? bat.rbi : 0} / ${bat ? bat.sb : 0}</div>
                </div>
                <div style="background:var(--bg-secondary);padding:10px;border-radius:10px;">
                    <div style="font-size:0.75rem;color:var(--text-secondary);">${modeTagLabel} 攻擊指數 OPS</div>
                    <div style="font-size:1.35rem;font-weight:900;color:#34d399;">${StatsEngine.formatRate(bat ? bat.ops : 0)}</div>
                </div>
            </div>

            ${dualModeHTML}
            ${splitHTML}

            <h4 style="color:var(--cpbl-gold-light);margin-bottom:8px;">📅 逐場出賽明細 (Game Logs)</h4>
            <div class="table-scroll-wrapper">
                <table class="cpbl-table">
                    <thead>
                        <tr>
                            <th class="align-left">日期 / 對戰組合</th>
                            <th class="align-left">賽事類型</th>
                            <th>AB</th><th>H</th><th>HR</th><th>RBI</th><th>R</th><th>SB</th>
                            <th>投球IP</th><th>三振K</th><th>自責ER</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${gameLogs.map(item => {
                            const awayT = window.store.getTeam(item.game.awayTeamId);
                            const homeT = window.store.getTeam(item.game.homeTeamId);
                            const repTeamId = item.bLine?.teamId || item.pLine?.teamId || p.teamId;
                            const typeBadge = item.game.isExternal
                                ? `<span class="team-badge" style="background:#064e3b;border-color:#34d399;color:#a7f3d0;">🌏 對外代表隊</span>`
                                : this.teamBadgeHTML(repTeamId);
                            return `
                                <tr>
                                    <td class="align-left">${item.game.date} (${awayT.name} vs ${homeT.name})</td>
                                    <td class="align-left">${typeBadge}</td>
                                    <td>${item.bLine ? item.bLine.ab : '-'}</td>
                                    <td><strong>${item.bLine ? item.bLine.h : '-'}</strong></td>
                                    <td>${item.bLine ? item.bLine.hr : '-'}</td>
                                    <td>${item.bLine ? item.bLine.rbi : '-'}</td>
                                    <td>${item.bLine ? item.bLine.r : '-'}</td>
                                    <td>${item.bLine ? item.bLine.sb : '-'}</td>
                                    <td>${item.pLine ? StatsEngine.formatIP(item.pLine.outs) : '-'}</td>
                                    <td>${item.pLine ? item.pLine.so : '-'}</td>
                                    <td>${item.pLine ? item.pLine.er : '-'}</td>
                                </tr>
                            `;
                        }).join('') || '<tr><td colspan="11">尚無出賽紀錄</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        modal.classList.add('open');
    }

    /* ======================================================================
       4. 歷史比賽紀錄與賽後快速補登/修改 (Games History & Quick Box Entry)
       ====================================================================== */
    renderGamesHistoryView() {
        const container = document.getElementById('games-history-list');
        if (!container) return;

        const allGames = window.store.data.games || [];
        if (allGames.length === 0) {
            container.innerHTML = `<div style="padding:36px;text-align:center;color:var(--text-secondary);background:var(--bg-card);border-radius:16px;">尚無比賽紀錄，可點擊上方「🌏 補打對外比賽紀錄」、「🏟️ 補打隊內比賽紀錄」或「⚾ 前往實戰計分本」新增比賽！</div>`;
            return;
        }

        container.innerHTML = allGames.map(g => {
            const awayT = window.store.getTeam(g.awayTeamId, g.opponentName);
            const homeT = window.store.getTeam(g.homeTeamId, g.opponentName);
            const outcome = StatsEngine.getGameOutcome(g);
            const rawWinLabel = outcome.winner === 'away'
                ? `${awayT.emoji}${awayT.name} 勝`
                : (outcome.winner === 'home' ? `${homeT.emoji}${homeT.name} 勝` : '雙方平手');
            const winText = outcome.isRuling
                ? `⚖️ 裁定：${rawWinLabel}${outcome.rulingNote ? ` (${outcome.rulingNote})` : ''}`
                : rawWinLabel;
            const badgeStyle = outcome.isRuling
                ? 'background:rgba(245,158,11,0.22);color:#fde68a;border:1px solid #f59e0b;'
                : '';
            const typeTag = g.isExternal
                ? `<span style="background:linear-gradient(135deg,#065f46,#047857);color:#a7f3d0;padding:2px 8px;border-radius:999px;font-size:0.74rem;font-weight:900;border:1px solid #34d399;">🌏 對外比賽</span>`
                : `<span style="background:rgba(212,175,55,0.18);color:var(--jj-gold-light);padding:2px 8px;border-radius:999px;font-size:0.74rem;font-weight:900;border:1px solid rgba(212,175,55,0.4);">🏟️ 隊內三隊賽</span>`;

            return `
                <div class="game-history-card" style="${outcome.isRuling ? 'border-color:#f59e0b;' : (g.isExternal ? 'border-color:rgba(52,211,153,0.55);' : '')}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:6px;flex-wrap:wrap;">
                        <span style="font-size:0.8rem;color:var(--text-secondary);font-weight:700;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            ${typeTag} 📅 ${g.date} ｜ ${g.tournament}
                        </span>
                        <span class="game-result-badge win" style="${badgeStyle}">${winText}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-primary);padding:14px 16px;border-radius:12px;margin-bottom:12px;">
                        <div>
                            <div style="font-weight:800;font-size:1.02rem;color:${awayT.color};">${awayT.emoji} ${awayT.name} (客)</div>
                            <div style="font-size:0.76rem;color:var(--text-secondary);">${g.awayHits || 0} 安打 / ${g.awayErrors || 0} 失誤</div>
                        </div>
                        <div style="font-size:1.75rem;font-weight:900;color:var(--cpbl-gold);letter-spacing:1px;">
                            ${g.awayScore} : ${g.homeScore}
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:800;font-size:1.02rem;color:${homeT.color};">${homeT.emoji} ${homeT.name} (主)</div>
                            <div style="font-size:0.76rem;color:var(--text-secondary);">${g.homeHits || 0} 安打 / ${g.homeErrors || 0} 失誤</div>
                        </div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                        <button class="btn" style="flex:1;justify-content:center;" onclick="app.openGameBoxScoreModal('${g.id}')">📊 查看 Box 計分表</button>
                        <button class="btn" style="border-color:var(--jj-gold);color:var(--jj-gold-light);" onclick="app.openQuickBoxEntryModal('${g.id}')">✏️ 修改/補打數據</button>
                        <button class="btn btn-danger" onclick="app.deleteGame('${g.id}')">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    openGameBoxScoreModal(gameId) {
        const g = (window.store.data.games || []).find(x => x.id === gameId);
        if (!g) return;
        const awayT = window.store.getTeam(g.awayTeamId, g.opponentName);
        const homeT = window.store.getTeam(g.homeTeamId, g.opponentName);
        const outcome = StatsEngine.getGameOutcome(g);
        const rulingBannerText = outcome.isRuling
            ? ` ｜ <span style="color:#fbbf24;font-weight:900;">⚖️ 紀錄組裁定：${outcome.winner === 'away' ? `${awayT.name} 勝` : (outcome.winner === 'home' ? `${homeT.name} 勝` : '平手')}${outcome.rulingNote ? `（${outcome.rulingNote}）` : ''}</span>`
            : '';
        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = `📊 單場計分表：${awayT.emoji}${awayT.name} vs ${homeT.emoji}${homeT.name} (${g.date})`;

        const batRows = (g.battingStats || []).filter(b => b.playerId !== 'opp_batter').map(b => {
            const p = window.store.getPlayer(b.playerId) || { name: '球員', number: '?', teamId: b.teamId };
            return `<tr>
                <td class="align-left">${this.teamBadgeHTML(g.isExternal ? p.teamId : b.teamId)}</td>
                <td class="align-left">#${p.number} ${p.name}</td>
                <td>${b.pa}</td><td>${b.ab}</td><td><strong>${b.h}</strong></td>
                <td>${b.b2}</td><td>${b.b3}</td><td>${b.hr}</td>
                <td><strong>${b.rbi}</strong></td><td>${b.r}</td><td>${b.bb}</td><td>${b.so}</td><td>${b.sb}</td>
            </tr>`;
        }).join('');

        const pitRows = (g.pitchingStats || []).filter(pt => pt.playerId !== 'opp_batter').map(pt => {
            const p = window.store.getPlayer(pt.playerId) || { name: '投手', number: '?', teamId: pt.teamId };
            return `<tr>
                <td class="align-left">${this.teamBadgeHTML(g.isExternal ? p.teamId : pt.teamId)}</td>
                <td class="align-left">#${p.number} ${p.name} ${pt.decision ? `<span class="season-badge">${pt.decision}</span>` : ''}</td>
                <td><strong>${StatsEngine.formatIP(pt.outs)}</strong></td>
                <td>${pt.np}</td><td>${pt.h}</td><td>${pt.bb}</td><td><strong>${pt.so}</strong></td>
                <td>${pt.r}</td><td>${pt.er}</td>
            </tr>`;
        }).join('');

        body.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <div style="font-size:0.9rem;color:var(--text-secondary);">
                    ${g.isExternal ? '🌏 對外比賽紀錄' : '🏟️ 隊內三隊賽紀錄'} ｜ 終場比數：<strong style="color:var(--cpbl-gold-light);">${awayT.name} ${g.awayScore} : ${g.homeScore} ${homeT.name}</strong>${rulingBannerText}
                </div>
                <button class="btn btn-primary" style="padding:6px 12px;font-size:0.82rem;" onclick="app.openQuickBoxEntryModal('${g.id}')">
                    ✏️ 修改 / 補打本場選手數據
                </button>
            </div>
            <div style="margin-bottom:14px;">
                <h4 style="color:var(--cpbl-gold-light);margin-bottom:6px;">打擊成績 Box Score</h4>
                <div class="table-scroll-wrapper">
                    <table class="cpbl-table">
                        <thead>
                            <tr><th class="align-left">隊伍</th><th class="align-left">球員</th><th>PA</th><th>AB</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>R</th><th>BB</th><th>SO</th><th>SB</th></tr>
                        </thead>
                        <tbody>${batRows || '<tr><td colspan="13">無打擊明細</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
            <div style="margin-bottom:14px;">
                <h4 style="color:var(--cpbl-gold-light);margin-bottom:6px;">投手成績 Box Score</h4>
                <div class="table-scroll-wrapper">
                    <table class="cpbl-table">
                        <thead>
                            <tr><th class="align-left">隊伍</th><th class="align-left">投手</th><th>IP</th><th>用球NP</th><th>被安H</th><th>四壞BB</th><th>三振SO</th><th>失分R</th><th>自責ER</th></tr>
                        </thead>
                        <tbody>${pitRows || '<tr><td colspan="9">無投球明細</td></tr>'}</tbody>
                    </table>
                </div>
            </div>
        `;
        modal.classList.add('open');
    }

    deleteGame(gameId) {
        if (!confirm('確定要刪除這場比賽紀錄嗎？刪除後戰績與排行榜將自動重新計算。')) return;
        window.store.data.games = (window.store.data.games || []).filter(g => g.id !== gameId);
        window.store.save();
        this.refreshAll();
    }

    /**
     * 賽後補打紀錄 / 修改單場數據（同時支援「🌏 對外比賽」與「🏟️ 隊內三隊賽」，以及事後編輯既有比賽）
     */
    openQuickBoxEntryModal(editGameId = null, defaultType = null) {
        const teams = window.store.data.teams || [];
        const editGame = editGameId ? (window.store.data.games || []).find(g => g.id === editGameId) : null;

        this._qbEditGameId = editGame ? editGame.id : null;
        if (editGame) {
            this._qbGameType = editGame.isExternal ? 'external' : 'intra';
        } else if (defaultType) {
            this._qbGameType = defaultType === 'external' ? 'external' : 'intra';
        } else {
            this._qbGameType = this.dataMode === 'external' ? 'external' : 'intra';
        }
        this._qbTeamFilter = 'ALL';
        this._qbSearchQuery = '';
        this._qbDraftStats = {};

        // 若是編輯既有比賽，預先載入該場所有球員投打數據至暫存草稿
        if (editGame) {
            (editGame.battingStats || []).forEach(b => {
                if (!b.playerId || b.playerId === 'opp_batter') return;
                this._qbDraftStats[b.playerId] = {
                    ...(this._qbDraftStats[b.playerId] || {}),
                    ab: b.ab || 0,
                    b1: b.b1 ?? Math.max(0, (b.h || 0) - (b.b2 || 0) - (b.b3 || 0) - (b.hr || 0)),
                    b2: b.b2 || 0,
                    b3: b.b3 || 0,
                    hr: b.hr || 0,
                    rbi: b.rbi || 0,
                    r: b.r || 0,
                    bb: b.bb || 0,
                    so: b.so || 0,
                    sb: b.sb || 0
                };
            });
            (editGame.pitchingStats || []).forEach(pt => {
                if (!pt.playerId || pt.playerId === 'opp_batter') return;
                this._qbDraftStats[pt.playerId] = {
                    ...(this._qbDraftStats[pt.playerId] || {}),
                    outs: pt.outs || 0,
                    np: pt.np || 0,
                    ph: pt.h || 0,
                    pbb: pt.bb || 0,
                    pso: pt.so || 0,
                    pr: pt.r ?? pt.er ?? 0,
                    er: pt.er || 0,
                    dec: pt.decision || ''
                };
            });
        }

        const isExt = this._qbGameType === 'external';
        const initDate = editGame ? editGame.date : new Date().toISOString().slice(0, 10);
        const initTour = editGame ? editGame.tournament : (isExt ? '對外友誼賽 / 盃賽' : '隊內三隊爭霸賽');

        let initOppName = '外校對手';
        let initJjSide = 'away';
        let initJjScore = 6;
        let initOppScore = 3;
        let initAwayTeam = 't1';
        let initHomeTeam = 't2';
        let initAwayScore = 5;
        let initHomeScore = 3;
        const initResultOverride = editGame?.resultOverride || '';
        const initRulingNote = editGame?.rulingNote || '';

        if (editGame) {
            if (editGame.isExternal) {
                const awayIsJJ = editGame.awayTeamId === 'JJ';
                initJjSide = awayIsJJ ? 'away' : 'home';
                initJjScore = awayIsJJ ? editGame.awayScore : editGame.homeScore;
                initOppScore = awayIsJJ ? editGame.homeScore : editGame.awayScore;
                const oppRaw = awayIsJJ ? editGame.homeTeamId : editGame.awayTeamId;
                initOppName = editGame.opponentName || String(oppRaw || '').replace(/^OPP:/, '') || '外校對手';
            } else {
                initAwayTeam = editGame.awayTeamId || 't1';
                initHomeTeam = editGame.homeTeamId || 't2';
                initAwayScore = editGame.awayScore ?? 5;
                initHomeScore = editGame.homeScore ?? 3;
            }
        }

        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = editGame
            ? `✏️ 修改/補打單場比賽數據（${editGame.date} ${editGame.tournament}）`
            : '📝 賽後補打比賽紀錄（現場來不及記，事後可隨時補打隊內或對外數據）';

        body.innerHTML = `
            <!-- 切換：對外比賽補打 vs 隊內三隊賽補打 -->
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;padding:10px 14px;background:var(--bg-primary);border-radius:12px;border:1px solid var(--border-color);">
                <div style="font-weight:900;color:var(--jj-gold-light);font-size:0.9rem;">
                    🎯 請選擇要補打的比賽類型：
                </div>
                <div class="mode-switch-capsule">
                    <button type="button" id="qb-type-external" class="mode-switch-btn ${isExt ? 'active' : ''}" onclick="app.setQuickBoxGameType('external')">
                        🌏 對外比賽數據（🦁 中正國小 vs 外校）
                    </button>
                    <button type="button" id="qb-type-intra" class="mode-switch-btn ${!isExt ? 'active' : ''}" onclick="app.setQuickBoxGameType('intra')">
                        🏟️ 隊內三隊賽（紅・藍・白隊）
                    </button>
                </div>
            </div>

            <div class="form-grid" style="margin-bottom:10px;">
                <div class="form-group">
                    <label>📅 比賽日期</label>
                    <input type="date" id="qb-date" class="form-control" value="${initDate}">
                </div>
                <div class="form-group">
                    <label>🏆 賽事 / 盃賽名稱</label>
                    <input type="text" id="qb-tournament" class="form-control" value="${initTour}">
                </div>
            </div>

            <!-- A. 對外比賽比數與對手設定 -->
            <div id="qb-ext-header-fields" class="form-grid" style="display:${isExt ? 'grid' : 'none'};margin-bottom:12px;padding:12px;background:rgba(6,78,59,0.25);border:1.5px solid #34d399;border-radius:12px;">
                <div class="form-group">
                    <label style="color:#6ee7b7;font-weight:900;">⚔️ 外校對手球隊名稱</label>
                    <input type="text" id="qb-opp-name" class="form-control" value="${initOppName}" placeholder="例如：福林國小、東園國小、日本交流隊">
                </div>
                <div class="form-group">
                    <label style="color:#6ee7b7;font-weight:900;">🧭 中正國小攻守位置</label>
                    <select id="qb-jj-side" class="form-control">
                        <option value="away" ${initJjSide === 'away' ? 'selected' : ''}>🚩 中正國小先攻 (客隊 Away)</option>
                        <option value="home" ${initJjSide === 'home' ? 'selected' : ''}>🏠 中正國小後攻 (主隊 Home)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label style="color:var(--jj-gold-light);font-weight:900;">🦁 中正國小總得分</label>
                    <input type="number" id="qb-jj-score" class="form-control" value="${initJjScore}" min="0">
                </div>
                <div class="form-group">
                    <label style="color:#fca5a5;font-weight:900;">⚔️ 外校對手總得分</label>
                    <input type="number" id="qb-opp-score" class="form-control" value="${initOppScore}" min="0">
                </div>
            </div>

            <!-- B. 隊內三隊賽比數與對戰隊伍設定 -->
            <div id="qb-intra-header-fields" class="form-grid" style="display:${!isExt ? 'grid' : 'none'};margin-bottom:12px;">
                <div class="form-group">
                    <label>🚩 先攻隊伍 (客隊) & 得分</label>
                    <div style="display:flex;gap:6px;">
                        <select id="qb-away-team" class="form-control" onchange="app.syncQuickBoxDomToDraft();app.renderQuickBoxPlayers()">
                            ${teams.map(t => `<option value="${t.id}" ${t.id === initAwayTeam ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('')}
                        </select>
                        <input type="number" id="qb-away-score" class="form-control" value="${initAwayScore}" min="0" style="width:78px;">
                    </div>
                </div>
                <div class="form-group">
                    <label>🏠 後攻隊伍 (主隊) & 得分</label>
                    <div style="display:flex;gap:6px;">
                        <select id="qb-home-team" class="form-control" onchange="app.syncQuickBoxDomToDraft();app.renderQuickBoxPlayers()">
                            ${teams.map(t => `<option value="${t.id}" ${t.id === initHomeTeam ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('')}
                        </select>
                        <input type="number" id="qb-home-score" class="form-control" value="${initHomeScore}" min="0" style="width:78px;">
                    </div>
                </div>
            </div>

            <!-- C. 紀錄組裁定勝負設定 (如對手棄賽／裁定勝負) -->
            <div class="form-grid" style="margin-bottom:12px;padding:10px 12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,191,36,0.4);border-radius:10px;">
                <div class="form-group" style="margin-bottom:0;">
                    <label style="color:#fde68a;font-weight:800;">⚖️ 比賽勝負判定方式</label>
                    <select id="qb-result-override" class="form-control" onchange="const w=document.getElementById('qb-ruling-note');if(w)w.disabled=!this.value;">
                        <option value="" ${initResultOverride === '' ? 'selected' : ''}>📊 依總得分自動判定勝負</option>
                        <option value="away" ${initResultOverride === 'away' ? 'selected' : ''}>🏆 紀錄組裁定【先攻客隊 (Away)】獲勝（不看比數）</option>
                        <option value="home" ${initResultOverride === 'home' ? 'selected' : ''}>🏆 紀錄組裁定【後攻主隊 (Home)】獲勝（不看比數）</option>
                        <option value="tie" ${initResultOverride === 'tie' ? 'selected' : ''}>🤝 紀錄組裁定【雙方平手 / 和局】（不看比數）</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label style="color:#fde68a;font-weight:800;">📝 裁定原因備註（選擇裁定時填寫）</label>
                    <input type="text" id="qb-ruling-note" class="form-control" value="${initRulingNote}" ${initResultOverride ? '' : 'disabled'} placeholder="例如：對手棄賽、大會裁定">
                </div>
            </div>

            <!-- 快速搜尋與分隊篩選列（只填有上場的選手即可，未填者自動忽略） -->
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;padding:8px 12px;background:var(--bg-secondary);border-radius:10px;">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span style="font-size:0.8rem;color:var(--jj-gold-light);font-weight:800;">🔍 篩選球員：</span>
                    <input type="text" id="qb-player-search" class="form-control" placeholder="輸入姓名或背號快速篩選..." style="width:190px;padding:5px 10px;font-size:0.82rem;" oninput="app.onQuickBoxFilterChange()">
                    <button type="button" class="btn" style="padding:4px 9px;font-size:0.76rem;" onclick="app.setQuickBoxTeamFilter('ALL')">全部</button>
                    ${teams.map(t => `<button type="button" class="btn" style="padding:4px 9px;font-size:0.76rem;" onclick="app.setQuickBoxTeamFilter('${t.id}')">${t.emoji}${t.name}</button>`).join('')}
                    <button type="button" class="btn" style="padding:4px 9px;font-size:0.76rem;border-color:var(--jj-gold);color:var(--jj-gold-light);" onclick="app.setQuickBoxTeamFilter('ACTIVE')">✅ 僅看已填數據</button>
                </div>
                <div style="font-size:0.76rem;color:var(--text-secondary);">
                    💡 只需填寫本場有出賽的選手即可（數值為 0 的選手不會計入出賽）
                </div>
            </div>

            <div class="table-scroll-wrapper" style="max-height:360px;overflow-y:auto;margin-bottom:14px;">
                <table class="cpbl-table">
                    <thead>
                        <tr>
                            <th class="align-left" style="position:sticky;left:0;z-index:2;background:#091e3a;">球員</th>
                            <th>打數<br>AB</th><th>一安<br>1B</th><th>二安<br>2B</th><th>三安<br>3B</th><th>全壘<br>HR</th>
                            <th>打點<br>RBI</th><th>得分<br>R</th><th>四死<br>BB</th><th>三振<br>SO</th><th>盜壘<br>SB</th>
                            <th style="border-left:2px solid var(--jj-gold);">投球出局<br><small>(3=1局)</small></th>
                            <th>用球<br>NP</th><th>被安<br>H</th><th>四死<br>BB</th><th>奪三振<br>K</th><th>失分<br>R</th><th>自責<br>ER</th><th>勝敗<br>結果</th>
                        </tr>
                    </thead>
                    <tbody id="qb-players-tbody"></tbody>
                </table>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                <span style="font-size:0.8rem;color:var(--jj-gold-light);">✨ 儲存後將立即更新排行榜、戰績與選手個人數據卡！</span>
                <div style="display:flex;gap:10px;">
                    <button class="btn" onclick="app.closeModal('runner-action-modal')">取消</button>
                    <button class="btn btn-primary" onclick="app.saveQuickBoxEntry()">💾 確認儲存本場比賽數據</button>
                </div>
            </div>
        `;
        this.renderQuickBoxPlayers();
        modal.classList.add('open');
    }

    setQuickBoxGameType(type) {
        this.syncQuickBoxDomToDraft();
        this._qbGameType = type === 'external' ? 'external' : 'intra';
        const isExt = this._qbGameType === 'external';

        document.getElementById('qb-type-external')?.classList.toggle('active', isExt);
        document.getElementById('qb-type-intra')?.classList.toggle('active', !isExt);

        const extFields = document.getElementById('qb-ext-header-fields');
        const intraFields = document.getElementById('qb-intra-header-fields');
        if (extFields) extFields.style.display = isExt ? 'grid' : 'none';
        if (intraFields) intraFields.style.display = !isExt ? 'grid' : 'none';

        const tourInput = document.getElementById('qb-tournament');
        if (tourInput && !this._qbEditGameId) {
            tourInput.value = isExt ? '對外友誼賽 / 盃賽' : '隊內三隊爭霸賽';
        }
        this.renderQuickBoxPlayers();
    }

    setQuickBoxTeamFilter(teamId) {
        this.syncQuickBoxDomToDraft();
        this._qbTeamFilter = teamId || 'ALL';
        this.renderQuickBoxPlayers();
    }

    onQuickBoxFilterChange() {
        this.syncQuickBoxDomToDraft();
        this._qbSearchQuery = (document.getElementById('qb-player-search')?.value || '').trim();
        this.renderQuickBoxPlayers();
    }

    syncQuickBoxDomToDraft() {
        if (!this._qbDraftStats) this._qbDraftStats = {};
        document.querySelectorAll('#qb-players-tbody tr').forEach(tr => {
            const pid = tr.getAttribute('data-pid');
            if (!pid) return;
            const d = {
                ab: Number(tr.querySelector('.q-ab')?.value) || 0,
                b1: Number(tr.querySelector('.q-b1')?.value) || 0,
                b2: Number(tr.querySelector('.q-b2')?.value) || 0,
                b3: Number(tr.querySelector('.q-b3')?.value) || 0,
                hr: Number(tr.querySelector('.q-hr')?.value) || 0,
                rbi: Number(tr.querySelector('.q-rbi')?.value) || 0,
                r: Number(tr.querySelector('.q-r')?.value) || 0,
                bb: Number(tr.querySelector('.q-bb')?.value) || 0,
                so: Number(tr.querySelector('.q-so')?.value) || 0,
                sb: Number(tr.querySelector('.q-sb')?.value) || 0,
                outs: Number(tr.querySelector('.q-outs')?.value) || 0,
                np: Number(tr.querySelector('.q-np')?.value) || 0,
                ph: Number(tr.querySelector('.q-ph')?.value) || 0,
                pbb: Number(tr.querySelector('.q-pbb')?.value) || 0,
                pso: Number(tr.querySelector('.q-pso')?.value) || 0,
                pr: Number(tr.querySelector('.q-pr')?.value) || 0,
                er: Number(tr.querySelector('.q-er')?.value) || 0,
                dec: tr.querySelector('.q-dec')?.value || ''
            };
            const hasAny = d.ab || d.b1 || d.b2 || d.b3 || d.hr || d.rbi || d.r || d.bb || d.so || d.sb || d.outs || d.np || d.ph || d.pbb || d.pso || d.pr || d.er || d.dec;
            if (hasAny) {
                this._qbDraftStats[pid] = d;
            } else {
                delete this._qbDraftStats[pid];
            }
        });
    }

    renderQuickBoxPlayers() {
        const tbody = document.getElementById('qb-players-tbody');
        if (!tbody) return;

        const isExt = this._qbGameType === 'external';
        let players = [];
        if (isExt) {
            // 對外賽選取名單中，A隊（tA）排在最前面！
            players = window.store.getPlayersByTeam('JJ');
        } else {
            const awayTeamId = document.getElementById('qb-away-team')?.value || 't1';
            const homeTeamId = document.getElementById('qb-home-team')?.value || 't2';
            players = [
                ...window.store.getPlayersByTeam(awayTeamId),
                ...window.store.getPlayersByTeam(homeTeamId)
            ];
        }

        // 依分隊篩選或僅看已填數據
        if (this._qbTeamFilter === 'ACTIVE') {
            players = players.filter(p => Boolean(this._qbDraftStats?.[p.id]));
        } else if (this._qbTeamFilter && this._qbTeamFilter !== 'ALL') {
            players = players.filter(p => p.teamId === this._qbTeamFilter);
        }

        // 依關鍵字搜尋（姓名或背號，支援 01 與 1）
        if (this._qbSearchQuery) {
            const q = this._qbSearchQuery.toLowerCase().trim();
            players = players.filter(p =>
                String(p.name || '').toLowerCase().includes(q) ||
                String(p.number || '') === q ||
                ('0' + String(p.number || '')) === q ||
                String(p.number || '').toLowerCase().includes(q)
            );
        }

        if (players.length === 0) {
            tbody.innerHTML = `<tr><td colspan="19" style="padding:20px;text-align:center;color:var(--text-secondary);">無符合篩選條件的球員，請切換篩選按鈕或清除搜尋文字。</td></tr>`;
            return;
        }

        tbody.innerHTML = players.map(p => {
            const d = this._qbDraftStats?.[p.id] || {};
            const hasVal = Boolean(this._qbDraftStats?.[p.id]);
            return `
                <tr data-pid="${p.id}" data-tid="${p.teamId}" style="${hasVal ? 'background:rgba(212,175,55,0.12);' : ''}">
                    <td class="align-left" style="position:sticky;left:0;z-index:1;background:#0a2240;white-space:nowrap;">
                        ${this.teamBadgeHTML(p.teamId)} <strong>#${p.number} ${p.name}</strong>
                    </td>
                    <td><input type="number" min="0" value="${d.ab || 0}" class="form-control q-ab" style="width:52px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.b1 || 0}" class="form-control q-b1" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.b2 || 0}" class="form-control q-b2" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.b3 || 0}" class="form-control q-b3" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.hr || 0}" class="form-control q-hr" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.rbi || 0}" class="form-control q-rbi" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.r || 0}" class="form-control q-r" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.bb || 0}" class="form-control q-bb" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.so || 0}" class="form-control q-so" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.sb || 0}" class="form-control q-sb" style="width:48px;padding:4px;"></td>
                    <td style="border-left:2px solid var(--jj-gold);"><input type="number" min="0" value="${d.outs || 0}" class="form-control q-outs" style="width:54px;padding:4px;" title="3出局=1局 (例如投2局填6)"></td>
                    <td><input type="number" min="0" value="${d.np || 0}" class="form-control q-np" style="width:52px;padding:4px;" placeholder="0"></td>
                    <td><input type="number" min="0" value="${d.ph || 0}" class="form-control q-ph" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.pbb || 0}" class="form-control q-pbb" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.pso || 0}" class="form-control q-pso" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.pr || 0}" class="form-control q-pr" style="width:48px;padding:4px;"></td>
                    <td><input type="number" min="0" value="${d.er || 0}" class="form-control q-er" style="width:48px;padding:4px;"></td>
                    <td>
                        <select class="form-control q-dec" style="width:62px;padding:4px;font-size:0.78rem;">
                            <option value="" ${!d.dec ? 'selected' : ''}>-</option>
                            <option value="W" ${d.dec === 'W' ? 'selected' : ''}>勝W</option>
                            <option value="L" ${d.dec === 'L' ? 'selected' : ''}>敗L</option>
                            <option value="SV" ${d.dec === 'SV' ? 'selected' : ''}>救SV</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    }

    saveQuickBoxEntry() {
        this.syncQuickBoxDomToDraft();
        const isExt = this._qbGameType === 'external';
        const date = document.getElementById('qb-date')?.value || new Date().toISOString().slice(0, 10);
        const tournament = document.getElementById('qb-tournament')?.value.trim() || (isExt ? '對外友誼賽 / 盃賽' : '隊內三隊爭霸賽');

        let awayTeamId, homeTeamId, awayScore, homeScore, opponentName = '';

        if (isExt) {
            opponentName = document.getElementById('qb-opp-name')?.value.trim() || '外校對手';
            const jjSide = document.getElementById('qb-jj-side')?.value || 'away';
            const jjScore = Number(document.getElementById('qb-jj-score')?.value) || 0;
            const oppScore = Number(document.getElementById('qb-opp-score')?.value) || 0;
            const oppTeamId = `OPP:${opponentName}`;
            awayTeamId = jjSide === 'away' ? 'JJ' : oppTeamId;
            homeTeamId = jjSide === 'away' ? oppTeamId : 'JJ';
            awayScore = jjSide === 'away' ? jjScore : oppScore;
            homeScore = jjSide === 'away' ? oppScore : jjScore;
        } else {
            awayTeamId = document.getElementById('qb-away-team')?.value;
            homeTeamId = document.getElementById('qb-home-team')?.value;
            if (awayTeamId === homeTeamId) {
                alert('先攻隊伍與後攻隊伍不可相同！');
                return;
            }
            awayScore = Number(document.getElementById('qb-away-score')?.value) || 0;
            homeScore = Number(document.getElementById('qb-home-score')?.value) || 0;
        }

        const battingStats = [];
        const pitchingStats = [];
        let awayHits = 0, homeHits = 0, oppPitcherHitsAllowed = 0;

        Object.entries(this._qbDraftStats || {}).forEach(([pid, d]) => {
            const p = window.store.getPlayer(pid);
            if (!p) return;
            const tid = isExt ? 'JJ' : p.teamId;

            const h = (d.b1 || 0) + (d.b2 || 0) + (d.b3 || 0) + (d.hr || 0);
            const ab = Math.max(d.ab || 0, h + (d.so || 0));
            const pa = ab + (d.bb || 0);

            if (tid === awayTeamId) awayHits += h;
            if (tid === homeTeamId) homeHits += h;

            if (pa > 0 || (d.r || 0) > 0 || (d.sb || 0) > 0 || (d.rbi || 0) > 0) {
                battingStats.push({
                    playerId: pid,
                    teamId: tid,
                    pa,
                    ab,
                    h,
                    b1: d.b1 || 0,
                    b2: d.b2 || 0,
                    b3: d.b3 || 0,
                    hr: d.hr || 0,
                    rbi: d.rbi || 0,
                    r: d.r || 0,
                    bb: d.bb || 0,
                    hbp: 0,
                    so: d.so || 0,
                    sac: 0,
                    sf: 0,
                    sb: d.sb || 0,
                    cs: 0,
                    roe: 0
                });
            }

            if ((d.outs || 0) > 0 || (d.pso || 0) > 0 || (d.er || 0) > 0 || (d.pr || 0) > 0 || (d.ph || 0) > 0 || (d.pbb || 0) > 0 || (d.np || 0) > 0 || d.dec) {
                const outs = d.outs || 0;
                const np = d.np > 0 ? d.np : outs * 5;
                const er = d.er || 0;
                const pr = Math.max(d.pr || 0, er);
                oppPitcherHitsAllowed += (d.ph || 0);
                pitchingStats.push({
                    playerId: pid,
                    teamId: tid,
                    gs: 1,
                    outs,
                    np,
                    strikes: Math.round(np * 0.62),
                    bf: outs + (d.ph || 0) + (d.pbb || 0),
                    h: d.ph || 0,
                    hr: 0,
                    bb: d.pbb || 0,
                    hbp: 0,
                    so: d.pso || 0,
                    wp: 0,
                    r: pr,
                    er,
                    decision: d.dec || ''
                });
            }
        });

        if (isExt) {
            if (awayTeamId.startsWith('OPP:')) awayHits = oppPitcherHitsAllowed;
            if (homeTeamId.startsWith('OPP:')) homeHits = oppPitcherHitsAllowed;
        }

        const resultOverrideRaw = document.getElementById('qb-result-override')?.value || '';
        const resultOverride = (resultOverrideRaw === 'away' || resultOverrideRaw === 'home' || resultOverrideRaw === 'tie') ? resultOverrideRaw : '';
        const rulingNote = resultOverride ? (document.getElementById('qb-ruling-note')?.value || '').trim() : '';

        const gameRecord = {
            id: this._qbEditGameId || ('g_' + Date.now()),
            date,
            tournament,
            isExternal: isExt,
            opponentName: isExt ? opponentName : '',
            awayTeamId,
            homeTeamId,
            awayScore,
            homeScore,
            resultOverride,
            rulingNote,
            awayHits,
            homeHits,
            awayErrors: 0,
            homeErrors: 0,
            innings: isExt ? 6 : 4,
            lineScore: { away: [awayScore], home: [homeScore] },
            battingStats,
            pitchingStats,
            playByPlay: []
        };

        if (this._qbEditGameId) {
            const idx = (window.store.data.games || []).findIndex(g => g.id === this._qbEditGameId);
            if (idx >= 0) {
                // 保留原本的逐球播報與局數明細（若有）
                gameRecord.playByPlay = window.store.data.games[idx].playByPlay || [];
                window.store.data.games[idx] = gameRecord;
            } else {
                window.store.data.games.unshift(gameRecord);
            }
        } else {
            window.store.data.games.unshift(gameRecord);
        }

        window.store.save();
        this.closeModal('runner-action-modal');
        // 自動切換主頁面數據模式至剛補打完成的模式，讓教練立刻看到更新後的排行榜與戰績
        this.setDataMode(isExt ? 'external' : 'intra');
    }

    /* ======================================================================
       5. 三隊名稱自訂、規則設定與跨裝置同步 (Settings View)
       ====================================================================== */
    renderSettingsView() {
        const s = window.store.data.settings || {};
        const teams = window.store.data.teams || [];
        const nameEl = document.getElementById('set-team-name');
        const seasonEl = document.getElementById('set-season-name');
        const eraEl = document.getElementById('set-era-base');
        const pitchWarnEl = document.getElementById('set-pitch-warn');

        if (nameEl) nameEl.value = s.leagueName || '';
        if (seasonEl) seasonEl.value = s.seasonName || '';
        if (eraEl) eraEl.value = String(s.eraInningsBase || 4);
        if (pitchWarnEl) pitchWarnEl.value = String(s.pitchLimitWarning || 50);

        const fbInput = document.getElementById('set-firebase-url');
        const fbStatus = document.getElementById('firebase-status-badge');
        if (fbInput) fbInput.value = window.store.firebaseDbUrl || '';
        if (fbStatus) {
            if (window.store.firebaseConnected) {
                fbStatus.innerHTML = '🟢 已連線至 Firebase 雲端即時資料庫（所有手機/平板/電腦即時同步中）';
                fbStatus.style.color = '#34d399';
            } else if (window.store.firebaseDbUrl) {
                fbStatus.innerHTML = '🟡 已填入網址，正在嘗試連線...（請確認 Firebase Rules 已設為公開讀寫）';
                fbStatus.style.color = '#fbbf24';
            } else {
                fbStatus.innerHTML = '⚪ 尚未設定 Firebase 雲端資料庫（目前使用本機 / 區域網路儲存）';
                fbStatus.style.color = 'var(--text-secondary)';
            }
        }

        const teamsEditBox = document.getElementById('settings-teams-edit-list');
        if (teamsEditBox) {
            teamsEditBox.innerHTML = teams.map(t => `
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
                    <input type="text" class="form-control set-t-emoji" data-tid="${t.id}" value="${t.emoji}" style="width:52px;text-align:center;">
                    <input type="text" class="form-control set-t-name" data-tid="${t.id}" value="${t.name}" placeholder="隊名">
                    <input type="color" class="set-t-color" data-tid="${t.id}" value="${t.color}" style="width:44px;height:38px;border:none;background:none;cursor:pointer;">
                </div>
            `).join('');
        }
    }

    async connectFirebaseFromUI() {
        let rawInput = document.getElementById('set-firebase-url')?.value.trim() || '';
        // 支援使用者直接貼上整段 firebaseConfig 程式碼，自動擷取 databaseURL
        const match = rawInput.match(/https:\/\/[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.(?:firebaseio\.com|firebasedatabase\.app)/);
        if (match) {
            rawInput = match[0];
            document.getElementById('set-firebase-url').value = rawInput;
        }

        if (!rawInput) {
            await window.store.setFirebaseUrl('');
            alert('已清除 Firebase 雲端連線設定。');
            return;
        }

        const ok = await window.store.setFirebaseUrl(rawInput);
        if (ok) {
            alert('🔥 成功連線至 Firebase 雲端即時資料庫！目前的三隊名單、比賽與交易紀錄已自動同步並備份至雲端！');
        }
        this.renderSettingsView();
    }

    downloadFirebaseConfigFile() {
        const url = window.store.firebaseDbUrl || document.getElementById('set-firebase-url')?.value.trim() || '';
        if (!url) {
            alert('請先在上方輸入您的 Firebase Realtime Database 網址！');
            return;
        }
        const content = `/**\n * 中正國小少棒隊 - Firebase 雲端即時資料庫設定檔\n */\nwindow.FIREBASE_DEFAULT_CONFIG = {\n    databaseURL: "${window.store.normalizeFirebaseUrl(url)}"\n};\n`;
        const blob = new Blob([content], { type: 'application/javascript;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'firebase-config.js';
        a.click();
    }

    saveSettings() {
        const s = window.store.data.settings;
        s.leagueName = document.getElementById('set-team-name')?.value.trim() || '國小少棒隊內三隊爭霸聯賽';
        s.seasonName = document.getElementById('set-season-name')?.value.trim() || '115學年度賽季';
        s.eraInningsBase = Number(document.getElementById('set-era-base')?.value) || 6;
        s.pitchLimitWarning = Number(document.getElementById('set-pitch-warn')?.value) || 65;

        document.querySelectorAll('.set-t-name').forEach(inp => {
            const tid = inp.getAttribute('data-tid');
            const tm = (window.store.data.teams || []).find(t => t.id === tid);
            if (tm) {
                tm.name = inp.value.trim() || tm.name;
                const emojiInp = document.querySelector(`.set-t-emoji[data-tid="${tid}"]`);
                const colorInp = document.querySelector(`.set-t-color[data-tid="${tid}"]`);
                if (emojiInp) tm.emoji = emojiInp.value.trim() || '⚾';
                if (colorInp) tm.color = colorInp.value || tm.color;
            }
        });

        window.store.save();
        this.refreshAll();
        alert('✅ 聯盟與三支球隊設定已儲存！');
    }

    exportJSONBackup() {
        const dataStr = JSON.stringify(window.store.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `少棒三隊聯賽備份_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importJSONBackup(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed && Array.isArray(parsed.teams) && Array.isArray(parsed.players)) {
                    window.store.data = parsed;
                    window.store.save();
                    this.refreshAll();
                    alert('✅ 成功匯入三隊聯盟資料、交易紀錄與比賽數據！');
                } else {
                    alert('❌ 檔案格式不正確。');
                }
            } catch (err) {
                alert('❌ 讀取失敗：' + err.message);
            }
        };
        reader.readAsText(file);
    }

    exportCSVStats() {
        const batList = StatsEngine.getBattingStatsList(window.store.data, this.teamFilter);
        const headers = ['目前隊伍', '背號', '姓名', '年級', '守位', '出賽G', '打席PA', '打數AB', '打擊率AVG', '安打H', '二安2B', '三安3B', '全壘打HR', '打點RBI', '得分R', '盜壘SB', '四壞BB', '三振SO', '上壘率OBP', '長打率SLG', 'OPS'];
        const rows = batList.map(b => [
            b.teamName, b.number, b.name, b.grade, b.pos, b.g, b.pa, b.ab,
            StatsEngine.formatRate(b.avg), b.h, b.b2, b.b3, b.hr, b.rbi, b.r, b.sb, b.bb, b.so,
            StatsEngine.formatRate(b.obp), StatsEngine.formatRate(b.slg), StatsEngine.formatRate(b.ops)
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(x => `"${x ?? ''}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `少棒三隊聯盟_打擊統計報表.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ==========================================
    // 對手秩序冊名單庫管理 (Opponent Roster Modal)
    // ==========================================

    openOpponentRosterModal(selectTeamName = null) {
        const list = window.store.getOpponentTeamsList ? window.store.getOpponentTeamsList() : [];
        const currentInput = document.getElementById('setup-opp-name')?.value.trim();
        this.oppModalCurrentTeam = selectTeamName || (currentInput && currentInput !== '外校對手' ? currentInput : '') || (list.length > 0 ? list[0] : '');
        this.renderOpponentRosterModal();
        document.getElementById('opponent-roster-modal')?.classList.add('open');
    }

    async handlePdfRosterUpload(event) {
        const files = event.target.files ? Array.from(event.target.files) : [];
        if (files.length === 0) return;

        const progressBar = document.getElementById('opp-pdf-progress-bar');
        const progressText = document.getElementById('opp-pdf-progress-text');
        const previewPanel = document.getElementById('opp-pdf-preview-panel');

        if (progressBar) progressBar.style.display = 'block';
        if (previewPanel) previewPanel.style.display = 'none';

        try {
            const parser = new PdfRosterParser();
            const allResults = [];

            for (let fIdx = 0; fIdx < files.length; fIdx++) {
                const file = files[fIdx];
                const isImage = (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|webp)$/i.test(file.name || '');

                if (progressText) {
                    progressText.textContent = files.length > 1
                        ? `⏳ 正在辨識第 ${fIdx + 1} / ${files.length} 個檔案（${file.name}）...`
                        : (isImage ? `⏳ 正在進行相片文字辨識 (OCR)...` : `⏳ 正在讀取並解析 PDF 秩序冊...`);
                }

                const fileResults = await parser.parseTournamentFile(file, info => {
                    if (progressText && info && info.message) {
                        progressText.textContent = files.length > 1
                            ? `⏳ [${fIdx + 1}/${files.length}] ${info.message}`
                            : `⏳ ${info.message}`;
                    }
                });

                if (Array.isArray(fileResults) && fileResults.length > 0) {
                    allResults.push(...fileResults);
                }
            }

            if (progressBar) progressBar.style.display = 'none';

            if (allResults.length === 0) {
                alert('⚠️ 未能從檔案中自動辨識出球隊與選手名冊。\n\n可能原因：相片角度過於傾斜、解析度不足，或 PDF 為無文字層之純圖檔。\n\n💡 建議：直接在手機 LINE 點開該張秩序冊相片，點右下角 [T] 文字辨識 ➔ 複製全部，再貼到下方的「⚡ 貼上 LINE / 文字名單」即可 1 秒 100% 精準解析！');
                return;
            }

            this.pdfParsedTeams = allResults;
            this.renderPdfPreviewPanel(allResults);

        } catch (err) {
            console.error('檔案解析失敗:', err);
            if (progressBar) progressBar.style.display = 'none';
            alert('❌ 檔案讀取或辨識失敗：' + (err.message || err));
        } finally {
            event.target.value = '';
        }
    }

    renderPdfPreviewPanel(teams) {
        const panel = document.getElementById('opp-pdf-preview-panel');
        const title = document.getElementById('opp-pdf-preview-title');
        const list = document.getElementById('opp-pdf-preview-list');
        if (!panel || !list) return;

        title.textContent = `🎉 成功辨識出 ${teams.length} 支隊伍！請勾選欲匯入的學校：`;
        list.innerHTML = teams.map((t, idx) => {
            const sampleNames = t.players.slice(0, 3).map(p => `#${p.number} ${p.name}`).join(', ');
            return `
                <div style="background:var(--bg-secondary);padding:8px 10px;border-radius:8px;border:1.5px solid #10b981;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:800;color:#6ee7b7;font-size:0.86rem;margin-bottom:3px;">
                        <input type="checkbox" class="pdf-import-cb" data-idx="${idx}" checked>
                        🏫 ${t.schoolName} (${t.players.length} 人)
                    </label>
                    <div style="font-size:0.75rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${sampleNames} ...
                    </div>
                </div>
            `;
        }).join('');

        panel.style.display = 'block';
    }

    toggleAllPdfPreviewTeams(checkAll) {
        document.querySelectorAll('.pdf-import-cb').forEach(cb => {
            cb.checked = checkAll;
        });
    }

    confirmImportPdfRosters() {
        if (!Array.isArray(this.pdfParsedTeams) || this.pdfParsedTeams.length === 0) return;
        const cbs = document.querySelectorAll('.pdf-import-cb:checked');
        const selectedIndices = Array.from(cbs).map(cb => parseInt(cb.getAttribute('data-idx'), 10));
        const selectedTeams = selectedIndices.map(idx => this.pdfParsedTeams[idx]).filter(Boolean);

        if (selectedTeams.length === 0) {
            alert('請至少勾選一所要匯入的隊伍！');
            return;
        }

        window.store.saveOpponentRostersBatch(selectedTeams);

        const previewPanel = document.getElementById('opp-pdf-preview-panel');
        if (previewPanel) previewPanel.style.display = 'none';

        this.oppModalCurrentTeam = selectedTeams[0].schoolName;
        this.renderOpponentRosterModal();
        this.populateOpponentPresets();
        this.updateSetupTeamLineups(true);

        alert(`✅ 成功匯入 ${selectedTeams.length} 支對手學校隊伍名冊！\n\n您現在可以在開賽下拉選單中直接選擇對手學校進行排棒。`);
    }

    clearAllOpponentTeamsFromModal() {
        const teams = window.store.getOpponentTeamsList ? window.store.getOpponentTeamsList() : [];
        if (teams.length === 0) {
            alert('目前名冊庫已經是空的囉！');
            return;
        }
        if (!confirm('確定要清空所有已預錄的對手學校名冊嗎？（此動作無法復原）')) return;
        window.store.clearAllOpponentRosters();
        this.oppModalCurrentTeam = '';
        this.renderOpponentRosterModal();
        this.populateOpponentPresets();
        this.updateSetupTeamLineups(true);
        alert('🗑️ 已清空所有對手學校名冊。');
    }

    renderOpponentRosterModal() {
        this.renderOpponentModalTeamsList();
        this.renderOpponentModalPlayersTable();
    }

    renderOpponentModalTeamsList() {
        const listEl = document.getElementById('opp-modal-teams-list');
        if (!listEl) return;
        const teams = window.store.getOpponentTeamsList ? window.store.getOpponentTeamsList() : [];
        listEl.innerHTML = teams.map(t => {
            const isCur = (t === this.oppModalCurrentTeam);
            const count = (window.store.getOpponentPlayers(t) || []).length;
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;background:${isCur ? 'rgba(56,189,248,0.22)' : 'var(--bg-secondary)'};padding:7px 10px;border-radius:8px;border:1.5px solid ${isCur ? '#38bdf8' : 'var(--border-color)'};cursor:pointer;" onclick="app.selectOpponentTeamInModal('${t}')">
                    <span style="font-weight:${isCur ? '900' : '600'};color:${isCur ? '#7dd3fc' : 'var(--text-primary)'};">
                        🏫 ${t}
                    </span>
                    <span style="font-size:0.75rem;color:var(--text-secondary);">
                        ${count} 位選手
                    </span>
                </div>
            `;
        }).join('') || '<div style="color:var(--text-secondary);font-size:0.8rem;padding:8px;">尚未有預錄的學校</div>';
    }

    selectOpponentTeamInModal(teamName) {
        this.oppModalCurrentTeam = teamName;
        this.renderOpponentRosterModal();
    }

    addNewOpponentTeamFromModal() {
        const input = document.getElementById('opp-modal-new-team-name');
        const name = input ? input.value.trim() : '';
        if (!name) {
            alert('請輸入學校名稱！');
            return;
        }
        if (!window.store.data.opponentRosters) window.store.data.opponentRosters = {};
        if (window.store.data.opponentRosters[name]) {
            alert('此學校名稱已存在！');
            this.selectOpponentTeamInModal(name);
            return;
        }
        const defaultPlayers = Array.from({ length: 9 }, (_, i) => ({
            id: `opp_${Date.now()}_${i + 1}`,
            number: `${i + 1}`,
            name: `選手 ${i + 1}`,
            pos: i === 0 ? '投手' : (i === 1 ? '捕手' : '野手'),
            teamId: 'OPP'
        }));
        window.store.saveOpponentRoster(name, defaultPlayers);
        input.value = '';
        this.oppModalCurrentTeam = name;
        this.renderOpponentRosterModal();
        this.populateOpponentPresets();
    }

    deleteCurrentOpponentTeamFromModal() {
        if (!this.oppModalCurrentTeam) return;
        if (!confirm(`確定要刪除【${this.oppModalCurrentTeam}】的秩序冊名單嗎？`)) return;
        window.store.deleteOpponentRoster(this.oppModalCurrentTeam);
        const list = window.store.getOpponentTeamsList ? window.store.getOpponentTeamsList() : [];
        this.oppModalCurrentTeam = list.length > 0 ? list[0] : '';
        this.renderOpponentRosterModal();
        this.populateOpponentPresets();
        this.updateSetupTeamLineups(true);
    }

    renderOpponentModalPlayersTable() {
        const titleEl = document.getElementById('opp-modal-cur-team-title');
        const tbody = document.getElementById('opp-modal-players-tbody');
        if (!titleEl || !tbody) return;

        titleEl.textContent = `📝 編輯名冊：${this.oppModalCurrentTeam || '(未選擇學校)'}`;
        if (!this.oppModalCurrentTeam) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:12px;color:var(--text-secondary);">請先在左側選擇或新增一所學校</td></tr>';
            return;
        }

        const players = window.store.getOpponentPlayers(this.oppModalCurrentTeam);
        tbody.innerHTML = players.map((p, idx) => `
            <tr data-row-idx="${idx}">
                <td style="padding:3px;">
                    <input type="text" class="form-control opp-row-num" style="padding:4px 6px;font-size:0.82rem;" value="${p.number || ''}" placeholder="背號">
                </td>
                <td style="padding:3px;">
                    <input type="text" class="form-control opp-row-name" style="padding:4px 6px;font-size:0.82rem;" value="${p.name || ''}" placeholder="選手姓名">
                </td>
                <td style="padding:3px;">
                    <input type="text" class="form-control opp-row-pos" style="padding:4px 6px;font-size:0.82rem;" value="${p.pos || '選手'}" placeholder="守位">
                </td>
                <td style="padding:3px;text-align:center;">
                    <button type="button" class="btn btn-danger" style="padding:2px 6px;font-size:0.75rem;" onclick="this.closest('tr').remove()">✕</button>
                </td>
            </tr>
        `).join('');
    }

    addOpponentRosterRow() {
        const tbody = document.getElementById('opp-modal-players-tbody');
        if (!tbody) return;
        const curRows = tbody.querySelectorAll('tr').length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:3px;">
                <input type="text" class="form-control opp-row-num" style="padding:4px 6px;font-size:0.82rem;" value="${curRows + 1}" placeholder="背號">
            </td>
            <td style="padding:3px;">
                <input type="text" class="form-control opp-row-name" style="padding:4px 6px;font-size:0.82rem;" value="" placeholder="選手姓名">
            </td>
            <td style="padding:3px;">
                <input type="text" class="form-control opp-row-pos" style="padding:4px 6px;font-size:0.82rem;" value="選手" placeholder="守位">
            </td>
            <td style="padding:3px;text-align:center;">
                <button type="button" class="btn btn-danger" style="padding:2px 6px;font-size:0.75rem;" onclick="this.closest('tr').remove()">✕</button>
            </td>
        `;
        tbody.appendChild(tr);
    }

    parseAndApplyOpponentRosterBatch() {
        const textarea = document.getElementById('opp-modal-batch-text');
        const text = textarea ? textarea.value.trim() : '';
        if (!text) {
            alert('請先在文字框中貼上秩序冊或 LINE 傳送的選手名冊！');
            return;
        }

        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const parsed = [];
        let autoNum = 1;

        lines.forEach(line => {
            const tokens = line.split(/[、\s\t,]+/).filter(Boolean);
            if (tokens.length === 0) return;

            let num = '';
            let name = '';
            let pos = '選手';

            if (/^#?\d+$/.test(tokens[0])) {
                num = tokens[0].replace('#', '');
                name = tokens[1] || `選手 ${num}`;
                pos = tokens.slice(2).join(' ') || '選手';
            } else {
                num = `${autoNum++}`;
                name = tokens[0];
                pos = tokens.slice(1).join(' ') || '選手';
            }

            parsed.push({ number: num, name, pos });
        });

        if (parsed.length === 0) {
            alert('未能解析出選手資料，請確認格式每行包含「背號 姓名」或「姓名」！');
            return;
        }

        const tbody = document.getElementById('opp-modal-players-tbody');
        if (tbody) {
            tbody.innerHTML = parsed.map(p => `
                <tr>
                    <td style="padding:3px;">
                        <input type="text" class="form-control opp-row-num" style="padding:4px 6px;font-size:0.82rem;" value="${p.number}" placeholder="背號">
                    </td>
                    <td style="padding:3px;">
                        <input type="text" class="form-control opp-row-name" style="padding:4px 6px;font-size:0.82rem;" value="${p.name}" placeholder="選手姓名">
                    </td>
                    <td style="padding:3px;">
                        <input type="text" class="form-control opp-row-pos" style="padding:4px 6px;font-size:0.82rem;" value="${p.pos}" placeholder="守位">
                    </td>
                    <td style="padding:3px;text-align:center;">
                        <button type="button" class="btn btn-danger" style="padding:2px 6px;font-size:0.75rem;" onclick="this.closest('tr').remove()">✕</button>
                    </td>
                </tr>
            `).join('');
        }

        alert(`✅ 成功解析 ${parsed.length} 位選手名單！請確認下方表格無誤後，點擊「💾 儲存名冊設定」。`);
    }

    saveOpponentRosterFromModal() {
        if (!this.oppModalCurrentTeam) {
            alert('請選擇要儲存的學校！');
            return;
        }
        const tbody = document.getElementById('opp-modal-players-tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        const players = [];
        const prefix = this.oppModalCurrentTeam.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').slice(0, 8);

        rows.forEach((r, idx) => {
            const num = r.querySelector('.opp-row-num')?.value.trim() || `${idx + 1}`;
            const name = r.querySelector('.opp-row-name')?.value.trim();
            const pos = r.querySelector('.opp-row-pos')?.value.trim() || '選手';
            if (name) {
                players.push({
                    id: `opp_${prefix}_${num}`,
                    number: num,
                    name: name,
                    pos: pos,
                    teamId: 'OPP'
                });
            }
        });

        if (players.length === 0) {
            alert('名冊至少需填入一位選手姓名！');
            return;
        }

        window.store.saveOpponentRoster(this.oppModalCurrentTeam, players);

        const oppNameInput = document.getElementById('setup-opp-name');
        if (oppNameInput) oppNameInput.value = this.oppModalCurrentTeam;
        this.populateOpponentPresets();
        this.updateSetupTeamLineups(true);
        this.closeModal('opponent-roster-modal');
        alert(`💾 已成功儲存【${this.oppModalCurrentTeam}】秩序冊名單（共 ${players.length} 位選手）！已自動套用至開賽打序。`);
    }

    closeModal(id) {
        document.getElementById(id)?.classList.remove('open');
    }
}

window.app = new BaseballApp();
document.addEventListener('DOMContentLoaded', () => window.app.init());
