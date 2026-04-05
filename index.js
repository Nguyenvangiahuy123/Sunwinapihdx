const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3001;

let apiResponseData = {
    Phien: null,
    Xuc_xac_1: null,
    Xuc_xac_2: null,
    Xuc_xac_3: null,
    Tong: null,
    Ket_qua: "",
    id: "@cskh_huydaixu",
    server_time: new Date().toISOString()
};

let currentSessionId = null;
const patternHistory = [];
const MAX_HISTORY = 1000;

// ========== WEBSOCKET ==========
const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Origin: "https://play.sun.win"
};
const RECONNECT_DELAY = 2500;
const PING_INTERVAL = 15000;

const initialMessages = [
    [
        1,
        "MiniGame",
        "GM_apivopnhaan",
        "WangLin",
        {
            info: '{"ipAddress":"113.185.45.88","wsToken":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJwbGFtYW1hIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzMxNDgxMTYyLCJhZmZJZCI6IkdFTVdJTiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzY2NDc0NzgwMDA2LCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjExMy4xODUuNDUuODgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE4LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjZhOGI0ZDM4LTFlYzEtNDUxYi1hYTA1LWYyZDkwYWFhNGM1MCIsInJlZ1RpbWUiOjE3NjY0NzQ3NTEzOTEsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fYXBpdm9wbmhhYW4ifQ.YFOscbeojWNlRo7490BtlzkDGYmwVpnlgOoh04oCJy4","locale":"vi","userId":"6a8b4d38-1ec1-451b-aa05-f2d90aaa4c50","username":"GM_apivopnhaan","timestamp":1766474780007,"refreshToken":"63d5c9be0c494b74b53ba150d69039fd.7592f06d63974473b4aaa1ea849b2940"}',
            signature: "66772A1641AA8B18BD99207CE448EA00ECA6D8A4D457C1FF13AB092C22C8DECF0C0014971639A0FBA9984701A91FCCBE3056ABC1BE1541D1C198AA18AF3C45595AF6601F8B048947ADF8F48A9E3E074162F9BA3E6C0F7543D38BD54FD4C0A2C56D19716CC5353BBC73D12C3A92F78C833F4EFFDC4AB99E55C77AD2CDFA91E296"
        }
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

let ws = null;
let pingInterval = null;
let reconnectTimeout = null;

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const alias of iface) {
            if (alias.family === "IPv4" && !alias.internal) return alias.address;
        }
    }
    return "127.0.0.1";
}

// ========== 8 PHƯƠNG PHÁP AI ==========
let methodWeights = {
    markov: 0.15,
    frequency: 0.15,
    cycle: 0.12,
    trend: 0.12,
    fibonacci: 0.12,
    pair: 0.12,
    streak: 0.11,
    bayes: 0.11
};

let methodPredictionsLog = []; // lưu { session, actual, markov, freq, ... }
let methodAccuracy = {}; // lưu accuracy gần đây của từng method

function updateAdaptiveWeights() {
    if (methodPredictionsLog.length < 30) return;
    const recent = methodPredictionsLog.slice(-100);
    let correctCount = { markov:0, frequency:0, cycle:0, trend:0, fibonacci:0, pair:0, streak:0, bayes:0 };
    let totalCount = { markov:0, frequency:0, cycle:0, trend:0, fibonacci:0, pair:0, streak:0, bayes:0 };
    for (let log of recent) {
        if (!log.actual) continue;
        if (log.markov) { totalCount.markov++; if(log.markov === log.actual) correctCount.markov++; }
        if (log.freq) { totalCount.frequency++; if(log.freq === log.actual) correctCount.frequency++; }
        if (log.cycle) { totalCount.cycle++; if(log.cycle === log.actual) correctCount.cycle++; }
        if (log.trend) { totalCount.trend++; if(log.trend === log.actual) correctCount.trend++; }
        if (log.fibonacci) { totalCount.fibonacci++; if(log.fibonacci === log.actual) correctCount.fibonacci++; }
        if (log.pair) { totalCount.pair++; if(log.pair === log.actual) correctCount.pair++; }
        if (log.streak) { totalCount.streak++; if(log.streak === log.actual) correctCount.streak++; }
        if (log.bayes) { totalCount.bayes++; if(log.bayes === log.actual) correctCount.bayes++; }
    }
    let acc = {};
    for (let m of Object.keys(methodWeights)) {
        let total = totalCount[m];
        acc[m] = total > 5 ? correctCount[m]/total : methodWeights[m];
    }
    let sum = Object.values(acc).reduce((a,b)=>a+b,0);
    if (sum === 0) sum = 1;
    for (let m of Object.keys(methodWeights)) {
        let newW = acc[m] / sum;
        methodWeights[m] = methodWeights[m] * 0.8 + newW * 0.2;
    }
    let totalW = Object.values(methodWeights).reduce((a,b)=>a+b,0);
    for (let m of Object.keys(methodWeights)) methodWeights[m] /= totalW;
    methodAccuracy = acc;
    console.log("[AI] Updated weights:", methodWeights);
}

function getSeq(history) {
    return history.map(h => (h.result === "Tài" ? "T" : "X")).join("");
}

