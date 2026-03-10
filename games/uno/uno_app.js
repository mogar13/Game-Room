// ==========================================
// 1. INITIALIZE OS & STATE (Fixed V2)
// ==========================================
// Force AI mode on boot to prevent ghost online deadlocks
let gameMode = "ai";
localStorage.setItem("uno_mode", "ai"); 

let aiDifficulty = localStorage.getItem("uno_diff") || "hard";

let myId = 1;
let currentRoomId = null;
let isHost = true; 
let chatStarted = false;
let seats = [];
let roomListener = null;

let p1Name = (typeof SystemUI.getPlayerName === 'function') ? SystemUI.getPlayerName() : "Player";
let p2Name = "AI";

// --- CUSTOM UNO AUDIO ---
const sfxDraw = new Audio('../../system/audio/card-draw.ogg');
const sfxPlay = new Audio('../../system/audio/card-shove-2.ogg');
const sfxWin = new Audio('../../system/audio/win.ogg');
const sfxLose = new Audio('../../system/audio/lose.ogg');
const sfxTie = new Audio('../../system/audio/tie.ogg');

function playCustomSound(type) {
    let snd;
    if (type === 'draw') snd = sfxDraw;
    else if (type === 'play') snd = sfxPlay;
    else if (type === 'win') snd = sfxWin;
    else if (type === 'lose') snd = sfxLose;
    else if (type === 'tie') snd = sfxTie;

    if (snd) {
        snd.pause();
        snd.currentTime = 0;
        snd.play().catch(e => console.log("Audio failed:", e));
    }
}

function logMove(player, msg, isSystem = false) {
    const logDiv = document.getElementById("move-log");
    if (!logDiv) return;
    
    const entry = document.createElement("div");
    if (isSystem) { 
        entry.innerHTML = `<span class="log-sys">SYSTEM: ${msg}</span>`; 
    } else { 
        const pClass = player === p1Name ? "log-p1" : "log-p2"; 
        entry.innerHTML = `<span class="${pClass}">${player}</span> ${msg}`; 
    }
    
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// --- UNO GAME STATE ---
let deck = [];
let discardPile = [];
let myHand = [];
let oppHand = []; 
let oppHandCount = 0;
let currentTurn = 1; 

function isMyTurn() {
    return gameMode === "online" ? currentTurn === myId : currentTurn === 1;
}

let currentPlayColor = ""; 
let calledUno = false; 
let lastSeenUnoYell = "";
let lastLogSync = "";

let cardsToAnimateP1 = 0;
let cardsToAnimateP2 = 0;
let cardJustPlayed = false;

SystemUI.init({
    gameName: "UNO PRO",
    rules: "Match cards by color or number. Use Action Cards to mess with your opponent. Don't forget to yell UNO when you have one card left, or draw a penalty!",
    hudDropdowns: [
        { 
            id: "sys-uno-mode", 
            options: [ 
                { value: "ai", label: "🤖 vs AI" }, 
                { value: "online", label: "🌐 Online" } 
            ] 
        },
        { 
            id: "sys-uno-diff", 
            options: [ 
                { value: "easy", label: "Easy AI" }, 
                { value: "normal", label: "Normal AI" }, 
                { value: "hard", label: "Hard AI" } 
            ] 
        }
    ]
});

// Delay to safely ensure Firebase DB and SystemUI DOM elements are ready
const checkDBReadyUno = setInterval(() => {
    if (window.db) {
        clearInterval(checkDBReadyUno);
        initUno();
    }
}, 50);

function initUno() {
    const modeEl = document.getElementById("sys-uno-mode");
    const diffEl = document.getElementById("sys-uno-diff");
    
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", (e) => {
            gameMode = e.target.value;
            localStorage.setItem("uno_mode", gameMode);
            
            const modal = document.getElementById("sys-modal");
            if (modal) modal.classList.add("sys-hidden");
            
            syncDiffVisibility();
            
            if (gameMode === "online") { 
                SystemUI.v2Lobby.show(); 
            } else { 
                SystemUI.v2Lobby.hide(); 
                SystemUI.stopChat(); 
                chatStarted = false; 
                myId = 1; 
                isHost = true; 
                if (roomListener) { 
                    roomListener(); 
                    roomListener = null; 
                } 
                resetGame(); 
            }
        });
    }
    
    if (diffEl) {
        diffEl.value = aiDifficulty;
        diffEl.addEventListener("change", (e) => { 
            aiDifficulty = e.target.value; 
            localStorage.setItem("uno_diff", aiDifficulty); 
        });
    }
    
    syncDiffVisibility();
    resetGame();
}

