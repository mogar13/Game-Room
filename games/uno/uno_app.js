// ==========================================
// 1. INITIALIZE OS & STATE (v2.1 4-Player Engine)
// ==========================================
let gameMode = "ai";
localStorage.setItem("uno_mode", "ai"); 

let aiDifficulty = localStorage.getItem("uno_diff") || "normal";
let playerCount  = parseInt(localStorage.getItem("uno_pcount") || "2");

let myId = 1;
let currentRoomId = null;
let isHost = true; 
let chatStarted = false;
let seats = [];
let roomListener = null;

// Monotonic state sequence for ordering pushes. Wall-clock timestamps are
// NOT comparable across machines (clock skew silently dropped opponents'
// moves) — every full-state push bumps this instead.
let stateSeq = 0;

// Unified Player Arrays
let hands = [[], [], [], []];
let playerNames = ["Player 1", "AI 2", "AI 3", "AI 4"];
let calledUnoFlags = [false, false, false, false];

// ── POKER-STYLE POT ────────────────────────────────────────────────────────
// Every seat antes, then anyone can raise on their turn; the others answer
// CALL or FOLD when their own turn comes round. The pot is always the literal
// sum of stakes[], so money is conserved no matter who paid what — a player
// who can't cover a call pays what they have and stays in (no side pots).
let stakes = [0, 0, 0, 0];          // chips each seat has put in this round
let folded = [false, false, false, false];
let owesCall = [false, false, false, false];  // seats that still have to answer the open raise
let callAmount = 0;                 // size of the open raise; 0 = no raise pending
let raiserSeat = 0;
// Raises compound off the pot, so an uncapped table of bots betting house
// money can inflate it without bound. Three opens a round, each capped at 3x
// the ante, bounds a player's worst case at roughly 10x what they anted.
let raiseCount = 0;
const MAX_RAISES_PER_ROUND = 3;
let anteAmount = 0;                 // the round's ante — also the raise unit
let onlineAnte = parseInt(localStorage.getItem("uno_ante") || "0");
let antedRoundId = null;            // round we already paid for — a resync must not double-charge
let currentRoundId = null;
let roundSettled = false;           // makes the payout idempotent
let lastRoundWinner = 0;            // seat (1-4) that won last round; 0 = none yet

// --- CUSTOM UNO AUDIO ---
const sfxDraw = new Audio('../../system/audio/card-draw.ogg');
const sfxPlay = new Audio('../../system/audio/card-shove-2.ogg');
const sfxWin = new Audio('../../system/audio/win.ogg');
const sfxLose = new Audio('../../system/audio/lose.ogg');
const sfxError = new Audio('../../system/audio/error.mp3');
const sfxTurn = new Audio('../../system/audio/glass_004.ogg');
const sfxChip = new Audio('../../system/audio/chip-lay-2.ogg');

function playCustomSound(type) {
    // These bypass SystemAudio.play(), so they have to honour mute themselves.
    if (window.SystemAudio && SystemAudio.isMuted) return;

    let snd;
    if (type === 'draw') snd = sfxDraw;
    else if (type === 'play') snd = sfxPlay;
    else if (type === 'win') snd = sfxWin;
    else if (type === 'lose') snd = sfxLose;
    else if (type === 'error') snd = sfxError;
    else if (type === 'turn') snd = sfxTurn;
    else if (type === 'chip') snd = sfxChip;

    if (snd) {
        snd.pause();
        snd.currentTime = 0;
        snd.play().catch(e => console.log("Audio failed:", e));
    }
}

function logMove(player, msg, isSystem = false) {
    const logDiv = document.getElementById("move-log");
    if (!logDiv) return;
    
    let coloredMsg = msg
        .replace(/RED/gi, "<span style='color:#e74c3c;'>$&</span>")
        .replace(/BLUE/gi, "<span style='color:#3498db;'>$&</span>")
        .replace(/GREEN/gi, "<span style='color:#2ecc71;'>$&</span>")
        .replace(/YELLOW/gi, "<span style='color:#f1c40f;'>$&</span>");

    const entry = document.createElement("div");
    if (isSystem) { 
        entry.innerHTML = `<span class="log-sys">SYSTEM: ${coloredMsg}</span>`; 
    } else { 
        const pIdx = playerNames.indexOf(player);
        const pClass = (pIdx + 1 === myId) ? "log-p1" : "log-p2"; 
        entry.innerHTML = `<span class="${pClass}">${player}</span> ${coloredMsg}`; 
    }
    
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// --- UNO GAME STATE ---
let deck = [];
let discardPile = [];
let currentTurn = 1; 
let playDirection = 1; // 1 for Clockwise, -1 for Counter-Clockwise
let _prevWasMyTurn = null;

function isMyTurn() {
    return currentTurn === myId;
}

let currentPlayColor = ""; 
let lastSeenUnoYell = "";
let lastLogSync = "";

let cardsToAnimate = [0, 0, 0, 0];
let cardJustPlayed = false;

SystemUI.init({
    gameName: "UNO PRO",
    rules: "Match cards by color or number. Reverse cards change direction. Use Action Cards to mess with opponents. Don't forget to yell UNO when you have one card left!",
    hudDropdowns: [
        { 
            id: "sys-uno-mode", 
            options: [ 
                { value: "ai", label: "🤖 vs AI" }, 
                { value: "online", label: "🌐 Online" } 
            ] 
        }
    ]
});

const checkDBReadyUno = setInterval(() => {
    if (window.db) {
        clearInterval(checkDBReadyUno);
        initUno();
    }
}, 50);

function initUno() {
    const modeEl = document.getElementById("sys-uno-mode");
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", (e) => {
            const newMode = e.target.value;
            // Leaving an in-progress online game as a joiner: hand our seat to an
            // AI (like the beforeunload/onLeave paths) BEFORE tearing down the
            // match, so the host's AI driver keeps the table alive instead of
            // hanging forever on an 'open' seat. Then blank SystemMatch's seat
            // copy so cleanup() doesn't re-open the seat we just handed off
            // (mirrors TTT's exitOnline).
            if (gameMode === "online" && newMode !== "online" && !isHost) {
                releaseMySeat();
                if (window.SystemMatch) SystemMatch.setSeats([]);
            }
            gameMode = newMode;
            localStorage.setItem("uno_mode", gameMode);
            document.getElementById("sys-modal").classList.add("sys-hidden");
            
            if (gameMode === "online") { 
                document.getElementById("start-screen").classList.add("hidden");
                SystemUI.v2Lobby.show(); 
            } else { 
                document.getElementById("start-screen").classList.remove("hidden");
                document.getElementById("game-area").classList.add("hidden");
                SystemUI.v2Lobby.hide(); 
                SystemUI.stopChat(); 
                chatStarted = false; 
                myId = 1; isHost = true;
                if (roomListener) { roomListener(); roomListener = null; }
                // Tear down hosted room / joined seat so it can't ghost in Firebase
                if (window.SystemMatch) SystemMatch.cleanup();
                resetGame();
            }
        });
    }
    
    document.getElementById("start-settings").addEventListener("click", e => {
        const chip = e.target.closest(".ss-chip");
        if (!chip) return;
        const group = chip.dataset.group;
        const val = chip.dataset.val;
        document.querySelectorAll(`.ss-chip[data-group="${group}"]`).forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        if (group === "count") {
            playerCount = parseInt(val);
            localStorage.setItem("uno_pcount", val);
        } else if (group === "ai-diff") {
            aiDifficulty = val;
            localStorage.setItem("uno_diff", val);
        }
    });

    document.querySelectorAll(`.ss-chip[data-group="count"]`).forEach(c => {
        if (c.dataset.val == playerCount) c.classList.add("active");
        else c.classList.remove("active");
    });
    document.querySelectorAll(`.ss-chip[data-group="ai-diff"]`).forEach(c => {
        if (c.dataset.val == aiDifficulty) c.classList.add("active");
        else c.classList.remove("active");
    });

    resetGame();
}

