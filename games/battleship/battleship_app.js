// ==========================================
// 1. INITIALIZE CASINO OS & MULTIPLAYER STATE
// ==========================================
let gameMode = localStorage.getItem("bs_mode") || "ai";
let aiDifficulty = localStorage.getItem("bs_diff") || "hard";
let myId = 1; 
let currentRoomId = null;
let isMoving = false;
let isHost = true; // Default to true so local play works
let chatStarted = false; 
let seats = [];
let roomListener = null;

SystemUI.init({
    gameName: "BATTLESHIP PRO",
    rules: "1. Select a ship and tap your fleet to place. 2. Auto-place for speed. 3. Hit all enemy ships to win!",
    hudDropdowns: [
        {
            id: "sys-bs-mode",
            options: [
                { value: "ai", label: "🤖 vs AI" },
                { value: "online", label: "🌐 Online" }
            ]
        },
        {
            id: "sys-bs-diff",
            options: [
                { value: "easy", label: "Easy AI" },
                { value: "normal", label: "Normal AI" },
                { value: "hard",   label: "Hard AI" }
            ]
        }
    ]
});

const sfxHit = new Audio('../../system/audio/hit.mp3');
const sfxSplash = new Audio('../../system/audio/splash.mp3');

function playCombatSound(type) {
    let snd = type === 'hit' ? sfxHit : sfxSplash;
    snd.pause(); 
    snd.currentTime = 0; 
    snd.play().catch(e => console.log("Audio failed:", e));
}

// Sync state after SystemUI's own setTimeout(0) has reset dropdowns to 'ai'
setTimeout(() => {
    document.getElementById("sys-bs-mode").value = gameMode;
    document.getElementById("sys-bs-diff").value = aiDifficulty;

    document.getElementById("sys-bs-diff").style.display = gameMode === "ai" ? "" : "none";
}, 50);

document.getElementById("sys-bs-mode").addEventListener("change", function(e) {
    gameMode = e.target.value;
    localStorage.setItem("bs_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    
    const diffEl = document.getElementById("sys-bs-diff");
    if (diffEl) diffEl.style.display = gameMode === "ai" ? "" : "none";
    
    if (gameMode === "online") {
        SystemUI.v2Lobby.show();
    } else {
        SystemUI.v2Lobby.hide();
        SystemUI.stopChat();
        chatStarted = false;
        myId = 1; isHost = true;
        if (roomListener) { roomListener(); roomListener = null; }
        resetGame();
    }
});

document.getElementById("sys-bs-diff").addEventListener("change", function(e) {
    aiDifficulty = e.target.value;
    localStorage.setItem("bs_diff", aiDifficulty);
});

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if(confirm("Wipe the board and restart the game?")) {
        resetGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});

// ==========================================
// 2. GRID & PLACEMENT LOGIC
// ==========================================
let playerBoard = Array(100).fill(0); 
let opponentBoard = Array(100).fill(0);
let currentShipSize = 0;
let selectedShipName = null;
let isHorizontal = true;
let deleteMode = false;
let shipsPlacedCount = 0;
let placedShips = new Set();
let shipCoords = {}; 
let opponentShipCoords = {}; 
let gameState = "setup";
let turn = 1;

const rollBtn = document.getElementById("fire-btn");

function initBoards() {
    const pGrid = document.getElementById("player-board");
    const oGrid = document.getElementById("opponent-board");
    pGrid.innerHTML = ''; oGrid.innerHTML = '';
    for (let i = 0; i < 100; i++) {
        let pCell = document.createElement("div");
        pCell.className = "cell"; pCell.dataset.index = i;
        pCell.addEventListener("click", () => placeOrDelete(i));
        pGrid.appendChild(pCell);
        let oCell = document.createElement("div");
        oCell.className = "cell"; oCell.dataset.index = i;
        oCell.addEventListener("click", () => handleAttack(i));
        oGrid.appendChild(oCell);
    }
}

document.querySelectorAll(".ship-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        if(deleteMode) toggleDeleteMode();
        currentShipSize = parseInt(e.target.dataset.size);
        selectedShipName = e.target.dataset.name;
        document.querySelectorAll(".ship-btn").forEach(b => b.classList.remove("selected"));
        e.target.classList.add("selected");
        SystemUI.playSound('switch4');
    });
});

document.getElementById("rotate-btn").addEventListener("click", (e) => {
    isHorizontal = !isHorizontal;
    e.target.innerText = isHorizontal ? "HORIZONTAL" : "VERTICAL";
    SystemUI.playSound('switch4');
});