function syncDiffVisibility() {
    const diffEl = document.getElementById("sys-uno-diff");
    if (!diffEl) return;
    
    const wrap = diffEl.closest(".hud-dropdown-wrap") || diffEl.parentElement;
    if (wrap) {
        wrap.style.display = gameMode === "ai" ? "" : "none";
    }
}

// ==========================================
// 2. UNO DECK LOGIC
// ==========================================
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

function generateId() { 
    return Math.random().toString(36).substr(2, 9); 
}

// ==========================================
// 3. GAMEPLAY & RENDER LOGIC
// ==========================================
function startGame() {
    if (gameMode === "online" && !isHost) return; 
    
    playCustomSound('draw');
    
    document.getElementById("start-game-btn").classList.add("hidden");
    document.getElementById("move-log").classList.remove("hidden");
    document.getElementById("move-log").innerHTML = ""; 
    
    buildDeck();
    myHand = []; 
    oppHand = []; 
    oppHandCount = 7; 
    currentTurn = 1; 
    calledUno = false;
    
    document.getElementById("uno-btn").classList.add("hidden");
    
    cardsToAnimateP1 = 7; 
    cardsToAnimateP2 = 7; 
    cardJustPlayed = true;
    
    for (let i = 0; i < 7; i++) { 
        myHand.push(deck.pop()); 
        oppHand.push(deck.pop()); 
    }
    
    let firstCard = deck.pop();
    while (firstCard.type === 'wild' || firstCard.type === 'action') { 
        deck.unshift(firstCard); 
        firstCard = deck.pop(); 
    }
    
    discardPile.push(firstCard); 
    currentPlayColor = firstCard.color;
    
    logMove("SYSTEM", "Game started!", true);
    
    renderHand(); 
    renderTable(); 
    updateTurnBanner();
    
    if (gameMode === "online") {
        pushGameState();
    }
}

function renderHand() {
    const handDiv = document.getElementById("player-hand");
    if (!handDiv) return;
    
    handDiv.innerHTML = "";
    
    myHand.forEach((card, index) => {
        const cardEl = document.createElement("div");
        cardEl.className = "uno-card";
        cardEl.style.zIndex = index; 
        cardEl.style.backgroundImage = `url('${card.img}')`;
        
        if (index >= myHand.length - cardsToAnimateP1) {
            cardEl.classList.add("anim-draw-player");
            setTimeout(() => {
                cardEl.classList.remove("anim-draw-player");
            }, 400);
        }
        
        cardEl.addEventListener("click", () => attemptPlayCard(index));
        handDiv.appendChild(cardEl);
    });
    
    cardsToAnimateP1 = 0; 
    
    // Show UNO button when holding exactly 1 card AND haven't called yet.
    // IMPORTANT: never reset calledUno here - Firebase re-renders this constantly
    // in multiplayer, so resetting it here was causing the false penalty bug.
    if (myHand.length === 1 && isMyTurn() && !calledUno) { 
        document.getElementById("uno-btn").classList.remove("hidden"); 
    } else { 
        document.getElementById("uno-btn").classList.add("hidden");
        // Only reset calledUno when the hand actually grows back above 1
        // (e.g. drew a penalty card). Not on every render.
        if (myHand.length > 1) calledUno = false;
    }
}