function buildDeck() {
    deck = [];
    const colors = ['red', 'blue', 'green', 'yellow'];
    const actions = ['2plus', 'block', 'inverse'];
    
    colors.forEach(color => {
        deck.push({ id: generateId(), color: color, value: '0', type: 'number', img: `../../system/images/cards/uno/${color}/0_${color}.png`, name: `0 ${color}` });
        for (let i = 1; i <= 9; i++) {
            deck.push({ id: generateId(), color: color, value: i.toString(), type: 'number', img: `../../system/images/cards/uno/${color}/${i}_${color}.png`, name: `${i} ${color}` });
            deck.push({ id: generateId(), color: color, value: i.toString(), type: 'number', img: `../../system/images/cards/uno/${color}/${i}_${color}.png`, name: `${i} ${color}` });
        }
        actions.forEach(action => {
            deck.push({ id: generateId(), color: color, value: action, type: 'action', img: `../../system/images/cards/uno/${color}/${action}_${color}.png`, name: `${action} ${color}` });
            deck.push({ id: generateId(), color: color, value: action, type: 'action', img: `../../system/images/cards/uno/${color}/${action}_${color}.png`, name: `${action} ${color}` });
        });
    });
    for (let i = 0; i < 4; i++) {
        deck.push({ id: generateId(), color: 'wild', value: 'wild_card', type: 'wild', img: `../../system/images/cards/uno/wild/wild_card.png`, name: "Wild Card" });
        deck.push({ id: generateId(), color: 'wild', value: '4_plus', type: 'wild', img: `../../system/images/cards/uno/wild/4_plus.png`, name: "Wild Draw 4" });
    }
    shuffleDeck();
}

function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function generateId() { return Math.random().toString(36).substr(2, 9); }

// Last round's winner leads the next one instead of the host always going
// first. Falls back to seat 1 on the opening round, or when the winner's seat
// no longer exists because the player count changed or someone left.
function firstTurnSeat() {
    return (lastRoundWinner >= 1 && lastRoundWinner <= playerCount) ? lastRoundWinner : 1;
}

function startGame() {
    if (gameMode === "online" && !isHost) return;

    // Take the ante before anything moves on screen: a refused commit has to
    // leave the player on the start screen with their chips still on the rack.
    let pendingAnte = 0;
    if (gameMode !== "online") {
        pendingAnte = commitAiAnte();
        if (pendingAnte === false) return;
    }

    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("uno");

    playCustomSound('draw');
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("game-area").classList.remove("hidden");
    document.getElementById("move-log").classList.remove("hidden");
    document.getElementById("move-log").innerHTML = "";

    buildDeck();
    hands = [[], [], [], []];
    calledUnoFlags = [false, false, false, false];
    resetPotState();
    playDirection = 1;

    if (gameMode !== "online") {
        playerNames = ["Player 1", "AI 2", "AI 3", "AI 4"];
        playerNames[0] = (typeof SystemUI.getPlayerName === 'function') ? SystemUI.getPlayerName() : "Player";

        anteAmount = pendingAnte;
        // The house antes for each bot so the pot matches what the player put up.
        if (pendingAnte > 0) for (let i = 0; i < playerCount; i++) stakes[i] = pendingAnte;
    }

    currentTurn = firstTurnSeat();
    const leadMsg = (lastRoundWinner && currentTurn === lastRoundWinner)
        ? "won the last round and leads." : null;

    for (let i = 0; i < playerCount; i++) {
        cardsToAnimate[i] = 7;
        for (let j = 0; j < 7; j++) {
            hands[i].push(deck.pop());
        }
    }

    let firstCard = deck.pop();
    while (firstCard.type === 'wild' || firstCard.type === 'action') {
        deck.unshift(firstCard);
        firstCard = deck.pop();
    }
    discardPile = [firstCard];
    currentPlayColor = firstCard.color;
    cardJustPlayed = true;

    logMove("SYSTEM", "Game started!", true);
    if (leadMsg) logMove(playerNames[currentTurn - 1], leadMsg);

    if (gameMode === "online") {
        // A fresh round id gates the ante so every client pays exactly once.
        currentRoundId = "r" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        // Clear last round's stakes BEFORE the new id goes out, or this reset
        // would land on top of chips already paid into the new round.
        window.dbSet(window.dbRef(window.db, `uno_rooms/${currentRoomId}/stakes`), null);
        pushAllHandsToFirebase();
        pushGameState(null, leadMsg, playerNames[currentTurn - 1]);
    }

    renderHand();
    renderTable();

    // The leader can be a bot now that the winner leads — nudge it.
    maybeScheduleAi();
}

function renderHand() {
    const handDiv = document.getElementById("player-hand");
    if (!handDiv) return;
    handDiv.innerHTML = "";
    
    const myActualHand = hands[myId - 1] || [];
    myActualHand.forEach((card, index) => {
        const cardEl = document.createElement("div");
        cardEl.className = "uno-card";
        cardEl.style.zIndex = index; 
        cardEl.style.backgroundImage = `url('${card.img}')`;
        if (index >= myActualHand.length - cardsToAnimate[myId - 1]) {
            cardEl.classList.add("anim-draw-player");
        }
        cardEl.addEventListener("click", () => attemptPlayCard(index));
        handDiv.appendChild(cardEl);
    });
    
    cardsToAnimate[myId - 1] = 0; 
    
    if (myActualHand.length === 1 && isMyTurn() && !calledUnoFlags[myId - 1]) { 
        document.getElementById("uno-btn").classList.remove("hidden"); 
    } else { 
        document.getElementById("uno-btn").classList.add("hidden");
        if (myActualHand.length > 1) calledUnoFlags[myId - 1] = false;
    }
}

