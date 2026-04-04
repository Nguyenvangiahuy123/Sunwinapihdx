const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const os = require('os');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3001;

let apiResponseData = {
    "Phien": null,
    "Xuc_xac_1": null,
    "Xuc_xac_2": null,
    "Xuc_xac_3": null,
    "Tong": null,
    "Ket_qua": "",
    "id": "@cskh_huydaixu",
    "server_time": new Date().toISOString()
};

let currentSessionId = null;
const patternHistory = []; // tối đa 200 phiên để học lâu hơn
const MAX_HISTORY = 200;

// ========== WEBSOCKET CONFIG ==========
const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sun.win"
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
            "info": "{\"ipAddress\":\"113.185.45.88\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJwbGFtYW1hIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzMxNDgxMTYyLCJhZmZJZCI6IkdFTVdJTiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzY2NDc0NzgwMDA2LCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjExMy4xODUuNDUuODgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE4LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjZhOGI0ZDM4LTFlYzEtNDUxYi1hYTA1LWYyZDkwYWFhNGM1MCIsInJlZ1RpbWUiOjE3NjY0NzQ3NTEzOTEsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fYXBpdm9wbmhhYW4ifQ.YFOscbeojWNlRo7490BtlzkDGYmwVpnlgOoh04oCJy4\",\"locale\":\"vi\",\"userId\":\"6a8b4d38-1ec1-451b-aa05-f2d90aaa4c50\",\"username\":\"GM_apivopnhaan\",\"timestamp\":1766474780007,\"refreshToken\":\"63d5c9be0c494b74b53ba150d69039fd.7592f06d63974473b4aaa1ea849b2940\"}",
            "signature": "66772A1641AA8B18BD99207CE448EA00ECA6D8A4D457C1FF13AB092C22C8DECF0C0014971639A0FBA9984701A91FCCBE3056ABC1BE1541D1C198AA18AF3C45595AF6601F8B048947ADF8F48A9E3E074162F9BA3E6C0F7543D38BD54FD4C0A2C56D19716CC5353BBC73D12C3A92F78C833F4EFFDC4AB99E55C77AD2CDFA91E296"
        }
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

let ws = null;
let pingInterval = null;
let reconnectTimeout = null;

// Helper: lấy IP local
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '127.0.0.1';
}

// ================== AI ADAPTIVE WEIGHTS (HDXAISUNWIN) ==================
let methodWeights = {
    markov: 0.5,
    frequency: 0.3,
    cycle: 0.2,
    trend: 0.1
};

let methodPredictionsLog = []; // lưu { session, actual, markov, freq, cycle, trend }

// Cập nhật trọng số dựa trên độ chính xác 30 phiên gần nhất
function updateAdaptiveWeights() {
    if (methodPredictionsLog.length < 10) return;
    const recent = methodPredictionsLog.slice(-30);
    let accuracy = { markov: 0, freq: 0, cycle: 0, trend: 0 };
    let count = 0;
    for (let log of recent) {
        if (!log.actual) continue;
        count++;
        if (log.markov === log.actual) accuracy.markov++;
        if (log.freq === log.actual) accuracy.freq++;
        if (log.cycle === log.actual) accuracy.cycle++;
        if (log.trend === log.actual) accuracy.trend++;
    }
    if (count === 0) return;
    const accMarkov = accuracy.markov / count;
    const accFreq = accuracy.freq / count;
    const accCycle = accuracy.cycle / count;
    const accTrend = accuracy.trend / count;
    let total = accMarkov + accFreq + accCycle + accTrend;
    if (total === 0) total = 1;
    const newWeights = {
        markov: accMarkov / total,
        frequency: accFreq / total,
        cycle: accCycle / total,
        trend: accTrend / total
    };
    // làm mượt
    methodWeights.markov = methodWeights.markov * 0.7 + newWeights.markov * 0.3;
    methodWeights.frequency = methodWeights.frequency * 0.7 + newWeights.frequency * 0.3;
    methodWeights.cycle = methodWeights.cycle * 0.7 + newWeights.cycle * 0.3;
    methodWeights.trend = methodWeights.trend * 0.7 + newWeights.trend * 0.3;
    let sum = methodWeights.markov + methodWeights.frequency + methodWeights.cycle + methodWeights.trend;
    methodWeights.markov /= sum;
    methodWeights.frequency /= sum;
    methodWeights.cycle /= sum;
    methodWeights.trend /= sum;
    console.log(`[HDXAISUNWIN] Adaptive weights updated: M=${methodWeights.markov.toFixed(3)} F=${methodWeights.frequency.toFixed(3)} C=${methodWeights.cycle.toFixed(3)} T=${methodWeights.trend.toFixed(3)}`);
}