function renderTable() {
    const discardDiv = document.getElementById("discard-pile");
    if (!discardDiv) return;
    
    discardDiv.innerHTML = "";
    
    if (discardPile.length > 0) {
        const topCard = discardPile[discardPile.length - 1];
        const cardEl = document.createElement("div");
        cardEl.className = "uno-card";
        cardEl.style.backgroundImage = `url('${topCard.img}')`;
        cardEl.style.marginLeft = "0"; 
        
        if (cardJustPlayed) { 
            cardEl.classList.add("anim-play-card"); 
            setTimeout(() => {
                cardEl.classList.remove("anim-play-card");
            }, 300); 
            cardJustPlayed = false; 
        }
        
        discardDiv.appendChild(cardEl);
    }
    
    const colorInd = document.getElementById("color-indicator");
    if (!currentPlayColor) { 
        if (colorInd) colorInd.classList.add("hidden"); 
    } else {
        if (colorInd) {
            colorInd.classList.remove("hidden");
            colorInd.innerText = `CURRENT COLOR: ${currentPlayColor.toUpperCase()}`;
            
            const hexColors = { 
                red: '#e74c3c', 
                blue: '#3498db', 
                green: '#2ecc71', 
                yellow: '#f1c40f' 
            };
            
            colorInd.style.backgroundColor = hexColors[currentPlayColor];
            colorInd.style.color = currentPlayColor === 'yellow' ? '#000' : '#fff';
        }
    }
    
    const deckVisual = document.querySelector("#draw-pile .card-back");
    const countBubble = document.getElementById("deck-count");
    
    if (deckVisual && countBubble) {
        countBubble.innerText = deck.length; 
        countBubble.classList.remove("hidden");
        
        let thickness = Math.floor(deck.length / 5); 
        let shadowStr = "";
        
        for (let i = 1; i <= thickness; i++) { 
            shadowStr += `-${i}px ${i}px 0px ${i % 2 === 0 ? '#ecf0f1' : '#2c3e50'}${i < thickness ? ', ' : ''}`; 
        }
        
        deckVisual.style.boxShadow = shadowStr || "none";
    }
    
    const oppHandDiv = document.getElementById("opponent-hand");
    if (oppHandDiv) {
        oppHandDiv.innerHTML = "";
        for (let i = 0; i < oppHandCount; i++) {
            const cardEl = document.createElement("div"); 
            cardEl.className = "uno-card"; 
            cardEl.style.zIndex = i;
            cardEl.style.backgroundImage = `url('../../system/images/cards/uno/card-back/card_back.png')`;
            
            if (i >= oppHandCount - cardsToAnimateP2) { 
                cardEl.classList.add("anim-draw-opponent"); 
                setTimeout(() => {
                    cardEl.classList.remove("anim-draw-opponent");
                }, 400); 
            }
            
            oppHandDiv.appendChild(cardEl);
        }
    }
    
    cardsToAnimateP2 = 0; 
    
    const p1Label = document.getElementById("p1-label"); 
    const p2Label = document.getElementById("p2-label");
    
    if (p1Label) p1Label.innerText = p1Name;
    if (p2Label) p2Label.innerHTML = `${p2Name}: <span id="p2-card-count">${oppHandCount}</span> cards`;
}

let _prevWasMyTurn = null; // tracks last render state so toast only fires on transition

function updateTurnBanner() {
    const banner = document.getElementById("turn-banner");
    if (!banner) return;
    
    banner.classList.remove("hidden");
    const mine = isMyTurn();
    
    if (mine) { 
        banner.innerText = "⭐ YOUR TURN"; 
        banner.style.color = "#2ecc71";
        // Only show the toast when transitioning TO my turn (not on re-renders)
        if (_prevWasMyTurn === false) showTurnToast();
    } else { 
        const turnIdx = currentTurn - 1;
        const isBot = seats[turnIdx] && seats[turnIdx].type === 'ai';
        banner.innerText = isBot ? "🤖 AI IS THINKING..." : "⏳ OPPONENT'S TURN"; 
        banner.style.color = "#e74c3c"; 
    }
    
    _prevWasMyTurn = mine;
}

