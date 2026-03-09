// =============================================
// TRIVIA PURSUIT — trivia_app.js
// The Game Shack | Casino OS
// Modes: vs AI | Hotseat | Online
// API: Open Trivia Database (opentdb.com)
// =============================================

// ── 1. OS INIT ────────────────────────────────
let gameMode    = localStorage.getItem("trivia_mode")   || "ai";
let totalQs     = parseInt(localStorage.getItem("trivia_qs") || "10");
let chatStarted = false;
let currentRoomId = null;
let myId    = 1;
let isHost  = false;

let p1Name = SystemUI.getPlayerName();
let p2Name = "AI";

SystemUI.init({
    gameName: "TRIVIA PURSUIT",
    rules: "Answer questions correctly to score points. Harder questions are worth more. Fastest correct answer wins the round in online play!",
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
}, 10);

document.getElementById("sys-trivia-mode").addEventListener("change", e => {
    gameMode = e.target.value;
    localStorage.setItem("trivia_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        SystemUI.stopChat();
        chatStarted = false;
        updateNames();
    }
});

document.getElementById("sys-trivia-qs").addEventListener("change", e => {
    totalQs = parseInt(e.target.value);
    localStorage.setItem("trivia_qs", e.target.value);
});

// ── 2. OPENTDB API ───────────────────────────
/*
 * HOW OPENTDB WORKS:
 *
 * Step 1 — Request a session token:
 *   GET https://opentdb.com/api_token.php?command=request
 *   → Returns { token: "abc123..." }
 *   The token tracks which questions you've seen so you never get a repeat.
 *
 * Step 2 — Fetch questions using that token:
 *   GET https://opentdb.com/api.php?amount=10&token=TOKEN
 *   → Returns { response_code: 0, results: [...] }
 *
 * Response codes:
 *   0 = Success
 *   1 = Not enough questions for query
 *   2 = Invalid parameter
 *   3 = Token not found (reset and retry)
 *   4 = Token exhausted (all questions seen — reset token)
 *
 * Each question object:
 * {
 *   category:          "Science & Nature",
 *   type:              "multiple" | "boolean",
 *   difficulty:        "easy" | "medium" | "hard",
 *   question:          "HTML-encoded question string",
 *   correct_answer:    "HTML-encoded correct answer",
 *   incorrect_answers: ["HTML-encoded wrong", ...]
 * }
 *
 * IMPORTANT: All strings are HTML-encoded (e.g. &amp; &#039; &quot;)
 * so we run every string through decodeHTML() before displaying it.
 */

let sessionToken = localStorage.getItem("trivia_token") || null;

// Decodes HTML entities: &amp; → &, &#039; → ', &quot; → "  etc.
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
        // Non-fatal — we'll fetch without a token
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

async function fetchQuestions(amount) {
    // Build URL — always request a mix of multiple + boolean
    let url = `https://opentdb.com/api.php?amount=${amount}`;
    if (sessionToken) url += `&token=${sessionToken}`;

    const res  = await fetch(url);
    const data = await res.json();

    if (data.response_code === 4) {
        // Token exhausted — reset and retry once
        await resetToken();
        await getSessionToken();
        return fetchQuestions(amount);
    }

    if (data.response_code === 3) {
        // Token not found — get a new one and retry
        sessionToken = null;
        localStorage.removeItem("trivia_token");
        await getSessionToken();
        return fetchQuestions(amount);
    }

    if (data.response_code !== 0) {
        throw new Error(`OpenTDB error code: ${data.response_code}`);
    }

    // Decode all HTML entities and shuffle incorrect answers in with correct
    return data.results.map(q => {
        const correct   = decodeHTML(q.correct_answer);
        const incorrect = q.incorrect_answers.map(decodeHTML);

        // Build shuffled answer array
        let answers;
        if (q.type === "boolean") {
            answers = ["True", "False"];
        } else {
            answers = [...incorrect, correct];
            shuffleArray(answers);
        }

        return {
            category:   decodeHTML(q.category),
            type:       q.type,           // "multiple" | "boolean"
            difficulty: q.difficulty,     // "easy" | "medium" | "hard"
            question:   decodeHTML(q.question),
            correct,
            answers
        };
    });
}