// 1. Markov (bậc 3-5)
function predictMarkov(seq) {
    if (seq.length < 4) return null;
    let best = null, bestConf = 0;
    for (let order = 3; order <= Math.min(5, seq.length-1); order++) {
        const last = seq.slice(-order);
        const trans = {};
        for (let i = 0; i <= seq.length - order - 1; i++) {
            const pat = seq.slice(i, i+order);
            const next = seq[i+order];
            if (!trans[pat]) trans[pat] = { T:0, X:0 };
            trans[pat][next]++;
        }
        const possible = trans[last];
        if (!possible) continue;
        const total = possible.T + possible.X;
        const probTai = possible.T/total;
        const conf = (Math.max(possible.T, possible.X)/total)*100;
        if (conf > bestConf) {
            bestConf = conf;
            best = probTai > 0.5 ? "Tài" : probTai < 0.5 ? "Xỉu" : (Math.random()<0.5?"Tài":"Xỉu");
        }
    }
    return best ? { prediction: best, confidence: Math.round(bestConf) } : null;
}

// 2. Tần suất có trọng số
function predictFreq(history, window=50) {
    const recent = history.slice(-window);
    let wTai=0, wXiu=0;
    for (let i=0; i<recent.length; i++) {
        const w = Math.pow(0.93, recent.length-1-i);
        if (recent[i].result === "Tài") wTai+=w;
        else wXiu+=w;
    }
    if (wTai+wXiu === 0) return null;
    const probTai = wTai/(wTai+wXiu);
    const pred = probTai>0.5 ? "Tài" : "Xỉu";
    const conf = Math.abs(probTai-0.5)*2*100;
    return { prediction: pred, confidence: Math.min(95, Math.max(50, conf)) };
}

// 3. Chu kỳ
function predictCycle(seq, maxCycle=20) {
    for (let cycle=3; cycle<=maxCycle; cycle++) {
        if (seq.length < cycle*2) continue;
        const lastCycle = seq.slice(-cycle);
        let matches = [];
        for (let i=0; i<=seq.length-cycle-1; i++) {
            if (seq.slice(i, i+cycle) === lastCycle) matches.push(i);
        }
        if (matches.length >= 2) {
            const nextIdx = matches[matches.length-1] + cycle;
            if (nextIdx < seq.length) {
                const nextRes = seq[nextIdx];
                const pred = nextRes === "T" ? "Tài" : "Xỉu";
                let conf = 60 + Math.min(30, matches.length*3);
                return { prediction: pred, confidence: conf };
            }
        }
    }
    return null;
}

// 4. Xu hướng (streak, alternating, pattern 2-1-2)
function predictTrend(history) {
    if (history.length < 6) return null;
    const last6 = history.slice(-6).map(h=>h.result);
    const last3 = last6.slice(-3);
    if (last3[0]===last3[1] && last3[1]===last3[2]) {
        return { prediction: last3[0]==="Tài" ? "Xỉu" : "Tài", confidence: 72 };
    }
    let alt = true;
    for (let i=1;i<last6.length;i++) if(last6[i]===last6[i-1]) alt=false;
    if (alt && last6.length>=4) {
        return { prediction: last6[last6.length-1]==="Tài" ? "Xỉu" : "Tài", confidence: 76 };
    }
    if (last6.length>=5 && last6[0]===last6[1] && last6[2]===last6[3] && last6[1]!==last6[2]) {
        return { prediction: last6[3]==="Tài" ? "Xỉu" : "Tài", confidence: 68 };
    }
    const tai = last6.filter(r=>r==="Tài").length;
    const xiu = 6-tai;
    if (tai!==xiu) {
        const pred = tai>xiu ? "Tài":"Xỉu";
        const conf = 55 + Math.abs(tai-xiu)*3;
        return { prediction: pred, confidence: Math.min(75,conf) };
    }
    return null;
}

// 5. Fibonacci dựa trên tổng điểm
function predictFibonacci(history) {
    if (history.length < 12) return null;
    const totals = history.slice(-12).map(h=>h.total);
    const diffs = [];
    for (let i=1;i<totals.length;i++) diffs.push(totals[i]-totals[i-1]);
    const avgDiff = diffs.reduce((a,b)=>a+b,0)/diffs.length;
    let nextTotal = totals[totals.length-1] + avgDiff;
    nextTotal = Math.min(18, Math.max(3, Math.round(nextTotal)));
    const pred = nextTotal > 10 ? "Tài" : "Xỉu";
    const conf = 55 + Math.min(30, Math.abs(avgDiff)*2.5);
    return { prediction: pred, confidence: Math.min(85, conf) };
}

// 6. Phân tích cặp xúc xắc
function predictPair(history) {
    if (history.length < 15) return null;
    const recent = history.slice(-15);
    const last = history[history.length-1];
    const lastPairs = {
        p12: `${last.dice[0]},${last.dice[1]}`,
        p23: `${last.dice[1]},${last.dice[2]}`,
        p13: `${last.dice[0]},${last.dice[2]}`
    };
    let tai=0, xiu=0;
    for (const item of recent) {
        const p12 = `${item.dice[0]},${item.dice[1]}`;
        const p23 = `${item.dice[1]},${item.dice[2]}`;
        const p13 = `${item.dice[0]},${item.dice[2]}`;
        if (p12===lastPairs.p12 || p23===lastPairs.p23 || p13===lastPairs.p13) {
            if (item.result === "Tài") tai++; else xiu++;
        }
    }
    if (tai+xiu < 4) return null;
    const pred = tai>xiu ? "Tài":"Xỉu";
    const conf = 55 + Math.min(30, Math.abs(tai-xiu)*2);
    return { prediction: pred, confidence: Math.min(85, conf) };
}

