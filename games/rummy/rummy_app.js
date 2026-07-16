// ==========================================
// 1. INITIALIZE OS & STATE
// ==========================================
let gameMode = "ai"; // FIX: ALWAYS default to vs AI on launch
localStorage.setItem("rummy_mode", "ai"); // Clear any cached online state

let myId = 1;
let currentRoomId = null;
let isHost = true; // Default to host so the start button is clickable locally
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

// Sync dropdown after SystemUI injects it
setTimeout(() => {
    const modeDropdown = document.getElementById("sys-rummy-mode");
    if (modeDropdown) {
        modeDropdown.value = gameMode;
        modeDropdown.addEventListener("change", (e) => {
            gameMode = e.target.value;
            localStorage.setItem("rummy_mode", gameMode);
            document.getElementById("sys-modal").classList.add("sys-hidden");
            
            if(gameMode === "online") {
                document.getElementById("multiplayer-lobby").classList.remove("hidden");
            } else { 
                document.getElementById("multiplayer-lobby").classList.add("hidden"); 
                SystemUI.stopChat(); 
                chatStarted = false; 
                // Reset host privileges so local start button works
                myId = 1;
                isHost = true;
                p2Name = "AI";
                resetGame(); 
            }
        });
    }
}, 10);

// --- RUMMY GAME STATE ---
let deck = [];
let discardPile = [];
let myHand = [];
let oppHand = [];
let oppHandCount = 0;
let myMelds = [];
let oppMelds = [];

let currentTurn = 1; // 1 = player 1 / host, 2 = player 2 / ai
let currentPhase = "draw"; // "draw" or "discard"
let selectedCards = [];
let gameState = "setup";
let lastLogSync = "";
let stateSeq = 0;       // monotonic packet counter shared via pushes; guards stale/out-of-order state
let roomListener = null;

function isMyTurn() {
    if (gameMode === "online") return currentTurn === myId;
    return currentTurn === 1;
}

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

    // AUDIT: Safely track play count
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("rummy");

    playSound('shuffle');
    document.getElementById("start-game-btn").classList.add("hidden");
    document.getElementById("sort-btn").classList.remove("hidden");

    buildDeck();
    myHand = []; oppHand = []; discardPile = []; myMelds = []; oppMelds = []; selectedCards = [];
    gameState = "playing";
    currentTurn = 1;
    currentPhase = "draw";

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
    if(!isMyTurn() || currentPhase !== "draw" || gameState !== "playing") return;

    if(deck.length === 0) {
        const topDiscard = discardPile.pop();
        deck = [...discardPile].reverse(); 
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
    if(!isMyTurn() || currentPhase !== "draw" || discardPile.length === 0 || gameState !== "playing") return;

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
    if(selectedCards.length !== 1 || gameState !== "playing" || !isMyTurn() || currentPhase !== "discard") return;

    const idx = selectedCards[0];
    const card = myHand.splice(idx, 1)[0];
    discardPile.push(card);

    selectedCards = [];
    currentPhase = "draw";
    currentTurn = (gameMode === "online") ? (myId === 1 ? 2 : 1) : 2;

    playSound('switch4'); // Simple snappy sound for discarding
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
        // AUDIT: Tracking win
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("rummy", 0);
        playSound('win');
        showGameOver(p1Name, "You emptied your hand first!");
        // winnerSeat is the reliable comparison key (names can collide); winner kept for display
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), { status: "finished", winner: p1Name, winnerSeat: myId });
    } else if (oppHandCount === 0 || oppHand.length === 0) {
        gameState = "finished";
        // AUDIT: Tracking loss
        if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("rummy");
        playSound('lose');
        showGameOver(p2Name, `${p2Name} emptied their hand first!`);
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), { status: "finished", winner: p2Name, winnerSeat: (myId === 1 ? 2 : 1) });
    }
}

// ==========================================
// 4. THE AI BRAIN
// ==========================================
function aiTurn() {
    if (gameState !== "playing") return;

    // 1. AI Draws
    if(deck.length === 0) {
        const topDiscard = discardPile.pop();
        deck = [...discardPile].reverse(); 
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

    // 2. AI Attempts to Meld (searches for 3-of-a-kind)
    let rankCounts = {};
    oppHand.forEach(c => {
        rankCounts[c.rank] = rankCounts[c.rank] || [];
        rankCounts[c.rank].push(c);
    });

    for (let rank in rankCounts) {
        if (rankCounts[rank].length >= 3) {
            oppMelds.push(rankCounts[rank]);
            oppHand = oppHand.filter(c => c.rank != rank);
            oppHandCount = oppHand.length;
            logMove(p2Name, "played a Meld!");
            playSound('win');
            renderBoard();
            break;
        }
    }

    // 3. AI Discards
    setTimeout(() => {
        if (gameState !== "playing") return;
        const discard = oppHand.shift();
        discardPile.push(discard);
        oppHandCount = oppHand.length;

        playSound('switch4');
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
    if (currentPhase !== "discard" || !isMyTurn()) return;
    const pos = selectedCards.indexOf(index);
    if (pos > -1) selectedCards.splice(pos, 1);
    else selectedCards.push(index);
    playSound('click1'); // Nice tactile click
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

    if (isMyTurn()) {
        turnBanner.innerText = "⭐ YOUR TURN";
        turnBanner.style.color = "#2ecc71";
        if (currentPhase === "draw") {
            phaseBanner.innerText = "DRAW FROM DECK OR DISCARD PILE";
            meldBtn.classList.add("hidden");
            discardBtn.classList.add("hidden");
            discardBtn.disabled = false;
            discardBtn.style.opacity = "1";
            selectedCards = [];
        } else if (currentPhase === "discard") {
            phaseBanner.innerText = selectedCards.length === 0
                ? "TAP A CARD TO SELECT IT, THEN DISCARD OR MELD"
                : "MELD 3+ CARDS OR SELECT 1 TO DISCARD";

            if (selectedCards.length >= 3) meldBtn.classList.remove("hidden");
            else meldBtn.classList.add("hidden");

            discardBtn.classList.remove("hidden");
            discardBtn.disabled = selectedCards.length !== 1;
            discardBtn.style.opacity = selectedCards.length === 1 ? "1" : "0.5";
        }
    } else {
        turnBanner.innerText = gameMode === "ai" ? "🤖 AI IS THINKING..." : "⏳ OPPONENT'S TURN";
        turnBanner.style.color = "#e74c3c";
        phaseBanner.innerText = "WAITING...";
        meldBtn.classList.add("hidden");
        discardBtn.classList.add("hidden");
        discardBtn.disabled = false;
        discardBtn.style.opacity = "1";
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
    window.location.reload();
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
    stateSeq = 0; lastLogSync = "";
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
            stateSeq = 0; lastLogSync = "";
            window.dbUpdate(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), {
                players: 2, p2Name: p1Name, status: "playing"
            });
            lobbyUI.classList.add("hidden");
            listenToRoom();
        }
    });
});

