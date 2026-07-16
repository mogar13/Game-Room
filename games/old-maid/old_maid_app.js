// =============================================
// OLD MAID PRO — old_maid_app.js
// The Game Shack | Casino OS (V2 Engine)
// =============================================

let gameMode = "ai";
localStorage.setItem("oldmaid_mode", "ai"); 

let aiDifficulty = localStorage.getItem("oldmaid_diff") || "normal";
let playerCount  = parseInt(localStorage.getItem("oldmaid_pcount") || "4");

let myId = 1;
let currentRoomId = null;
let isHost = true; 
let chatStarted = false;
let seats = [];
let roomListener = null;
let onlineDealt = false;       // one-shot: host deals at most once per room via the listener echo
let gameOverAnnounced = false; // joiner announces a synced game-over exactly once

let lastPushTime = 0;
let lastSyncTime = 0;
let lastActionTs = 0;
let pendingGameState = null; // Stashes host updates if joiner is currently animating

let hands = [[], [], [], []];
let playerNames = ["Player 1", "AI 2", "AI 3", "AI 4"];
let safePlayers = [false, false, false, false]; 

let deck = [];
let discardPile = [];
let activeTurn = 0; 
let gameIsActive = false;
let isGameOver = false;
let isAnimating = false;

// --- CUSTOM AUDIO ---
const sfxDraw = new Audio('../../system/audio/card-draw.ogg');
const sfxPlay = new Audio('../../system/audio/card-shove-2.ogg');
const sfxWin = new Audio('../../system/audio/win.ogg');
const sfxLose = new Audio('../../system/audio/lose.ogg');