// 7. Phân tích độ dài chuỗi (streak)
function predictStreak(history) {
    if (history.length < 5) return null;
    let streakLen = 1;
    for (let i=history.length-2; i>=0; i--) {
        if (history[i].result === history[history.length-1].result) streakLen++;
        else break;
    }
    // Nếu streak dài >=3, dự đoán đảo cầu
    if (streakLen >= 3) {
        const pred = history[history.length-1].result === "Tài" ? "Xỉu" : "Tài";
        let conf = 60 + Math.min(25, streakLen*4);
        return { prediction: pred, confidence: Math.min(85, conf) };
    }
    // Nếu streak =1 hoặc 2, dự đoán tiếp tục (bệt nhẹ)
    if (streakLen <= 2) {
        const pred = history[history.length-1].result;
        let conf = 55 + streakLen*5;
        return { prediction: pred, confidence: Math.min(75, conf) };
    }
    return null;
}

// 8. Bayes với mẫu 3 phiên gần nhất
function predictBayes(history) {
    if (history.length < 10) return null;
    const seq = getSeq(history);
    const last3 = seq.slice(-3);
    let taiCount=0, xiuCount=0;
    for (let i=0; i<=seq.length-4; i++) {
        const pattern = seq.slice(i, i+3);
        if (pattern === last3) {
            const next = seq[i+3];
            if (next === 'T') taiCount++;
            else xiuCount++;
        }
    }
    if (taiCount+xiuCount < 3) return null;
    const pred = taiCount > xiuCount ? "Tài" : "Xỉu";
    const conf = 55 + Math.min(30, Math.abs(taiCount-xiuCount)*4);
    return { prediction: pred, confidence: Math.min(90, conf) };
}

// Kết hợp tất cả
function combinedPredict(history) {
    if (history.length < 10) return { prediction: "Chưa đủ dữ liệu", confidence: 0, details: {} };
    const seq = getSeq(history);
    const markov = predictMarkov(seq);
    const freq = predictFreq(history, 50);
    const cycle = predictCycle(seq, 20);
    const trend = predictTrend(history);
    const fib = predictFibonacci(history);
    const pair = predictPair(history);
    const streak = predictStreak(history);
    const bayes = predictBayes(history);

    let scores = { Tài:0, Xỉu:0 };
    const details = {};
    if (markov) { scores[markov.prediction] += methodWeights.markov * (markov.confidence/100); details.markov = markov; }
    if (freq) { scores[freq.prediction] += methodWeights.frequency * (freq.confidence/100); details.freq = freq; }
    if (cycle) { scores[cycle.prediction] += methodWeights.cycle * (cycle.confidence/100); details.cycle = cycle; }
    if (trend) { scores[trend.prediction] += methodWeights.trend * (trend.confidence/100); details.trend = trend; }
    if (fib) { scores[fib.prediction] += methodWeights.fibonacci * (fib.confidence/100); details.fibonacci = fib; }
    if (pair) { scores[pair.prediction] += methodWeights.pair * (pair.confidence/100); details.pair = pair; }
    if (streak) { scores[streak.prediction] += methodWeights.streak * (streak.confidence/100); details.streak = streak; }
    if (bayes) { scores[bayes.prediction] += methodWeights.bayes * (bayes.confidence/100); details.bayes = bayes; }

    let totalWeight = Object.values(methodWeights).reduce((a,b)=>a+b,0);
    let finalPred = scores.Tài > scores.Xỉu ? "Tài" : "Xỉu";
    let maxScore = Math.max(scores.Tài, scores.Xỉu);
    let confidence = Math.round((maxScore/totalWeight)*100);
    confidence = Math.min(99, Math.max(50, confidence));
    return { prediction: finalPred, confidence, details };
}

// Dự đoán tại một index trong quá khứ (để tính accuracy)
function predictAtIdx(history, idx) {
    if (idx < 10) return { prediction: null, confidence: 0 };
    const past = history.slice(0, idx);
    const seq = getSeq(past);
    const markov = predictMarkov(seq);
    const freq = predictFreq(past, 50);
    const cycle = predictCycle(seq, 20);
    const trend = predictTrend(past);
    const fib = predictFibonacci(past);
    const pair = predictPair(past);
    const streak = predictStreak(past);
    const bayes = predictBayes(past);
    let scores = { Tài:0, Xỉu:0 };
    if (markov) scores[markov.prediction] += methodWeights.markov * (markov.confidence/100);
    if (freq) scores[freq.prediction] += methodWeights.frequency * (freq.confidence/100);
    if (cycle) scores[cycle.prediction] += methodWeights.cycle * (cycle.confidence/100);
    if (trend) scores[trend.prediction] += methodWeights.trend * (trend.confidence/100);
    if (fib) scores[fib.prediction] += methodWeights.fibonacci * (fib.confidence/100);
    if (pair) scores[pair.prediction] += methodWeights.pair * (pair.confidence/100);
    if (streak) scores[streak.prediction] += methodWeights.streak * (streak.confidence/100);
    if (bayes) scores[bayes.prediction] += methodWeights.bayes * (bayes.confidence/100);
    let totalWeight = Object.values(methodWeights).reduce((a,b)=>a+b,0);
    if (totalWeight === 0) return { prediction: null, confidence: 0 };
    const finalPred = scores.Tài > scores.Xỉu ? "Tài" : "Xỉu";
    const conf = Math.round((Math.max(scores.Tài, scores.Xỉu)/totalWeight)*100);
    return { prediction: finalPred, confidence: Math.min(99, Math.max(50, conf)) };
}

function logMethods(session, actual, markov, freq, cycle, trend, fib, pair, streak, bayes) {
    methodPredictionsLog.push({ session, actual, markov, freq, cycle, trend, fibonacci:fib, pair, streak, bayes, ts: new Date() });
    if (methodPredictionsLog.length > 800) methodPredictionsLog.shift();
    if (actual) updateAdaptiveWeights();
}

