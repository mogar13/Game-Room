// ==========================================
// 1. INITIALIZE OS & STATE (V2 Engine)
// ==========================================
let gameMode = "ai"; 
localStorage.setItem("mem_mode", "ai");

let gridDifficulty = localStorage.getItem("mem_diff") || "normal";
let aiDifficulty = localStorage.getItem("mem_ai_diff") || "adaptive";
let myId = 1;
let currentRoomId = null;
let isHost = true;
let chatStarted = false;
let seats = [];
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
                    <option value="easy">Easy (Random)</option>
                    <option value="adaptive">Normal (~60% memory)</option>
                    <option value="hard">Hard (perfect memory)</option>
                </select>
            </div>
        </div>
    `
});

setTimeout(() => {
    const modeEl = document.getElementById("sys-mem-mode");
    const diffEl = document.getElementById("sys-diff-select");
    const aiEl = document.getElementById("sys-ai-diff");

    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", (e) => {
            gameMode = e.target.value;
            localStorage.setItem("mem_mode", gameMode);
            document.getElementById("sys-modal")?.classList.add("sys-hidden");
            updateAiDiffVisibility();
            updatePlayerLabels();
            
            if (gameMode === "online") {
                SystemUI.v2Lobby.show();
            } else {
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat();
                chatStarted = false;
                myId = 1;
                isHost = true;
                if (roomListenerUnsub) { roomListenerUnsub(); roomListenerUnsub = null; }
                resetGame();
            }
        });
    }

    if (diffEl) {
        diffEl.value = gridDifficulty;
        diffEl.addEventListener("change", (e) => {
            gridDifficulty = e.target.value;
            localStorage.setItem("mem_diff", gridDifficulty);
            updateBuyInBtn();
        });
    }

    if (aiEl) {
        aiEl.value = aiDifficulty;
        aiEl.addEventListener("change", (e) => {
            aiDifficulty = e.target.value;
            localStorage.setItem("mem_ai_diff", aiDifficulty);
        });
    }

    updateAiDiffVisibility();
    updateBuyInBtn();
    updatePlayerLabels();
}, 100);

function updateAiDiffVisibility() {
    const wrapper = document.getElementById("ai-diff-wrapper");
    if(wrapper) wrapper.style.display = gameMode === "ai" ? "block" : "none";
}

function updateBuyInBtn() {
    const costs = { easy: 50, normal: 100, hard: 250 };
    const btn = document.getElementById("start-game-btn");
    if(btn) btn.innerText = `BUY IN ($${costs[gridDifficulty]})`;
}

function updatePlayerLabels() {
    const p1 = document.getElementById("p1-label");
    const p2 = document.getElementById("p2-label");
    if (!p1 || !p2) return;

    if (gameMode === "ai") {
        p1.innerText = "You";
        p2.innerText = "AI";
    } else if (gameMode === "local") {
        p1.innerText = "P1";
        p2.innerText = "P2";
    } else {
        p1.innerText = myId === 1 ? "You" : (seats[0]?.name || "P1");
        p2.innerText = myId === 2 ? "You" : (seats[1]?.name || "P2");
    }
}

document.getElementById("sys-reset-game-btn")?.addEventListener("click", () => {
    if (confirm("Reset the current game?")) {
        resetGame();
        document.getElementById("sys-modal")?.classList.add("sys-hidden");
    }
});

// ==========================================
// 2. V2 MULTIPLAYER LOBBY
// ==========================================
SystemMatch.setup({
    gameId:   "memory",
    roomPath: "memory_rooms",
    autoShow: false,
    buildSeats: () => [
        { type: "human", name: SystemUI.getPlayerName() },
        { type: "ai",    name: "AI (" + aiDifficulty + ")" }
    ],
    extraRoomFields: () => {
        const cardSet = buildCardSet();
        return {
            cards:          cardSet,
            matched:        Array(cardSet.length).fill(false),
            turn:           1,
            score1:         0,
            score2:         0,
            flip1:          -1,
            flip2:          -1,
            flipStage:      0,
            gridDifficulty: gridDifficulty
        };
    },
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1; chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; myId = 2; chatStarted = false;
        seats = SystemMatch.getSeats();
        // Memory auto-starts on join.
        if (window.db && window.dbUpdate) {
            window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + roomId), { status: "playing" });
        }
        listenToRoom();
    },
    onLeave: () => {
        gameMode = "ai";
        const modeEl = document.getElementById("sys-mem-mode");
        if (modeEl) modeEl.value = "ai";
        localStorage.setItem("mem_mode", "ai");
        chatStarted = false;
        myId = 1; isHost = true;
        if (roomListenerUnsub) { roomListenerUnsub(); roomListenerUnsub = null; }
        resetGame();
    },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), { status: "playing" });
        }
    }
});

function listenToRoom() {
    if (roomListenerUnsub) { roomListenerUnsub(); roomListenerUnsub = null; }
    let onlineGameStarted = false;
    roomListenerUnsub = window.dbOnValue(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            // Host deleted the room — free the joiner instead of freezing.
            if (gameMode === "online" && !isHost) {
                if (roomListenerUnsub) { roomListenerUnsub(); roomListenerUnsub = null; }
                SystemMatch.setSeats([]); // room is gone — skip the ghost seat write
                SystemMatch.cleanup();
                chatStarted = false;
                SystemUI.v2Lobby.hide();
                showToast("Host Left", "The host left the game. Returning to AI mode.");
                gameMode = "ai";
                const modeEl = document.getElementById("sys-mem-mode");
                if (modeEl) modeEl.value = "ai";
                localStorage.setItem("mem_mode", "ai");
                myId = 1; isHost = true;
                updateAiDiffVisibility();
                updatePlayerLabels();
                resetGame();
            }
            return;
        }

        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);

        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            SystemUI.v2Lobby.hide();
            SystemUI.playSound('shuffle');

            if (!chatStarted) {
                chatStarted = true;
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            startOnlineGame(data);
            return;
        }

        if (gameState !== "playing") {
            // Rematch: after a game ends locally, a fresh host write (untouched
            // matched array, zeroed scores/flips) restarts the joiner's board.
            const matchedArr = data.matched ? Object.values(data.matched) : [];
            const isFreshGame = data.status === "playing" && data.cards &&
                matchedArr.length > 0 && !matchedArr.some(m => m) &&
                (data.flipStage || 0) === 0 &&
                (data.score1 || 0) === 0 && (data.score2 || 0) === 0;
            if (isFreshGame) {
                SystemUI.playSound('shuffle');
                startOnlineGame(data);
            }
            return;
        }
        syncOnlineState(data);
    });
}

// ==========================================
// 3. CORE GAME STATE
// ==========================================
let cards = [];           
let matched = [];         
let firstIdx = -1;        
let secondIdx = -1;       
let isLocking = false;
let moves = 0;
let scores = [0, 0];      
let currentTurn = 1;      
let gameState = "idle";   

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
    const tTitle = document.getElementById("modal-title");
    const tMsg = document.getElementById("modal-message");
    const overlay = document.getElementById("toast-modal");
    if(tTitle) tTitle.innerText = title;
    if(tMsg) tMsg.innerText = message;
    if(overlay) {
        overlay.classList.remove("hidden");
        clearTimeout(modalTimer);
        modalTimer = setTimeout(() => overlay.classList.add("hidden"), 3500);
    }
}
document.getElementById("toast-modal")?.addEventListener("click", () => {
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
    if(!grid) return;
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

    if (gameMode === "online") {
        if (isHost && window.db) {
            if (SystemUI.money < config.cost) {
                showToast("Insufficient Funds", "You don't have enough cash!");
                return;
            }
            SystemUI.money -= config.cost;
            SystemUI.updateMoneyDisplay();
            
            // AUDIT: Tracking game start
            if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("memory");

            SystemUI.playSound('shuffle');
            const cardSet = buildCardSet();
            window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), {
                cards: cardSet,
                matched: Array(cardSet.length).fill(false),
                turn: 1, score1: 0, score2: 0, flip1: -1, flip2: -1, flipStage: 0,
                status: "playing", gridDifficulty: gridDifficulty
            });
        }
        scores = [0, 0]; moves = 0; firstIdx = -1; secondIdx = -1;
        isLocking = false; gameState = "idle"; 
        const btn = document.getElementById("start-game-btn");
        if(btn) btn.classList.add("hidden");
        listenToRoom();
        return;
    }

    if (SystemUI.money < config.cost) {
        showToast("Insufficient Funds", "You don't have enough cash!");
        return;
    }

    SystemUI.money -= config.cost;
    SystemUI.updateMoneyDisplay();
    
    // AUDIT: Tracking game start
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("memory");

    SystemUI.playSound('shuffle');

    cards = buildCardSet();
    matched = Array(cards.length).fill(false);
    scores = [0, 0]; moves = 0; firstIdx = -1; secondIdx = -1;
    isLocking = false; currentTurn = 1; gameState = "playing"; aiMemory = {};

    renderGrid(cards);
    updateScoreUI();
    updateTurnBanner();
    const btn = document.getElementById("start-game-btn");
    if(btn) btn.classList.add("hidden");
}

function resetGame() {
    gameState = "idle";
    cards = []; matched = []; scores = [0, 0]; moves = 0;
    firstIdx = -1; secondIdx = -1; isLocking = false;
    currentTurn = 1; aiMemory = {};

    const grid = document.getElementById("memory-grid");
    if(grid) grid.innerHTML = "";
    const banner = document.getElementById("turn-banner");
    if(banner) banner.classList.add("hidden");
    const btn = document.getElementById("start-game-btn");
    if(btn) btn.classList.remove("hidden");
    
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
    if (gameMode === "online" && currentTurn !== myId) return;
    if (gameMode === "ai" && currentTurn === 2) return;

    SystemUI.playSound('card');

    if (firstIdx === -1) {
        firstIdx = idx;
        flipCardVisual(idx, true);
        rememberCard(idx, cards[idx]);

        if (gameMode === "online" && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), {
                flip1: idx, flipStage: 1
            });
        }
    } else {
        secondIdx = idx;
        flipCardVisual(idx, true);
        rememberCard(idx, cards[idx]);
        moves++;
        const mc = document.getElementById("move-count");
        if(mc) mc.innerText = moves;

        if (gameMode === "online" && window.db) {
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
    if (cards[i1] === cards[i2]) {
        matched[i1] = true; matched[i2] = true;
        markMatched(i1); markMatched(i2);
        scores[currentTurn - 1]++;
        SystemUI.playSound('win');
        updateScoreUI();

        firstIdx = -1; secondIdx = -1; isLocking = false;

        if (matched.every(m => m)) { endGame(); return; }
        
        updateTurnBanner();
        if (gameMode === "ai" && currentTurn === 2) setTimeout(aiTakeTurn, 900);
    } else {
        SystemUI.playSound('click');
        setTimeout(() => {
            flipCardVisual(i1, false); flipCardVisual(i2, false);
            firstIdx = -1; secondIdx = -1; isLocking = false;
            currentTurn = currentTurn === 1 ? 2 : 1;
            updateTurnBanner();
            if (gameMode === "ai" && currentTurn === 2) setTimeout(aiTakeTurn, 700);
        }, 600);
    }
}

// ==========================================
// 9. AI LOGIC (Upgraded)
// ==========================================
function rememberCard(idx, value) {
    if (aiDifficulty === "hard") {
        aiMemory[idx] = value; 
    } else if (aiDifficulty === "adaptive") {
        if (Math.random() < 0.6) aiMemory[idx] = value;
    }
}

function aiTakeTurn() {
    if (gameState !== "playing") return;

    const available = matched.map((m, i) => m ? null : i).filter(i => i !== null);
    if (available.length === 0) return;

    let pick1 = -1; let pick2 = -1;

    if (aiDifficulty !== "easy") {
        const knownIndices = Object.keys(aiMemory).map(Number).filter(i => !matched[i]);
        for (let i = 0; i < knownIndices.length; i++) {
            for (let j = i + 1; j < knownIndices.length; j++) {
                const a = knownIndices[i]; const b = knownIndices[j];
                if (aiMemory[a] === aiMemory[b]) { pick1 = a; pick2 = b; break; }
            }
            if (pick1 !== -1) break;
        }

        if (pick1 === -1) {
            const shuffled = [...available].sort(() => Math.random() - 0.5);
            pick1 = shuffled[0];
            const knownMatch = knownIndices.find(i => i !== pick1 && !matched[i] && aiMemory[i] === cards[pick1]);
            pick2 = knownMatch !== undefined ? knownMatch : shuffled[1];
        }
    } else {
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        pick1 = shuffled[0]; pick2 = shuffled[1];
    }

    isLocking = true;
    firstIdx = pick1;
    flipCardVisual(pick1, true);
    rememberCard(pick1, cards[pick1]);
    
    if(gameMode === "online" && window.db) {
        window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), { flip1: pick1, flipStage: 1 });
        setTimeout(() => {
            secondIdx = pick2; flipCardVisual(pick2, true); rememberCard(pick2, cards[pick2]);
            window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), { flip2: pick2, flipStage: 2 });
        }, 700);
    } else {
        setTimeout(() => {
            secondIdx = pick2; flipCardVisual(pick2, true); rememberCard(pick2, cards[pick2]);
            moves++; const mc = document.getElementById("move-count"); if(mc) mc.innerText = moves;
            setTimeout(() => resolveMatch(pick1, pick2), 800);
        }, 700);
    }
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
    const btn = document.getElementById("start-game-btn");
    if(btn) btn.classList.add("hidden");

    matched.forEach((m, i) => { if (m) markMatched(i); });
}

function syncOnlineState(data) {
    if (!data || gameState !== "playing") return;

    const prevMatched = [...matched];
    matched = data.matched || matched;
    cards = data.cards || cards;
    scores = [data.score1 || 0, data.score2 || 0];
    currentTurn = data.turn || 1;

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
        flipCardVisual(f1, true); firstIdx = f1; rememberCard(f1, cards[f1]);
    }

    if (stage === 2 && f1 !== -1 && f2 !== -1 && !isLocking) {
        flipCardVisual(f2, true); firstIdx = f1; secondIdx = f2; rememberCard(f2, cards[f2]);
        isLocking = true;

        // Count a move only when a real second flip lands, not on every snapshot.
        moves++;
        const mc = document.getElementById("move-count");
        if(mc) mc.innerText = moves;

        setTimeout(() => {
            const isMatch = cards[f1] === cards[f2];
            if (!isMatch) {
                flipCardVisual(f1, false); flipCardVisual(f2, false);
                SystemUI.playSound('click');
            }
            firstIdx = -1; secondIdx = -1; isLocking = false;

            if (isHost && window.db) {
                const newMatched = [...matched];
                if (isMatch) { newMatched[f1] = true; newMatched[f2] = true; }
                const scorer = data.turn; 
                const newScore1 = scorer === 1 ? (data.score1 || 0) + (isMatch ? 1 : 0) : (data.score1 || 0);
                const newScore2 = scorer === 2 ? (data.score2 || 0) + (isMatch ? 1 : 0) : (data.score2 || 0);
                const nextTurn = isMatch ? scorer : (scorer === 1 ? 2 : 1);

                window.dbUpdate(window.dbRef(window.db, 'memory_rooms/' + currentRoomId), {
                    matched: newMatched, score1: newScore1, score2: newScore2, turn: nextTurn, flip1: -1, flip2: -1, flipStage: 0
                });
            }

            if (matched.every(m => m)) { endGame(); return; }
            
            updateTurnBanner();
            updatePlayerLabels();
            
            if (isHost && !matched.every(m => m)) {
                const nextTurn = isMatch ? data.turn : (data.turn === 1 ? 2 : 1);
                if (seats[nextTurn - 1]?.type === 'ai') setTimeout(aiTakeTurn, 900);
            }
        }, 800);
    }

    updateTurnBanner();
    updatePlayerLabels();

    if (matched.every(m => m)) endGame();
}

// ==========================================
// 11. UI HELPERS
// ==========================================
function updateScoreUI() {
    const p1 = document.getElementById("p1-score");
    const p2 = document.getElementById("p2-score");
    if(p1) p1.innerText = scores[0];
    if(p2) p2.innerText = scores[1];

    const s1 = document.getElementById("p1-stat");
    const s2 = document.getElementById("p2-stat");
    if(s1) s1.classList.toggle("active-turn", currentTurn === 1);
    if(s2) s2.classList.toggle("active-turn", currentTurn === 2);
}

function updateTurnBanner() {
    const banner = document.getElementById("turn-banner");
    if(!banner) return;
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
    const banner = document.getElementById("turn-banner");
    if(banner) banner.classList.add("hidden");

    const config = GRID_CONFIGS[gridDifficulty];
    let title, message;

    if (gameMode === "ai") {
        if (scores[0] > scores[1]) {
            SystemUI.money += config.payout;
            SystemUI.updateMoneyDisplay();
            
            // AUDIT: Tracking win
            if (typeof SystemStats !== 'undefined') SystemStats.recordWin("memory", config.payout);

            SystemUI.playSound('win');
            title = "You Win!";
            message = `You beat the AI ${scores[0]}-${scores[1]}! Won $${config.payout}!`;
        } else if (scores[1] > scores[0]) {
            // AUDIT: Tracking loss
            if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("memory");

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
        const iWon = (myId === 1 && scores[0] > scores[1]) || (myId === 2 && scores[1] > scores[0]);
        const isTie = scores[0] === scores[1];
        
        // AUDIT: Tracking win/loss online
        if (typeof SystemStats !== 'undefined') {
            if (iWon) SystemStats.recordWin("memory", config.payout);
            else if (!isTie) SystemStats.recordLoss("memory");
        }

        SystemUI.playSound(isTie ? 'tie' : iWon ? 'win' : 'lose');
        title = isTie ? "It's a Tie!" : iWon ? "You Win!" : "Opponent Wins!";
        message = `Final score: ${scores[0]}-${scores[1]}`;
    }

    showToast(title, message);
    setTimeout(() => {
        const btn = document.getElementById("start-game-btn");
        if(btn) btn.classList.remove("hidden");
        updateBuyInBtn();
    }, 3600);
}

// ==========================================
// 13. KICKSTART
// ==========================================
document.getElementById("start-game-btn")?.addEventListener("click", initGame);
updatePlayerLabels();
updateScoreUI();