function playCustomSound(type) {
    let snd;
    if (type === 'draw') snd = sfxDraw;
    else if (type === 'play') snd = sfxPlay;
    else if (type === 'win') snd = sfxWin;
    else if (type === 'lose') snd = sfxLose;
    if (snd) { snd.pause(); snd.currentTime = 0; snd.play().catch(e => console.log("Audio failed:", e)); }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

SystemUI.init({
    gameName: "OLD MAID",
    rules: "Draw a card from the player to your left. If it matches a card in your hand, the pair is discarded. The first players to run out of cards are safe. Don't be the last one holding the Old Maid!",
    hudDropdowns: [
        { id: "sys-om-mode", options: [{ value: "ai", label: "🤖 vs AI" }, { value: "online", label: "🌐 Online" }] },
        { id: "sys-om-count", label: "Players", options: [{ value: "2", label: "2 Players" }, { value: "3", label: "3 Players" }, { value: "4", label: "4 Players" }] },
        { id: "sys-om-diff", label: "AI Level", options: [{ value: "easy", label: "Easy" }, { value: "normal", label: "Normal" }, { value: "hard", label: "Hard" }] }
    ]
});

const checkDBReadyOM = setInterval(() => {
    if (window.db) { clearInterval(checkDBReadyOM); initOldMaid(); }
}, 50);

function initOldMaid() {
    document.getElementById("sys-om-mode").value = gameMode;
    document.getElementById("sys-om-mode").addEventListener("change", (e) => {
        gameMode = e.target.value; localStorage.setItem("oldmaid_mode", gameMode);
        if (gameMode === "online") { 
            document.getElementById("action-zone").classList.add("hidden"); SystemUI.v2Lobby.show(); 
        } else { 
            document.getElementById("action-zone").classList.remove("hidden"); SystemUI.v2Lobby.hide(); 
            SystemUI.stopChat(); chatStarted = false; myId = 1; isHost = true;
            if (roomListener) { roomListener(); roomListener = null; } resetGame(); 
        }
    });

    document.getElementById("sys-om-count").value = playerCount;
    document.getElementById("sys-om-count").addEventListener("change", (e) => {
        playerCount = parseInt(e.target.value); localStorage.setItem("oldmaid_pcount", playerCount); resetGame();
    });

    resetGame();
}

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function buildOldMaidDeck() {
    deck = [];
    for (let s of SUITS) {
        for (let r of RANKS) {
            if (r === 'Q' && s === 'c') continue; 
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
    if (gameMode === "online" && !isHost) return;
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("old-maid");
    gameIsActive = true; isGameOver = false; safePlayers = [false, false, false, false];
    gameOverAnnounced = false;
    hands = [[], [], [], []]; discardPile = []; isAnimating = true; pendingGameState = null;
    document.getElementById("start-game-btn").classList.add("hidden");
    
    buildOldMaidDeck();
    let currentDeal = 0;
    while(deck.length > 0) {
        hands[currentDeal].push(deck.pop());
        currentDeal = (currentDeal + 1) % playerCount;
    }

    setStatus("Dealing cards & discarding initial pairs...");
    renderTable();
    await sleep(1000);

    for(let i=0; i<playerCount; i++) await processPairsAsync(i, true);
    
    activeTurn = 0;
    checkWinConditions();
    
    if (!isGameOver) {
        // Perfect Deal Fix: Pass turn if Player 1 paired everything instantly
        if (safePlayers[activeTurn]) activeTurn = getNextActive(activeTurn);
        
        setStatus(playerNames[activeTurn].toUpperCase() + "'S TURN");
        isAnimating = false;
        renderTable();
        checkAITurn();
        if (gameMode === "online" && isHost) pushGameState();
    }
}

function getNextActive(currentIndex) {
    let next = currentIndex;
    let safeguard = 0;
    do {
        next = (next + 1) % playerCount;
        safeguard++;
        if (safeguard > 10) return next; 
    } while (safePlayers[next]);
    return next;
}

// Map player index to their HTML div ID
function getUIBoxId(pIdx) {
    const seatMap = { 2: { bottom: 0, top: 1 }, 3: { bottom: 0, left: 1, right: 2 }, 4: { bottom: 0, left: 1, top: 2, right: 3 } };
    const config = seatMap[playerCount] || seatMap[2];
    let pos = Object.keys(config).find(k => (myId - 1 + config[k]) % playerCount === pIdx);
    const prefix = { bottom: "player", top: "opp", left: "left", right: "right" }[pos];
    return prefix + "-cards";
}

function attemptSteal(targetPIdx, cardIdx) {
    if (!gameIsActive || isGameOver || activeTurn !== (myId - 1) || isAnimating) return;
    
    let validTarget = getNextActive(myId - 1);
    if (targetPIdx !== validTarget) {
        showToast("Wrong Target", `You must draw from ${playerNames[validTarget]}'s hand!`);
        return;
    }

    if (gameMode === "online") {
        sendBroadcastAction('steal', targetPIdx, cardIdx, myId - 1);
    } else {
        executeStealAsync(myId - 1, targetPIdx, cardIdx);
    }
}

async function executeStealAsync(thiefIdx, targetIdx, cardIdx) {
    isAnimating = true;
    setStatus(`${playerNames[thiefIdx]} is drawing from ${playerNames[targetIdx]}...`);
    
    // Animate the specific card popping up
    let targetBoxId = getUIBoxId(targetIdx);
    let targetContainer = document.getElementById(targetBoxId);
    if (targetContainer && targetContainer.children[cardIdx]) {
        targetContainer.children[cardIdx].classList.add("anim-steal");
    }

    await sleep(600); 

    const stolenCard = hands[targetIdx].splice(cardIdx, 1)[0];
    hands[thiefIdx].push(stolenCard);
    
    // Shuffle the thief's hand so nobody knows where the new card landed
    for (let i = hands[thiefIdx].length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [hands[thiefIdx][i], hands[thiefIdx][j]] = [hands[thiefIdx][j], hands[thiefIdx][i]];
    }

    playCustomSound('draw');
    renderTable();

    await sleep(800);
    await processPairsAsync(thiefIdx, false);
    
    isAnimating = false;

    // Only the Host progresses the math to prevent double-skipping
    if (gameMode !== "online" || isHost) {
        checkWinConditions();
        if (!isGameOver) {
            activeTurn = getNextActive(activeTurn);
            setStatus(playerNames[activeTurn].toUpperCase() + "'S TURN");
            renderTable();
            checkAITurn();
            if (gameMode === "online") pushGameState();
        }
    } else {
        // Joiners render local changes, then catch up to Host's math if it arrived early
        renderTable();
        if (pendingGameState) applyHostState(pendingGameState);
    }
}

async function processPairsAsync(pIdx, isSilent = false) {
    let hand = hands[pIdx];
    let rankGroups = {};
    let newHand = [];
    let pairsFound = 0;

    hand.forEach(card => {
        if (!rankGroups[card.rank]) rankGroups[card.rank] = [];
        rankGroups[card.rank].push(card);
    });

    for (let rank in rankGroups) {
        let group = rankGroups[rank];
        if (group.length % 2 !== 0) newHand.push(group[0]);
        for(let i = 0; i < Math.floor(group.length / 2); i++) {
            discardPile.push(group[i * 2 + 1]);
            discardPile.push(group[i * 2 + (group.length === 3 ? 2 : 0)] || group[0]); 
            pairsFound++;
        }
    }

    if (pairsFound > 0) {
        if (!isSilent) setStatus(`${playerNames[pIdx]} found a pair!`);
        hands[pIdx] = newHand;
        playCustomSound('play');
        renderTable();
        if (!isSilent) await sleep(1200); 
    }
}

function checkWinConditions() {
    let activePlayers = 0;
    let lastActiveIdx = -1;

    for (let i = 0; i < playerCount; i++) {
        if (!safePlayers[i] && hands[i].length === 0) {
            safePlayers[i] = true;
            if (i === myId - 1) { playCustomSound('win'); showToast("SAFE!", "You matched all your cards!"); }
        }
        if (!safePlayers[i]) {
            activePlayers++;
            lastActiveIdx = i;
        }
    }

    if (activePlayers <= 1) {
        isGameOver = true; gameIsActive = false; isAnimating = false;
        renderTable();
        
        let loserName = playerNames[lastActiveIdx];
        setStatus("GAME OVER! " + loserName + " is the OLD MAID!");
        
        if (lastActiveIdx === myId - 1) {
            playCustomSound('lose'); showToast("Oh no!", "You are the Old Maid! 👵", true);
            if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("old-maid");
        } else {
            if (typeof SystemStats !== 'undefined') SystemStats.recordWin("old-maid", 0);
            showToast("You win!", `${loserName} got stuck with the Old Maid.`, true);
        }
        
        document.getElementById("start-game-btn").classList.remove("hidden");
        document.getElementById("start-game-btn").innerText = "PLAY AGAIN";
        if (gameMode === "online" && isHost) pushGameState();
    }
}

async function checkAITurn() {
    if (gameMode === "online" && !isHost) return;
    if (!gameIsActive || isGameOver || activeTurn === (myId - 1) || isAnimating) return;
    
    let isBot = false;
    if (gameMode === "ai") isBot = true;
    else if (gameMode === "online" && seats[activeTurn]?.type === "ai") isBot = true;

    if (isBot) {
        isAnimating = true;
        let thinkTime = aiDifficulty === "hard" ? 800 : (aiDifficulty === "easy" ? 2000 : 1200);
        await sleep(thinkTime);
        playAITurn();
    }
}

function playAITurn() {
    if (isGameOver) return;
    let targetIdx = getNextActive(activeTurn);
    let targetHandSize = hands[targetIdx].length;
    let randomCardIdx = Math.floor(Math.random() * targetHandSize);

    if (gameMode === "online") {
        // Send AI action through network so joiners see it animate too
        sendBroadcastAction('steal', targetIdx, randomCardIdx, activeTurn);
    } else {
        executeStealAsync(activeTurn, targetIdx, randomCardIdx);
    }
}

// ── UI RENDERING ──────────────────────────
function renderTable() {
    const seatMap = { 
        2: { bottom: 0, top: 1 }, 
        3: { bottom: 0, left: 1, right: 2 }, 
        4: { bottom: 0, left: 1, top: 2, right: 3 } 
    };
    
    const config = seatMap[playerCount] || seatMap[2];
    const ids = {
        bottom: { name: "player-name", cards: "player-cards", area: "player-area" },
        top:    { name: "opp-name", cards: "opp-cards", area: "opponent-area" },
        left:   { name: "left-name", cards: "left-cards", area: "left-area" },
        right:  { name: "right-name", cards: "right-cards", area: "right-area" }
    };

    ["opponent-area", "left-area", "right-area"].forEach(id => document.getElementById(id).classList.add("hidden"));

    let targetToStealFrom = getNextActive(activeTurn);
    let isMyTurn = (activeTurn === (myId - 1));

    Object.entries(config).forEach(([pos, relIdx]) => {
        const pIdx = (myId - 1 + relIdx) % playerCount;
        const ui = ids[pos];
        const areaEl = document.getElementById(ui.area);
        if (!areaEl) return;

        areaEl.classList.remove("hidden");
        document.getElementById(ui.name).innerText = safePlayers[pIdx] ? `👑 ${playerNames[pIdx]} (SAFE)` : playerNames[pIdx];
        areaEl.classList.toggle("active-turn", activeTurn === pIdx && !isGameOver);

        const cardBox = document.getElementById(ui.cards);
        cardBox.innerHTML = '';
        
        if (hands[pIdx]) {
            hands[pIdx].forEach((c, idx) => {
                let el = document.createElement("div"); 
                el.className = "card";
                
                let isHidden = (pIdx !== (myId-1) && !isGameOver);
                if (isHidden) {
                    el.classList.add("hidden-card");
                    if (isMyTurn && pIdx === targetToStealFrom && gameIsActive && !isGameOver && !isAnimating) {
                        el.classList.add("stealable-card");
                        el.onclick = () => attemptSteal(pIdx, idx);
                    }
                } else {
                    const suitMap = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" }, rankMap = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
                    el.innerHTML = `<img src="../../system/images/cards/standard/card${suitMap[c.suit]}${rankMap[c.rank]||c.rank}.png" style="width:100%;height:100%;border-radius:6px;">`;
                }
                cardBox.appendChild(el);
            });
        }
    });

    const discardBox = document.getElementById("discard-pile");
    discardBox.innerHTML = '';
    discardPile.slice(-4).forEach((c, i) => {
        let el = document.createElement("div"); 
        el.className = "card"; el.style.zIndex = i;
        let rot = (i * 12) - 18;
        el.style.transform = `rotate(${rot}deg) translateX(-50%) translateY(-50%)`;
        const suitMap = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" }, rankMap = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
        el.innerHTML = `<img src="../../system/images/cards/standard/card${suitMap[c.suit]}${rankMap[c.rank]||c.rank}.png" style="width:100%;height:100%;border-radius:6px;">`;
        discardBox.appendChild(el);
    });
}

function setStatus(msg) { 
    const el = document.getElementById("game-status-text");
    if (el) el.innerText = msg; 
}

function showToast(title, msg) { 
    document.getElementById("modal-title").innerText = title; 
    document.getElementById("modal-message").innerText = msg; 
    document.getElementById("toast-modal").classList.remove("hidden"); 
    setTimeout(() => document.getElementById("toast-modal").classList.add("hidden"), 3000); 
}

function resetGame() {
    gameIsActive = false; isGameOver = false; isAnimating = false; pendingGameState = null;
    hands = [[], [], [], []]; discardPile = []; safePlayers = [false, false, false, false];
    document.getElementById("start-game-btn").classList.remove("hidden");
    document.getElementById("start-game-btn").innerText = "START GAME";
    setStatus("Waiting to start...");
    renderTable();
}

document.getElementById("start-game-btn").addEventListener("click", startGame);

// ── ONLINE MULTIPLAYER ──────────────────────
function _omRenderPreview() {
    const slots = [{ type: "host", name: SystemUI.getPlayerName(), color: "#e74c3c" }];
    for (let i = 1; i < playerCount; i++) slots.push({ type: "ai", name: "AI " + (i + 1), color: "#3498db" });
    SystemUI.v2Lobby.updatePreview(slots);
}

SystemMatch.setup({
    gameId:   "old-maid",
    roomPath: "maid_rooms",
    autoShow: false,
    getSeatCount: () => playerCount,
    buildSeats: (count) => {
        const out = [{ type: "human", name: SystemUI.getPlayerName() }];
        for (let i = 1; i < count; i++) out.push({ type: "ai", name: "AI " + (i + 1) });
        return out;
    },
    extraRoomFields: () => ({ ts: Date.now() }),
    settingsConfig: [
        { id: "lobby-count", label: "PLAYERS", type: "select", default: playerCount, options: [{value:2, label:"2"},{value:3, label:"3"},{value:4, label:"4"}] }
    ],
    onSettingsRendered: () => _omRenderPreview(),
    onSettingChange: (key, val) => {
        if (key === "lobby-count") {
            playerCount = parseInt(val);
            const localCount = document.getElementById("sys-om-count");
            if (localCount) localCount.value = val;
            if (isHost && currentRoomId) {
                SystemMatch.resizeSeats(playerCount);
                seats = SystemMatch.getSeats();
            }
        }
        _omRenderPreview();
    },
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1;
        onlineDealt = false; gameOverAnnounced = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false;
        myId = SystemMatch.getMyId();
        onlineDealt = false; gameOverAnnounced = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onLeave: () => location.reload(),
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'maid_rooms/' + currentRoomId), { status: "playing", ts: Date.now() });
        }
    }
});

