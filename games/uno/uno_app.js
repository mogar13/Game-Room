// ==========================================
// 1. INITIALIZE OS & STATE
// ==========================================
let gameMode = "ai";
localStorage.setItem("uno_mode", "ai"); 

let myId = 1;
let currentRoomId = null;
let isHost = false;
let chatStarted = false;

// Names
let p1Name = SystemUI.getPlayerName();
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

// --- MOVE LOGGING ---
function logMove(player, msg, isSystem = false) {
    const logDiv = document.getElementById("move-log");
    const entry = document.createElement("div");
    
    if (isSystem) {
        entry.innerHTML = `<span class="log-sys">SYSTEM: ${msg}</span>`;
    } else {
        const pClass = player === p1Name ? "log-p1" : "log-p2";
        entry.innerHTML = `<span class="${pClass}">${player}</span> ${msg}`;
    }
    
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight; // Auto-scroll to bottom
}

// --- UNO GAME STATE ---
let deck = [];
let discardPile = [];
let myHand = [];
let oppHand = []; 
let oppHandCount = 0;
let currentTurn = 1; // 1 = You, 2 = Opponent/AI
let currentPlayColor = ""; 
let calledUno = false; 
let lastSeenUnoYell = "";
let lastLogSync = "";

// Animation Trackers
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
        }
    ]
});

// Setup Names Visually
document.getElementById("p1-label").innerText = p1Name;

// OS Menu Listeners
document.getElementById("sys-uno-mode").value = gameMode;
document.getElementById("sys-uno-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("uno_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        SystemUI.stopChat();
        chatStarted = false;
        resetGame();
    }
});

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
    
    // Initial deal animation markers
    cardsToAnimateP1 = 7;
    cardsToAnimateP2 = 7;
    cardJustPlayed = true;

    for(let i = 0; i < 7; i++) {
        myHand.push(deck.pop());
        oppHand.push(deck.pop());
    }

    let firstCard = deck.pop();
    while(firstCard.type === 'wild' || firstCard.type === 'action') {
        deck.unshift(firstCard);
        firstCard = deck.pop();
    }
    discardPile.push(firstCard);
    currentPlayColor = firstCard.color;

    logMove("SYSTEM", "Game started!", true);

    renderHand();
    renderTable();
    updateTurnBanner();
    
    if (gameMode === "online") pushGameState();
}

function renderHand() {
    const handDiv = document.getElementById("player-hand");
    handDiv.innerHTML = "";
    
    myHand.forEach((card, index) => {
        const cardEl = document.createElement("div");
        cardEl.className = "uno-card";
        cardEl.style.zIndex = index; 
        cardEl.style.backgroundImage = `url('${card.img}')`;
        
        // Apply drawing animation to freshly added cards
        if (index >= myHand.length - cardsToAnimateP1) {
            cardEl.classList.add("anim-draw-player");
            setTimeout(() => cardEl.classList.remove("anim-draw-player"), 400);
        }
        
        cardEl.addEventListener("click", () => attemptPlayCard(index));
        handDiv.appendChild(cardEl);
    });

    cardsToAnimateP1 = 0; // Reset after animating

    if (myHand.length === 2 && currentTurn === 1) {
        document.getElementById("uno-btn").classList.remove("hidden");
        calledUno = false;
    } else if (myHand.length !== 1) {
        document.getElementById("uno-btn").classList.add("hidden");
        calledUno = false;
    }
}

