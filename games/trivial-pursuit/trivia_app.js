// =============================================
// TRIVIA PURSUIT — trivia_app.js
// The Game Shack | Casino OS
// Modes: vs AI | Hotseat | Online
// API: Open Trivia Database (opentdb.com)
// =============================================

// ── 1. OS INIT ────────────────────────────────
let gameMode    = localStorage.getItem("trivia_mode")   || "ai";
let totalQs     = parseInt(localStorage.getItem("trivia_qs") || "10");
let playerCount = parseInt(localStorage.getItem("trivia_players") || "2");
if (isNaN(playerCount) || playerCount < 2) playerCount = 2;
if (playerCount > 4) playerCount = 4;

let chatStarted   = false;
let currentRoomId = null;
let myId          = 1;
let isHost        = false;
let seats         = [];
let roomListener  = null; // onValue unsubscribe fn — detach on exit

// Settings that live on the start screen
let selectedCategory = localStorage.getItem("trivia_category") || "";   // "" = any
let aiDifficulty     = localStorage.getItem("trivia_ai_diff")  || "medium";

let p1Name      = SystemUI.getPlayerName();
let playerNames = [p1Name, "AI 2", "AI 3", "AI 4"];

SystemUI.init({
    gameName: "TRIVIA PURSUIT",
    rules: "Answer questions correctly to score points. Harder questions are worth more. Fastest correct answer wins the round in vs-AI and online modes; in hotseat each player answers the same question in turn.",
    hudDropdowns: [
        {
            id: "sys-trivia-mode",
            options: [
                { value: "ai",      label: "🤖 vs AI"   },
                { value: "hotseat", label: "👥 Hotseat"  },
                { value: "online",  label: "🌐 Online"   }
            ]
        },
        {
            id: "sys-trivia-qs",
            options: [
                { value: "5",  label: "5 Questions"  },
                { value: "10", label: "10 Questions" },
                { value: "15", label: "15 Questions" },
                { value: "20", label: "20 Questions" }
            ]
        }
    ]
});

setTimeout(() => {
    gameMode = document.getElementById("sys-trivia-mode").value;
    totalQs  = parseInt(document.getElementById("sys-trivia-qs").value);
    updateNames();
    buildStartSettings();
    renderScoreboard();
}, 10);

document.getElementById("sys-trivia-mode").addEventListener("change", e => {
    gameMode = e.target.value;
    localStorage.setItem("trivia_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");

    if (gameMode === "online") {
        SystemUI.v2Lobby.show();
    } else {
        SystemUI.v2Lobby.hide();
        SystemUI.stopChat();
        chatStarted = false;
        updateNames();
    }

    const aiRow = document.getElementById("ss-ai-row");
    if (aiRow) aiRow.style.display = (gameMode === "ai") ? "" : "none";
});

document.getElementById("sys-trivia-qs").addEventListener("change", e => {
    totalQs = parseInt(e.target.value);
    localStorage.setItem("trivia_qs", e.target.value);
});

// ── 2. OPENTDB API ───────────────────────────
let sessionToken = localStorage.getItem("trivia_token") || null;

function decodeHTML(str) {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
}

async function getSessionToken() {
    try {
        const res  = await fetch("https://opentdb.com/api_token.php?command=request");
        const data = await res.json();
        if (data.response_code === 0) {
            sessionToken = data.token;
            localStorage.setItem("trivia_token", sessionToken);
        }
    } catch (e) {
        console.warn("Could not get OpenTDB token:", e);
        sessionToken = null;
    }
}

