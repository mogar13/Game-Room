// ==========================================
// 1. INITIALIZE OS & STATE
// ==========================================
let gameMode = "ai";
localStorage.setItem("domino_mode", "ai"); 

let myId = 1;
let currentRoomId = null;
let isHost = false;
let chatStarted = false;

let p1Name = SystemUI.getPlayerName();
let p2Name = "AI";

function playDominoSound(type) {
    let snd;
    if (type === 'draw') snd = new Audio('../../system/audio/card-draw.ogg');
    else if (type === 'play') snd = new Audio('../../system/audio/card-shove-2.ogg'); 
    else if (type === 'win') snd = new Audio('../../system/audio/win.ogg');
    else if (type === 'lose') snd = new Audio('../../system/audio/lose.ogg');
    else if (type === 'tie') snd = new Audio('../../system/audio/tie.ogg'); // Added Tie

    if (snd) {
        snd.pause();
        snd.currentTime = 0;
        snd.play().catch(e => console.log("Audio failed:", e));
    }
}

function logMove(player, msg, isSystem = false) {
    const logContainer = document.getElementById("move-log-container");
    const logDiv = document.getElementById("move-log");
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
let leftEnd = null;
let rightEnd = null;
let consecutivePasses = 0;
let gameState = "setup"; 
let lastPlayedTileId = null;
let pendingPlayIndex = null; // Used for the Side Picker modal

SystemUI.init({
    gameName: "DOMINOES PRO",
    rules: "Match the dots on either end of the board. Double tiles sit vertically. If you can't play, draw from the boneyard. First to empty their hand wins!",
    hudDropdowns: [
        { id: "sys-domino-mode", options: [ { value: "ai", label: "🤖 vs AI" }, { value: "online", label: "🌐 Online" } ] }
    ]
});

document.getElementById("p1-label").innerText = p1Name;

document.getElementById("sys-domino-mode").value = gameMode;
document.getElementById("sys-domino-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("domino_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    if (gameMode === "online") document.getElementById("multiplayer-lobby").classList.remove("hidden");
    else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        SystemUI.stopChat(); chatStarted = false; resetGame();
    }
});

