// ==========================================
// 1. INITIALIZE OS & STATE (V2 Engine)
// ==========================================
let gameMode = "ai";
localStorage.setItem("domino_mode", "ai"); 

let myId = 1;
let currentRoomId = null;
let isHost = true;
let chatStarted = false;
let seats = [];

let p1Name = SystemUI.getPlayerName();
let p2Name = "AI";

function playDominoSound(type) {
    let snd;
    if (type === 'draw') snd = new Audio('../../system/audio/card-draw.ogg');
    else if (type === 'play') snd = new Audio('../../system/audio/card-shove-2.ogg'); 
    else if (type === 'win') snd = new Audio('../../system/audio/win.ogg');
    else if (type === 'lose') snd = new Audio('../../system/audio/lose.ogg');
    else if (type === 'tie') snd = new Audio('../../system/audio/tie.ogg'); 

    if (snd) {
        snd.pause();
        snd.currentTime = 0;
        snd.play().catch(e => console.log("Audio failed:", e));
    }
}

function logMove(player, msg, isSystem = false) {
    const logContainer = document.getElementById("move-log-container");
    const logDiv = document.getElementById("move-log");
    if(!logContainer || !logDiv) return;
    logContainer.classList.remove("hidden");

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

// --- DOMINO GAME STATE ---
let boneyard = [];
let board = []; 
let myHand = [];
let oppHand = []; 
let oppHandCount = 0;
let currentTurn = 1;

function isMyTurn() {
    return gameMode === "online" ? currentTurn === myId : currentTurn === 1;
}
let leftEnd = null;
let rightEnd = null;
let consecutivePasses = 0;
let gameState = "setup"; 
let lastPlayedTileId = null;
let pendingPlayIndex = null; 

SystemUI.init({
    gameName: "DOMINOES PRO",
    rules: "Match the dots on either end of the board. Double tiles sit vertically. If you can't play, draw from the boneyard. First to empty their hand wins!",
    hudDropdowns: [
        { id: "sys-domino-mode", options: [ { value: "ai", label: "🤖 vs AI" }, { value: "online", label: "🌐 Online" } ] }
    ]
});

document.getElementById("p1-label").innerText = p1Name;

// Sync dropdown after init
setTimeout(() => {
    const modeEl = document.getElementById("sys-domino-mode");
    if(modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", (e) => {
            gameMode = e.target.value;
            localStorage.setItem("domino_mode", gameMode);
            document.getElementById("sys-modal").classList.add("sys-hidden");
            if (gameMode === "online") {
                SystemUI.v2Lobby.show();
            } else {
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat(); chatStarted = false;
                myId = 1; isHost = true;
                resetGame();
            }
        });
    }
}, 10);

// ==========================================
// 2. CSS TILE GENERATOR 
// ==========================================
function buildBoneyard() {
    boneyard = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            boneyard.push({ id: generateId(), top: i, bottom: j, isDouble: i === j, placedLeftVal: null, placedRightVal: null });
        }
    }
    for (let i = boneyard.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [boneyard[i], boneyard[j]] = [boneyard[j], boneyard[i]];
    }
}

function generateId() { return Math.random().toString(36).substr(2, 9); }

function getPipsHTML(num) {
    if (num === 0) return '';
    let html = '';
    const layouts = {
        1: ['c'], 2: ['tl', 'br'], 3: ['tl', 'c', 'br'],
        4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'c', 'bl', 'br'],
        6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br']
    };
    layouts[num].forEach(pos => { html += `<div class="pip ${pos}"></div>`; });
    return html;
}

