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
const MAX_HISTORY = 500;

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

// ========== AI ADAPTIVE WEIGHTS (6 PHƯƠNG PHÁP) ==========
let methodWeights = {
    markov: 0.2,
    frequency: 0.2,
    cycle: 0.15,
    trend: 0.15,
    fibonacci: 0.15,
    pair: 0.15
};

let methodPredictionsLog = [];

function updateAdaptiveWeights() {
    if (methodPredictionsLog.length < 20) return;
    const recent = methodPredictionsLog.slice(-50);
    let accuracy = { markov: 0, freq: 0, cycle: 0, trend: 0, fibonacci: 0, pair: 0 };
    let totalWeight = 0;
    for (let i = 0; i < recent.length; i++) {
        const log = recent[i];
        if (!log.actual) continue;
        const w = Math.pow(0.94, recent.length - 1 - i);
        totalWeight += w;
        if (log.markov === log.actual) accuracy.markov += w;
        if (log.freq === log.actual) accuracy.freq += w;
        if (log.cycle === log.actual) accuracy.cycle += w;
        if (log.trend === log.actual) accuracy.trend += w;
        if (log.fibonacci === log.actual) accuracy.fibonacci += w;
        if (log.pair === log.actual) accuracy.pair += w;
    }
    if (totalWeight === 0) return;
    const accMarkov = accuracy.markov / totalWeight;
    const accFreq = accuracy.freq / totalWeight;
    const accCycle = accuracy.cycle / totalWeight;
    const accTrend = accuracy.trend / totalWeight;
    const accFib = accuracy.fibonacci / totalWeight;
    const accPair = accuracy.pair / totalWeight;
    let sumAcc = accMarkov + accFreq + accCycle + accTrend + accFib + accPair;
    if (sumAcc === 0) sumAcc = 1;
    const newWeights = {
        markov: accMarkov / sumAcc,
        frequency: accFreq / sumAcc,
        cycle: accCycle / sumAcc,
        trend: accTrend / sumAcc,
        fibonacci: accFib / sumAcc,
        pair: accPair / sumAcc
    };
    // Làm mượt
    methodWeights.markov = methodWeights.markov * 0.7 + newWeights.markov * 0.3;
    methodWeights.frequency = methodWeights.frequency * 0.7 + newWeights.frequency * 0.3;
    methodWeights.cycle = methodWeights.cycle * 0.7 + newWeights.cycle * 0.3;
    methodWeights.trend = methodWeights.trend * 0.7 + newWeights.trend * 0.3;
    methodWeights.fibonacci = methodWeights.fibonacci * 0.7 + newWeights.fibonacci * 0.3;
    methodWeights.pair = methodWeights.pair * 0.7 + newWeights.pair * 0.3;
    let total = methodWeights.markov + methodWeights.frequency + methodWeights.cycle + methodWeights.trend + methodWeights.fibonacci + methodWeights.pair;
    methodWeights.markov /= total;
    methodWeights.frequency /= total;
    methodWeights.cycle /= total;
    methodWeights.trend /= total;
    methodWeights.fibonacci /= total;
    methodWeights.pair /= total;
    console.log("[AI] Weights updated:", methodWeights);
}

function getSeq(history) {
    return history.map(h => (h.result === "Tài" ? "T" : "X")).join("");
}

// 1. Markov
function predictMarkov(seq) {
    if (seq.length < 3) return null;
    let best = null,
        bestConf = 0;
    for (let order = 3; order <= Math.min(5, seq.length - 1); order++) {
        const last = seq.slice(-order);
        const trans = {};
        for (let i = 0; i <= seq.length - order - 1; i++) {
            const pat = seq.slice(i, i + order);
            const next = seq[i + order];
            if (!trans[pat]) trans[pat] = { T: 0, X: 0 };
            trans[pat][next]++;
        }
        const possible = trans[last];
        if (!possible) continue;
        const total = possible.T + possible.X;
        const probTai = possible.T / total;
        const conf = (Math.max(possible.T, possible.X) / total) * 100;
        if (conf > bestConf) {
            bestConf = conf;
            best = probTai > 0.5 ? "Tài" : probTai < 0.5 ? "Xỉu" : Math.random() < 0.5 ? "Tài" : "Xỉu";
        }
    }
    return best ? { prediction: best, confidence: Math.round(bestConf) } : null;
}