function renderTable() {
    const discardDiv = document.getElementById("discard-pile");
    if (discardDiv && discardPile.length > 0) {
        discardDiv.innerHTML = "";
        const topCard = discardPile[discardPile.length - 1];
        const cardEl = document.createElement("div");
        cardEl.className = "uno-card";
        cardEl.style.backgroundImage = `url('${topCard.img}')`;
        cardEl.style.marginLeft = "0";
        cardEl.style.transform = "none";
        
        if (cardJustPlayed) { 
            cardEl.classList.add("anim-play-card"); 
            cardJustPlayed = false; 
        }
        discardDiv.appendChild(cardEl);
    }
    
    const colorInd = document.getElementById("color-indicator");
    if (colorInd) {
        if (!currentPlayColor) colorInd.classList.add("hidden");
        else {
            colorInd.classList.remove("hidden");
            colorInd.innerText = `COLOR: ${currentPlayColor.toUpperCase()}`;
            const hexColors = { red:'#e74c3c', blue:'#3498db', green:'#2ecc71', yellow:'#f1c40f' };
            colorInd.style.backgroundColor = hexColors[currentPlayColor];
        }
    }

    const countBubble = document.getElementById("deck-count");
    if (countBubble) {
        countBubble.innerText = deck.length;
        countBubble.classList.remove("hidden");
    }

    const dirContainer = document.getElementById("direction-container");
    if (dirContainer) {
        dirContainer.className = playDirection === 1 ? "dir-clockwise" : "dir-counter";
        
        const arrowTop = dirContainer.querySelector('.arrow-top');
        const arrowRight = dirContainer.querySelector('.arrow-right');
        const arrowBottom = dirContainer.querySelector('.arrow-bottom');
        const arrowLeft = dirContainer.querySelector('.arrow-left');
        
        if (arrowTop && arrowRight && arrowBottom && arrowLeft) {
            if (playDirection === 1) {
                arrowTop.innerText = "→";
                arrowRight.innerText = "↓";
                arrowBottom.innerText = "←";
                arrowLeft.innerText = "↑";
            } else {
                arrowTop.innerText = "←";
                arrowRight.innerText = "↑";
                arrowBottom.innerText = "→";
                arrowLeft.innerText = "↓";
            }
        }
    }

    const seatMap = {
        2: { top: 1 },
        3: { left: 1, right: 2 },
        4: { left: 1, top: 2, right: 3 }
    };

    const config = seatMap[playerCount] || { top: 1 };
    document.getElementById("left-area").classList.add("hidden");
    document.getElementById("right-area").classList.add("hidden");
    document.getElementById("opponent-area").classList.add("hidden");

    Object.keys(config).forEach(pos => {
        const relativeIdx = config[pos];
        const actualIdx = (myId - 1 + relativeIdx) % playerCount;
        const pName = playerNames[actualIdx];
        const pHandLen = hands[actualIdx] ? hands[actualIdx].length : 0;
        
        const areaId = pos === "top" ? "opponent-area" : (pos + "-area");
        const labelId = pos === "top" ? "p2-label" : ("p" + (actualIdx + 1) + "-label");
        const handId = pos === "top" ? "opponent-hand" : (pos + "-hand");
        
        const areaEl = document.getElementById(areaId);
        if (areaEl) {
            areaEl.classList.remove("hidden");
            areaEl.classList.toggle("seat-folded", !!folded[actualIdx]);
            const labelEl = document.getElementById(labelId);
            if (labelEl) labelEl.innerHTML = pName; 
            
            const hDiv = document.getElementById(handId);
            hDiv.innerHTML = "";
            for (let i = 0; i < pHandLen; i++) {
                const cEl = document.createElement("div");
                cEl.className = "uno-card";
                cEl.style.backgroundImage = `url('../../system/images/cards/uno/card-back/card_back.png')`;
                
                if (pos === "left") cEl.style.transform = "rotate(90deg)";
                if (pos === "right") cEl.style.transform = "rotate(-90deg)";

                if (i >= pHandLen - cardsToAnimate[actualIdx]) {
                    if (pos === "top") cEl.classList.add("anim-draw-opponent");
                    else if (pos === "left") cEl.classList.add("anim-draw-left");
                    else if (pos === "right") cEl.classList.add("anim-draw-right");
                }
                hDiv.appendChild(cEl);
            }
        }
        cardsToAnimate[actualIdx] = 0;
    });

    document.getElementById("p1-label").innerText = playerNames[myId - 1];
    document.getElementById("player-area").classList.toggle("seat-folded", !!folded[myId - 1]);
    updatePotUI();
    updateTurnBanner();
}

function updateTurnBanner() {
    const seatIds = ["p1-label", "p2-label", "p3-label", "p4-label"];
    const posToId = { bottom: "p1-label", top: "p2-label", left: "p3-label", right: "p4-label" };
    const seatMap = {
        2: { bottom: 0, top: 1 },
        3: { bottom: 0, left: 1, right: 2 },
        4: { bottom: 0, left: 1, top: 2, right: 3 }
    };
    
    seatIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove("active-name-glow");
    });

    const config = seatMap[playerCount] || { bottom: 0, top: 1 };
    const handWrapper = document.getElementById("player-hand-wrapper");

    Object.entries(config).forEach(([pos, relativeIdx]) => {
        const actualPlayerIdx = (myId - 1 + relativeIdx) % playerCount;
        const labelId = posToId[pos];
        const labelEl = document.getElementById(labelId);
        
        if (labelEl) {
            let baseName = playerNames[actualPlayerIdx];
            if (folded[actualPlayerIdx]) {
                labelEl.innerHTML = `${baseName} <span class="fold-tag">FOLDED</span>`;
            } else if (actualPlayerIdx + 1 === currentTurn) {
                labelEl.innerHTML = `⭐ ${baseName}`;
                labelEl.classList.add("active-name-glow");
            } else {
                labelEl.innerHTML = baseName;
            }
        }
    });

    const mine = isMyTurn();
    if (handWrapper) {
        if (mine) handWrapper.classList.add("my-turn-glow");
        else handWrapper.classList.remove("my-turn-glow");
    }

    if (mine && _prevWasMyTurn === false) showTurnToast();
    _prevWasMyTurn = mine;

    // An open raise has to be answered before this seat can act.
    if (mine && owesCall[myId - 1] && !folded[myId - 1]) showCallPrompt();

    const banner = document.getElementById("turn-banner");
    if (banner) {
        banner.classList.remove("hidden");
        const isBot = isBotSeat(currentTurn);
        banner.innerText = isBot ? `${playerNames[currentTurn-1].toUpperCase()} IS THINKING...` : `${playerNames[currentTurn-1].toUpperCase()}'S TURN`;
    }
}

function resetGame() {
    hands = [[], [], [], []]; discardPile = []; deck = []; calledUnoFlags = [false, false, false, false];
    resetPotState();
    document.getElementById("player-area").classList.remove("seat-folded");
    document.getElementById("player-hand").innerHTML = "";
    document.getElementById("opponent-hand").innerHTML = "";
    document.getElementById("left-hand").innerHTML = "";
    document.getElementById("right-hand").innerHTML = "";
    const logDiv = document.getElementById("move-log");
    if (logDiv) { logDiv.innerHTML = ""; logDiv.classList.add("hidden"); }
    document.getElementById("game-area").classList.add("hidden");
    document.getElementById("uno-btn").classList.add("hidden");

    if (gameMode === "online" && currentRoomId) {
        document.getElementById("start-screen").classList.add("hidden");
        
        // FIXED: Host explicitly resets the Lobby UI and room status to allow a new round
        if (isHost) {
            document.getElementById("v2-lobby-overlay").classList.remove("sys-hidden");
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
            window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { status: "waiting" });
        }
    } else {
        document.getElementById("start-screen").classList.remove("hidden");
        const startBtn = document.getElementById("start-game-btn");
        if (gameMode === "online" && !isHost) {
            if (startBtn) { startBtn.innerText = "Waiting for Host..."; startBtn.disabled = true; }
        } else {
            if (startBtn) { startBtn.disabled = false; }
            refreshBetUI();
        }
    }
}

function attemptPlayCard(index) {
    if (!isMyTurn() || !canAct()) return;
    const selectedCard = hands[myId - 1][index];
    const topCard = discardPile[discardPile.length - 1];
    
    if (isValidPlay(selectedCard, topCard)) {
        hands[myId - 1].splice(index, 1);
        discardPile.push(selectedCard);
        cardJustPlayed = true;
        playCustomSound('play');
        logMove(playerNames[myId - 1], `played ${selectedCard.name.toUpperCase()}`);

        if (gameMode === "online") pushHandToFirebase(myId - 1);

        if (selectedCard.type === 'wild') {
            renderHand();
            renderTable();
            document.getElementById('color-picker-modal').classList.remove('hidden');
        } else {
            currentPlayColor = selectedCard.color;
            handleActionCard(selectedCard, myId);
        }
    } else { playCustomSound('error'); }
}

document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        currentPlayColor = e.target.dataset.color;
        document.getElementById('color-picker-modal').classList.add('hidden');
        logMove("SYSTEM", `Color changed to ${currentPlayColor.toUpperCase()}`, true);
        handleActionCard(discardPile[discardPile.length - 1], myId); 
    });
});

document.getElementById("uno-btn").addEventListener("click", () => {
    calledUnoFlags[myId - 1] = true;
    document.getElementById("uno-btn").classList.add("hidden");
    logMove(playerNames[myId - 1], `YELLED UNO!`);
    showUnoShout(playerNames[myId - 1]);
    // Yells must NOT push the full game state: the yeller may not hold the
    // turn, and a stale full-state write would revert everyone's board.
    if (gameMode === "online") pushYell(playerNames[myId - 1]);
});

