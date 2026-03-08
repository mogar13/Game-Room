// ==========================================
// 1. INITIALIZE OS & STATE
// ==========================================
let gameMode = "ai";
localStorage.setItem("rummy_mode", "ai"); 

let myId = 1;
let currentRoomId = null;
let isHost = false;
let chatStarted = false;

let p1Name = SystemUI.getPlayerName();
let p2Name = "AI";

function playSound(type) {
    const audio = new Audio(`../../system/audio/${type}.ogg`);
    audio.play().catch(e => console.log("Audio failed:", e));
}

function logMove(player, msg) {
    const logContainer = document.getElementById("move-log-container");
    const logDiv = document.getElementById("move-log");
    logContainer.classList.remove("hidden");
    const entry = document.createElement("div");
    entry.innerHTML = `<span style="color:${player===p1Name?'#2ecc71':'#e74c3c'}; font-weight:bold;">${player}</span> ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

SystemUI.init({
    gameName: "RUMMY PRO",
    rules: "Draw a card, meld sets of 3+ (same rank or suited runs), then discard to end your turn. First to empty their hand wins!",
    hudDropdowns: [
        { id: "sys-rummy-mode", options: [ { value: "ai", label: "🤖 vs AI" }, { value: "online", label: "🌐 Online" } ] }
    ]
});

document.getElementById("p1-label").innerText = p1Name;

document.getElementById("sys-rummy-mode").value = gameMode;
document.getElementById("sys-rummy-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("rummy_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    if(gameMode === "online") document.getElementById("multiplayer-lobby").classList.remove("hidden");
    else { document.getElementById("multiplayer-lobby").classList.add("hidden"); SystemUI.stopChat(); chatStarted = false; resetGame(); }
});

// --- RUMMY GAME STATE ---
let deck = [];
let discardPile = [];
let myHand = [];
let oppHand = [];
let oppHandCount = 0;
let myMelds = [];
let oppMelds = [];

let currentTurn = 1; 
let currentPhase = "draw"; 
let selectedCards = []; 
let gameState = "setup";
let lastLogSync = "";

// ==========================================
// 2. DECK & DEAL LOGIC
// ==========================================
function buildDeck() {
    deck = [];
    const suits = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    suits.forEach(suit => {
        values.forEach((value, index) => {
            deck.push({
                id: `${value}_${suit}`, suit: suit, value: value, rank: index + 1,
                img: `../../system/images/cards/standard/card${suit}${value}.png`
            });
        });
    });
    
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function startGame() {
    if (gameMode === "online" && !isHost) return; 
    
    playSound('shuffle');
    document.getElementById("start-game-btn").classList.add("hidden");
    document.getElementById("sort-btn").classList.remove("hidden");
    
    buildDeck();
    myHand = []; oppHand = []; discardPile = []; myMelds = []; oppMelds = []; selectedCards = [];
    gameState = "playing";
    currentTurn = 1;
    currentPhase = "draw";

    // Deal 10 cards
    for(let i=0; i<10; i++) {
        myHand.push(deck.pop());
        oppHand.push(deck.pop());
    }
    oppHandCount = oppHand.length;
    
    discardPile.push(deck.pop());

    renderBoard();
    if(gameMode === "online") pushGameState();
}

document.getElementById("sort-btn").addEventListener("click", () => {
    playSound('card-draw');
    myHand.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.suit.localeCompare(b.suit);
    });
    selectedCards = []; 
    renderBoard();
});

// ==========================================
// 3. CORE GAME RULES & LOGIC
// ==========================================

document.getElementById("stock-pile").addEventListener("click", () => {
    if(currentTurn !== 1 || currentPhase !== "draw" || gameState !== "playing") return;
    
    if(deck.length === 0) {
        const topDiscard = discardPile.pop();
        deck = discardPile.reverse();
        discardPile = [topDiscard];
    }
    
    myHand.push(deck.pop());
    currentPhase = "discard"; 
    playSound('card-draw');
    logMove(p1Name, "drew from deck.");
    renderBoard();
    if(gameMode === "online") pushGameState();
});

document.getElementById("discard-pile").addEventListener("click", () => {
    if(currentTurn !== 1 || currentPhase !== "draw" || discardPile.length === 0 || gameState !== "playing") return;
    
    myHand.push(discardPile.pop());
    currentPhase = "discard";
    playSound('card-draw');
    logMove(p1Name, "drew from discard pile.");
    renderBoard();
    if(gameMode === "online") pushGameState();
});

function isValidMeld(cards) {
    if(cards.length < 3) return false;
    const allSameRank = cards.every(c => c.rank === cards[0].rank);
    if(allSameRank) return true;

    const allSameSuit = cards.every(c => c.suit === cards[0].suit);
    if(allSameSuit) {
        const sorted = [...cards].sort((a,b) => a.rank - b.rank);
        let isSequential = true;
        for(let i=1; i<sorted.length; i++) {
            if(sorted[i].rank !== sorted[i-1].rank + 1) { isSequential = false; break; }
        }
        if(isSequential) return true;
    }
    return false;
}

document.getElementById("meld-btn").addEventListener("click", () => {
    const selected = selectedCards.map(idx => myHand[idx]);
    
    if(isValidMeld(selected)) {
        myMelds.push(selected);
        selectedCards.sort((a,b) => b - a).forEach(idx => { myHand.splice(idx, 1); });
        selectedCards = [];
        playSound('win');
        logMove(p1Name, "played a Meld!");
        renderBoard();
        checkWin(1);
        if(gameMode === "online" && gameState === "playing") pushGameState();
    } else {
        playSound('lose');
        alert("Invalid Meld! Must be 3+ cards of same rank, or suited run in order.");
    }
});

document.getElementById("discard-btn").addEventListener("click", () => {
    if(selectedCards.length !== 1 || gameState !== "playing") return;
    
    const idx = selectedCards[0];
    const card = myHand.splice(idx, 1)[0];
    discardPile.push(card);
    
    selectedCards = [];
    currentPhase = "draw";
    currentTurn = 2; 
    
    playSound('card-shove-2');
    logMove(p1Name, `discarded a card.`);
    renderBoard();
    checkWin(1);
    
    if(gameState === "playing") {
        if(gameMode === "online") pushGameState();
        if(gameMode === "ai") setTimeout(aiTurn, 1500);
    }
});

function checkWin(player) {
    if (myHand.length === 0) {
        gameState = "finished";
        playSound('win');
        showGameOver(p1Name, "You emptied your hand first!");
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), { status: "finished", winner: p1Name });
    } else if (oppHandCount === 0 || oppHand.length === 0) {
        gameState = "finished";
        playSound('lose');
        showGameOver(p2Name, `${p2Name} emptied their hand first!`);
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), { status: "finished", winner: p2Name });
    }
}

// ==========================================
// 4. THE AI BRAIN (NOW MELADS!)
// ==========================================
function aiTurn() {
    if (gameState !== "playing") return;

    // 1. AI Draws
    if(deck.length === 0) {
        const topDiscard = discardPile.pop();
        deck = discardPile.reverse();
        discardPile = [topDiscard];
    }

    if(discardPile.length > 0 && Math.random() > 0.5) {
        oppHand.push(discardPile.pop());
        logMove(p2Name, "drew from discard pile.");
    } else {
        oppHand.push(deck.pop());
        logMove(p2Name, "drew from deck.");
    }
    playSound('card-draw');
    oppHandCount = oppHand.length;
    renderBoard();

    // 2. AI Attempts to Meld (Searches for 3-of-a-kind)
    let rankCounts = {};
    oppHand.forEach(c => {
        rankCounts[c.rank] = rankCounts[c.rank] || [];
        rankCounts[c.rank].push(c);
    });

    for (let rank in rankCounts) {
        if (rankCounts[rank].length >= 3) {
            oppMelds.push(rankCounts[rank]);
            // Remove from hand
            oppHand = oppHand.filter(c => c.rank != rank);
            oppHandCount = oppHand.length;
            logMove(p2Name, "played a Meld!");
            playSound('win');
            renderBoard();
            break; // Only play one meld per turn to be safe
        }
    }

    // 3. AI Discards
    setTimeout(() => {
        if (gameState !== "playing") return;
        const discard = oppHand.shift(); 
        discardPile.push(discard);
        oppHandCount = oppHand.length;
        
        playSound('card-shove-2');
        logMove(p2Name, "discarded a card.");
        
        currentTurn = 1;
        currentPhase = "draw";
        renderBoard();
        checkWin(2);
    }, 1500);
}

// ==========================================
// 5. RENDER ENGINE & UI
// ==========================================
function toggleSelection(index) {
    if (currentPhase !== "discard" || currentTurn !== 1) return;
    const pos = selectedCards.indexOf(index);
    if (pos > -1) selectedCards.splice(pos, 1);
    else selectedCards.push(index);
    playSound('card-draw');
    renderBoard();
}

function renderBoard() {
    const handDiv = document.getElementById("player-hand");
    handDiv.innerHTML = "";
    myHand.forEach((card, index) => {
        const cardEl = document.createElement("div");
        cardEl.className = "playing-card";
        if (selectedCards.includes(index)) cardEl.classList.add("selected-card");
        cardEl.style.zIndex = index;
        cardEl.style.backgroundImage = `url('${card.img}')`;
        cardEl.addEventListener("click", () => toggleSelection(index));
        handDiv.appendChild(cardEl);
    });

    const playerMeldDiv = document.getElementById("player-melds");
    playerMeldDiv.innerHTML = "";
    myMelds.forEach(meld => {
        const groupDiv = document.createElement("div");
        groupDiv.className = "meld-group";
        meld.forEach(card => {
            const cardEl = document.createElement("div");
            cardEl.className = "playing-card";
            cardEl.style.backgroundImage = `url('${card.img}')`;
            groupDiv.appendChild(cardEl);
        });
        playerMeldDiv.appendChild(groupDiv);
    });

    const oppMeldDiv = document.getElementById("opponent-melds");
    oppMeldDiv.innerHTML = "";
    oppMelds.forEach(meld => {
        const groupDiv = document.createElement("div");
        groupDiv.className = "meld-group";
        meld.forEach(card => {
            const cardEl = document.createElement("div");
            cardEl.className = "playing-card";
            cardEl.style.backgroundImage = `url('${card.img}')`;
            groupDiv.appendChild(cardEl);
        });
        oppMeldDiv.appendChild(groupDiv);
    });

    const discardDiv = document.getElementById("discard-pile");
    discardDiv.innerHTML = "";
    if (discardPile.length > 0) {
        const topDiscard = discardPile[discardPile.length - 1];
        const cardEl = document.createElement("div");
        cardEl.className = "playing-card";
        cardEl.style.backgroundImage = `url('${topDiscard.img}')`;
        discardDiv.appendChild(cardEl);
    }

    const stockBack = document.getElementById("stock-back");
    const stockCount = document.getElementById("stock-count");
    if (deck.length > 0) {
        stockBack.classList.remove("hidden");
        stockCount.classList.remove("hidden");
        stockCount.innerText = deck.length;
    } else {
        stockBack.classList.add("hidden"); stockCount.classList.add("hidden");
    }

    const oppHandDiv = document.getElementById("opponent-hand");
    oppHandDiv.innerHTML = "";
    for(let i=0; i<oppHandCount; i++){
        const backEl = document.createElement("div");
        backEl.className = "playing-card card-back";
        backEl.style.zIndex = i;
        oppHandDiv.appendChild(backEl);
    }
    document.getElementById("p2-card-count").innerText = oppHandCount;

    const turnBanner = document.getElementById("turn-banner");
    const phaseBanner = document.getElementById("phase-banner");
    const meldBtn = document.getElementById("meld-btn");
    const discardBtn = document.getElementById("discard-btn");

    turnBanner.classList.remove("hidden");
    phaseBanner.classList.remove("hidden");

    if (currentTurn === 1) {
        turnBanner.innerText = "⭐ YOUR TURN";
        turnBanner.style.color = "#2ecc71";
        if (currentPhase === "draw") {
            phaseBanner.innerText = "DRAW FROM DECK OR DISCARD PILE";
            meldBtn.classList.add("hidden"); discardBtn.classList.add("hidden");
            selectedCards = []; 
        } else if (currentPhase === "discard") {
            phaseBanner.innerText = "MELD CARDS OR DISCARD TO END TURN";
            if (selectedCards.length >= 3) meldBtn.classList.remove("hidden");
            else meldBtn.classList.add("hidden");
            if (selectedCards.length === 1) discardBtn.classList.remove("hidden");
            else discardBtn.classList.add("hidden");
        }
    } else {
        turnBanner.innerText = gameMode === "ai" ? "🤖 AI IS THINKING..." : "⏳ OPPONENT'S TURN";
        turnBanner.style.color = "#e74c3c";
        phaseBanner.innerText = "WAITING...";
        meldBtn.classList.add("hidden"); discardBtn.classList.add("hidden");
    }
}

// Modal Handlers
function showGameOver(winner, msg) {
    document.getElementById("game-over-title").innerText = `${winner} WINS!`;
    document.getElementById("game-over-title").style.color = winner === p1Name ? "#2ecc71" : "#e74c3c";
    document.getElementById("game-over-msg").innerText = msg;
    document.getElementById("game-over-modal").classList.remove("hidden");
}

document.getElementById("btn-play-again").addEventListener("click", () => {
    document.getElementById("game-over-modal").classList.add("hidden");
    resetGame();
    if(gameMode === "ai") startGame();
    else {
        document.getElementById("start-game-btn").innerText = "Waiting for Host...";
        if(isHost) document.getElementById("start-game-btn").disabled = false;
    }
});

document.getElementById("btn-exit-game").addEventListener("click", () => {
    window.location.reload(); // Simple refresh resets back to OS / AI mode
});

function resetGame() {
    deck = []; discardPile = []; myHand = []; oppHand = []; myMelds = []; oppMelds = [];
    document.getElementById("player-hand").innerHTML = "";
    document.getElementById("discard-pile").innerHTML = "";
    document.getElementById("player-melds").innerHTML = "";
    document.getElementById("opponent-melds").innerHTML = "";
    document.getElementById("start-game-btn").classList.remove("hidden");
    document.getElementById("turn-banner").classList.add("hidden");
    document.getElementById("phase-banner").classList.add("hidden");
    document.getElementById("sort-btn").classList.add("hidden");
    document.getElementById("meld-btn").classList.add("hidden");
    document.getElementById("discard-btn").classList.add("hidden");
    
    if (gameMode === "online" && !isHost) {
        document.getElementById("start-game-btn").innerText = "Waiting for Host...";
        document.getElementById("start-game-btn").disabled = true;
    } else {
        document.getElementById("start-game-btn").innerText = "Start Game";
        document.getElementById("start-game-btn").disabled = false;
    }
}

document.getElementById("start-game-btn").addEventListener("click", startGame);

// ==========================================
// 6. FIREBASE MULTIPLAYER & SYNC
// ==========================================
const lobbyUI = document.getElementById("multiplayer-lobby");

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for(let i=0; i<4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

document.getElementById("btn-create-room").addEventListener("click", () => {
    playSound('win');
    currentRoomId = generateRoomCode(); isHost = true; myId = 1; chatStarted = false;
    window.dbSet(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), {
        status: "waiting", players: 1, p1Name: p1Name, turn: 1
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        document.getElementById("btn-create-room").disabled = true;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    playSound('win');
    const code = document.getElementById("join-room-input").value.toUpperCase();
    window.dbGet(window.dbChild(window.dbRef(window.db), `rummy_rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists() && snapshot.val().players === 1) {
            currentRoomId = code; isHost = false; myId = 2; chatStarted = false;
            window.dbUpdate(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), {
                players: 2, p2Name: p1Name, status: "playing"
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
    window.dbOnValue(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) return;
        if(data.status === "playing" && !chatStarted) {
            chatStarted = true; lobbyUI.classList.add("hidden");
            playSound('win'); SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
        }
        syncFromFirebase(data);
    });
}