function toggleDeleteMode() {
    deleteMode = !deleteMode;
    const btn = document.getElementById("delete-mode-btn");
    btn.innerText = deleteMode ? "DELETE: ON" : "DELETE: OFF";
    btn.classList.toggle("delete-on");
}
document.getElementById("delete-mode-btn").addEventListener("click", toggleDeleteMode);

document.getElementById("clear-board-btn").addEventListener("click", () => {
    if (gameState !== "setup") return;
    playerBoard.fill(0);
    placedShips.clear();
    shipCoords = {};
    shipsPlacedCount = 0;
    document.querySelectorAll(".ship-btn").forEach(b => b.disabled = false);
    rollBtn.disabled = true;
    updateVisuals();
});

function placeOrDelete(index) {
    if (gameState !== "setup") return;
    if (deleteMode) {
        if(playerBoard[index] === 1) {
            let targetShip = null;
            for (let ship in shipCoords) {
                if (shipCoords[ship].includes(index)) {
                    targetShip = ship;
                    break;
                }
            }
            if (targetShip) {
                shipCoords[targetShip].forEach(c => playerBoard[c] = 0);
                delete shipCoords[targetShip];
                placedShips.delete(targetShip);
                shipsPlacedCount--;
                document.querySelector(`.ship-btn[data-name="${targetShip}"]`).disabled = false;
                rollBtn.disabled = true;
                rollBtn.style.opacity = "0.5";
                updateVisuals();
            }
        }
        return;
    }
    if (currentShipSize === 0 || placedShips.has(selectedShipName)) return;

    let coords = [];
    for (let i = 0; i < currentShipSize; i++) {
        let next = isHorizontal ? index + i : index + (i * 10);
        if (next >= 100 || (isHorizontal && Math.floor(next/10) !== Math.floor(index/10))) return;
        if (playerBoard[next] !== 0) return;
        coords.push(next);
    }

    coords.forEach(c => playerBoard[c] = 1);
    shipCoords[selectedShipName] = coords;
    placedShips.add(selectedShipName);
    shipsPlacedCount++;
    document.querySelector(`.ship-btn[data-name="${selectedShipName}"]`).disabled = true;
    currentShipSize = 0;
    if(shipsPlacedCount === 5) rollBtn.disabled = false;
    updateVisuals();
}

// ==========================================
// 3. V2 LOBBY & ONLINE SYNC
// ==========================================
SystemMatch.setup({
    gameId:   "battleship",
    roomPath: "bs_rooms",
    autoShow: false,
    buildSeats: () => [
        { type: "human", name: SystemUI.getPlayerName() },
        { type: "ai",    name: "AI (" + aiDifficulty + ")" }
    ],
    extraRoomFields: () => ({
        player1Board: playerBoard,
        player2Board: Array(100).fill(0),
        player1Ships: shipCoords,
        player2Ships: {},
        turn:   1,
        ready1: false,
        ready2: false
    }),
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1; chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; myId = 2; chatStarted = false;
        seats = SystemMatch.getSeats();
        if (window.db && window.dbUpdate) {
            window.dbUpdate(window.dbRef(window.db, 'bs_rooms/' + roomId), { status: "playing" });
        }
        listenToRoom();
    },
    onLeave: () => { gameMode = "ai"; resetGame(); },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'bs_rooms/' + currentRoomId), { status: "playing" });
        }
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    if (roomListener) roomListener();
    roomListener = window.dbOnValue(window.dbRef(window.db, 'bs_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);
        if(data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true; SystemUI.v2Lobby.hide();
            if(!chatStarted) { chatStarted = true; SystemUI.playSound('win'); SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); }
        }
        turn = data.turn;
        playerBoard = myId === 1 ? data.player1Board : data.player2Board;
        opponentBoard = myId === 1 ? data.player2Board : data.player1Board;
        opponentShipCoords = myId === 1 ? (data.player2Ships || {}) : (data.player1Ships || {});
        if (data.ready1 && data.ready2) {
            gameState = "playing";
            document.getElementById("status-display").innerText = turn === myId ? "YOUR TURN: FIRE!" : "ENEMY IS AIMING...";
        }
        updateVisuals(); checkWin();
        if (isHost && gameState === "playing" && turn === (seats[0].type === 'ai' ? 1 : 2)) setTimeout(aiAttack, 1000);
    });
}