function handleActionCard(card, playerNum) {
    let skipCount = 0;
    
    if (card.value === '2plus') { 
        const victim = getNextPlayerIndex(1);
        drawCardsFor(victim, 2); 
        skipCount = 1;
        logMove("SYSTEM", `${playerNames[victim-1]} draws 2 and is skipped!`, true); 
    } else if (card.value === '4_plus') { 
        const victim = getNextPlayerIndex(1);
        drawCardsFor(victim, 4); 
        skipCount = 1;
        logMove("SYSTEM", `${playerNames[victim-1]} draws 4 and is skipped!`, true); 
    } else if (card.value === 'block') { 
        skipCount = 1;
        logMove("SYSTEM", `${playerNames[getNextPlayerIndex(1)-1]} is skipped!`, true); 
    } else if (card.value === 'inverse') {
        // Reverse acts as a skip once only two players are still in — folded
        // seats are out of the rotation, so seat count is the wrong measure.
        if (livePlayers().length === 2) skipCount = 1;
        else playDirection *= -1;
        logMove("SYSTEM", `Direction reversed!`, true);
    }

    if (hands[playerNum - 1].length === 0 && !calledUnoFlags[playerNum - 1]) { 
        logMove("SYSTEM", `${playerNames[playerNum-1]} forgot to yell UNO! +2 Penalty.`, true); 
        if (playerNum === myId) showPenaltyToast();
        drawCardsFor(playerNum, 2);
        calledUnoFlags[playerNum - 1] = false;
    }

    if (hands[playerNum - 1].length === 0) {
        declareWinner(playerNum, true);
        return;
    }

    advanceTurn(skipCount + 1, `played ${card.name.toUpperCase()}`);
}

// Steps forward `steps` LIVE seats — folded players are not in the rotation,
// so a skip card lands on the next player who is still in the round. The lap
// guard stops an all-folded table from spinning forever.
function getNextPlayerIndex(steps) {
    let next = currentTurn;
    for (let i = 0; i < steps; i++) {
        let laps = 0;
        do {
            next = (next - 1 + playDirection + playerCount) % playerCount + 1;
            laps++;
        } while (folded[next - 1] && laps <= playerCount);
    }
    return next;
}

function isValidPlay(card, topCard) {
    if (card.type === 'wild') return true;
    if (card.color === currentPlayColor) return true;
    if (card.value === topCard.value) return true;
    return false;
}

function drawCardsFor(playerNum, num) {
    cardsToAnimate[playerNum - 1] += num;
    const idx = playerNum - 1;
    const isOwned = gameMode !== "online" || ownedHandIndices().includes(idx);
    const drawnCards = [];

    for (let i = 0; i < num; i++) {
        if (deck.length === 0) {
            const top = discardPile.pop();
            deck = [...discardPile];
            shuffleDeck();
            discardPile = [top];
        }
        if (deck.length > 0) {
            const card = deck.pop();
            drawnCards.push(card);
            if (isOwned) (hands[idx] = hands[idx] || []).push(card);
            else (hands[idx] = hands[idx] || []).push({ placeholder: true });
        }
    }

    if (gameMode === "online") {
        if (isOwned) pushHandToFirebase(idx);
        else pushIncomingCards(idx, drawnCards);
    }
}

function drawCard() {
    if (!isMyTurn() || !canAct()) return;
    drawCardsFor(myId, 1);
    playCustomSound('draw'); 
    logMove(playerNames[myId - 1], "drew a card.");
    advanceTurn(1, "drew a card.");
}

function advanceTurn(steps, logMsg) {
    let previousPlayerName = playerNames[currentTurn - 1];
    currentTurn = getNextPlayerIndex(steps);

    if (gameMode === "online") pushGameState(null, logMsg, previousPlayerName);

    renderHand();
    renderTable();

    maybeScheduleAi();
}

function isBotSeat(seat) {
    return seats[seat - 1]?.type === 'ai' || (gameMode === "ai" && seat !== 1);
}

// Only the host drives bots, so only the host schedules their turns.
function maybeScheduleAi() {
    if (isHost && isBotSeat(currentTurn)) scheduleAiTurn();
}

// Coalesce AI-turn scheduling. Multiple room writes (a move, then a yell,
// then a hand sync) can each try to schedule the same AI turn — without a
// token the AI would play twice and corrupt the game.
let aiMoveToken = 0;
function scheduleAiTurn() {
    const tok = ++aiMoveToken;
    setTimeout(() => { if (tok === aiMoveToken) aiTurn(); }, 1500);
}

function aiTurn() {
    if (gameMode === "online" && seats[currentTurn - 1]?.type !== 'ai') return;
    if (gameMode === "ai" && currentTurn === 1) return;
    if (!discardPile.length) return;

    const pIdx = currentTurn - 1;
    if (!hands[pIdx]) return;
    // Freshly-adopted seat (player left mid-game): the real cards may still
    // be in flight from Firebase — retry until placeholders are replaced.
    if (hands[pIdx].some(c => c && c.placeholder)) { scheduleAiTurn(); return; }
    if (folded[pIdx]) { advanceTurn(1, "is out of the round."); return; }

    // Settle the money before touching cards: answer any open raise, then
    // decide whether to put more in.
    if (owesCall[pIdx]) {
        if (aiCallDecision(pIdx) === 'fold') { doFold(currentTurn); return; }
        doCall(currentTurn);
    }
    if (aiShouldRaise(pIdx)) doRaise(currentTurn, aiRaiseAmount(pIdx));

    const topCard = discardPile[discardPile.length - 1];
    let playable = [];
    for (let i = 0; i < hands[pIdx].length; i++) { 
        if (isValidPlay(hands[pIdx][i], topCard)) playable.push(i); 
    }

    if (playable.length > 0) {
        let chosen = playable[0];
        if (aiDifficulty === "hard") {
            let act = playable.filter(idx => hands[pIdx][idx].type === 'action');
            if (act.length > 0) chosen = act[0];
        }
        
        const played = hands[pIdx].splice(chosen, 1)[0];
        discardPile.push(played); cardJustPlayed = true; playCustomSound('play');
        logMove(playerNames[pIdx], `played ${played.name.toUpperCase()}`);

        if (gameMode === "online") pushHandToFirebase(pIdx);

        if (hands[pIdx].length === 1) {
            calledUnoFlags[pIdx] = true;
            showUnoShout(playerNames[pIdx]);
            if (gameMode === "online") pushYell(playerNames[pIdx]);
        }
        
        if (played.type === 'wild') {
            const colors = ['red', 'blue', 'green', 'yellow'];
            currentPlayColor = colors[Math.floor(Math.random() * 4)];
            logMove("SYSTEM", `Color changed to ${currentPlayColor.toUpperCase()}`, true);
        } else currentPlayColor = played.color;
        
        handleActionCard(played, currentTurn);
    } else {
        drawCardsFor(currentTurn, 1); 
        playCustomSound('draw'); 
        logMove(playerNames[pIdx], "drew a card.");
        advanceTurn(1, "drew a card.");
    }
}

// ══════════════════════════════════════════════════════════════════════════
// THE POT — ANTE, RAISE, CALL, FOLD
// Every seat antes, then anyone can raise on their turn. The others answer
// CALL or FOLD when their own turn comes round, which keeps every money
// decision turn-ordered and deterministic across clients. The pot is always
// the literal sum of stakes[], so money is conserved no matter who paid what.
// ══════════════════════════════════════════════════════════════════════════

function resetPotState() {
    stakes = [0, 0, 0, 0];
    folded = [false, false, false, false];
    owesCall = [false, false, false, false];
    callAmount = 0;
    raiserSeat = 0;
    raiseCount = 0;
    anteAmount = 0;
    roundSettled = false;
    // Arm the turn toast so it fires on the opening turn of the round too —
    // it matters now that the round's leader changes from game to game.
    _prevWasMyTurn = false;
    hideBetModals();
}

function potTotal() {
    return stakes.reduce((a, b) => a + (b || 0), 0);
}