async function resetToken() {
    if (!sessionToken) return;
    try {
        await fetch(`https://opentdb.com/api_token.php?command=reset&token=${sessionToken}`);
    } catch (e) {
        sessionToken = null;
        localStorage.removeItem("trivia_token");
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Resilient fetch — handles OpenTDB's newer rate limits (HTTP 429 / response_code 5),
// token exhaustion (4), missing token (3), and "not enough questions in category" (1).
async function fetchQuestions(amount, attempt = 0) {
    let url = `https://opentdb.com/api.php?amount=${amount}`;
    if (sessionToken)     url += `&token=${sessionToken}`;
    if (selectedCategory) url += `&category=${selectedCategory}`;

    let res, data;
    try {
        res = await fetch(url);
        if (res.status === 429) {
            if (attempt >= 3) throw new Error("OpenTDB rate-limited (429)");
            await sleep(5500);
            return fetchQuestions(amount, attempt + 1);
        }
        data = await res.json();
    } catch (err) {
        if (attempt >= 3) throw err;
        await sleep(2000);
        return fetchQuestions(amount, attempt + 1);
    }

    // 5 = OpenTDB throttle (added 2024) — wait 5s and retry
    if (data.response_code === 5) {
        if (attempt >= 3) throw new Error("OpenTDB throttled (code 5)");
        await sleep(5500);
        return fetchQuestions(amount, attempt + 1);
    }

    // 4 = token exhausted, 3 = token not found — refresh and retry
    if (data.response_code === 4 || data.response_code === 3) {
        if (data.response_code === 4) await resetToken();
        else { sessionToken = null; localStorage.removeItem("trivia_token"); }
        await getSessionToken();
        if (attempt >= 3) throw new Error("OpenTDB token retry exhausted");
        return fetchQuestions(amount, attempt + 1);
    }

    // 1 = not enough questions in chosen category — drop the filter once and retry
    if (data.response_code === 1 && selectedCategory) {
        const previous = selectedCategory;
        selectedCategory = "";
        const out = await fetchQuestions(amount, attempt + 1);
        selectedCategory = previous;
        return out;
    }

    if (data.response_code !== 0) {
        throw new Error(`OpenTDB error code: ${data.response_code}`);
    }

    return data.results.map(q => {
        const correct   = decodeHTML(q.correct_answer);
        const incorrect = q.incorrect_answers.map(decodeHTML);
        let answers;
        if (q.type === "boolean") {
            answers = ["True", "False"];
        } else {
            answers = [...incorrect, correct];
            shuffleArray(answers);
        }
        return {
            category:   decodeHTML(q.category),
            type:       q.type,
            difficulty: q.difficulty,
            question:   decodeHTML(q.question),
            correct,
            answers
        };
    });
}

// ── 3. SCORING ───────────────────────────────
const POINTS    = { easy: 100, medium: 200, hard: 300 };
const TIME_LIMIT = 20;

function calcPoints(difficulty, timeLeft) {
    const base  = POINTS[difficulty] || 100;
    const bonus = Math.floor((timeLeft / TIME_LIMIT) * 100);
    return base + bonus;
}

// ── 4. GAME STATE ────────────────────────────
let questions     = [];
let currentQIndex = 0;
let scores        = new Array(playerCount).fill(0);
let streaks       = new Array(playerCount).fill(0);
let activePlayer  = 1;
let answered      = false;
let timeLeft      = TIME_LIMIT;
let timerInterval = null;
let aiTimers      = [];
let gamePhase     = "idle";

let onlineAnswerLocked = false;
let hotseatAnswerCount = 0;

// vs-AI local: per-question elimination so a wrong answer only knocks out the
// answerer while the timer keeps running for everyone else.
let eliminated = [];

// Online: guardian timer that force-resolves a stuck round (dead/disconnected guest).
let guardianTimer = null;

// Online: timestamp of the current game; guest uses it to detect rematches.
let lastGameStartedAt = 0;

// ── 5. HELPERS ───────────────────────────────
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function isMyTurn() {
    if (gameMode === "online")  return true; // every online player can answer concurrently
    if (gameMode === "hotseat") return true;
    return activePlayer === 1;
}

function updateNames() {
    if (gameMode === "ai") {
        playerNames[0] = p1Name;
        for (let i = 1; i < 4; i++) playerNames[i] = "AI " + (i + 1);
    } else if (gameMode === "hotseat") {
        playerNames[0] = p1Name;
        for (let i = 1; i < 4; i++) playerNames[i] = "PLAYER " + (i + 1);
    } else if (gameMode === "online") {
        if (Array.isArray(seats) && seats.length > 0) {
            seats.forEach((s, i) => {
                if (i < 4) playerNames[i] = (s && s.name) ? s.name : ("Player " + (i + 1));
            });
        } else {
            playerNames[0] = p1Name;
            for (let i = 1; i < 4; i++) playerNames[i] = "Player " + (i + 1);
        }
    }
    renderScoreboard();
}

function getPlayerName(id) { return playerNames[id - 1] || ("Player " + id); }

// ── 6. TIMER ─────────────────────────────────
function startTimer() {
    stopTimer();
    timeLeft = TIME_LIMIT;
    updateTimerUI();

    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerUI();

        if (timeLeft <= 0) {
            stopTimer();
            handleTimeout();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateTimerUI() {
    const pct = (timeLeft / TIME_LIMIT) * 100;
    const bar = document.getElementById("timer-bar");
    const val = document.getElementById("timer-val");

    bar.style.width = pct + "%";
    val.textContent = timeLeft;

    bar.classList.remove("warning", "danger");
    if (timeLeft <= 6)  bar.classList.add("danger");
    else if (timeLeft <= 10) bar.classList.add("warning");
}

function handleTimeout() {
    if (answered) return;

    if (gameMode === "online") {
        // Submit a no-answer sentinel so the host can resolve and advance
        if (!onlineAnswerLocked) {
            onlineAnswerLocked = true;
            disableAllAnswers();
            submitOnlineAnswer("__timeout__", 0);
        }
        return;
    }

    const q = questions[currentQIndex];

    if (gameMode === "hotseat") {
        answered = true;
        // Treat a timeout as wrong for the active player and rotate
        streaks[activePlayer - 1] = 0;
        renderScores();
        hotseatAnswerCount++;
        if (hotseatAnswerCount < playerCount) {
            // Don't reveal the correct answer to the players still to come.
            disableAllAnswers();
            showLockedInBanner();
            activePlayer = (activePlayer % playerCount) + 1;
            setTimeout(() => {
                resetAnswerButtons();
                renderScores();
                startTimer();
                answered = false;
            }, 1200);
            return;
        }
        activePlayer = 1;
        hotseatAnswerCount = 0;
        revealAnswers(null);
        SystemUI.playSound('lose');
        showNextOverlay(false, q.correct, 0, null);
        return;
    }

    // vs-AI (and any other local mode): time ran out with no correct answer.
    answered = true;
    clearAiTimers();
    revealAnswers(null);
    SystemUI.playSound('lose');
    showNextOverlay(false, q.correct, 0, null);
}

// ── 7. RENDER ────────────────────────────────
function renderScoreboard() {
    const left  = document.getElementById("scores-left");
    const right = document.getElementById("scores-right");
    if (!left || !right) return;
    left.innerHTML  = "";
    right.innerHTML = "";

    const half = Math.ceil(playerCount / 2);
    for (let i = 0; i < playerCount; i++) {
        const block = document.createElement("div");
        block.className = "score-block";
        block.id        = "s-block-" + (i + 1);
        block.innerHTML =
            `<div class="s-name"   id="s-name-${i + 1}">${(playerNames[i] || ("P" + (i + 1))).toUpperCase()}</div>` +
            `<div class="s-score"  id="s-score-${i + 1}">${scores[i] || 0}</div>` +
            `<div class="s-streak" id="s-streak-${i + 1}"></div>`;
        if (i < half) left.appendChild(block);
        else          right.appendChild(block);
    }
    renderScores();
}

function renderScores() {
    for (let i = 0; i < playerCount; i++) {
        const sEl  = document.getElementById("s-score-"  + (i + 1));
        const stEl = document.getElementById("s-streak-" + (i + 1));
        const nEl  = document.getElementById("s-name-"   + (i + 1));
        const bk   = document.getElementById("s-block-"  + (i + 1));
        if (sEl)  sEl.textContent  = scores[i] || 0;
        if (stEl) stEl.textContent = ((streaks[i] || 0) >= 2) ? `🔥 ${streaks[i]}x` : "";
        if (nEl)  nEl.textContent  = (playerNames[i] || ("P" + (i + 1))).toUpperCase();
        if (bk)   bk.classList.toggle("active", gameMode === "hotseat" && activePlayer === (i + 1));
    }
}

function renderQuestion(q) {
    document.getElementById("q-counter").textContent = `${currentQIndex + 1}/${questions.length}`;

    document.getElementById("category-badge").textContent = q.category.toUpperCase();
    const diffBadge = document.getElementById("diff-badge");
    diffBadge.textContent = q.difficulty.toUpperCase();
    diffBadge.className   = `diff-${q.difficulty}`;

    document.getElementById("question-type-tag").textContent =
        q.type === "boolean" ? "TRUE / FALSE" : "MULTIPLE CHOICE";

    document.getElementById("question-text").textContent = q.question;

    const grid = document.getElementById("answer-grid");
    grid.innerHTML = "";

    if (q.type === "boolean") {
        grid.classList.add("tf-mode");
        grid.classList.remove("mc-mode");
        q.answers.forEach(ans => {
            grid.appendChild(makeAnswerBtn(ans, q.correct, null, true));
        });
    } else {
        grid.classList.add("mc-mode");
        grid.classList.remove("tf-mode");
        const letters = ["A", "B", "C", "D"];
        q.answers.forEach((ans, i) => {
            grid.appendChild(makeAnswerBtn(ans, q.correct, letters[i], false));
        });
    }

    document.getElementById("result-banner").classList.add("hidden");
}

function makeAnswerBtn(answer, correct, letter, isTF) {
    const btn = document.createElement("button");
    btn.className     = "ans-btn" + (isTF ? " tf-btn" : "");
    btn.dataset.answer = answer;

    if (!isTF && letter) {
        const badge = document.createElement("span");
        badge.className   = "ans-letter";
        badge.textContent = letter;
        btn.appendChild(badge);
    }

    const text = document.createElement("span");
    text.className   = "ans-text";
    text.textContent = answer;
    btn.appendChild(text);

    btn.addEventListener("click", () => handleAnswerClick(answer, btn));
    return btn;
}

function revealAnswers(selectedAnswer) {
    const q    = questions[currentQIndex];
    const btns = document.querySelectorAll(".ans-btn");

    btns.forEach(btn => {
        btn.disabled = true;
        const ans = btn.dataset.answer;

        if (ans === q.correct) {
            btn.classList.add("correct");
        } else if (ans === selectedAnswer && ans !== q.correct) {
            btn.classList.add("wrong");
        }
    });
}

function disableAllAnswers() {
    document.querySelectorAll(".ans-btn").forEach(btn => btn.disabled = true);
}

function showResultBanner(correct, pts) {
    const banner = document.getElementById("result-banner");
    banner.classList.remove("hidden", "correct-banner", "wrong-banner");
    banner.classList.add(correct ? "correct-banner" : "wrong-banner");

    document.getElementById("result-icon").textContent = correct ? "✓" : "✗";
    document.getElementById("result-text").textContent = correct ? "CORRECT!" : "WRONG!";
    document.getElementById("result-pts").textContent  = correct ? `+${pts} PTS` : "0 PTS";
}

function showNextOverlay(correct, correctAnswer, pts, scoringPlayer) {
    const overlay = document.getElementById("next-overlay");
    const label   = document.getElementById("next-result-label");
    const icon    = document.getElementById("next-result-icon");
    const ansEl   = document.getElementById("next-correct-ans");
    const deltaEl = document.getElementById("next-score-delta");

    overlay.classList.remove("hidden");

    if (correct) {
        icon.textContent  = "✓";
        label.textContent = "CORRECT!";
        label.className   = "correct-lbl";
        ansEl.textContent = "";
    } else {
        icon.textContent  = "✗";
        label.textContent = timeLeft <= 0 ? "TIME'S UP!" : "WRONG!";
        label.className   = "wrong-lbl";
        ansEl.textContent = `Answer: ${correctAnswer}`;
    }

    if (pts > 0 && scoringPlayer) {
        const name = getPlayerName(scoringPlayer).toUpperCase();
        deltaEl.textContent = `+${pts} for ${name}`;
    } else {
        deltaEl.textContent = "";
    }

    const nextBtn = document.getElementById("next-btn");
    if (gameMode === "ai" || gameMode === "hotseat") {
        nextBtn.classList.remove("hidden");
        nextBtn.textContent = "NEXT QUESTION →";
        nextBtn.disabled    = false;
        nextBtn.style.opacity = "";
    } else {
        // Online: host drives advancement
        if (isHost) {
            nextBtn.classList.remove("hidden");
            nextBtn.textContent = "NEXT QUESTION →";
            nextBtn.disabled    = false;
            nextBtn.style.opacity = "";
        } else {
            nextBtn.classList.remove("hidden");
            nextBtn.textContent = "Waiting for host...";
            nextBtn.disabled    = true;
            nextBtn.style.opacity = "0.4";
        }
    }
}

// ── 8. GAME FLOW ─────────────────────────────
async function startGame() {
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("trivia");

    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("loading-screen").classList.remove("hidden");
    document.getElementById("loading-text").textContent = "FETCHING QUESTIONS...";
    document.getElementById("loading-sub").textContent  = "Connecting to OpenTDB";

    scores  = new Array(playerCount).fill(0);
    streaks = new Array(playerCount).fill(0);
    currentQIndex      = 0;
    activePlayer       = 1;
    gamePhase          = "loading";
    onlineAnswerLocked = false;
    hotseatAnswerCount = 0;

    renderScoreboard();
    updateNames();

    // Online host pre-fetches in onStart, so questions are usually already populated.
    // Local modes (and any host fallback) fetch here.
    try {
        if (gameMode !== "online" || (isHost && questions.length === 0)) {
            if (!sessionToken) await getSessionToken();
            questions = await fetchQuestions(totalQs);
        }
    } catch (err) {
        console.error("Failed to fetch questions:", err);
        document.getElementById("loading-text").textContent = "CONNECTION ERROR";
        document.getElementById("loading-sub").textContent  = "Check your internet and try again.";
        setTimeout(() => {
            document.getElementById("loading-screen").classList.add("hidden");
            document.getElementById("start-screen").classList.remove("hidden");
        }, 3000);
        return;
    }

    document.getElementById("loading-screen").classList.add("hidden");
    gamePhase = "playing";

    if (gameMode === "online" && isHost) pushGameState();
    showQuestion(0);
}

function showQuestion(index) {
    if (index >= questions.length) { endGame(); return; }

    currentQIndex      = index;
    answered           = false;
    onlineAnswerLocked = false;
    gamePhase          = "playing";
    eliminated         = new Array(playerCount).fill(false);
    if (gameMode === "hotseat") hotseatAnswerCount = 0;

    const q = questions[index];
    renderQuestion(q);
    renderScores();

    stopTimer();
    startTimer();

    if (gameMode === "ai") {
        scheduleAiAnswers(q);
    }

    if (gameMode === "online" && isHost) {
        scheduleOnlineAiAnswers(q);
        scheduleGuardian();
    }
}

// ── 9. ANSWER HANDLING ───────────────────────
function handleAnswerClick(answer, btn) {
    if (answered) return;
    if (gameMode === "online" && onlineAnswerLocked) return;

    if (gameMode === "online") {
        // Don't set `answered` yet — host's resolution needs to fire and it gates on !answered
        onlineAnswerLocked = true;
        stopTimer();
        disableAllAnswers();
        submitOnlineAnswer(answer, timeLeft);
        return;
    }

    if (gameMode === "ai") {
        // Fastest-correct-wins: a correct answer ends the round; a wrong one only
        // eliminates the human while the timer + AI opponents keep going.
        const q = questions[currentQIndex];
        if (answer === q.correct) {
            answered = true;
            stopTimer();
            clearAiTimers();
            processAnswer(answer, 1, timeLeft);
        } else {
            eliminated[0] = true;
            streaks[0] = 0;
            renderScores();
            SystemUI.playSound('lose');
            disableAllAnswers();
            if (btn) btn.classList.add("wrong");
            maybeResolveLocalRound();
        }
        return;
    }

    // hotseat
    answered = true;
    stopTimer();
    processAnswer(answer, activePlayer, timeLeft);
}

// vs-AI local: if every player has now been eliminated, resolve the round as a
// miss (nobody got it right) instead of waiting for the timer to run out.
function maybeResolveLocalRound() {
    if (answered) return;
    for (let i = 0; i < playerCount; i++) {
        if (!eliminated[i]) return; // someone can still answer
    }
    answered = true;
    stopTimer();
    clearAiTimers();
    const q = questions[currentQIndex];
    revealAnswers(null);
    setTimeout(() => showNextOverlay(false, q.correct, 0, null), 1000);
}

// Neutral "locked in" state shown between hotseat players so the correct answer
// isn't revealed to those who haven't answered yet.
function showLockedInBanner() {
    const banner = document.getElementById("result-banner");
    banner.classList.remove("hidden", "correct-banner", "wrong-banner");
    document.getElementById("result-icon").textContent = "🔒";
    document.getElementById("result-text").textContent = "ANSWER LOCKED IN";
    document.getElementById("result-pts").textContent  = "";
}

function processAnswer(answer, player, tLeft) {
    const q       = questions[currentQIndex];
    const correct = answer === q.correct;
    const pts     = correct ? calcPoints(q.difficulty, tLeft) : 0;

    if (correct) {
        scores[player - 1]  += pts;
        streaks[player - 1] += 1;
        SystemUI.playSound('win');
    } else {
        streaks[player - 1] = 0;
        SystemUI.playSound('lose');
    }

    renderScores();

    if (gameMode === "hotseat") {
        hotseatAnswerCount++;
        if (hotseatAnswerCount < playerCount) {
            // Don't reveal the correct answer to players still to come — just
            // show a neutral locked-in state and rotate.
            disableAllAnswers();
            showLockedInBanner();
            activePlayer = (activePlayer % playerCount) + 1;
            setTimeout(() => {
                resetAnswerButtons();
                renderScores();
                startTimer();
                answered = false;
            }, 1200);
            return;
        }
        activePlayer = 1;
        hotseatAnswerCount = 0;
    }

    // Non-hotseat, or the last hotseat player: safe to reveal now.
    revealAnswers(answer);
    showResultBanner(correct, pts);

    setTimeout(() => {
        showNextOverlay(correct, q.correct, pts, correct ? player : null);
    }, 1000);
}

function resetAnswerButtons() {
    document.querySelectorAll(".ans-btn").forEach(btn => {
        btn.disabled = false;
        btn.classList.remove("correct", "wrong");
    });
}

// ── 10. AI BRAIN ──────────────────────────────
const AI_ACCURACY = {
    easy:   { easy: 0.40, medium: 0.28, hard: 0.18 },
    medium: { easy: 0.72, medium: 0.55, hard: 0.38 },
    hard:   { easy: 0.90, medium: 0.75, hard: 0.55 }
};

const AI_DELAY = {
    easy:   [10000, 18000],
    medium: [ 6000, 13000],
    hard:   [ 3000,  7000]
};

function clearAiTimers() {
    aiTimers.forEach(t => clearTimeout(t));
    aiTimers = [];
}

// ── ONLINE GUARDIAN ───────────────────────────
// If a player disconnects mid-round their __timeout__ never arrives and the
// host's resolution waits forever. After TIME_LIMIT + grace, force a timeout
// for any missing seat so the round can resolve.
function clearGuardian() {
    if (guardianTimer) { clearTimeout(guardianTimer); guardianTimer = null; }
}

function scheduleGuardian() {
    clearGuardian();
    if (!isHost || gameMode !== "online" || !currentRoomId) return;
    guardianTimer = setTimeout(() => {
        if (answered || !currentRoomId) return;
        forceMissingTimeouts();
    }, (TIME_LIMIT * 1000) + 4000);
}

function forceMissingTimeouts() {
    if (!isHost || !currentRoomId || !window.db) return;
    window.dbGet(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId)).then(snap => {
        const data = snap && snap.val();
        if (!data) return;
        const submitted = data.answers ? Object.keys(data.answers) : [];
        const ansUpdate = {};
        const timeUpdate = {};
        let missing = 0;
        for (let id = 1; id <= playerCount; id++) {
            if (!submitted.includes("p" + id)) {
                ansUpdate["p" + id]  = "__timeout__";
                timeUpdate["p" + id] = 0;
                missing++;
            }
        }
        if (missing > 0) {
            window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId + '/answers'),     ansUpdate);
            window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId + '/answerTimes'), timeUpdate);
        }
    }).catch(()=>{});
}

