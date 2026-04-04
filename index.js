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
const patternHistory = []; // lưu tối đa 500 phiên để học sâu hơn
const MAX_HISTORY = 500;

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

// ================== AI ADAPTIVE WEIGHTS MỞ RỘNG (6 PHƯƠNG PHÁP) ==================
let methodWeights = {
    markov: 0.25,
    frequency: 0.20,
    cycle: 0.15,
    trend: 0.15,
    fibonacci: 0.10,
    pair: 0.15
};

let methodPredictionsLog = []; // lưu { session, actual, markov, freq, cycle, trend, fibonacci, pair }

// Cập nhật trọng số dựa trên độ chính xác 50 phiên gần nhất (exponential decay)
function updateAdaptiveWeights() {
    if (methodPredictionsLog.length < 20) return;
    const recent = methodPredictionsLog.slice(-50);
    let accuracy = { markov: 0, freq: 0, cycle: 0, trend: 0, fibonacci: 0, pair: 0 };
    let totalWeightedCount = 0;
    // Dùng exponential decay: phiên càng gần càng quan trọng
    for (let i = 0; i < recent.length; i++) {
        const log = recent[i];
        if (!log.actual) continue;
        const weight = Math.pow(0.92, recent.length - 1 - i); // giảm dần
        totalWeightedCount += weight;
        if (log.markov === log.actual) accuracy.markov += weight;
        if (log.freq === log.actual) accuracy.freq += weight;
        if (log.cycle === log.actual) accuracy.cycle += weight;
        if (log.trend === log.actual) accuracy.trend += weight;
        if (log.fibonacci === log.actual) accuracy.fibonacci += weight;
        if (log.pair === log.actual) accuracy.pair += weight;
    }
    if (totalWeightedCount === 0) return;
    const accMarkov = accuracy.markov / totalWeightedCount;
    const accFreq = accuracy.freq / totalWeightedCount;
    const accCycle = accuracy.cycle / totalWeightedCount;
    const accTrend = accuracy.trend / totalWeightedCount;
    const accFib = accuracy.fibonacci / totalWeightedCount;
    const accPair = accuracy.pair / totalWeightedCount;
    let totalAcc = accMarkov + accFreq + accCycle + accTrend + accFib + accPair;
    if (totalAcc === 0) totalAcc = 1;
    const newWeights = {
        markov: accMarkov / totalAcc,
        frequency: accFreq / totalAcc,
        cycle: accCycle / totalAcc,
        trend: accTrend / totalAcc,
        fibonacci: accFib / totalAcc,
        pair: accPair / totalAcc
    };
    // Làm mượt với hệ số 0.8 (giữ 80% cũ, 20% mới) để tránh biến động mạnh
    methodWeights.markov = methodWeights.markov * 0.8 + newWeights.markov * 0.2;
    methodWeights.frequency = methodWeights.frequency * 0.8 + newWeights.frequency * 0.2;
    methodWeights.cycle = methodWeights.cycle * 0.8 + newWeights.cycle * 0.2;
    methodWeights.trend = methodWeights.trend * 0.8 + newWeights.trend * 0.2;
    methodWeights.fibonacci = methodWeights.fibonacci * 0.8 + newWeights.fibonacci * 0.2;
    methodWeights.pair = methodWeights.pair * 0.8 + newWeights.pair * 0.2;
    // Chuẩn hóa tổng = 1
    let sum = methodWeights.markov + methodWeights.frequency + methodWeights.cycle + methodWeights.trend + methodWeights.fibonacci + methodWeights.pair;
    methodWeights.markov /= sum;
    methodWeights.frequency /= sum;
    methodWeights.cycle /= sum;
    methodWeights.trend /= sum;
    methodWeights.fibonacci /= sum;
    methodWeights.pair /= sum;
    console.log(`[HDXAISUNWIN] Adaptive weights: M=${methodWeights.markov.toFixed(3)} F=${methodWeights.frequency.toFixed(3)} C=${methodWeights.cycle.toFixed(3)} T=${methodWeights.trend.toFixed(3)} Fib=${methodWeights.fibonacci.toFixed(3)} Pair=${methodWeights.pair.toFixed(3)}`);
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

// 2. Frequency có trọng số giảm dần (decay factor 0.92)
function weightedFrequencyPredict(history, windowSize = 40) {
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

// 3. Chu kỳ (cycle) mở rộng
function cyclePredict(sequence, maxCycle = 15) {
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
                let confidence = 60 + Math.min(30, matches.length * 4);
                return { prediction, confidence };
            }
        }
    }
    return null;
}