// ── 3. SCORING ───────────────────────────────
/*
 * Points by difficulty:
 *   easy   = 100 pts
 *   medium = 200 pts
 *   hard   = 300 pts
 *
 * Time bonus: up to +100 pts based on how quickly you answered.
 * timeBonus = Math.floor((timeLeft / TIME_LIMIT) * 100)
 *
 * In online mode, only the FIRST correct answer scores.
 * In hotseat mode, each player answers independently.
 * In AI mode, player vs AI takes turns answering the same question.
 */
const POINTS = { easy: 100, medium: 200, hard: 300 };
const TIME_LIMIT = 15; // seconds per question

function calcPoints(difficulty, timeLeft) {
    const base  = POINTS[difficulty] || 100;
    const bonus = Math.floor((timeLeft / TIME_LIMIT) * 100);
    return base + bonus;
}

// ── 4. GAME STATE ────────────────────────────
let questions     = [];   // full question bank for this game
let currentQIndex = 0;    // which question we're on
let scores        = { p1: 0, p2: 0 };
let streaks       = { p1: 0, p2: 0 };
let activePlayer  = 1;    // whose turn it is (hotseat only)
let answered      = false; // has current question been answered?
let timeLeft      = TIME_LIMIT;
let timerInterval = null;
let aiTimer       = null;
let gamePhase     = "idle"; // idle | loading | playing | between | gameover

// Online sync helpers
let onlineAnswerLocked = false; // prevent double-submit online

// ── 5. HELPERS ───────────────────────────────
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function isMyTurn() {
    if (gameMode === "online")  return activePlayer === myId;
    if (gameMode === "hotseat") return true; // both players use same screen
    return activePlayer === 1;
}

function updateNames() {
    if (gameMode === "ai")      p2Name = "AI";
    if (gameMode === "hotseat") p2Name = "PLAYER 2";
    document.getElementById("s-name-1").textContent = p1Name.toUpperCase();
    document.getElementById("s-name-2").textContent = p2Name.toUpperCase();
}

function getPlayerName(id) { return id === 1 ? p1Name : p2Name; }

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
    if (timeLeft <= 5)  bar.classList.add("danger");
    else if (timeLeft <= 8) bar.classList.add("warning");
}

function handleTimeout() {
    if (answered) return;
    answered = true;

    // Reveal correct answer in red (nobody got it)
    revealAnswers(null);
    SystemUI.playSound('lose');

    const q = questions[currentQIndex];
    showNextOverlay(false, q.correct, 0, null);
    if (gameMode === "online") {
        window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
            answeredBy: 0, answeredCorrect: false, timeoutAt: Date.now()
        });
    }
}

// ── 7. RENDER ────────────────────────────────
function renderScores() {
    document.getElementById("s-score-1").textContent = scores.p1;
    document.getElementById("s-score-2").textContent = scores.p2;

    // Streak display
    const streak1 = streaks.p1 >= 2 ? `🔥 ${streaks.p1}x STREAK` : "";
    const streak2 = streaks.p2 >= 2 ? `🔥 ${streaks.p2}x STREAK` : "";
    document.getElementById("s-streak-1").textContent = streak1;
    document.getElementById("s-streak-2").textContent = streak2;

    // Active player highlight (hotseat)
    document.getElementById("s-block-1").classList.toggle("active", gameMode === "hotseat" && activePlayer === 1);
    document.getElementById("s-block-2").classList.toggle("active", gameMode === "hotseat" && activePlayer === 2);
}