function scheduleAiAnswers(q) {
    clearAiTimers();
    if (playerCount < 2) return;

    const [minMs, maxMs] = AI_DELAY[aiDifficulty] || AI_DELAY.medium;
    const accuracy       = (AI_ACCURACY[aiDifficulty] || AI_ACCURACY.medium)[q.difficulty] || 0.55;

    // AI players in vs-AI mode are ids 2..playerCount
    for (let id = 2; id <= playerCount; id++) {
        const delay = minMs + Math.random() * (maxMs - minMs);
        const aiId  = id;
        const t = setTimeout(() => {
            if (answered || gamePhase !== "playing") return;
            aiAnswerNow(aiId, q, accuracy);
        }, delay);
        aiTimers.push(t);
    }
}

function aiAnswerNow(aiId, q, accuracy) {
    if (answered) return;
    if (eliminated[aiId - 1]) return; // this AI already missed this round
    const aiCorrect = Math.random() < accuracy;

    if (!aiCorrect) {
        // Wrong AI is eliminated but the round continues for everyone else.
        eliminated[aiId - 1] = true;
        streaks[aiId - 1] = 0;
        renderScores();
        maybeResolveLocalRound();
        return;
    }

    // Correct AI wins the round.
    const aiTimeLeft = timeLeft;
    answered = true;
    stopTimer();
    clearAiTimers();

    const pts = calcPoints(q.difficulty, aiTimeLeft);
    scores[aiId - 1]  += pts;
    streaks[aiId - 1] += 1;
    SystemUI.playSound('lose'); // an AI winning is bad news for the player

    renderScores();
    revealAnswers(q.correct);
    showResultBanner(aiCorrect, pts);

    setTimeout(() => {
        showNextOverlay(aiCorrect, q.correct, pts, aiId);
    }, 1000);
}

