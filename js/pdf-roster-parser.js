/**
 * 國小少棒大會秩序冊 PDF / JPG / PNG 智慧解析引擎 (Tournament Booklet & Image OCR Parser)
 * 支援各大少棒聯賽秩序冊（PDF 整本）以及手機拍攝的單頁名單相片（JPG / PNG / WEBP）
 * 自動解析各校隊名與全隊選手（背號、姓名、守位）
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PdfRosterParser = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    class PdfRosterParser {
        constructor() {
            if (typeof window !== 'undefined' && window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.min.js';
            }
        }

        /**
         * 排除非隊伍名稱的常見賽事、大會規章關鍵字
         */
        static isInvalidTeamName(text) {
            if (!text || text.length < 2 || text.length > 25) return true;
            const blacklist = [
                '錦標賽', '選拔賽', '聯賽', '大會', '秩序冊', '賽程表', '賽事', '規程', '附則',
                '注意事項', '工作人員', '裁判組', '競賽組', '組委會', '開幕典禮', '閉幕典禮',
                '獎勵辦法', '抗議', '申訴', '防疫', '承辦單位', '協辦單位', '指導單位',
                '主辦單位', '領隊會議', '投手限制', '比賽規則', '選手資格', '報名表',
                '中正國小少棒', '本隊', '目錄', '頁次'
            ];
            return blacklist.some(k => text.includes(k));
        }

        /**
         * 解析單行中可能出現的球隊/學校名稱
         */
        static extractTeamName(line) {
            const trimmed = line.trim().replace(/^[\d+.\-、\s]+/, '').replace(/[【】\[\]()（）]/g, '');
            if (this.isInvalidTeamName(trimmed)) return null;

            // 格式 1：隊名：XXX 或 學校：XXX 或 單位：XXX
            const labeledMatch = trimmed.match(/(?:隊名|隊伍名稱|學校名稱|參賽單位|學校|單位)[：:\s]+([^\r\n,，;]+)/);
            if (labeledMatch) {
                const name = labeledMatch[1].trim();
                if (!this.isInvalidTeamName(name) && name.length >= 3) return name;
            }

            // 格式 2：縣市開頭 + 學校名（例如：桃園市龜山國小、臺北市東園國小少棒隊）
            const cityMatch = trimmed.match(/(?:臺北|台北|新北|桃園|臺中|台中|臺南|台南|高雄|基隆|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門|連江)[縣市]?[^\s\d]{1,8}(?:國小|國民小學|少棒隊|少棒|少棒代表隊)/);
            if (cityMatch) {
                const name = cityMatch[0].trim();
                if (!this.isInvalidTeamName(name)) return name;
            }

            // 格式 3：以「國小」或「國民小學」結尾的名稱（例如：忠孝國小、龜山國小）
            const schoolMatch = trimmed.match(/^([^\s\d]{2,10}(?:國小|國民小學))(?:少棒隊|代表隊)?$/);
            if (schoolMatch) {
                const name = schoolMatch[1].trim();
                if (!this.isInvalidTeamName(name)) return name;
            }

            return null;
        }

        /**
         * 判斷是否為教練、領隊或行政人員列
         */
        static isStaffLine(line) {
            return /(?:領隊|總教練|教練|管理|運動防護員|防護員|指導老師|帶隊老師|聯絡人)[：:\s]/.test(line);
        }

        /**
         * 從單行或字詞群解析選手（背號、姓名、守位）
         */
        static extractPlayerFromLine(line, autoNumber = 1) {
            const clean = line.trim();
            if (!clean || this.isStaffLine(clean)) return null;

            // 排除表頭（如：背號 姓名 守位 出生年月日）
            if (/(?:背號|姓名|守位|守備|出生|生日|身分證|身高|體重|備註|年級)/.test(clean) && !/\d+/.test(clean)) {
                return null;
            }

            const tokens = clean.split(/[、\s\t,]+/).filter(Boolean);
            if (tokens.length < 2) return null;

            let num = '';
            let name = '';
            let pos = '選手';

            // 若第一個 token 是純數字或 #數字（背號 0~99）
            if (/^#?\d{1,2}$/.test(tokens[0])) {
                const n = parseInt(tokens[0].replace('#', ''), 10);
                if (n >= 0 && n <= 99) {
                    num = String(n);
                    const candidateName = tokens[1].replace(/[0-9*#]/g, '');
                    if (/^[\u4e00-\u9fa5·•]{2,6}$/.test(candidateName)) {
                        name = candidateName;
                        pos = tokens.slice(2).join(' ').trim() || (num === '10' ? '隊長 / 選手' : (num === '1' ? '投手' : '選手'));
                        return { number: num, name, pos };
                    }
                }
            }

            // 格式 B：姓名在前面，背號在中間（例如：王小明 10 投手）
            if (/^[\u4e00-\u9fa5·•]{2,6}$/.test(tokens[0]) && /^#?\d{1,2}$/.test(tokens[1])) {
                name = tokens[0];
                num = String(parseInt(tokens[1].replace('#', ''), 10));
                pos = tokens.slice(2).join(' ').trim() || (num === '10' ? '隊長 / 選手' : '選手');
                return { number: num, name, pos };
            }

            return null;
        }

        /**
         * 解析 PDF 文字物件，將散落的 text items 依據 Y/X 座標重組成真正的文字行
         */
        static reconstructLinesFromTextContent(textContent) {
            const items = textContent.items || [];
            if (items.length === 0) return [];

            const rows = [];
            const sortedItems = [...items].sort((a, b) => {
                const yA = a.transform[5];
                const yB = b.transform[5];
                if (Math.abs(yA - yB) > 4) {
                    return yB - yA;
                }
                return a.transform[4] - b.transform[4];
            });

            let curY = null;
            let curRow = [];

            sortedItems.forEach(item => {
                const str = (item.str || '').trim();
                if (!str) return;
                const y = item.transform[5];
                if (curY === null || Math.abs(y - curY) > 4) {
                    if (curRow.length > 0) {
                        rows.push(curRow.map(it => it.str.trim()).filter(Boolean).join(' '));
                    }
                    curY = y;
                    curRow = [item];
                } else {
                    curRow.push(item);
                }
            });

            if (curRow.length > 0) {
                rows.push(curRow.map(it => it.str.trim()).filter(Boolean).join(' '));
            }

            return rows;
        }

        /**
         * 智慧檔案解析主入口（自動分流 PDF 與 JPG/PNG）
         */
        async parseTournamentFile(file, onProgress = null) {
            const isImage = (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|webp)$/i.test(file.name || '');
            if (isImage) {
                return this.parseTournamentImage(file, onProgress);
            }
            return this.parseTournamentPdf(file, onProgress);
        }

        /**
         * 解析 JPG / PNG / WEBP 圖片照片（使用 Tesseract OCR 辨識）
         */
        async parseTournamentImage(file, onProgress = null) {
            const Tesseract = (typeof window !== 'undefined' && window.Tesseract) ? window.Tesseract : null;
            if (!Tesseract) {
                throw new Error('未載入 Tesseract 圖片辨識引擎，請確認 js/tesseract.min.js 已載入');
            }

            if (onProgress) {
                onProgress({ status: 'init', progress: 0.1, message: '正在初始化圖片文字辨識引擎 (OCR)...' });
            }

            let ret;
            try {
                // 使用繁體中文 + 英文/數字模型
                ret = await Tesseract.recognize(file, 'chi_tra+eng', {
                    logger: m => {
                        if (onProgress && m && m.status === 'recognizing text') {
                            const pct = Math.round((m.progress || 0) * 100);
                            onProgress({
                                status: 'recognizing',
                                progress: m.progress,
                                message: `正在智慧辨識相片中的球隊與球員資料 (${pct}%)...`
                            });
                        }
                    }
                });
            } catch (err) {
                console.error('Tesseract recognize error:', err);
                throw new Error('圖片辨識過程發生錯誤，請確認照片清晰度：' + (err.message || err));
            }

            const rawText = (ret && ret.data && ret.data.text) ? ret.data.text : '';
            const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

            // 1. 尋找隊伍名稱
            let detectedTeamName = null;
            for (const line of lines) {
                const team = PdfRosterParser.extractTeamName(line);
                if (team) {
                    detectedTeamName = team;
                    break;
                }
            }

            // 若圖片中未印出學校名稱，以照片檔名作為隊名（去除副檔名與 IMG_ 前綴）
            if (!detectedTeamName) {
                const baseName = (file.name || '').replace(/\.[^/.]+$/, '').replace(/^(IMG_|PHOTO_|LINE_|IMAGE_)/i, '').trim();
                detectedTeamName = (baseName && baseName.length >= 2 && !/^\d+$/.test(baseName)) ? baseName : '照片辨識隊伍';
            }

            // 2. 尋找選手名單
            const players = [];
            for (const line of lines) {
                const p = PdfRosterParser.extractPlayerFromLine(line);
                if (p) {
                    if (!players.some(x => x.number === p.number)) {
                        players.push(p);
                    }
                }
            }

            // 若標準格式未抓到，啟用寬鬆解析（匹配 背號 + 中文姓名）
            if (players.length === 0) {
                lines.forEach(l => {
                    const match = l.match(/#?(\d{1,2})[、\s\t:.-]+([\u4e00-\u9fa5]{2,4})/);
                    if (match) {
                        const num = match[1];
                        const name = match[2];
                        if (!players.some(x => x.number === num)) {
                            players.push({
                                number: num,
                                name: name,
                                pos: num === '10' ? '隊長' : (num === '1' ? '投手' : '選手')
                            });
                        }
                    }
                });
            }

            if (players.length === 0) {
                return [];
            }

            const sorted = [...players].sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));
            const prefix = detectedTeamName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').slice(0, 8);

            return [{
                schoolName: detectedTeamName,
                players: sorted.map(p => ({
                    id: `opp_${prefix}_${p.number}`,
                    number: p.number,
                    name: p.name,
                    pos: p.pos || '選手',
                    teamId: 'OPP'
                }))
            }];
        }

        /**
         * 解析整本秩序冊 PDF
         */
        async parseTournamentPdf(fileOrBuffer, onProgress = null) {
            const pdfjs = (typeof window !== 'undefined' && window.pdfjsLib) ? window.pdfjsLib : (typeof require !== 'undefined' ? require('./pdf.min.js') : null);
            if (!pdfjs) {
                throw new Error('未載入 pdf.js 解析函式庫，請確認 js/pdf.min.js 存在');
            }

            let dataBuffer;
            if (fileOrBuffer instanceof ArrayBuffer) {
                dataBuffer = fileOrBuffer;
            } else if (typeof File !== 'undefined' && fileOrBuffer instanceof File) {
                dataBuffer = await fileOrBuffer.arrayBuffer();
            } else {
                throw new Error('不支援的檔案格式，請傳入 PDF File 或 ArrayBuffer');
            }

            const doc = await pdfjs.getDocument({ data: dataBuffer }).promise;
            const totalPages = doc.numPages;

            const teamsMap = new Map();
            let currentTeamName = null;
            let currentTeamPlayers = [];

            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                const page = await doc.getPage(pageNum);
                const textContent = await page.getTextContent({ normalizeWhitespace: true });
                const lines = PdfRosterParser.reconstructLinesFromTextContent(textContent);

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];

                    const detectedTeam = PdfRosterParser.extractTeamName(line);
                    if (detectedTeam) {
                        if (currentTeamName && currentTeamPlayers.length > 0) {
                            if (!teamsMap.has(currentTeamName) || teamsMap.get(currentTeamName).length < currentTeamPlayers.length) {
                                teamsMap.set(currentTeamName, currentTeamPlayers);
                            }
                        }
                        currentTeamName = detectedTeam;
                        currentTeamPlayers = teamsMap.get(currentTeamName) ? [...teamsMap.get(currentTeamName)] : [];
                        continue;
                    }

                    if (currentTeamName) {
                        const player = PdfRosterParser.extractPlayerFromLine(line);
                        if (player) {
                            if (!currentTeamPlayers.some(p => p.number === player.number)) {
                                currentTeamPlayers.push(player);
                            }
                        }
                    }
                }

                if (onProgress) {
                    onProgress({
                        page: pageNum,
                        totalPages,
                        detectedTeamsCount: teamsMap.size + (currentTeamName && currentTeamPlayers.length > 0 ? 1 : 0)
                    });
                }
            }

            if (currentTeamName && currentTeamPlayers.length > 0) {
                if (!teamsMap.has(currentTeamName) || teamsMap.get(currentTeamName).length < currentTeamPlayers.length) {
                    teamsMap.set(currentTeamName, currentTeamPlayers);
                }
            }

            const result = [];
            teamsMap.forEach((rawPlayers, schoolName) => {
                if (rawPlayers.length >= 3) {
                    const sortedPlayers = [...rawPlayers].sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));
                    const prefix = schoolName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').slice(0, 8);
                    const players = sortedPlayers.map(p => ({
                        id: `opp_${prefix}_${p.number}`,
                        number: p.number,
                        name: p.name,
                        pos: p.pos || '選手',
                        teamId: 'OPP'
                    }));
                    result.push({ schoolName, players });
                }
            });

            return result;
        }
    }

    return PdfRosterParser;
}));