async function handleAttack(index) {
    if (gameState !== "playing" || isMoving) return;
    if (gameMode === "online" && turn !== myId) return;
    if (opponentBoard[index] > 1) return;
    isMoving = true;
    const isHit = opponentBoard[index] === 1;
    const newVal = isHit ? 3 : 2;
    if (gameMode === "online") {
        let path = myId === 1 ? 'player2Board/' : 'player1Board/';
        let updates = {}; updates[path + index] = newVal; updates['turn'] = myId === 1 ? 2 : 1;
        window.dbUpdate(window.dbRef(window.db, 'bs_rooms/' + currentRoomId), updates);
    } else {
        opponentBoard[index] = newVal; playCombatSound(isHit ? 'hit' : 'miss');
        checkWin(); 
        if (gameState === "playing") { turn = 2; updateVisuals(); setTimeout(aiAttack, 800); }
    }
    isMoving = false;
}

// ==========================================
// 4. UPGRADED AI ENGINE (Hunt-and-Target)
// ==========================================
let aiTargetStack = []; 

function aiAttack() {
    if (gameState !== "playing") return;
    let idx;

    if (aiDifficulty === "easy") {
        do { idx = Math.floor(Math.random()*100); } while(playerBoard[idx] > 1);
    } else {
        // Normal & Hard use targeting logic
        if (aiTargetStack.length > 0) {
            idx = aiTargetStack.pop();
        } else {
            // Hunt Mode: Parity/Checkerboard pattern
            let possible = [];
            for (let i = 0; i < 100; i++) {
                if (playerBoard[i] <= 1) {
                    if (aiDifficulty === "hard") {
                        if ((Math.floor(i / 10) + (i % 10)) % 2 === 0) possible.push(i);
                    } else possible.push(i);
                }
            }
            if (possible.length === 0) {
                for (let i = 0; i < 100; i++) if (playerBoard[i] <= 1) possible.push(i);
            }
            idx = possible[Math.floor(Math.random() * possible.length)];
        }
    }

    const isHit = playerBoard[idx] === 1;
    playerBoard[idx] = isHit ? 3 : 2;
    playCombatSound(isHit ? 'hit' : 'miss');

    if (isHit && aiDifficulty !== "easy") {
        // Add adjacent squares to stack
        const adj = [idx - 10, idx + 10, idx - 1, idx + 1];
        adj.forEach(a => {
            if (a >= 0 && a < 100 && playerBoard[a] <= 1) {
                // Ensure horizontal adjacency doesn't wrap rows
                if (Math.abs(idx % 10 - a % 10) <= 1) aiTargetStack.push(a);
            }
        });
    }

    if (gameMode === "online") {
        let path = myId === 1 ? 'player1Board/' : 'player2Board/';
        let updates = {}; updates[path + idx] = playerBoard[idx]; updates['turn'] = myId;
        window.dbUpdate(window.dbRef(window.db, 'bs_rooms/' + currentRoomId), updates);
    } else {
        turn = 1; updateVisuals(); checkWin();
    }
}

// ==========================================
// 5. RENDERING & UI
// ==========================================
document.getElementById("fire-btn").addEventListener("click", () => {
    if (gameMode === "online") {
        let ready = myId === 1 ? 'ready1' : 'ready2';
        let updates = {}; updates[ready] = true; updates[myId === 1 ? 'player1Ships' : 'player2Ships'] = shipCoords;
        window.dbUpdate(window.dbRef(window.db, 'bs_rooms/' + currentRoomId), updates);
        rollBtn.disabled = true;
    } else {
        gameState = "playing";
        
        // AUDIT: Safely track play count via OS 2.0
        if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("battleship");
        
        autoPlaceShips(opponentBoard, false); 
        document.getElementById("status-display").innerText = "BATTLE STATIONS!";
        document.getElementById("ship-selector").classList.add("hidden");
        updateVisuals();
    }
});

function autoPlaceShips(boardArray, isPlayer) {
    boardArray.fill(0);
    let coordsObj = {};
    const sizes = [5, 4, 3, 3, 2];
    const names = ["Carrier", "Battleship", "Destroyer", "Sub", "Patrol"];
    sizes.forEach((size, idx) => {
        let placed = false;
        while (!placed) {
            let horiz = Math.random() > 0.5;
            let start = Math.floor(Math.random() * 100);
            let coords = [];
            for (let i = 0; i < size; i++) {
                let next = horiz ? start + i : start + (i * 10);
                if (next >= 100 || (horiz && Math.floor(next/10) !== Math.floor(start/10))) break;
                if (boardArray[next] !== 0) break;
                coords.push(next);
            }
            if (coords.length === size) {
                coords.forEach(c => boardArray[c] = 1);
                coordsObj[names[idx]] = coords;
                placed = true;
            }
        }
    });
    if(isPlayer) { shipCoords = coordsObj; shipsPlacedCount = 5; placedShips = new Set(names); rollBtn.disabled = false; }
    else { opponentShipCoords = coordsObj; }
    updateVisuals();
}