function livePlayers() {
    const out = [];
    for (let i = 0; i < playerCount; i++) if (!folded[i]) out.push(i + 1);
    return out;
}

// The chip unit a raise is measured in: the round's ante.
function unitBet() { return anteAmount > 0 ? anteAmount : 25; }

function myMoney() { return window.SystemProfile ? SystemProfile.getMoney() : 0; }

// Blocks card play while this seat still owes an answer to an open raise.
function canAct() {
    if (folded[myId - 1]) return false;
    if (owesCall[myId - 1]) { showCallPrompt(); return false; }
    return true;
}

function canSeatRaise(seat) {
    return potTotal() > 0 && !roundSettled
        && !folded[seat - 1]
        && !owesCall[seat - 1]
        && callAmount === 0                 // one open raise at a time
        && raiseCount < MAX_RAISES_PER_ROUND
        && livePlayers().length > 1;
}

// Moves chips into the pot for `seat`. Only my own seat debits a real
// bankroll — bot seats are covered by the house, and other humans debit
// themselves on their own client. Returns what actually went in, which can be
// short of `amount` when the player is out of money.
function payIn(seat, amount) {
    if (amount <= 0) return 0;
    let paid = amount;
    if (seat === myId) {
        paid = Math.max(0, Math.min(amount, myMoney()));
        if (paid > 0) SystemProfile.removeMoney(paid);
    }
    stakes[seat - 1] = (stakes[seat - 1] || 0) + paid;
    writeStake(seat - 1, stakes[seat - 1]);
    if (paid > 0) playCustomSound('chip');
    updatePotUI();
    return paid;
}

function doRaise(seat, amount) {
    if (!canSeatRaise(seat) || amount <= 0) return;
    const paid = payIn(seat, amount);
    if (paid <= 0) return;

    callAmount = paid;
    raiserSeat = seat;
    raiseCount++;
    // Everyone still in the round owes an answer on their next turn.
    for (let i = 0; i < playerCount; i++) owesCall[i] = (i !== seat - 1) && !folded[i];

    const msg = `raised $${paid}.`;
    logMove(playerNames[seat - 1], msg);
    if (gameMode === "online") pushGameState(null, msg, playerNames[seat - 1]);
    renderTable();
}

function doCall(seat) {
    if (!owesCall[seat - 1]) return;
    const owed = callAmount;
    const paid = payIn(seat, owed);
    owesCall[seat - 1] = false;
    clearRaiseIfSettled();

    // A short stack shoves what's left and stays in — there are no side pots,
    // so the pot is still exactly what everyone put in.
    const msg = paid < owed ? `is all in for $${paid}.` : `called $${paid}.`;
    logMove(playerNames[seat - 1], msg);
    if (gameMode === "online") pushGameState(null, msg, playerNames[seat - 1]);
    renderTable();
}

function doFold(seat) {
    if (folded[seat - 1] || roundSettled) return;
    folded[seat - 1] = true;
    owesCall[seat - 1] = false;
    clearRaiseIfSettled();
    logMove(playerNames[seat - 1], "folded.");

    const live = livePlayers();
    if (live.length === 1) {
        // Last player standing takes the pot without finishing the hand.
        declareWinner(live[0], true);
        return;
    }

    if (seat === currentTurn) {
        // Folding on your own turn hands play straight to the next live seat.
        advanceTurn(1, "folded.");
    } else {
        if (gameMode === "online") pushGameState(null, "folded.", playerNames[seat - 1]);
        renderHand(); renderTable();
    }
}

// Once everyone still in has answered, the raise closes and the table is free
// to raise again.
function clearRaiseIfSettled() {
    if (owesCall.some((o, i) => o && !folded[i])) return;
    owesCall = [false, false, false, false];
    callAmount = 0;
    raiserSeat = 0;
}

// The one place a round ends, whether it finished locally or arrived over the
// wire. roundSettled makes the payout idempotent — a resync must never pay
// the pot out twice.
function declareWinner(seat, push) {
    if (roundSettled || !seat) return;
    roundSettled = true;
    lastRoundWinner = seat;

    const iWon = (seat === myId);
    const pot = potTotal();

    playCustomSound(iWon ? 'win' : 'lose');
    logMove("SYSTEM", `${playerNames[seat - 1]} WINS!`, true);

    if (iWon && pot > 0 && window.SystemProfile) SystemProfile.addMoney(pot);

    showResultModal(
        iWon ? (pot > 0 ? `🎉 YOU WIN THE $${pot} POT!` : "🎉 YOU WIN!")
             : `😞 ${playerNames[seat - 1]} WINS!`,
        iWon ? "#2ecc71" : "#e74c3c"
    );

    if (typeof SystemStats !== 'undefined') {
        if (iWon) SystemStats.recordWin("uno");
        else SystemStats.recordLoss("uno");
    }

    if (push && gameMode === 'online') {
        // Single atomic push carrying the final hand sizes AND the finished
        // status — the old two-write version raced.
        pushGameState(null, "WINS!", playerNames[seat - 1], "finished");
    }

    updatePotUI();
    setTimeout(resetGame, 2500);
}

// ── AI READ ────────────────────────────────────────────────────────────────

// A 0..1 read on how good seat idx's hand looks: fewer cards is better, more
// playable cards is better, wilds and actions are power — and an opponent
// sitting on one card discounts all of it.
function handStrength(idx) {
    const hand = hands[idx] || [];
    if (!hand.length) return 1;
    const top = discardPile[discardPile.length - 1];
    if (!top) return 0.5;

    let playable = 0, wilds = 0, actions = 0;
    hand.forEach(c => {
        if (!c || c.placeholder) return;
        if (isValidPlay(c, top)) playable++;
        if (c.type === 'wild') wilds++;
        else if (c.type === 'action') actions++;
    });

    const size    = Math.max(0, 1 - (hand.length - 1) / 11);   // 1 card = 1.0, 12+ = 0.0
    const options = Math.min(1, playable / 3);
    const power   = Math.min(1, (wilds * 2 + actions) / 5);

    let threat = 0;
    for (let i = 0; i < playerCount; i++) {
        if (i === idx || folded[i]) continue;
        const n = (hands[i] || []).length;
        if (n > 0 && n <= 2) threat = Math.max(threat, (3 - n) / 3);
    }

    return Math.max(0, Math.min(1, size * 0.5 + options * 0.25 + power * 0.25 - threat * 0.3));
}

// Pot odds meet the hand read: the pricier the call is relative to the pot,
// the stronger the hand has to be to justify paying it.
function aiCallDecision(idx) {
    const price  = callAmount / Math.max(1, potTotal() + callAmount);
    const floor  = { easy: 0.10, normal: 0.28, hard: 0.36 }[aiDifficulty] ?? 0.28;
    const jitter = (Math.random() - 0.5) * 0.12;
    return (handStrength(idx) + jitter) >= (floor + price * 0.35) ? 'call' : 'fold';
}

// EASY never raises. NORMAL sandbags and only pushes a monster; HARD applies
// real pressure whenever its hand is genuinely ahead.
function aiShouldRaise(idx) {
    if (aiDifficulty === "easy") return false;
    if (!canSeatRaise(idx + 1)) return false;
    const bar  = aiDifficulty === "hard" ? 0.62 : 0.78;
    const odds = aiDifficulty === "hard" ? 0.45 : 0.15;
    return handStrength(idx) >= bar && Math.random() < odds;
}

// Bots bet house money, so cap the size too — a pot-fraction raise compounds
// fast and a human calling it should always be able to read the number.
function aiRaiseAmount(idx) {
    const frac = aiDifficulty === "hard" ? 0.5 : 0.34;
    const want = Math.max(unitBet(), Math.round(potTotal() * frac));
    return Math.min(want, unitBet() * 3);
}

// ── POT UI ─────────────────────────────────────────────────────────────────