// ========== WEBSOCKET ==========
function connectWebSocket() {
    if (ws) { ws.removeAllListeners(); ws.close(); }
    ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });
    ws.on("open", () => {
        console.log("[✅] WebSocket connected");
        initialMessages.forEach((msg, i) => { setTimeout(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }, i*600); });
        clearInterval(pingInterval);
        pingInterval = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); }, PING_INTERVAL);
    });
    ws.on("pong", () => console.log("[📶] Ping"));
    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);
            if (!Array.isArray(data) || typeof data[1] !== "object") return;
            const { cmd, sid, d1, d2, d3, gBB } = data[1];
            if (cmd === 1008 && sid) currentSessionId = sid;
            if (cmd === 1003 && gBB && d1 && d2 && d3) {
                const total = d1+d2+d3;
                const result = total > 10 ? "Tài" : "Xỉu";
                const newSid = currentSessionId;
                apiResponseData = {
                    Phien: newSid,
                    Xuc_xac_1: d1,
                    Xuc_xac_2: d2,
                    Xuc_xac_3: d3,
                    Tong: total,
                    Ket_qua: result,
                    id: "@cskh_huydaixu",
                    server_time: new Date().toISOString(),
                    update_count: (apiResponseData.update_count || 0) + 1
                };
                console.log(`[🎲] ${newSid}: ${d1} ${d2} ${d3} = ${total} (${result})`);
                patternHistory.push({
                    session: newSid,
                    dice: [d1,d2,d3],
                    total,
                    result,
                    timestamp: new Date().toISOString()
                });
                if (patternHistory.length > MAX_HISTORY) patternHistory.shift();

                if (patternHistory.length >= 2) {
                    const prev = patternHistory.slice(0, -1);
                    const seqPrev = getSeq(prev);
                    const markov = predictMarkov(seqPrev);
                    const freq = predictFreq(prev, 50);
                    const cycle = predictCycle(seqPrev, 20);
                    const trend = predictTrend(prev);
                    const fib = predictFibonacci(prev);
                    const pair = predictPair(prev);
                    const streak = predictStreak(prev);
                    const bayes = predictBayes(prev);
                    logMethods(
                        newSid, result,
                        markov ? markov.prediction : null,
                        freq ? freq.prediction : null,
                        cycle ? cycle.prediction : null,
                        trend ? trend.prediction : null,
                        fib ? fib.prediction : null,
                        pair ? pair.prediction : null,
                        streak ? streak.prediction : null,
                        bayes ? bayes.prediction : null
                    );
                }
                currentSessionId = null;
            }
        } catch(e) { console.error("[❌] Parse error:", e.message); }
    });
    ws.on("close", () => {
        console.log("[🔌] WS closed");
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY);
    });
    ws.on("error", (err) => { console.error("[❌] WS error:", err.message); ws.close(); });
}