// 4. Xu hướng (trend) - bệt, 1-1, 2-2, pattern đặc biệt
function trendPredict(history) {
    if (history.length < 5) return null;
    const last5 = history.slice(-5).map(h => h.result);
    const last3 = last5.slice(-3);
    // Bệt 3 -> đảo
    if (last3[0] === last3[1] && last3[1] === last3[2]) {
        const prediction = last3[0] === "Tài" ? "Xỉu" : "Tài";
        return { prediction, confidence: 70 };
    }
    // Xen kẽ hoàn hảo
    let isAlternating = true;
    for (let i = 1; i < last5.length; i++) {
        if (last5[i] === last5[i-1]) { isAlternating = false; break; }
    }
    if (isAlternating && last5.length >= 4) {
        const nextPrediction = last5[last5.length-1] === "Tài" ? "Xỉu" : "Tài";
        return { prediction: nextPrediction, confidence: 75 };
    }
    // Pattern 2-2 (AABB)
    if (last5.length >= 4 && last5[0] === last5[1] && last5[2] === last5[3] && last5[1] !== last5[2]) {
        const prediction = last5[3] === "Tài" ? "Xỉu" : "Tài";
        return { prediction, confidence: 68 };
    }
    // Đa số
    const taiCount = last5.filter(r => r === "Tài").length;
    const xiuCount = 5 - taiCount;
    if (taiCount !== xiuCount) {
        const prediction = taiCount > xiuCount ? "Tài" : "Xỉu";
        const confidence = 55 + Math.abs(taiCount - xiuCount) * 5;
        return { prediction, confidence: Math.min(75, confidence) };
    }
    return null;
}

// 5. Fibonacci & số học dựa trên tổng điểm
function fibonacciTrendPredict(history) {
    if (history.length < 10) return null;
    const lastTotals = history.slice(-10).map(h => h.total);
    // Tính chênh lệch tổng
    const diffs = [];
    for (let i = 1; i < lastTotals.length; i++) diffs.push(lastTotals[i] - lastTotals[i-1]);
    const avgDiff = diffs.reduce((a,b)=>a+b,0)/diffs.length;
    // Dự đoán tổng tiếp theo dựa trên mức thay đổi trung bình
    let predictedTotal = lastTotals[lastTotals.length-1] + avgDiff;
    predictedTotal = Math.min(18, Math.max(3, Math.round(predictedTotal)));
    const prediction = predictedTotal > 10 ? "Tài" : "Xỉu";
    let confidence = 55 + Math.min(30, Math.abs(avgDiff) * 3);
    return { prediction, confidence: Math.min(85, confidence) };
}

// 6. Phân tích cặp xúc xắc (tương quan giữa các mặt)
function pairAnalysisPredict(history) {
    if (history.length < 15) return null;
    // Lấy 15 cặp gần nhất (d1,d2), (d2,d3), (d1,d3)
    const recentPairs = history.slice(-15).map(h => ({
        p12: `${h.dice[0]},${h.dice[1]}`,
        p23: `${h.dice[1]},${h.dice[2]}`,
        p13: `${h.dice[0]},${h.dice[2]}`,
        result: h.result
    }));
    const last = history[history.length-1];
    const lastPairs = {
        p12: `${last.dice[0]},${last.dice[1]}`,
        p23: `${last.dice[1]},${last.dice[2]}`,
        p13: `${last.dice[0]},${last.dice[2]}`
    };
    let taiCount = 0, xiuCount = 0;
    for (let pair of recentPairs) {
        if (pair.p12 === lastPairs.p12 || pair.p23 === lastPairs.p23 || pair.p13 === lastPairs.p13) {
            if (pair.result === "Tài") taiCount++;
            else xiuCount++;
        }
    }
    const total = taiCount + xiuCount;
    if (total < 3) return null;
    const prediction = taiCount > xiuCount ? "Tài" : "Xỉu";
    const confidence = 55 + Math.min(30, Math.abs(taiCount - xiuCount) * 2);
    return { prediction, confidence: Math.min(85, confidence) };
}