function resetGame() {
    myHand = []; 
    oppHand = []; 
    discardPile = []; 
    deck = []; 
    calledUno = false;
    
    document.getElementById("player-hand").innerHTML = ""; 
    document.getElementById("opponent-hand").innerHTML = "";
    document.getElementById("discard-pile").innerHTML = ""; 
    document.getElementById("move-log").innerHTML = "";
    
    document.getElementById("move-log").classList.add("hidden"); 
    document.getElementById("start-game-btn").classList.remove("hidden");
    document.getElementById("turn-banner").classList.add("hidden"); 
    document.getElementById("color-indicator").classList.add("hidden");
    document.getElementById("deck-count").classList.add("hidden"); 
    document.getElementById("uno-btn").classList.add("hidden");
    document.getElementById("color-picker-modal").classList.add("hidden");
    
    const p1Label = document.getElementById("p1-label");
    if (p1Label) p1Label.innerText = p1Name;

    if (gameMode === "online" && !isHost) { 
        document.getElementById("start-game-btn").innerText = "Waiting for Host..."; 
        document.getElementById("start-game-btn").disabled = true; 
    } else { 
        document.getElementById("start-game-btn").innerText = "Start Game"; 
        document.getElementById("start-game-btn").disabled = false; 
    }
}

function showUnoShout(name) {
    const shout = document.getElementById("uno-shout-display");
    if (!shout) return;
    
    shout.innerText = `${name} YELLED UNO!`; 
    shout.classList.remove("hidden"); 
    shout.classList.add("animate-shout"); 
    
    playCustomSound('win');
    
    setTimeout(() => { 
        shout.classList.add("hidden"); 
        shout.classList.remove("animate-shout"); 
    }, 2000);
}

// ==========================================
// 4. CORE RULES: PLAYING & DRAWING CARDS
// ==========================================
function attemptPlayCard(index) {
    if (!isMyTurn()) return;
    
    const selectedCard = myHand[index];
    const topCard = discardPile[discardPile.length - 1];
    
    if (isValidPlay(selectedCard, topCard)) {
        myHand.splice(index, 1); 
        discardPile.push(selectedCard); 
        cardJustPlayed = true; 
        
        playCustomSound('play');
        logMove(p1Name, `played ${selectedCard.name.toUpperCase()}`);
        
        if (selectedCard.type === 'wild') {
            document.getElementById('color-picker-modal').classList.remove('hidden');
            renderHand(); 
            renderTable();
        } else {
            currentPlayColor = selectedCard.color;
            handleActionCard(selectedCard, 1);
        }
    } else { 
        playCustomSound('lose'); 
    }
}

document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        currentPlayColor = e.target.dataset.color;
        document.getElementById('color-picker-modal').classList.add('hidden');
        
        playCustomSound('play');
        logMove("SYSTEM", `Color changed to ${currentPlayColor.toUpperCase()}`, true);
        
        const topCard = discardPile[discardPile.length - 1];
        handleActionCard(topCard, 1); 
    });
});

document.getElementById("uno-btn").addEventListener("click", () => {
    calledUno = true; 
    document.getElementById("uno-btn").classList.add("hidden");
    
    logMove(p1Name, `YELLED UNO!`); 
    showUnoShout(p1Name);
    
    if (gameMode === "online") {
        pushGameState(p1Name, `YELLED UNO!`);
    }
});