function renderQuestion(q) {
    // Question counter
    document.getElementById("q-counter").textContent = `${currentQIndex + 1}/${questions.length}`;

    // Category + difficulty
    document.getElementById("category-badge").textContent = q.category.toUpperCase();
    const diffBadge = document.getElementById("diff-badge");
    diffBadge.textContent = q.difficulty.toUpperCase();
    diffBadge.className   = `diff-${q.difficulty}`;

    // Type tag
    document.getElementById("question-type-tag").textContent =
        q.type === "boolean" ? "TRUE / FALSE" : "MULTIPLE CHOICE";

    // Question text
    document.getElementById("question-text").textContent = q.question;

    // Build answer buttons
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

    // Hide result banner
    document.getElementById("result-banner").classList.add("hidden");
}

function makeAnswerBtn(answer, correct, letter, isTF) {
    const btn = document.createElement("button");
    btn.className  = "ans-btn" + (isTF ? " tf-btn" : "");
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

    // In AI mode auto-advance; in hotseat/online wait for button
    if (gameMode === "ai") {
        document.getElementById("next-btn").classList.remove("hidden");
    } else if (gameMode === "hotseat") {
        // Show whose turn is next
        const nextPlayer = otherPlayer(activePlayer);
        document.getElementById("next-btn").textContent =
            `${getPlayerName(nextPlayer).toUpperCase()}'S TURN →`;
        document.getElementById("next-btn").classList.remove("hidden");
    } else {
        // Online: host drives advancement
        document.getElementById("next-btn").classList.toggle("hidden", !isHost);
        if (!isHost) {
            document.getElementById("next-btn").textContent = "Waiting for host...";
            document.getElementById("next-btn").classList.remove("hidden");
            document.getElementById("next-btn").disabled = true;
            document.getElementById("next-btn").style.opacity = "0.4";
        }
    }
}

// ── 8. GAME FLOW ─────────────────────────────
async function startGame() {
    // Hide start screen, show loader
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("loading-screen").classList.remove("hidden");

    scores    = { p1: 0, p2: 0 };
    streaks   = { p1: 0, p2: 0 };
    currentQIndex  = 0;
    activePlayer   = 1;
    gamePhase      = "loading";
    onlineAnswerLocked = false;

    renderScores();
    updateNames();

    try {
        // Ensure we have a session token before fetching
        if (!sessionToken) await getSessionToken();
        questions = await fetchQuestions(totalQs);
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

    if (gameMode === "online") pushGameState();
    showQuestion(0);
}

function showQuestion(index) {
    if (index >= questions.length) { endGame(); return; }

    currentQIndex      = index;
    answered           = false;
    onlineAnswerLocked = false;
    gamePhase          = "playing";

    const q = questions[index];
    renderQuestion(q);
    renderScores();

    stopTimer();
    startTimer();

    // AI mode: schedule AI's answer
    if (gameMode === "ai") {
        scheduleAiAnswer(q);
    }

    // Hotseat: set active player label
    if (gameMode === "hotseat") {
        const name = getPlayerName(activePlayer).toUpperCase();
        document.getElementById("s-name-1").style.color = activePlayer === 1 ? "var(--teal)" : "";
        document.getElementById("s-name-2").style.color = activePlayer === 2 ? "var(--teal)" : "";
    }

    // Disable inputs for non-active players in hotseat
    if (gameMode === "hotseat") {
        // Both players use same buttons — always enabled
    }

    // Online: disable if not my turn to answer
    if (gameMode === "online" && !isMyTurn()) {
        disableAllAnswers();
    }
}

// ── 9. ANSWER HANDLING ───────────────────────
function handleAnswerClick(answer, btn) {
    if (answered) return;
    if (gameMode === "online" && onlineAnswerLocked) return;

    answered = true;
    stopTimer();

    if (gameMode === "online") {
        onlineAnswerLocked = true;
        submitOnlineAnswer(answer, timeLeft);
        return;
    }

    processAnswer(answer, activePlayer, timeLeft);
}

function processAnswer(answer, player, tLeft) {
    const q       = questions[currentQIndex];
    const correct = answer === q.correct;
    const pts     = correct ? calcPoints(q.difficulty, tLeft) : 0;

    // Update score + streak
    if (correct) {
        if (player === 1) { scores.p1 += pts; streaks.p1++; streaks.p2 = 0; }
        else              { scores.p2 += pts; streaks.p2++; streaks.p1 = 0; }
        SystemUI.playSound('win');
    } else {
        if (player === 1) streaks.p1 = 0;
        else              streaks.p2 = 0;
        SystemUI.playSound('lose');
    }

    renderScores();
    revealAnswers(answer);
    showResultBanner(correct, pts);

    if (gameMode === "hotseat") {
        // In hotseat, BOTH players answer the same question independently
        // P1 answers first, then P2, then we move on
        if (player === 1) {
            // Disable so P1 can't change their answer, then set up for P2
            disableAllAnswers();
            activePlayer = 2;
            setTimeout(() => {
                // Re-enable for P2
                resetAnswerButtons();
                renderScores();
                document.getElementById("s-name-1").style.color = "";
                document.getElementById("s-name-2").style.color = "var(--teal)";
                startTimer();
                answered = false;
                // Re-schedule listening for P2
            }, 1200);
            return;
        }
        // P2 just answered — show next overlay
        activePlayer = 1;
    }

    setTimeout(() => {
        showNextOverlay(correct, q.correct, pts, correct ? player : null);
    }, 1000);
}

function resetAnswerButtons() {
    const q    = questions[currentQIndex];
    const btns = document.querySelectorAll(".ans-btn");
    btns.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove("correct", "wrong");
    });
}