function renderTileElement(tile, isBoard = false) {
    const wrapper = document.createElement("div");
    wrapper.className = "domino-wrapper";

    const el = document.createElement("div");
    el.className = "domino-tile";
    if (isBoard) el.classList.add("board-tile");

    el.innerHTML = `
        <div class="domino-half top">${getPipsHTML(tile.top)}</div>
        <div class="domino-spinner"></div>
        <div class="domino-half bottom">${getPipsHTML(tile.bottom)}</div>
    `;

    if (isBoard && !tile.isDouble) {
        wrapper.classList.add("horizontal");
        if (tile.placedLeftVal === tile.top) {
            el.classList.add("rotate-minus-90"); 
        } else {
            el.classList.add("rotate-90"); 
        }
    }

    if (isBoard && tile.id === lastPlayedTileId) {
        wrapper.classList.add("anim-place");
        setTimeout(() => wrapper.classList.remove("anim-place"), 300);
    }

    wrapper.appendChild(el);
    return wrapper;
}

// ==========================================
// 3. GAMEPLAY & RULES ENGINE
// ==========================================
function startGame() {
    if (gameMode === "online" && !isHost) return; 

    // AUDIT: Safely track play count via OS 2.0
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("dominoes");

    playDominoSound('draw');
    document.getElementById("start-game-btn").classList.add("hidden");
    document.getElementById("move-log-container").classList.remove("hidden");
    document.getElementById("move-log").innerHTML = "";
    document.getElementById("boneyard").classList.remove("hidden");
    
    logMove("SYSTEM", "Shuffling the boneyard...", true);
    
    buildBoneyard();
    board = [];
    myHand = [];
    oppHand = [];
    leftEnd = null;
    rightEnd = null;
    consecutivePasses = 0;
    gameState = "playing";
    currentTurn = 1;
    lastPlayedTileId = null;

    for(let i = 0; i < 7; i++) {
        myHand.push(boneyard.pop());
        oppHand.push(boneyard.pop());
    }
    oppHandCount = oppHand.length;

    renderTable();
    checkPassVisibility();
    if(gameMode === "online") pushGameState();
}

function attemptPlayTile(index) {
    if (!isMyTurn() || gameState !== "playing") return;

    const tile = myHand[index];
    let canLeft = false;
    let canRight = false;

    if (board.length === 0) {
        executePlay(index, 'first', 1);
        return;
    }

    if (tile.top === leftEnd || tile.bottom === leftEnd) canLeft = true;
    if (tile.top === rightEnd || tile.bottom === rightEnd) canRight = true;

    if (canLeft && canRight && leftEnd !== rightEnd && !tile.isDouble) {
        pendingPlayIndex = index;
        document.getElementById("side-picker-modal").classList.remove("hidden");
    } else if (canLeft) {
        executePlay(index, 'left', 1);
    } else if (canRight) {
        executePlay(index, 'right', 1);
    } else {
        playDominoSound('lose'); 
    }
}

document.getElementById("btn-play-left").addEventListener("click", () => {
    document.getElementById("side-picker-modal").classList.add("hidden");
    if(pendingPlayIndex !== null) executePlay(pendingPlayIndex, 'left', 1);
    pendingPlayIndex = null;
});
document.getElementById("btn-play-right").addEventListener("click", () => {
    document.getElementById("side-picker-modal").classList.add("hidden");
    if(pendingPlayIndex !== null) executePlay(pendingPlayIndex, 'right', 1);
    pendingPlayIndex = null;
});
document.getElementById("btn-cancel-play").addEventListener("click", () => {
    document.getElementById("side-picker-modal").classList.add("hidden");
    pendingPlayIndex = null;
});

