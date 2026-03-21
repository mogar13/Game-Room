// =============================================
// CRAZY 8s PRO — crazy8_app.js
// The Game Shack | Casino OS (V2 Engine)
// =============================================

let gameMode = "ai";
localStorage.setItem("crazy8_mode", "ai"); 

let aiDifficulty = localStorage.getItem("crazy8_diff") || "normal";
let playerCount  = parseInt(localStorage.getItem("crazy8_pcount") || "2");

let myId = 1;
let currentRoomId = null;
let isHost = true; 
let chatStarted = false;
let seats = [];
let roomListener = null;

let lastPushTime = 0;
let lastSyncTime = 0;
let lastActionTs = 0;
let pendingGameState = null;

let hands = [[], [], [], []];
let playerNames = ["Player 1", "AI 2", "AI 3", "AI 4"];

let deck = [];
let discardPile = [];
let activeTurn = 0; 
let gameIsActive = false;
let isGameOver = false;
let isAnimating = false;
let currentSuit = ""; 
let pendingPlayIndex = -1; 

// --- AUDIO ---
const sfxDraw = new Audio('../../system/audio/card-draw.ogg');
const sfxPlay = new Audio('../../system/audio/card-shove-2.ogg');
const sfxWin = new Audio('../../system/audio/win.ogg');
const sfxLose = new Audio('../../system/audio/lose.ogg');
const sfxError = new Audio('../../system/audio/error.mp3');

function playCustomSound(type) {
    let snd;
    if (type === 'draw') snd = sfxDraw;
    else if (type === 'play') snd = sfxPlay;
    else if (type === 'win') snd = sfxWin;
    else if (type === 'lose') snd = sfxLose;
    else if (type === 'error') snd = sfxError;
    if (snd) { snd.pause(); snd.currentTime = 0; snd.play().catch(e => console.log("Audio failed:", e)); }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

SystemUI.init({
    gameName: "CRAZY 8s",
    rules: "Match the suit or rank of the top card. 8s are wild and let you change the suit! If you can't play, click the deck to draw a card. First to get rid of all their cards wins.",
    hudDropdowns: [
        { id: "sys-c8-mode", options: [{ value: "ai", label: "🤖 vs AI" }, { value: "online", label: "🌐 Online" }] },
        { id: "sys-c8-count", label: "Players", options: [{ value: "2", label: "2 Players" }, { value: "3", label: "3 Players" }, { value: "4", label: "4 Players" }] },
        { id: "sys-c8-diff", label: "AI Level", options: [{ value: "easy", label: "Easy" }, { value: "normal", label: "Normal" }, { value: "hard", label: "Hard" }] }
    ]
});

const checkDBReadyC8 = setInterval(() => {
    if (window.db) { clearInterval(checkDBReadyC8); initCrazy8(); }
}, 50);

function initCrazy8() {
    const modeEl = document.getElementById("sys-c8-mode");
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", (e) => {
            gameMode = e.target.value; localStorage.setItem("crazy8_mode", gameMode);
            if (gameMode === "online") { 
                const ss = document.getElementById("start-screen");
                if (ss) ss.classList.add("hidden"); 
                SystemUI.v2Lobby.show(); 
            } else { 
                const ss = document.getElementById("start-screen");
                if (ss) ss.classList.remove("hidden"); 
                SystemUI.v2Lobby.hide(); 
                SystemUI.stopChat(); chatStarted = false; myId = 1; isHost = true;
                if (roomListener) { roomListener(); roomListener = null; } resetGame(); 
            }
        });
    }

    const countEl = document.getElementById("sys-c8-count");
    if (countEl) {
        countEl.value = playerCount;
        countEl.addEventListener("change", (e) => {
            playerCount = parseInt(e.target.value); localStorage.setItem("crazy8_pcount", playerCount); resetGame();
        });
    }

    const startSettings = document.getElementById("start-settings");
    if (startSettings) {
        startSettings.addEventListener("click", e => {
            const chip = e.target.closest(".ss-chip");
            if (!chip) return;
            const group = chip.dataset.group;
            const val = chip.dataset.val;
            document.querySelectorAll(`.ss-chip[data-group="${group}"]`).forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            if (group === "count") { playerCount = parseInt(val); localStorage.setItem("crazy8_pcount", val); resetGame(); }
            else if (group === "ai-diff") { aiDifficulty = val; localStorage.setItem("crazy8_diff", val); }
        });
    }

    // UPDATED SUIT PICKER LISTENERS
    document.querySelectorAll('.suit-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            let chosenSuit = e.target.dataset.suit;
            const overlay = document.getElementById('suit-picker-overlay');
            if (overlay) overlay.classList.add('hidden');
            if (gameMode === "online") sendBroadcastAction('play', myId - 1, pendingPlayIndex, chosenSuit);
            else executePlayCardAsync(myId - 1, pendingPlayIndex, chosenSuit);
            pendingPlayIndex = -1;
        });
    });

    const startBtn = document.getElementById("start-game-btn");
    if (startBtn) startBtn.addEventListener("click", startGame);

    const drawPile = document.getElementById("draw-pile");
    if (drawPile) drawPile.addEventListener("click", attemptDrawCard);

    resetGame();
}