// ── 10. AI BRAIN ──────────────────────────────
/*
 * AI difficulty tiers by question difficulty:
 *   easy:   88% correct
 *   medium: 68% correct
 *   hard:   45% correct
 *
 * AI response time is randomised to feel human:
 *   1.5s – 4.5s per question (slower = more suspense)
 */
const AI_ACCURACY = { easy: 0.88, medium: 0.68, hard: 0.45 };

function scheduleAiAnswer(q) {
    if (aiTimer) clearTimeout(aiTimer);
    const delay    = 1500 + Math.random() * 3000;
    const accuracy = AI_ACCURACY[q.difficulty] || 0.65;

    aiTimer = setTimeout(() => {
        if (answered || gamePhase !== "playing") return;

        const aiCorrect  = Math.random() < accuracy;
        const aiAnswer   = aiCorrect
            ? q.correct
            : q.answers.filter(a => a !== q.correct)[
                Math.floor(Math.random() * (q.answers.length - 1))
              ];

        const aiTimeLeft = timeLeft; // capture remaining time when AI "answers"

        answered = true;
        stopTimer();

        const pts = aiCorrect ? calcPoints(q.difficulty, aiTimeLeft) : 0;
        if (aiCorrect) { scores.p2 += pts; streaks.p2++; streaks.p1 = 0; SystemUI.playSound('lose'); }
        else           { streaks.p2 = 0;                                  SystemUI.playSound('win'); }

        renderScores();
        revealAnswers(aiAnswer);
        showResultBanner(!aiCorrect, 0); // show from P1's perspective (false = you survived)

        setTimeout(() => {
            showNextOverlay(aiCorrect, q.correct, pts, aiCorrect ? 2 : null);
        }, 1000);

    }, delay);
}

// ── 11. NEXT QUESTION LOGIC ──────────────────
document.getElementById("next-btn").addEventListener("click", () => {
    advanceToNextQuestion();
    if (gameMode === "online") {
        window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
            questionIndex: currentQIndex + 1,
            advancedAt: Date.now()
        });
    }
});

function advanceToNextQuestion() {
    document.getElementById("next-overlay").classList.add("hidden");
    document.getElementById("next-btn").disabled    = false;
    document.getElementById("next-btn").style.opacity = "";
    document.getElementById("next-btn").textContent = "NEXT QUESTION →";

    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }

    const nextIndex = currentQIndex + 1;
    if (nextIndex >= questions.length) {
        endGame();
    } else {
        showQuestion(nextIndex);
    }
}