// 2. Tần suất có trọng số
function predictFreq(history, window = 40) {
    const recent = history.slice(-window);
    let wTai = 0,
        wXiu = 0;
    for (let i = 0; i < recent.length; i++) {
        const w = Math.pow(0.92, recent.length - 1 - i);
        if (recent[i].result === "Tài") wTai += w;
        else wXiu += w;
    }
    const total = wTai + wXiu;
    if (total === 0) return null;
    const probTai = wTai / total;
    const pred = probTai > 0.5 ? "Tài" : probTai < 0.5 ? "Xỉu" : Math.random() < 0.5 ? "Tài" : "Xỉu";
    const conf = Math.abs(probTai - 0.5) * 2 * 100;
    return { prediction: pred, confidence: Math.min(95, Math.max(50, conf)) };
}

// 3. Chu kỳ
function predictCycle(seq, maxCycle = 15) {
    for (let cycle = 3; cycle <= maxCycle; cycle++) {
        if (seq.length < cycle * 2) continue;
        const lastCycle = seq.slice(-cycle);
        const matches = [];
        for (let i = 0; i <= seq.length - cycle - 1; i++) {
            if (seq.slice(i, i + cycle) === lastCycle) matches.push(i);
        }
        if (matches.length >= 2) {
            const nextIdx = matches[matches.length - 1] + cycle;
            if (nextIdx < seq.length) {
                const nextRes = seq[nextIdx];
                const pred = nextRes === "T" ? "Tài" : "Xỉu";
                let conf = 60 + Math.min(30, matches.length * 4);
                return { prediction: pred, confidence: conf };
            }
        }
    }
    return null;
}

// 4. Xu hướng
function predictTrend(history) {
    if (history.length < 5) return null;
    const last5 = history.slice(-5).map(h => h.result);
    const last3 = last5.slice(-3);
    if (last3[0] === last3[1] && last3[1] === last3[2]) {
        return { prediction: last3[0] === "Tài" ? "Xỉu" : "Tài", confidence: 70 };
    }
    let alt = true;
    for (let i = 1; i < last5.length; i++) if (last5[i] === last5[i - 1]) alt = false;
    if (alt && last5.length >= 4) {
        return { prediction: last5[last5.length - 1] === "Tài" ? "Xỉu" : "Tài", confidence: 75 };
    }
    if (last5.length >= 4 && last5[0] === last5[1] && last5[2] === last5[3] && last5[1] !== last5[2]) {
        return { prediction: last5[3] === "Tài" ? "Xỉu" : "Tài", confidence: 68 };
    }
    const tai = last5.filter(r => r === "Tài").length;
    const xiu = 5 - tai;
    if (tai !== xiu) {
        const pred = tai > xiu ? "Tài" : "Xỉu";
        const conf = 55 + Math.abs(tai - xiu) * 5;
        return { prediction: pred, confidence: Math.min(75, conf) };
    }
    return null;
}

// 5. Fibonacci dựa trên tổng điểm
function predictFibonacci(history) {
    if (history.length < 10) return null;
    const totals = history.slice(-10).map(h => h.total);
    const diffs = [];
    for (let i = 1; i < totals.length; i++) diffs.push(totals[i] - totals[i - 1]);
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    let nextTotal = totals[totals.length - 1] + avgDiff;
    nextTotal = Math.min(18, Math.max(3, Math.round(nextTotal)));
    const pred = nextTotal > 10 ? "Tài" : "Xỉu";
    const conf = 55 + Math.min(30, Math.abs(avgDiff) * 3);
    return { prediction: pred, confidence: Math.min(85, conf) };
}