function handleActionCard(card, player) {
    let skipNext = false;
    
    if (card.value === '2plus') { 
        drawCardsFor(player === 1 ? 2 : 1, 2); 
        skipNext = true; 
        logMove("SYSTEM", `${player === 1 ? p2Name : p1Name} draws 2 and is skipped!`, true); 
    } else if (card.value === '4_plus') { 
        drawCardsFor(player === 1 ? 2 : 1, 4); 
        skipNext = true; 
        logMove("SYSTEM", `${player === 1 ? p2Name : p1Name} draws 4 and is skipped!`, true); 
    } else if (card.value === 'block' || card.value === 'inverse') { 
        skipNext = true; 
        logMove("SYSTEM", `${player === 1 ? p2Name : p1Name} is skipped!`, true); 
    }

    // Penalty fires when playing your LAST card (hand=0) without having called UNO.
    // Previously this checked hand=1, but since we now show the button AT hand=1,
    // the check must move to hand=0 — the moment you actually try to win.
    if (player === 1 && myHand.length === 0 && !calledUno) { 
        playCustomSound('lose'); 
        logMove("SYSTEM", `${p1Name} forgot to yell UNO! +2 Penalty.`, true); 
        showPenaltyToast();
        drawCardsFor(1, 2);
        renderHand(); 
        renderTable();
        calledUno = false;
    }

    if (myHand.length === 0) { 
        playCustomSound('win'); 
        logMove("SYSTEM", `${p1Name} WINS!`, true); 
        showResultModal("🎉 YOU WIN!", "#2ecc71");
        
        if (gameMode === 'online' && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { status: "finished" }); 
        }
        
        setTimeout(resetGame, 2500);
        return; 
    } else if (oppHand.length === 0) { 
        playCustomSound('lose'); 
        logMove("SYSTEM", `${p2Name} WINS!`, true); 
        showResultModal(`😞 ${p2Name} WINS!`, "#e74c3c");
        
        if (gameMode === 'online' && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { status: "finished" }); 
        }
        
        setTimeout(resetGame, 2500);
        return; 
    }

    if (skipNext) {
        if (player === 1) {
            currentTurn = (gameMode === "online") ? myId : 1;
        } else {
            currentTurn = (gameMode === "online") ? (myId === 1 ? 2 : 1) : 2; 
        }
        
        renderHand(); 
        renderTable(); 
        updateTurnBanner();
        
        if (gameMode === "online") {
            pushGameState(null, `played ${card.name.toUpperCase()}`);
        }
        
        // AI gets an extra turn if they played the skip card
        if (player === 2) {
            if (gameMode === "online" && isHost && seats[currentTurn - 1]?.type === 'ai') {
                setTimeout(aiTurn, 1500);
            } else if (gameMode === "ai" && currentTurn === 2) {
                setTimeout(aiTurn, 1500);
            }
        }
    } else {
        if (player === 1) {
            advanceTurn(`played ${card.name.toUpperCase()}`); 
        } else {
            currentTurn = 1;
            updateTurnBanner();
            renderHand();
            renderTable();
            
            if (gameMode === "online") {
                pushGameState(null, `played ${card.name.toUpperCase()}`);
            }
        }
    }
}

function isValidPlay(card, topCard) {
    if (card.type === 'wild') return true;
    if (card.color === currentPlayColor) return true;
    if (card.value === topCard.value) return true;
    return false;
}

function drawCardsFor(player, num) {
    if (player === 1) {
        cardsToAnimateP1 += num; 
    } else {
        cardsToAnimateP2 += num;
    }
    
    for (let i = 0; i < num; i++) {
        if (deck.length === 0) { 
            const topCard = discardPile.pop(); 
            deck = [...discardPile]; 
            shuffleDeck(); 
            discardPile = [topCard]; 
        }
        
        if (deck.length > 0) { 
            if (player === 1) {
                myHand.push(deck.pop()); 
            } else { 
                oppHand.push(deck.pop()); 
                oppHandCount = oppHand.length; 
            } 
        }
    }
}

function drawCard() {
    if (!isMyTurn()) return;
    
    drawCardsFor(1, 1); 
    playCustomSound('draw'); 
    logMove(p1Name, "drew a card.");
    
    renderHand(); 
    renderTable(); 
    advanceTurn("drew a card.");
}

