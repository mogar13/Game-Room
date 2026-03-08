// ==========================================
// 1. INITIALIZE OS & STATE
// ==========================================
let gameMode = localStorage.getItem("mem_mode") || "ai";
let gridDifficulty = localStorage.getItem("mem_diff") || "normal";
let aiDifficulty = localStorage.getItem("mem_ai_diff") || "adaptive";
let myId = 1;
let currentRoomId = null;
let isHost = false;
let chatStarted = false;
let roomListenerUnsub = null;

SystemUI.init({
    gameName: "MEMORY MATCH",
    rules: `
        <ul style="text-align: left; line-height: 1.6; font-size: 0.95rem; color: #ddd; padding-left: 20px;">
            <li><strong>Flip cards</strong> to find matching pairs.</li>
            <li><strong>Find a match</strong> and you go again!</li>
            <li><strong>Most pairs</strong> at the end wins.</li>
            <li>Higher difficulties cost more but pay out more.</li>
        </ul>
    `,
    hudDropdowns: [
        {
            id: "sys-mem-mode",
            label: "Mode",
            options: [
                { value: "ai",     label: "🤖 vs AI" },
                { value: "local",  label: "👥 Hotseat" },
                { value: "online", label: "🌐 Online" }
            ]
        },
        {
            id: "sys-diff-select",
            label: "Grid",
            options: [
                { value: "easy",   label: "Easy" },
                { value: "normal", label: "Normal" },
                { value: "hard",   label: "Hard" }
            ]
        }
    ],
    customToggles: `
        <div class="settings-group" style="text-align:left;">
            <div id="ai-diff-wrapper">
                <label style="display:block; margin-bottom:5px; color:#bdc3c7;">AI Difficulty:</label>
                <select id="sys-ai-diff" style="width:100%; padding:10px; border-radius:5px; border:1px solid #34495e; background:#2c3e50; color:white;">
                    <option value="adaptive">Adaptive (~60% memory)</option>
                    <option value="hard">Hard (perfect memory)</option>
                </select>
            </div>
        </div>
    `
});

// Sync selects to saved state.
// Use setTimeout(10) so this runs AFTER system_ui.js's setTimeout(0) forces
// mode dropdowns to 'ai' — otherwise gameMode stays stale from localStorage.
setTimeout(() => {
    gameMode = document.getElementById("sys-mem-mode").value;
    localStorage.setItem("mem_mode", gameMode);
    document.getElementById("sys-diff-select").value = gridDifficulty;
    document.getElementById("sys-ai-diff").value = aiDifficulty;
    updateAiDiffVisibility();
    updateBuyInBtn();
    updatePlayerLabels();
}, 10);

document.getElementById("sys-mem-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("mem_mode", gameMode);
    updateAiDiffVisibility();
    updatePlayerLabels();
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        SystemUI.stopChat();
        chatStarted = false;
    }
});

document.getElementById("sys-diff-select").addEventListener("change", (e) => {
    gridDifficulty = e.target.value;
    localStorage.setItem("mem_diff", gridDifficulty);
    updateBuyInBtn();
});

document.getElementById("sys-ai-diff").addEventListener("change", (e) => {
    aiDifficulty = e.target.value;
    localStorage.setItem("mem_ai_diff", aiDifficulty);
});

function updateAiDiffVisibility() {
    document.getElementById("ai-diff-wrapper").style.display = gameMode === "ai" ? "block" : "none";
}

function updateBuyInBtn() {
    const costs = { easy: 50, normal: 100, hard: 250 };
    document.getElementById("start-game-btn").innerText = `BUY IN ($${costs[gridDifficulty]})`;
}

function updatePlayerLabels() {
    if (gameMode === "ai") {
        document.getElementById("p1-label").innerText = "You";
        document.getElementById("p2-label").innerText = "AI";
    } else if (gameMode === "local") {
        document.getElementById("p1-label").innerText = "P1";
        document.getElementById("p2-label").innerText = "P2";
    } else {
        document.getElementById("p1-label").innerText = myId === 1 ? "You" : "P1";
        document.getElementById("p2-label").innerText = myId === 2 ? "You" : "P2";
    }
}

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if (confirm("Reset the current game?")) {
        resetGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});