// Chuyển lịch sử thành chuỗi 'T'/'X'
function getResultSequence(history) {
    return history.map(item => item.result === "Tài" ? "T" : "X").join('');
}

// 1. Markov (order 3-5)
function markovPredict(sequence, maxOrder = 5) {
    if (sequence.length < 3) return null;
    let bestPrediction = null, bestConfidence = 0;
    for (let order = 3; order <= Math.min(maxOrder, sequence.length-1); order++) {
        const lastPattern = sequence.slice(-order);
        const transitions = {};
        for (let i = 0; i <= sequence.length - order - 1; i++) {
            const pattern = sequence.slice(i, i + order);
            const next = sequence[i + order];
            if (!transitions[pattern]) transitions[pattern] = { T: 0, X: 0 };
            transitions[pattern][next]++;
        }
        const possible = transitions[lastPattern];
        if (!possible) continue;
        const total = possible.T + possible.X;
        const probTai = possible.T / total;
        const confidence = (Math.max(possible.T, possible.X) / total) * 100;
        if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestPrediction = probTai > 0.5 ? "Tài" : (probTai < 0.5 ? "Xỉu" : (Math.random() < 0.5 ? "Tài" : "Xỉu"));
        }
    }
    if (bestPrediction) return { prediction: bestPrediction, confidence: Math.round(bestConfidence) };
    return null;
}

// 2. Frequency có trọng số giảm dần
function weightedFrequencyPredict(history, windowSize = 30) {
    const recent = history.slice(-windowSize);
    let weightTai = 0, weightXiu = 0;
    for (let i = 0; i < recent.length; i++) {
        const weight = Math.pow(0.92, recent.length - 1 - i);
        if (recent[i].result === "Tài") weightTai += weight;
        else weightXiu += weight;
    }
    const total = weightTai + weightXiu;
    if (total === 0) return null;
    const probTai = weightTai / total;
    const prediction = probTai > 0.5 ? "Tài" : (probTai < 0.5 ? "Xỉu" : (Math.random() < 0.5 ? "Tài" : "Xỉu"));
    const confidence = Math.abs(probTai - 0.5) * 2 * 100;
    return { prediction, confidence: Math.min(95, Math.max(50, confidence)) };
}

// 3. Chu kỳ (cycle)
function cyclePredict(sequence, maxCycle = 12) {
    for (let cycle = 3; cycle <= maxCycle; cycle++) {
        if (sequence.length < cycle * 2) continue;
        const recentCycle = sequence.slice(-cycle);
        let matches = [];
        for (let i = 0; i <= sequence.length - cycle - 1; i++) {
            if (sequence.slice(i, i + cycle) === recentCycle) matches.push(i);
        }
        if (matches.length >= 2) {
            const lastMatch = matches[matches.length-1];
            const nextIndex = lastMatch + cycle;
            if (nextIndex < sequence.length) {
                const nextResult = sequence[nextIndex];
                const prediction = nextResult === 'T' ? "Tài" : "Xỉu";
                let confidence = 60 + Math.min(30, matches.length * 5);
                return { prediction, confidence };
            }
        }
    }
    return null;
}