// ==========================================
// 2. CSS TILE GENERATOR 
// ==========================================
function buildBoneyard() {
    boneyard = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            // Added placedLeftVal and placedRightVal to track rotation mathematically
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

    // Mathematical Rotation Logic: Matches dots perfectly
    if (isBoard && !tile.isDouble) {
        wrapper.classList.add("horizontal");
        if (tile.placedLeftVal === tile.top) {
            el.classList.add("rotate-minus-90"); // Points TOP to the LEFT
        } else {
            el.classList.add("rotate-90"); // Points BOTTOM to the LEFT
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
    oppHandCount = 7;

    renderTable();
    checkPassVisibility();
    if(gameMode === "online") pushGameState();
}

function attemptPlayTile(index) {
    if (currentTurn !== 1 || gameState !== "playing") return;

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
        // Tile matches both sides, and sides are different. Ask user!
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

// Modal Listeners
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
    
    // The exact mathematical connection logic
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
        currentTurn = player === 1 ? 2 : 1;
        renderTable(); 
        checkPassVisibility();
        if (gameMode === "online") pushGameState();
        if (currentTurn === 2 && gameMode === "ai") setTimeout(aiTurn, 1500);
    }
}

function drawFromBoneyard() {
    if (currentTurn !== 1 || boneyard.length === 0 || gameState !== "playing") return;
    
    const tile = boneyard.pop();
    myHand.push(tile);
    playDominoSound('draw');
    logMove(p1Name, "drew a tile.");
    
    renderTable();
    checkPassVisibility();
    if (gameMode === "online") pushGameState();
}

document.getElementById("boneyard").addEventListener("click", drawFromBoneyard);

document.getElementById("pass-turn-btn").addEventListener("click", () => {
    if (currentTurn !== 1 || gameState !== "playing") return;
    
    playDominoSound('play');
    logMove(p1Name, "knocked (passed).");
    consecutivePasses++;
    
    currentTurn = 2;
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
    if (currentTurn !== 1 || gameState !== "playing") {
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
        playDominoSound('win');
        logMove("SYSTEM", `${p1Name} EMPTIED THEIR HAND!`, true);
        alert("YOU WIN!");
        if(gameMode === 'online') window.dbUpdate(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), { status: "finished" });
        resetGame();
    } else if (oppHandCount === 0 || oppHand.length === 0) {
        gameState = "finished";
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
// 4. THE AI BRAIN
// ==========================================
function aiTurn() {
    if (gameState !== "playing") return;

    let validIdx = -1;
    let position = null;

    if (board.length === 0) {
        validIdx = 0; position = 'first';
    } else {
        // AI prioritizes right side, then left
        for (let i = 0; i < oppHand.length; i++) {
            let t = oppHand[i];
            if (t.top === rightEnd || t.bottom === rightEnd) { validIdx = i; position = 'right'; break; }
            if (t.top === leftEnd || t.bottom === leftEnd) { validIdx = i; position = 'left'; break; }
        }
    }

    if (validIdx !== -1) {
        executePlay(validIdx, position, 2);
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
    }
}

// ==========================================
// 5. VISUAL RENDERING & SCALING
// ==========================================
function renderTable() {
    const handDiv = document.getElementById("player-hand");
    handDiv.innerHTML = "";
    myHand.forEach((tile, index) => {
        const tileEl = renderTileElement(tile, false);
        tileEl.addEventListener("click", () => attemptPlayTile(index));
        handDiv.appendChild(tileEl);
    });

    const trainDiv = document.getElementById("domino-train");
    trainDiv.innerHTML = "";
    board.forEach(tile => {
        trainDiv.appendChild(renderTileElement(tile, true));
    });

    // AUTO-SCALING MAGIC: Scales train down so it never requires scrolling
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
    oppHandDiv.innerHTML = "";
    for(let i=0; i < oppHandCount; i++){
        const backEl = document.createElement("div");
        backEl.className = "domino-back";
        oppHandDiv.appendChild(backEl);
    }
    
    document.getElementById("p1-label").innerText = p1Name;
    document.getElementById("p2-label").innerHTML = `${p2Name}: <span id="p2-bone-count">${oppHandCount}</span> tiles`;
    document.getElementById("boneyard-count").innerText = boneyard.length;

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

// Listen for resizing to adjust board
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
// 6. FIREBASE MULTIPLAYER & SYNC
// ==========================================
const lobbyUI = document.getElementById("multiplayer-lobby");
let lastLogSync = "";

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for(let i=0; i<4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

document.getElementById("btn-create-room").addEventListener("click", () => {
    playDominoSound('win');
    currentRoomId = generateRoomCode(); isHost = true; myId = 1; chatStarted = false;
    window.dbSet(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), {
        status: "waiting", players: 1, p1Name: p1Name, turn: 1
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        document.getElementById("btn-create-room").disabled = true;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    playDominoSound('win');
    const code = document.getElementById("join-room-input").value.toUpperCase();
    window.dbGet(window.dbChild(window.dbRef(window.db), `domino_rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists() && snapshot.val().players === 1) {
            currentRoomId = code; isHost = false; myId = 2; chatStarted = false;
            window.dbUpdate(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), {
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
    window.dbOnValue(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) return;
        if(data.status === "playing" && !chatStarted) {
            chatStarted = true; lobbyUI.classList.add("hidden");
            playDominoSound('win'); SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
        }
        syncFromFirebase(data);
    });
}

function pushGameState() {
    if (gameMode !== "online") return;
    let payload = {
        board: board, boneyard: boneyard,
        turn: currentTurn, leftEnd: leftEnd, rightEnd: rightEnd,
        consecutivePasses: consecutivePasses, status: gameState,
        lastPlayedTileId: lastPlayedTileId
    };
    if (myId === 1) { payload.p1Hand = myHand; payload.p2Hand = oppHand; } 
    else { payload.p2Hand = myHand; payload.p1Hand = oppHand; }
    
    const lastLogNode = document.getElementById("move-log").lastElementChild;
    if(lastLogNode) payload.lastLogHTML = lastLogNode.innerHTML;

    window.dbUpdate(window.dbRef(window.db, 'domino_rooms/' + currentRoomId), payload);
}

function syncFromFirebase(data) {
    if (data.status === "playing" && data.boneyard) {
        document.getElementById("start-game-btn").classList.add("hidden");
        document.getElementById("move-log-container").classList.remove("hidden");
        document.getElementById("boneyard").classList.remove("hidden");
        gameState = "playing";
        boneyard = data.boneyard || []; board = data.board || [];
        currentTurn = data.turn || 1;
        leftEnd = data.leftEnd !== undefined ? data.leftEnd : null;
        rightEnd = data.rightEnd !== undefined ? data.rightEnd : null;
        consecutivePasses = data.consecutivePasses || 0;
        lastPlayedTileId = data.lastPlayedTileId || null;
        
        if (myId === 1) {
            myHand = data.p1Hand || []; oppHand = data.p2Hand || []; p2Name = data.p2Name || "Opponent";
        } else {
            myHand = data.p2Hand || []; oppHand = data.p1Hand || []; p2Name = data.p1Name || "Opponent";
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

        renderTable(); checkPassVisibility();
    } else if (data.status === "finished") { resetGame(); }
}

document.getElementById("lobby-close-btn").addEventListener("click", () => { lobbyUI.classList.add("hidden"); });
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    gameMode = "ai"; p2Name = "AI";
    document.getElementById("sys-domino-mode").value = "ai";
    localStorage.setItem("domino_mode", "ai");
    lobbyUI.classList.add("hidden");
    SystemUI.stopChat(); chatStarted = false;
    resetGame();
});

resetGame();