// 6. Phân tích cặp xúc xắc
function predictPair(history) {
    if (history.length < 15) return null;
    const recent = history.slice(-15);
    const last = history[history.length - 1];
    const lastPairs = {
        p12: `${last.dice[0]},${last.dice[1]}`,
        p23: `${last.dice[1]},${last.dice[2]}`,
        p13: `${last.dice[0]},${last.dice[2]}`
    };
    let tai = 0,
        xiu = 0;
    for (const item of recent) {
        const p12 = `${item.dice[0]},${item.dice[1]}`;
        const p23 = `${item.dice[1]},${item.dice[2]}`;
        const p13 = `${item.dice[0]},${item.dice[2]}`;
        if (p12 === lastPairs.p12 || p23 === lastPairs.p23 || p13 === lastPairs.p13) {
            if (item.result === "Tài") tai++;
            else xiu++;
        }
    }
    if (tai + xiu < 3) return null;
    const pred = tai > xiu ? "Tài" : "Xỉu";
    const conf = 55 + Math.min(30, Math.abs(tai - xiu) * 2);
    return { prediction: pred, confidence: Math.min(85, conf) };
}

function combinedPredict(history) {
    if (history.length < 10) return { prediction: "Chưa đủ dữ liệu", confidence: 0, details: {} };
    const seq = getSeq(history);
    const markov = predictMarkov(seq);
    const freq = predictFreq(history, 40);
    const cycle = predictCycle(seq, 15);
    const trend = predictTrend(history);
    const fib = predictFibonacci(history);
    const pair = predictPair(history);

    let scores = { Tài: 0, Xỉu: 0 };
    const details = {};
    if (markov) {
        scores[markov.prediction] += methodWeights.markov * (markov.confidence / 100);
        details.markov = markov;
    }
    if (freq) {
        scores[freq.prediction] += methodWeights.frequency * (freq.confidence / 100);
        details.freq = freq;
    }
    if (cycle) {
        scores[cycle.prediction] += methodWeights.cycle * (cycle.confidence / 100);
        details.cycle = cycle;
    }
    if (trend) {
        scores[trend.prediction] += methodWeights.trend * (trend.confidence / 100);
        details.trend = trend;
    }
    if (fib) {
        scores[fib.prediction] += methodWeights.fibonacci * (fib.confidence / 100);
        details.fibonacci = fib;
    }
    if (pair) {
        scores[pair.prediction] += methodWeights.pair * (pair.confidence / 100);
        details.pair = pair;
    }
    const finalPred = scores.Tài > scores.Xỉu ? "Tài" : "Xỉu";
    let maxScore = Math.max(scores.Tài, scores.Xỉu);
    let totalWeight = Object.values(methodWeights).reduce((a, b) => a + b, 0);
    let confidence = Math.round((maxScore / totalWeight) * 100);
    confidence = Math.min(99, Math.max(50, confidence));
    return { prediction: finalPred, confidence, details };
}

function predictAtIdx(history, idx) {
    if (idx < 10) return { prediction: null, confidence: 0 };
    const past = history.slice(0, idx);
    const seq = getSeq(past);
    const markov = predictMarkov(seq);
    const freq = predictFreq(past, 40);
    const cycle = predictCycle(seq, 15);
    const trend = predictTrend(past);
    const fib = predictFibonacci(past);
    const pair = predictPair(past);
    let scores = { Tài: 0, Xỉu: 0 };
    if (markov) scores[markov.prediction] += methodWeights.markov * (markov.confidence / 100);
    if (freq) scores[freq.prediction] += methodWeights.frequency * (freq.confidence / 100);
    if (cycle) scores[cycle.prediction] += methodWeights.cycle * (cycle.confidence / 100);
    if (trend) scores[trend.prediction] += methodWeights.trend * (trend.confidence / 100);
    if (fib) scores[fib.prediction] += methodWeights.fibonacci * (fib.confidence / 100);
    if (pair) scores[pair.prediction] += methodWeights.pair * (pair.confidence / 100);
    let totalWeight = Object.values(methodWeights).reduce((a, b) => a + b, 0);
    if (totalWeight === 0) return { prediction: null, confidence: 0 };
    const final = scores.Tài > scores.Xỉu ? "Tài" : "Xỉu";
    const conf = Math.round((Math.max(scores.Tài, scores.Xỉu) / totalWeight) * 100);
    return { prediction: final, confidence: Math.min(99, Math.max(50, conf)) };
}