function advanceTurn(logMsg) {
    currentTurn = (gameMode === "online") ? (myId === 1 ? 2 : 1) : 2;
    updateTurnBanner();
    
    if (gameMode === "online") {
        pushGameState(null, logMsg);
    }
    
    if (gameMode === "online" && isHost && seats[currentTurn - 1]?.type === 'ai') {
        setTimeout(aiTurn, 1500);
    } else if (gameMode === "ai" && currentTurn === 2) {
        setTimeout(aiTurn, 1500);
    }
}

// ==========================================
// 5. THE AI BRAIN
// ==========================================
function aiTurn() {
    if (deck.length === 0 && discardPile.length > 1) { 
        const topCard = discardPile.pop(); 
        deck = [...discardPile]; 
        shuffleDeck(); 
        discardPile = [topCard]; 
    }
    
    const topCard = discardPile[discardPile.length - 1];
    let playableIndices = [];
    
    for (let i = 0; i < oppHand.length; i++) { 
        if (isValidPlay(oppHand[i], topCard)) {
            playableIndices.push(i); 
        }
    }

    if (playableIndices.length > 0) {
        let chosenIndex = playableIndices[0];
        
        if (aiDifficulty === "easy") { 
            chosenIndex = playableIndices[Math.floor(Math.random() * playableIndices.length)]; 
        } else if (aiDifficulty === "hard") {
            let actionCards = playableIndices.filter(idx => oppHand[idx].type === 'action');
            let colorMatch = playableIndices.filter(idx => oppHand[idx].color === currentPlayColor && oppHand[idx].type !== 'wild');
            
            if (myHand.length <= 3 && actionCards.length > 0) { 
                chosenIndex = actionCards[0]; 
            } else if (colorMatch.length > 0) {
                const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
                oppHand.forEach(c => { 
                    if (c.color !== 'wild') counts[c.color]++; 
                });
                colorMatch.sort((a, b) => counts[oppHand[b].color] - counts[oppHand[a].color]);
                chosenIndex = colorMatch[0];
            } else if (playableIndices.length > 1) {
                let nonWild = playableIndices.find(idx => oppHand[idx].type !== 'wild');
                if (nonWild !== undefined) {
                    chosenIndex = nonWild;
                }
            }
        }
        
        const playedCard = oppHand.splice(chosenIndex, 1)[0]; 
        oppHandCount = oppHand.length;
        
        discardPile.push(playedCard); 
        cardJustPlayed = true; 
        playCustomSound('play');
        
        logMove(p2Name, `played ${playedCard.name.toUpperCase()}`);
        
        if (oppHand.length === 1) { 
            logMove(p2Name, "YELLED UNO!"); 
            showUnoShout(p2Name); 
        }
        
        if (playedCard.type === 'wild') {
            const colors = ['red', 'blue', 'green', 'yellow'];
            if (aiDifficulty === "hard") {
                const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
                oppHand.forEach(c => { 
                    if (c.color !== 'wild') counts[c.color]++; 
                });
                currentPlayColor = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            } else { 
                currentPlayColor = colors[Math.floor(Math.random() * colors.length)]; 
            }
            logMove("SYSTEM", `Color changed to ${currentPlayColor.toUpperCase()}`, true);
        } else { 
            currentPlayColor = playedCard.color; 
        }
        
        handleActionCard(playedCard, 2);
        
    } else {
        drawCardsFor(2, 1); 
        playCustomSound('draw'); 
        logMove(p2Name, "drew a card.");
        
        currentTurn = 1; 
        renderHand(); 
        renderTable(); 
        updateTurnBanner();
        
        if (gameMode === "online") {
            pushGameState(null, "drew a card.");
        }
    }
}

document.getElementById("start-game-btn").addEventListener("click", startGame);
document.getElementById("draw-pile").addEventListener("click", drawCard);