function executePlay(index, position, player) {
    consecutivePasses = 0; 
    const hand = player === 1 ? myHand : oppHand;
    const tile = hand.splice(index, 1)[0];
    lastPlayedTileId = tile.id;
    
    if (position === 'first') {
        leftEnd = tile.top;
        rightEnd = tile.bottom;
        tile.placedLeftVal = tile.top;
        tile.placedRightVal = tile.bottom;
        board.push(tile);
    } else if (position === 'left') {
        if (tile.bottom === leftEnd) {
            tile.placedRightVal = tile.bottom;
            tile.placedLeftVal = tile.top;
            leftEnd = tile.top;
        } else {
            tile.placedRightVal = tile.top;
            tile.placedLeftVal = tile.bottom;
            leftEnd = tile.bottom;
        }
        board.unshift(tile);
    } else if (position === 'right') {
        if (tile.top === rightEnd) {
            tile.placedLeftVal = tile.top;
            tile.placedRightVal = tile.bottom;
            rightEnd = tile.bottom;
        } else {
            tile.placedLeftVal = tile.bottom;
            tile.placedRightVal = tile.top;
            rightEnd = tile.top;
        }
        board.push(tile);
    }

    playDominoSound('play');
    const playerName = player === 1 ? p1Name : p2Name;
    logMove(playerName, `played [${tile.top}|${tile.bottom}]`);

    if(player === 2) oppHandCount = oppHand.length;

    renderTable();
    checkWin(player);
    
    if (gameState === "playing") {
        currentTurn = (gameMode === "online") ? (myId === 1 ? 2 : 1) : (player === 1 ? 2 : 1);
        renderTable(); 
        checkPassVisibility();
        if (gameMode === "online") pushGameState();
        if (currentTurn === 2 && gameMode === "ai") setTimeout(aiTurn, 1200);
    }
}

function drawFromBoneyard() {
    if (!isMyTurn() || boneyard.length === 0 || gameState !== "playing") return;
    
    const tile = boneyard.pop();
    myHand.push(tile);
    playDominoSound('draw');
    logMove(p1Name, "drew a tile.");
    
    lastPlayedTileId = null; 
    renderTable();
    checkPassVisibility();
    if (gameMode === "online") pushGameState();
}

document.getElementById("boneyard").addEventListener("click", drawFromBoneyard);

document.getElementById("pass-turn-btn").addEventListener("click", () => {
    if (!isMyTurn() || gameState !== "playing") return;
    
    playDominoSound('play');
    logMove(p1Name, "knocked (passed).");
    consecutivePasses++;
    
    currentTurn = (gameMode === "online") ? (myId === 1 ? 2 : 1) : 2;
    renderTable();
    checkPassVisibility();
    
    checkBlockedGame();
    if(gameState === "playing") {
        if (gameMode === "online") pushGameState();
        if (gameMode === "ai") setTimeout(aiTurn, 1500);
    }
});

function checkPassVisibility() {
    const passBtn = document.getElementById("pass-turn-btn");
    if (!isMyTurn() || gameState !== "playing") {
        passBtn.classList.add("hidden");
        return;
    }

    let hasMove = false;
    if(board.length === 0) hasMove = true;
    else {
        hasMove = myHand.some(t => t.top === leftEnd || t.bottom === leftEnd || t.top === rightEnd || t.bottom === rightEnd);
    }

    if (!hasMove && boneyard.length === 0) passBtn.classList.remove("hidden");
    else passBtn.classList.add("hidden");
}

function checkWin(player) {
    if (myHand.length === 0) {
        gameState = "finished";
        
        // AUDIT: Safely track win via OS 2.0
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("dominoes", 0);

        playDominoSound('win');
        logMove("SYSTEM", `${p1Name} EMPTIED THEIR HAND!`, true);
        alert("YOU WIN!");
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), { status: "finished" });
        resetGame();
    } else if (oppHandCount === 0 || oppHand.length === 0) {
        gameState = "finished";

        // AUDIT: Safely track loss via OS 2.0
        if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("dominoes");

        playDominoSound('lose');
        logMove("SYSTEM", `${p2Name} EMPTIED THEIR HAND!`, true);
        alert(`${p2Name} WINS!`);
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), { status: "finished" });
        resetGame();
    }
}

function checkBlockedGame() {
    if (consecutivePasses >= 2) {
        gameState = "finished";
        playDominoSound('tie');
        logMove("SYSTEM", "TABLE IS BLOCKED! Game over.", true);
        alert("The table is blocked! It's a draw.");
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), { status: "finished" });
        resetGame();
    }
}