function logMethods(session, actual, markov, freq, cycle, trend, fib, pair) {
    methodPredictionsLog.push({ session, actual, markov, freq, cycle, trend, fibonacci: fib, pair, ts: new Date() });
    if (methodPredictionsLog.length > 500) methodPredictionsLog.shift();
    if (actual) updateAdaptiveWeights();
}

// ========== WEBSOCKET ==========
function connectWebSocket() {
    if (ws) {
        ws.removeAllListeners();
        ws.close();
    }
    ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });
    ws.on("open", () => {
        console.log("[✅] WebSocket connected");
        initialMessages.forEach((msg, i) => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
            }, i * 600);
        });
        clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, PING_INTERVAL);
    });
    ws.on("pong", () => console.log("[📶] Ping"));
    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);
            if (!Array.isArray(data) || typeof data[1] !== "object") return;
            const { cmd, sid, d1, d2, d3, gBB } = data[1];
            if (cmd === 1008 && sid) currentSessionId = sid;
            if (cmd === 1003 && gBB && d1 && d2 && d3) {
                const total = d1 + d2 + d3;
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
                    dice: [d1, d2, d3],
                    total,
                    result,
                    timestamp: new Date().toISOString()
                });
                if (patternHistory.length > MAX_HISTORY) patternHistory.shift();
                if (patternHistory.length >= 2) {
                    const prev = patternHistory.slice(0, -1);
                    const seqPrev = getSeq(prev);
                    const markov = predictMarkov(seqPrev);
                    const freq = predictFreq(prev, 40);
                    const cycle = predictCycle(seqPrev, 15);
                    const trend = predictTrend(prev);
                    const fib = predictFibonacci(prev);
                    const pair = predictPair(prev);
                    logMethods(
                        newSid,
                        result,
                        markov ? markov.prediction : null,
                        freq ? freq.prediction : null,
                        cycle ? cycle.prediction : null,
                        trend ? trend.prediction : null,
                        fib ? fib.prediction : null,
                        pair ? pair.prediction : null
                    );
                }
                currentSessionId = null;
            }
        } catch (e) {
            console.error("[❌] Parse error:", e.message);
        }
    });
    ws.on("close", () => {
        console.log("[🔌] WS closed");
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY);
    });
    ws.on("error", (err) => {
        console.error("[❌] WS error:", err.message);
        ws.close();
    });
}