// ── 11. NEXT QUESTION LOGIC ──────────────────
document.getElementById("next-btn").addEventListener("click", () => {
    advanceToNextQuestion();
    if (gameMode === "online" && isHost && currentRoomId) {
        const newIdx = currentQIndex; // already advanced locally
        window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
            questionIndex:   newIdx,
            phase:           "playing",
            advancedAt:      Date.now(),
            answers:         null,
            answerTimes:     null,
            resolvedScorer:  null,
            resolvedPts:     null,
            resolvedAnswer:  null,
            resolvedCorrect: null
        });
    }
});

function advanceToNextQuestion() {
    document.getElementById("next-overlay").classList.add("hidden");
    const nextBtn = document.getElementById("next-btn");
    nextBtn.disabled    = false;
    nextBtn.style.opacity = "";
    nextBtn.textContent = "NEXT QUESTION →";

    clearAiTimers();

    const nextIndex = currentQIndex + 1;
    if (nextIndex >= questions.length) {
        endGame();
    } else {
        showQuestion(nextIndex);
    }
}

// ── 12. GAME OVER ────────────────────────────
function endGame() {
    // Guard re-entry: every later onValue with status "finished" would
    // otherwise re-fire the stats recording and the game-over modal.
    if (gamePhase === "gameover") return;
    gamePhase = "gameover";
    stopTimer();
    clearAiTimers();
    clearGuardian();

    // Determine winner = highest score; tie if more than one player at top
    let topScore = -1;
    let winnerId = 0;
    let topCount = 0;
    for (let i = 0; i < playerCount; i++) {
        if (scores[i] > topScore) { topScore = scores[i]; winnerId = i + 1; topCount = 1; }
        else if (scores[i] === topScore) { topCount++; }
    }
    const tied = topCount > 1;
    if (tied) winnerId = 0;

    const wName = winnerId === 0 ? "TIE GAME" : `${getPlayerName(winnerId).toUpperCase()} WINS!`;

    document.getElementById("game-over-emoji").textContent = winnerId === 0 ? "🤝" : "🏆";
    document.getElementById("game-over-title").textContent = wName;
    document.getElementById("game-over-msg").textContent   =
        scores.slice(0, playerCount)
              .map((s, i) => `${getPlayerName(i + 1)}: ${s}`)
              .join("  —  ");

    const breakdownLines = [];
    breakdownLines.push(`${questions.length} questions answered`);
    const streakLine = streaks.slice(0, playerCount)
        .map((s, i) => `${getPlayerName(i + 1)}: 🔥${s}`)
        .join(" | ");
    breakdownLines.push(`Best streak — ${streakLine}`);
    document.getElementById("game-over-breakdown").innerHTML = breakdownLines.join("<br>");

    document.getElementById("game-over-modal").classList.remove("hidden");
    SystemUI.playSound(winnerId === 1 ? 'win' : 'lose');

    if (typeof SystemStats !== 'undefined' && gameMode !== "hotseat") {
        if (winnerId !== 0) {
            const youWon = (gameMode === "ai" && winnerId === 1)
                || (gameMode === "online" && winnerId === myId);
            if (youWon) SystemStats.recordWin("trivia", 0);
            else        SystemStats.recordLoss("trivia");
        }
    }

    if (gameMode === "online" && isHost && currentRoomId) {
        window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
            status: "finished", winner: wName
        });
    }
}