// ── 12. GAME OVER ────────────────────────────
function endGame() {
    gamePhase = "gameover";
    stopTimer();
    if (aiTimer) clearTimeout(aiTimer);

    const winner = scores.p1 > scores.p2 ? 1 : scores.p2 > scores.p1 ? 2 : 0;
    const wName  = winner === 0 ? "TIE GAME" : `${getPlayerName(winner).toUpperCase()} WINS!`;

    document.getElementById("game-over-emoji").textContent   = winner === 0 ? "🤝" : "🏆";
    document.getElementById("game-over-title").textContent   = wName;
    document.getElementById("game-over-msg").textContent     =
        `${p1Name}: ${scores.p1} pts  —  ${p2Name}: ${scores.p2} pts`;

    // Accuracy breakdown
    document.getElementById("game-over-breakdown").innerHTML =
        `${questions.length} questions answered<br>` +
        `Best streak: 🔥 P1 ×${streaks.p1} | P2 ×${streaks.p2}`;

    document.getElementById("game-over-modal").classList.remove("hidden");
    SystemUI.playSound(winner === 1 ? 'win' : 'lose');

    if (gameMode === "online") {
        window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
            status: "finished", winner: wName
        });
    }
}

// ── 13. HELPER ───────────────────────────────
function otherPlayer(id) { return id === 1 ? 2 : 1; }

// ── 14. BUTTON LISTENERS ─────────────────────
document.getElementById("start-btn").addEventListener("click", () => {
    if (gameMode === "online" && !isHost) return;
    startGame();
});

document.getElementById("btn-play-again").addEventListener("click", () => {
    document.getElementById("game-over-modal").classList.add("hidden");
    document.getElementById("next-overlay").classList.add("hidden");
    scores  = { p1: 0, p2: 0 };
    streaks = { p1: 0, p2: 0 };
    renderScores();

    if (gameMode === "ai" || gameMode === "hotseat") {
        startGame();
    } else {
        // Online: host restarts
        if (isHost) {
            startGame();
        } else {
            document.getElementById("start-screen").classList.remove("hidden");
            document.getElementById("start-btn").textContent = "Waiting for host...";
            document.getElementById("start-btn").disabled    = true;
        }
    }
});

// ── 15. FIREBASE ONLINE ──────────────────────
const lobbyUI = document.getElementById("multiplayer-lobby");

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

document.getElementById("btn-create-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    currentRoomId = generateRoomCode();
    isHost = true; myId = 1; chatStarted = false;

    window.dbSet(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
        status: "waiting", players: 1, p1Name: p1Name, phase: "idle", questionIndex: 0
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        document.getElementById("btn-create-room").disabled = true;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = document.getElementById("join-room-input").value.toUpperCase().trim();
    if (code.length !== 4) { document.getElementById("lobby-error-msg").textContent = "Code must be 4 characters."; return; }

    window.dbGet(window.dbChild(window.dbRef(window.db), `trivia_rooms/${code}`)).then(snapshot => {
        if (snapshot.exists() && snapshot.val().players === 1) {
            currentRoomId = code; isHost = false; myId = 2; chatStarted = false;
            window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
                players: 2, p2Name: p1Name, status: "playing"
            });
            lobbyUI.classList.add("hidden");
            listenToRoom();
        } else {
            document.getElementById("lobby-error-msg").textContent = "Room not found or already full.";
        }
    });
});

function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            lobbyUI.classList.add("hidden");
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            p2Name = myId === 1 ? (data.p2Name || "Opponent") : (data.p1Name || "Opponent");
            updateNames();

            if (isHost) {
                startGame();
            } else {
                // Guest shows loading screen — waits for host's question push
                document.getElementById("start-screen").classList.add("hidden");
                document.getElementById("loading-screen").classList.remove("hidden");
                document.getElementById("loading-text").textContent = "WAITING FOR HOST...";
                document.getElementById("loading-sub").textContent  = "Game starts soon";
            }
            return;
        }

        if (onlineGameStarted) syncFromFirebase(data);
    });
}