function renderTable() {
    const discardDiv = document.getElementById("discard-pile");
    discardDiv.innerHTML = "";
    
    if (discardPile.length > 0) {
        const topCard = discardPile[discardPile.length - 1];
        const cardEl = document.createElement("div");
        cardEl.className = "uno-card";
        cardEl.style.backgroundImage = `url('${topCard.img}')`;
        cardEl.style.marginLeft = "0"; 
        
        // Apply play animation to the center card
        if (cardJustPlayed) {
            cardEl.classList.add("anim-play-card");
            setTimeout(() => cardEl.classList.remove("anim-play-card"), 300);
            cardJustPlayed = false;
        }

        discardDiv.appendChild(cardEl);
    }

    const colorInd = document.getElementById("color-indicator");
    if (!currentPlayColor) {
        colorInd.classList.add("hidden");
    } else {
        colorInd.classList.remove("hidden");
        colorInd.innerText = `CURRENT COLOR: ${currentPlayColor.toUpperCase()}`;
        const hexColors = { red: '#e74c3c', blue: '#3498db', green: '#2ecc71', yellow: '#f1c40f' };
        colorInd.style.backgroundColor = hexColors[currentPlayColor];
        colorInd.style.color = currentPlayColor === 'yellow' ? '#000' : '#fff';
    }

    const deckVisual = document.querySelector("#draw-pile .card-back");
    const countBubble = document.getElementById("deck-count");
    if (deckVisual && countBubble) {
        countBubble.innerText = deck.length;
        countBubble.classList.remove("hidden");
        let thickness = Math.floor(deck.length / 5); 
        let shadowStr = "";
        for(let i=1; i<=thickness; i++) {
            shadowStr += `-${i}px ${i}px 0px ${i%2===0 ? '#ecf0f1' : '#2c3e50'}${i<thickness ? ', ' : ''}`;
        }
        deckVisual.style.boxShadow = shadowStr || "none";
    }

    const oppHandDiv = document.getElementById("opponent-hand");
    oppHandDiv.innerHTML = "";
    for(let i=0; i < oppHandCount; i++){
        const cardEl = document.createElement("div");
        cardEl.className = "uno-card";
        cardEl.style.zIndex = i;
        cardEl.style.backgroundImage = `url('../../system/images/cards/uno/card-back/card_back.png')`;
        
        // Apply drawing animation to AI
        if (i >= oppHandCount - cardsToAnimateP2) {
            cardEl.classList.add("anim-draw-opponent");
            setTimeout(() => cardEl.classList.remove("anim-draw-opponent"), 400);
        }

        oppHandDiv.appendChild(cardEl);
    }
    
    cardsToAnimateP2 = 0; // Reset after animating

    document.getElementById("p1-label").innerText = p1Name;
    document.getElementById("p2-label").innerHTML = `${p2Name}: <span id="p2-card-count">${oppHandCount}</span> cards`;
}

function updateTurnBanner() {
    const banner = document.getElementById("turn-banner");
    banner.classList.remove("hidden");
    if (currentTurn === 1) {
        banner.innerText = "⭐ YOUR TURN";
        banner.style.color = "#2ecc71"; 
    } else {
        banner.innerText = gameMode === "ai" ? "🤖 AI IS THINKING..." : "⏳ OPPONENT'S TURN";
        banner.style.color = "#e74c3c"; 
    }
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
    if (currentTurn !== 1) return;

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
            return; // Game pauses here until you click a color
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
    if(gameMode === "online") pushGameState(p1Name, `YELLED UNO!`);
});

function handleActionCard(card, player) {
    renderHand();
    renderTable();
    let skipNext = false;

    // Trigger attacks
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

    // UNO Penalty Check
    if (player === 1 && myHand.length === 1 && !calledUno) {
        playCustomSound('lose');
        logMove("SYSTEM", `${p1Name} forgot to yell UNO! +2 Penalty.`, true);
        alert("You didn't yell UNO! Draw 2 penalty."); 
        drawCardsFor(1, 2);
        document.getElementById("uno-btn").classList.add("hidden");
    }

    // Win Check
    if (myHand.length === 0) {
        playCustomSound('win');
        logMove("SYSTEM", `${p1Name} WINS!`, true);
        alert("YOU WIN THE ROUND!");
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { status: "finished" });
        resetGame();
        return;
    } else if (oppHand.length === 0) {
        playCustomSound('lose');
        logMove("SYSTEM", `${p2Name} WINS!`, true);
        alert(`${p2Name} WINS!`);
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), { status: "finished" });
        resetGame();
        return;
    }

    // Resolve Turn Direction
    if (skipNext) {
        if (player === 1) {
            currentTurn = 1; 
            updateTurnBanner();
            renderHand();
            renderTable();
            if(gameMode === "online") pushGameState(`played ${card.name.toUpperCase()}`);
        } else {
            currentTurn = 2; 
            updateTurnBanner();
            renderHand();
            renderTable();
            if(gameMode === "online") pushGameState(`played ${card.name.toUpperCase()}`);
            if(gameMode === "ai") setTimeout(aiTurn, 1500);
        }
    } else {
        if (player === 1) {
            advanceTurn(`played ${card.name.toUpperCase()}`); 
        } else {
            currentTurn = 1;
            updateTurnBanner();
            renderHand();
            renderTable();
            if(gameMode === "online") pushGameState(`played ${card.name.toUpperCase()}`);
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
    if (player === 1) cardsToAnimateP1 += num;
    else cardsToAnimateP2 += num;

    for(let i=0; i<num; i++) {
        if (deck.length === 0) {
            const topCard = discardPile.pop();
            deck = discardPile;
            shuffleDeck();
            discardPile = [topCard];
        }
        if (deck.length > 0) {
            if (player === 1) myHand.push(deck.pop());
            else {
                oppHand.push(deck.pop());
                oppHandCount = oppHand.length;
            }
        }
    }
}

function drawCard() {
    if (currentTurn !== 1) return;
    drawCardsFor(1, 1);
    playCustomSound('draw');
    logMove(p1Name, "drew a card.");
    renderHand();
    renderTable(); 
    advanceTurn("drew a card.");
}

function advanceTurn(logMsg) {
    currentTurn = 2;
    updateTurnBanner();
    if(gameMode === "online") pushGameState(null, logMsg);
    if(gameMode === "ai") setTimeout(aiTurn, 1500);
}

// Smarter AI
function aiTurn() {
    if (deck.length === 0) {
        const topCard = discardPile.pop();
        deck = discardPile;
        shuffleDeck();
        discardPile = [topCard];
    }

    const topCard = discardPile[discardPile.length - 1];
    let playableIndex = -1;
    
    for(let i=0; i<oppHand.length; i++) {
        if (isValidPlay(oppHand[i], topCard)) {
            playableIndex = i;
            if (oppHand[i].type !== 'wild') break; 
        }
    }

    if (playableIndex !== -1) {
        const playedCard = oppHand.splice(playableIndex, 1)[0];
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
            currentPlayColor = colors[Math.floor(Math.random() * colors.length)];
            logMove("SYSTEM", `Color changed to ${currentPlayColor.toUpperCase()}`, true);
        } else {
            currentPlayColor = playedCard.color;
        }

        handleActionCard(playedCard, 2);
    } else {
        drawCardsFor(2, 1);
        playCustomSound('draw');
        logMove(p2Name, "drew a card.");
        renderTable();
        
        currentTurn = 1;
        updateTurnBanner();
        renderHand();
        renderTable();
    }
}