// ── 14. BUTTON LISTENERS ─────────────────────
document.getElementById("start-btn").addEventListener("click", () => {
    if (gameMode === "online") return; // online uses the v2 lobby's START GAME button
    startGame();
});

document.getElementById("btn-play-again").addEventListener("click", () => {
    document.getElementById("game-over-modal").classList.add("hidden");
    document.getElementById("next-overlay").classList.add("hidden");
    scores  = new Array(playerCount).fill(0);
    streaks = new Array(playerCount).fill(0);
    renderScores();

    if (gameMode === "ai" || gameMode === "hotseat") {
        questions = [];
        startGame();
    } else {
        if (isHost) {
            // Force a fresh fetch + re-stamp gameStartedAt so the guest detects the rematch
            questions = [];
            startGame();
        } else {
            document.getElementById("start-screen").classList.remove("hidden");
            document.getElementById("start-btn").textContent = "Waiting for host...";
            document.getElementById("start-btn").disabled    = true;
        }
    }
});

// ── 15. START-SCREEN SETTINGS PANEL ──────────
const OPENTDB_CATEGORIES = [
    { id: "",   label: "🌐 Any"         },
    { id: "9",  label: "📚 General"     },
    { id: "11", label: "🎬 Film"        },
    { id: "12", label: "🎵 Music"       },
    { id: "14", label: "📺 TV"          },
    { id: "15", label: "🎮 Video Games" },
    { id: "17", label: "🔬 Science"     },
    { id: "18", label: "💻 Computers"   },
    { id: "21", label: "⚽ Sports"      },
    { id: "22", label: "🌍 Geography"   },
    { id: "23", label: "📜 History"     },
    { id: "27", label: "🐾 Animals"     },
];

function buildStartSettings() {
    const catWrap = document.getElementById("ss-category-pills");
    if (catWrap) {
        OPENTDB_CATEGORIES.forEach(cat => {
            const btn = document.createElement("button");
            btn.className     = "ss-chip" + (cat.id === selectedCategory ? " active" : "");
            btn.dataset.group = "category";
            btn.dataset.val   = cat.id;
            btn.textContent   = cat.label;
            catWrap.appendChild(btn);
        });
    }

    syncPillGroup("players", String(playerCount));
    syncPillGroup("qs",      String(totalQs));
    syncPillGroup("ai-diff", aiDifficulty);

    const aiRow = document.getElementById("ss-ai-row");
    if (aiRow) aiRow.style.display = (gameMode === "ai") ? "" : "none";

    const panel = document.getElementById("start-settings");
    if (!panel) return;
    panel.addEventListener("click", e => {
        const chip = e.target.closest(".ss-chip");
        if (!chip) return;
        const group = chip.dataset.group;
        const val   = chip.dataset.val;

        panel.querySelectorAll(`.ss-chip[data-group="${group}"]`)
             .forEach(c => c.classList.remove("active"));
        chip.classList.add("active");

        if (group === "category") {
            selectedCategory = val;
            localStorage.setItem("trivia_category", val);
            sessionToken = null;
            localStorage.removeItem("trivia_token");
            syncLobbyChip("trivia-cat", val);

        } else if (group === "qs") {
            totalQs = parseInt(val);
            localStorage.setItem("trivia_qs", val);
            const drop = document.getElementById("sys-trivia-qs");
            if (drop) drop.value = val;
            syncLobbyChip("trivia-qs", val);

        } else if (group === "ai-diff") {
            aiDifficulty = val;
            localStorage.setItem("trivia_ai_diff", val);

        } else if (group === "players") {
            playerCount = parseInt(val);
            localStorage.setItem("trivia_players", val);
            scores  = new Array(playerCount).fill(0);
            streaks = new Array(playerCount).fill(0);
            updateNames();
            syncLobbyChip("trivia-players", val);
        }
    });
}

