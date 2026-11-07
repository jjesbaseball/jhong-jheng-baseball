/**
 * 中正國小少棒隊 (JHONG JHENG ELEMENTARY SCHOOL)
 * 隊內三隊爭霸聯賽（4局制・同隊投手練習賽模式・球員交易系統）資料管理
 */

const STORAGE_KEY = 'YOUTH_BASEBALL_JJ_3TEAM_LEAGUE_V5';
const FIREBASE_URL_STORAGE_KEY = 'JJ_BASEBALL_FIREBASE_DB_URL';

const DEFAULT_LEAGUE_DATA = {
    settings: {
        leagueName: '中正國小少棒隊 隊內三隊爭霸聯賽',
        seasonName: 'JHONG JHENG ELEMENTARY SCHOOL BASEBALL',
        standardInnings: 4,        // 隊內比賽固定打 4 局
        eraInningsBase: 4,         // 4局制防禦率 ERA = (ER * 4) / IP
        sameTeamPitcher: true,     // 隊內練習賽：由自己隊伍的投手投給自己隊打
        pitchLimitWarning: 50,     // 隊內 4 局賽單場用球數提醒門檻
        pitchLimitMax: 65,         // 單場用球數上限警示
        qualifyPaPerGame: 1.0      // 打擊排行榜規定打席係數
    },
    teams: [
        { id: 't1', name: '紅隊', code: 'RED', emoji: '🔴', color: '#ef4444', captain: '賴冠融', note: '中正國小少棒紅隊（14名隊員）' },
        { id: 't2', name: '藍隊', code: 'BLUE', emoji: '🔵', color: '#3b82f6', captain: '曾聖壹', note: '中正國小少棒藍隊（14名隊員）' },
        { id: 't3', name: '白隊', code: 'WHITE', emoji: '⚪', color: '#e2e8f0', captain: '黃安誠', note: '中正國小少棒白隊（14名隊員）' }
    ],
    players: [
        // 🔴 紅隊 (t1) — 共 14 人
        { id: 'p1',  teamId: 't1', number: '1',  name: '賴冠融', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'P / IF', note: '紅隊 #1' },
        { id: 'p2',  teamId: 't1', number: '2',  name: '黃俊宏', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'C / IF', note: '紅隊 #2' },
        { id: 'p3',  teamId: 't1', number: '3',  name: '林辰宥', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '紅隊 #3' },
        { id: 'p4',  teamId: 't1', number: '4',  name: '余家樂', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '紅隊 #4' },
        { id: 'p5',  teamId: 't1', number: '5',  name: '許育堂', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / P',  note: '紅隊 #5' },
        { id: 'p6',  teamId: 't1', number: '6',  name: '蔡東凱', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'SS / IF', note: '紅隊 #6' },
        { id: 'p7',  teamId: 't1', number: '7',  name: '許庭榞', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'OF / IF', note: '紅隊 #7' },
        { id: 'p8',  teamId: 't1', number: '8',  name: '許介豪', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'OF / IF', note: '紅隊 #8' },
        { id: 'p9',  teamId: 't1', number: '9',  name: '黃靖',   grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'OF / IF', note: '紅隊 #9' },
        { id: 'p10', teamId: 't1', number: '10', name: '黃珉皓', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'P / IF',  note: '紅隊 #10' },
        { id: 'p11', teamId: 't1', number: '11', name: '辛士宖', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '紅隊 #11' },
        { id: 'p12', teamId: 't1', number: '12', name: '許績瑜', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '紅隊 #12' },
        { id: 'p13', teamId: 't1', number: '13', name: '陳燦宇', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '紅隊 #13' },
        { id: 'p14', teamId: 't1', number: '14', name: '陳竑墐', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '紅隊 #14' },

        // 🔵 藍隊 (t2) — 共 14 人
        { id: 'p15', teamId: 't2', number: '1',  name: '曾聖壹', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'P / IF',  note: '藍隊 #1' },
        { id: 'p16', teamId: 't2', number: '2',  name: '毛浩然', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'C / IF',  note: '藍隊 #2' },
        { id: 'p17', teamId: 't2', number: '3',  name: '許凱翔', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '藍隊 #3' },
        { id: 'p18', teamId: 't2', number: '4',  name: '王以哲', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '藍隊 #4' },
        { id: 'p19', teamId: 't2', number: '5',  name: '許佑銓', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / P',  note: '藍隊 #5' },
        { id: 'p20', teamId: 't2', number: '6',  name: '郭宸汰', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'SS / IF', note: '藍隊 #6' },
        { id: 'p21', teamId: 't2', number: '7',  name: '蕭梓弘', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'OF / IF', note: '藍隊 #7' },
        { id: 'p22', teamId: 't2', number: '8',  name: '許績輝', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'OF / IF', note: '藍隊 #8' },
        { id: 'p23', teamId: 't2', number: '9',  name: '陳逸釩', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'OF / IF', note: '藍隊 #9' },
        { id: 'p24', teamId: 't2', number: '10', name: '林霆融', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'P / IF',  note: '藍隊 #10' },
        { id: 'p25', teamId: 't2', number: '13', name: '余景淳', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '藍隊 #13' },
        { id: 'p26', teamId: 't2', number: '14', name: '林立豐', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '藍隊 #14' },
        { id: 'p27', teamId: 't2', number: '15', name: '翁巾懷', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '藍隊 #15' },
        { id: 'p28', teamId: 't2', number: '20', name: '陳柏豪', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'P / IF',  note: '藍隊 #20' },

        // ⚪ 白隊 (t3) — 共 14 人
        { id: 'p29', teamId: 't3', number: '1',  name: '黃安誠', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'P / IF',  note: '白隊 #1' },
        { id: 'p30', teamId: 't3', number: '2',  name: '顏煜宸', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'C / IF',  note: '白隊 #2' },
        { id: 'p31', teamId: 't3', number: '3',  name: '蔡宇晟', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '白隊 #3' },
        { id: 'p32', teamId: 't3', number: '4',  name: '林俊宏', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '白隊 #4' },
        { id: 'p33', teamId: 't3', number: '5',  name: '吳苙均', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / P',  note: '白隊 #5' },
        { id: 'p34', teamId: 't3', number: '6',  name: '許績瑞', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'SS / IF', note: '白隊 #6' },
        { id: 'p35', teamId: 't3', number: '7',  name: '顏以禾', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'OF / IF', note: '白隊 #7' },
        { id: 'p36', teamId: 't3', number: '8',  name: '張焱融', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'OF / IF', note: '白隊 #8' },
        { id: 'p37', teamId: 't3', number: '9',  name: '黃展滔', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'OF / IF', note: '白隊 #9' },
        { id: 'p38', teamId: 't3', number: '10', name: '賴冠霖', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'P / IF',  note: '白隊 #10' },
        { id: 'p39', teamId: 't3', number: '11', name: '涂芳綵', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '白隊 #11' },
        { id: 'p40', teamId: 't3', number: '12', name: '何東芮', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '白隊 #12' },
        { id: 'p41', teamId: 't3', number: '13', name: '黃啟紘', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '白隊 #13' },
        { id: 'p42', teamId: 't3', number: '14', name: '洪晨雨', grade: '少棒隊員', bats: 'R', throws: 'R', pos: 'IF / OF', note: '白隊 #14' }
    ],
    trades: [],
    games: []
};

class DataStore {
    constructor() {
        this.data = this.load();
        this.serverAvailable = false;
        this.firebaseConnected = false;
        this.firebaseDbUrl = this.loadFirebaseUrl();
        this.lastCloudTimestamp = 0;
        this.sseSource = null;
        this.initServerSync();
        this.initFirebaseSync();
    }

    loadFirebaseUrl() {
        const saved = localStorage.getItem(FIREBASE_URL_STORAGE_KEY);
        if (saved && saved.trim()) return this.normalizeFirebaseUrl(saved);
        if (window.FIREBASE_DEFAULT_CONFIG && window.FIREBASE_DEFAULT_CONFIG.databaseURL) {
            return this.normalizeFirebaseUrl(window.FIREBASE_DEFAULT_CONFIG.databaseURL);
        }
        return '';
    }

    normalizeFirebaseUrl(url) {
        if (!url) return '';
        let clean = url.trim().replace(/\/+$/, '');
        clean = clean.replace(/\/jj_baseball.*$/i, '').replace(/\.json$/i, '');
        return clean;
    }

    async setFirebaseUrl(url) {
        const clean = this.normalizeFirebaseUrl(url);
        this.firebaseDbUrl = clean;
        if (clean) {
            localStorage.setItem(FIREBASE_URL_STORAGE_KEY, clean);
            return await this.initFirebaseSync(true);
        } else {
            localStorage.removeItem(FIREBASE_URL_STORAGE_KEY);
            this.firebaseConnected = false;
            if (window.app) window.app.refreshAll();
            return false;
        }
    }

    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.teams) && Array.isArray(parsed.players)) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('讀取 LocalStorage 失敗，使用預設三隊聯盟資料', e);
        }
        const clone = JSON.parse(JSON.stringify(DEFAULT_LEAGUE_DATA));
        this.saveLocal(clone);
        return clone;
    }

    saveLocal(dataObj = this.data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataObj));
        } catch (e) {
            console.error('儲存 LocalStorage 失敗', e);
        }
    }

    async save() {
        this.data._updatedAt = Date.now();
        this.lastCloudTimestamp = this.data._updatedAt;
        this.saveLocal(this.data);

        // 1. 若有設定 Firebase 雲端資料庫，立即同步至 Firebase
        if (this.firebaseDbUrl) {
            try {
                const res = await fetch(`${this.firebaseDbUrl}/jj_baseball/league_data.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.data)
                });
                if (res.ok) this.firebaseConnected = true;
            } catch (e) {
                console.warn('Firebase 雲端寫入失敗', e);
            }
        }

        // 2. 若有開啟本機 Node.js 伺服器，同步寫入本機伺服器
        if (this.serverAvailable) {
            try {
                await fetch('/api/data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.data)
                });
            } catch (e) {
                console.warn('區域網路同步寫入失敗', e);
            }
        }
    }

    async initFirebaseSync(forceAlert = false) {
        if (!this.firebaseDbUrl) return false;
        try {
            const res = await fetch(`${this.firebaseDbUrl}/jj_baseball/league_data.json`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const cloudData = await res.json();

            if (cloudData && Array.isArray(cloudData.teams) && Array.isArray(cloudData.players)) {
                this.data = cloudData;
                this.lastCloudTimestamp = cloudData._updatedAt || Date.now();
                this.saveLocal(this.data);
                this.firebaseConnected = true;
            } else {
                // 雲端尚無資料，自動將目前本地的三隊資料上傳初始化至 Firebase！
                await this.save();
                this.firebaseConnected = true;
            }

            if (window.app) window.app.refreshAll();
            this.startFirebasePolling();
            return true;
        } catch (e) {
            this.firebaseConnected = false;
            if (window.app) window.app.refreshAll();
            if (forceAlert) {
                alert('❌ 無法連線至 Firebase 資料庫，請確認網址是否正確，且資料庫規則 (Rules) 已設為公開讀寫 (.read: true, .write: true)。\n錯誤訊息：' + e.message);
            }
            return false;
        }
    }

    startFirebasePolling() {
        if (this._fbInterval) clearInterval(this._fbInterval);
        this._fbInterval = setInterval(async () => {
            if (!this.firebaseDbUrl || !this.firebaseConnected) return;
            try {
                const res = await fetch(`${this.firebaseDbUrl}/jj_baseball.json`, { cache: 'no-store' });
                if (!res.ok) return;
                const root = await res.json();
                if (!root) return;

                if (root.league_data && root.league_data._updatedAt && root.league_data._updatedAt > this.lastCloudTimestamp) {
                    this.lastCloudTimestamp = root.league_data._updatedAt;
                    this.data = root.league_data;
                    this.saveLocal(this.data);
                    if (window.app) window.app.refreshAll();
                }

                if (window.scorebook && root.live_game !== undefined) {
                    const cloudLive = root.live_game ? root.live_game.state : null;
                    const cloudLiveTs = root.live_game ? (root.live_game._updatedAt || 0) : 0;
                    if (cloudLiveTs > (window.scorebook.lastLiveTimestamp || 0)) {
                        window.scorebook.lastLiveTimestamp = cloudLiveTs;
                        window.scorebook.state = cloudLive;
                        window.scorebook.saveLiveState(false);
                        if (window.app) window.app.refreshAll();
                    }
                }
            } catch (e) {}
        }, 3000);
    }

    async initServerSync() {
        if (window.location.protocol === 'file:') return;
        try {
            const res = await fetch('/api/data', { cache: 'no-store' });
            if (res.ok) {
                this.serverAvailable = true;
                const serverData = await res.json();
                if (serverData && Array.isArray(serverData.teams) && Array.isArray(serverData.players)) {
                    this.data = serverData;
                    this.saveLocal(this.data);
                    if (window.app) window.app.refreshAll();
                } else {
                    await this.save();
                }
                this.connectSSE();
            }
        } catch (e) {
            this.serverAvailable = false;
        }
    }

    connectSSE() {
        if (typeof EventSource === 'undefined') return;
        try {
            this.sseSource = new EventSource('/api/events');
            this.sseSource.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'data_updated' && msg.data) {
                        this.data = msg.data;
                        this.saveLocal(this.data);
                        if (window.app) window.app.refreshAll();
                    } else if (msg.type === 'live_updated' && window.scorebook) {
                        window.scorebook.state = msg.liveState;
                        window.scorebook.saveLiveState(false);
                        if (window.app) window.app.refreshAll();
                    }
                } catch (err) {}
            };
        } catch (e) {}
    }

    resetToDefault() {
        this.data = JSON.parse(JSON.stringify(DEFAULT_LEAGUE_DATA));
        this.save();
    }

    clearGamesAndTradesKeepTeams() {
        this.data.games = [];
        this.data.trades = [];
        this.save();
    }

    getTeam(teamId) {
        return (this.data.teams || []).find(t => t.id === teamId) || { id: teamId, name: '未分隊', emoji: '⚾', color: '#64748b' };
    }

    getPlayer(playerId) {
        return (this.data.players || []).find(p => p.id === playerId);
    }

    getPlayersByTeam(teamId) {
        if (!teamId || teamId === 'ALL') return this.data.players || [];
        return (this.data.players || []).filter(p => p.teamId === teamId);
    }
}

window.store = new DataStore();
