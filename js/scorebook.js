/**
 * 中正國小少棒三隊聯盟 - 4局制 & 同隊投手練習賽實戰計分本引擎 (Live Scorebook Engine V3)
 * 支援：
 * 1. 隊內賽預設 4 局制 (亦可選其他局數)
 * 2. 練習賽「同隊投手制」：進攻時由自己隊伍的投手投給自己隊友打，同時統計打者與本隊投手數據！
 */

const LIVE_STORAGE_KEYS = {
    intra: 'YOUTH_BASEBALL_JJ_LIVE_INTRA_V5',
    external: 'YOUTH_BASEBALL_JJ_LIVE_EXT_V5'
};
const LIVE_GAME_STORAGE_KEY = 'YOUTH_BASEBALL_JJ_LIVE_V5';

class LiveScorebook {
    constructor() {
        this.activeChannel = 'intra';
        this.channels = {
            intra: this.loadChannelState('intra'),
            external: this.loadChannelState('external')
        };
        this.historyStacks = {
            intra: [],
            external: []
        };
        this.lastTimestamps = {
            intra: 0,
            external: 0
        };
    }

    get state() {
        return this.channels[this.activeChannel];
    }

    set state(val) {
        this.channels[this.activeChannel] = val;
    }

    get historyStack() {
        if (!this.historyStacks[this.activeChannel]) {
            this.historyStacks[this.activeChannel] = [];
        }
        return this.historyStacks[this.activeChannel];
    }

    setChannel(channel) {
        if (channel !== 'intra' && channel !== 'external') channel = 'intra';
        this.activeChannel = channel;
        return this.state;
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
        st.pitcherOrder = Array.isArray(st.pitcherOrder) ? st.pitcherOrder : Object.values(st.pitcherOrder || {});
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
        if (st.awayCatcherId === undefined) st.awayCatcherId = this.findDefaultCatcherId(st.awayLineup, st.awayTeamId);
        if (st.homeCatcherId === undefined) st.homeCatcherId = this.findDefaultCatcherId(st.homeLineup, st.homeTeamId);
        if (st.lastBatterId === undefined) st.lastBatterId = null;
        if (st.lastBatterTeamId === undefined) st.lastBatterTeamId = null;
        if (st.lastPlayType === undefined) st.lastPlayType = '';
        st.unearnedInning = Boolean(st.unearnedInning);
        return st;
    }

    findDefaultCatcherId(lineup = [], teamId = '') {
        if (typeof window === 'undefined' || !window.store) return (lineup && lineup[1]) || (lineup && lineup[0]) || '';
        const list = Array.isArray(lineup) ? lineup : [];
        for (const pid of list) {
            const p = window.store.getPlayer(pid);
            if (p && /C|捕/.test(p.pos || '')) return pid;
        }
        if (teamId && typeof window.store.getPlayersByTeam === 'function') {
            const teamPlayers = window.store.getPlayersByTeam(teamId) || [];
            const c = teamPlayers.find(p => p && /C|捕/.test(p.pos || ''));
            if (c) return c.id;
        }
        return list[1] || list[0] || '';
    }