// ==========================================
// 6. FIREBASE MULTIPLAYER LOBBY & SYNC
// ==========================================
SystemUI.v2Lobby.setup({
    onHost: () => {
        if (!window.db) { 
            alert("Server connection error."); 
            return; 
        }
        
        currentRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        isHost = true; 
        myId = 1; 
        chatStarted = false;
        
        seats = [
            { type: "human", name: SystemUI.getPlayerName() }, 
            { type: "ai", name: "AI (" + aiDifficulty + ")" }
        ];
        
        window.dbSet(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { 
            status: "waiting", 
            turn: 1, 
            seats: seats 
        }).then(() => { 
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true); 
            listenToRoom(); 
        });
    },
    onJoin: (code) => {
        if (!window.db) { 
            alert("Server connection error."); 
            return; 
        }
        
        window.dbGet(window.dbChild(window.dbRef(window.db), `uno_rooms/${code}`)).then((snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.seats && data.seats[1].type === "ai") {
                    currentRoomId = code; 
                    isHost = false; 
                    myId = 2; 
                    chatStarted = false;
                    
                    let updatedSeats = data.seats; 
                    updatedSeats[1] = { type: "human", name: SystemUI.getPlayerName() };
                    
                    window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { 
                        status: "playing", 
                        seats: updatedSeats 
                    });
                    
                    SystemUI.v2Lobby.showRoomPhase(currentRoomId, false); 
                    listenToRoom();
                }
            }
        });
    },
    onLeave: () => { 
        gameMode = "ai"; 
        myId = 1; 
        isHost = true; 
        resetGame(); 
    },
    onStart: () => { 
        window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { status: "playing" }); 
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    
    roomListener = window.dbOnValue(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);
        
        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true; 
            SystemUI.v2Lobby.hide();
            
            if (!chatStarted) { 
                chatStarted = true; 
                playCustomSound('win'); 
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); 
            }
        }
        syncFromFirebase(data);
    });
}

function pushGameState(unoYelledBy = null, moveLogMsg = null) {
    if (gameMode !== "online") return;
    
    let payload = { 
        deck: deck, 
        discardPile: discardPile, 
        turn: currentTurn, 
        currentColor: currentPlayColor, 
        status: "playing", 
        seats: seats 
    };
    
    if (myId === 1) { 
        payload.p1Hand = myHand; 
        payload.p2Hand = oppHand; 
    } else { 
        payload.p2Hand = myHand; 
        payload.p1Hand = oppHand; 
    }
    
    if (unoYelledBy) {
        payload.lastUnoYell = Date.now() + "_" + unoYelledBy;
    }
    
    if (moveLogMsg) {
        payload.lastLogSync = Date.now() + "_" + p1Name + "_" + moveLogMsg;
    }
    
    window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), payload);
}

function syncFromFirebase(data) {
    if (data.status === "playing" && data.deck) {
        document.getElementById("start-game-btn").classList.add("hidden");
        document.getElementById("move-log").classList.remove("hidden");
        
        deck = data.deck; 
        discardPile = data.discardPile; 
        currentTurn = data.turn; 
        currentPlayColor = data.currentColor;
        
        if (myId === 1) { 
            myHand = data.p1Hand || []; 
            oppHand = data.p2Hand || []; 
            p2Name = seats[1].name; 
        } else { 
            myHand = data.p2Hand || []; 
            oppHand = data.p1Hand || []; 
            p2Name = seats[0].name; 
        }
        
        oppHandCount = oppHand.length;
        
        if (data.lastUnoYell && data.lastUnoYell !== lastSeenUnoYell) { 
            lastSeenUnoYell = data.lastUnoYell; 
            const yeller = data.lastUnoYell.split("_")[1]; 
            if (yeller !== p1Name) {
                showUnoShout(yeller); 
            }
        }
        
        if (data.lastLogSync && data.lastLogSync !== lastLogSync) { 
            lastLogSync = data.lastLogSync; 
            const parts = data.lastLogSync.split("_"); 
            if (parts[1] !== p1Name) {
                logMove(parts[1], parts.slice(2).join("_")); 
            }
        }
        
        renderHand(); 
        renderTable(); 
        updateTurnBanner();
        
        if (isHost && seats[currentTurn - 1]?.type === 'ai') {
            setTimeout(aiTurn, 1500);
        }
    } else if (data.status === "finished") { 
        resetGame(); 
    }
}
// ==========================================
// 7. TOAST / MODAL HELPERS
// ==========================================