// 4. Xu hướng (trend) - bệt, 1-1, 2-2
function trendPredict(history) {
    if (history.length < 5) return null;
    const last5 = history.slice(-5).map(h => h.result);
    const last3 = last5.slice(-3);
    if (last3[0] === last3[1] && last3[1] === last3[2]) {
        const prediction = last3[0] === "Tài" ? "Xỉu" : "Tài";
        return { prediction, confidence: 65 };
    }
    let isAlternating = true;
    for (let i = 1; i < last5.length; i++) {
        if (last5[i] === last5[i-1]) { isAlternating = false; break; }
    }
    if (isAlternating && last5.length >= 4) {
        const nextPrediction = last5[last5.length-1] === "Tài" ? "Xỉu" : "Tài";
        return { prediction: nextPrediction, confidence: 70 };
    }
    if (last5.length >= 4 && last5[0] === last5[1] && last5[2] === last5[3] && last5[1] !== last5[2]) {
        const prediction = last5[3] === "Tài" ? "Xỉu" : "Tài";
        return { prediction, confidence: 68 };
    }
    const taiCount = last5.filter(r => r === "Tài").length;
    const xiuCount = 5 - taiCount;
    if (taiCount !== xiuCount) {
        const prediction = taiCount > xiuCount ? "Tài" : "Xỉu";
        const confidence = 55 + Math.abs(taiCount - xiuCount) * 5;
        return { prediction, confidence: Math.min(75, confidence) };
    }
    return null;
}

// Dự đoán tổng hợp adaptive
function adaptiveCombinedPredict(history) {
    if (history.length < 10) return { prediction: "Chưa đủ dữ liệu", confidence: 0 };
    const seq = getResultSequence(history);
    const markov = markovPredict(seq, 5);
    const freq = weightedFrequencyPredict(history, 25);
    const cycle = cyclePredict(seq, 10);
    const trend = trendPredict(history);
    let scores = { Tài: 0, Xỉu: 0 };
    if (markov) scores[markov.prediction] += methodWeights.markov * (markov.confidence / 100);
    if (freq) scores[freq.prediction] += methodWeights.frequency * (freq.confidence / 100);
    if (cycle) scores[cycle.prediction] += methodWeights.cycle * (cycle.confidence / 100);
    if (trend) scores[trend.prediction] += methodWeights.trend * (trend.confidence / 100);
    const finalPrediction = scores.Tài > scores.Xỉu ? "Tài" : "Xỉu";
    let maxScore = Math.max(scores.Tài, scores.Xỉu);
    let totalWeight = methodWeights.markov + methodWeights.frequency + methodWeights.cycle + methodWeights.trend;
    if (totalWeight === 0) totalWeight = 1;
    let confidence = Math.round((maxScore / totalWeight) * 100);
    confidence = Math.min(99, Math.max(50, confidence));
    return { prediction: finalPrediction, confidence };
}

// Dự đoán cho một index trong quá khứ (để đánh giá)
function predictAtHistoryIndex(history, index) {
    if (index < 10) return { prediction: null, confidence: 0 };
    const pastHistory = history.slice(0, index);
    const seq = pastHistory.map(item => item.result === "Tài" ? "T" : "X").join('');
    const markov = markovPredict(seq, 5);
    const freq = weightedFrequencyPredict(pastHistory, 25);
    const cycle = cyclePredict(seq, 10);
    const trend = trendPredict(pastHistory);
    let scores = { Tài: 0, Xỉu: 0 };
    if (markov) scores[markov.prediction] += methodWeights.markov * (markov.confidence/100);
    if (freq) scores[freq.prediction] += methodWeights.frequency * (freq.confidence/100);
    if (cycle) scores[cycle.prediction] += methodWeights.cycle * (cycle.confidence/100);
    if (trend) scores[trend.prediction] += methodWeights.trend * (trend.confidence/100);
    let totalWeight = methodWeights.markov + methodWeights.frequency + methodWeights.cycle + methodWeights.trend;
    if (totalWeight === 0) return { prediction: null, confidence: 0 };
    const finalPrediction = scores.Tài > scores.Xỉu ? "Tài" : "Xỉu";
    let maxScore = Math.max(scores.Tài, scores.Xỉu);
    let confidence = Math.round((maxScore / totalWeight) * 100);
    confidence = Math.min(99, Math.max(50, confidence));
    return { prediction: finalPrediction, confidence };
}