// ==========================================
// 2. FIREBASE MULTIPLAYER LOBBY
// ==========================================
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
    isHost = true;
    myId = 1;
    chatStarted = false;

    const cardSet = buildCardSet();
    window.dbSet(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), {
        cards: cardSet,
        matched: Array(cardSet.length).fill(false),
        turn: 1,
        score1: 0,
        score2: 0,
        flip1: -1,
        flip2: -1,
        flipStage: 0,
        players: 1,
        status: "waiting",
        gridDifficulty: gridDifficulty
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        document.getElementById("btn-create-room").disabled = true;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = document.getElementById("join-room-input").value.toUpperCase();
    if (code.length !== 4) { document.getElementById("lobby-error-msg").innerText = "Code must be 4 characters."; return; }

    window.dbGet(window.dbChild(window.dbRef(window.db), `memory_rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.players === 1) {
                currentRoomId = code;
                isHost = false;
                myId = 2;
                chatStarted = false;
                gridDifficulty = data.gridDifficulty || "normal";
                window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), {
                    players: 2, status: "playing"
                });
                lobbyUI.classList.add("hidden");
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
                listenToRoom();
            } else {
                document.getElementById("lobby-error-msg").innerText = "Room is full!";
            }
        } else {
            document.getElementById("lobby-error-msg").innerText = "Room not found.";
        }
    });
});

function listenToRoom() {
    if (roomListenerUnsub) { roomListenerUnsub(); roomListenerUnsub = null; }
    let onlineGameStarted = false;
    roomListenerUnsub = window.dbOnValue(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            lobbyUI.classList.add("hidden");
            SystemUI.playSound('shuffle');

            if (!chatStarted) {
                chatStarted = true;
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }

            startOnlineGame(data);
            return;
        }

        if (gameState !== "playing") return;

        syncOnlineState(data);
    });
}

// Handle OS lobby escapes
document.getElementById("lobby-close-btn").addEventListener("click", () => {
    SystemUI.playSound('click');
    lobbyUI.classList.add("hidden");
});
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    SystemUI.playSound('click');
    gameMode = "ai";
    document.getElementById("sys-mem-mode").value = "ai";
    localStorage.setItem("mem_mode", "ai");
    lobbyUI.classList.add("hidden");
    updateAiDiffVisibility();
    updatePlayerLabels();
    SystemUI.stopChat();
    chatStarted = false;
});

// ==========================================
// 3. CORE GAME STATE
// ==========================================
let cards = [];           // Array of icon numbers in board order
let matched = [];         // Boolean array — which cards are matched
let firstIdx = -1;        // Index of first flipped card
let secondIdx = -1;       // Index of second flipped card
let isLocking = false;
let moves = 0;
let scores = [0, 0];      // [p1score, p2score]
let currentTurn = 1;      // 1 or 2
let gameState = "idle";   // "idle" | "playing"

// AI memory bank: index → icon value (only filled when AI has "seen" a card)
let aiMemory = {};

const GRID_CONFIGS = {
    easy:   { pairs: 4,  cols: "easy",   cost: 50,  payout: 100  },
    normal: { pairs: 8,  cols: "normal", cost: 100, payout: 300  },
    hard:   { pairs: 18, cols: "hard",   cost: 250, payout: 1000 }
};

// ==========================================
// 4. TOAST MODAL
// ==========================================
let modalTimer;
function showToast(title, message) {
    document.getElementById("modal-title").innerText = title;
    document.getElementById("modal-message").innerText = message;
    const overlay = document.getElementById("toast-modal");
    overlay.classList.remove("hidden");
    clearTimeout(modalTimer);
    modalTimer = setTimeout(() => overlay.classList.add("hidden"), 3500);
}
document.getElementById("toast-modal").addEventListener("click", () => {
    document.getElementById("toast-modal").classList.add("hidden");
});

// ==========================================
// 5. BOARD BUILDING
// ==========================================
function buildCardSet() {
    const config = GRID_CONFIGS[gridDifficulty];
    let icons = Array.from({ length: 18 }, (_, i) => i + 1);
    icons.sort(() => Math.random() - 0.5);
    let gameIcons = icons.slice(0, config.pairs);
    let set = [...gameIcons, ...gameIcons];
    set.sort(() => Math.random() - 0.5);
    return set;
}

function renderGrid(cardSet) {
    const config = GRID_CONFIGS[gridDifficulty];
    const grid = document.getElementById("memory-grid");
    grid.innerHTML = "";
    grid.className = config.cols;

    cardSet.forEach((iconNum, idx) => {
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.idx = idx;
        card.innerHTML = `
            <div class="card-face card-front"></div>
            <div class="card-face card-back"><img src="../../system/images/icons/icon${iconNum}.png"></div>
        `;
        card.addEventListener("click", () => handleCardClick(idx));
        grid.appendChild(card);
    });
}

function getCardEl(idx) {
    return document.querySelector(`.card[data-idx="${idx}"]`);
}

function flipCardVisual(idx, faceUp) {
    const el = getCardEl(idx);
    if (!el) return;
    if (faceUp) el.classList.add("flipped");
    else el.classList.remove("flipped");
}

function markMatched(idx) {
    const el = getCardEl(idx);
    if (el) el.classList.add("matched");
}

// ==========================================
// 6. GAME INIT
// ==========================================
function initGame() {
    const config = GRID_CONFIGS[gridDifficulty];

    // Online mode: host pushes fresh state to Firebase; joiner just re-listens
    if (gameMode === "online") {
        if (isHost) {
            if (SystemUI.money < config.cost) {
                showToast("Insufficient Funds", "You don't have enough cash!");
                return;
            }
            SystemUI.money -= config.cost;
            SystemUI.updateMoneyDisplay();
            SystemUI.playSound('shuffle');
            const cardSet = buildCardSet();
            window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), {
                cards: cardSet,
                matched: Array(cardSet.length).fill(false),
                turn: 1,
                score1: 0,
                score2: 0,
                flip1: -1,
                flip2: -1,
                flipStage: 0,
                status: "playing",
                gridDifficulty: gridDifficulty
            });
        }
        // Both host and joiner: reset local state and re-listen
        scores = [0, 0];
        moves = 0;
        firstIdx = -1;
        secondIdx = -1;
        isLocking = false;
        gameState = "idle"; // startOnlineGame will set it to playing
        document.getElementById("start-game-btn").classList.add("hidden");
        listenToRoom();
        return;
    }

    if (SystemUI.money < config.cost) {
        showToast("Insufficient Funds", "You don't have enough cash!");
        return;
    }

    SystemUI.money -= config.cost;
    SystemUI.updateMoneyDisplay();
    SystemUI.playSound('shuffle');

    cards = buildCardSet();
    matched = Array(cards.length).fill(false);
    scores = [0, 0];
    moves = 0;
    firstIdx = -1;
    secondIdx = -1;
    isLocking = false;
    currentTurn = 1;
    gameState = "playing";
    aiMemory = {};

    renderGrid(cards);
    updateScoreUI();
    updateTurnBanner();
    document.getElementById("start-game-btn").classList.add("hidden");
}

function resetGame() {
    gameState = "idle";
    cards = [];
    matched = [];
    scores = [0, 0];
    moves = 0;
    firstIdx = -1;
    secondIdx = -1;
    isLocking = false;
    currentTurn = 1;
    aiMemory = {};

    document.getElementById("memory-grid").innerHTML = "";
    document.getElementById("turn-banner").classList.add("hidden");
    document.getElementById("start-game-btn").classList.remove("hidden");
    updateBuyInBtn();
    updateScoreUI();
}

// ==========================================
// 7. CARD CLICK HANDLER
// ==========================================
function handleCardClick(idx) {
    if (gameState !== "playing" || isLocking) return;
    if (matched[idx]) return;
    if (idx === firstIdx) return;
    // In online mode, only act on your turn
    if (gameMode === "online" && currentTurn !== myId) return;
    // In AI mode, only act on player 1's turn
    if (gameMode === "ai" && currentTurn === 2) return;

    SystemUI.playSound('card');

    if (firstIdx === -1) {
        firstIdx = idx;
        flipCardVisual(idx, true);

        if (gameMode === "online") {
            window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), {
                flip1: idx, flipStage: 1
            });
        }
    } else {
        secondIdx = idx;
        flipCardVisual(idx, true);
        moves++;
        document.getElementById("move-count").innerText = moves;

        if (gameMode === "online") {
            window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), {
                flip2: idx, flipStage: 2
            });
        } else {
            isLocking = true;
            setTimeout(() => resolveMatch(firstIdx, secondIdx), 800);
        }
    }
}

// ==========================================
// 8. MATCH RESOLUTION
// ==========================================
function resolveMatch(i1, i2) {
    // Let AI "see" these cards in adaptive/hard mode
    if (gameMode === "ai") {
        rememberCard(i1, cards[i1]);
        rememberCard(i2, cards[i2]);
    }

    if (cards[i1] === cards[i2]) {
        // Match!
        matched[i1] = true;
        matched[i2] = true;
        markMatched(i1);
        markMatched(i2);
        scores[currentTurn - 1]++;
        SystemUI.playSound('win');
        updateScoreUI();

        firstIdx = -1;
        secondIdx = -1;
        isLocking = false;

        if (matched.every(m => m)) {
            endGame();
            return;
        }
        // Same player goes again
        updateTurnBanner();
        if (gameMode === "ai" && currentTurn === 2) {
            setTimeout(aiTakeTurn, 900);
        }
    } else {
        // No match — flip back
        SystemUI.playSound('click');
        setTimeout(() => {
            flipCardVisual(i1, false);
            flipCardVisual(i2, false);
            firstIdx = -1;
            secondIdx = -1;
            isLocking = false;

            // Switch turn
            currentTurn = currentTurn === 1 ? 2 : 1;
            updateTurnBanner();

            if (gameMode === "ai" && currentTurn === 2) {
                setTimeout(aiTakeTurn, 700);
            }
        }, 600);
    }
}

// ==========================================
// 9. AI LOGIC
// ==========================================
function rememberCard(idx, value) {
    if (aiDifficulty === "hard") {
        aiMemory[idx] = value; // Perfect memory
    } else {
        // Adaptive: ~60% chance to remember each card seen
        if (Math.random() < 0.6) {
            aiMemory[idx] = value;
        }
    }
}

function aiTakeTurn() {
    if (gameState !== "playing") return;

    const available = matched.map((m, i) => m ? null : i).filter(i => i !== null);
    if (available.length === 0) return;

    let pick1 = -1;
    let pick2 = -1;

    // Check if AI knows a matching pair in memory
    const knownIndices = Object.keys(aiMemory).map(Number).filter(i => !matched[i]);
    for (let i = 0; i < knownIndices.length; i++) {
        for (let j = i + 1; j < knownIndices.length; j++) {
            const a = knownIndices[i];
            const b = knownIndices[j];
            if (aiMemory[a] === aiMemory[b]) {
                pick1 = a;
                pick2 = b;
                break;
            }
        }
        if (pick1 !== -1) break;
    }

    // If no known pair, pick random unmatched cards
    if (pick1 === -1) {
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        pick1 = shuffled[0];
        // Try to find a known match for pick1 from memory
        const knownMatch = knownIndices.find(i => i !== pick1 && !matched[i] && aiMemory[i] === cards[pick1]);
        pick2 = knownMatch !== undefined ? knownMatch : shuffled[1];
    }

    // Flip first card
    isLocking = true;
    firstIdx = pick1;
    flipCardVisual(pick1, true);
    rememberCard(pick1, cards[pick1]);

    setTimeout(() => {
        secondIdx = pick2;
        flipCardVisual(pick2, true);
        rememberCard(pick2, cards[pick2]);
        moves++;
        document.getElementById("move-count").innerText = moves;
        setTimeout(() => resolveMatch(pick1, pick2), 800);
    }, 700);
}

// ==========================================
// 10. ONLINE SYNC
// ==========================================
function startOnlineGame(data) {
    gridDifficulty = data.gridDifficulty || "normal";
    cards = data.cards || [];
    matched = data.matched || Array(cards.length).fill(false);
    scores = [data.score1 || 0, data.score2 || 0];
    currentTurn = data.turn || 1;
    gameState = "playing";
    moves = 0;

    renderGrid(cards);
    updateScoreUI();
    updateTurnBanner();
    document.getElementById("start-game-btn").classList.add("hidden");

    // Re-mark any already matched cards
    matched.forEach((m, i) => { if (m) markMatched(i); });
}

function syncOnlineState(data) {
    if (!data || gameState !== "playing") return;

    const prevMatched = [...matched];
    matched = data.matched || matched;
    cards = data.cards || cards;
    scores = [data.score1 || 0, data.score2 || 0];
    const prevTurn = currentTurn;
    currentTurn = data.turn || 1;

    // Mark any newly matched cards
    matched.forEach((m, i) => {
        if (m && !prevMatched[i]) {
            markMatched(i);
            SystemUI.playSound('win');
        }
    });

    updateScoreUI();

    const stage = data.flipStage || 0;
    const f1 = data.flip1 !== undefined ? data.flip1 : -1;
    const f2 = data.flip2 !== undefined ? data.flip2 : -1;

    if (stage === 1 && f1 !== -1) {
        flipCardVisual(f1, true);
        firstIdx = f1;
    }

    if (stage === 2 && f1 !== -1 && f2 !== -1 && !isLocking) {
        flipCardVisual(f2, true);
        firstIdx = f1;
        secondIdx = f2;
        isLocking = true;

        setTimeout(() => {
            const isMatch = cards[f1] === cards[f2];
            if (!isMatch) {
                flipCardVisual(f1, false);
                flipCardVisual(f2, false);
                SystemUI.playSound('click');
            }
            firstIdx = -1;
            secondIdx = -1;
            isLocking = false;

            // Host writes the resolution back to Firebase
            if (isHost) {
                const newMatched = [...matched];
                if (isMatch) {
                    newMatched[f1] = true;
                    newMatched[f2] = true;
                }
                const scorer = data.turn; // who just played
                const newScore1 = scorer === 1 ? (data.score1 || 0) + (isMatch ? 1 : 0) : (data.score1 || 0);
                const newScore2 = scorer === 2 ? (data.score2 || 0) + (isMatch ? 1 : 0) : (data.score2 || 0);
                const nextTurn = isMatch ? scorer : (scorer === 1 ? 2 : 1);

                window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), {
                    matched: newMatched,
                    score1: newScore1,
                    score2: newScore2,
                    turn: nextTurn,
                    flip1: -1,
                    flip2: -1,
                    flipStage: 0
                });
            }

            if (matched.every(m => m)) endGame();
            updateTurnBanner();
        }, 800);
    }

    moves++;
    document.getElementById("move-count").innerText = moves;
    updateTurnBanner();

    if (matched.every(m => m)) endGame();
}

// ==========================================
// 11. UI HELPERS
// ==========================================
function updateScoreUI() {
    document.getElementById("p1-score").innerText = scores[0];
    document.getElementById("p2-score").innerText = scores[1];

    // Highlight active player
    document.getElementById("p1-stat").classList.toggle("active-turn", currentTurn === 1);
    document.getElementById("p2-stat").classList.toggle("active-turn", currentTurn === 2);
}

function updateTurnBanner() {
    const banner = document.getElementById("turn-banner");
    if (gameState !== "playing") { banner.classList.add("hidden"); return; }
    banner.classList.remove("hidden");

    if (gameMode === "online") {
        banner.innerText = currentTurn === myId ? "⭐ Your Turn!" : "Opponent's Turn...";
        banner.style.color = currentTurn === myId ? "#f1c40f" : "#3498db";
    } else if (gameMode === "ai") {
        banner.innerText = currentTurn === 1 ? "⭐ Your Turn!" : "🤖 AI Thinking...";
        banner.style.color = currentTurn === 1 ? "#f1c40f" : "#3498db";
    } else {
        banner.innerText = currentTurn === 1 ? "⭐ Player 1's Turn" : "⭐ Player 2's Turn";
        banner.style.color = currentTurn === 1 ? "#f1c40f" : "#e74c3c";
    }
}

// ==========================================
// 12. END GAME
// ==========================================
function endGame() {
    gameState = "idle";
    document.getElementById("turn-banner").classList.add("hidden");

    const config = GRID_CONFIGS[gridDifficulty];
    let title, message;

    if (gameMode === "ai") {
        if (scores[0] > scores[1]) {
            SystemUI.money += config.payout;
            SystemUI.updateMoneyDisplay();
            SystemUI.playSound('win');
            title = "You Win!";
            message = `You beat the AI ${scores[0]}-${scores[1]}! Won $${config.payout}!`;
        } else if (scores[1] > scores[0]) {
            SystemUI.playSound('lose');
            title = "AI Wins!";
            message = `AI beat you ${scores[1]}-${scores[0]}. Better luck next time!`;
        } else {
            SystemUI.money += Math.floor(config.cost / 2);
            SystemUI.updateMoneyDisplay();
            SystemUI.playSound('tie');
            title = "It's a Tie!";
            message = `Tied ${scores[0]}-${scores[1]}. Half your buy-in returned.`;
        }
    } else if (gameMode === "local") {
        if (scores[0] > scores[1]) {
            SystemUI.playSound('win');
            title = "Player 1 Wins!";
            message = `P1 wins ${scores[0]}-${scores[1]}!`;
        } else if (scores[1] > scores[0]) {
            SystemUI.playSound('win');
            title = "Player 2 Wins!";
            message = `P2 wins ${scores[1]}-${scores[0]}!`;
        } else {
            SystemUI.playSound('tie');
            title = "It's a Tie!";
            message = `Tied ${scores[0]}-${scores[1]}!`;
        }
    } else {
        // Online
        const iWon = (myId === 1 && scores[0] > scores[1]) || (myId === 2 && scores[1] > scores[0]);
        const isTie = scores[0] === scores[1];
        SystemUI.playSound(isTie ? 'tie' : iWon ? 'win' : 'lose');
        title = isTie ? "It's a Tie!" : iWon ? "You Win!" : "Opponent Wins!";
        message = `Final score: ${scores[0]}-${scores[1]}`;
    }

    showToast(title, message);
    setTimeout(() => {
        document.getElementById("start-game-btn").classList.remove("hidden");
        updateBuyInBtn();
    }, 3600);
}

// ==========================================
// 13. KICKSTART
// ==========================================
document.getElementById("start-game-btn").addEventListener("click", initGame);
updatePlayerLabels();
updateScoreUI();