function listenToRoom() {
    roomListener = window.dbOnValue(window.dbRef(window.db, 'maid_rooms/' + currentRoomId), (snap) => {
        const data = snap.val();
        if (!data) {
            // Room node deleted = host left
            if (!isHost && currentRoomId) {
                showToast("Host Left", "Host left the game.");
                exitOnlineToLocal();
            }
            return;
        }
        if (data.status === "abandoned") {
            if (isHost) {
                showToast("Opponent Left", "A player left the game.");
                const oldRoom = currentRoomId;
                exitOnlineToLocal();
                window.dbRemove(window.dbRef(window.db, 'maid_rooms/' + oldRoom));
            }
            return;
        }
        seats = data.seats || []; SystemUI.v2Lobby.renderSeats(seats); playerNames = seats.map(s => s.name);
        playerCount = seats.length;

        if (data.status === "playing") {
            SystemUI.v2Lobby.hide(); document.getElementById("action-zone").classList.remove("hidden");
            if (!chatStarted) { chatStarted = true; SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); }
            // One-shot deal: without these guards the host's own game-over push echoes back
            // (gameIsActive=false) and re-deals forever. Restarts go through the PLAY AGAIN button.
            if (isHost && !gameIsActive && !isGameOver && !onlineDealt) { onlineDealt = true; startGame(); }
            else if (!isHost && data.gameState) applyHostState(data.gameState);
        }
        
        // Listen for animations from anyone
        if (data.playerAction && data.playerAction.ts !== lastActionTs) { 
            lastActionTs = data.playerAction.ts; 
            if (data.playerAction.action === 'steal') executeStealAsync(data.playerAction.thiefIdx, data.playerAction.targetIdx, data.playerAction.cardIdx);
        }
    });
}