function logMethodPredictions(session, actual, markovPred, freqPred, cyclePred, trendPred) {
    methodPredictionsLog.push({
        session, actual,
        markov: markovPred,
        freq: freqPred,
        cycle: cyclePred,
        trend: trendPred,
        timestamp: new Date().toISOString()
    });
    if (methodPredictionsLog.length > 200) methodPredictionsLog.shift();
    if (actual) updateAdaptiveWeights();
}

// ========== WEBSOCKET XỬ LÝ ==========
function connectWebSocket() {
    if (ws) {
        ws.removeAllListeners();
        ws.close();
    }
    ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });
    ws.on('open', () => {
        console.log('[✅] WebSocket connected to Sun.Win');
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
    ws.on('pong', () => console.log('[📶] Ping OK'));
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (!Array.isArray(data) || typeof data[1] !== 'object') return;
            const { cmd, sid, d1, d2, d3, gBB } = data[1];
            if (cmd === 1008 && sid) currentSessionId = sid;
            if (cmd === 1003 && gBB && d1 && d2 && d3) {
                const total = d1 + d2 + d3;
                const result = total > 10 ? "Tài" : "Xỉu";
                const newSessionId = currentSessionId;
                apiResponseData = {
                    "Phien": newSessionId,
                    "Xuc_xac_1": d1,
                    "Xuc_xac_2": d2,
                    "Xuc_xac_3": d3,
                    "Tong": total,
                    "Ket_qua": result,
                    "id": "@cskh_huydaixu",
                    "server_time": new Date().toISOString(),
                    "update_count": (apiResponseData.update_count || 0) + 1
                };
                console.log(`[🎲] Phiên ${newSessionId}: ${d1}-${d2}-${d3} = ${total} (${result})`);
                patternHistory.push({
                    session: newSessionId,
                    dice: [d1, d2, d3],
                    total: total,
                    result: result,
                    timestamp: new Date().toISOString()
                });
                if (patternHistory.length > MAX_HISTORY) patternHistory.shift();
                // Ghi log dự đoán của từng method cho phiên vừa kết thúc
                if (patternHistory.length >= 2) {
                    const prevHistory = patternHistory.slice(0, -1);
                    const seqPrev = prevHistory.map(h => h.result === "Tài" ? "T" : "X").join('');
                    const markovPrev = markovPredict(seqPrev, 5);
                    const freqPrev = weightedFrequencyPredict(prevHistory, 25);
                    const cyclePrev = cyclePredict(seqPrev, 10);
                    const trendPrev = trendPredict(prevHistory);
                    logMethodPredictions(
                        newSessionId, result,
                        markovPrev ? markovPrev.prediction : null,
                        freqPrev ? freqPrev.prediction : null,
                        cyclePrev ? cyclePrev.prediction : null,
                        trendPrev ? trendPrev.prediction : null
                    );
                }
                currentSessionId = null;
            }
        } catch (e) {
            console.error('[❌] Lỗi xử lý message:', e.message);
        }
    });
    ws.on('close', (code, reason) => {
        console.log(`[🔌] WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY);
    });
    ws.on('error', (err) => {
        console.error('[❌] WebSocket error:', err.message);
        ws.close();
    });
}

// ========== API ROUTES ==========
app.get('/api/ditmemaysun', (req, res) => res.json(apiResponseData));
app.get('/api/sunwin/history', (req, res) => {
    const last100 = patternHistory.slice(-100).reverse().map(item => ({
        "Ket_qua": item.result,
        "Phien": item.session,
        "Tong": item.total,
        "Xuc_xac_1": item.dice[0],
        "Xuc_xac_2": item.dice[1],
        "Xuc_xac_3": item.dice[2],
        "id": "@cskh_huydaixu"
    }));
    res.json(last100);
});
app.get('/api/stats', (req, res) => {
    const taiCount = patternHistory.filter(item => item.result === "Tài").length;
    const xiuCount = patternHistory.length - taiCount;
    res.json({
        total_sessions: patternHistory.length,
        tai_count: taiCount,
        xiu_count: xiuCount,
        tai_percentage: patternHistory.length ? ((taiCount / patternHistory.length) * 100).toFixed(2) : 0,
        xiu_percentage: patternHistory.length ? ((xiuCount / patternHistory.length) * 100).toFixed(2) : 0,
        last_update: apiResponseData.server_time,
        server_uptime: process.uptime().toFixed(0) + 's'
    });
});
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        websocket: ws ? ws.readyState === WebSocket.OPEN : false,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: ws ? 'connected' : 'disconnected'
    });
});
app.get('/api/predict', (req, res) => {
    if (patternHistory.length < 10) {
        return res.json({ error: "Chưa đủ dữ liệu (cần ít nhất 10 phiên)", need_more: true, AIHDXSUNWIN: "Đang học..." });
    }
    const currentData = apiResponseData;
    if (!currentData.Phien) {
        return res.status(503).json({ error: "Chưa có phiên hiện tại", AIHDXSUNWIN: "Chờ dữ liệu..." });
    }
    const { prediction, confidence } = adaptiveCombinedPredict(patternHistory);
    const nextSession = currentData.Phien + 1;
    const recentPattern = patternHistory.slice(-9).map(p => p.result === "Tài" ? "T" : "X").join('');
    res.json({
        "Ket_qua": currentData.Ket_qua,
        "Phien": currentData.Phien,
        "Tong": currentData.Tong,
        "Xuc_xac_1": currentData.Xuc_xac_1,
        "Xuc_xac_2": currentData.Xuc_xac_2,
        "Xuc_xac_3": currentData.Xuc_xac_3,
        "phien_hien_tai": nextSession,
        "Pattern": recentPattern,
        "Du_doan": prediction,
        "Do_tin_cay": confidence + "%",
        "id": "@cskh_huydaixu",
        "AIHDXSUNWIN": `HDXAISUNWIN_${prediction}_${confidence}`
    });
});
app.get('/api/ai_weights', (req, res) => {
    res.json({
        weights: methodWeights,
        total_logged_predictions: methodPredictionsLog.length,
        description: "Trọng số tự động cập nhật dựa trên độ chính xác 30 phiên gần nhất"
    });
});
app.get('/api/accuracy', (req, res) => {
    if (patternHistory.length < 10) return res.json({ error: "Cần ít nhất 10 phiên", current_length: patternHistory.length });
    let correct = 0, total = 0;
    const details = [];
    for (let i = 10; i < patternHistory.length; i++) {
        const { prediction, confidence } = predictAtHistoryIndex(patternHistory, i);
        if (!prediction) continue;
        const actual = patternHistory[i].result;
        const isCorrect = (prediction === actual);
        if (isCorrect) correct++;
        total++;
        details.push({ session: patternHistory[i].session, actual, prediction, correct: isCorrect, confidence });
    }
    const accuracy = total > 0 ? (correct / total * 100).toFixed(2) : 0;
    res.json({ total_predictions: total, correct, wrong: total - correct, accuracy_percent: parseFloat(accuracy), details: details.slice(-50) });
});
app.get('/api/history_with_predictions', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const start = Math.max(0, patternHistory.length - limit);
    const results = [];
    for (let i = start; i < patternHistory.length; i++) {
        const { prediction, confidence } = predictAtHistoryIndex(patternHistory, i);
        results.push({
            session: patternHistory[i].session,
            dice: patternHistory[i].dice,
            total: patternHistory[i].total,
            actual: patternHistory[i].result,
            prediction: prediction || "N/A",
            confidence: confidence || 0,
            correct: prediction ? (prediction === patternHistory[i].result) : null,
            timestamp: patternHistory[i].timestamp
        });
    }
    const recentResults = results.slice(-100).filter(r => r.prediction !== "N/A");
    const correctCount = recentResults.filter(r => r.correct === true).length;
    const accuracy = recentResults.length > 0 ? (correctCount / recentResults.length * 100).toFixed(2) : 0;
    res.json({ total_history: patternHistory.length, predictions_available: results.filter(r => r.prediction !== "N/A").length, recent_accuracy: parseFloat(accuracy), data: results.reverse() });
});
app.get('/api/compare', (req, res) => {
    if (patternHistory.length < 1) return res.json({ error: "Chưa có dữ liệu" });
    const last = patternHistory[patternHistory.length - 1];
    const prevHistory = patternHistory.slice(0, -1);
    let prediction = null, confidence = 0;
    if (prevHistory.length >= 10) {
        const predResult = predictAtHistoryIndex(patternHistory, patternHistory.length - 1);
        prediction = predResult.prediction;
        confidence = predResult.confidence;
    }
    res.json({ current_session: last.session, actual_result: last.result, dice: last.dice, total: last.total, ai_prediction: prediction, confidence, is_correct: prediction ? (prediction === last.result) : null });
});

// ========== GIAO DIỆN WEB SIÊU ĐẸP (tích hợp Chart.js, Tailwind) ==========
app.get('/', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
    <title>HDXAISUNWIN - Siêu VIP AI Tài Xỉu</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,600;14..32,700&display=swap" rel="stylesheet">
    <style>
        * { font-family: 'Inter', sans-serif; }
        body { background: linear-gradient(135deg, #0B1120 0%, #111827 100%); }
        .glass-card { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 215, 0, 0.15); border-radius: 2rem; }
        .gold-glow { box-shadow: 0 0 15px rgba(255, 215, 0, 0.3); }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 0.8; } 50% { opacity: 1; text-shadow: 0 0 8px gold; } 100% { opacity: 0.8; } }
        .dice { font-size: 2rem; display: inline-block; margin: 0 2px; filter: drop-shadow(0 4px 6px black); }
        .correct-bg { background: rgba(34,197,94,0.2); border-left: 4px solid #22c55e; }
        .wrong-bg { background: rgba(239,68,68,0.2); border-left: 4px solid #ef4444; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #1e293b; border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: #fbbf24; border-radius: 10px; }
    </style>
</head>
<body class="text-gray-200">
    <div class="container mx-auto px-4 py-6 max-w-7xl">
        <!-- Header -->
        <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div class="flex items-center gap-3">
                <div class="text-4xl">🎲</div>
                <div>
                    <h1 class="text-3xl md:text-4xl font-bold bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">HDXAISUNWIN</h1>
                    <p class="text-sm text-gray-400">AI tự học thích ứng · Tài Xỉu SunWin</p>
                </div>
            </div>
            <div class="glass-card px-6 py-2 rounded-full text-center">
                <span class="text-yellow-400 font-semibold">⚡ Realtime</span>
                <span id="live-time" class="ml-2 text-sm"></span>
            </div>
        </div>

        <!-- Dự đoán siêu VIP -->
        <div class="glass-card p-6 mb-8 gold-glow transition-all duration-500">
            <div class="flex flex-col lg:flex-row justify-between items-center gap-6">
                <div class="text-center lg:text-left">
                    <div class="text-sm uppercase tracking-wider text-yellow-400">Dự đoán phiên tiếp theo</div>
                    <div class="text-5xl font-bold mt-2" id="prediction-text">Đang tải...</div>
                    <div class="mt-2 flex items-center gap-2 justify-center lg:justify-start">
                        <span class="text-gray-300">Độ tin cậy:</span>
                        <div class="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div id="confidence-bar" class="h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full" style="width: 0%"></div>
                        </div>
                        <span id="confidence-value" class="font-mono">0%</span>
                    </div>
                </div>
                <div class="flex gap-6 text-center">
                    <div>
                        <div class="text-gray-400 text-sm">Phiên hiện tại</div>
                        <div class="text-2xl font-bold text-yellow-300" id="current-session">--</div>
                    </div>
                    <div>
                        <div class="text-gray-400 text-sm">Kết quả gần nhất</div>
                        <div class="text-2xl font-bold" id="last-result">---</div>
                    </div>
                    <div>
                        <div class="text-gray-400 text-sm">Pattern 9 phiên</div>
                        <div class="text-xl font-mono tracking-wider" id="pattern">---</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Thống kê nhanh + biểu đồ -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div class="glass-card p-5">
                <h3 class="text-lg font-semibold mb-2 flex items-center gap-2"><span>📊</span> Tổng quan</h3>
                <div class="space-y-2">
                    <div class="flex justify-between"><span>Tổng phiên:</span><span id="total-sessions" class="font-bold">0</span></div>
                    <div class="flex justify-between"><span>Tài / Xỉu:</span><span id="tai-xiu-ratio">0 / 0</span></div>
                    <div class="flex justify-between"><span>Độ chính xác AI (gần đây):</span><span id="accuracy-recent" class="text-green-400">0%</span></div>
                    <div class="flex justify-between"><span>Trạng thái WS:</span><span id="ws-status" class="text-green-400">● Đang kết nối</span></div>
                </div>
            </div>
            <div class="glass-card p-5 lg:col-span-2">
                <h3 class="text-lg font-semibold mb-2">📈 Độ chính xác 30 phiên gần nhất</h3>
                <canvas id="accuracyChart" height="100"></canvas>
            </div>
        </div>

        <!-- Bảng lịch sử dự đoán -->
        <div class="glass-card p-5 overflow-hidden">
            <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
                <h3 class="text-xl font-bold">📜 Lịch sử chi tiết (kèm dự đoán AI)</h3>
                <button id="refreshBtn" class="bg-yellow-600 hover:bg-yellow-500 px-4 py-1 rounded-full text-sm font-semibold transition">⟳ Tự động cập nhật</button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="border-b border-gray-700">
                        <tr class="text-left text-gray-300">
                            <th class="pb-2">Phiên</th><th>Xúc xắc</th><th>Tổng</th><th>Kết quả</th><th>Dự đoán AI</th><th>Độ tin cậy</th><th>Đúng/Sai</th>
                        </tr>
                    </thead>
                    <tbody id="history-tbody">
                        <tr><td colspan="7" class="text-center py-6">Đang tải dữ liệu...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Trọng số AI & footer -->
        <div class="mt-6 text-center text-xs text-gray-500">
            <p>🤖 HDXAISUNWIN · Adaptive Weights: <span id="weights-display">---</span> | Tự học sau mỗi phiên | Dữ liệu realtime từ SunWin</p>
        </div>
    </div>

    <script>
        let accuracyChart = null;

        async function fetchData() {
            try {
                const [predictRes, historyRes, statsRes, accuracyRes, weightsRes] = await Promise.all([
                    fetch('/api/predict'),
                    fetch('/api/history_with_predictions?limit=60'),
                    fetch('/api/stats'),
                    fetch('/api/accuracy'),
                    fetch('/api/ai_weights')
                ]);
                const predict = await predictRes.json();
                const historyData = await historyRes.json();
                const stats = await statsRes.json();
                const accuracy = await accuracyRes.json();
                const weights = await weightsRes.json();

                // Cập nhật dự đoán
                if (predict.Du_doan) {
                    document.getElementById('prediction-text').innerHTML = \`🎯 \${predict.Du_doan}\`;
                    document.getElementById('confidence-bar').style.width = predict.Do_tin_cay;
                    document.getElementById('confidence-value').innerText = predict.Do_tin_cay;
                } else {
                    document.getElementById('prediction-text').innerHTML = predict.error || "Chờ dữ liệu";
                }
                document.getElementById('current-session').innerText = predict.phien_hien_tai || '--';
                document.getElementById('last-result').innerHTML = predict.Ket_qua ? (predict.Ket_qua === 'Tài' ? '🟢 Tài' : '🔴 Xỉu') : '---';
                document.getElementById('pattern').innerText = predict.Pattern || '---';

                // Thống kê
                document.getElementById('total-sessions').innerText = stats.total_sessions || 0;
                document.getElementById('tai-xiu-ratio').innerText = \`\${stats.tai_count || 0} / \${stats.xiu_count || 0}\`;
                const recentAcc = historyData.recent_accuracy || 0;
                document.getElementById('accuracy-recent').innerHTML = recentAcc > 0 ? \`<span class="text-green-400">\${recentAcc}%</span>\` : '0%';
                document.getElementById('ws-status').innerHTML = '<span class="text-green-400">● Đang kết nối</span>';

                // Trọng số AI
                if (weights.weights) {
                    const w = weights.weights;
                    document.getElementById('weights-display').innerHTML = \`Markov \${(w.markov*100).toFixed(1)}% | Tần suất \${(w.frequency*100).toFixed(1)}% | Chu kỳ \${(w.cycle*100).toFixed(1)}% | Xu hướng \${(w.trend*100).toFixed(1)}%\`;
                }

                // Bảng lịch sử
                const tbody = document.getElementById('history-tbody');
                if (historyData.data && historyData.data.length) {
                    tbody.innerHTML = historyData.data.slice(0, 40).map(item => {
                        const diceHtml = \`<span class="dice">🎲\${item.dice[0]}</span> <span class="dice">🎲\${item.dice[1]}</span> <span class="dice">🎲\${item.dice[2]}</span>\`;
                        const resultClass = item.actual === 'Tài' ? 'text-green-400 font-bold' : 'text-red-400 font-bold';
                        const predClass = item.prediction === 'Tài' ? 'text-green-300' : (item.prediction === 'Xỉu' ? 'text-red-300' : 'text-gray-400');
                        let statusHtml = '';
                        if (item.correct === true) statusHtml = '<span class="bg-green-800 text-green-200 px-2 py-0.5 rounded-full text-xs">✓ Đúng</span>';
                        else if (item.correct === false) statusHtml = '<span class="bg-red-800 text-red-200 px-2 py-0.5 rounded-full text-xs">✗ Sai</span>';
                        else statusHtml = '<span class="bg-gray-700 px-2 py-0.5 rounded-full text-xs">?</span>';
                        return \`
                            <tr class="border-b border-gray-800 hover:bg-gray-800/40 transition">
                                <td class="py-2 font-mono">\${item.session}</td>
                                <td class="py-2">\${diceHtml}</td>
                                <td>\${item.total}</td>
                                <td class="\${resultClass}">\${item.actual}</td>
                                <td class="\${predClass}">\${item.prediction}</td>
                                <td>\${item.confidence}%</td>
                                <td>\${statusHtml}</td>
                            </tr>
                        \`;
                    }).join('');
                } else {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6">Chưa có phiên nào</td></tr>';
                }

                // Biểu đồ accuracy 30 phiên gần
                if (accuracy.details && accuracy.details.length) {
                    const last30 = accuracy.details.slice(-30);
                    const labels = last30.map(d => d.session);
                    const accData = last30.map(d => d.correct ? 100 : 0);
                    if (accuracyChart) accuracyChart.destroy();
                    const ctx = document.getElementById('accuracyChart').getContext('2d');
                    accuracyChart = new Chart(ctx, {
                        type: 'line',
                        data: { labels, datasets: [{ label: 'Đúng (100%) / Sai (0%)', data: accData, borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,0.1)', tension: 0.2, fill: true }] },
                        options: { responsive: true, maintainAspectRatio: true, scales: { y: { min: 0, max: 100, grid: { color: '#334155' } }, x: { ticks: { maxRotation: 45, autoSkip: true } } }, plugins: { legend: { labels: { color: '#cbd5e1' } } } }
                    });
                }
                document.getElementById('live-time').innerText = new Date().toLocaleTimeString('vi-VN');
            } catch (err) {
                console.error(err);
                document.getElementById('history-tbody').innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">Lỗi kết nối server</td></tr>';
            }
        }

        fetchData();
        setInterval(fetchData, 5000);
        document.getElementById('refreshBtn').addEventListener('click', () => fetchData());
    </script>
</body>
</html>`;
    res.send(html);
});

// Khởi động server
app.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`\n=========================================`);
    console.log(`🚀 HDXAISUNWIN - SIÊU VIP AI TÀI XỈU`);
    console.log(`=========================================`);
    console.log(`📡 Dashboard: http://${localIP}:${PORT}`);
    console.log(`🔮 API dự đoán: http://${localIP}:${PORT}/api/predict`);
    console.log(`⚙️  AI weights: http://${localIP}:${PORT}/api/ai_weights`);
    console.log(`📊 Độ chính xác: http://${localIP}:${PORT}/api/accuracy`);
    console.log(`=========================================\n`);
    connectWebSocket();
});