function pushGameState() {
    if (gameMode !== "online" || !currentRoomId) return;

    // Host pushes the full question bank (serialized) + current state
    const payload = {
        phase:         gamePhase,
        questionIndex: currentQIndex,
        scores:        scores,
        streaks:       streaks,
        status:        gamePhase === "gameover" ? "finished" : "playing"
    };

    // Only host pushes questions (guest doesn't have them yet initially)
    if (isHost && questions.length > 0) {
        payload.questions = JSON.stringify(questions);
    }

    window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), payload);
}

function submitOnlineAnswer(answer, tLeft) {
    // Both players write their answer — host resolves
    const field = myId === 1 ? "p1Answer" : "p2Answer";
    window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
        [field]: answer,
        [`${field}Time`]: tLeft
    });
}

function syncFromFirebase(data) {
    if (!data) return;

    // Receive question bank from host
    if (data.questions && questions.length === 0) {
        try {
            questions = JSON.parse(data.questions);
            document.getElementById("loading-screen").classList.add("hidden");
            gamePhase = "playing";
        } catch(e) { console.error("Failed to parse questions:", e); return; }
    }

    // Sync scores
    if (data.scores) {
        scores = data.scores;
        renderScores();
    }

    // Advance to new question
    if (data.questionIndex !== undefined &&
        data.questionIndex !== currentQIndex &&
        data.phase === "playing" &&
        questions.length > 0) {

        document.getElementById("next-overlay").classList.add("hidden");
        onlineAnswerLocked = false;
        answered = false;
        showQuestion(data.questionIndex);
        return;
    }

    // Handle answer resolution (host resolves both players' answers)
    if (isHost && data.p1Answer && data.p2Answer && !answered) {
        answered = true;
        stopTimer();

        const q       = questions[currentQIndex];
        const p1Cor   = data.p1Answer === q.correct;
        const p2Cor   = data.p2Answer === q.correct;

        // Whoever answered correctly first (higher timeLeft) scores
        let scorer = null;
        if (p1Cor && p2Cor) {
            scorer = (data.p1AnswerTime || 0) >= (data.p2AnswerTime || 0) ? 1 : 2;
        } else if (p1Cor) { scorer = 1; }
        else if (p2Cor)   { scorer = 2; }

        const pts = scorer ? calcPoints(q.difficulty, data[`p${scorer}AnswerTime`] || 0) : 0;
        if (scorer === 1) { scores.p1 += pts; streaks.p1++; streaks.p2 = 0; }
        else if (scorer === 2) { scores.p2 += pts; streaks.p2++; streaks.p1 = 0; }
        else { streaks.p1 = 0; streaks.p2 = 0; }

        // Push resolved state
        window.dbUpdate(window.dbRef(window.db, 'trivia_rooms/' + currentRoomId), {
            resolvedCorrect: !!(scorer),
            resolvedScorer:  scorer || 0,
            resolvedPts:     pts,
            resolvedAnswer:  data[scorer === 1 ? "p1Answer" : "p2Answer"] || "",
            scores:          scores,
            streaks:         streaks,
            p1Answer:        null,
            p2Answer:        null,
        });

        revealAnswers(myId === 1 ? data.p1Answer : data.p2Answer);
        showResultBanner(myId === scorer, pts);
        renderScores();
        setTimeout(() => showNextOverlay(!!(scorer), q.correct, pts, scorer), 1000);
    }

    // Guest: wait for host to push resolved state
    if (!isHost && data.resolvedScorer !== undefined && data.resolvedScorer !== null && !answered) {
        answered = true;
        stopTimer();

        const q     = questions[currentQIndex];
        const myAns = myId === 1 ? data.p1Answer : data.p2Answer;
        scores  = data.scores  || scores;
        streaks = data.streaks || streaks;
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

document.getElementById("lobby-close-btn").addEventListener("click", () => lobbyUI.classList.add("hidden"));
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    gameMode = "ai"; p2Name = "AI";
    document.getElementById("sys-trivia-mode").value = "ai";
    localStorage.setItem("trivia_mode", "ai");
    lobbyUI.classList.add("hidden");
    SystemUI.stopChat(); chatStarted = false;
    updateNames();
});

// ── BOOT ─────────────────────────────────────
updateNames();