// Dự đoán tổng hợp adaptive với 6 phương pháp
function adaptiveCombinedPredict(history) {
    if (history.length < 10) return { prediction: "Chưa đủ dữ liệu", confidence: 0, details: {} };
    const seq = getResultSequence(history);
    const markov = markovPredict(seq, 5);
    const freq = weightedFrequencyPredict(history, 40);
    const cycle = cyclePredict(seq, 15);
    const trend = trendPredict(history);
    const fib = fibonacciTrendPredict(history);
    const pair = pairAnalysisPredict(history);
    
    let scores = { Tài: 0, Xỉu: 0 };
    let details = {};
    if (markov) { scores[markov.prediction] += methodWeights.markov * (markov.confidence / 100); details.markov = markov; }
    if (freq) { scores[freq.prediction] += methodWeights.frequency * (freq.confidence / 100); details.freq = freq; }
    if (cycle) { scores[cycle.prediction] += methodWeights.cycle * (cycle.confidence / 100); details.cycle = cycle; }
    if (trend) { scores[trend.prediction] += methodWeights.trend * (trend.confidence / 100); details.trend = trend; }
    if (fib) { scores[fib.prediction] += methodWeights.fibonacci * (fib.confidence / 100); details.fibonacci = fib; }
    if (pair) { scores[pair.prediction] += methodWeights.pair * (pair.confidence / 100); details.pair = pair; }
    
    const finalPrediction = scores.Tài > scores.Xỉu ? "Tài" : "Xỉu";
    let maxScore = Math.max(scores.Tài, scores.Xỉu);
    let totalWeight = methodWeights.markov + methodWeights.frequency + methodWeights.cycle + methodWeights.trend + methodWeights.fibonacci + methodWeights.pair;
    if (totalWeight === 0) totalWeight = 1;
    let confidence = Math.round((maxScore / totalWeight) * 100);
    confidence = Math.min(99, Math.max(50, confidence));
    return { prediction: finalPrediction, confidence, details };
}

// Dự đoán cho một index trong quá khứ (để đánh giá)
function predictAtHistoryIndex(history, index) {
    if (index < 10) return { prediction: null, confidence: 0, details: {} };
    const pastHistory = history.slice(0, index);
    const seq = pastHistory.map(item => item.result === "Tài" ? "T" : "X").join('');
    const markov = markovPredict(seq, 5);
    const freq = weightedFrequencyPredict(pastHistory, 40);
    const cycle = cyclePredict(seq, 15);
    const trend = trendPredict(pastHistory);
    const fib = fibonacciTrendPredict(pastHistory);
    const pair = pairAnalysisPredict(pastHistory);
    let scores = { Tài: 0, Xỉu: 0 };
    if (markov) scores[markov.prediction] += methodWeights.markov * (markov.confidence/100);
    if (freq) scores[freq.prediction] += methodWeights.frequency * (freq.confidence/100);
    if (cycle) scores[cycle.prediction] += methodWeights.cycle * (cycle.confidence/100);
    if (trend) scores[trend.prediction] += methodWeights.trend * (trend.confidence/100);
    if (fib) scores[fib.prediction] += methodWeights.fibonacci * (fib.confidence/100);
    if (pair) scores[pair.prediction] += methodWeights.pair * (pair.confidence/100);
    let totalWeight = methodWeights.markov + methodWeights.frequency + methodWeights.cycle + methodWeights.trend + methodWeights.fibonacci + methodWeights.pair;
    if (totalWeight === 0) return { prediction: null, confidence: 0, details: {} };
    const finalPrediction = scores.Tài > scores.Xỉu ? "Tài" : "Xỉu";
    let maxScore = Math.max(scores.Tài, scores.Xỉu);
    let confidence = Math.round((maxScore / totalWeight) * 100);
    confidence = Math.min(99, Math.max(50, confidence));
    return { prediction: finalPrediction, confidence, details: { markov, freq, cycle, trend, fib, pair } };
}