document.getElementById("start-game-btn").addEventListener("click", startGame);
document.getElementById("draw-pile").addEventListener("click", drawCard);

// ==========================================
// 5. FIREBASE MULTIPLAYER LOBBY & SYNC
// ==========================================
const lobbyUI = document.getElementById("multiplayer-lobby");

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for(let i=0; i<4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

document.getElementById("btn-create-room").addEventListener("click", () => {
    playCustomSound('win');
    currentRoomId = generateRoomCode();
    isHost = true;
    myId = 1;
    chatStarted = false;
    
    window.dbSet(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), {
        status: "waiting",
        players: 1,
        p1Name: p1Name,
        turn: 1
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        document.getElementById("btn-create-room").disabled = true;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    playCustomSound('win');
    const code = document.getElementById("join-room-input").value.toUpperCase();
    
    window.dbGet(window.dbChild(window.dbRef(window.db), `uno_rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists() && snapshot.val().players === 1) {
            currentRoomId = code;
            isHost = false;
            myId = 2;
            chatStarted = false;
            
            window.dbUpdate(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), {
                players: 2,
                p2Name: p1Name, 
                status: "playing"
            });
            
            lobbyUI.classList.add("hidden");
            SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            document.getElementById("start-game-btn").innerText = "Waiting for Host...";
            document.getElementById("start-game-btn").disabled = true;
            listenToRoom();
        }
    });
});

function listenToRoom() {
    window.dbOnValue(window.dbRef(window.db, 'uno_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) return;

        if(data.status === "playing" && !chatStarted) {
            chatStarted = true;
            if(lobbyUI) lobbyUI.classList.add("hidden");
            playCustomSound('win');
            SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
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
        status: "playing"
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
        
        deck = data.deck || [];
        discardPile = data.discardPile || [];
        currentTurn = data.turn || 1;
        currentPlayColor = data.currentColor || "";
        
        if (myId === 1) {
            myHand = data.p1Hand || [];
            oppHand = data.p2Hand || [];
            p2Name = data.p2Name || "Opponent";
        } else {
            myHand = data.p2Hand || [];
            oppHand = data.p1Hand || [];
            p2Name = data.p1Name || "Opponent";
        }
        oppHandCount = oppHand.length;

        // Trigger shout if opponent yelled UNO
        if (data.lastUnoYell && data.lastUnoYell !== lastSeenUnoYell) {
            lastSeenUnoYell = data.lastUnoYell;
            const yeller = data.lastUnoYell.split("_")[1];
            if(yeller !== p1Name) showUnoShout(yeller);
        }

        // Print Opponent's Move Log
        if (data.lastLogSync && data.lastLogSync !== lastLogSync) {
            lastLogSync = data.lastLogSync;
            const parts = data.lastLogSync.split("_");
            const player = parts[1];
            const msg = parts.slice(2).join("_");
            if (player !== p1Name) logMove(player, msg);
        }

        renderHand();
        renderTable();
        updateTurnBanner();
    } else if (data.status === "finished") {
        resetGame();
    }
}

// OS Lobby Escapes
document.getElementById("lobby-close-btn").addEventListener("click", () => {
    lobbyUI.classList.add("hidden");
});
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    gameMode = "ai";
    p2Name = "AI";
    document.getElementById("sys-uno-mode").value = "ai";
    localStorage.setItem("uno_mode", "ai");
    lobbyUI.classList.add("hidden");
    SystemUI.stopChat();
    chatStarted = false;
    resetGame();
});

resetGame();