function syncPillGroup(group, val) {
    document.querySelectorAll(`.ss-chip[data-group="${group}"]`).forEach(c => {
        c.classList.toggle("active", c.dataset.val === val);
    });
}

function syncLobbyChip(key, val) {
    const wrap = document.getElementById("v2-host-settings-wrapper");
    if (!wrap) return;
    wrap.querySelectorAll(`.v2-setting-btn[data-key="${key}"]`).forEach(c => {
        c.classList.toggle("active", String(c.dataset.val) === String(val));
    });
}

// ── 16. ONLINE MULTIPLAYER (v2 Lobby drop-in) ─
function updateLobbyPreview() {
    const slots = [
        { type: "host", name: SystemUI.getPlayerName(), color: "#e74c3c" }
    ];
    for (let i = 1; i < playerCount; i++) {
        slots.push({ type: "ai", name: "Slot " + (i + 1), color: "#3498db" });
    }
    SystemUI.v2Lobby.updatePreview(slots);
}

function cleanupRoom() {
    if (roomListener) { roomListener(); roomListener = null; }
    if (isHost && currentRoomId && window.db && window.dbRemove) {
        try { window.dbRemove(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId)).catch(()=>{}); }
        catch (e) {}
    } else if (!isHost && currentRoomId && window.db && myId > 0) {
        // Guest leaving — submit a timeout sentinel so the host doesn't wait
        // forever, and free the seat so the lobby preview is accurate.
        try {
            window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId + '/answers'),
                { ['p' + myId]: "__timeout__" });
            window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId + '/answerTimes'),
                { ['p' + myId]: 0 });
        } catch (e) {}
        if (Array.isArray(seats) && seats[myId - 1]) {
            const updatedSeats = [...seats];
            updatedSeats[myId - 1] = { type: "open", name: "Open" };
            try {
                window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId),
                    { seats: updatedSeats });
            } catch (e) {}
        }
    }
    clearGuardian();
    currentRoomId = null;
    isHost = false;
    myId = 1;
    seats = [];
    chatStarted = false;
}

// Guest-side: the host deleted the room (quit / tab close). Detach, notify
// briefly via the loading screen, and return to the start screen in AI mode.
function handleHostLeft() {
    if (roomListener) { roomListener(); roomListener = null; }
    stopTimer();
    clearAiTimers();
    clearGuardian();
    currentRoomId = null;
    isHost = false;
    myId = 1;
    seats = [];
    chatStarted = false;
    SystemUI.stopChat();
    questions = [];
    gamePhase = "idle";

    gameMode = "ai";
    document.getElementById("sys-trivia-mode").value = "ai";
    localStorage.setItem("trivia_mode", "ai");
    SystemUI.v2Lobby.hide();

    document.getElementById("game-over-modal").classList.add("hidden");
    document.getElementById("next-overlay").classList.add("hidden");
    const startBtn = document.getElementById("start-btn");
    if (startBtn) { startBtn.textContent = "START GAME"; startBtn.disabled = false; }

    document.getElementById("loading-screen").classList.remove("hidden");
    document.getElementById("loading-text").textContent = "HOST LEFT THE GAME";
    document.getElementById("loading-sub").textContent  = "Returning to menu…";
    updateNames();

    setTimeout(() => {
        document.getElementById("loading-screen").classList.add("hidden");
        document.getElementById("start-screen").classList.remove("hidden");
    }, 2000);
}

// Set up Firebase auto-cleanup when this client disconnects unexpectedly.
function armOnDisconnect() {
    if (!window.dbOnDisconnect || !currentRoomId || !window.db) return;
    try {
        if (isHost) {
            // Host crash → remove the whole room
            window.dbOnDisconnect(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId)).remove();
        } else {
            // Guest crash → free their seat (RTDB stores arrays under numeric keys)
            window.dbOnDisconnect(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId + '/seats/' + (myId - 1)))
                .set({ type: "open", name: "Open" });
        }
    } catch (e) {}
}