function updatePotUI() {
    const row     = document.getElementById("uno-money-row");
    const potEl   = document.getElementById("uno-pot");
    const raiseEl = document.getElementById("uno-raise-btn");
    if (!row || !potEl || !raiseEl) return;

    const pot = potTotal();
    row.classList.toggle("hidden", pot <= 0);
    potEl.innerText = callAmount > 0 ? `POT $${pot} · TO CALL $${callAmount}` : `POT $${pot}`;
    raiseEl.classList.toggle("hidden", !(isMyTurn() && canSeatRaise(myId)));
}

function hideBetModals() {
    const r = document.getElementById("uno-raise-modal");
    const c = document.getElementById("uno-call-prompt");
    if (r) r.classList.add("hidden");
    if (c) c.classList.add("hidden");
}

function raisePresets() {
    const pot = potTotal();
    const cash = myMoney();
    const clamp = v => Math.max(0, Math.min(Math.round(v), cash));
    return { min: clamp(unitBet()), half: clamp(pot / 2), pot: clamp(pot), allin: clamp(cash) };
}

function showRaiseModal() {
    if (!canSeatRaise(myId)) return;
    const modal = document.getElementById("uno-raise-modal");
    const presets = raisePresets();
    document.getElementById("raise-pot-amt").innerText = potTotal();
    document.getElementById("raise-bankroll").innerText = myMoney();
    modal.querySelectorAll(".raise-opt").forEach(btn => {
        const amt = presets[btn.dataset.raise] || 0;
        btn.querySelector("span").innerText = `$${amt}`;
        btn.disabled = amt <= 0;
    });
    modal.classList.remove("hidden");
}

function showCallPrompt() {
    const prompt = document.getElementById("uno-call-prompt");
    if (!prompt || !owesCall[myId - 1] || folded[myId - 1] || roundSettled) return;
    const cash = myMoney();
    const owed = Math.min(callAmount, cash);
    document.getElementById("call-raiser").innerText = (playerNames[raiserSeat - 1] || "A PLAYER").toUpperCase();
    document.getElementById("call-pot-amt").innerText = potTotal();
    document.getElementById("call-bankroll").innerText = cash;
    document.getElementById("call-btn").innerText = owed < callAmount ? `ALL IN $${owed}` : `CALL $${owed}`;
    prompt.classList.remove("hidden");
}

document.getElementById("uno-raise-btn").addEventListener("click", showRaiseModal);
document.getElementById("raise-cancel").addEventListener("click", hideBetModals);
document.querySelectorAll("#uno-raise-modal .raise-opt").forEach(btn => {
    btn.addEventListener("click", () => {
        const amt = raisePresets()[btn.dataset.raise] || 0;
        hideBetModals();
        if (amt > 0) doRaise(myId, amt);
    });
});
document.getElementById("call-btn").addEventListener("click", () => { hideBetModals(); doCall(myId); });
document.getElementById("fold-btn").addEventListener("click", () => { hideBetModals(); doFold(myId); });

// ── ANTE RACK (start screen, AI mode) ──────────────────────────────────────
// SystemBetting.currentBet is the single source of truth for the staged ante;
// keeping a second counter here is exactly what desyncs the "BET: $" readout.
SystemUI.setupBetting("uno-bet-container", {
    minBet: 1,
    onBet:   () => refreshBetUI(),
    onClear: () => refreshBetUI()
});

function stagedAnte() {
    return window.SystemBetting ? (SystemBetting.currentBet || 0) : 0;
}

function refreshBetUI() {
    const btn = document.getElementById("start-game-btn");
    if (!btn) return;
    const bet = stagedAnte();
    btn.innerText = bet > 0 ? `START GAME — ANTE $${bet}` : "START GAME";
}

// Deducts the staged ante. Returns the amount taken, or false when the commit
// was refused — in which case the round must not start.
function commitAiAnte() {
    const bet = stagedAnte();
    if (bet <= 0) return 0;
    const taken = SystemBetting.validateAndCommit();
    if (taken === false) { playCustomSound('error'); return false; }
    // Zero SystemBetting's own counter without firing onClear: the chips are
    // on the table now, not on the rack. REPEAT still restages them.
    SystemBetting.currentBet = 0;
    SystemBetting.updateDisplay();
    playCustomSound('chip');
    return taken;
}

refreshBetUI();

document.getElementById("start-game-btn").addEventListener("click", startGame);
document.getElementById("draw-pile").addEventListener("click", drawCard);

function updateLobbyPreview() {
    const slots = [{ type: "host", name: SystemUI.getPlayerName(), color: "#e74c3c" }];
    for (let i = 1; i < playerCount; i++) {
        slots.push({ type: "ai", name: "AI " + (i + 1), color: "#3498db" });
    }
    SystemUI.v2Lobby.updatePreview(slots);
}

SystemMatch.setup({
    gameId:   "uno",
    roomPath: "uno_rooms",
    autoShow: false,
    getSeatCount: () => playerCount,
    buildSeats: (count) => {
        const out = [{ type: "human", name: SystemUI.getPlayerName() }];
        for (let i = 1; i < count; i++) out.push({ type: "ai", name: "AI " + (i + 1) });
        return out;
    },
    extraRoomFields: () => ({ aiDifficulty: aiDifficulty, ante: onlineAnte, ts: Date.now() }),
    settingsConfig: [
        { id: "lobby-count", label: "PLAYERS", type: "select", default: playerCount, options: [{value:2, label:"2"},{value:3, label:"3"},{value:4, label:"4"}] },
        { id: "lobby-ai-diff", label: "AI LEVEL", type: "select", default: aiDifficulty, options: [{value:"easy", label:"EASY"},{value:"normal", label:"NORMAL"},{value:"hard", label:"HARD"}] },
        { id: "lobby-ante", label: "ANTE", type: "select", default: onlineAnte, options: [{value:0, label:"NONE"},{value:25, label:"$25"},{value:100, label:"$100"},{value:500, label:"$500"},{value:1000, label:"$1K"}] }
    ],
    onSettingsRendered: () => updateLobbyPreview(),
    onSettingChange: (key, val) => {
        if (key === "lobby-count") playerCount = parseInt(val);
        if (key === "lobby-ai-diff") aiDifficulty = val;
        if (key === "lobby-ante") {
            onlineAnte = parseInt(val) || 0;
            localStorage.setItem("uno_ante", onlineAnte);
        }
        updateLobbyPreview();

        if (gameMode === "online" && isHost && currentRoomId && window.db) {
            // Use SystemMatch.resizeSeats for player count, then sync the rest
            if (key === "lobby-count") {
                SystemMatch.resizeSeats(playerCount);
                seats = SystemMatch.getSeats();
            }
            window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { aiDifficulty: aiDifficulty, ante: onlineAnte, ts: Date.now() });
        }
    },
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false;
        myId = SystemMatch.getMyId();
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onLeave: () => {
        if (isHost && currentRoomId && window.db) {
            window.dbSet(window.dbRef(window.db, `uno_hands/${currentRoomId}`), null);
            window.dbSet(window.dbRef(window.db, `uno_hand_incoming/${currentRoomId}`), null);
        } else {
            releaseMySeat();
        }
        location.reload();
    },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { status: "playing", ts: Date.now() });
        }
    },
    onClose: () => {
        if (gameMode === "online" && currentRoomId && isHost && currentTurn === 1) {
            if (window.db) {
                window.dbSet(window.dbRef(window.db, `uno_hands/${currentRoomId}`), null);
                window.dbSet(window.dbRef(window.db, `uno_hand_incoming/${currentRoomId}`), null);
            }
        }
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    roomListener = window.dbOnValue(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), (snap) => {
        const data = snap.val();
        if (!data) {
            // Room node deleted = the host left. Without this the joiner
            // just stared at a dead table forever.
            if (!isHost && currentRoomId) {
                showResultModal("🚪 HOST LEFT THE GAME", "#f1c40f");
                setTimeout(() => location.reload(), 2200);
            }
            return;
        }
        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);
        playerNames = seats.map(s => s.name);
        playerCount = seats.length;
        if (data.aiDifficulty) aiDifficulty = data.aiDifficulty;
        if (typeof data.ante === 'number') onlineAnte = data.ante;

        // A new round id means a new pot: clear the local pot, pay in once,
        // then mirror whatever the table has actually staked so far.
        if (data.status === "playing" && data.roundId) payAnteIfNeeded(data.roundId);
        if (data.status === "playing" || data.status === "finished") mirrorStakes(data.stakes);

        const seatsJSON = JSON.stringify(seats) + "|" + (isHost ? "h" : "j") + "|" + myId;
        if (seatsJSON !== lastSeatsJSON) {
            lastSeatsJSON = seatsJSON;
            subscribeToOwnedHands();
        }

        if (data.status === "waiting") {
            document.getElementById("v2-lobby-overlay").classList.remove("sys-hidden");
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, isHost);
            document.getElementById("game-area").classList.add("hidden");
            onlineGameStarted = false; 
        } 
        else if (data.status === "playing" || data.status === "finished") {
            SystemUI.v2Lobby.hide();
            if (!chatStarted) { chatStarted = true; SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); }
            
            if (isHost && !onlineGameStarted && data.status === "playing") {
                onlineGameStarted = true;
                startGame(); 
            } else {
                onlineGameStarted = true;
                syncFromFirebase(data);
            }
        }
    });
}

