/**
 * 國小少棒三隊聯盟數據統計、戰績榜與交易分段統計引擎 (Stats Engine V2)
 */

const StatsEngine = {
    formatIP(outs) {
        if (!outs || outs <= 0) return '0.0';
        const full = Math.floor(outs / 3);
        const rem = outs % 3;
        return `${full}.${rem}`;
    },

    formatRate(val) {
        if (val === null || val === undefined || isNaN(val)) return '.000';
        return val.toFixed(3);
    },

    formatERA(val) {
        if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return '0.00';
        return val.toFixed(2);
    },

    /**
     * 計算三隊聯盟戰績榜 (CPBL Standings + 對戰成績 + 團隊攻守數據)
     */
    getTeamStandings(data) {
        const teams = data.teams || [];
        const games = data.games || [];
        const eraBase = Number(data.settings?.eraInningsBase) || 6;

        const map = {};
        teams.forEach(t => {
            map[t.id] = {
                teamId: t.id,
                name: t.name,
                code: t.code,
                emoji: t.emoji || '⚾',
                color: t.color || '#f59e0b',
                captain: t.captain || '',
                note: t.note || '',
                g: 0, w: 0, l: 0, t: 0,
                rs: 0, ra: 0,
                ab: 0, h: 0, b2: 0, b3: 0, hr: 0, tb: 0, bb: 0, hbp: 0, sf: 0, sb: 0,
                outs: 0, er: 0, so: 0, pitH: 0, pitBB: 0,
                vs: {}, // { [oppTeamId]: { w:0, l:0, t:0 } }
                recent: []
            };
            teams.forEach(opp => {
                if (opp.id !== t.id) {
                    map[t.id].vs[opp.id] = { w: 0, l: 0, t: 0 };
                }
            });
        });

        // 依日期由舊到新處理戰績（僅計算隊內三隊爭霸賽，不混入對外比賽）
        const intraGames = games.filter(g => !g.isExternal);
        const chronologicalGames = [...intraGames].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        chronologicalGames.forEach(g => {
            const away = map[g.awayTeamId];
            const home = map[g.homeTeamId];
            const aScore = Number(g.awayScore) || 0;
            const hScore = Number(g.homeScore) || 0;

            if (away) {
                away.g += 1;
                away.rs += aScore;
                away.ra += hScore;
                if (aScore > hScore) {
                    away.w += 1;
                    away.recent.push('W');
                    if (away.vs[g.homeTeamId]) away.vs[g.homeTeamId].w += 1;
                } else if (aScore < hScore) {
                    away.l += 1;
                    away.recent.push('L');
                    if (away.vs[g.homeTeamId]) away.vs[g.homeTeamId].l += 1;
                } else {
                    away.t += 1;
                    away.recent.push('T');
                    if (away.vs[g.homeTeamId]) away.vs[g.homeTeamId].t += 1;
                }
            }

            if (home) {
                home.g += 1;
                home.rs += hScore;
                home.ra += aScore;
                if (hScore > aScore) {
                    home.w += 1;
                    home.recent.push('W');
                    if (home.vs[g.awayTeamId]) home.vs[g.awayTeamId].w += 1;
                } else if (hScore < aScore) {
                    home.l += 1;
                    home.recent.push('L');
                    if (home.vs[g.awayTeamId]) home.vs[g.awayTeamId].l += 1;
                } else {
                    home.t += 1;
                    home.recent.push('T');
                    if (home.vs[g.awayTeamId]) home.vs[g.awayTeamId].t += 1;
                }
            }

            // 累計各隊該場打擊與投球數據 (依比賽當時該球員代表之 teamId 歸屬)
            (g.battingStats || []).forEach(b => {
                const tm = map[b.teamId];
                if (!tm) return;
                tm.ab += (b.ab || 0);
                tm.h += (b.h || 0);
                tm.b2 += (b.b2 || 0);
                tm.b3 += (b.b3 || 0);
                tm.hr += (b.hr || 0);
                tm.tb += (b.b1 || 0) * 1 + (b.b2 || 0) * 2 + (b.b3 || 0) * 3 + (b.hr || 0) * 4;
                tm.bb += (b.bb || 0);
                tm.hbp += (b.hbp || 0);
                tm.sf += (b.sf || 0);
                tm.sb += (b.sb || 0);
            });

            (g.pitchingStats || []).forEach(pt => {
                const tm = map[pt.teamId];
                if (!tm) return;
                tm.outs += (pt.outs || 0);
                tm.er += (pt.er || 0);
                tm.so += (pt.so || 0);
                tm.pitH += (pt.h || 0);
                tm.pitBB += (pt.bb || 0);
            });
        });

        const list = Object.values(map).map(tm => {
            tm.winPct = (tm.w + tm.l) > 0 ? tm.w / (tm.w + tm.l) : 0;
            tm.runDiff = tm.rs - tm.ra;
            tm.avg = tm.ab > 0 ? tm.h / tm.ab : 0;
            const obpDenom = tm.ab + tm.bb + tm.hbp + tm.sf;
            tm.obp = obpDenom > 0 ? (tm.h + tm.bb + tm.hbp) / obpDenom : 0;
            tm.slg = tm.ab > 0 ? tm.tb / tm.ab : 0;
            tm.ops = tm.obp + tm.slg;
            const ip = tm.outs / 3;
            tm.ipDisplay = this.formatIP(tm.outs);
            tm.era = ip > 0 ? (tm.er * eraBase) / ip : 0;
            tm.whip = ip > 0 ? (tm.pitH + tm.pitBB) / ip : 0;
            return tm;
        });

        // 依勝率、勝場、得失分差排序
        list.sort((a, b) => {
            if (b.winPct !== a.winPct) return b.winPct - a.winPct;
            if (b.w !== a.w) return b.w - a.w;
            return b.runDiff - a.runDiff;
        });

        // 計算勝差 (GB)
        if (list.length > 0) {
            const topW = list[0].w;
            const topL = list[0].l;
            list.forEach((tm, idx) => {
                if (idx === 0) {
                    tm.gb = '-';
                } else {
                    const diff = ((topW - tm.w) + (tm.l - topL)) / 2;
                    tm.gb = diff === 0 ? '-' : diff.toFixed(1);
                }
            });
        }

        return list;
    },

    /**
     * 計算中正國小代表隊「對外比賽」總戰績與團隊攻守數據
     */
    getExternalTeamSummary(data) {
        const extGames = (data.games || []).filter(g => Boolean(g.isExternal));
        const eraBase = Number(data.settings?.eraInningsBase) || 6;

        const summary = {
            g: 0, w: 0, l: 0, t: 0,
            rs: 0, ra: 0,
            ab: 0, h: 0, b2: 0, b3: 0, hr: 0, tb: 0, bb: 0, hbp: 0, sf: 0, sb: 0,
            outs: 0, er: 0, so: 0, pitH: 0, pitBB: 0,
            recent: [],
            gamesList: extGames
        };

        const chronological = [...extGames].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        chronological.forEach(g => {
            summary.g += 1;
            const jjIsAway = g.awayTeamId === 'JJ';
            const ourScore = jjIsAway ? (Number(g.awayScore) || 0) : (Number(g.homeScore) || 0);
            const oppScore = jjIsAway ? (Number(g.homeScore) || 0) : (Number(g.awayScore) || 0);
            summary.rs += ourScore;
            summary.ra += oppScore;

            if (ourScore > oppScore) {
                summary.w += 1;
                summary.recent.push('W');
            } else if (ourScore < oppScore) {
                summary.l += 1;
                summary.recent.push('L');
            } else {
                summary.t += 1;
                summary.recent.push('T');
            }

            (g.battingStats || []).forEach(b => {
                if (b.playerId === 'opp_batter') return;
                summary.ab += (b.ab || 0);
                summary.h += (b.h || 0);
                summary.b2 += (b.b2 || 0);
                summary.b3 += (b.b3 || 0);
                summary.hr += (b.hr || 0);
                summary.tb += (b.b1 || 0) * 1 + (b.b2 || 0) * 2 + (b.b3 || 0) * 3 + (b.hr || 0) * 4;
                summary.bb += (b.bb || 0);
                summary.hbp += (b.hbp || 0);
                summary.sf += (b.sf || 0);
                summary.sb += (b.sb || 0);
            });

            (g.pitchingStats || []).forEach(pt => {
                summary.outs += (pt.outs || 0);
                summary.er += (pt.er || 0);
                summary.so += (pt.so || 0);
                summary.pitH += (pt.h || 0);
                summary.pitBB += (pt.bb || 0);
            });
        });

        summary.winPct = (summary.w + summary.l) > 0 ? summary.w / (summary.w + summary.l) : 0;
        summary.runDiff = summary.rs - summary.ra;
        summary.avg = summary.ab > 0 ? summary.h / summary.ab : 0;
        const obpDenom = summary.ab + summary.bb + summary.hbp + summary.sf;
        summary.obp = obpDenom > 0 ? (summary.h + summary.bb + summary.hbp) / obpDenom : 0;
        summary.slg = summary.ab > 0 ? summary.tb / summary.ab : 0;
        summary.ops = summary.obp + summary.slg;
        const ip = summary.outs / 3;
        summary.ipDisplay = this.formatIP(summary.outs);
        summary.era = ip > 0 ? (summary.er * eraBase) / ip : 0;
        summary.whip = ip > 0 ? (summary.pitH + summary.pitBB) / ip : 0;

        return summary;
    },

    /**
     * 彙整球員打擊數據（支援 mode: 'intra' 隊內聯賽 | 'external' 對外比賽 | 'all' 全部，以及單一球隊篩選）
     */
    getBattingStatsList(data, filterTeamId = 'ALL', mode = 'intra') {
        const players = data.players || [];
        const allGames = data.games || [];
        const games = mode === 'external'
            ? allGames.filter(g => Boolean(g.isExternal))
            : (mode === 'all' ? allGames : allGames.filter(g => !g.isExternal));
        const map = {};

        players.forEach(p => {
            const currentTeam = window.store.getTeam(p.teamId);
            map[p.id] = {
                playerId: p.id,
                teamId: p.teamId,
                teamName: mode === 'external' ? '中正國小' : currentTeam.name,
                teamEmoji: mode === 'external' ? '🦁' : currentTeam.emoji,
                teamColor: currentTeam.color,
                number: p.number,
                name: p.name,
                photo: p.photo || '',
                grade: p.grade,
                pos: p.pos,
                bats: p.bats,
                g: 0, pa: 0, ab: 0, h: 0, b1: 0, b2: 0, b3: 0, hr: 0, tb: 0,
                rbi: 0, r: 0, bb: 0, hbp: 0, so: 0, sac: 0, sf: 0, sb: 0, cs: 0, roe: 0,
                splitsByTeam: {} // { [teamId]: { g, pa, ab, h, hr, rbi, sb } }
            };
        });

        games.forEach(game => {
            (game.battingStats || []).forEach(line => {
                const st = map[line.playerId];
                if (!st) return;

                const gameTeamId = line.teamId || st.teamId;
                if (!st.splitsByTeam[gameTeamId]) {
                    st.splitsByTeam[gameTeamId] = { teamId: gameTeamId, g: 0, pa: 0, ab: 0, h: 0, b2: 0, b3: 0, hr: 0, rbi: 0, r: 0, bb: 0, so: 0, sb: 0 };
                }
                const sp = st.splitsByTeam[gameTeamId];
                sp.g += 1;
                sp.pa += (line.pa || 0);
                sp.ab += (line.ab || 0);
                sp.h += (line.h || 0);
                sp.b2 += (line.b2 || 0);
                sp.b3 += (line.b3 || 0);
                sp.hr += (line.hr || 0);
                sp.rbi += (line.rbi || 0);
                sp.r += (line.r || 0);
                sp.bb += (line.bb || 0);
                sp.so += (line.so || 0);
                sp.sb += (line.sb || 0);

                st.g += 1;
                st.pa += (line.pa || 0);
                st.ab += (line.ab || 0);
                st.h += (line.h || 0);
                st.b1 += (line.b1 || 0);
                st.b2 += (line.b2 || 0);
                st.b3 += (line.b3 || 0);
                st.hr += (line.hr || 0);
                st.rbi += (line.rbi || 0);
                st.r += (line.r || 0);
                st.bb += (line.bb || 0);
                st.hbp += (line.hbp || 0);
                st.so += (line.so || 0);
                st.sac += (line.sac || 0);
                st.sf += (line.sf || 0);
                st.sb += (line.sb || 0);
                st.cs += (line.cs || 0);
                st.roe += (line.roe || 0);
            });
        });

        let result = Object.values(map).map(st => {
            st.tb = st.b1 * 1 + st.b2 * 2 + st.b3 * 3 + st.hr * 4;
            st.avg = st.ab > 0 ? st.h / st.ab : 0;
            const obpDenom = st.ab + st.bb + st.hbp + st.sf;
            st.obp = obpDenom > 0 ? (st.h + st.bb + st.hbp) / obpDenom : 0;
            st.slg = st.ab > 0 ? st.tb / st.ab : 0;
            st.ops = st.obp + st.slg;
            return st;
        });

        if (filterTeamId && filterTeamId !== 'ALL') {
            result = result.filter(p => p.teamId === filterTeamId);
        }

        return result;
    },

    /**
     * 彙整球員投球數據（支援 mode: 'intra' 隊內聯賽 | 'external' 對外比賽 | 'all' 全部，以及單一球隊篩選）
     */
    getPitchingStatsList(data, filterTeamId = 'ALL', mode = 'intra') {
        const players = data.players || [];
        const allGames = data.games || [];
        const games = mode === 'external'
            ? allGames.filter(g => Boolean(g.isExternal))
            : (mode === 'all' ? allGames : allGames.filter(g => !g.isExternal));
        const eraBase = Number(data.settings?.eraInningsBase) || 6;
        const map = {};

        players.forEach(p => {
            const currentTeam = window.store.getTeam(p.teamId);
            map[p.id] = {
                playerId: p.id,
                teamId: p.teamId,
                teamName: mode === 'external' ? '中正國小' : currentTeam.name,
                teamEmoji: mode === 'external' ? '🦁' : currentTeam.emoji,
                teamColor: currentTeam.color,
                number: p.number,
                name: p.name,
                photo: p.photo || '',
                grade: p.grade,
                pos: p.pos,
                throws: p.throws,
                g: 0, gs: 0, w: 0, l: 0, sv: 0, hld: 0,
                outs: 0, np: 0, strikes: 0, bf: 0,
                h: 0, hr: 0, bb: 0, hbp: 0, so: 0, wp: 0, r: 0, er: 0,
                splitsByTeam: {}
            };
        });

        games.forEach(game => {
            (game.pitchingStats || []).forEach(line => {
                const st = map[line.playerId];
                if (!st) return;

                const gameTeamId = line.teamId || st.teamId;
                if (!st.splitsByTeam[gameTeamId]) {
                    st.splitsByTeam[gameTeamId] = { teamId: gameTeamId, g: 0, w: 0, l: 0, sv: 0, outs: 0, so: 0, r: 0, er: 0 };
                }
                const sp = st.splitsByTeam[gameTeamId];
                sp.g += 1;
                if (line.decision === 'W') sp.w += 1;
                if (line.decision === 'L') sp.l += 1;
                if (line.decision === 'SV') sp.sv += 1;
                sp.outs += (line.outs || 0);
                sp.so += (line.so || 0);
                sp.r += (line.r || 0);
                sp.er += (line.er || 0);

                st.g += 1;
                st.gs += (line.gs || 0);
                if (line.decision === 'W') st.w += 1;
                if (line.decision === 'L') st.l += 1;
                if (line.decision === 'SV') st.sv += 1;
                if (line.decision === 'HLD') st.hld += 1;
                st.outs += (line.outs || 0);
                st.np += (line.np || 0);
                st.strikes += (line.strikes || 0);
                st.bf += (line.bf || 0);
                st.h += (line.h || 0);
                st.hr += (line.hr || 0);
                st.bb += (line.bb || 0);
                st.hbp += (line.hbp || 0);
                st.so += (line.so || 0);
                st.wp += (line.wp || 0);
                st.r += (line.r || 0);
                st.er += (line.er || 0);
            });
        });

        let result = Object.values(map).map(st => {
            const ipReal = st.outs / 3;
            st.ipDisplay = this.formatIP(st.outs);
            st.ipReal = ipReal;
            st.era = ipReal > 0 ? (st.er * eraBase) / ipReal : (st.er > 0 ? 99.99 : 0);
            st.whip = ipReal > 0 ? (st.h + st.bb) / ipReal : 0;
            st.kRate = ipReal > 0 ? (st.so * eraBase) / ipReal : 0;
            st.strikePct = st.np > 0 ? (st.strikes / st.np) * 100 : 0;
            return st;
        });

        if (filterTeamId && filterTeamId !== 'ALL') {
            result = result.filter(p => p.teamId === filterTeamId);
        }

        return result;
    }
};

window.StatsEngine = StatsEngine;