SystemUI.v2Lobby.setup({
    settingsConfig: [
        {
            id: "trivia-players",
            label: "PLAYERS",
            type: "select",
            default: playerCount,
            options: [
                { value: 2, label: "2" },
                { value: 3, label: "3" },
                { value: 4, label: "4" }
            ]
        },
        {
            id: "trivia-cat",
            label: "CATEGORY",
            type: "select",
            default: selectedCategory,
            options: OPENTDB_CATEGORIES.map(c => ({ value: c.id, label: c.label }))
        },
        {
            id: "trivia-qs",
            label: "QUESTIONS",
            type: "select",
            default: String(totalQs),
            options: [
                { value: "5",  label: "5"  },
                { value: "10", label: "10" },
                { value: "15", label: "15" },
                { value: "20", label: "20" }
            ]
        }
    ],

    onSettingsRendered: () => updateLobbyPreview(),

    onSettingChange: (key, val) => {
        if (key === "trivia-players") {
            playerCount = parseInt(val);
            localStorage.setItem("trivia_players", String(playerCount));
            scores  = new Array(playerCount).fill(0);
            streaks = new Array(playerCount).fill(0);
            syncPillGroup("players", String(playerCount));
            updateNames();
        } else if (key === "trivia-cat") {
            selectedCategory = val;
            localStorage.setItem("trivia_category", val);
            sessionToken = null;
            localStorage.removeItem("trivia_token");
            syncPillGroup("category", val);
        } else if (key === "trivia-qs") {
            totalQs = parseInt(val);
            localStorage.setItem("trivia_qs", val);
            const drop = document.getElementById("sys-trivia-qs");
            if (drop) drop.value = val;
            syncPillGroup("qs", val);
        }
        updateLobbyPreview();
    },

    onHost: () => {
        currentRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        isHost = true; myId = 1; chatStarted = false;

        seats = [{ type: "human", name: SystemUI.getPlayerName() }];
        for (let i = 1; i < playerCount; i++) {
            seats.push({ type: "open", name: "Open" });
        }

        window.dbSet(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
            status:           "waiting",
            p1Name:           p1Name,
            phase:            "idle",
            questionIndex:    0,
            seats,
            playerCount:      playerCount,
            selectedCategory: selectedCategory,
            totalQs:          totalQs,
            createdAt:        Date.now()
        }).then(() => {
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
            armOnDisconnect();
            listenToRoom();
        });
    },

    onJoin: (code) => {
        window.dbGet(window.dbChild(window.dbRef(window.db), `trivia_rooms/${code}`))
            .then(snap => {
                if (!snap.exists() || snap.val().status !== "waiting") {
                    SystemUI.v2Lobby.showError("ROOM NOT FOUND OR ALREADY STARTED");
                    return;
                }
                const data = snap.val();
                const incomingSeats = data.seats || [];
                const openIdx = incomingSeats.findIndex(s => s && s.type === "open");
                if (openIdx === -1) {
                    SystemUI.v2Lobby.showError("ROOM FULL");
                    return;
                }

                currentRoomId = code; isHost = false; myId = openIdx + 1; chatStarted = false;

                if (data.playerCount)        playerCount      = parseInt(data.playerCount) || 2;
                if (data.selectedCategory !== undefined) selectedCategory = data.selectedCategory;
                if (data.totalQs)            totalQs          = parseInt(data.totalQs);
                scores  = new Array(playerCount).fill(0);
                streaks = new Array(playerCount).fill(0);

                const updatedSeats = [...incomingSeats];
                updatedSeats[openIdx] = { type: "human", name: SystemUI.getPlayerName() };

                window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
                    seats: updatedSeats
                });
                SystemUI.v2Lobby.showRoomPhase(currentRoomId, false);
                armOnDisconnect();
                listenToRoom();
            });
    },

    onLeave: () => {
        cleanupRoom();
        gameMode = "ai";
        document.getElementById("sys-trivia-mode").value = "ai";
        localStorage.setItem("trivia_mode", "ai");
        SystemUI.stopChat();
        updateNames();
    },

    onStart: async () => {
        if (!isHost || !currentRoomId) return;

        // Pre-fetch questions BEFORE flipping status to "playing" so a CONNECTION ERROR
        // doesn't strand the guest in a half-started room.
        const startBtn = document.getElementById("v2-btn-start");
        const oldText  = startBtn ? startBtn.textContent : "";
        if (startBtn) { startBtn.disabled = true; startBtn.textContent = "FETCHING…"; }
        try {
            if (!sessionToken) await getSessionToken();
            questions = await fetchQuestions(totalQs);
        } catch (err) {
            console.error("Failed to fetch questions:", err);
            SystemUI.v2Lobby.showError("CONNECTION ERROR — TRY AGAIN");
            if (startBtn) { startBtn.disabled = false; startBtn.textContent = oldText || "START GAME"; }
            return;
        }
        if (startBtn) { startBtn.disabled = false; startBtn.textContent = oldText || "START GAME"; }

        // Re-read seats from Firebase so a guest who joined while we were
        // fetching questions doesn't get overwritten as 'ai'.
        let liveSeats = (seats && seats.length) ? [...seats] : [];
        try {
            const snap = await window.dbGet(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId));
            const data = snap && snap.val();
            if (data && Array.isArray(data.seats)) liveSeats = [...data.seats];
        } catch (e) {}

        // Lock seats: any still-'open' seat becomes an AI played by the host
        const lockedSeats = liveSeats;
        for (let i = 0; i < lockedSeats.length; i++) {
            if (!lockedSeats[i] || lockedSeats[i].type === "open") {
                lockedSeats[i] = { type: "ai", name: "AI " + (i + 1) };
            }
        }
        seats = lockedSeats;

        window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
            status:    "playing",
            seats:     lockedSeats,
            questions: JSON.stringify(questions)
        });
    },

    onClose: () => {
        if (gameMode === "online" && gamePhase !== "playing") {
            cleanupRoom();
            gameMode = "ai";
            document.getElementById("sys-trivia-mode").value = "ai";
            localStorage.setItem("trivia_mode", "ai");
            updateNames();
        }
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    if (roomListener) roomListener();
    roomListener = window.dbOnValue(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), snapshot => {
        const data = snapshot.val();
        if (!data) {
            // Room node removed — the host quit. Don't freeze the guest.
            if (!isHost && currentRoomId) handleHostLeft();
            return;
        }

        if (data.seats) {
            seats = data.seats;
            SystemUI.v2Lobby.renderSeats(seats);
        }

        // Guest mirrors host-controlled config
        if (!isHost) {
            if (data.playerCount)                    playerCount      = parseInt(data.playerCount) || playerCount;
            if (data.selectedCategory !== undefined) selectedCategory = data.selectedCategory;
            if (data.totalQs)                        totalQs          = parseInt(data.totalQs);
        }

        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }

            if (Array.isArray(seats)) {
                seats.forEach((s, i) => {
                    if (i < 4 && s && s.name) playerNames[i] = s.name;
                });
            }
            updateNames();

            if (isHost) {
                startGame();
            } else {
                document.getElementById("start-screen").classList.add("hidden");
                document.getElementById("loading-screen").classList.remove("hidden");
                document.getElementById("loading-text").textContent = "WAITING FOR HOST…";
                document.getElementById("loading-sub").textContent  = "Game starts soon";
            }
            return;
        }

        if (onlineGameStarted) syncFromFirebase(data);
    });
}

function pushGameState() {
    if (gameMode !== "online" || !currentRoomId) return;

    const payload = {
        phase:         gamePhase,
        questionIndex: currentQIndex,
        scores:        scores,
        streaks:       streaks,
        status:        gamePhase === "gameover" ? "finished" : "playing"
    };

    if (isHost && questions.length > 0) {
        payload.questions = JSON.stringify(questions);
        // First push of a fresh game — clear stale resolution fields so they
        // don't echo onto question 0 of a rematch, and stamp the game so the
        // guest can detect the rematch and re-parse the new question bank.
        if (currentQIndex === 0 && gamePhase === "playing") {
            payload.gameStartedAt   = Date.now();
            payload.answers         = null;
            payload.answerTimes     = null;
            payload.resolvedScorer  = null;
            payload.resolvedPts     = null;
            payload.resolvedAnswer  = null;
            payload.resolvedCorrect = null;
            payload.winner          = null;
            lastGameStartedAt       = payload.gameStartedAt;
        }
    }

    window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), payload);
}

function submitOnlineAnswer(answer, tLeft) {
    if (!currentRoomId) return;
    window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId + '/answers'),     { ['p' + myId]: answer });
    window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId + '/answerTimes'), { ['p' + myId]: tLeft  });
}