// ========== API ==========
app.get("/api/ditmemaysun", (req, res) => res.json(apiResponseData));
app.get("/api/sunwin/history", (req, res) => {
    const last100 = patternHistory.slice(-100).reverse().map(item => ({
        Ket_qua: item.result, Phien: item.session, Tong: item.total,
        Xuc_xac_1: item.dice[0], Xuc_xac_2: item.dice[1], Xuc_xac_3: item.dice[2],
        id: "@cskh_huydaixu"
    }));
    res.json(last100);
});
app.get("/api/stats", (req, res) => {
    const tai = patternHistory.filter(p=>p.result==="Tài").length;
    const xiu = patternHistory.length-tai;
    res.json({
        total_sessions: patternHistory.length,
        tai_count: tai, xiu_count: xiu,
        tai_percent: patternHistory.length ? ((tai/patternHistory.length)*100).toFixed(2) : 0,
        xiu_percent: patternHistory.length ? ((xiu/patternHistory.length)*100).toFixed(2) : 0,
        last_update: apiResponseData.server_time,
        uptime: process.uptime().toFixed(0)+"s"
    });
});
app.get("/api/health", (req, res) => {
    res.json({ status: "online", websocket: ws ? ws.readyState === WebSocket.OPEN : false, uptime: process.uptime(), memory: process.memoryUsage() });
});
app.get("/api/predict", (req, res) => {
    if (patternHistory.length < 10) return res.json({ error: "Cần ít nhất 10 phiên", need_more: true });
    if (!apiResponseData.Phien) return res.status(503).json({ error: "Chưa có phiên hiện tại" });
    const { prediction, confidence, details } = combinedPredict(patternHistory);
    const nextSession = apiResponseData.Phien + 1;
    const pattern9 = patternHistory.slice(-9).map(p=>p.result==="Tài"?"T":"X").join("");
    res.json({
        Ket_qua: apiResponseData.Ket_qua,
        Phien: apiResponseData.Phien,
        Tong: apiResponseData.Tong,
        Xuc_xac_1: apiResponseData.Xuc_xac_1,
        Xuc_xac_2: apiResponseData.Xuc_xac_2,
        Xuc_xac_3: apiResponseData.Xuc_xac_3,
        phien_hien_tai: nextSession,
        Pattern: pattern9,
        Du_doan: prediction,
        Do_tin_cay: confidence+"%",
        id: "@cskh_huydaixu",
        AIHDXSUNWIN: `HDXAISUNWIN_${prediction}_${confidence}`,
        method_details: {
            markov: details.markov ? `${details.markov.prediction} (${details.markov.confidence}%)` : null,
            frequency: details.freq ? `${details.freq.prediction} (${details.freq.confidence}%)` : null,
            cycle: details.cycle ? `${details.cycle.prediction} (${details.cycle.confidence}%)` : null,
            trend: details.trend ? `${details.trend.prediction} (${details.trend.confidence}%)` : null,
            fibonacci: details.fibonacci ? `${details.fibonacci.prediction} (${details.fibonacci.confidence}%)` : null,
            pair: details.pair ? `${details.pair.prediction} (${details.pair.confidence}%)` : null,
            streak: details.streak ? `${details.streak.prediction} (${details.streak.confidence}%)` : null,
            bayes: details.bayes ? `${details.bayes.prediction} (${details.bayes.confidence}%)` : null
        }
    });
});
app.get("/api/ai_weights", (req, res) => {
    res.json({ weights: methodWeights, accuracy: methodAccuracy, total_logged: methodPredictionsLog.length });
});
app.get("/api/accuracy", (req, res) => {
    if (patternHistory.length < 10) return res.json({ error: "Cần ít nhất 10 phiên" });
    let correct=0, total=0;
    const details = [];
    for (let i=10; i<patternHistory.length; i++) {
        const { prediction } = predictAtIdx(patternHistory, i);
        if (!prediction) continue;
        const actual = patternHistory[i].result;
        const isCorrect = prediction === actual;
        if (isCorrect) correct++;
        total++;
        details.push({ session: patternHistory[i].session, actual, prediction, correct: isCorrect });
    }
    const acc = total ? ((correct/total)*100).toFixed(2) : 0;
    res.json({ total_predictions: total, correct, wrong: total-correct, accuracy_percent: parseFloat(acc), details: details.slice(-80) });
});
app.get("/api/history_with_predictions", (req, res) => {
    const limit = parseInt(req.query.limit) || 80;
    const start = Math.max(0, patternHistory.length - limit);
    const results = [];
    for (let i=start; i<patternHistory.length; i++) {
        const { prediction, confidence } = predictAtIdx(patternHistory, i);
        results.push({
            session: patternHistory[i].session,
            dice: patternHistory[i].dice,
            total: patternHistory[i].total,
            actual: patternHistory[i].result,
            prediction: prediction || "N/A",
            confidence: confidence || 0,
            correct: prediction ? prediction === patternHistory[i].result : null,
            timestamp: patternHistory[i].timestamp
        });
    }
    const recent = results.slice(-60).filter(r=>r.prediction!=="N/A");
    const correctCount = recent.filter(r=>r.correct===true).length;
    const recentAcc = recent.length ? (correctCount/recent.length)*100 : 0;
    res.json({ total_history: patternHistory.length, predictions_available: results.filter(r=>r.prediction!=="N/A").length, recent_accuracy: parseFloat(recentAcc.toFixed(2)), data: results.reverse() });
});
app.get("/api/compare", (req, res) => {
    if (patternHistory.length===0) return res.json({ error: "Chưa có dữ liệu" });
    const last = patternHistory[patternHistory.length-1];
    let pred=null, conf=0;
    if (patternHistory.length>=10) {
        const p = predictAtIdx(patternHistory, patternHistory.length-1);
        pred = p.prediction; conf = p.confidence;
    }
    res.json({ current_session: last.session, actual_result: last.result, dice: last.dice, total: last.total, ai_prediction: pred, confidence: conf, is_correct: pred ? pred===last.result : null });
});
app.get("/api/endpoints", (req, res) => {
    const base = `${req.protocol}://${req.get("host")}`;
    res.json({
        "🏠 Dashboard": `${base}/`,
        "🔮 Dự đoán hiện tại": `${base}/api/predict`,
        "📜 Lịch sử + dự đoán AI": `${base}/api/history_with_predictions`,
        "📊 Thống kê": `${base}/api/stats`,
        "⚖️ Trọng số AI": `${base}/api/ai_weights`,
        "🎯 Độ chính xác": `${base}/api/accuracy`,
        "🔄 So sánh phiên cuối": `${base}/api/compare`,
        "💚 Health check": `${base}/api/health`,
        "📦 Raw data": `${base}/api/ditmemaysun`
    });
});