function pushGameState() {
    if (gameMode !== "online") return;
    let payload = {
        deck: deck, discardPile: discardPile,
        turn: currentTurn, phase: currentPhase, status: gameState
    };
    if (myId === 1) { 
        payload.p1Hand = myHand; payload.p2Hand = oppHand; 
        payload.p1Melds = myMelds; payload.p2Melds = oppMelds;
    } else { 
        payload.p2Hand = myHand; payload.p1Hand = oppHand; 
        payload.p2Melds = myMelds; payload.p1Melds = oppMelds;
    }
    
    const lastLogNode = document.getElementById("move-log").lastElementChild;
    if(lastLogNode) payload.lastLogHTML = lastLogNode.innerHTML;

    window.dbUpdate(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), payload);
}

function syncFromFirebase(data) {
    if (data.status === "playing" && data.deck) {
        document.getElementById("start-game-btn").classList.add("hidden");
        document.getElementById("sort-btn").classList.remove("hidden");
        
        gameState = "playing";
        deck = data.deck || []; discardPile = data.discardPile || [];
        currentTurn = data.turn || 1;
        currentPhase = data.phase || "draw";
        
        if (myId === 1) {
            myHand = data.p1Hand || []; oppHand = data.p2Hand || []; p2Name = data.p2Name || "Opponent";
            myMelds = data.p1Melds || []; oppMelds = data.p2Melds || [];
        } else {
            myHand = data.p2Hand || []; oppHand = data.p1Hand || []; p2Name = data.p1Name || "Opponent";
            myMelds = data.p2Melds || []; oppMelds = data.p1Melds || [];
        }
        oppHandCount = oppHand.length;

        if (data.lastLogHTML && data.lastLogHTML !== lastLogSync) {
            lastLogSync = data.lastLogHTML;
            if (!data.lastLogHTML.includes(p1Name)) {
                const logDiv = document.getElementById("move-log");
                const entry = document.createElement("div");
                entry.innerHTML = data.lastLogHTML;
                logDiv.appendChild(entry);
                logDiv.scrollTop = logDiv.scrollHeight;
            }
        }

        renderBoard(); 
    } else if (data.status === "finished") { 
        if(data.winner && data.winner !== p1Name) {
            showGameOver(data.winner, `${data.winner} emptied their hand first!`);
        }
    }
}

document.getElementById("lobby-close-btn").addEventListener("click", () => { lobbyUI.classList.add("hidden"); });
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    gameMode = "ai"; p2Name = "AI";
    document.getElementById("sys-rummy-mode").value = "ai";
    localStorage.setItem("rummy_mode", "ai");
    lobbyUI.classList.add("hidden");
    SystemUI.stopChat(); chatStarted = false;
    resetGame();
});

resetGame();