// ========== API ==========
app.get("/api/ditmemaysun", (req, res) => res.json(apiResponseData));
app.get("/api/sunwin/history", (req, res) => {
    const last100 = patternHistory.slice(-100).reverse().map(item => ({
        Ket_qua: item.result,
        Phien: item.session,
        Tong: item.total,
        Xuc_xac_1: item.dice[0],
        Xuc_xac_2: item.dice[1],
        Xuc_xac_3: item.dice[2],
        id: "@cskh_huydaixu"
    }));
    res.json(last100);
});
app.get("/api/stats", (req, res) => {
    const tai = patternHistory.filter(p => p.result === "Tài").length;
    const xiu = patternHistory.length - tai;
    res.json({
        total_sessions: patternHistory.length,
        tai_count: tai,
        xiu_count: xiu,
        tai_percent: patternHistory.length ? ((tai / patternHistory.length) * 100).toFixed(2) : 0,
        xiu_percent: patternHistory.length ? ((xiu / patternHistory.length) * 100).toFixed(2) : 0,
        last_update: apiResponseData.server_time,
        uptime: process.uptime().toFixed(0) + "s"
    });
});
app.get("/api/health", (req, res) => {
    res.json({
        status: "online",
        websocket: ws ? ws.readyState === WebSocket.OPEN : false,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});
app.get("/api/predict", (req, res) => {
    if (patternHistory.length < 10) {
        return res.json({ error: "Cần ít nhất 10 phiên", need_more: true });
    }
    if (!apiResponseData.Phien) {
        return res.status(503).json({ error: "Chưa có phiên hiện tại" });
    }
    const { prediction, confidence, details } = combinedPredict(patternHistory);
    const nextSession = apiResponseData.Phien + 1;
    const pattern9 = patternHistory.slice(-9).map(p => (p.result === "Tài" ? "T" : "X")).join("");
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
        Do_tin_cay: confidence + "%",
        id: "@cskh_huydaixu",
        AIHDXSUNWIN: `HDXAISUNWIN_${prediction}_${confidence}`,
        method_details: {
            markov: details.markov ? `${details.markov.prediction} (${details.markov.confidence}%)` : null,
            frequency: details.freq ? `${details.freq.prediction} (${details.freq.confidence}%)` : null,
            cycle: details.cycle ? `${details.cycle.prediction} (${details.cycle.confidence}%)` : null,
            trend: details.trend ? `${details.trend.prediction} (${details.trend.confidence}%)` : null,
            fibonacci: details.fibonacci ? `${details.fibonacci.prediction} (${details.fibonacci.confidence}%)` : null,
            pair: details.pair ? `${details.pair.prediction} (${details.pair.confidence}%)` : null
        }
    });
});
app.get("/api/ai_weights", (req, res) => {
    res.json({ weights: methodWeights, total_logged: methodPredictionsLog.length });
});
app.get("/api/accuracy", (req, res) => {
    if (patternHistory.length < 10) return res.json({ error: "Cần ít nhất 10 phiên" });
    let correct = 0,
        total = 0;
    const details = [];
    for (let i = 10; i < patternHistory.length; i++) {
        const { prediction } = predictAtIdx(patternHistory, i);
        if (!prediction) continue;
        const actual = patternHistory[i].result;
        const isCorrect = prediction === actual;
        if (isCorrect) correct++;
        total++;
        details.push({ session: patternHistory[i].session, actual, prediction, correct: isCorrect });
    }
    const acc = total ? ((correct / total) * 100).toFixed(2) : 0;
    res.json({ total_predictions: total, correct, wrong: total - correct, accuracy_percent: parseFloat(acc), details: details.slice(-50) });
});
app.get("/api/history_with_predictions", (req, res) => {
    const limit = parseInt(req.query.limit) || 60;
    const start = Math.max(0, patternHistory.length - limit);
    const results = [];
    for (let i = start; i < patternHistory.length; i++) {
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
    const recent = results.slice(-60).filter(r => r.prediction !== "N/A");
    const correctCount = recent.filter(r => r.correct === true).length;
    const recentAcc = recent.length ? (correctCount / recent.length) * 100 : 0;
    res.json({
        total_history: patternHistory.length,
        predictions_available: results.filter(r => r.prediction !== "N/A").length,
        recent_accuracy: parseFloat(recentAcc.toFixed(2)),
        data: results.reverse()
    });
});
app.get("/api/compare", (req, res) => {
    if (patternHistory.length === 0) return res.json({ error: "Chưa có dữ liệu" });
    const last = patternHistory[patternHistory.length - 1];
    let pred = null,
        conf = 0;
    if (patternHistory.length >= 10) {
        const p = predictAtIdx(patternHistory, patternHistory.length - 1);
        pred = p.prediction;
        conf = p.confidence;
    }
    res.json({
        current_session: last.session,
        actual_result: last.result,
        dice: last.dice,
        total: last.total,
        ai_prediction: pred,
        confidence: conf,
        is_correct: pred ? pred === last.result : null
    });
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

// ========== GIAO DIỆN WEB ==========
app.get("/", (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HDXAISUNWIN - Siêu VIP AI Tài Xỉu</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        * { font-family: 'Inter', sans-serif; }
        body { background: linear-gradient(135deg, #0B1120 0%, #111827 100%); }
        .glass { background: rgba(17,24,39,0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255,215,0,0.15); border-radius: 2rem; }
        .gold-glow { box-shadow: 0 0 20px rgba(255,215,0,0.3); }
        .dice { font-size: 1.8rem; display: inline-block; margin: 0 2px; filter: drop-shadow(0 4px 6px black); }
        .tab-active { border-bottom: 2px solid #fbbf24; color: #fbbf24; }
    </style>
</head>
<body class="text-gray-200">
    <div class="container mx-auto px-4 py-6 max-w-7xl">
        <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div class="flex items-center gap-3">
                <div class="text-4xl">🎲</div>
                <div>
                    <h1 class="text-3xl md:text-4xl font-bold bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">HDXAISUNWIN</h1>
                    <p class="text-sm text-gray-400">6 phương pháp AI tự học · Tài Xỉu SunWin</p>
                </div>
            </div>
            <div class="glass px-6 py-2 rounded-full text-center">
                <span class="text-yellow-400 font-semibold">⚡ Realtime</span>
                <span id="live-time" class="ml-2 text-sm"></span>
            </div>
        </div>

        <div class="glass p-6 mb-8 gold-glow">
            <div class="flex flex-col lg:flex-row justify-between items-center gap-6">
                <div class="text-center lg:text-left">
                    <div class="text-sm uppercase tracking-wider text-yellow-400">Dự đoán phiên tiếp theo</div>
                    <div class="text-5xl font-bold mt-2" id="prediction-text">---</div>
                    <div class="mt-2 flex items-center gap-2 justify-center lg:justify-start">
                        <span>Độ tin cậy:</span>
                        <div class="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div id="confidence-bar" class="h-full bg-yellow-500 rounded-full" style="width:0%"></div>
                        </div>
                        <span id="confidence-value" class="font-mono">0%</span>
                    </div>
                </div>
                <div class="flex gap-6 text-center">
                    <div><div class="text-gray-400 text-sm">Phiên hiện tại</div><div id="current-session" class="text-2xl font-bold text-yellow-300">--</div></div>
                    <div><div class="text-gray-400 text-sm">Kết quả gần nhất</div><div id="last-result" class="text-2xl font-bold">---</div></div>
                    <div><div class="text-gray-400 text-sm">Pattern 9 phiên</div><div id="pattern" class="text-xl font-mono">---</div></div>
                </div>
            </div>
        </div>

        <div class="mb-6 border-b border-gray-700 flex gap-4">
            <button id="tab-overview" class="tab-btn py-2 px-4 font-semibold tab-active">📊 Tổng quan</button>
            <button id="tab-methods" class="tab-btn py-2 px-4 font-semibold">🧠 Chi tiết phương pháp</button>
            <button id="tab-endpoints" class="tab-btn py-2 px-4 font-semibold">🔗 API Endpoints</button>
        </div>

        <div id="panel-overview" class="tab-panel">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div class="glass p-5">
                    <h3 class="text-lg font-semibold mb-2">📊 Thống kê</h3>
                    <div class="space-y-2">
                        <div class="flex justify-between"><span>Tổng phiên:</span><span id="total-sessions" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Tài / Xỉu:</span><span id="tai-xiu-ratio">0 / 0</span></div>
                        <div class="flex justify-between"><span>Độ chính xác gần đây:</span><span id="accuracy-recent" class="text-green-400">0%</span></div>
                        <div class="flex justify-between"><span>WebSocket:</span><span id="ws-status" class="text-green-400">● Kết nối</span></div>
                    </div>
                </div>
                <div class="glass p-5 lg:col-span-2">
                    <h3 class="text-lg font-semibold mb-2">📈 Độ chính xác 30 phiên gần nhất</h3>
                    <canvas id="accuracyChart" height="100"></canvas>
                </div>
            </div>
            <div class="glass p-5 overflow-x-auto">
                <div class="flex justify-between items-center mb-4"><h3 class="text-xl font-bold">📜 Lịch sử chi tiết</h3><button id="refreshBtn" class="bg-yellow-600 hover:bg-yellow-500 px-4 py-1 rounded-full text-sm">⟳ Cập nhật</button></div>
                <table class="w-full text-sm">
                    <thead class="border-b border-gray-700"><tr><th>Phiên</th><th>Xúc xắc</th><th>Tổng</th><th>Kết quả</th><th>Dự đoán AI</th><th>Độ tin cậy</th><th>Đúng/Sai</th></tr></thead>
                    <tbody id="history-tbody"><tr><td colspan="7" class="text-center py-6">Đang tải...</td></tr></tbody>
                </table>
            </div>
        </div>

        <div id="panel-methods" class="tab-panel hidden">
            <div class="glass p-5 mb-6"><h3 class="text-xl font-bold mb-3">🤖 Trọng số AI hiện tại</h3><div id="weights-detail" class="grid grid-cols-2 md:grid-cols-3 gap-3"></div></div>
            <div class="glass p-5"><h3 class="text-xl font-bold mb-3">🔍 Dự đoán từ từng phương pháp</h3><div id="methods-prediction-detail" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div></div>
        </div>

        <div id="panel-endpoints" class="tab-panel hidden">
            <div class="glass p-5"><h3 class="text-xl font-bold mb-4">🔗 Danh sách API (nhấp để mở)</h3><div id="endpoints-list" class="grid grid-cols-1 md:grid-cols-2 gap-3"></div></div>
        </div>
        <div class="mt-6 text-center text-xs text-gray-500">🤖 HDXAISUNWIN · Markov | Tần suất | Chu kỳ | Xu hướng | Fibonacci | Phân tích cặp · Tự học sau mỗi phiên</div>
    </div>
    <script>
        let chart = null;
        function setTab(tab) {
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
            document.getElementById(\`panel-\${tab}\`).classList.remove('hidden');
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('tab-active'));
            if(tab==='overview') document.getElementById('tab-overview').classList.add('tab-active');
            else if(tab==='methods') document.getElementById('tab-methods').classList.add('tab-active');
            else document.getElementById('tab-endpoints').classList.add('tab-active');
        }
        async function fetchAll() {
            try {
                const [pred, hist, stats, acc, weights, eps] = await Promise.all([
                    fetch('/api/predict'), fetch('/api/history_with_predictions?limit=60'),
                    fetch('/api/stats'), fetch('/api/accuracy'), fetch('/api/ai_weights'), fetch('/api/endpoints')
                ]);
                const p = await pred.json(), h = await hist.json(), s = await stats.json(), a = await acc.json(), w = await weights.json(), e = await eps.json();
                document.getElementById('prediction-text').innerHTML = p.Du_doan ? \`🎯 \${p.Du_doan}\` : p.error || '???';
                document.getElementById('confidence-bar').style.width = p.Do_tin_cay || '0%';
                document.getElementById('confidence-value').innerText = p.Do_tin_cay || '0%';
                document.getElementById('current-session').innerText = p.phien_hien_tai || '--';
                document.getElementById('last-result').innerHTML = p.Ket_qua ? (p.Ket_qua === 'Tài' ? '🟢 Tài' : '🔴 Xỉu') : '---';
                document.getElementById('pattern').innerText = p.Pattern || '---';
                document.getElementById('total-sessions').innerText = s.total_sessions || 0;
                document.getElementById('tai-xiu-ratio').innerText = \`\${s.tai_count||0} / \${s.xiu_count||0}\`;
                document.getElementById('accuracy-recent').innerHTML = (h.recent_accuracy||0) > 0 ? \`<span class="text-green-400">\${h.recent_accuracy}%</span>\` : '0%';
                if(w.weights) {
                    const ww = w.weights;
                    document.getElementById('weights-detail').innerHTML = \`
                        <div class="bg-gray-800 p-2 rounded">Markov: \${(ww.markov*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded">Tần suất: \${(ww.frequency*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded">Chu kỳ: \${(ww.cycle*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded">Xu hướng: \${(ww.trend*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded">Fibonacci: \${(ww.fibonacci*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded">Cặp xúc xắc: \${(ww.pair*100).toFixed(1)}%</div>
                    \`;
                }
                if(p.method_details) {
                    document.getElementById('methods-prediction-detail').innerHTML = \`
                        <div class="bg-gray-800/50 p-3 rounded">📈 Markov: \${p.method_details.markov||'chưa đủ'}</div>
                        <div class="bg-gray-800/50 p-3 rounded">📊 Tần suất: \${p.method_details.frequency||'chưa đủ'}</div>
                        <div class="bg-gray-800/50 p-3 rounded">🔄 Chu kỳ: \${p.method_details.cycle||'chưa đủ'}</div>
                        <div class="bg-gray-800/50 p-3 rounded">📉 Xu hướng: \${p.method_details.trend||'chưa đủ'}</div>
                        <div class="bg-gray-800/50 p-3 rounded">🔢 Fibonacci: \${p.method_details.fibonacci||'chưa đủ'}</div>
                        <div class="bg-gray-800/50 p-3 rounded">🎲 Cặp xúc xắc: \${p.method_details.pair||'chưa đủ'}</div>
                    \`;
                }
                const tbody = document.getElementById('history-tbody');
                if(h.data && h.data.length) {
                    tbody.innerHTML = h.data.slice(0,40).map(item => {
                        const diceHtml = \`<span class="dice">🎲\${item.dice[0]}</span> <span class="dice">🎲\${item.dice[1]}</span> <span class="dice">🎲\${item.dice[2]}</span>\`;
                        const resultClass = item.actual === 'Tài' ? 'text-green-400' : 'text-red-400';
                        const predClass = item.prediction === 'Tài' ? 'text-green-300' : (item.prediction === 'Xỉu' ? 'text-red-300' : 'text-gray-400');
                        let status = '';
                        if(item.correct===true) status='<span class="bg-green-800 px-2 py-0.5 rounded-full text-xs">✓ Đúng</span>';
                        else if(item.correct===false) status='<span class="bg-red-800 px-2 py-0.5 rounded-full text-xs">✗ Sai</span>';
                        else status='<span class="bg-gray-700 px-2 py-0.5 rounded-full text-xs">?</span>';
                        return \`<tr class="border-b border-gray-800"><td class="py-2">\${item.session}</td><td>\${diceHtml}</td><td>\${item.total}</td><td class="\${resultClass}">\${item.actual}</td><td class="\${predClass}">\${item.prediction}</td><td>\${item.confidence}%</td><td>\${status}</td></tr>\`;
                    }).join('');
                } else tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6">Chưa có dữ liệu</td></tr>';
                if(a.details && a.details.length) {
                    const last30 = a.details.slice(-30);
                    const labels = last30.map(d=>d.session);
                    const data = last30.map(d=>d.correct?100:0);
                    if(chart) chart.destroy();
                    const ctx = document.getElementById('accuracyChart').getContext('2d');
                    chart = new Chart(ctx, { type:'line', data:{ labels, datasets:[{ label:'Đúng(100)/Sai(0)', data, borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,0.1)', fill:true, tension:0.2 }] }, options:{ responsive:true, scales:{ y:{ min:0, max:100 } } } });
                }
                if(e) {
                    document.getElementById('endpoints-list').innerHTML = Object.entries(e).map(([name,url]) => \`<a href="\${url}" target="_blank" class="bg-gray-800 hover:bg-gray-700 p-3 rounded-lg flex justify-between items-center"><span class="font-mono text-sm">\${name}</span><span class="text-yellow-400">🔗</span></a>\`).join('');
                }
                document.getElementById('live-time').innerText = new Date().toLocaleTimeString('vi-VN');
            } catch(err) { console.error(err); }
        }
        document.getElementById('tab-overview').onclick = ()=>setTab('overview');
        document.getElementById('tab-methods').onclick = ()=>setTab('methods');
        document.getElementById('tab-endpoints').onclick = ()=>setTab('endpoints');
        document.getElementById('refreshBtn').onclick = fetchAll;
        fetchAll();
        setInterval(fetchAll, 5000);
    </script>
</body>
</html>`;
    res.send(html);
});

// Khởi động server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n=========================================`);
    console.log(`🚀 HDXAISUNWIN - SIÊU VIP AI TÀI XỈU`);
    console.log(`=========================================`);
    console.log(`📡 Dashboard: http://${getLocalIP()}:${PORT}`);
    console.log(`🔮 API dự đoán: http://${getLocalIP()}:${PORT}/api/predict`);
    console.log(`⚙️  AI weights: http://${getLocalIP()}:${PORT}/api/ai_weights`);
    console.log(`🔗 Endpoints: http://${getLocalIP()}:${PORT}/api/endpoints`);
    console.log(`=========================================\n`);
    connectWebSocket();
});