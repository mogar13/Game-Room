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

// --- CUSTOM UNO AUDIO ---
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
            gameMode = e.target.value;
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

function startGame() {
    if (gameMode === "online" && !isHost) return; 
    
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("uno");

    playCustomSound('draw');
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("game-area").classList.remove("hidden");
    document.getElementById("move-log").classList.remove("hidden");
    document.getElementById("move-log").innerHTML = ""; 
    
    buildDeck();
    hands = [[], [], [], []];
    calledUnoFlags = [false, false, false, false];
    currentTurn = 1; 
    playDirection = 1;
    
    if (gameMode !== "online") {
        playerNames = ["Player 1", "AI 2", "AI 3", "AI 4"];
        playerNames[0] = (typeof SystemUI.getPlayerName === 'function') ? SystemUI.getPlayerName() : "Player";
    }

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

    if (gameMode === "online") {
        pushAllHandsToFirebase();
        pushGameState();
    }

    renderHand();
    renderTable();
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
            if (actualPlayerIdx + 1 === currentTurn) {
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

    const banner = document.getElementById("turn-banner");
    if (banner) {
        banner.classList.remove("hidden");
        const isBot = seats[currentTurn - 1]?.type === 'ai' || (gameMode === "ai" && currentTurn !== 1);
        banner.innerText = isBot ? `${playerNames[currentTurn-1].toUpperCase()} IS THINKING...` : `${playerNames[currentTurn-1].toUpperCase()}'S TURN`;
    }
}

function resetGame() {
    hands = [[], [], [], []]; discardPile = []; deck = []; calledUnoFlags = [false, false, false, false];
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
            if (startBtn) { startBtn.innerText = "Start Game"; startBtn.disabled = false; }
        }
    }
}

function attemptPlayCard(index) {
    if (!isMyTurn()) return;
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
        if (playerCount === 2) skipCount = 1;
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
        playCustomSound(playerNum === myId ? 'win' : 'lose');
        logMove("SYSTEM", `${playerNames[playerNum-1]} WINS!`, true); 
        showResultModal(playerNum === myId ? "🎉 YOU WIN!" : `😞 ${playerNames[playerNum-1]} WINS!`, playerNum === myId ? "#2ecc71" : "#e74c3c");
        
        if (playerNum === myId && typeof SystemStats !== 'undefined') SystemStats.recordWin("uno", 0);
        else if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("uno");
        
        if (gameMode === 'online') {
            // Single atomic push carrying the final hand sizes AND the
            // finished status — the old two-write version raced.
            pushGameState(null, "WINS!", playerNames[playerNum-1], "finished");
        }
        setTimeout(resetGame, 2500);
        return; 
    }

    advanceTurn(skipCount + 1, `played ${card.name.toUpperCase()}`);
}

function getNextPlayerIndex(steps) {
    let next = currentTurn;
    for (let i = 0; i < steps; i++) {
        next = (next - 1 + playDirection + playerCount) % playerCount + 1;
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
    if (!isMyTurn()) return;
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

    if (isHost && (seats[currentTurn - 1]?.type === 'ai' || (gameMode === "ai" && currentTurn !== 1))) {
        scheduleAiTurn();
    }
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
    extraRoomFields: () => ({ aiDifficulty: aiDifficulty, ts: Date.now() }),
    settingsConfig: [
        { id: "lobby-count", label: "PLAYERS", type: "select", default: playerCount, options: [{value:2, label:"2"},{value:3, label:"3"},{value:4, label:"4"}] },
        { id: "lobby-ai-diff", label: "AI LEVEL", type: "select", default: aiDifficulty, options: [{value:"easy", label:"EASY"},{value:"normal", label:"NORMAL"},{value:"hard", label:"HARD"}] }
    ],
    onSettingsRendered: () => updateLobbyPreview(),
    onSettingChange: (key, val) => {
        if (key === "lobby-count") playerCount = parseInt(val);
        if (key === "lobby-ai-diff") aiDifficulty = val;
        updateLobbyPreview();

        if (gameMode === "online" && isHost && currentRoomId && window.db) {
            // Use SystemMatch.resizeSeats for player count, then sync aiDifficulty
            if (key === "lobby-count") {
                SystemMatch.resizeSeats(playerCount);
                seats = SystemMatch.getSeats();
            }
            window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { aiDifficulty: aiDifficulty, ts: Date.now() });
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
    let payload = { deck, discardPile, turn: currentTurn, direction: playDirection, currentColor: currentPlayColor, status: statusOverride || "playing", seats, handSizes, ts: now, seq: stateSeq, pusher: myId };

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
            if (isHost && data.pusher !== myId && (seats[currentTurn - 1]?.type === 'ai' || (gameMode === "ai" && currentTurn !== 1))) {
                scheduleAiTurn();
            }
        } else if (data.status === "finished") {
            let winnerIdx = sizes.findIndex(sz => sz === 0);
            if (winnerIdx !== -1 && winnerIdx !== myId - 1) {
                playCustomSound('lose');
                showResultModal(`😞 ${playerNames[winnerIdx]} WINS!`, "#e74c3c");
                setTimeout(resetGame, 2500);
            } else if (winnerIdx === -1) {
                setTimeout(resetGame, 2500);
            }
        }
    }
}

function showTurnToast() {
    let t = document.getElementById("uno-turn-toast");
    if (!t) {
        t = document.createElement("div"); t.id = "uno-turn-toast"; t.innerText = "⭐ YOUR TURN!";
        t.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,#27ae60,#2ecc71);color:#fff;font-size:1.8rem;font-weight:900;padding:18px 44px;border-radius:18px;z-index:9999;opacity:0;transition:0.22s;pointer-events:none;";
        document.body.appendChild(t);
    }
    t.style.opacity = "1"; setTimeout(() => t.style.opacity = "0", 1500);
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