function listenToRoom() {
    let onlineGameStarted = false;
    roomListener = window.dbOnValue(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) {
            // Room node deleted = host left
            if (!isHost && currentRoomId) {
                alert("Host left the game.");
                exitOnlineToLocal();
            }
            return;
        }
        if (data.status === "abandoned") {
            if (isHost) {
                alert(`${p2Name} left the game.`);
                const oldRoom = currentRoomId;
                exitOnlineToLocal();
                window.dbRemove(window.dbRef(window.db, 'rummy_rooms/' + oldRoom));
            }
            return;
        }
        if(data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            lobbyUI.classList.add("hidden");
            if (!chatStarted) {
                chatStarted = true;
                playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
        }
        syncFromFirebase(data);
    });
}

function pushGameState() {
    if (gameMode !== "online") return;
    stateSeq++;
    let payload = {
        deck: deck, discardPile: discardPile,
        turn: currentTurn, phase: currentPhase, status: gameState,
        dealt: true, // stable "game dealt" sentinel — deck/discard strip from snapshots when empty
        seq: stateSeq, pusher: myId
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
    // Ordering guard: drop stale packets, and skip our own echoes (they carry our own state)
    if (data.seq) {
        if (data.seq < stateSeq) return;
        stateSeq = data.seq;
    }
    if (data.pusher && data.pusher === myId && data.status === "playing") return;
    // Gate on the dealt sentinel, NOT on deck: the stock routinely empties and RTDB strips
    // empty arrays, which used to freeze all sync from that point on.
    if (data.status === "playing" && data.dealt) {
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
        if (gameState === "playing") {
            // The winner already announced locally (gameState is "finished" there);
            // announce once on the losing side, comparing by seat, not display name.
            gameState = "finished";
            const iWon = (data.winnerSeat !== undefined) ? (data.winnerSeat === myId) : (data.winner === p1Name);
            if (!iWon) {
                // AUDIT: Tracking final game result
                if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("rummy");
                showGameOver(data.winner || p2Name, `${data.winner || p2Name} emptied their hand first!`);
            }
        }
    }
}

document.getElementById("lobby-close-btn").addEventListener("click", () => { lobbyUI.classList.add("hidden"); });
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    if (roomListener) { roomListener(); roomListener = null; }
    if (isHost && currentRoomId) window.dbRemove(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId));
    currentRoomId = null;
    document.getElementById("btn-create-room").disabled = false;
    document.getElementById("room-code-display").classList.add("hidden");
    gameMode = "ai"; p2Name = "AI";
    document.getElementById("sys-rummy-mode").value = "ai";
    localStorage.setItem("rummy_mode", "ai");
    lobbyUI.classList.add("hidden");
    SystemUI.stopChat(); chatStarted = false;

    myId = 1;
    isHost = true;
    resetGame();
});

function exitOnlineToLocal() {
    if (roomListener) { roomListener(); roomListener = null; }
    SystemUI.stopChat(); chatStarted = false;
    gameMode = "ai"; myId = 1; isHost = true; p2Name = "AI"; currentRoomId = null;
    stateSeq = 0; lastLogSync = "";
    localStorage.setItem("rummy_mode", "ai");
    const modeDropdown = document.getElementById("sys-rummy-mode");
    if (modeDropdown) modeDropdown.value = "ai";
    lobbyUI.classList.add("hidden");
    document.getElementById("btn-create-room").disabled = false;
    document.getElementById("room-code-display").classList.add("hidden");
    resetGame();
}

window.addEventListener("beforeunload", () => {
    if (gameMode === "online" && currentRoomId && window.db) {
        if (isHost) {
            window.dbRemove(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId));
        } else if (gameState === "playing") {
            // Joiner vanished mid-game: flag it so the host doesn't wait forever
            window.dbUpdate(window.dbRef(window.db, 'rummy_rooms/' + currentRoomId), { status: "abandoned" });
        }
    }
});

resetGame();