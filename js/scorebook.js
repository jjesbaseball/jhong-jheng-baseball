/**
 * 中正國小少棒三隊聯盟 - 4局制 & 同隊投手練習賽實戰計分本引擎 (Live Scorebook Engine V3)
 * 支援：
 * 1. 隊內賽預設 4 局制 (亦可選其他局數)
 * 2. 練習賽「同隊投手制」：進攻時由自己隊伍的投手投給自己隊友打，同時統計打者與本隊投手數據！
 */

const LIVE_GAME_STORAGE_KEY = 'YOUTH_BASEBALL_JJ_LIVE_V5';

class LiveScorebook {
    constructor() {
        this.state = this.loadLiveState();
        this.historyStack = [];
    }

    loadLiveState() {
        try {
            const raw = localStorage.getItem(LIVE_GAME_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.awayTeamId && parsed.homeTeamId) return parsed;
            }
        } catch (e) {}
        return null;
    }

    async saveLiveState(syncServer = true) {
        try {
            if (this.state) {
                localStorage.setItem(LIVE_GAME_STORAGE_KEY, JSON.stringify(this.state));
            } else {
                localStorage.removeItem(LIVE_GAME_STORAGE_KEY);
            }
        } catch (e) {}

        if (syncServer && window.store) {
            this.lastLiveTimestamp = Date.now();
            if (window.store.firebaseDbUrl) {
                try {
                    await fetch(`${window.store.firebaseDbUrl}/jj_baseball/live_game.json`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ _updatedAt: this.lastLiveTimestamp, state: this.state })
                    });
                } catch (e) {}
            }
            if (window.store.serverAvailable) {
                try {
                    await fetch('/api/live', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ liveState: this.state })
                    });
                } catch (e) {}
            }
        }
    }

    pushHistory() {
        if (!this.state) return;
        this.historyStack.push(JSON.parse(JSON.stringify(this.state)));
        if (this.historyStack.length > 35) {
            this.historyStack.shift();
        }
    }

    undo() {
        if (this.historyStack.length === 0) return false;
        this.state = this.historyStack.pop();
        this.saveLiveState();
        return true;
    }

    /**
     * 開啟新比賽（預設 4 局制 ＋ 同隊投手投球制）
     */
    startNewGame(config) {
        const maxInnings = Number(config.innings) || 4;
        const sameTeamPitcher = config.sameTeamPitcher !== undefined ? Boolean(config.sameTeamPitcher) : true;
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

        this.historyStack = [];
        this.state = {
            id: 'g_' + Date.now(),
            date: config.date || new Date().toISOString().slice(0, 10),
            tournament: config.tournament || '隊內三隊爭霸練習賽 (4局制)',
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
            pitcherOrder: [awayStarterId, homeStarterId].filter(Boolean),
            battingStats,
            pitchingStats,
            playByPlay: [
                {
                    inning: '1局上',
                    time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
                    text: `⚾ ${maxInnings}局制隊內賽開打！先攻【${awayTeam.emoji}${awayTeam.name}】vs 後攻【${homeTeam.emoji}${homeTeam.name}】（${sameTeamPitcher ? '同隊投手餵球/投球制' : '對抗投手制'}）`
                }
            ]
        };

        this.saveLiveState();
        return this.state;
    }

    createEmptyBatterLine(playerId, teamId) {
        return {
            playerId, teamId,
            pa: 0, ab: 0, h: 0, b1: 0, b2: 0, b3: 0, hr: 0,
            rbi: 0, r: 0, bb: 0, hbp: 0, so: 0, sac: 0, sf: 0, sb: 0, cs: 0, roe: 0
        };
    }

    createEmptyPitcherLine(playerId, teamId, gs = 0) {
        return {
            playerId, teamId,
            gs, outs: 0, np: 0, strikes: 0, bf: 0,
            h: 0, hr: 0, bb: 0, hbp: 0, so: 0, wp: 0, r: 0, er: 0, decision: ''
        };
    }

    ensureBatterLine(playerId, teamId) {
        if (!this.state.battingStats[playerId]) {
            const p = window.store.getPlayer(playerId);
            this.state.battingStats[playerId] = this.createEmptyBatterLine(playerId, teamId || (p ? p.teamId : ''));
        }
        return this.state.battingStats[playerId];
    }

    ensurePitcherLine(playerId, teamId) {
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

        const pitcherId = sameTeam
            ? (isTop ? this.state.awayPitcherId : this.state.homePitcherId)
            : (isTop ? this.state.homePitcherId : this.state.awayPitcherId);

        return {
            orderNo: lineup.length > 0 ? (bIdx % lineup.length) + 1 : 1,
            batter: batterId ? window.store.getPlayer(batterId) : null,
            pitcher: pitcherId ? window.store.getPlayer(pitcherId) : null
        };
    }

    addLog(text) {
        this.state.playByPlay.unshift({
            inning: this.getInningLabel(),
            time: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
            text
        });
    }

    addRuns(runs, isEarned = true) {
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

        const { pitcher } = this.getCurrentMatchup();
        if (pitcher) {
            const pLine = this.ensurePitcherLine(pitcher.id, pitcher.teamId);
            pLine.r += runs;
            if (isEarned) pLine.er += runs;
        }
    }

    recordPitch(type) {
        if (!this.state) return;
        this.pushHistory();

        const { pitcher } = this.getCurrentMatchup();
        const pLine = pitcher ? this.ensurePitcherLine(pitcher.id, pitcher.teamId) : null;

        if (type === 'strike_looking' || type === 'strike_swinging') {
            if (pLine) {
                pLine.np += 1;
                pLine.strikes += 1;
            }
            this.state.strikes += 1;
            if (this.state.strikes >= 3) {
                this.historyStack.pop();
                this.recordPlay({ type: 'SO', autoFromPitch: true });
                return;
            }
        } else if (type === 'foul') {
            if (pLine) {
                pLine.np += 1;
                pLine.strikes += 1;
            }
            if (this.state.strikes < 2) {
                this.state.strikes += 1;
            }
        } else if (type === 'ball') {
            if (pLine) {
                pLine.np += 1;
            }
            this.state.balls += 1;
            if (this.state.balls >= 4) {
                this.historyStack.pop();
                this.recordPlay({ type: 'BB', autoFromPitch: true });
                return;
            }
        }

        this.saveLiveState();
    }

    advanceRunners(basesCount, batterRunner) {
        let runsScored = 0;
        const scoredPlayers = [];
        const b = this.state.bases;

        if (basesCount === 1 && batterRunner.isWalk) {
            if (b.first && b.second && b.third) {
                runsScored += 1;
                scoredPlayers.push(b.third);
                b.third = b.second;
                b.second = b.first;
                b.first = batterRunner;
            } else if (b.first && b.second) {
                b.third = b.second;
                b.second = b.first;
                b.first = batterRunner;
            } else if (b.first) {
                b.second = b.first;
                b.first = batterRunner;
            } else {
                b.first = batterRunner;
            }
        } else if (basesCount === 1) {
            if (b.third) { runsScored++; scoredPlayers.push(b.third); b.third = null; }
            if (b.second) { b.third = b.second; b.second = null; }
            if (b.first) { b.second = b.first; b.first = null; }
            b.first = batterRunner;
        } else if (basesCount === 2) {
            if (b.third) { runsScored++; scoredPlayers.push(b.third); b.third = null; }
            if (b.second) { runsScored++; scoredPlayers.push(b.second); b.second = null; }
            if (b.first) { b.third = b.first; b.first = null; }
            b.second = batterRunner;
        } else if (basesCount === 3) {
            ['third', 'second', 'first'].forEach(k => {
                if (b[k]) { runsScored++; scoredPlayers.push(b[k]); b[k] = null; }
            });
            b.third = batterRunner;
        } else if (basesCount === 4) {
            ['third', 'second', 'first'].forEach(k => {
                if (b[k]) { runsScored++; scoredPlayers.push(b[k]); b[k] = null; }
            });
            runsScored++;
            scoredPlayers.push(batterRunner);
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
        let desc = `${battingTeam.emoji}#${batter.number} ${batter.name} (投手：${pitcher ? pitcher.name : '同隊投手'})`;

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
            scoredPlayers.forEach(sp => {
                if (sp && sp.playerId) {
                    this.ensureBatterLine(sp.playerId, sp.teamId).r += 1;
                }
            });
            this.addRuns(runsScored, true);
            desc += ` 擊出${labelMap[type]}${runsScored > 0 ? `（${runsScored}分打點）` : ''}`;
        } else if (type === 'BB' || type === 'HBP') {
            if (type === 'BB') { bLine.bb += 1; if (pLine) pLine.bb += 1; }
            if (type === 'HBP') { bLine.hbp += 1; if (pLine) pLine.hbp += 1; }
            runnerObj.isWalk = true;
            const { runsScored, scoredPlayers } = this.advanceRunners(1, runnerObj);
            bLine.rbi += runsScored;
            scoredPlayers.forEach(sp => {
                if (sp && sp.playerId) this.ensureBatterLine(sp.playerId, sp.teamId).r += 1;
            });
            this.addRuns(runsScored, true);
            desc += ` 獲得${type === 'BB' ? '四壞保送' : '觸身球'}${runsScored > 0 ? `（擠回 ${runsScored} 分）` : ''}`;
        } else if (type === 'ROE') {
            bLine.ab += 1;
            bLine.roe += 1;
            if (isTop) this.state.homeErrors += 1;
            else this.state.awayErrors += 1;
            const { runsScored, scoredPlayers } = this.advanceRunners(1, runnerObj);
            scoredPlayers.forEach(sp => {
                if (sp && sp.playerId) this.ensureBatterLine(sp.playerId, sp.teamId).r += 1;
            });
            this.addRuns(runsScored, false);
            desc += ` 因守備失誤上壘${runsScored > 0 ? `（得 ${runsScored} 分，非自責）` : ''}`;
        } else if (type === 'SO') {
            bLine.ab += 1;
            bLine.so += 1;
            if (pLine) {
                pLine.so += 1;
                pLine.outs += 1;
            }
            this.state.outs += 1;
            desc += ` 遭到三振 K！ (${this.state.outs}出局)`;
        } else if (type === 'GO' || type === 'FO') {
            bLine.ab += 1;
            if (pLine) pLine.outs += 1;
            this.state.outs += 1;
            desc += ` ${type === 'GO' ? '滾地球出局' : '飛球接殺出局'} (${this.state.outs}出局)`;
        } else if (type === 'DP') {
            bLine.ab += 1;
            const addedOuts = Math.min(2, 3 - this.state.outs);
            if (pLine) pLine.outs += addedOuts;
            this.state.outs += addedOuts;
            if (this.state.bases.first) this.state.bases.first = null;
            else if (this.state.bases.second) this.state.bases.second = null;
            desc += ` 雙殺守備！ (${this.state.outs}出局)`;
        } else if (type === 'SAC') {
            bLine.sac += 1;
            if (pLine) pLine.outs += 1;
            this.state.outs += 1;
            if (this.state.bases.second && !this.state.bases.third) {
                this.state.bases.third = this.state.bases.second;
                this.state.bases.second = null;
            }
            if (this.state.bases.first && !this.state.bases.second) {
                this.state.bases.second = this.state.bases.first;
                this.state.bases.first = null;
            }
            desc += ` 犧牲觸擊推進跑者 (${this.state.outs}出局)`;
        } else if (type === 'SF') {
            bLine.sf += 1;
            if (pLine) pLine.outs += 1;
            this.state.outs += 1;
            let scored = 0;
            if (this.state.bases.third) {
                const sp = this.state.bases.third;
                if (sp && sp.playerId) this.ensureBatterLine(sp.playerId, sp.teamId).r += 1;
                this.state.bases.third = null;
                scored = 1;
                bLine.rbi += 1;
                this.addRuns(1, true);
            }
            desc += ` 高飛犧牲打${scored ? '（1分打點）' : ''} (${this.state.outs}出局)`;
        }

        this.addLog(desc);

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

    handleRunnerAction(baseKey, action) {
        if (!this.state || !this.state.bases[baseKey]) return;
        this.pushHistory();

        const runner = this.state.bases[baseKey];
        const { pitcher } = this.getCurrentMatchup();
        const pLine = pitcher ? this.ensurePitcherLine(pitcher.id, pitcher.teamId) : null;
        const nextBaseMap = { first: 'second', second: 'third', third: 'home' };
        const nextBase = nextBaseMap[baseKey];
        const baseNameMap = { first: '一壘', second: '二壘', third: '三壘' };

        if (action === 'SB') {
            if (runner.playerId) {
                this.ensureBatterLine(runner.playerId, runner.teamId).sb += 1;
            }
            this.state.bases[baseKey] = null;
            if (nextBase === 'home') {
                if (runner.playerId) this.ensureBatterLine(runner.playerId, runner.teamId).r += 1;
                this.addRuns(1, true);
                this.addLog(`🏃 ${runner.name} 盜本壘成功！得 1 分`);
            } else {
                this.state.bases[nextBase] = runner;
                this.addLog(`🏃 ${runner.name} 盜上${baseNameMap[nextBase]}成功 (SB)`);
            }
        } else if (action === 'CS') {
            if (runner.playerId) {
                this.ensureBatterLine(runner.playerId, runner.teamId).cs += 1;
            }
            if (pLine) pLine.outs += 1;
            this.state.bases[baseKey] = null;
            this.state.outs += 1;
            this.addLog(`🚫 ${runner.name} 盜壘遭阻殺出局 (${this.state.outs}出局)`);
            if (this.state.outs >= 3) this.switchHalfInning(false);
        } else if (action === 'WP') {
            if (pLine) pLine.wp += 1;
            this.state.bases[baseKey] = null;
            if (nextBase === 'home') {
                if (runner.playerId) this.ensureBatterLine(runner.playerId, runner.teamId).r += 1;
                this.addRuns(1, true);
                this.addLog(`⚡ 暴投/捕逸，${runner.name} 跑回本壘得 1 分`);
            } else {
                this.state.bases[nextBase] = runner;
                this.addLog(`⚡ 暴投/捕逸，${runner.name} 推進至${baseNameMap[nextBase]}`);
            }
        } else if (action === 'SCORE') {
            this.state.bases[baseKey] = null;
            if (runner.playerId) this.ensureBatterLine(runner.playerId, runner.teamId).r += 1;
            this.addRuns(1, true);
            this.addLog(`🏠 ${runner.name} 跑回本壘得分 (+1分)`);
        } else if (action === 'REMOVE') {
            this.state.bases[baseKey] = null;
        }

        this.saveLiveState();
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
        this.addLog(`🔄 更換投手：#${p ? p.number : ''} ${p ? p.name : ''} 登板投球`);
        this.saveLiveState();
    }

    switchHalfInning(manual = true) {
        if (!this.state) return;
        if (manual) this.pushHistory();

        this.state.balls = 0;
        this.state.strikes = 0;
        this.state.outs = 0;
        this.state.bases = { first: null, second: null, third: null };

        if (this.state.half === 'top') {
            this.state.half = 'bottom';
        } else {
            if (this.state.inning >= (this.state.maxInnings || 4)) {
                this.addLog(`🏁 已完成第 ${this.state.inning} 局下半（滿 ${this.state.maxInnings || 4} 局規定局數），可點選「結束比賽並結算成績」！`);
            }
            this.state.half = 'top';
            this.state.inning += 1;
            const idx = this.state.inning - 1;
            while (this.state.lineScore.away.length <= idx) {
                this.state.lineScore.away.push(0);
                this.state.lineScore.home.push(0);
            }
        }

        const { battingTeam, fieldingTeam, pitcherTeam } = this.getActiveTeams();
        this.addLog(`🔔 攻守交換，進入 ${this.getInningLabel()}（${battingTeam.emoji}${battingTeam.name}進攻・由${pitcherTeam.name}投手投球 ｜ ${fieldingTeam.emoji}${fieldingTeam.name}守備）`);
        this.saveLiveState();
    }

    finalizeGame(decisions = {}) {
        if (!this.state) return null;

        const batArray = Object.values(this.state.battingStats).filter(b =>
            b.pa > 0 || b.r > 0 || b.sb > 0 || b.cs > 0
        );
        const pitArray = this.state.pitcherOrder.map(pid => {
            const line = this.state.pitchingStats[pid];
            if (line && decisions[pid]) {
                line.decision = decisions[pid];
            }
            return line;
        }).filter(Boolean);

        const finishedGame = {
            id: this.state.id,
            date: this.state.date,
            tournament: this.state.tournament,
            awayTeamId: this.state.awayTeamId,
            homeTeamId: this.state.homeTeamId,
            sameTeamPitcher: this.state.sameTeamPitcher !== false,
            awayScore: this.state.awayScore,
            homeScore: this.state.homeScore,
            awayHits: this.state.awayHits,
            homeHits: this.state.homeHits,
            awayErrors: this.state.awayErrors,
            homeErrors: this.state.homeErrors,
            innings: Math.min(this.state.inning, this.state.maxInnings || 4),
            lineScore: {
                away: this.state.lineScore.away.slice(0, Math.max(this.state.maxInnings || 4, this.state.inning)),
                home: this.state.lineScore.home.slice(0, Math.max(this.state.maxInnings || 4, this.state.inning))
            },
            battingStats: batArray,
            pitchingStats: pitArray,
            playByPlay: this.state.playByPlay.slice().reverse()
        };

        window.store.data.games.unshift(finishedGame);
        window.store.save();

        this.state = null;
        this.historyStack = [];
        this.saveLiveState();
        return finishedGame;
    }
}

window.scorebook = new LiveScorebook();