// --- Per-seat hand storage (privacy: bystanders never receive opponent cards) ---
let handListeners = [];
let incomingListeners = [];
let lastSeatsJSON = "";

function ownedHandIndices() {
    if (!Array.isArray(seats) || seats.length === 0) {
        return (gameMode === "online" && myId) ? [myId - 1] : [];
    }
    const owned = [];
    seats.forEach((s, i) => {
        if (i === myId - 1) owned.push(i);
        else if (isHost && s && s.type === 'ai') owned.push(i);
    });
    return owned;
}

// ── POT SYNC ───────────────────────────────────────────────────────────────
// Each client owns the stakes node for the seats it drives, so nobody can be
// charged by someone else's write.
function writeStake(idx, amount) {
    if (gameMode !== "online" || !currentRoomId || !window.db) return;
    window.dbSet(window.dbRef(window.db, `uno_rooms/${currentRoomId}/stakes/${idx}`), amount);
}

function mirrorStakes(raw) {
    const next = [0, 0, 0, 0];
    if (raw) Object.keys(raw).forEach(k => { next[parseInt(k, 10)] = parseInt(raw[k], 10) || 0; });
    stakes = next;
    updatePotUI();
}

// Firebase hands back a sparse object when the leading entries are falsy, so
// never assume a plain 4-length array came off the wire.
function normBoolArr(v) {
    const out = [false, false, false, false];
    if (v) Object.keys(v).forEach(k => { out[parseInt(k, 10)] = !!v[k]; });
    return out;
}

// Every client pays its own ante exactly once per round id — a resync or a
// stray room write must never charge twice. A player who can't cover the ante
// stakes what they have instead of going negative.
function payAnteIfNeeded(roundId) {
    if (gameMode !== "online" || !roundId || antedRoundId === roundId) return;
    antedRoundId = roundId;
    currentRoundId = roundId;
    resetPotState();

    anteAmount = onlineAnte > 0 ? onlineAnte : 0;
    if (anteAmount <= 0 || !window.SystemProfile) { updatePotUI(); return; }

    const stake = Math.max(0, Math.min(anteAmount, myMoney()));
    if (stake > 0) { SystemProfile.removeMoney(stake); playCustomSound('chip'); }
    stakes[myId - 1] = stake;
    writeStake(myId - 1, stake);

    // The house covers the bots the host is driving so the pot still adds up.
    if (isHost) seats.forEach((s, i) => {
        if (s && s.type === 'ai') { stakes[i] = anteAmount; writeStake(i, anteAmount); }
    });
    updatePotUI();
}

function pushHandToFirebase(idx) {
    if (gameMode !== "online" || !currentRoomId || !window.db) return;
    window.dbSet(window.dbRef(window.db, `uno_hands/${currentRoomId}/${idx}`), hands[idx] || []);
}

function pushAllHandsToFirebase() {
    if (gameMode !== "online" || !currentRoomId || !window.db) return;
    for (let i = 0; i < playerCount; i++) {
        window.dbSet(window.dbRef(window.db, `uno_hands/${currentRoomId}/${i}`), hands[i] || []);
    }
}

function pushIncomingCards(victimIdx, cards) {
    if (gameMode !== "online" || !currentRoomId || !window.db || !cards || cards.length === 0) return;
    const key = Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    window.dbSet(window.dbRef(window.db, `uno_hand_incoming/${currentRoomId}/${victimIdx}/${key}`), cards);
}

function unsubscribeHandListeners() {
    handListeners.forEach(u => { try { u && u(); } catch (e) {} });
    incomingListeners.forEach(u => { try { u && u(); } catch (e) {} });
    handListeners = [];
    incomingListeners = [];
}

function subscribeToOwnedHands() {
    unsubscribeHandListeners();
    if (gameMode !== "online" || !currentRoomId || !window.db) return;
    const owned = ownedHandIndices();

    owned.forEach(idx => {
        const handRef = window.dbRef(window.db, `uno_hands/${currentRoomId}/${idx}`);
        const unsubH = window.dbOnValue(handRef, (snap) => {
            const v = snap.val();
            const arr = Array.isArray(v) ? v : (v == null ? [] : null);
            if (arr === null) return;
            const oldLen = (hands[idx] || []).length;
            if (arr.length > oldLen) cardsToAnimate[idx] = (cardsToAnimate[idx] || 0) + (arr.length - oldLen);
            hands[idx] = arr;
            if (idx === myId - 1) renderHand();
            renderTable();
        });
        handListeners.push(unsubH);

        const incRef = window.dbRef(window.db, `uno_hand_incoming/${currentRoomId}/${idx}`);
        const unsubI = window.dbOnValue(incRef, (snap) => {
            const v = snap.val();
            if (!v) return;
            const incoming = [];
            Object.keys(v).sort().forEach(k => {
                const entry = v[k];
                if (Array.isArray(entry)) incoming.push(...entry);
                else if (entry) incoming.push(entry);
            });
            if (incoming.length === 0) return;
            hands[idx] = (hands[idx] || []).concat(incoming);
            cardsToAnimate[idx] = (cardsToAnimate[idx] || 0) + incoming.length;
            window.dbSet(incRef, null);
            pushHandToFirebase(idx);
            if (idx === myId - 1) renderHand();
            renderTable();
        });
        incomingListeners.push(unsubI);
    });
}

function pushGameState(unoYell = null, logMsg = null, actingPlayerName = null, statusOverride = null) {
    if (gameMode !== "online") return;
    const now = Date.now();
    stateSeq++;
    const handSizes = hands.map(h => (h || []).length);
    // NOTE: Firebase strips empty arrays — when the deck runs dry the `deck`
    // key vanishes from the room node. Receivers must treat a missing deck
    // as [], never as "no state" (the old code froze the game here).
    let payload = { deck, discardPile, turn: currentTurn, direction: playDirection, currentColor: currentPlayColor, status: statusOverride || "playing", seats, handSizes, ts: now, seq: stateSeq, pusher: myId, folded, owesCall, callAmount, raiserSeat, raiseCount };
    // Only the round's winner is carried; clearing it on every other push
    // stops last round's winner from re-arming the next "finished" handler.
    payload.winnerSeat = (statusOverride === "finished") ? (lastRoundWinner || null) : null;
    // Never blank the host's round id — joiners echo back whatever they were told.
    if (currentRoundId) payload.roundId = currentRoundId;

    let pName = actingPlayerName || playerNames[myId-1];

    if (unoYell) {
        payload.lastUnoYell = JSON.stringify({ ts: now, name: unoYell });
        lastSeenUnoYell = payload.lastUnoYell;
    }
    if (logMsg) {
        payload.lastLogSync = JSON.stringify({ ts: now, name: pName, msg: logMsg });
        lastLogSync = payload.lastLogSync;
    }

    window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), payload);
}