// ==========================================
// 4. THE AI BRAIN (Strategic Heuristic)
// ==========================================
function aiTurn() {
    if (gameState !== "playing") return;

    let possibleMoves = [];
    if (board.length === 0) {
        oppHand.forEach((t, i) => {
            possibleMoves.push({ 
                index: i, 
                pos: 'first', 
                score: (t.top + t.bottom) + (t.isDouble ? 50 : 0) 
            });
        });
    } else {
        oppHand.forEach((t, i) => {
            if (t.top === rightEnd || t.bottom === rightEnd) {
                possibleMoves.push({ 
                    index: i, 
                    pos: 'right', 
                    score: (t.top + t.bottom) + (t.isDouble ? 50 : 0) 
                });
            }
            if (t.top === leftEnd || t.bottom === leftEnd) {
                possibleMoves.push({ 
                    index: i, 
                    pos: 'left', 
                    score: (t.top + t.bottom) + (t.isDouble ? 50 : 0) 
                });
            }
        });
    }

    if (possibleMoves.length > 0) {
        possibleMoves.sort((a, b) => b.score - a.score);
        executePlay(possibleMoves[0].index, possibleMoves[0].pos, 2);
    } else if (boneyard.length > 0) {
        oppHand.push(boneyard.pop());
        oppHandCount = oppHand.length;
        playDominoSound('draw');
        logMove(p2Name, "drew from the boneyard.");
        renderTable();
        setTimeout(aiTurn, 1000); 
    } else {
        playDominoSound('play');
        logMove(p2Name, "knocked (passed).");
        consecutivePasses++;
        currentTurn = 1;
        renderTable();
        checkPassVisibility();
        checkBlockedGame();
        if(gameMode === "online") pushGameState();
    }
}

// ==========================================
// 5. VISUAL RENDERING & SCALING
// ==========================================
function renderTable() {
    const handDiv = document.getElementById("player-hand");
    if(!handDiv) return;
    handDiv.innerHTML = "";
    myHand.forEach((tile, index) => {
        const tileEl = renderTileElement(tile, false);
        tileEl.addEventListener("click", () => attemptPlayTile(index));
        handDiv.appendChild(tileEl);
    });

    const trainDiv = document.getElementById("domino-train");
    if(!trainDiv) return;
    trainDiv.innerHTML = "";
    board.forEach(tile => {
        trainDiv.appendChild(renderTileElement(tile, true));
    });

    requestAnimationFrame(() => {
        const boardArea = document.getElementById("domino-board");
        if(boardArea && trainDiv) {
            const maxAvailableWidth = boardArea.clientWidth - 20; 
            const realTrainWidth = trainDiv.scrollWidth;
            if (realTrainWidth > maxAvailableWidth && realTrainWidth > 0) {
                const scale = maxAvailableWidth / realTrainWidth;
                trainDiv.style.transform = `scale(${scale})`;
            } else {
                trainDiv.style.transform = `scale(1)`;
            }
        }
    });

    const oppHandDiv = document.getElementById("opponent-hand");
    if(oppHandDiv) {
        oppHandDiv.innerHTML = "";
        for(let i=0; i < oppHandCount; i++){
            const backEl = document.createElement("div");
            backEl.className = "domino-back";
            oppHandDiv.appendChild(backEl);
        }
    }
    
    document.getElementById("p1-label").innerText = p1Name;
    document.getElementById("p2-label").innerHTML = `${p2Name}: <span id="p2-bone-count">${oppHandCount}</span> tiles`;
    document.getElementById("boneyard-count").innerText = boneyard.length;

    const banner = document.getElementById("turn-banner");
    banner.classList.remove("hidden");
    if (isMyTurn()) {
        banner.innerText = "⭐ YOUR TURN";
        banner.style.color = "#2ecc71"; 
    } else {
        banner.innerText = gameMode === "ai" ? "🤖 AI IS THINKING..." : "⏳ OPPONENT'S TURN";
        banner.style.color = "#e74c3c"; 
    }
}

window.addEventListener("resize", renderTable);