// YOUR TURN toast — slides in center-screen for 1.5s on turn transitions
function showTurnToast() {
    let toast = document.getElementById("uno-turn-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "uno-turn-toast";
        toast.innerText = "⭐  YOUR TURN!";
        toast.style.cssText = [
            "position:fixed", "top:50%", "left:50%",
            "transform:translate(-50%,-50%) scale(0.75)",
            "background:linear-gradient(135deg,#27ae60,#2ecc71)",
            "color:#fff", "font-size:1.8rem", "font-weight:900",
            "letter-spacing:3px", "padding:18px 44px",
            "border-radius:18px", "z-index:9999",
            "box-shadow:0 0 50px rgba(46,204,113,0.55)",
            "opacity:0", "pointer-events:none",
            "transition:opacity 0.22s ease, transform 0.22s cubic-bezier(0.175,0.885,0.32,1.275)"
        ].join(";");
        document.body.appendChild(toast);
    }
    clearTimeout(toast._t);
    // Pop in
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translate(-50%,-50%) scale(1)";
    });
    // Fade out after 1.5s
    toast._t = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translate(-50%,-50%) scale(0.75)";
    }, 1500);
}

// Penalty toast — red flash
function showPenaltyToast() {
    let toast = document.getElementById("uno-penalty-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "uno-penalty-toast";
        toast.style.cssText = [
            "position:fixed", "top:50%", "left:50%",
            "transform:translate(-50%,-50%) scale(0.75)",
            "background:linear-gradient(135deg,#c0392b,#e74c3c)",
            "color:#fff", "font-size:1.4rem", "font-weight:900",
            "letter-spacing:2px", "padding:16px 36px",
            "border-radius:18px", "z-index:9999", "text-align:center",
            "box-shadow:0 0 50px rgba(231,76,60,0.55)",
            "opacity:0", "pointer-events:none",
            "transition:opacity 0.22s ease, transform 0.22s cubic-bezier(0.175,0.885,0.32,1.275)"
        ].join(";");
        document.body.appendChild(toast);
    }
    toast.innerHTML = "🚫 FORGOT TO YELL UNO!<br><span style='font-size:0.9rem;opacity:0.9'>+2 Penalty Cards</span>";
    clearTimeout(toast._t);
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translate(-50%,-50%) scale(1)";
    });
    toast._t = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translate(-50%,-50%) scale(0.75)";
    }, 2200);
}

// Win/loss result overlay — replaces blocking alert()
function showResultModal(msg, color) {
    let modal = document.getElementById("uno-result-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "uno-result-modal";
        modal.style.cssText = [
            "position:fixed", "inset:0",
            "background:rgba(0,0,0,0.78)", "backdrop-filter:blur(5px)",
            "display:flex", "align-items:center", "justify-content:center",
            "z-index:9998", "flex-direction:column", "gap:12px",
            "transition:opacity 0.3s"
        ].join(";");
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div style="font-size:2.4rem;font-weight:900;letter-spacing:4px;color:${color};
                    text-shadow:0 0 30px ${color};text-align:center;padding:0 20px">
            ${msg}
        </div>
        <div style="font-size:0.8rem;letter-spacing:3px;color:rgba(255,255,255,0.4);margin-top:4px">
            NEXT ROUND STARTING…
        </div>`;
    modal.style.opacity = "1";
    modal.style.display = "flex";
    setTimeout(() => {
        modal.style.opacity = "0";
        setTimeout(() => { modal.style.display = "none"; }, 300);
    }, 2200);
}