function submitAiOnlineAnswer(aiId, q, accuracy) {
    if (!currentRoomId) return;
    const correct = Math.random() < accuracy;
    const ans = correct
        ? q.correct
        : q.answers.filter(a => a !== q.correct)[
            Math.floor(Math.random() * (q.answers.length - 1))
          ];
    window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId + '/answers'),     { ['p' + aiId]: ans      });
    window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId + '/answerTimes'), { ['p' + aiId]: timeLeft  });
}

// Host-side: schedule answers for every AI seat in online mode
function scheduleOnlineAiAnswers(q) {
    if (!isHost || !Array.isArray(seats)) return;
    const [minMs, maxMs] = AI_DELAY[aiDifficulty] || AI_DELAY.medium;
    const accuracy       = (AI_ACCURACY[aiDifficulty] || AI_ACCURACY.medium)[q.difficulty] || 0.55;

    seats.forEach((seat, idx) => {
        if (!seat || seat.type !== "ai") return;
        const aiId  = idx + 1;
        const delay = minMs + Math.random() * (maxMs - minMs);
        const t = setTimeout(() => {
            if (gamePhase !== "playing") return;
            submitAiOnlineAnswer(aiId, q, accuracy);
        }, delay);
        aiTimers.push(t);
    });
}

function syncFromFirebase(data) {
    if (!data) return;

    // Detect a rematch: when the host stamps a new gameStartedAt, the guest
    // must drop the previous game's questions and modal state so the new
    // question bank gets re-parsed.
    if (!isHost && data.gameStartedAt && data.gameStartedAt !== lastGameStartedAt) {
        lastGameStartedAt = data.gameStartedAt;
        if (questions.length > 0 || gamePhase === "gameover") {
            questions = [];
            currentQIndex = 0;
            answered = false;
            onlineAnswerLocked = false;
            gamePhase = "loading";
            scores  = new Array(playerCount).fill(0);
            streaks = new Array(playerCount).fill(0);
            document.getElementById("game-over-modal").classList.add("hidden");
            document.getElementById("next-overlay").classList.add("hidden");
            // Guest clicked PLAY AGAIN, which re-showed the opaque start-screen.
            // The status="playing" branch can't re-fire for a rematch, so pull
            // the guest out from behind it here and re-enable the start button.
            document.getElementById("start-screen").classList.add("hidden");
            const rematchBtn = document.getElementById("start-btn");
            if (rematchBtn) { rematchBtn.textContent = "START GAME"; rematchBtn.disabled = false; }
            renderScores();
        }
    }

    // Receive question bank from host on first sync after status="playing"
    if (data.questions && questions.length === 0) {
        try {
            questions = JSON.parse(data.questions);
            document.getElementById("loading-screen").classList.add("hidden");
            // Safety net: make sure the guest isn't stuck behind the start-screen.
            document.getElementById("start-screen").classList.add("hidden");
            gamePhase = "playing";
            const idx = (typeof data.questionIndex === "number") ? data.questionIndex : 0;
            showQuestion(idx);
        } catch (e) { console.error("Failed to parse questions:", e); return; }
    }

    if (Array.isArray(data.scores))  scores  = data.scores;
    if (Array.isArray(data.streaks)) streaks = data.streaks;
    renderScores();

    // Host advanced to a new question
    if (typeof data.questionIndex === "number" &&
        data.questionIndex !== currentQIndex &&
        data.phase === "playing" &&
        questions.length > 0) {

        document.getElementById("next-overlay").classList.add("hidden");
        onlineAnswerLocked = false;
        answered = false;
        showQuestion(data.questionIndex);
        return;
    }

    // Host resolves once every seat has submitted an answer
    if (isHost && data.answers && !answered) {
        const answerKeys = Object.keys(data.answers).filter(k => /^p\d+$/.test(k));
        if (answerKeys.length >= playerCount) {
            answered = true;
            stopTimer();
            clearAiTimers();
            clearGuardian();

            const q     = questions[currentQIndex];
            const times = data.answerTimes || {};
            let bestScorer = 0;
            let bestTime   = -1;
            let bestAns    = "";
            for (let id = 1; id <= playerCount; id++) {
                const ans = data.answers["p" + id];
                if (!ans || ans === "__timeout__") continue;
                if (ans === q.correct) {
                    const t = times["p" + id] || 0;
                    if (t > bestTime) {
                        bestTime   = t;
                        bestScorer = id;
                        bestAns    = ans;
                    }
                }
            }

            const pts = bestScorer ? calcPoints(q.difficulty, bestTime) : 0;
            for (let id = 1; id <= playerCount; id++) {
                if (id === bestScorer) {
                    scores[id - 1]  += pts;
                    streaks[id - 1] += 1;
                } else {
                    streaks[id - 1] = 0;
                }
            }

            // NOTE: answers/answerTimes are cleared on the next-question advance,
            // not here, so the guest's resolution can still read its own answer
            // out of data.answers in order to highlight it correctly on reveal.
            window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
                resolvedCorrect: !!bestScorer,
                resolvedScorer:  bestScorer || 0,
                resolvedPts:     pts,
                resolvedAnswer:  bestAns,
                scores, streaks
            });

            const myAns = data.answers["p" + myId];
            revealAnswers(myAns || null);
            showResultBanner(myId === bestScorer, pts);
            renderScores();
            setTimeout(() => showNextOverlay(!!bestScorer, q.correct, pts, bestScorer || null), 1000);
        }
    }

    // Guest applies the host's resolution
    if (!isHost && typeof data.resolvedScorer === "number" && !answered && questions.length > 0) {
        answered = true;
        stopTimer();

        const q     = questions[currentQIndex];
        const myAns = data.answers ? data.answers["p" + myId] : null;
        if (Array.isArray(data.scores))  scores  = data.scores;
        if (Array.isArray(data.streaks)) streaks = data.streaks;
        renderScores();
        revealAnswers(myAns || null);
        showResultBanner(data.resolvedScorer === myId, data.resolvedPts || 0);
        setTimeout(() => {
            showNextOverlay(
                data.resolvedScorer === myId,
                q.correct,
                data.resolvedPts || 0,
                data.resolvedScorer || null
            );
        }, 1000);
    }

    if (data.status === "finished") endGame();
}

// ── BEFORE UNLOAD: clean up host's room so it doesn't linger ──
window.addEventListener("beforeunload", () => {
    if (isHost && currentRoomId && window.db && window.dbRemove) {
        try { window.dbRemove(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId)); } catch (e) {}
    }
});

// ── BOOT ─────────────────────────────────────
renderScoreboard();
updateNames();