function resetGame() {
    boneyard = []; board = []; myHand = []; oppHand = []; lastPlayedTileId = null;
    document.getElementById("player-hand").innerHTML = "";
    document.getElementById("opponent-hand").innerHTML = "";
    document.getElementById("domino-train").innerHTML = "";
    document.getElementById("domino-train").style.transform = "scale(1)";
    document.getElementById("move-log").innerHTML = "";
    document.getElementById("move-log-container").classList.add("hidden");
    document.getElementById("start-game-btn").classList.remove("hidden");
    document.getElementById("turn-banner").classList.add("hidden");
    document.getElementById("boneyard").classList.add("hidden");
    document.getElementById("pass-turn-btn").classList.add("hidden");
    document.getElementById("side-picker-modal").classList.add("hidden");

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
// 6. MULTIPLAYER (V2 Engine)
// ==========================================
SystemUI.v2Lobby.setup({
    onHost: () => {
        currentRoomId = Math.random().toString(36).substr(2, 4).toUpperCase();
        isHost = true; myId = 1; chatStarted = false;
        seats = [{ type: "human", name: SystemUI.getPlayerName() }, { type: "ai", name: "AI" }];
        window.dbSet(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), {
            status: "waiting", currentTurn: 1, seats: seats
        }).then(() => {
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
            listenToRoom();
        });
    },
    onJoin: (code) => {
        window.dbGet(window.dbChild(window.dbRef(window.db), `domino_rooms/${code}`)).then((snapshot) => {
            if (snapshot.exists()) {
                let data = snapshot.val();
                if (data.seats && data.seats[1].type === "ai") {
                    currentRoomId = code; isHost = false; myId = 2; chatStarted = false;
                    let updatedSeats = data.seats;
                    updatedSeats[1] = { type: "human", name: SystemUI.getPlayerName() };
                    window.dbUpdate(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), { 
                        seats: updatedSeats, 
                        status: "playing" 
                    });
                    SystemUI.v2Lobby.showRoomPhase(currentRoomId, false);
                    listenToRoom();
                }
            }
        });
    },
    onLeave: () => {
        gameMode = "ai"; myId = 1; isHost = true;
        resetGame();
    },
    onStart: () => {
        window.dbUpdate(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), { status: "playing" });
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) return;
        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);
        if(data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            SystemUI.v2Lobby.hide();
            if(!chatStarted) {
                chatStarted = true;
                playDominoSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
        }
        syncFromFirebase(data);
    });
}

function pushGameState() {
    if (gameMode !== "online") return;
    let payload = {
        board: board, 
        boneyard: boneyard, 
        turn: currentTurn, 
        leftEnd: leftEnd, 
        rightEnd: rightEnd,
        consecutivePasses: consecutivePasses, 
        status: gameState, 
        lastPlayedTileId: lastPlayedTileId, 
        seats: seats
    };
    if (myId === 1) { 
        payload.p1Hand = myHand; 
        payload.p2Hand = oppHand; 
    } else { 
        payload.p2Hand = myHand; 
        payload.p1Hand = oppHand; 
    }
    window.dbUpdate(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), payload);
}

function syncFromFirebase(data) {
    if (data.status === "playing" && data.boneyard) {
        document.getElementById("start-game-btn").classList.add("hidden");
        document.getElementById("move-log-container").classList.remove("hidden");
        document.getElementById("boneyard").classList.remove("hidden");
        gameState = "playing";
        boneyard = data.boneyard || []; 
        board = data.board || [];
        currentTurn = data.turn || 1;
        leftEnd = data.leftEnd !== undefined ? data.leftEnd : null;
        rightEnd = data.rightEnd !== undefined ? data.rightEnd : null;
        consecutivePasses = data.consecutivePasses || 0;
        lastPlayedTileId = data.lastPlayedTileId || null;
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
        renderTable(); 
        checkPassVisibility();
        
        // V2 DROP-IN AI: If host and current turn is an AI seat
        if (isHost && gameState === "playing") {
            const currentSeatIdx = currentTurn - 1;
            if (seats[currentSeatIdx] && seats[currentSeatIdx].type === 'ai') {
                setTimeout(aiTurn, 1000);
            }
        }
    } else if (data.status === "finished") {
        resetGame();
    }
}

resetGame();