// ── DECK & SETUP ──────────────────────────
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUIT_SYMBOLS = { 'h': '♥', 'd': '♦', 'c': '♣', 's': '♠' };
const SUIT_COLORS = { 'h': '#e74c3c', 'd': '#e74c3c', 'c': '#2c3e50', 's': '#2c3e50' };

function buildDeck() {
    deck = [];
    for (let s of SUITS) {
        for (let r of RANKS) {
            deck.push({ rank: r, suit: s, id: Math.random().toString(36).substr(2, 9) });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

// ── PACED GAME FLOW ──────────────────────────
async function startGame() {
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("crazy8");
    gameIsActive = true; isGameOver = false; isAnimating = true; pendingGameState = null;
    hands = [[], [], [], []]; discardPile = []; deck = [];
    const ss = document.getElementById("start-screen");
    if (ss) ss.classList.add("hidden");
    const ga = document.getElementById("game-area");
    if (ga) ga.classList.remove("hidden");
    
    buildDeck();
    
    let startingCards = (playerCount === 2) ? 7 : 5;
    for (let i = 0; i < playerCount; i++) {
        for(let c = 0; c < startingCards; c++) hands[i].push(deck.pop());
    }

    let topCard = deck.pop();
    while (topCard && topCard.rank === '8') {
        deck.unshift(topCard);
        topCard = deck.pop();
    }
    if (topCard) {
        discardPile.push(topCard);
        currentSuit = topCard.suit;
    }

    activeTurn = 0;
    
    setStatus("Dealing cards...");
    renderTable();
    await sleep(1000);

    isAnimating = false;
    setStatus(playerNames[activeTurn].toUpperCase() + "'S TURN");
    updateTurnBanner();
    checkAITurn();
    if (gameMode === "online" && isHost) pushGameState();
}

function isValidPlay(card) {
    if (!card) return false;
    if (card.rank === '8') return true;
    const topCard = discardPile[discardPile.length - 1];
    if (!topCard) return true;
    return (card.suit === currentSuit || card.rank === topCard.rank);
}

function hasValidMoves(pIdx) {
    if (!hands[pIdx]) return false;
    return hands[pIdx].some(card => isValidPlay(card));
}

// ── HUMAN ACTIONS ──────────────────────────
function attemptPlayCard(cardIdx) {
    if (!gameIsActive || isGameOver || activeTurn !== (myId - 1) || isAnimating) return;
    
    let selectedCard = hands[myId - 1][cardIdx];
    if (isValidPlay(selectedCard)) {
        if (selectedCard.rank === '8') {
            pendingPlayIndex = cardIdx;
            const overlay = document.getElementById('suit-picker-overlay');
            if (overlay) overlay.classList.remove('hidden');
        } else {
            if (gameMode === "online") sendBroadcastAction('play', myId - 1, cardIdx, selectedCard.suit);
            else executePlayCardAsync(myId - 1, cardIdx, selectedCard.suit);
        }
    } else {
        playCustomSound('error');
    }
}

function attemptDrawCard() {
    if (!gameIsActive || isGameOver || activeTurn !== (myId - 1) || isAnimating) return;
    
    if (gameMode === "online") sendBroadcastAction('draw', myId - 1);
    else executeDrawCardAsync(myId - 1);
}

// ── ASYNC EXECUTION PIPELINE ──────────────────────────
async function executePlayCardAsync(pIdx, cardIdx, newSuit) {
    if (!hands[pIdx]) return;
    isAnimating = true;
    let playedCard = hands[pIdx].splice(cardIdx, 1)[0];
    discardPile.push(playedCard);
    currentSuit = newSuit;
    
    playCustomSound('play');
    
    let suitSymbol = SUIT_SYMBOLS[newSuit];
    let suitColor = SUIT_COLORS[newSuit];
    logMove(`${playerNames[pIdx]} played ${playedCard.rank} of ${SUIT_SYMBOLS[playedCard.suit]}`);
    if (playedCard.rank === '8') logMove(`Suit changed to <span style="color:${suitColor}">${suitSymbol}</span>`);

    renderTable(true); 
    await sleep(600);
    
    isAnimating = false;

    if (gameMode !== "online" || isHost) {
        checkWinConditions();
        if (!isGameOver) advanceTurn();
    } else {
        renderTable();
        if (pendingGameState) applyHostState(pendingGameState);
    }
}

async function executeDrawCardAsync(pIdx) {
    if (!hands[pIdx]) return;
    isAnimating = true;
    
    // Recycle discard pile if deck is empty
    if (deck.length === 0 && discardPile.length > 1) {
        let top = discardPile.pop();
        deck = [...discardPile];
        discardPile = [top];
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        logMove("Deck reshuffled.");
    }

    // Only draw if cards are actually available
    if (deck.length > 0) {
        let drawnCard = deck.pop();
        hands[pIdx].push(drawnCard);
        playCustomSound('draw');
        logMove(`${playerNames[pIdx]} drew a card.`);
        renderTable(false, pIdx); 
        await sleep(600);
    }

    isAnimating = false;

    if (gameMode !== "online" || isHost) {
        if (pIdx === activeTurn) {
            // FIX: Only auto-pass if the player has NO valid moves AND the entire deck/discard is depleted
            if (!hasValidMoves(pIdx) && deck.length === 0) {
                logMove(`${playerNames[pIdx]} has no plays and deck is empty. Turn passed.`);
                await sleep(600);
                advanceTurn();
            } else {
                renderTable();
                checkAITurn(); // Allow AI to chain-draw or play the card it just got
            }
        }
    } else {
        renderTable();
        if (pendingGameState) applyHostState(pendingGameState);
    }
}

function advanceTurn() {
    activeTurn = (activeTurn + 1) % playerCount;
    setStatus(playerNames[activeTurn].toUpperCase() + "'S TURN");
    updateTurnBanner();
    renderTable();
    checkAITurn();
    if (gameMode === "online" && isHost) pushGameState();
}

function checkWinConditions() {
    if (!gameIsActive) return;
    let winnerIdx = -1;
    // CRITICAL FIX: Only check indices within playerCount to ignore empty arrays
    for (let i = 0; i < playerCount; i++) {
        if (hands[i] && hands[i].length === 0) {
            winnerIdx = i;
            break;
        }
    }

    if (winnerIdx !== -1) {
        isGameOver = true; gameIsActive = false; isAnimating = false;
        renderTable();
        setStatus("GAME OVER! " + playerNames[winnerIdx] + " WINS!");
        
        if (winnerIdx === myId - 1) {
            playCustomSound('win'); showResultModal("🎉 YOU WIN!");
            if (typeof SystemStats !== 'undefined') SystemStats.recordWin("crazy8", 0);
        } else {
            playCustomSound('lose'); showResultModal(`😞 ${playerNames[winnerIdx]} WINS!`);
            if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("crazy8");
        }
        
        const ss = document.getElementById("start-screen");
        if (ss) ss.classList.remove("hidden");
        const ga = document.getElementById("game-area");
        if (ga) ga.classList.add("hidden");
        const startBtn = document.getElementById("start-game-btn");
        if (startBtn) startBtn.innerText = "PLAY AGAIN";
        if (gameMode === "online" && isHost) pushGameState();
    }
}

// ── AI LOGIC ──────────────────────────────
async function checkAITurn() {
    if (gameMode === "online" && !isHost) return;
    if (!gameIsActive || isGameOver || activeTurn === (myId - 1) || isAnimating) return;
    
    let isBot = (gameMode === "ai" || (seats[activeTurn] && seats[activeTurn].type === "ai"));
    if (isBot) {
        isAnimating = true;
        let thinkTime = aiDifficulty === "hard" ? 800 : (aiDifficulty === "easy" ? 2000 : 1200);
        await sleep(thinkTime);
        playAITurn();
    }
}

function playAITurn() {
    if (isGameOver || !hands[activeTurn]) return;
    let pHand = hands[activeTurn];
    
    // TIERED AI DECISION MAKING
    let chosenIdx = -1;
    let chosenSuit = "";

    let validIndices = pHand.map((c, i) => isValidPlay(c) ? i : -1).filter(i => i !== -1);

    if (validIndices.length > 0) {
        if (aiDifficulty === "easy") {
            chosenIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
        } 
        else if (aiDifficulty === "normal") {
            let nonEights = validIndices.filter(i => pHand[i].rank !== '8');
            chosenIdx = (nonEights.length > 0) ? nonEights[0] : validIndices[0];
        } 
        else {
            // HARD MODE: Strategic Bleeding logic
            let suitCounts = { 'h':0, 'd':0, 'c':0, 's':0 };
            pHand.forEach(c => suitCounts[c.suit]++);

            let nonEights = validIndices.filter(i => pHand[i].rank !== '8');
            if (nonEights.length > 0) {
                // Pick valid card from the suit the AI has the MOST of to drain the hand efficiently
                nonEights.sort((a, b) => suitCounts[pHand[b].suit] - suitCounts[pHand[a].suit]);
                chosenIdx = nonEights[0];
            } else {
                chosenIdx = validIndices[0]; // Must play 8
            }
        }

        let card = pHand[chosenIdx];
        if (card && card.rank === '8') {
            let counts = { 'h':0, 'd':0, 'c':0, 's':0 };
            pHand.forEach(c => counts[c.suit]++);
            chosenSuit = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        } else if (card) {
            chosenSuit = card.suit;
        }

        if (gameMode === "online") sendBroadcastAction('play', activeTurn, chosenIdx, chosenSuit);
        else executePlayCardAsync(activeTurn, chosenIdx, chosenSuit);
    } else {
        if (gameMode === "online") sendBroadcastAction('draw', activeTurn);
        else executeDrawCardAsync(activeTurn);
    }
}

// ── UI RENDERING ──────────────────────────
function renderTable(playAnim = false, drawAnimPlayerIdx = -1) {
    const seatMap = { 2: { top: 1 }, 3: { left: 1, right: 2 }, 4: { left: 1, top: 2, right: 3 } };
    const config = seatMap[playerCount] || seatMap[2];
    
    ["opponent-area", "left-area", "right-area"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add("hidden");
    });

    Object.entries(config).forEach(([pos, relIdx]) => {
        const pIdx = (myId - 1 + relIdx) % playerCount;
        const areaId = pos === "top" ? "opponent-area" : (pos + "-area");
        const handId = pos === "top" ? "opponent-hand" : (pos + "-hand");
        const labelId = pos === "top" ? "p2-label" : ("p" + (pIdx + 1) + "-label");
        
        const areaEl = document.getElementById(areaId);
        if (areaEl) {
            areaEl.classList.remove("hidden");
            const labelEl = document.getElementById(labelId);
            if (labelEl) labelEl.innerText = playerNames[pIdx];
            
            const cardBox = document.getElementById(handId);
            if (cardBox) {
                cardBox.innerHTML = '';
                let len = hands[pIdx] ? hands[pIdx].length : 0;
                for(let i=0; i < len; i++) {
                    let el = document.createElement("div"); 
                    el.className = "card card-back";
                    if (pos === "left") el.style.transform = "rotate(90deg)";
                    if (pos === "right") el.style.transform = "rotate(-90deg)";
                    if (drawAnimPlayerIdx === pIdx && i === len - 1) el.classList.add("anim-draw");
                    cardBox.appendChild(el);
                }
            }
        }
    });

    const myHandBox = document.getElementById("player-hand");
    if (myHandBox) {
        myHandBox.innerHTML = '';
        if (hands[myId - 1]) {
            hands[myId - 1].forEach((c, idx) => {
                let el = document.createElement("div"); 
                el.className = "card";
                const suitMap = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" };
                const rankMap = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
                el.innerHTML = `<img src="../../system/images/cards/standard/card${suitMap[c.suit]}${rankMap[c.rank]||c.rank}.png" style="width:100%;height:100%;border-radius:6px;">`;
                if (drawAnimPlayerIdx === myId - 1 && idx === hands[myId - 1].length - 1) el.classList.add("anim-draw");
                const canPlay = activeTurn === (myId - 1) && !isAnimating && isValidPlay(c);
                if (canPlay) { el.style.boxShadow = "0 0 15px #f1c40f"; }
                el.onclick = () => attemptPlayCard(idx);
                myHandBox.appendChild(el);
            });
        }
    }

    const discardBox = document.getElementById("discard-pile");
    if (discardBox) {
        discardBox.innerHTML = '';
        if (discardPile.length > 0) {
            let topCard = discardPile[discardPile.length - 1];
            let el = document.createElement("div"); 
            el.className = "card"; 
            const suitMap = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" };
            const rankMap = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
            el.innerHTML = `<img src="../../system/images/cards/standard/card${suitMap[topCard.suit]}${rankMap[topCard.rank]||topCard.rank}.png" style="width:100%;height:100%;border-radius:6px;">`;
            if (playAnim) el.classList.add("anim-play");
            discardBox.appendChild(el);
        }
    }

    const ind = document.getElementById("suit-indicator");
    if (ind) {
        if (currentSuit) {
            ind.classList.remove("hidden");
            ind.innerHTML = `SUIT: <span style="color:${SUIT_COLORS[currentSuit]}">${SUIT_SYMBOLS[currentSuit]}</span>`;
        } else {
            ind.classList.add("hidden");
        }
    }

    const deckCount = document.getElementById("deck-count");
    if (deckCount) deckCount.innerText = deck.length;
    updateTurnBanner();
}

function updateTurnBanner() {
    const seatIds = ["p1-label", "p2-label", "p3-label", "p4-label"];
    seatIds.forEach(id => {
        let el = document.getElementById(id);
        if (el) el.classList.remove("active-name-glow");
    });
    const isMine = (activeTurn === (myId - 1));
    const handWrapper = document.getElementById("player-hand-wrapper");
    if (handWrapper) {
        if (isMine) handWrapper.classList.add("active-name-glow");
        else handWrapper.classList.remove("active-name-glow");
    }
    const banner = document.getElementById("turn-banner");
    if (banner) {
        banner.classList.remove("hidden");
        banner.innerText = isMine ? `YOUR TURN` : `${playerNames[activeTurn].toUpperCase()}'S TURN`;
    }
}

function setStatus(msg) { 
    const banner = document.getElementById("turn-banner");
    if (banner) banner.innerText = msg;
}

function logMove(msg) {
    const logDiv = document.getElementById("move-log");
    if (!logDiv) return;
    const entry = document.createElement("div");
    entry.innerHTML = msg;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function showToast(title, msg) { 
    const modalTitle = document.getElementById("modal-title");
    const modalMessage = document.getElementById("modal-message");
    if (modalTitle) modalTitle.innerText = title; 
    if (modalMessage) modalMessage.innerText = msg; 
    const toast = document.getElementById("toast-modal");
    if (toast) {
        toast.classList.remove("hidden"); 
        setTimeout(() => toast.classList.add("hidden"), 3000); 
    }
}

function showResultModal(msg) {
    showToast("Match Finished", msg);
}

function resetGame() {
    gameIsActive = false; isGameOver = false; isAnimating = false; pendingGameState = null;
    hands = [[], [], [], []]; discardPile = []; deck = []; currentSuit = "";
    const ss = document.getElementById("start-screen");
    if (ss) ss.classList.remove("hidden");
    const ga = document.getElementById("game-area");
    if (ga) ga.classList.add("hidden");
    const ml = document.getElementById("move-log");
    if (ml) ml.innerHTML = "";
    renderTable();
}

// ── ONLINE MULTIPLAYER ──────────────────────
SystemUI.v2Lobby.setup({
    settingsConfig: [
        { id: "lobby-count", label: "PLAYERS", type: "select", default: playerCount, options: [{value:2, label:"2"},{value:3, label:"3"},{value:4, label:"4"}] }
    ],
    onSettingsRendered: () => {
        const slots = [{ type: "host", name: SystemUI.getPlayerName(), color: "#e74c3c" }];
        for (let i = 1; i < playerCount; i++) slots.push({ type: "ai", name: "AI " + (i + 1), color: "#3498db" });
        SystemUI.v2Lobby.updatePreview(slots);
    },
    onSettingChange: (key, val) => {
        if (key === "lobby-count") { 
            playerCount = parseInt(val); 
            const localCount = document.getElementById("sys-c8-count");
            if (localCount) localCount.value = val;
        } 
        const slots = [{ type: "host", name: SystemUI.getPlayerName(), color: "#e74c3c" }];
        for (let i = 1; i < playerCount; i++) slots.push({ type: "ai", name: "AI " + (i + 1), color: "#3498db" });
        SystemUI.v2Lobby.updatePreview(slots);
    },
    onHost: () => {
        currentRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        isHost = true; myId = 1; seats = [{ type: "human", name: SystemUI.getPlayerName() }];
        for (let i = 1; i < playerCount; i++) seats.push({ type: "ai", name: "AI " + (i + 1) });
        window.dbSet(window.dbRef(window.db, 'c8_rooms/' + currentRoomId), { status: "waiting", seats: seats, ts: Date.now(), createdAt: Date.now() }).then(() => { 
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true); listenToRoom(); 
        });
    },
    onJoin: (code) => {
        window.dbGet(window.dbChild(window.dbRef(window.db), `c8_rooms/${code}`)).then((snap) => {
            if (snap.exists()) {
                const data = snap.val(); let jIdx = data.seats.findIndex(s => s.type === "ai");
                if (jIdx !== -1) {
                    currentRoomId = code; isHost = false; myId = jIdx + 1;
                    let updated = data.seats; updated[jIdx] = { type: "human", name: SystemUI.getPlayerName() };
                    window.dbUpdate(window.dbRef(window.db, 'c8_rooms/' + code), { seats: updated, ts: Date.now() });
                    SystemUI.v2Lobby.showRoomPhase(code, false); listenToRoom();
                } else SystemUI.v2Lobby.showError("ROOM FULL");
            } else SystemUI.v2Lobby.showError("NOT FOUND");
        });
    },
    onLeave: () => location.reload(),
    onStart: () => window.dbUpdate(window.dbRef(window.db, 'c8_rooms/' + currentRoomId), { status: "playing", ts: Date.now() })
});

function listenToRoom() {
    roomListener = window.dbOnValue(window.dbRef(window.db, 'c8_rooms/' + currentRoomId), (snap) => {
        const data = snap.val(); if (!data) return;
        seats = data.seats || []; SystemUI.v2Lobby.renderSeats(seats); playerNames = seats.map(s => s.name);
        playerCount = seats.length;
        if (data.status === "playing") {
            SystemUI.v2Lobby.hide();
            if (!chatStarted) { chatStarted = true; SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); }
            if (isHost && !gameIsActive) startGame(); else if (!isHost) { if (data.gameState) applyHostState(data.gameState); }
        }
        if (data.playerAction && data.playerAction.ts !== lastActionTs) { 
            lastActionTs = data.playerAction.ts; 
            const processAction = async () => {
                while (isAnimating) await sleep(100);
                if (data.playerAction.action === 'play') executePlayCardAsync(data.playerAction.pIdx, data.playerAction.cardIdx, data.playerAction.suit);
                else if (data.playerAction.action === 'draw') executeDrawCardAsync(data.playerAction.pIdx);
            };
            processAction();
        }
    });
}

function pushGameState() {
    if (gameMode !== "online" || !isHost) return;
    window.dbUpdate(window.dbRef(window.db, 'c8_rooms/' + currentRoomId), { 
        gameState: { hands, discardPile, deck, currentSuit, activeTurn, isGameOver, gameIsActive, ts: Date.now() } 
    });
}

function sendBroadcastAction(action, pIdx, cardIdx = -1, suit = "") {
    window.dbUpdate(window.dbRef(window.db, 'c8_rooms/' + currentRoomId), { 
        playerAction: { action, pIdx, cardIdx, suit, ts: Date.now() } 
    });
}

function applyHostState(s) {
    if (!s || s.ts <= lastSyncTime) return; 
    if (isAnimating) { pendingGameState = s; return; }
    lastSyncTime = s.ts; pendingGameState = null;
    hands = s.hands; discardPile = s.discardPile; deck = s.deck; currentSuit = s.currentSuit;
    activeTurn = s.activeTurn; isGameOver = s.isGameOver; gameIsActive = s.gameIsActive;
    const ss = document.getElementById("start-screen");
    if (ss) ss.classList.add("hidden");
    const ga = document.getElementById("game-area");
    if (ga) ga.classList.remove("hidden");
    renderTable();
}