function pushGameState() {
    if (gameMode !== "online" || !isHost) return;
    window.dbUpdate(window.dbRef(window.db, 'maid_rooms/' + currentRoomId), { 
        gameState: { hands, discardPile, safePlayers, activeTurn, isGameOver, gameIsActive, ts: Date.now() } 
    });
}

function exitOnlineToLocal() {
    if (roomListener) { roomListener(); roomListener = null; }
    SystemUI.stopChat(); chatStarted = false;
    SystemUI.v2Lobby.hide();
    gameMode = "ai"; myId = 1; isHost = true; currentRoomId = null; onlineDealt = false;
    playerNames = [SystemUI.getPlayerName(), "AI 2", "AI 3", "AI 4"];
    playerCount = parseInt(localStorage.getItem("oldmaid_pcount") || "4");
    const modeEl = document.getElementById("sys-om-mode");
    if (modeEl) modeEl.value = "ai";
    document.getElementById("action-zone").classList.remove("hidden");
    resetGame();
}

window.addEventListener("beforeunload", () => {
    if (gameMode === "online" && currentRoomId && window.db) {
        if (isHost) {
            window.dbRemove(window.dbRef(window.db, 'maid_rooms/' + currentRoomId));
        } else if (gameIsActive) {
            // Joiner vanished mid-game: flag it so the host doesn't wait forever
            window.dbUpdate(window.dbRef(window.db, 'maid_rooms/' + currentRoomId), { status: "abandoned" });
        }
    }
});

