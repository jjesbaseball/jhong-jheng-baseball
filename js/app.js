/**
 * 國小少棒三隊聯盟紀錄、CPBL 數據排行榜與球員交易系統 - 主控制器 (App Controller V2)
 */

class BaseballApp {
    constructor() {
        this.currentTab = 'toplist'; // 'toplist' | 'scorebook' | 'trades' | 'games' | 'settings'
        this.statsCategory = 'batting'; // 'batting' | 'pitching'
        this.teamFilter = 'ALL'; // 'ALL' | 't1' | 't2' | 't3'
        this.qualifyOnly = false;
        this.searchQuery = '';
        this.batSort = { key: 'avg', dir: 'desc' };
        this.pitSort = { key: 'era', dir: 'asc' };
        this.selectedBaseKey = null;
        this.voiceEnabled = localStorage.getItem('JJ_VOICE_ANNOUNCE') !== 'off';
        this._hrAnimId = null;
        this._hrHideTimer = null;
    }

    init() {
        this.bindNavigation();
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
            subEl.textContent = `三隊循環對抗・數據排行・球員交易系統 ｜ ${syncText}`;
        }

        const liveDot = document.getElementById('nav-live-dot');
        if (liveDot) {
            liveDot.style.display = window.scorebook.state ? 'inline-block' : 'none';
        }
    }

    /* ======================================================================
       0. 三隊聯盟戰績排行看板 (3-Team League Standings)
       ====================================================================== */
    renderLeagueStandings() {
        const container = document.getElementById('league-standings-container');
        if (!container) return;

        const standings = StatsEngine.getTeamStandings(window.store.data);
        const eraBase = window.store.data.settings?.eraInningsBase || 6;

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
        bar.innerHTML = `
            <button class="pill-btn ${this.teamFilter === 'ALL' ? 'active' : ''}" onclick="app.setTeamFilter('ALL')">🏆 全聯盟三隊總排行</button>
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
        const eraBase = data.settings?.eraInningsBase || 6;

        if (this.statsCategory === 'batting') {
            const list = StatsEngine.getBattingStatsList(data, this.teamFilter).filter(p => p.pa > 0 || p.sb > 0);
            const categories = [
                { title: '打擊王', code: 'AVG', key: 'avg', fmt: v => StatsEngine.formatRate(v), filter: p => p.ab >= 1, desc: true },
                { title: '安打王', code: 'H', key: 'h', fmt: v => `${v}`, filter: p => p.pa >= 1, desc: true },
                { title: '全壘打王', code: 'HR', key: 'hr', fmt: v => `${v}`, filter: p => p.pa >= 1, desc: true },
                { title: '打點王', code: 'RBI', key: 'rbi', fmt: v => `${v}`, filter: p => p.pa >= 1, desc: true },
                { title: '盜壘王', code: 'SB', key: 'sb', fmt: v => `${v}`, filter: p => true, desc: true },
                { title: '攻擊指數王', code: 'OPS', key: 'ops', fmt: v => StatsEngine.formatRate(v), filter: p => p.pa >= 1, desc: true }
            ];
            grid.innerHTML = categories.map(cat => this.buildPodiumCardHTML(list, cat)).join('');
        } else {
            const list = StatsEngine.getPitchingStatsList(data, this.teamFilter).filter(p => p.outs > 0 || p.g > 0);
            const categories = [
                { title: '防禦率王', code: `ERA (${eraBase}局)`, key: 'era', fmt: v => StatsEngine.formatERA(v), filter: p => p.outs >= 3, desc: false },
                { title: '勝投王', code: 'W', key: 'w', fmt: v => `${v}`, filter: p => p.g >= 1, desc: true },
                { title: '三振王', code: 'SO', key: 'so', fmt: v => `${v}`, filter: p => p.outs >= 1, desc: true },
                { title: '救援成功王', code: 'SV', key: 'sv', fmt: v => `${v}`, filter: p => p.g >= 1, desc: true },
                { title: '每局被上壘率', code: 'WHIP', key: 'whip', fmt: v => StatsEngine.formatERA(v), filter: p => p.outs >= 3, desc: false },
                { title: '奪三振率王', code: `K/${eraBase}`, key: 'kRate', fmt: v => StatsEngine.formatERA(v), filter: p => p.outs >= 3, desc: true }
            ];
            grid.innerHTML = categories.map(cat => this.buildPodiumCardHTML(list, cat)).join('');
        }
    }

    buildPodiumCardHTML(list, cat) {
        const filtered = list.filter(cat.filter).sort((a, b) => {
            if (b[cat.key] === a[cat.key]) {
                return (b.h || b.so || 0) - (a.h || a.so || 0);
            }
            return cat.desc ? (b[cat.key] - a[cat.key]) : (a[cat.key] - b[cat.key]);
        });

        const top5 = filtered.slice(0, 5);
        if (top5.length === 0) {
            return `
                <div class="toplist-card">
                    <div class="toplist-card-header">
                        <span class="toplist-card-title">🏆 ${cat.title}</span>
                        <span class="toplist-card-code">${cat.code}</span>
                    </div>
                    <div style="padding:24px;text-align:center;color:var(--text-secondary);font-size:0.88rem;">
                        尚無符合資格數據
                    </div>
                </div>
            `;
        }

        const first = top5[0];
        const runners = top5.slice(1);

        return `
            <div class="toplist-card">
                <div class="toplist-card-header">
                    <span class="toplist-card-title">🏆 ${cat.title}</span>
                    <span class="toplist-card-code">${cat.code}</span>
                </div>
                <div class="toplist-leader-hero" onclick="app.openPlayerModal('${first.playerId}')">
                    <div class="leader-left">
                        <div class="rank-crown">1</div>
                        <div class="jersey-badge" style="border-color:${first.teamColor};">#${first.number}</div>
                        <div class="leader-info">
                            <div class="player-name">${first.name}</div>
                            <div class="player-meta">${this.teamBadgeHTML(first.teamId)} ${first.pos || ''}</div>
                        </div>
                    </div>
                    <div class="leader-BigStat">${cat.fmt(first[cat.key])}</div>
                </div>
                <div class="toplist-runners">
                    ${runners.map((r, idx) => `
                        <div class="runner-row" onclick="app.openPlayerModal('${r.playerId}')">
                            <div class="runner-left">
                                <span class="rank-num rank-${idx + 2}">${idx + 2}</span>
                                <span class="num-tag">#${r.number}</span>
                                <strong>${r.name}</strong>
                                ${this.teamBadgeHTML(r.teamId)}
                            </div>
                            <div class="runner-stat">${cat.fmt(r[cat.key])}</div>
                        </div>
                    `).join('')}
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

        if (this.statsCategory === 'batting') {
            if (titleEl) titleEl.textContent = '📋 聯盟打擊成績總表（點擊欄位標題可排序，點擊球員可看交易前後分段成績）';
            let rows = StatsEngine.getBattingStatsList(data, this.teamFilter);
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
            const eraBase = data.settings?.eraInningsBase || 6;
            if (titleEl) titleEl.textContent = `📋 聯盟投手成績總表（少棒 ${eraBase} 局制防禦率，點擊欄位可排序）`;
            let rows = StatsEngine.getPitchingStatsList(data, this.teamFilter).filter(p => p.g > 0 || p.outs > 0 || !this.qualifyOnly);
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
    renderScorebookView() {
        const setupPanel = document.getElementById('scorebook-setup-panel');
        const livePanel = document.getElementById('scorebook-live-panel');
        if (!setupPanel || !livePanel) return;

        const st = window.scorebook.state;
        if (!st) {
            setupPanel.style.display = 'block';
            livePanel.style.display = 'none';
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
            awaySelect.innerHTML = teams.map((t, i) => `<option value="${t.id}" ${i === 0 ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('');
            homeSelect.innerHTML = teams.map((t, i) => `<option value="${t.id}" ${i === 1 ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('');
        }

        this.updateSetupTeamLineups();
    }

    updateSetupTeamLineups(forceReset = false) {
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

    renderSetupLineupBox(side, allTeamPlayers, orderList, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;

        const unpicked = allTeamPlayers.filter(p => !orderList.includes(p.id));
        const nextOrderNum = orderList.length + 1;

        const toolBarHTML = `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
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
            return `
                <div style="display:flex;align-items:center;gap:8px;background:var(--bg-primary);padding:7px 10px;border-radius:8px;border:1.5px solid var(--border-color);">
                    <span style="background:linear-gradient(135deg,var(--jj-gold-light),var(--jj-gold));color:#061527;font-weight:900;font-size:0.76rem;padding:2px 8px;border-radius:6px;min-width:54px;text-align:center;">
                        第 ${idx + 1} 棒
                    </span>
                    <span class="num-tag">#${p.number}</span>
                    <strong>${p.name}</strong>
                    <span style="color:var(--text-secondary);font-size:0.74rem;margin-left:auto;">${p.pos}</span>
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
                    ${unpicked.map(p => `
                        <button type="button" class="btn" style="padding:6px 10px;font-size:0.82rem;background:#10345c;border-color:var(--jj-gold);" onclick="app.addSetupOrderPlayer('${side}', '${p.id}')">
                            ➕ #${p.number} ${p.name}
                        </button>
                    `).join('')}
                </div>
            </div>
        ` : '';

        el.innerHTML = toolBarHTML + (activeRowsHTML || '<div style="padding:10px;text-align:center;color:var(--text-secondary);font-size:0.84rem;">請點擊下方球員依序排入第 1 棒、第 2 棒...</div>') + unpickedHTML;
    }

    clearSetupOrderForTap(side) {
        if (side === 'away') this.setupAwayOrder = [];
        else this.setupHomeOrder = [];
        this.updateSetupTeamLineups(false);
    }

    fillAllSetupOrder(side) {
        const teamId = document.getElementById(side === 'away' ? 'setup-away-team' : 'setup-home-team')?.value;
        const players = window.store.getPlayersByTeam(teamId);
        const list = side === 'away' ? this.setupAwayOrder : this.setupHomeOrder;
        players.forEach(p => {
            if (!list.includes(p.id)) list.push(p.id);
        });
        this.updateSetupTeamLineups(false);
    }

    shuffleSetupOrder(side) {
        this.fillAllSetupOrder(side);
        const list = side === 'away' ? this.setupAwayOrder : this.setupHomeOrder;
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        this.updateSetupTeamLineups(false);
    }

    moveSetupOrder(side, index, delta) {
        const list = side === 'away' ? this.setupAwayOrder : this.setupHomeOrder;
        const target = index + delta;
        if (target < 0 || target >= list.length) return;
        [list[index], list[target]] = [list[target], list[index]];
        this.updateSetupTeamLineups(false);
    }

    removeSetupOrderPlayer(side, pid) {
        if (side === 'away') {
            this.setupAwayOrder = this.setupAwayOrder.filter(id => id !== pid);
        } else {
            this.setupHomeOrder = this.setupHomeOrder.filter(id => id !== pid);
        }
        this.updateSetupTeamLineups(false);
    }

    addSetupOrderPlayer(side, pid) {
        const list = side === 'away' ? this.setupAwayOrder : this.setupHomeOrder;
        if (!list.includes(pid)) list.push(pid);
        this.updateSetupTeamLineups(false);
    }

    handleStartLiveGame() {
        const awayTeamId = document.getElementById('setup-away-team')?.value;
        const homeTeamId = document.getElementById('setup-home-team')?.value;
        if (awayTeamId === homeTeamId) {
            alert('先攻隊伍與後攻隊伍不能相同，請選擇兩支不同的隊伍對戰！');
            return;
        }

        const tournament = document.getElementById('setup-tournament')?.value.trim() || '隊內三隊爭霸練習賽 (4局制)';
        const date = document.getElementById('setup-game-date')?.value || new Date().toISOString().slice(0, 10);
        const innings = Number(document.getElementById('setup-innings')?.value) || 4;
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

        // 更新文字轉播
        const logContainer = document.getElementById('live-play-log');
        if (logContainer) {
            logContainer.innerHTML = (st.playByPlay || []).map(item => `
                <div class="play-log-item">
                    <span class="play-log-inning">${item.inning}</span>
                    <span>${item.text}</span>
                </div>
            `).join('');
        }
    }

    toggleVoiceAnnounce() {
        this.voiceEnabled = !this.voiceEnabled;
        try {
            localStorage.setItem('JJ_VOICE_ANNOUNCE', this.voiceEnabled ? 'on' : 'off');
        } catch (e) {}
        this.updateVoiceToggleUI();
        if (this.voiceEnabled) {
            this.speakActionText('語音播報已開啟');
        } else if ('speechSynthesis' in window) {
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
            toast.innerHTML = `🔊 已按下：<span style="color:#fff;">【${text}】</span>`;
            toast.classList.add('speaking');
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => toast.classList.remove('speaking'), 950);
        }

        if (!this.voiceEnabled || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = 'zh-TW';
            utter.rate = 1.15;
            utter.pitch = 1.05;
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
        const pitchLabels = {
            'strike_looking': '好球進壘',
            'strike_swinging': '揮棒落空',
            'foul': '界外球',
            'ball': '壞球'
        };
        this.speakActionText(pitchLabels[type] || '投球紀錄');
        window.scorebook.recordPitch(type);
        this.renderScorebookView();
    }

    handlePlayBtn(type) {
        const playLabels = {
            '1B': '一壘安打',
            '2B': '二壘安打',
            '3B': '三壘安打',
            'HR': '全壘打！Home Run',
            'BB': '四壞保送',
            'HBP': '觸身球',
            'SO': '三振出局',
            'GO': '滾地出局',
            'FO': '飛球出局',
            'DP': '雙殺守備',
            'SAC': '犧牲觸擊',
            'SF': '高飛犧牲打',
            'ROE': '守備失誤上壘'
        };

        // 先擷取目前打者資訊供全壘打電視牆顯示
        const { battingTeam } = window.scorebook.getActiveTeams();
        const { batter } = window.scorebook.getCurrentMatchup();
        const batterBannerText = batter
            ? `${battingTeam ? battingTeam.emoji + battingTeam.name : ''} #${batter.number} ${batter.name} 轟出全壘打！`
            : '🔥 轟出全壘打！';

        this.speakActionText(playLabels[type] || type);
        window.scorebook.recordPlay({ type });
        this.renderScorebookView();

        if (type === 'HR') {
            this.triggerHomeRunJumbotron(batterBannerText);
        }
    }

    handleUndo() {
        if (window.scorebook.undo()) {
            this.speakActionText('復原上一步');
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
                        🚫 盜壘失敗 (CS)<small>跑者出局 (+1 Out)</small>
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
        const runnerLabels = {
            'SB': '盜壘成功',
            'CS': '盜壘失敗出局',
            'WP': '暴投推進',
            'SCORE': '跑回本壘得分',
            'REMOVE': '移除跑者'
        };
        if (runnerLabels[action]) this.speakActionText(runnerLabels[action]);
        window.scorebook.handleRunnerAction(this.selectedBaseKey, action);
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

        body.innerHTML = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                <button type="button" class="btn" onclick="app.clearLiveLineupForTap()">👆 清空重排（依點擊順序決定 1~N 棒）</button>
                <button type="button" class="btn" onclick="app.shuffleLiveLineup()">🎲 隨機洗牌重排打序</button>
            </div>
            <div style="max-height:360px;overflow-y:auto;">
                ${rowsHTML || '<div style="padding:14px;text-align:center;color:var(--text-secondary);">請點擊下方球員依序排入第 1 棒、第 2 棒...</div>'}
                ${unpickedHTML}
            </div>
            <div style="margin-top:14px;display:flex;justify-content:flex-end;">
                <button type="button" class="btn btn-primary" onclick="app.closeModal('runner-action-modal');app.renderScorebookView();">✅ 完成打序調整</button>
            </div>
        `;
        modal.classList.add('open');
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
        body.innerHTML = `
            <div class="form-group" style="margin-bottom:12px;">
                <label>選擇【${activePitcherTeam.name}】接替登板投球的隊員：</label>
                <select id="new-pitcher-select" class="form-control">
                    ${players.map(p => `<option value="${p.id}" ${pitcher && p.id === pitcher.id ? 'selected' : ''}>#${p.number} ${p.name} (${p.pos})</option>`).join('')}
                </select>
            </div>
            <button class="btn btn-primary" onclick="app.confirmChangePitcher()">確認換投</button>
        `;
        modal.classList.add('open');
    }

    confirmChangePitcher() {
        const pid = document.getElementById('new-pitcher-select')?.value;
        if (pid) window.scorebook.changePitcher(pid);
        this.closeModal('runner-action-modal');
        this.renderScorebookView();
    }

    openFinalizeGameModal() {
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

        const awayTeam = window.store.getTeam(st.awayTeamId);
        const homeTeam = window.store.getTeam(st.homeTeamId);
        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = '🏁 結束比賽並結算兩隊成績入庫';
        const allPitcherIds = Array.from(new Set([
            ...(Array.isArray(st.pitcherOrder) ? st.pitcherOrder : []),
            ...Object.keys(st.pitchingStats || {})
        ]));

        const pitcherRows = allPitcherIds.map(pid => {
            const p = window.store.getPlayer(pid) || { name: '投手', number: '' };
            const pl = (st.pitchingStats || {})[pid];
            if (!pl) return '';
            const tm = window.store.getTeam(pl.teamId);
            // 預設自動預選勝投/敗投方便教練一鍵確認
            let defaultDec = pl.decision || '';
            if (!defaultDec && st.awayScore !== st.homeScore) {
                const winTeamId = st.awayScore > st.homeScore ? st.awayTeamId : st.homeTeamId;
                const loseTeamId = st.awayScore > st.homeScore ? st.homeTeamId : st.awayTeamId;
                if (pl.teamId === winTeamId && pl.gs) defaultDec = 'W';
                else if (pl.teamId === loseTeamId && pl.gs) defaultDec = 'L';
            }
            return `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                    <span>${tm.emoji} <strong>#${p.number} ${p.name}</strong> (${StatsEngine.formatIP(pl.outs)}局, 失${pl.r}分, ${pl.so}K)</span>
                    <select class="form-control pitcher-decision-select" data-pid="${pid}" style="width:155px;">
                        <option value="" ${defaultDec === '' ? 'selected' : ''}>無勝敗/中繼</option>
                        <option value="W" ${defaultDec === 'W' ? 'selected' : ''}>勝投 (W)</option>
                        <option value="L" ${defaultDec === 'L' ? 'selected' : ''}>敗投 (L)</option>
                        <option value="SV" ${defaultDec === 'SV' ? 'selected' : ''}>救援成功 (SV)</option>
                        <option value="HLD" ${defaultDec === 'HLD' ? 'selected' : ''}>中繼成功 (HLD)</option>
                    </select>
                </div>
            `;
        }).join('');

        body.innerHTML = `
            <div style="background:var(--bg-primary);padding:14px;border-radius:10px;margin-bottom:14px;text-align:center;">
                <div style="font-size:0.85rem;color:var(--text-secondary);">${st.tournament}</div>
                <div style="font-size:1.35rem;font-weight:900;color:var(--cpbl-gold);margin-top:4px;">
                    ${awayTeam.emoji}${awayTeam.name} ${st.awayScore} : ${st.homeScore} ${homeTeam.emoji}${homeTeam.name}
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <div style="font-size:0.85rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">設定本場兩隊出場投手之勝投 / 敗投 / 救援紀錄：</div>
                ${pitcherRows || '<p style="font-size:0.85rem;color:var(--text-secondary);">無投手紀錄</p>'}
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button type="button" class="btn" onclick="app.closeModal('runner-action-modal')">繼續記錄比賽</button>
                <button type="button" class="btn btn-primary" onclick="app.confirmFinalizeGame()">✅ 確認結算並更新三隊戰績與排行榜</button>
            </div>
        `;
        modal.classList.add('open');
    }

    confirmFinalizeGame() {
        try {
            const decisions = {};
            document.querySelectorAll('.pitcher-decision-select').forEach(sel => {
                const pid = sel.getAttribute('data-pid');
                if (pid && sel.value) decisions[pid] = sel.value;
            });

            let backupState = this._pendingFinalizeState || null;
            if (!backupState) {
                try {
                    const rawBackup = localStorage.getItem('JJ_PENDING_FINALIZE_BACKUP') || localStorage.getItem('YOUTH_BASEBALL_JJ_LIVE_V5') || localStorage.getItem('YOUTH_BASEBALL_JJ_LIVE_V3');
                    if (rawBackup) backupState = JSON.parse(rawBackup);
                } catch (e) {}
            }

            const finished = window.scorebook.finalizeGame(decisions, backupState);
            this._pendingFinalizeState = null;
            try { localStorage.removeItem('JJ_PENDING_FINALIZE_BACKUP'); } catch (e) {}

            this.closeModal('runner-action-modal');
            this.switchTab('toplist');
            this.refreshAll();

            if (finished) {
                const awayT = window.store.getTeam(finished.awayTeamId);
                const homeT = window.store.getTeam(finished.homeTeamId);
                alert(`🎉 比賽結算完成！\n【${awayT.name} ${finished.awayScore} : ${finished.homeScore} ${homeT.name}】\n已自動更新三隊戰績榜與個人數據排行榜！`);
            }
        } catch (err) {
            console.error('結算比賽時發生錯誤:', err);
            alert('結算比賽時發生問題：' + err.message);
        }
    }

    cancelLiveGame() {
        if (!confirm('確定要放棄目前正在記錄中的比賽嗎？')) return;
        window.scorebook.state = null;
        window.scorebook.saveLiveState();
        this.refreshAll();
    }

    /* ======================================================================
       3. 球員交易中心與三隊名冊管理 (Player Trade Center & Roster View)
       ====================================================================== */
    renderTradesAndRosterView() {
        this.renderTradeMachine();
        this.renderTradeHistoryLog();
        this.renderRosterTable();
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
     * CPBL 風格個人球員卡（含交易前後各隊分段數據 Splits 與逐場明細）
     */
    openPlayerModal(playerId) {
        const p = window.store.getPlayer(playerId);
        if (!p) return;

        const bat = StatsEngine.getBattingStatsList(window.store.data).find(x => x.playerId === playerId);
        const pit = StatsEngine.getPitchingStatsList(window.store.data).find(x => x.playerId === playerId);
        const currentTeam = window.store.getTeam(p.teamId);

        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = `⚾ 球員個人數據卡：#${p.number} ${p.name}`;

        // 檢查交易前後各隊分段數據
        const splitTeams = Object.values(bat?.splitsByTeam || {});
        const splitHTML = splitTeams.length > 0 ? `
            <h4 style="color:var(--cpbl-gold-light);margin-bottom:6px;">🔁 各隊時期分段打擊成績 (Team Splits)</h4>
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

        body.innerHTML = `
            <div style="display:flex;align-items:center;gap:16px;background:var(--bg-primary);padding:16px;border-radius:12px;margin-bottom:16px;border:1px solid ${currentTeam.color};">
                <div class="jersey-badge" style="width:60px;height:60px;font-size:1.5rem;border-color:${currentTeam.color};">#${p.number}</div>
                <div>
                    <div style="font-size:1.3rem;font-weight:900;color:#fff;display:flex;align-items:center;gap:8px;">
                        ${p.name} ${this.teamBadgeHTML(p.teamId)} <span class="season-badge">${p.grade || ''}</span>
                    </div>
                    <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">
                        守備位置：${p.pos} ｜ ${p.throws === 'L' ? '左投' : '右投'}${p.bats === 'L' ? '左打' : '右打'}
                    </div>
                    ${p.note ? `<div style="font-size:0.8rem;color:var(--cpbl-gold-light);margin-top:2px;">💡 ${p.note}</div>` : ''}
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;text-align:center;">
                <div style="background:var(--bg-secondary);padding:10px;border-radius:10px;">
                    <div style="font-size:0.75rem;color:var(--text-secondary);">本季總打擊率 AVG</div>
                    <div style="font-size:1.35rem;font-weight:900;color:var(--cpbl-gold);">${StatsEngine.formatRate(bat ? bat.avg : 0)}</div>
                </div>
                <div style="background:var(--bg-secondary);padding:10px;border-radius:10px;">
                    <div style="font-size:0.75rem;color:var(--text-secondary);">安打 / 全壘打</div>
                    <div style="font-size:1.35rem;font-weight:900;color:#fff;">${bat ? bat.h : 0} / ${bat ? bat.hr : 0}</div>
                </div>
                <div style="background:var(--bg-secondary);padding:10px;border-radius:10px;">
                    <div style="font-size:0.75rem;color:var(--text-secondary);">打點 / 盜壘</div>
                    <div style="font-size:1.35rem;font-weight:900;color:#fff;">${bat ? bat.rbi : 0} / ${bat ? bat.sb : 0}</div>
                </div>
                <div style="background:var(--bg-secondary);padding:10px;border-radius:10px;">
                    <div style="font-size:0.75rem;color:var(--text-secondary);">攻擊指數 OPS</div>
                    <div style="font-size:1.35rem;font-weight:900;color:#34d399;">${StatsEngine.formatRate(bat ? bat.ops : 0)}</div>
                </div>
            </div>

            ${splitHTML}

            <h4 style="color:var(--cpbl-gold-light);margin-bottom:8px;">📅 逐場出賽明細 (Game Logs)</h4>
            <div class="table-scroll-wrapper">
                <table class="cpbl-table">
                    <thead>
                        <tr>
                            <th class="align-left">日期 / 對戰組合</th>
                            <th class="align-left">當時代表隊</th>
                            <th>AB</th><th>H</th><th>HR</th><th>RBI</th><th>R</th><th>SB</th>
                            <th>投球IP</th><th>三振K</th><th>自責ER</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${gameLogs.map(item => {
                            const awayT = window.store.getTeam(item.game.awayTeamId);
                            const homeT = window.store.getTeam(item.game.homeTeamId);
                            const repTeamId = item.bLine?.teamId || item.pLine?.teamId || p.teamId;
                            return `
                                <tr>
                                    <td class="align-left">${item.game.date} (${awayT.name} vs ${homeT.name})</td>
                                    <td class="align-left">${this.teamBadgeHTML(repTeamId)}</td>
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
       4. 歷史比賽紀錄與賽後快速補登 (Games History & Quick Box Entry)
       ====================================================================== */
    renderGamesHistoryView() {
        const container = document.getElementById('games-history-list');
        if (!container) return;

        const games = window.store.data.games || [];
        if (games.length === 0) {
            container.innerHTML = `<div style="padding:36px;text-align:center;color:var(--text-secondary);background:var(--bg-card);border-radius:16px;">尚無比賽紀錄，可點擊上方「前往實戰計分本」或「賽後快速補登」新增比賽！</div>`;
            return;
        }

        container.innerHTML = games.map(g => {
            const awayT = window.store.getTeam(g.awayTeamId);
            const homeT = window.store.getTeam(g.homeTeamId);
            const winText = g.awayScore > g.homeScore ? `${awayT.emoji}${awayT.name} 勝` : (g.homeScore > g.awayScore ? `${homeT.emoji}${homeT.name} 勝` : '雙方平手');

            return `
                <div class="game-history-card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                        <span style="font-size:0.8rem;color:var(--text-secondary);font-weight:700;">📅 ${g.date} ｜ ${g.tournament}</span>
                        <span class="game-result-badge win">${winText}</span>
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
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <button class="btn" style="flex:1;justify-content:center;" onclick="app.openGameBoxScoreModal('${g.id}')">📊 查看兩隊完整 Box 計分表</button>
                        <button class="btn btn-danger" onclick="app.deleteGame('${g.id}')">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    openGameBoxScoreModal(gameId) {
        const g = (window.store.data.games || []).find(x => x.id === gameId);
        if (!g) return;
        const awayT = window.store.getTeam(g.awayTeamId);
        const homeT = window.store.getTeam(g.homeTeamId);
        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = `📊 單場計分表：${awayT.emoji}${awayT.name} vs ${homeT.emoji}${homeT.name} (${g.date})`;

        const batRows = (g.battingStats || []).map(b => {
            const p = window.store.getPlayer(b.playerId) || { name: '球員', number: '?' };
            return `<tr>
                <td class="align-left">${this.teamBadgeHTML(b.teamId)}</td>
                <td class="align-left">#${p.number} ${p.name}</td>
                <td>${b.pa}</td><td>${b.ab}</td><td><strong>${b.h}</strong></td>
                <td>${b.b2}</td><td>${b.b3}</td><td>${b.hr}</td>
                <td><strong>${b.rbi}</strong></td><td>${b.r}</td><td>${b.bb}</td><td>${b.so}</td><td>${b.sb}</td>
            </tr>`;
        }).join('');

        const pitRows = (g.pitchingStats || []).map(pt => {
            const p = window.store.getPlayer(pt.playerId) || { name: '投手', number: '?' };
            return `<tr>
                <td class="align-left">${this.teamBadgeHTML(pt.teamId)}</td>
                <td class="align-left">#${p.number} ${p.name} ${pt.decision ? `<span class="season-badge">${pt.decision}</span>` : ''}</td>
                <td><strong>${StatsEngine.formatIP(pt.outs)}</strong></td>
                <td>${pt.np}</td><td>${pt.h}</td><td>${pt.bb}</td><td><strong>${pt.so}</strong></td>
                <td>${pt.r}</td><td>${pt.er}</td>
            </tr>`;
        }).join('');

        body.innerHTML = `
            <div style="margin-bottom:14px;">
                <h4 style="color:var(--cpbl-gold-light);margin-bottom:6px;">兩隊打擊成績 Box Score</h4>
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
                <h4 style="color:var(--cpbl-gold-light);margin-bottom:6px;">兩隊投手成績 Box Score</h4>
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
        if (!confirm('確定要刪除這場比賽紀錄嗎？刪除後三隊戰績與排行榜將自動重新計算。')) return;
        window.store.data.games = (window.store.data.games || []).filter(g => g.id !== gameId);
        window.store.save();
        this.refreshAll();
    }

    /**
     * 賽後紙本計分快速補登（同時補登對戰兩支隊伍成績）
     */
    openQuickBoxEntryModal() {
        const teams = window.store.data.teams || [];
        const modal = document.getElementById('runner-action-modal');
        const title = document.getElementById('runner-modal-title');
        const body = document.getElementById('runner-modal-body');

        title.textContent = '📝 賽後快速補登兩隊對戰成績（適合紙本紀錄後快速輸入）';

        body.innerHTML = `
            <div class="form-grid">
                <div class="form-group">
                    <label>比賽日期</label>
                    <input type="date" id="qb-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
                </div>
                <div class="form-group">
                    <label>賽事輪次名稱</label>
                    <input type="text" id="qb-tournament" class="form-control" value="隊內三隊爭霸賽">
                </div>
                <div class="form-group">
                    <label>先攻隊伍 (客隊) & 得分</label>
                    <div style="display:flex;gap:6px;">
                        <select id="qb-away-team" class="form-control" onchange="app.renderQuickBoxPlayers()">
                            ${teams.map((t, i) => `<option value="${t.id}" ${i === 0 ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('')}
                        </select>
                        <input type="number" id="qb-away-score" class="form-control" value="5" min="0" style="width:74px;">
                    </div>
                </div>
                <div class="form-group">
                    <label>後攻隊伍 (主隊) & 得分</label>
                    <div style="display:flex;gap:6px;">
                        <select id="qb-home-team" class="form-control" onchange="app.renderQuickBoxPlayers()">
                            ${teams.map((t, i) => `<option value="${t.id}" ${i === 1 ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('')}
                        </select>
                        <input type="number" id="qb-home-score" class="form-control" value="3" min="0" style="width:74px;">
                    </div>
                </div>
            </div>
            <div class="table-scroll-wrapper" style="max-height:340px;overflow-y:auto;margin-bottom:14px;">
                <table class="cpbl-table">
                    <thead>
                        <tr>
                            <th class="align-left">隊伍 / 球員</th>
                            <th>打數AB</th><th>一安1B</th><th>二安2B</th><th>三安3B</th><th>全壘HR</th>
                            <th>打點RBI</th><th>得分R</th><th>四死BB</th><th>三振SO</th><th>盜壘SB</th>
                            <th>投球出局數</th><th>奪三振K</th><th>自責分ER</th>
                        </tr>
                    </thead>
                    <tbody id="qb-players-tbody"></tbody>
                </table>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button class="btn" onclick="app.closeModal('runner-action-modal')">取消</button>
                <button class="btn btn-primary" onclick="app.saveQuickBoxEntry()">💾 儲存本場兩隊成績</button>
            </div>
        `;
        this.renderQuickBoxPlayers();
        modal.classList.add('open');
    }

    renderQuickBoxPlayers() {
        const awayTeamId = document.getElementById('qb-away-team')?.value || 't1';
        const homeTeamId = document.getElementById('qb-home-team')?.value || 't2';
        const tbody = document.getElementById('qb-players-tbody');
        if (!tbody) return;

        const players = [
            ...window.store.getPlayersByTeam(awayTeamId),
            ...window.store.getPlayersByTeam(homeTeamId)
        ];

        tbody.innerHTML = players.map(p => `
            <tr data-pid="${p.id}" data-tid="${p.teamId}">
                <td class="align-left">${this.teamBadgeHTML(p.teamId)} <strong>#${p.number} ${p.name}</strong></td>
                <td><input type="number" min="0" value="0" class="form-control q-ab" style="width:54px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-b1" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-b2" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-b3" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-hr" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-rbi" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-r" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-bb" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-so" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-sb" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-outs" style="width:56px;padding:4px;" title="3出局=1局"></td>
                <td><input type="number" min="0" value="0" class="form-control q-pso" style="width:50px;padding:4px;"></td>
                <td><input type="number" min="0" value="0" class="form-control q-er" style="width:50px;padding:4px;"></td>
            </tr>
        `).join('');
    }

    saveQuickBoxEntry() {
        const awayTeamId = document.getElementById('qb-away-team')?.value;
        const homeTeamId = document.getElementById('qb-home-team')?.value;
        if (awayTeamId === homeTeamId) {
            alert('先攻隊伍與後攻隊伍不可相同！');
            return;
        }
        const date = document.getElementById('qb-date')?.value || new Date().toISOString().slice(0, 10);
        const tournament = document.getElementById('qb-tournament')?.value.trim() || '隊內三隊爭霸賽';
        const awayScore = Number(document.getElementById('qb-away-score')?.value) || 0;
        const homeScore = Number(document.getElementById('qb-home-score')?.value) || 0;

        const battingStats = [];
        const pitchingStats = [];
        let awayHits = 0, homeHits = 0;

        document.querySelectorAll('#qb-players-tbody tr').forEach(tr => {
            const pid = tr.getAttribute('data-pid');
            const tid = tr.getAttribute('data-tid');
            const ab = Number(tr.querySelector('.q-ab')?.value) || 0;
            const b1 = Number(tr.querySelector('.q-b1')?.value) || 0;
            const b2 = Number(tr.querySelector('.q-b2')?.value) || 0;
            const b3 = Number(tr.querySelector('.q-b3')?.value) || 0;
            const hr = Number(tr.querySelector('.q-hr')?.value) || 0;
            const rbi = Number(tr.querySelector('.q-rbi')?.value) || 0;
            const r = Number(tr.querySelector('.q-r')?.value) || 0;
            const bb = Number(tr.querySelector('.q-bb')?.value) || 0;
            const so = Number(tr.querySelector('.q-so')?.value) || 0;
            const sb = Number(tr.querySelector('.q-sb')?.value) || 0;

            const h = b1 + b2 + b3 + hr;
            const pa = Math.max(ab + bb, h + bb);
            if (tid === awayTeamId) awayHits += h;
            if (tid === homeTeamId) homeHits += h;

            if (pa > 0 || r > 0 || sb > 0 || rbi > 0) {
                battingStats.push({
                    playerId: pid, teamId: tid, pa, ab: Math.max(ab, h), h, b1, b2, b3, hr, rbi, r, bb, hbp: 0, so, sac: 0, sf: 0, sb, cs: 0, roe: 0
                });
            }

            const outs = Number(tr.querySelector('.q-outs')?.value) || 0;
            const pso = Number(tr.querySelector('.q-pso')?.value) || 0;
            const er = Number(tr.querySelector('.q-er')?.value) || 0;
            if (outs > 0 || pso > 0 || er > 0) {
                pitchingStats.push({
                    playerId: pid, teamId: tid, gs: 1, outs, np: outs * 5, strikes: outs * 3,
                    bf: outs + er, h: er, hr: 0, bb: 0, hbp: 0, so: pso, wp: 0, r: er, er, decision: ''
                });
            }
        });

        window.store.data.games.unshift({
            id: 'g_' + Date.now(),
            date, tournament, awayTeamId, homeTeamId,
            awayScore, homeScore, awayHits, homeHits,
            awayErrors: 0, homeErrors: 0, innings: 6,
            lineScore: { away: [awayScore], home: [homeScore] },
            battingStats, pitchingStats, playByPlay: []
        });

        window.store.save();
        this.closeModal('runner-action-modal');
        this.refreshAll();
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

    closeModal(id) {
        document.getElementById(id)?.classList.remove('open');
    }
}

window.app = new BaseballApp();
document.addEventListener('DOMContentLoaded', () => window.app.init());