// Minimal out-of-turn write: announces a yell WITHOUT touching the game
// state. (A yell used to push the yeller's full — possibly stale — state,
// which could revert the whole game by a turn.)
function pushYell(name) {
    if (gameMode !== "online" || !currentRoomId || !window.db) return;
    const packet = JSON.stringify({ ts: Date.now(), name });
    lastSeenUnoYell = packet;
    window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { lastUnoYell: packet });
}

function parsePacket(str) {
    try { const o = JSON.parse(str); if (o && o.name) return o; } catch (e) {}
    // Legacy "ts_name_msg" format fallback
    const p = String(str).split("_");
    return { ts: p[0], name: p[1], msg: p.slice(2).join("_") };
}

function syncFromFirebase(data) {
    // Yells/log lines are handled BEFORE the pusher/seq guards: they can be
    // written by any player at any time and must never be dropped because
    // the last full-state pusher happened to be us.
    if (data.lastUnoYell && data.lastUnoYell !== lastSeenUnoYell) {
        lastSeenUnoYell = data.lastUnoYell;
        showUnoShout(parsePacket(data.lastUnoYell).name);
    }
    if (data.lastLogSync && data.lastLogSync !== lastLogSync) {
        lastLogSync = data.lastLogSync;
        const p = parsePacket(data.lastLogSync);
        if (p.msg) logMove(p.name, p.msg);
    }

    if (data.pusher && data.pusher === myId) return;
    // Order by monotonic seq, not wall-clock: clients' clocks are not in
    // sync and comparing Date.now() across machines dropped real moves.
    if (data.seq) {
        if (data.seq < stateSeq) return;
        stateSeq = data.seq;
    }

    const hasState = !!(data.discardPile && data.discardPile.length);

    // Only force visibility changes if the status is explicitly "playing"
    if (data.status === "playing" && hasState) {
        document.getElementById("start-screen").classList.add("hidden");
        document.getElementById("game-area").classList.remove("hidden");
        document.getElementById("move-log").classList.remove("hidden");
    }

    if ((data.status === "playing" || data.status === "finished") && hasState) {
        const oldDiscardLen = (discardPile || []).length;
        deck = data.deck || [];            // deck key vanishes when empty — that's a valid state
        discardPile = data.discardPile; currentTurn = data.turn;
        playDirection = data.direction; currentPlayColor = data.currentColor;

        // Pot state is authoritative from the wire: folds and open raises have
        // to agree on every client or the turn rotation itself diverges.
        folded = normBoolArr(data.folded);
        owesCall = normBoolArr(data.owesCall);
        callAmount = data.callAmount || 0;
        raiserSeat = data.raiserSeat || 0;
        raiseCount = data.raiseCount || 0;

        const sizes = data.handSizes || [];
        const owned = ownedHandIndices();
        sizes.forEach((newSize, i) => {
            if (owned.includes(i)) return;
            const oldSize = (hands[i] || []).length;
            if (newSize > oldSize) cardsToAnimate[i] = (cardsToAnimate[i] || 0) + (newSize - oldSize);
            if (newSize !== oldSize) {
                if (newSize > oldSize) {
                    hands[i] = hands[i] || [];
                    for (let k = oldSize; k < newSize; k++) hands[i].push({ placeholder: true });
                } else {
                    hands[i] = (hands[i] || []).slice(0, newSize);
                }
            }
        });

        if (data.discardPile && data.discardPile.length > oldDiscardLen) cardJustPlayed = true;

        renderHand(); renderTable();

        if (data.status === "playing") {
            maybeScheduleAi();
        } else if (data.status === "finished") {
            // A fold-out win leaves nobody on an empty hand, so trust the
            // pushed winnerSeat first and only count cards as a fallback.
            let seat = data.winnerSeat || 0;
            if (!seat) {
                const wi = sizes.findIndex(sz => sz === 0);
                seat = wi === -1 ? 0 : wi + 1;
            }
            if (seat) declareWinner(seat, false);
            else { updatePotUI(); setTimeout(resetGame, 2500); }
        }
    }
}

// Lives in the top-left gutter under the HUD (see #uno-turn-toast in the CSS)
// so it never covers the piles or a hand. Toggled with .show, not .hidden —
// display:none would skip the fade entirely.
function showTurnToast() {
    const t = document.getElementById("uno-turn-toast");
    if (!t) return;
    // Re-renders inside one turn can re-arm this; don't stack the chime.
    if (!t.classList.contains("show")) playCustomSound('turn');
    t.classList.add("show");
    clearTimeout(showTurnToast._timer);
    showTurnToast._timer = setTimeout(() => t.classList.remove("show"), 1800);
}

function showPenaltyToast() {
    let t = document.getElementById("uno-penalty-toast");
    if (!t) {
        t = document.createElement("div"); t.id = "uno-penalty-toast";
        t.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,#c0392b,#e74c3c);color:#fff;font-size:1.4rem;font-weight:900;padding:16px 36px;border-radius:18px;z-index:9999;text-align:center;opacity:0;transition:0.22s;pointer-events:none;";
        document.body.appendChild(t);
    }
    t.innerHTML = "🚫 FORGOT UNO!<br><span style='font-size:0.9rem'>+2 Penalty Cards</span>";
    t.style.opacity = "1"; setTimeout(() => t.style.opacity = "0", 2200);
}

function showUnoShout(n) {
    const s = document.getElementById("uno-shout-display");
    if (s) { s.innerText = `${n} YELLED UNO!`; s.classList.remove("hidden"); s.classList.add("animate-shout"); }
    playCustomSound('win'); setTimeout(() => { if(s) s.classList.add("hidden"); }, 2000);
}

function showResultModal(m, c) {
    let o = document.getElementById("uno-result-modal");
    if (!o) {
        o = document.createElement("div"); o.id = "uno-result-modal";
        o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9998;flex-direction:column;opacity:0;transition:0.3s";
        document.body.appendChild(o);
    }
    o.innerHTML = `<div style="font-size:2.4rem;font-weight:900;color:${c};text-shadow:0 0 30px ${c}">${m}</div>`;
    o.style.opacity = "1"; o.style.display = "flex";
    setTimeout(() => { o.style.opacity = "0"; setTimeout(() => o.style.display="none", 300); }, 2200);
}

// A departing joiner hands their seat to an AI so the match can continue —
// the host already owns AI hands, so it picks up their cards automatically.
function releaseMySeat() {
    if (gameMode !== "online" || !currentRoomId || isHost || !window.db) return;
    if (!Array.isArray(seats) || !seats[myId - 1]) return;
    // Only flip to AI when a game is actually running — in the lobby,
    // SystemMatch releases the seat back to 'open' instead.
    const gameArea = document.getElementById("game-area");
    if (!gameArea || gameArea.classList.contains("hidden")) return;
    const newSeats = seats.map((s, i) =>
        i === myId - 1 ? { type: 'ai', name: (s.name || ('Player ' + myId)) + ' 🤖' } : s
    );
    try {
        window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { seats: newSeats, pusher: myId });
    } catch (e) {}
}

window.addEventListener("beforeunload", () => {
    if (isHost && currentRoomId && gameMode === "online" && window.db) {
        window.dbSet(window.dbRef(window.db, `uno_rooms/${currentRoomId}`), null);
        window.dbSet(window.dbRef(window.db, `uno_hands/${currentRoomId}`), null);
        window.dbSet(window.dbRef(window.db, `uno_hand_incoming/${currentRoomId}`), null);
    } else {
        releaseMySeat();
    }
});