function logMethodPredictions(session, actual, markovPred, freqPred, cyclePred, trendPred, fibPred, pairPred) {
    methodPredictionsLog.push({
        session, actual,
        markov: markovPred,
        freq: freqPred,
        cycle: cyclePred,
        trend: trendPred,
        fibonacci: fibPred,
        pair: pairPred,
        timestamp: new Date().toISOString()
    });
    if (methodPredictionsLog.length > 500) methodPredictionsLog.shift();
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
                    const freqPrev = weightedFrequencyPredict(prevHistory, 40);
                    const cyclePrev = cyclePredict(seqPrev, 15);
                    const trendPrev = trendPredict(prevHistory);
                    const fibPrev = fibonacciTrendPredict(prevHistory);
                    const pairPrev = pairAnalysisPredict(prevHistory);
                    logMethodPredictions(
                        newSessionId, result,
                        markovPrev ? markovPrev.prediction : null,
                        freqPrev ? freqPrev.prediction : null,
                        cyclePrev ? cyclePrev.prediction : null,
                        trendPrev ? trendPrev.prediction : null,
                        fibPrev ? fibPrev.prediction : null,
                        pairPrev ? pairPrev.prediction : null
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
    const { prediction, confidence, details } = adaptiveCombinedPredict(patternHistory);
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
        "AIHDXSUNWIN": `HDXAISUNWIN_${prediction}_${confidence}`,
        "method_details": {
            markov: details.markov ? `${details.markov.prediction} (${details.markov.confidence}%)` : null,
            frequency: details.freq ? `${details.freq.prediction} (${details.freq.confidence}%)` : null,
            cycle: details.cycle ? `${details.cycle.prediction} (${details.cycle.confidence}%)` : null,
            trend: details.trend ? `${details.trend.prediction} (${details.trend.confidence}%)` : null,
            fibonacci: details.fibonacci ? `${details.fibonacci.prediction} (${details.fibonacci.confidence}%)` : null,
            pair: details.pair ? `${details.pair.prediction} (${details.pair.confidence}%)` : null
        }
    });
});
app.get('/api/ai_weights', (req, res) => {
    res.json({
        weights: methodWeights,
        total_logged_predictions: methodPredictionsLog.length,
        description: "Trọng số tự động cập nhật dựa trên độ chính xác 50 phiên gần nhất (exponential decay)"
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
    const limit = parseInt(req.query.limit) || 60;
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
    const recentResults = results.slice(-60).filter(r => r.prediction !== "N/A");
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

// ========== ENDPOINT ĐIỀU HƯỚNG DỄ DÙNG ==========
app.get('/api/endpoints', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
        "Trang chủ (Dashboard)": `${baseUrl}/`,
        "Dự đoán hiện tại": `${baseUrl}/api/predict`,
        "Lịch sử 100 phiên": `${baseUrl}/api/sunwin/history`,
        "Lịch sử kèm dự đoán AI": `${baseUrl}/api/history_with_predictions`,
        "Thống kê cơ bản": `${baseUrl}/api/stats`,
        "Trọng số AI hiện tại": `${baseUrl}/api/ai_weights`,
        "Độ chính xác AI": `${baseUrl}/api/accuracy`,
        "So sánh phiên cuối": `${baseUrl}/api/compare`,
        "Kiểm tra sức khỏe": `${baseUrl}/api/health`,
        "Raw data mới nhất": `${baseUrl}/api/ditmemaysun`
    });
});

// ========== GIAO DIỆN WEB SIÊU ĐẸP (có tab method, chart, endpoints) ==========
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
        .dice { font-size: 2rem; display: inline-block; margin: 0 2px; filter: drop-shadow(0 4px 6px black); }
        .correct-bg { background: rgba(34,197,94,0.2); border-left: 4px solid #22c55e; }
        .wrong-bg { background: rgba(239,68,68,0.2); border-left: 4px solid #ef4444; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #1e293b; border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: #fbbf24; border-radius: 10px; }
        .tab-active { border-bottom: 2px solid #fbbf24; color: #fbbf24; }
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
                    <p class="text-sm text-gray-400">6 phương pháp AI tự học thích ứng · Tài Xỉu SunWin</p>
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

        <!-- Tabs: Tổng quan / Chi tiết phương pháp / API Endpoints -->
        <div class="mb-6 border-b border-gray-700 flex gap-4">
            <button id="tab-overview" class="tab-btn py-2 px-4 font-semibold transition tab-active">📊 Tổng quan</button>
            <button id="tab-methods" class="tab-btn py-2 px-4 font-semibold transition">🧠 Chi tiết phương pháp</button>
            <button id="tab-endpoints" class="tab-btn py-2 px-4 font-semibold transition">?? API Endpoints</button>
        </div>

        <!-- Tab 1: Tổng quan -->
        <div id="panel-overview" class="tab-panel">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                <div class="glass-card p-5">
                    <h3 class="text-lg font-semibold mb-2 flex items-center gap-2"><span>📊</span> Thống kê</h3>
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
        </div>

        <!-- Tab 2: Chi tiết phương pháp -->
        <div id="panel-methods" class="tab-panel hidden">
            <div class="glass-card p-5 mb-6">
                <h3 class="text-xl font-bold mb-3">🤖 Trọng số AI hiện tại (tự học)</h3>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm" id="weights-display-detail">
                    ...
                </div>
            </div>
            <div class="glass-card p-5">
                <h3 class="text-xl font-bold mb-3">🔍 Dự đoán từ từng phương pháp cho phiên tới</h3>
                <div id="methods-predictions" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Sẽ fill bằng JS -->
                </div>
            </div>
        </div>

        <!-- Tab 3: API Endpoints -->
        <div id="panel-endpoints" class="tab-panel hidden">
            <div class="glass-card p-5">
                <h3 class="text-xl font-bold mb-4">🔗 Danh sách API có thể truy cập trực tiếp</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="endpoints-list">
                    <!-- load từ /api/endpoints -->
                </div>
                <p class="text-xs text-gray-400 mt-4">💡 Nhấp vào link để xem dữ liệu raw JSON hoặc truy cập giao diện.</p>
            </div>
        </div>

        <div class="mt-6 text-center text-xs text-gray-500">
            <p>🤖 HDXAISUNWIN · 6 phương pháp: Markov, Tần suất, Chu kỳ, Xu hướng, Fibonacci, Phân tích cặp | Tự học sau mỗi phiên</p>
        </div>
    </div>

    <script>
        let accuracyChart = null;
        let currentTab = 'overview';

        function setTab(tab) {
            currentTab = tab;
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
            document.getElementById(`panel-${tab}`).classList.remove('hidden');
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('tab-active'));
            if (tab === 'overview') document.getElementById('tab-overview').classList.add('tab-active');
            else if (tab === 'methods') document.getElementById('tab-methods').classList.add('tab-active');
            else if (tab === 'endpoints') document.getElementById('tab-endpoints').classList.add('tab-active');
        }

        async function fetchData() {
            try {
                const [predictRes, historyRes, statsRes, accuracyRes, weightsRes, endpointsRes] = await Promise.all([
                    fetch('/api/predict'),
                    fetch('/api/history_with_predictions?limit=60'),
                    fetch('/api/stats'),
                    fetch('/api/accuracy'),
                    fetch('/api/ai_weights'),
                    fetch('/api/endpoints')
                ]);
                const predict = await predictRes.json();
                const historyData = await historyRes.json();
                const stats = await statsRes.json();
                const accuracy = await accuracyRes.json();
                const weights = await weightsRes.json();
                const endpoints = await endpointsRes.json();

                // Cập nhật dự đoán chính
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

                // Trọng số chi tiết
                if (weights.weights) {
                    const w = weights.weights;
                    const weightsHtml = \`
                        <div class="bg-gray-800 p-2 rounded"><span class="text-yellow-400">Markov:</span> \${(w.markov*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded"><span class="text-yellow-400">Tần suất:</span> \${(w.frequency*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded"><span class="text-yellow-400">Chu kỳ:</span> \${(w.cycle*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded"><span class="text-yellow-400">Xu hướng:</span> \${(w.trend*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded"><span class="text-yellow-400">Fibonacci:</span> \${(w.fibonacci*100).toFixed(1)}%</div>
                        <div class="bg-gray-800 p-2 rounded"><span class="text-yellow-400">Phân tích cặp:</span> \${(w.pair*100).toFixed(1)}%</div>
                    \`;
                    document.getElementById('weights-display-detail').innerHTML = weightsHtml;
                }

                // Chi tiết dự đoán từng method
                if (predict.method_details) {
                    const methodsHtml = \`
                        <div class="bg-gray-800/50 p-3 rounded-lg"><strong>📈 Markov:</strong> \${predict.method_details.markov || 'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/50 p-3 rounded-lg"><strong>📊 Tần suất:</strong> \${predict.method_details.frequency || 'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/50 p-3 rounded-lg"><strong>🔄 Chu kỳ:</strong> \${predict.method_details.cycle || 'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/50 p-3 rounded-lg"><strong>📉 Xu hướng:</strong> \${predict.method_details.trend || 'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/50 p-3 rounded-lg"><strong>🔢 Fibonacci:</strong> \${predict.method_details.fibonacci || 'chưa đủ dữ liệu'}</div>
                        <div class="bg-gray-800/50 p-3 rounded-lg"><strong>🎲 Phân tích cặp:</strong> \${predict.method_details.pair || 'chưa đủ dữ liệu'}</div>
                    \`;
                    document.getElementById('methods-predictions').innerHTML = methodsHtml;
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

                // Biểu đồ accuracy
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

                // Danh sách endpoints
                const endpointsDiv = document.getElementById('endpoints-list');
                if (endpoints) {
                    endpointsDiv.innerHTML = Object.entries(endpoints).map(([name, url]) => \`
                        <a href="\${url}" target="_blank" class="bg-gray-800 hover:bg-gray-700 p-3 rounded-lg transition flex justify-between items-center">
                            <span class="font-mono text-sm">\${name}</span>
                            <span class="text-yellow-400">🔗</span>
                        </a>
                    \`).join('');
                }

                document.getElementById('live-time').innerText = new Date().toLocaleTimeString('vi-VN');
            } catch (err) {
                console.error(err);
                document.getElementById('history-tbody').innerHTML = '<tr><td colspan="7" class="text-center py-6 text-red-400">Lỗi kết nối server</td></tr>';
            }
        }

        // Event listeners cho tabs
        document.getElementById('tab-overview').addEventListener('click', () => setTab('overview'));
        document.getElementById('tab-methods').addEventListener('click', () => setTab('methods'));
        document.getElementById('tab-endpoints').addEventListener('click', () => setTab('endpoints'));
        document.getElementById('refreshBtn').addEventListener('click', () => fetchData());

        fetchData();
        setInterval(fetchData, 5000);
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
    console.log(`🔗 Danh sách endpoints: http://${localIP}:${PORT}/api/endpoints`);
    console.log(`=========================================\n`);
    connectWebSocket();
});