    loadChannelState(channel) {
        try {
            const key = LIVE_STORAGE_KEYS[channel];
            let raw = localStorage.getItem(key);
            // 向後相容：若該頻道無快取，嘗試自舊版單一 key 讀取並遷移
            if (!raw) {
                const legacy = localStorage.getItem(LIVE_GAME_STORAGE_KEY) || localStorage.getItem('YOUTH_BASEBALL_JJ_LIVE_V3');
                if (legacy) {
                    const parsed = JSON.parse(legacy);
                    if (parsed && Boolean(parsed.isExternal) === (channel === 'external')) {
                        raw = legacy;
                    }
                }
            }
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.awayTeamId && parsed.homeTeamId) return this.normalizeState(parsed);
            }
        } catch (e) {}
        return null;
    }

    loadLiveState() {
        return this.loadChannelState(this.activeChannel);
    }

    async saveLiveState(syncServer = true, targetChannel = this.activeChannel) {
        const curState = this.channels[targetChannel];
        const key = LIVE_STORAGE_KEYS[targetChannel];
        try {
            if (curState) {
                localStorage.setItem(key, JSON.stringify(curState));
            } else {
                localStorage.removeItem(key);
            }
        } catch (e) {}

        if (syncServer && window.store) {
            const now = Date.now();
            this.lastTimestamps[targetChannel] = now;
            this.lastLiveTimestamp = now;

            // 1. Firebase 雙頻道獨立節點儲存 (/jj_baseball/live_intra.json & /jj_baseball/live_external.json)
            if (window.store.firebaseDbUrl) {
                try {
                    await fetch(`${window.store.firebaseDbUrl}/jj_baseball/live_${targetChannel}.json`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ _updatedAt: now, state: curState })
                    });
                    // 同步寫入向後相容節點 live_game.json（僅在此頻道進行中或更新時）
                    if (curState) {
                        await fetch(`${window.store.firebaseDbUrl}/jj_baseball/live_game.json`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ _updatedAt: now, state: curState })
                        });
                    }
                } catch (e) {}
            }

            // 2. 本機 Node.js 伺服器雙頻道儲存
            if (window.store.serverAvailable) {
                try {
                    await fetch('/api/live', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ channel: targetChannel, liveState: curState })
                    });
                } catch (e) {}
            }
        }
    }

    pushHistory() {
        if (!this.state) return;
        const stack = this.historyStack;
        stack.push(JSON.parse(JSON.stringify(this.state)));
        if (stack.length > 35) {
            stack.shift();
        }
    }

    undo() {
        const stack = this.historyStack;
        if (stack.length === 0) return false;
        this.state = stack.pop();
        this.saveLiveState();
        return true;
    }

    cancelLiveGame(targetChannel = this.activeChannel) {
        this.channels[targetChannel] = null;
        if (this.historyStacks[targetChannel]) {
            this.historyStacks[targetChannel] = [];
        }
        try {
            localStorage.removeItem(LIVE_STORAGE_KEYS[targetChannel]);
        } catch (e) {}
        this.saveLiveState(true, targetChannel);
    }

    /**
     * 開啟新比賽（預設 4 局制 ＋ 同隊投手投球制）
     */
    startNewGame(config) {
        const isExternal = Boolean(config.isExternal);
        const channel = isExternal ? 'external' : 'intra';
        this.activeChannel = channel;

        const maxInnings = Number(config.innings) || 4;
        const sameTeamPitcher = isExternal ? false : (config.sameTeamPitcher !== undefined ? Boolean(config.sameTeamPitcher) : true);
        const awayTeamId = config.awayTeamId;
        const homeTeamId = config.homeTeamId;
        const awayLineup = config.awayLineup || [];
        const homeLineup = config.homeLineup || [];
        const awayStarterId = config.awayStarterId || awayLineup[0] || '';
        const homeStarterId = config.homeStarterId || homeLineup[0] || '';

        const battingStats = {};
        awayLineup.forEach(pid => {
            battingStats[pid] = this.createEmptyBatterLine(pid, awayTeamId);
        });
        homeLineup.forEach(pid => {
            battingStats[pid] = this.createEmptyBatterLine(pid, homeTeamId);
        });

        const pitchingStats = {};
        if (awayStarterId) {
            pitchingStats[awayStarterId] = this.createEmptyPitcherLine(awayStarterId, awayTeamId, 1);
        }
        if (homeStarterId) {
            pitchingStats[homeStarterId] = this.createEmptyPitcherLine(homeStarterId, homeTeamId, 1);
        }

        const awayTeam = window.store.getTeam(awayTeamId);
        const homeTeam = window.store.getTeam(homeTeamId);

        this.historyStacks[channel] = [];
        this.channels[channel] = {
            id: 'g_' + Date.now(),
            date: config.date || new Date().toISOString().slice(0, 10),
            tournament: config.tournament || (isExternal ? '對外友誼賽 / 盃賽' : '隊內三隊爭霸練習賽 (4局制)'),
            isExternal,
            channel,
            opponentName: config.opponentName || '',
            awayTeamId,
            homeTeamId,
            maxInnings,
            sameTeamPitcher, // true: 自己隊伍投手投給自己隊打 | false: 對手投手投球
            inning: 1,
            half: 'top', // 'top': 上半局(先攻隊打擊) | 'bottom': 下半局(後攻隊打擊)
            balls: 0,
            strikes: 0,
            outs: 0,
            bases: {
                first: null,
                second: null,
                third: null
            },
            awayScore: 0,
            homeScore: 0,
            awayHits: 0,
            homeHits: 0,
            awayErrors: 0,
            homeErrors: 0,
            lineScore: {
                away: Array(maxInnings).fill(0),
                home: Array(maxInnings).fill(0)
            },
            awayLineup,
            homeLineup,
            awayBatterIndex: 0,
            homeBatterIndex: 0,
            awayPitcherId: awayStarterId,
            homePitcherId: homeStarterId,
            awayCatcherId: config.awayCatcherId || this.findDefaultCatcherId(awayLineup, awayTeamId),
            homeCatcherId: config.homeCatcherId || this.findDefaultCatcherId(homeLineup, homeTeamId),
            lastBatterId: null,
            lastBatterTeamId: null,
            lastPlayType: '',
            unearnedInning: false,
            pitcherOrder: [awayStarterId, homeStarterId].filter(Boolean),
            battingStats,
            pitchingStats,
            playByPlay: []
        };

        this.saveLiveState(true, channel);
        return this.channels[channel];
    }

    createEmptyBatterLine(playerId, teamId) {
        return {
            playerId, teamId,
            pa: 0, ab: 0, h: 0, b1: 0, b2: 0, b3: 0, hr: 0,
            rbi: 0, r: 0, bb: 0, hbp: 0, so: 0, sac: 0, sf: 0, sb: 0, cs: 0, roe: 0,
            ccs: 0, fc: 0
        };
    }

    createEmptyPitcherLine(playerId, teamId, gs = 0) {
        return {
            playerId, teamId,
            gs, outs: 0, np: 0, strikes: 0, bf: 0,
            h: 0, hr: 0, bb: 0, hbp: 0, so: 0, wp: 0, pk: 0, r: 0, er: 0, decision: ''
        };
    }

    ensureBatterLine(playerId, teamId) {
        if (!this.state.battingStats) this.state.battingStats = {};
        if (!this.state.battingStats[playerId]) {
            const p = window.store.getPlayer(playerId);
            this.state.battingStats[playerId] = this.createEmptyBatterLine(playerId, teamId || (p ? p.teamId : ''));
        }
        return this.state.battingStats[playerId];
    }

    ensurePitcherLine(playerId, teamId) {
        if (!this.state.pitchingStats) this.state.pitchingStats = {};
        if (!Array.isArray(this.state.pitcherOrder)) this.state.pitcherOrder = [];
        if (!this.state.pitchingStats[playerId]) {
            const p = window.store.getPlayer(playerId);
            this.state.pitchingStats[playerId] = this.createEmptyPitcherLine(playerId, teamId || (p ? p.teamId : ''), 0);
            if (!this.state.pitcherOrder.includes(playerId)) {
                this.state.pitcherOrder.push(playerId);
            }
        }
        return this.state.pitchingStats[playerId];
    }

    getInningLabel() {
        if (!this.state) return '';
        return `${this.state.inning}局${this.state.half === 'top' ? '上' : '下'}`;
    }

    /**
     * 取得目前進攻隊伍、守備隊伍與「負責投球的隊伍」
     * 隊內練習賽 (sameTeamPitcher = true) 時，投手來自「自己隊伍 (battingTeamId)」！
     */
    getActiveTeams() {
        if (!this.state) return {};
        const isTop = this.state.half === 'top';
        const battingTeamId = isTop ? this.state.awayTeamId : this.state.homeTeamId;
        const fieldingTeamId = isTop ? this.state.homeTeamId : this.state.awayTeamId;
        const pitcherTeamId = this.state.sameTeamPitcher !== false ? battingTeamId : fieldingTeamId;

        return {
            isTop,
            battingTeamId,
            fieldingTeamId,
            pitcherTeamId,
            battingTeam: window.store.getTeam(battingTeamId),
            fieldingTeam: window.store.getTeam(fieldingTeamId),
            pitcherTeam: window.store.getTeam(pitcherTeamId)
        };
    }

    /**
     * 取得目前場上打者與場上投手
     * 當 sameTeamPitcher = true 時：
     * - 上半局 (先攻隊打擊)：打者是 awayLineup，投手也是先攻隊的 awayPitcherId！
     * - 下半局 (後攻隊打擊)：打者是 homeLineup，投手也是後攻隊的 homePitcherId！
     */
    getCurrentMatchup() {
        if (!this.state) return { batter: null, pitcher: null };
        const isTop = this.state.half === 'top';
        const sameTeam = this.state.sameTeamPitcher !== false;

        const lineup = isTop ? this.state.awayLineup : this.state.homeLineup;
        const bIdx = isTop ? this.state.awayBatterIndex : this.state.homeBatterIndex;
        const batterId = lineup.length > 0 ? lineup[bIdx % lineup.length] : null;
        const battingTeamId = isTop ? this.state.awayTeamId : this.state.homeTeamId;

        let batter = batterId ? window.store.getPlayer(batterId) : null;
        if (!batter && (batterId === 'opp_batter' || String(battingTeamId || '').startsWith('OPP'))) {
            const oppTeam = window.store.getTeam(battingTeamId);
            batter = { id: batterId || 'opp_batter', name: `${oppTeam.name}選手`, number: '對手', teamId: battingTeamId, pos: '選手' };
        }

        const pitcherId = sameTeam
            ? (isTop ? this.state.awayPitcherId : this.state.homePitcherId)
            : (isTop ? this.state.homePitcherId : this.state.awayPitcherId);
        const pitcherTeamId = sameTeam ? battingTeamId : (isTop ? this.state.homeTeamId : this.state.awayTeamId);

        let pitcher = pitcherId ? window.store.getPlayer(pitcherId) : null;
        if (!pitcher && (pitcherId === 'opp_sp' || pitcherId === 'opp_batter' || String(pitcherTeamId || '').startsWith('OPP'))) {
            const oppTeam = window.store.getTeam(pitcherTeamId);
            pitcher = { id: pitcherId || 'opp_sp', name: `${oppTeam.name}投手`, number: '1', teamId: pitcherTeamId, pos: 'P / 投手' };
        }

        const catcherTeamId = isTop ? this.state.homeTeamId : this.state.awayTeamId;
        const catcherId = isTop ? this.state.homeCatcherId : this.state.awayCatcherId;
        let catcher = catcherId ? window.store.getPlayer(catcherId) : null;
        if (!catcher && catcherTeamId) {
            if (catcherId && String(catcherId).startsWith('opp_cust_')) {
                const parts = String(catcherId).split('_');
                catcher = { id: catcherId, name: parts.slice(3).join('_') || '捕手', number: parts[2] || '2', teamId: catcherTeamId, pos: 'C / 捕手' };
            } else if (String(catcherTeamId).startsWith('OPP')) {
                const oppTeam = window.store.getTeam(catcherTeamId, this.state.opponentName);
                catcher = { id: catcherId || 'opp_c', name: `${oppTeam.name}捕手`, number: '2', teamId: catcherTeamId, pos: 'C / 捕手' };
            }
        }

        return {
            orderNo: lineup.length > 0 ? (bIdx % lineup.length) + 1 : 1,
            batter,
            pitcher,
            catcher
        };
    }

    updateInGamePlayer(oldId, newName, newNumber) {
        if (!this.state) return;
        this.pushHistory();
        const cleanName = (newName || '').trim();
        const cleanNum = (newNumber || '').trim();
        if (!cleanName) return;

        const newId = `opp_cust_${cleanNum || '0'}_${cleanName}`;
        this.state.awayLineup = (this.state.awayLineup || []).map(id => id === oldId ? newId : id);
        this.state.homeLineup = (this.state.homeLineup || []).map(id => id === oldId ? newId : id);
        if (this.state.awayPitcherId === oldId) this.state.awayPitcherId = newId;
        if (this.state.homePitcherId === oldId) this.state.homePitcherId = newId;

        ['first', 'second', 'third'].forEach(baseKey => {
            const r = this.state.bases[baseKey];
            if (r && (r.playerId === oldId || r.id === oldId)) {
                r.playerId = newId;
                r.name = cleanName;
                r.number = cleanNum;
            }
        });

        if (this.state.battingStats && this.state.battingStats[oldId]) {
            this.state.battingStats[newId] = this.state.battingStats[oldId];
            delete this.state.battingStats[oldId];
        }
        if (this.state.pitchingStats && this.state.pitchingStats[oldId]) {
            this.state.pitchingStats[newId] = this.state.pitchingStats[oldId];
            delete this.state.pitchingStats[oldId];
        }

        this.addLog(`更換選手：#${cleanNum} ${cleanName}`);
        this.saveLiveState();
    }

    getBasesSnapshotText() {
        if (!this.state || !this.state.bases) return '無人在壘';
        const b = this.state.bases;
        const parts = [];
        if (b.first) parts.push(`一壘:${b.first.name}`);
        if (b.second) parts.push(`二壘:${b.second.name}`);
        if (b.third) parts.push(`三壘:${b.third.name}`);
        return parts.length > 0 ? parts.join('、') : '無人在壘';
    }

    addLog(text) {
        const awayS = this.state ? (Number(this.state.awayScore) || 0) : 0;
        const homeS = this.state ? (Number(this.state.homeScore) || 0) : 0;
        const outs = this.state ? (Number(this.state.outs) || 0) : 0;
        this.state.playByPlay.unshift({
            inning: this.getInningLabel(),
            time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
            score: `${awayS}:${homeS}`,
            outs: `${outs}出局`,
            bases: this.getBasesSnapshotText(),
            text
        });
    }

    addRuns(runs, isEarned = true, earnedRunsCount = null) {
        if (runs <= 0) return;
        const isTop = this.state.half === 'top';
        const idx = this.state.inning - 1;
        while (this.state.lineScore.away.length <= idx) {
            this.state.lineScore.away.push(0);
            this.state.lineScore.home.push(0);
        }

        if (isTop) {
            this.state.awayScore += runs;
            this.state.lineScore.away[idx] = (Number(this.state.lineScore.away[idx]) || 0) + runs;
        } else {
            this.state.homeScore += runs;
            this.state.lineScore.home[idx] = (Number(this.state.lineScore.home[idx]) || 0) + runs;
        }

        const erToAdd = earnedRunsCount !== null
            ? Math.max(0, Number(earnedRunsCount) || 0)
            : (isEarned ? runs : 0);

        const { pitcher } = this.getCurrentMatchup();
        if (pitcher) {
            const pLine = this.ensurePitcherLine(pitcher.id, pitcher.teamId);
            pLine.r += runs;
            pLine.er += erToAdd;
        }
    }

    scoreRunners(scoredPlayers = [], options = {}) {
        const list = Array.isArray(scoredPlayers) ? scoredPlayers.filter(Boolean) : [];
        if (list.length === 0) return { totalRuns: 0, earnedRuns: 0, unearnedRuns: 0 };

        const { playForceUnearned = false, explicitUnearned = undefined } = options;
        let earnedRuns = 0;

        list.forEach(sp => {
            if (sp && sp.playerId) {
                this.ensureBatterLine(sp.playerId, sp.teamId).r += 1;
            }
            const isRunUnearned = explicitUnearned !== undefined
                ? Boolean(explicitUnearned)
                : Boolean(playForceUnearned || this.state.unearnedInning || (sp && sp.isUnearned));
            if (!isRunUnearned) {
                earnedRuns += 1;
            }
        });

        const totalRuns = list.length;
        this.addRuns(totalRuns, earnedRuns > 0, earnedRuns);
        return {
            totalRuns,
            earnedRuns,
            unearnedRuns: totalRuns - earnedRuns
        };
    }

    recordPitch(type) {
        if (!this.state) return;
        this.pushHistory();

        const { batter, pitcher } = this.getCurrentMatchup();
        const batterName = batter ? batter.name : '';
        const pLine = pitcher ? this.ensurePitcherLine(pitcher.id, pitcher.teamId) : null;

        if (type === 'strike_looking' || type === 'strike_swinging') {
            if (pLine) {
                pLine.np += 1;
                pLine.strikes += 1;
            }
            this.state.strikes += 1;
            if (this.state.strikes >= 3) {
                this.recordPlay({ type: 'SO', autoFromPitch: true });
                if (this.historyStack.length >= 2) this.historyStack.pop();
                return;
            }
            this.addLog(`${batterName} ${type === 'strike_looking' ? '好球' : '揮棒落空'}`.trim());
        } else if (type === 'foul') {
            if (pLine) {
                pLine.np += 1;
                pLine.strikes += 1;
            }
            if (this.state.strikes < 2) {
                this.state.strikes += 1;
            }
            this.addLog(`${batterName} 界外球`.trim());
        } else if (type === 'ball') {
            if (pLine) {
                pLine.np += 1;
            }
            this.state.balls += 1;
            if (this.state.balls >= 4) {
                this.recordPlay({ type: 'BB', autoFromPitch: true });
                if (this.historyStack.length >= 2) this.historyStack.pop();
                return;
            }
            this.addLog(`${batterName} 壞球`.trim());
        } else if (type === 'wp') {
            if (pLine) {
                pLine.np += 1;
                pLine.wp = (pLine.wp || 0) + 1;
            }
            const b = this.state.bases;
            let wpScoredPlayer = null;
            if (b.third) {
                wpScoredPlayer = b.third;
                b.third = null;
            }
            if (b.second) {
                b.third = b.second;
                b.second = null;
            }
            if (b.first) {
                b.second = b.first;
                b.first = null;
            }
            let wpRuns = 0;
            if (wpScoredPlayer) {
                const res = this.scoreRunners([wpScoredPlayer]);
                wpRuns = res.totalRuns;
            }
            this.state.balls += 1;
            const pitcherLabel = pitcher ? pitcher.name : '';
            this.addLog(`${pitcherLabel} 暴投${wpRuns > 0 ? `（失${wpRuns}分）` : ''}`.trim());
            if (this.state.balls >= 4) {
                this.recordPlay({ type: 'BB', autoFromPitch: true });
                if (this.historyStack.length >= 2) {
                    this.historyStack.pop();
                }
                return;
            }
        }

        this.saveLiveState();
    }

    advanceRunners(basesCount, batterRunner) {
        let runsScored = 0;
        const scoredPlayers = [];
        const b = this.state.bases;
        const oldFirst = b.first;
        const oldSecond = b.second;
        const oldThird = b.third;

        if (basesCount === 1) {
            // 一壘安打 (1B) / 保送 (BB/HBP) / 失誤 (ROE)：打者上一壘
            // 除非壘上跑者強制進壘，否則不移動壘上跑者
            if (oldFirst && oldSecond && oldThird) {
                // 滿壘：全部強制進壘，三壘跑者回本壘得分
                runsScored += 1;
                scoredPlayers.push(oldThird);
                b.third = oldSecond;
                b.second = oldFirst;
                b.first = batterRunner;
            } else if (oldFirst && oldSecond) {
                // 一二壘有人：一二壘強制進壘，三壘若是空的補上
                b.third = oldSecond;
                b.second = oldFirst;
                b.first = batterRunner;
            } else if (oldFirst && oldThird) {
                // 一三壘有人：一壘跑者被強制推至二壘；三壘跑者「非強制進壘」，留在三壘！
                b.third = oldThird;
                b.second = oldFirst;
                b.first = batterRunner;
            } else if (oldFirst) {
                // 僅一壘有人：一壘跑者強制進二壘
                b.second = oldFirst;
                b.first = batterRunner;
            } else {
                // 一壘無人：打者上一壘；二壘、三壘跑者「非強制進壘」，皆留在原壘包！
                b.first = batterRunner;
            }
        } else if (basesCount === 2) {
            // 二壘安打 (2B)：打者上二壘
            // 除非壘上跑者強制進壘，否則不移動壘上跑者
            b.first = null;
            b.second = batterRunner;

            if (oldFirst && oldSecond && oldThird) {
                // 滿壘：二、三壘跑者強制回本壘得分，一壘跑者強制推上三壘
                runsScored += 2;
                scoredPlayers.push(oldThird, oldSecond);
                b.third = oldFirst;
            } else if (oldFirst && oldSecond) {
                // 一二壘有人：二壘跑者回本壘得分，一壘跑者推進至三壘
                runsScored += 1;
                scoredPlayers.push(oldSecond);
                b.third = oldFirst;
            } else if (oldSecond && oldThird) {
                // 二三壘有人：二壘跑者推至三壘，三壘跑者推回本壘得分
                runsScored += 1;
                scoredPlayers.push(oldThird);
                b.third = oldSecond;
            } else if (oldFirst && oldThird) {
                // 一三壘有人：一壘跑者推至三壘，三壘跑者推回本壘得分
                runsScored += 1;
                scoredPlayers.push(oldThird);
                b.third = oldFirst;
            } else if (oldSecond) {
                // 僅二壘有人：二壘跑者推至三壘
                b.third = oldSecond;
            } else if (oldFirst) {
                // 僅一壘有人：一壘跑者推至三壘
                b.third = oldFirst;
            } else if (oldThird) {
                // 僅三壘有人：三壘跑者非強制進壘，留在三壘！
                b.third = oldThird;
            }
        } else if (basesCount === 3) {
            // 三壘安打 (3B)：打者上三壘，所有壘上跑者皆強制回本壘得分
            [oldThird, oldSecond, oldFirst].forEach(runner => {
                if (runner) {
                    runsScored += 1;
                    scoredPlayers.push(runner);
                }
            });
            b.first = null;
            b.second = null;
            b.third = batterRunner;
        } else if (basesCount === 4) {
            // 全壘打 (HR)：壘上跑者與打者全部回本壘得分
            [oldThird, oldSecond, oldFirst].forEach(runner => {
                if (runner) {
                    runsScored += 1;
                    scoredPlayers.push(runner);
                }
            });
            runsScored += 1;
            scoredPlayers.push(batterRunner);
            b.first = null;
            b.second = null;
            b.third = null;
        }

        return { runsScored, scoredPlayers };
    }

    recordPlay(options) {
        if (!this.state) return;
        this.pushHistory();

        const type = options.type;
        const { isTop, battingTeam, pitcherTeam } = this.getActiveTeams();
        const { batter, pitcher } = this.getCurrentMatchup();

        if (!batter) return;
        const bLine = this.ensureBatterLine(batter.id, battingTeam.id);
        const pLine = pitcher ? this.ensurePitcherLine(pitcher.id, pitcherTeam.id) : null;

        bLine.pa += 1;
        if (pLine) {
            pLine.bf += 1;
            if (!options.autoFromPitch) {
                pLine.np += 1;
                if (type !== 'BB' && type !== 'HBP') pLine.strikes += 1;
            }
        }

        const runnerObj = { playerId: batter.id, teamId: battingTeam.id, name: batter.name, number: batter.number };
        let resultLabel = type;

        if (['1B', '2B', '3B', 'HR'].includes(type)) {
            bLine.ab += 1;
            bLine.h += 1;
            if (isTop) this.state.awayHits += 1;
            else this.state.homeHits += 1;

            if (pLine) {
                pLine.h += 1;
                if (type === 'HR') pLine.hr += 1;
            }

            const baseMap = { '1B': 1, '2B': 2, '3B': 3, 'HR': 4 };
            const labelMap = { '1B': '一壘安打', '2B': '二壘安打', '3B': '三壘安打', 'HR': '全壘打' };
            if (type === '1B') bLine.b1 += 1;
            if (type === '2B') bLine.b2 += 1;
            if (type === '3B') bLine.b3 += 1;
            if (type === 'HR') bLine.hr += 1;

            const { runsScored, scoredPlayers } = this.advanceRunners(baseMap[type], runnerObj);
            bLine.rbi += runsScored;
            const runRes = this.scoreRunners(scoredPlayers);
            const scoredNames = scoredPlayers.filter(Boolean).map(p => p.name).join('、');
            const rbiSuffix = runsScored > 0
                ? `（送回 ${scoredNames} 得分，+${runsScored}打點${runRes.unearnedRuns > 0 ? (runRes.earnedRuns === 0 ? ' [非自責]' : ` [含${runRes.unearnedRuns}非自責]`) : ''}）`
                : '';
            resultLabel = `${labelMap[type]}${rbiSuffix}`;
        } else if (type === 'BB' || type === 'HBP') {
            if (type === 'BB') { bLine.bb += 1; if (pLine) pLine.bb += 1; }
            if (type === 'HBP') { bLine.hbp += 1; if (pLine) pLine.hbp += 1; }
            runnerObj.isWalk = true;
            const { runsScored, scoredPlayers } = this.advanceRunners(1, runnerObj);
            bLine.rbi += runsScored;
            const runRes = this.scoreRunners(scoredPlayers);
            const scoredNames = scoredPlayers.filter(Boolean).map(p => p.name).join('、');
            const rbiSuffix = runsScored > 0
                ? `（送回 ${scoredNames} 擠回得分，+${runsScored}打點${runRes.unearnedRuns > 0 ? ' [非自責]' : ''}）`
                : '';
            resultLabel = `${type === 'BB' ? '四壞保送' : '觸身球'}${rbiSuffix}`;
        } else if (type === 'ROE') {
            bLine.ab += 1;
            bLine.roe += 1;
            if (isTop) this.state.homeErrors += 1;
            else this.state.awayErrors += 1;
            runnerObj.isUnearned = true;
            if (this.state.outs === 2) {
                this.state.unearnedInning = true;
            }
            const { scoredPlayers } = this.advanceRunners(1, runnerObj);
            this.scoreRunners(scoredPlayers, { playForceUnearned: true });
            const scoredNames = scoredPlayers.filter(Boolean).map(p => p.name).join('、');
            resultLabel = `失誤上壘${scoredNames ? `（送回 ${scoredNames} 得分，非打點/非自責）` : ''}`;
        } else if (type === 'FC') {
            bLine.ab += 1;
            bLine.fc = (bLine.fc || 0) + 1;
            const { runsScored, scoredPlayers } = this.advanceRunners(1, runnerObj);
            bLine.rbi += runsScored;
            const runRes = scoredPlayers.length > 0 ? this.scoreRunners(scoredPlayers) : { unearnedRuns: 0 };
            const scoredNames = scoredPlayers.filter(Boolean).map(p => p.name).join('、');
            const rbiSuffix = runsScored > 0
                ? `（送回 ${scoredNames} 得分，+${runsScored}打點${runRes.unearnedRuns > 0 ? ' [非自責]' : ''}）`
                : '';
            resultLabel = `野手選擇上壘${rbiSuffix}`;
        } else if (type === 'SO') {
            bLine.ab += 1;
            bLine.so += 1;
            if (pLine) {
                pLine.so += 1;
                pLine.outs += 1;
            }
            this.state.outs += 1;
            resultLabel = '三振出局';
        } else if (type === 'K_SAFE') {
            bLine.ab += 1;
            bLine.so += 1;
            if (pLine) {
                pLine.so += 1;
            }
            const { scoredPlayers } = this.advanceRunners(1, runnerObj);
            if (scoredPlayers.length > 0) {
                this.scoreRunners(scoredPlayers);
            }
            const scoredNames = scoredPlayers.filter(Boolean).map(p => p.name).join('、');
            resultLabel = `不死三振上壘${scoredNames ? `（送回 ${scoredNames} 得分）` : ''}`;
        } else if (type === 'GO' || type === 'FO') {
            bLine.ab += 1;
            if (pLine) pLine.outs += 1;
            this.state.outs += 1;
            resultLabel = type === 'GO' ? '滾地出局' : '飛球出局';
        } else if (type === 'DP') {
            bLine.ab += 1;
            const addedOuts = Math.min(2, 3 - this.state.outs);
            if (pLine) pLine.outs += addedOuts;
            this.state.outs += addedOuts;
            if (this.state.bases.first) this.state.bases.first = null;
            else if (this.state.bases.second) this.state.bases.second = null;
            resultLabel = '雙殺出局';
        } else if (type === 'SAC') {
            bLine.sac += 1;
            if (pLine) pLine.outs += 1;
            this.state.outs += 1;
            let sacScoredName = '';
            let sacRunRes = { unearnedRuns: 0 };
            if (this.state.outs < 3) {
                if (this.state.bases.third) {
                    const sp = this.state.bases.third;
                    this.state.bases.third = null;
                    bLine.rbi += 1;
                    sacRunRes = this.scoreRunners([sp]);
                    sacScoredName = sp ? sp.name : '';
                }
                if (this.state.bases.second && !this.state.bases.third) {
                    this.state.bases.third = this.state.bases.second;
                    this.state.bases.second = null;
                }
                if (this.state.bases.first && !this.state.bases.second) {
                    this.state.bases.second = this.state.bases.first;
                    this.state.bases.first = null;
                }
            }
            resultLabel = `犧牲觸擊${sacScoredName ? `（送回 ${sacScoredName} 得分，+1打點${sacRunRes.unearnedRuns > 0 ? ' [非自責]' : ''}）` : ''}`;
        } else if (type === 'SF') {
            bLine.sf += 1;
            if (pLine) pLine.outs += 1;
            this.state.outs += 1;
            let sfScoredName = '';
            let sfRunRes = { unearnedRuns: 0 };
            if (this.state.outs < 3 && this.state.bases.third) {
                const sp = this.state.bases.third;
                this.state.bases.third = null;
                bLine.rbi += 1;
                sfRunRes = this.scoreRunners([sp]);
                sfScoredName = sp ? sp.name : '';
            }
            resultLabel = `高飛犧牲打${sfScoredName ? `（送回 ${sfScoredName} 得分，+1打點${sfRunRes.unearnedRuns > 0 ? ' [非自責]' : ''}）` : ''}`;
        }

        // 記錄上一個完成打席的打者（供後續跑者得分「計打點得分」時歸屬打點）
        this.state.lastBatterId = batter.id;
        this.state.lastBatterTeamId = battingTeam.id;
        this.state.lastPlayType = type;

        // 僅播報「選手名字 ＋ 結果」
        this.addLog(`${batter.name} ${resultLabel}`);

        if (isTop) {
            this.state.awayBatterIndex = (this.state.awayBatterIndex + 1) % Math.max(1, this.state.awayLineup.length);
        } else {
            this.state.homeBatterIndex = (this.state.homeBatterIndex + 1) % Math.max(1, this.state.homeLineup.length);
        }

        this.state.balls = 0;
        this.state.strikes = 0;

        if (this.state.outs >= 3) {
            this.switchHalfInning(false);
        }

        this.saveLiveState();
    }

    recordFieldingError() {
        if (!this.state) return;
        this.pushHistory();
        const { isTop, fieldingTeam } = this.getActiveTeams();
        if (isTop) {
            this.state.homeErrors = (Number(this.state.homeErrors) || 0) + 1;
        } else {
            this.state.awayErrors = (Number(this.state.awayErrors) || 0) + 1;
        }
        const totalE = isTop ? this.state.homeErrors : this.state.awayErrors;
        this.addLog(`${fieldingTeam ? fieldingTeam.name : '守備方'} 守備失誤 (累計${totalE}次)`);
        this.saveLiveState();
    }

    handleRunnerAction(baseKey, action, extraOptions = {}) {
        if (!this.state || !this.state.bases[baseKey]) return { ok: false };

        const nextBaseMap = { first: 'second', second: 'third', third: 'home' };
        const nextBaseLabelMap = { second: '二壘', third: '三壘', home: '本壘' };
        const nextBase = nextBaseMap[baseKey];

        if ((action === 'SB' || action === 'WP' || action === 'ADVANCE') && nextBase !== 'home' && this.state.bases[nextBase]) {
            return { ok: false, error: 'BLOCKED_BY_LEAD_RUNNER', nextBase, nextBaseLabel: nextBaseLabelMap[nextBase] };
        }

        this.pushHistory();

        const runner = this.state.bases[baseKey];
        const isTop = this.state.half === 'top';
        const fieldingTeamId = isTop ? this.state.homeTeamId : this.state.awayTeamId;
        const { pitcher } = this.getCurrentMatchup();
        const pLine = pitcher ? this.ensurePitcherLine(pitcher.id, pitcher.teamId) : null;

        const recordRunnerOut = (logText) => {
            if (pLine) pLine.outs += 1;
            this.state.bases[baseKey] = null;
            this.state.outs += 1;
            this.addLog(logText);
            if (this.state.outs >= 3) this.switchHalfInning(false);
        };

        const explicitUnearnedOpt = typeof extraOptions.isUnearned === 'boolean' ? extraOptions.isUnearned : undefined;
        if (explicitUnearnedOpt === true) {
            runner.isUnearned = true;
        }

        const advanceRunnerOneBase = (logText) => {
            this.state.bases[baseKey] = null;
            if (nextBase === 'home') {
                const runRes = this.scoreRunners([runner], { explicitUnearned: explicitUnearnedOpt });
                this.addLog(`${logText}${runRes.unearnedRuns > 0 ? '（非自責分）' : ''}`);
            } else {
                this.state.bases[nextBase] = runner;
                this.addLog(logText);
            }
        };

        if (action === 'SB') {
            if (runner.playerId) {
                this.ensureBatterLine(runner.playerId, runner.teamId).sb += 1;
            }
            advanceRunnerOneBase(`${runner.name} 盜壘成功`);
        } else if (action === 'ADVANCE') {
            advanceRunnerOneBase(`${runner.name} 進壘${nextBase === 'home' ? '回本壘得分' : `上${nextBaseLabelMap[nextBase]}`}`);
        } else if (action === 'CS') {
            if (runner.playerId) {
                this.ensureBatterLine(runner.playerId, runner.teamId).cs += 1;
            }
            let catcherId = extraOptions.catcherId;
            if (catcherId) {
                if (isTop) this.state.homeCatcherId = catcherId;
                else this.state.awayCatcherId = catcherId;
            } else {
                catcherId = isTop ? this.state.homeCatcherId : this.state.awayCatcherId;
            }
            let catcherName = '';
            if (catcherId && catcherId !== 'opp_batter') {
                const cLine = this.ensureBatterLine(catcherId, fieldingTeamId);
                cLine.ccs = (cLine.ccs || 0) + 1;
                const cp = window.store?.getPlayer?.(catcherId);
                catcherName = cp ? cp.name : '';
            }
            recordRunnerOut(`${runner.name} 盜壘失敗出局${catcherName ? `（捕手${catcherName}阻殺）` : '（捕手阻殺）'}`);
        } else if (action === 'PICKOFF' || action === 'TAG_OUT') {
            if (pLine) pLine.pk = (pLine.pk || 0) + 1;
            recordRunnerOut(`${runner.name} 遭投手牽制出局`);
        } else if (action === 'RUNNER_OUT') {
            recordRunnerOut(`${runner.name} 跑者出局`);
        } else if (action === 'RUNNER_ERROR') {
            recordRunnerOut(`${runner.name} 跑壘失誤出局`);
        } else if (action === 'WP') {
            if (pLine) pLine.wp = (pLine.wp || 0) + 1;
            advanceRunnerOneBase(`${runner.name} 暴投推進`);
        } else if (action === 'SCORE_RBI') {
            this.state.bases[baseKey] = null;
            const rbiPid = extraOptions.rbiBatterId !== undefined ? extraOptions.rbiBatterId : this.state.lastBatterId;
            let rbiBatterName = '';
            if (rbiPid) {
                const rbiLine = this.ensureBatterLine(rbiPid, this.state.lastBatterTeamId || runner.teamId);
                rbiLine.rbi = (rbiLine.rbi || 0) + 1;
                const rp = window.store?.getPlayer?.(rbiPid);
                rbiBatterName = rp ? rp.name : '';
            }
            const runRes = this.scoreRunners([runner], { explicitUnearned: explicitUnearnedOpt });
            const ueTag = runRes.unearnedRuns > 0 ? ' [非自責]' : '';
            this.addLog(`${runner.name} 跑回本壘得分${rbiBatterName ? `（${rbiBatterName} +1打點${ueTag}）` : `（計1打點${ueTag}）`}`);
        } else if (action === 'SCORE_NO_RBI' || action === 'SCORE') {
            this.state.bases[baseKey] = null;
            const runRes = this.scoreRunners([runner], { explicitUnearned: explicitUnearnedOpt });
            const ueTag = runRes.unearnedRuns > 0 ? '、非自責分' : '';
            this.addLog(`${runner.name} 跑回本壘得分（不計打點${ueTag}）`);
        } else if (action === 'REMOVE') {
            this.state.bases[baseKey] = null;
        }

        this.saveLiveState();
        return { ok: true };
    }

    changeCatcher(newCatcherId, silentPush = false) {
        if (!this.state || !newCatcherId) return;
        if (!silentPush) this.pushHistory();
        if (this.state.half === 'top') this.state.homeCatcherId = newCatcherId;
        else this.state.awayCatcherId = newCatcherId;
        this.saveLiveState();
    }

    resolveSubPlayer(teamId, newPlayerId, customInfo = null) {
        if (newPlayerId === '__CUSTOM__' && customInfo && customInfo.name) {
            const cleanName = String(customInfo.name).trim();
            const cleanNum = String(customInfo.number || '0').trim();
            if (!cleanName) return null;
            const pid = `opp_cust_${cleanNum}_${cleanName}`;
            return { playerId: pid, teamId, name: cleanName, number: cleanNum };
        }
        const p = window.store?.getPlayer?.(newPlayerId);
        if (!p) return null;
        return { playerId: p.id, teamId: teamId || p.teamId, name: p.name, number: String(p.number ?? '') };
    }

    substitutePinchHitter(lineupIdx, newPlayerId, customInfo = null) {
        if (!this.state) return null;
        const { isTop, battingTeam } = this.getActiveTeams();
        const lineup = isTop ? this.state.awayLineup : this.state.homeLineup;
        if (!Array.isArray(lineup) || lineupIdx < 0 || lineupIdx >= lineup.length) return null;

        const sub = this.resolveSubPlayer(battingTeam.id, newPlayerId, customInfo);
        if (!sub) return null;

        this.pushHistory();
        const oldPid = lineup[lineupIdx];
        const oldPlayer = oldPid ? window.store?.getPlayer?.(oldPid) : null;
        const oldName = oldPlayer ? oldPlayer.name : (oldPid || '先發球員');

        lineup[lineupIdx] = sub.playerId;
        const newBLine = this.ensureBatterLine(sub.playerId, battingTeam.id);
        newBLine.subIn = true;
        if (oldPid) this.ensureBatterLine(oldPid, battingTeam.id);

        this.addLog(`代打調度：#${sub.number} ${sub.name} 接替 ${oldName}（第${lineupIdx + 1}棒）`);
        this.saveLiveState();
        return sub;
    }

    substitutePinchRunner(baseKey, newPlayerId, customInfo = null) {
        if (!this.state || !this.state.bases[baseKey]) return null;
        const oldRunner = this.state.bases[baseKey];
        const { isTop, battingTeam } = this.getActiveTeams();
        const lineup = isTop ? this.state.awayLineup : this.state.homeLineup;

        const sub = this.resolveSubPlayer(battingTeam.id, newPlayerId, customInfo);
        if (!sub) return null;

        this.pushHistory();

        // 若原跑者在打序名單中，將該棒次同步替換為代跑者（保留原球員所有個人數據）
        if (Array.isArray(lineup)) {
            const idx = lineup.findIndex(pid => pid === oldRunner.playerId);
            if (idx >= 0) {
                lineup[idx] = sub.playerId;
            }
        }
        if (oldRunner.playerId) {
            this.ensureBatterLine(oldRunner.playerId, oldRunner.teamId || battingTeam.id);
        }
        const newBLine = this.ensureBatterLine(sub.playerId, battingTeam.id);
        newBLine.subIn = true;

        this.state.bases[baseKey] = {
            playerId: sub.playerId,
            teamId: battingTeam.id,
            name: sub.name,
            number: sub.number,
            isUnearned: Boolean(oldRunner.isUnearned)
        };

        this.addLog(`代跑調度：#${sub.number} ${sub.name} 接替 ${oldRunner.name} 跑壘（打序同步接替）`);
        this.saveLiveState();
        return sub;
    }

    /**
     * 更換目前場上投手（同隊投手制時，更換當前進攻隊自己的投手）
     */
    changePitcher(newPitcherId) {
        if (!this.state || !newPitcherId) return;
        this.pushHistory();
        const isTop = this.state.half === 'top';
        const sameTeam = this.state.sameTeamPitcher !== false;
        const p = window.store.getPlayer(newPitcherId);
        const targetTeamId = p ? p.teamId : (sameTeam ? (isTop ? this.state.awayTeamId : this.state.homeTeamId) : (isTop ? this.state.homeTeamId : this.state.awayTeamId));

        if (sameTeam) {
            if (isTop) this.state.awayPitcherId = newPitcherId;
            else this.state.homePitcherId = newPitcherId;
        } else {
            if (isTop) this.state.homePitcherId = newPitcherId;
            else this.state.awayPitcherId = newPitcherId;
        }

        this.ensurePitcherLine(newPitcherId, targetTeamId);
        this.saveLiveState();
    }

    switchHalfInning(manual = true) {
        if (!this.state) return;
        if (manual) this.pushHistory();

        this.state.balls = 0;
        this.state.strikes = 0;
        this.state.outs = 0;
        this.state.bases = { first: null, second: null, third: null };
        this.state.lastBatterId = null;
        this.state.lastBatterTeamId = null;
        this.state.lastPlayType = '';
        this.state.unearnedInning = false;

        if (this.state.half === 'top') {
            this.state.half = 'bottom';
        } else {
            this.state.half = 'top';
            this.state.inning += 1;
            const idx = this.state.inning - 1;
            while (this.state.lineScore.away.length <= idx) {
                this.state.lineScore.away.push(0);
                this.state.lineScore.home.push(0);
            }
        }

        this.saveLiveState();
    }

    finalizeGame(decisions = {}, fallbackState = null, rulingOptions = {}) {
        const targetChannel = this.activeChannel;
        const rawSt = this.channels[targetChannel] || fallbackState;
        if (!rawSt) return null;
        const st = this.normalizeState(rawSt);

        const rawOverride = rulingOptions && rulingOptions.resultOverride ? String(rulingOptions.resultOverride) : '';
        const resultOverride = (rawOverride === 'away' || rawOverride === 'home' || rawOverride === 'tie') ? rawOverride : '';
        const rulingNote = rulingOptions && rulingOptions.rulingNote ? String(rulingOptions.rulingNote).trim() : '';

        const battingStatsObj = st.battingStats || {};
        const pitchingStatsObj = st.pitchingStats || {};
        const pitcherOrderArr = Array.isArray(st.pitcherOrder) ? st.pitcherOrder : [];

        const batArray = Object.values(battingStatsObj).filter(b =>
            b && b.playerId !== 'opp_batter' && (b.pa > 0 || b.ab > 0 || b.h > 0 || b.r > 0 || b.rbi > 0 || b.bb > 0 || b.sb > 0 || b.cs > 0 || b.ccs > 0 || b.fc > 0 || b.subIn)
        );

        const allPitcherIds = Array.from(new Set([...pitcherOrderArr, ...Object.keys(pitchingStatsObj)]));
        const pitArray = allPitcherIds.map(pid => {
            const line = pitchingStatsObj[pid];
            if (!line) return null;
            if (decisions[pid] !== undefined) {
                line.decision = decisions[pid];
            }
            return line;
        }).filter(Boolean);

        const maxInn = Number(st.maxInnings) || 4;
        const curInn = Number(st.inning) || 1;
        const awayLines = Array.isArray(st.lineScore?.away) ? st.lineScore.away : [Number(st.awayScore) || 0];
        const homeLines = Array.isArray(st.lineScore?.home) ? st.lineScore.home : [Number(st.homeScore) || 0];

        const playByPlayList = Array.isArray(st.playByPlay) ? st.playByPlay.slice().reverse() : [];
        if (resultOverride) {
            const awayTeam = (typeof window !== 'undefined' && window.store && typeof window.store.getTeam === 'function')
                ? window.store.getTeam(st.awayTeamId, st.opponentName)
                : { name: '客隊' };
            const homeTeam = (typeof window !== 'undefined' && window.store && typeof window.store.getTeam === 'function')
                ? window.store.getTeam(st.homeTeamId, st.opponentName)
                : { name: '主隊' };
            const winnerLabel = resultOverride === 'away'
                ? `${awayTeam.name} 獲勝`
                : (resultOverride === 'home' ? `${homeTeam.name} 獲勝` : '雙方平手/和局');
            playByPlayList.push({
                inning: `${curInn}局${st.half === 'top' ? '上' : '下'}`,
                time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
                text: `⚖️ 直接結束比賽（紀錄組裁定：${winnerLabel}${rulingNote ? '，原因：' + rulingNote : ''}）`
            });
        }

        const finishedGame = {
            id: st.id || ('g_' + Date.now()),
            date: st.date || new Date().toISOString().slice(0, 10),
            tournament: st.tournament || '隊內三隊爭霸練習賽 (4局制)',
            isExternal: Boolean(st.isExternal),
            opponentName: st.opponentName || '',
            awayTeamId: st.awayTeamId,
            homeTeamId: st.homeTeamId,
            sameTeamPitcher: st.sameTeamPitcher !== false,
            awayScore: Number(st.awayScore) || 0,
            homeScore: Number(st.homeScore) || 0,
            resultOverride,
            rulingNote,
            awayHits: Number(st.awayHits) || 0,
            homeHits: Number(st.homeHits) || 0,
            awayErrors: Number(st.awayErrors) || 0,
            homeErrors: Number(st.homeErrors) || 0,
            innings: Math.min(curInn, maxInn),
            lineScore: {
                away: awayLines.slice(0, Math.max(maxInn, curInn)),
                home: homeLines.slice(0, Math.max(maxInn, curInn))
            },
            battingStats: batArray,
            pitchingStats: pitArray,
            playByPlay: playByPlayList
        };

        if (!window.store.data) window.store.data = {};
        if (!Array.isArray(window.store.data.games)) {
            window.store.data.games = window.store.data.games ? Object.values(window.store.data.games) : [];
        }
        window.store.data.games.unshift(finishedGame);

        this.channels[targetChannel] = null;
        if (this.historyStacks[targetChannel]) {
            this.historyStacks[targetChannel] = [];
        }
        try {
            localStorage.removeItem(LIVE_STORAGE_KEYS[targetChannel]);
            localStorage.removeItem('YOUTH_BASEBALL_JJ_LIVE_V5');
        } catch (e) {}

        window.store.save();
        this.saveLiveState(true, targetChannel);
        return finishedGame;
    }
}

window.scorebook = new LiveScorebook();