// Broadcasts an action to Firebase so all clients (Host & Joiners) execute the animation
function sendBroadcastAction(action, targetIdx, cardIdx, thiefIdx) {
    window.dbUpdate(window.dbRef(window.db, 'maid_rooms/' + currentRoomId), { 
        playerAction: { action, thiefIdx, targetIdx, cardIdx, ts: Date.now() } 
    });
}

function applyHostState(s) {
    if (!s || s.ts <= lastSyncTime) return;

    // Prevent state updates from instantly "snapping" the screen if we are mid-animation
    if (isAnimating) {
        pendingGameState = s;
        return;
    }

    lastSyncTime = s.ts; pendingGameState = null;
    const wasGameOver = isGameOver;
    // RTDB strips empty arrays from snapshots (a "safe" player's hand becomes a hole) —
    // default every array slot on receive
    hands = [0, 1, 2, 3].map(i => (s.hands && s.hands[i]) || []);
    discardPile = s.discardPile || [];
    safePlayers = s.safePlayers || [false, false, false, false];
    activeTurn = s.activeTurn; isGameOver = !!s.isGameOver; gameIsActive = !!s.gameIsActive;
    if (!isGameOver) gameOverAnnounced = false;

    if (!wasGameOver && isGameOver && !gameOverAnnounced) {
        // Non-host: announce the synced game-over (host handles its own in checkWinConditions)
        gameOverAnnounced = true;
        let loserIdx = -1;
        for (let i = 0; i < playerCount; i++) { if (!safePlayers[i]) loserIdx = i; }
        const loserName = playerNames[loserIdx] || "Player";
        renderTable();
        setStatus("GAME OVER! " + loserName + " is the OLD MAID!");
        if (loserIdx === myId - 1) {
            playCustomSound('lose'); showToast("Oh no!", "You are the Old Maid! 👵");
            if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("old-maid");
        } else {
            if (typeof SystemStats !== 'undefined') SystemStats.recordWin("old-maid", 0);
            showToast("You win!", `${loserName} got stuck with the Old Maid.`);
        }
        document.getElementById("start-game-btn").classList.remove("hidden");
        document.getElementById("start-game-btn").innerText = "WAITING FOR HOST...";
        return;
    }
    renderTable(); setStatus(activeTurn === (myId-1) && !isGameOver ? "YOUR TURN - Pick a card!" : playerNames[activeTurn].toUpperCase() + "'S TURN");
}