// ========== GIAO DIỆN WEB SIÊU ĐẸP ==========
app.get("/", (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>HDXAISUNWIN 8.0 - Siêu VIP AI Tài Xỉu</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,600;14..32,700&display=swap" rel="stylesheet">
    <style>
        * { font-family: 'Inter', sans-serif; }
        body { background: radial-gradient(circle at 10% 20%, #0a0f1e, #03050b); min-height: 100vh; }
        .glass-card { background: rgba(15, 25, 45, 0.65); backdrop-filter: blur(12px); border: 1px solid rgba(255,215,0,0.2); border-radius: 2rem; box-shadow: 0 20px 35px -12px rgba(0,0,0,0.5); }
        .gold-border { border-image: linear-gradient(135deg, #fbbf24, #d97706) 1; border-bottom: 2px solid transparent; border-image-slice: 1; }
        .dice-badge { background: #1e293b; border-radius: 1rem; padding: 0.2rem 0.6rem; display: inline-flex; align-items: center; gap: 0.3rem; }
        .glow-text { text-shadow: 0 0 8px rgba(251,191,36,0.4); }
        @keyframes pulse-gold { 0% { border-color: rgba(251,191,36,0.2); } 100% { border-color: rgba(251,191,36,0.8); } }
        .animate-pulse-border { animation: pulse-gold 1.5s infinite; }
        .tab-active { background: linear-gradient(135deg, #fbbf24, #d97706); color: #0f172a; font-weight: bold; border-radius: 2rem; }
        .tab-inactive { background: #1e293b; color: #94a3b8; border-radius: 2rem; }
        .hover-scale { transition: transform 0.2s; }
        .hover-scale:hover { transform: scale(1.02); }
    </style>
</head>
<body class="text-gray-200">
    <div class="container mx-auto px-4 py-6 max-w-7xl">
        <!-- Header -->
        <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div class="flex items-center gap-4">
                <div class="text-5xl drop-shadow-lg">🎲✨</div>
                <div>
                    <h1 class="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-500 bg-clip-text text-transparent">HDXAISUNWIN</h1>
                    <p class="text-sm text-gray-400">8 phương pháp AI tự học · Tài Xỉu SunWin · Độ chính xác real</p>
                </div>
            </div>
            <div class="glass-card px-6 py-2 rounded-full text-center">
                <span class="text-yellow-400 font-semibold">⚡ REALTIME</span>
                <span id="live-time" class="ml-2 text-sm font-mono"></span>
            </div>
        </div>

        <!-- Panel dự đoán chính -->
        <div class="glass-card p-6 mb-8 gold-border animate-pulse-border">
            <div class="flex flex-col lg:flex-row justify-between items-center gap-6">
                <div class="text-center lg:text-left">
                    <div class="text-sm uppercase tracking-wider text-yellow-400 font-semibold">🔮 Dự đoán phiên tiếp theo</div>
                    <div class="text-6xl font-black mt-2 glow-text" id="prediction-text">---</div>
                    <div class="mt-3 flex items-center gap-3 justify-center lg:justify-start">
                        <span class="text-sm">Độ tin cậy</span>
                        <div class="w-40 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div id="confidence-bar" class="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full" style="width:0%"></div>
                        </div>
                        <span id="confidence-value" class="font-mono font-bold text-yellow-300">0%</span>
                    </div>
                </div>
                <div class="flex gap-8 text-center">
                    <div><div class="text-gray-400 text-sm">Phiên hiện tại</div><div id="current-session" class="text-2xl font-bold text-yellow-300">--</div></div>
                    <div><div class="text-gray-400 text-sm">Kết quả gần nhất</div><div id="last-result" class="text-2xl font-bold">---</div></div>
                    <div><div class="text-gray-400 text-sm">Pattern 9 phiên</div><div id="pattern" class="text-xl font-mono tracking-wider">---</div></div>
                </div>
            </div>
        </div>

        <!-- Tabs -->
        <div class="flex flex-wrap gap-3 mb-6">
            <button id="tab-overview" class="tab-btn px-6 py-2 font-semibold transition-all duration-200 tab-active shadow-lg">📊 TỔNG QUAN</button>
            <button id="tab-methods" class="tab-btn px-6 py-2 font-semibold transition-all duration-200 tab-inactive">🧠 8 PHƯƠNG PHÁP AI</button>
            <button id="tab-endpoints" class="tab-btn px-6 py-2 font-semibold transition-all duration-200 tab-inactive">🔗 API &amp; TOOLS</button>
        </div>

        <!-- Panel tổng quan -->
        <div id="panel-overview" class="tab-panel">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div class="glass-card p-5 hover-scale">
                    <h3 class="text-lg font-semibold mb-2 flex items-center gap-2">📊 <span>Thống kê tức thì</span></h3>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between"><span>Tổng phiên đã ghi:</span><span id="total-sessions" class="font-bold text-yellow-300">0</span></div>
                        <div class="flex justify-between"><span>Tài / Xỉu:</span><span id="tai-xiu-ratio">0 / 0</span></div>
                        <div class="flex justify-between"><span>Accuracy 30 phiên gần:</span><span id="accuracy-recent" class="text-green-400 font-bold">0%</span></div>
                        <div class="flex justify-between"><span>WebSocket:</span><span id="ws-status" class="text-green-400">● Đang kết nối</span></div>
                    </div>
                </div>
                <div class="glass-card p-5 lg:col-span-2 hover-scale">
                    <h3 class="text-lg font-semibold mb-2">📈 Biểu đồ đúng/sai 30 phiên gần nhất</h3>
                    <canvas id="accuracyChart" height="100"></canvas>
                </div>
            </div>
            <div class="glass-card p-5 overflow-x-auto">
                <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <h3 class="text-xl font-bold">📜 Lịch sử chi tiết + Dự đoán AI</h3>
                    <button id="refreshBtn" class="bg-amber-600 hover:bg-amber-500 px-4 py-1.5 rounded-full text-sm shadow-md transition">⟳ Cập nhật dữ liệu</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm min-w-[700px]">
                        <thead class="border-b border-gray-700 bg-gray-800/50"><tr><th class="p-2">Phiên</th><th>Xúc xắc</th><th>Tổng</th><th>Kết quả</th><th>Dự đoán AI</th><th>Độ tin cậy</th><th>Đúng/Sai</th></tr></thead>
                        <tbody id="history-tbody"><tr><td colspan="7" class="text-center py-6">⏳ Đang tải dữ liệu từ server...</td></tr></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Panel 8 phương pháp -->
        <div id="panel-methods" class="tab-panel hidden">
            <div class="glass-card p-5 mb-6">
                <h3 class="text-xl font-bold mb-3 flex items-center gap-2">🤖 Trọng số AI thích ứng (tự học)</h3>
                <div id="weights-detail" class="grid grid-cols-2 md:grid-cols-4 gap-3"></div>
                <div class="mt-4 text-xs text-gray-400">*Trọng số được cập nhật sau mỗi phiên dựa trên độ chính xác gần đây của từng phương pháp.</div>
            </div>
            <div class="glass-card p-5">
                <h3 class="text-xl font-bold mb-3">🔍 Dự đoán chi tiết từ 8 phương pháp</h3>
                <div id="methods-prediction-detail" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
            </div>
        </div>

        <!-- Panel endpoints -->
        <div id="panel-endpoints" class="tab-panel hidden">
            <div class="glass-card p-5">
                <h3 class="text-xl font-bold mb-4">🔗 Danh sách API tích hợp (click để mở)</h3>
                <div id="endpoints-list" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div>
                <div class="mt-5 p-3 bg-gray-800/40 rounded-lg text-xs font-mono">💡 Gợi ý: Dùng /api/history_with_predictions để lấy lịch sử kèm dự đoán đúng/sai real.</div>
            </div>
        </div>

        <div class="mt-6 text-center text-xs text-gray-500 border-t border-gray-800 pt-4">🤖 HDXAISUNWIN 8.0 · Markov | Tần suất | Chu kỳ | Xu hướng | Fibonacci | Cặp xúc xắc | Streak analysis | Bayes · Tự động thích ứng</div>
    </div>
    <script>
        let chart = null;
        function setTab(tab) {
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
            document.getElementById(\`panel-\${tab}\`).classList.remove('hidden');
            document.querySelectorAll('.tab-btn').forEach(btn => { btn.classList.remove('tab-active','tab-inactive'); btn.classList.add('tab-inactive'); });
            if(tab==='overview') { document.getElementById('tab-overview').classList.remove('tab-inactive'); document.getElementById('tab-overview').classList.add('tab-active'); }
            else if(tab==='methods') { document.getElementById('tab-methods').classList.remove('tab-inactive'); document.getElementById('tab-methods').classList.add('tab-active'); }
            else { document.getElementById('tab-endpoints').classList.remove('tab-inactive'); document.getElementById('tab-endpoints').classList.add('tab-active'); }
        }
        async function fetchAll() {
            try {
                const [pred, hist, stats, acc, weights, eps] = await Promise.all([
                    fetch('/api/predict'), fetch('/api/history_with_predictions?limit=80'),
                    fetch('/api/stats'), fetch('/api/accuracy'), fetch('/api/ai_weights'), fetch('/api/endpoints')
                ]);
                const p = await pred.json(), h = await hist.json(), s = await stats.json(), a = await acc.json(), w = await weights.json(), e = await eps.json();
                document.getElementById('prediction-text').innerHTML = p.Du_doan ? \`🎲 \${p.Du_doan}\` : (p.error || '???');
                document.getElementById('confidence-bar').style.width = p.Do_tin_cay || '0%';
                document.getElementById('confidence-value').innerText = p.Do_tin_cay || '0%';
                document.getElementById('current-session').innerText = p.phien_hien_tai || '--';
                let lastRes = p.Ket_qua;
                document.getElementById('last-result').innerHTML = lastRes ? (lastRes === 'Tài' ? '🟢 Tài' : '🔴 Xỉu') : '---';
                document.getElementById('pattern').innerText = p.Pattern || '---';
                document.getElementById('total-sessions').innerText = s.total_sessions || 0;
                document.getElementById('tai-xiu-ratio').innerHTML = \`<span class="text-green-400">\${s.tai_count||0}</span> / <span class="text-red-400">\${s.xiu_count||0}</span>\`;
                document.getElementById('accuracy-recent').innerHTML = (h.recent_accuracy||0) > 0 ? \`<span class="text-green-400">\${h.recent_accuracy}%</span>\` : '0%';
                if(w.weights) {
                    let ww = w.weights;
                    let accM = w.accuracy || {};
                    document.getElementById('weights-detail').innerHTML = \`
                        <div class="bg-gray-800/70 p-2 rounded-lg"><span class="text-yellow-300">Markov</span> \${(ww.markov*100).toFixed(1)}% <span class="text-xs text-gray-400">(acc: \${(accM.markov? (accM.markov*100).toFixed(0):'?')}%)</span></div>
                        <div class="bg-gray-800/70 p-2 rounded-lg"><span class="text-yellow-300">Tần suất</span> \${(ww.frequency*100).toFixed(1)}% <span class="text-xs text-gray-400">(acc: \${(accM.frequency? (accM.frequency*100).toFixed(0):'?')}%)</span></div>
                        <div class="bg-gray-800/70 p-2 rounded-lg"><span class="text-yellow-300">Chu kỳ</span> \${(ww.cycle*100).toFixed(1)}% <span class="text-xs text-gray-400">(acc: \${(accM.cycle? (accM.cycle*100).toFixed(0):'?')}%)</span></div>
                        <div class="bg-gray-800/70 p-2 rounded-lg"><span class="text-yellow-300">Xu hướng</span> \${(ww.trend*100).toFixed(1)}% <span class="text-xs text-gray-400">(acc: \${(accM.trend? (accM.trend*100).toFixed(0):'?')}%)</span></div>
                        <div class="bg-gray-800/70 p-2 rounded-lg"><span class="text-yellow-300">Fibonacci</span> \${(ww.fibonacci*100).toFixed(1)}% <span class="text-xs text-gray-400">(acc: \${(accM.fibonacci? (accM.fibonacci*100).toFixed(0):'?')}%)</span></div>
                        <div class="bg-gray-800/70 p-2 rounded-lg"><span class="text-yellow-300">Cặp xúc xắc</span> \${(ww.pair*100).toFixed(1)}% <span class="text-xs text-gray-400">(acc: \${(accM.pair? (accM.pair*100).toFixed(0):'?')}%)</span></div>
                        <div class="bg-gray-800/70 p-2 rounded-lg"><span class="text-yellow-300">Streak</span> \${(ww.streak*100).toFixed(1)}% <span class="text-xs text-gray-400">(acc: \${(accM.streak? (accM.streak*100).toFixed(0):'?')}%)</span></div>
                        <div class="bg-gray-800/70 p-2 rounded-lg"><span class="text-yellow-300">Bayes</span> \${(ww.bayes*100).toFixed(1)}% <span class="text-xs text-gray-400">(acc: \${(accM.bayes? (accM.bayes*100).toFixed(0):'?')}%)</span></div>
                    \`;
                }
                if(p.method_details) {
                    let md = p.method_details;
                    document.getElementById('methods-prediction-detail').innerHTML = \`
                        <div class="bg-gray-800/40 p-3 rounded-xl">📈 Markov: \${md.markov||'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/40 p-3 rounded-xl">📊 Tần suất: \${md.frequency||'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/40 p-3 rounded-xl">🔄 Chu kỳ: \${md.cycle||'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/40 p-3 rounded-xl">📉 Xu hướng: \${md.trend||'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/40 p-3 rounded-xl">🔢 Fibonacci: \${md.fibonacci||'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/40 p-3 rounded-xl">🎲 Cặp xúc xắc: \${md.pair||'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/40 p-3 rounded-xl">⚡ Streak: \${md.streak||'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/40 p-3 rounded-xl">🧠 Bayes: \${md.bayes||'chưa đủ dữ liệu'}</div>
                    \`;
                }
                const tbody = document.getElementById('history-tbody');
                if(h.data && h.data.length) {
                    tbody.innerHTML = h.data.slice(0,50).map(item => {
                        const diceHtml = \`<span class="inline-flex gap-1">🎲\${item.dice[0]} 🎲\${item.dice[1]} 🎲\${item.dice[2]}</span>\`;
                        const resultClass = item.actual === 'Tài' ? 'text-green-400 font-bold' : 'text-red-400 font-bold';
                        let predClass = '';
                        if(item.prediction === 'Tài') predClass = 'text-green-300';
                        else if(item.prediction === 'Xỉu') predClass = 'text-red-300';
                        else predClass = 'text-gray-400';
                        let status = '';
                        if(item.correct===true) status='<span class="bg-green-700 px-2 py-0.5 rounded-full text-xs font-bold">✓ Đúng</span>';
                        else if(item.correct===false) status='<span class="bg-red-700 px-2 py-0.5 rounded-full text-xs font-bold">✗ Sai</span>';
                        else status='<span class="bg-gray-700 px-2 py-0.5 rounded-full text-xs">?</span>';
                        return \`<tr class="border-b border-gray-800 hover:bg-gray-800/30"><td class="py-2 font-mono">\${item.session}</td><td>\${diceHtml}</td><td class="font-bold">\${item.total}</td><td class="\${resultClass}">\${item.actual}</td><td class="\${predClass} font-semibold">\${item.prediction}</td><td>\${item.confidence}%</td><td>\${status}</td></tr>\`;
                    }).join('');
                } else tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6">📭 Chưa có phiên nào</td></tr>';
                if(a.details && a.details.length) {
                    const last30 = a.details.slice(-30);
                    const labels = last30.map(d=>d.session);
                    const data = last30.map(d=>d.correct?100:0);
                    if(chart) chart.destroy();
                    const ctx = document.getElementById('accuracyChart').getContext('2d');
                    chart = new Chart(ctx, { type:'line', data:{ labels, datasets:[{ label:'✅ Đúng (100) / ❌ Sai (0)', data, borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,0.1)', borderWidth:2, pointRadius:3, fill:true, tension:0.2 }] }, options:{ responsive:true, maintainAspectRatio:true, scales:{ y:{ min:0, max:100, grid:{color:'#334155'} }, x:{ ticks:{ color:'#cbd5e1' } } } } });
                }
                if(e) {
                    document.getElementById('endpoints-list').innerHTML = Object.entries(e).map(([name,url]) => \`<a href="\${url}" target="_blank" class="bg-gray-800/60 hover:bg-gray-700 p-3 rounded-xl flex justify-between items-center transition"><span class="font-mono text-sm">\${name}</span><span class="text-yellow-400">🔗</span></a>\`).join('');
                }
                document.getElementById('live-time').innerText = new Date().toLocaleTimeString('vi-VN');
            } catch(err) { console.error(err); document.getElementById('history-tbody').innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">Lỗi kết nối server</td></tr>'; }
        }
        document.getElementById('tab-overview').onclick = ()=>setTab('overview');
        document.getElementById('tab-methods').onclick = ()=>setTab('methods');
        document.getElementById('tab-endpoints').onclick = ()=>setTab('endpoints');
        document.getElementById('refreshBtn').onclick = fetchAll;
        fetchAll();
        setInterval(fetchAll, 5000);
        setInterval(()=>{ document.getElementById('live-time').innerText = new Date().toLocaleTimeString('vi-VN'); }, 1000);
    </script>
</body>
</html>`;
    res.send(html);
});

// Khởi động server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n=========================================`);
    console.log(`🚀 HDXAISUNWIN 8.0 - SIÊU VIP AI TÀI XỈU`);
    console.log(`=========================================`);
    console.log(`📡 Dashboard: http://${getLocalIP()}:${PORT}`);
    console.log(`🔮 API dự đoán: http://${getLocalIP()}:${PORT}/api/predict`);
    console.log(`⚙️  AI weights: http://${getLocalIP()}:${PORT}/api/ai_weights`);
    console.log(`📜 Lịch sử + dự đoán: http://${getLocalIP()}:${PORT}/api/history_with_predictions`);
    console.log(`🔗 Endpoints: http://${getLocalIP()}:${PORT}/api/endpoints`);
    console.log(`=========================================\n`);
    connectWebSocket();
});