document.getElementById("auto-place-btn").addEventListener("click", () => {
    if (gameState !== "setup") return;
    SystemUI.playSound('shuffle');
    autoPlaceShips(playerBoard, true);
});

function updateVisuals() {
    const pCells = document.querySelectorAll("#player-board .cell");
    const oCells = document.querySelectorAll("#opponent-board .cell");
    document.querySelectorAll('.ship-image').forEach(el => el.remove());
    playerBoard.forEach((v, i) => {
        pCells[i].className = "cell";
        if (v === 1) pCells[i].classList.add("ship");
        if (v === 2) pCells[i].classList.add("miss");
        if (v === 3) pCells[i].classList.add("hit");
    });
    opponentBoard.forEach((v, i) => {
        oCells[i].className = "cell";
        if (v === 2) oCells[i].classList.add("miss");
        if (v === 3) oCells[i].classList.add("hit");
    });
    const imgMap = { "Carrier": "ShipCarrierHull.png", "Battleship": "ShipBattleshipHull.png", "Destroyer": "ShipDestroyerHull.png", "Sub": "Submarine.png", "Patrol": "ShipPatrolHull.png" };
    placedShips.forEach(shipName => {
        const coords = shipCoords[shipName]; if (!coords) return;
        const isH = coords.length > 1 && coords[1] - coords[0] === 1;
        const sprite = document.createElement('div');
        sprite.className = `ship-image ${isH ? 'horiz' : ''}`;
        sprite.style.setProperty('--ship-size', coords.length);
        sprite.style.backgroundImage = `url('../../system/images/pieces/battleship/${imgMap[shipName]}')`;
        pCells[coords[0]].appendChild(sprite);
    });
    for (let shipName in opponentShipCoords) {
        const coords = opponentShipCoords[shipName]; if (!coords) continue;
        if (coords.every(idx => opponentBoard[idx] === 3)) {
            const isH = coords.length > 1 && coords[1] - coords[0] === 1;
            const sprite = document.createElement('div');
            sprite.className = `ship-image ${isH ? 'horiz' : ''}`;
            sprite.style.setProperty('--ship-size', coords.length);
            sprite.style.backgroundImage = `url('../../system/images/pieces/battleship/${imgMap[shipName]}')`;
            oCells[coords[0]].appendChild(sprite);
        }
    }
    rollBtn.disabled = !(gameState === "setup" && shipsPlacedCount === 5);
    rollBtn.style.opacity = rollBtn.disabled ? "0.5" : "1";
}

function checkWin() {
    const pRem = playerBoard.filter(v => v === 1).length;
    const oRem = opponentBoard.filter(v => v === 1).length;
    const statusText = document.getElementById("status-display");
    if (oRem === 0 && gameState === "playing") {
        SystemUI.playSound('win'); statusText.innerText = "VICTORY! ENEMY FLEET SUNK!";
        
        // AUDIT: Safely track wins via OS 2.0
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("battleship", 0);
        
        gameState = "finished"; updateVisuals();
    } else if (pRem === 0 && gameState === "playing") {
        SystemUI.playSound('lose'); statusText.innerText = "DEFEAT! YOUR FLEET IS GONE!";
        
        // AUDIT: Safely track losses via OS 2.0
        if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("battleship");
        
        gameState = "finished"; updateVisuals();
    }
}

function resetGame() {
    SystemUI.playSound('shuffle'); playerBoard.fill(0); opponentBoard.fill(0);
    gameState = "setup"; shipsPlacedCount = 0; turn = 1; aiTargetStack = [];
    placedShips.clear(); shipCoords = {}; opponentShipCoords = {};
    document.querySelectorAll(".ship-btn").forEach(b => { b.disabled = false; b.classList.remove("selected"); });
    document.getElementById("ship-selector").classList.remove("hidden");
    document.getElementById("status-display").innerText = "PLACE YOUR FLEET";
    initBoards();
}

document.getElementById("restart-btn").addEventListener("click", resetGame);
initBoards();