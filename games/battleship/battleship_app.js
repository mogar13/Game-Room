// ==========================================
// 1. INITIALIZE CASINO OS & MULTIPLAYER STATE
// ==========================================
let gameMode = localStorage.getItem("bs_mode") || "ai";
let myId = 1; 
let currentRoomId = null;
let isMoving = false;
let isHost = false;

SystemUI.init({
    gameName: "BATTLESHIP PRO",
    rules: "1. Select a ship and tap your fleet to place. 2. Auto-place for speed. 3. Hit all enemy ships to win!",
    customToggles: `
        <div class="settings-group" style="text-align:left;">
            <label style="display:block; margin-bottom:5px; color:#bdc3c7;">Game Mode:</label>
            <select id="sys-bs-mode" style="width:100%; padding:10px; border-radius:5px; border:1px solid #34495e; background:#2c3e50; color:white;">
                <option value="ai">🤖 Play vs AI</option>
                <option value="online">🌐 Online Multiplayer</option>
            </select>
        </div>
    `
});

function playBSSound(file) {
    const audio = new Audio(`../../system/audio/${file}.ogg`);
    audio.play().catch(e => console.log("Audio failed:", e));
}

// Handle OS Menu Changes
document.getElementById("sys-bs-mode").value = gameMode;
document.getElementById("sys-bs-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("bs_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        resetGame();
    }
});

// OS RESET INTEGRATION
document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if(confirm("Wipe the board and restart the game?")) {
        resetGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});

// Lobby Escapes
document.getElementById("lobby-close-btn").addEventListener("click", () => {
    document.getElementById("multiplayer-lobby").classList.add("hidden");
});
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    gameMode = "ai";
    document.getElementById("sys-bs-mode").value = "ai";
    document.getElementById("multiplayer-lobby").classList.add("hidden");
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

// Ship Selector logic
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
    shipsPlacedCount = 0;
    document.querySelectorAll(".ship-btn").forEach(b => b.disabled = false);
    rollBtn.disabled = true;
    updateVisuals();
});

function placeOrDelete(index) {
    if (gameState !== "setup") return;
    if (deleteMode) {
        if(playerBoard[index] === 1) {
            playerBoard[index] = 0; 
            updateVisuals();
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
    placedShips.add(selectedShipName);
    shipsPlacedCount++;
    document.querySelector(`.ship-btn[data-name="${selectedShipName}"]`).disabled = true;
    currentShipSize = 0;
    if(shipsPlacedCount === 5) rollBtn.disabled = false;
    updateVisuals();
}

// ==========================================
// 3. COMBAT & FIREBASE (Restored TTT Logic)
// ==========================================
const lobbyUI = document.getElementById("multiplayer-lobby");

document.getElementById("btn-create-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    currentRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    isHost = true; myId = 1;
    window.dbSet(window.dbRef(window.db, 'bs_rooms/' + currentRoomId), {
        player1Board: playerBoard,
        player2Board: Array(100).fill(0),
        turn: 1, status: "waiting", ready1: false, ready2: false
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = document.getElementById("join-room-input").value.toUpperCase();
    window.dbGet(window.dbChild(window.dbRef(window.db), `bs_rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists()) {
            currentRoomId = code; isHost = false; myId = 2;
            lobbyUI.classList.add("hidden");
            listenToRoom();
        }
    });
});

function listenToRoom() {
    window.dbOnValue(window.dbRef(window.db, 'bs_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        turn = data.turn;
        playerBoard = myId === 1 ? data.player1Board : data.player2Board;
        opponentBoard = myId === 1 ? data.player2Board : data.player1Board;
        if (data.ready1 && data.ready2) {
            gameState = "playing";
            document.getElementById("status-display").innerText = turn === myId ? "YOUR TURN: FIRE!" : "ENEMY IS AIMING...";
        }
        updateVisuals();
        checkWin();
    });
}

async function handleAttack(index) {
    if (gameState !== "playing" || isMoving) return;
    if (gameMode === "online" && turn !== myId) return;
    if (opponentBoard[index] > 1) return;

    isMoving = true;
    playBSSound('dice-shake-1'); 

    const isHit = opponentBoard[index] === 1;
    const newVal = isHit ? 3 : 2;

    if (gameMode === "online") {
        let path = myId === 1 ? 'player2Board/' : 'player1Board/';
        let updates = {}; updates[path + index] = newVal; updates['turn'] = myId === 1 ? 2 : 1;
        window.dbUpdate(window.dbRef(window.db, 'bs_rooms/' + currentRoomId), updates);
    } else {
        opponentBoard[index] = newVal;
        if (isHit) SystemUI.playSound('win'); else playBSSound('dice-throw-1');
        
        // THE FIX: Check for the win BEFORE the AI is allowed to shoot
        checkWin(); 
        
        if (gameState === "playing") {
            turn = 2; 
            updateVisuals();
            setTimeout(aiAttack, 800);
        }
    }
    isMoving = false;
}

function aiAttack() {
    let idx; do { idx = Math.floor(Math.random()*100); } while(playerBoard[idx] > 1);
    playerBoard[idx] = playerBoard[idx] === 1 ? 3 : 2;
    turn = 1; updateVisuals();
}

document.getElementById("fire-btn").addEventListener("click", () => {
    if (gameMode === "online") {
        let ready = myId === 1 ? 'ready1' : 'ready2';
        let board = myId === 1 ? 'player1Board' : 'player2Board';
        let updates = {}; updates[ready] = true; updates[board] = playerBoard;
        window.dbUpdate(window.dbRef(window.db, 'bs_rooms/' + currentRoomId), updates);
        rollBtn.disabled = true;
    } else {
        gameState = "playing";
        autoPlaceShips(opponentBoard, false); // ONLY places AI ships
        document.getElementById("status-display").innerText = "BATTLE STATIONS!";
        document.getElementById("ship-selector").classList.add("hidden");
        updateVisuals();
    }
});

function autoPlaceShips(boardArray, isPlayer) {
    boardArray.fill(0);
    const sizes = [5, 4, 3, 3, 2];
    sizes.forEach(size => {
        let placed = false;
        while (!placed) {
            let horizontal = Math.random() > 0.5;
            let start = Math.floor(Math.random() * 100);
            let coords = [];
            for (let i = 0; i < size; i++) {
                let next = horizontal ? start + i : start + (i * 10);
                if (next >= 100 || (horizontal && Math.floor(next/10) !== Math.floor(start/10))) break;
                if (boardArray[next] !== 0) break;
                coords.push(next);
            }
            if (coords.length === size) {
                coords.forEach(c => boardArray[c] = 1);
                placed = true;
            }
        }
    });
    if(isPlayer) {
        shipsPlacedCount = 5;
        placedShips = new Set(["Carrier", "Battleship", "Destroyer", "Sub", "Patrol"]);
        document.querySelectorAll(".ship-btn").forEach(b => b.disabled = true);
        rollBtn.disabled = false;
    }
    updateVisuals();
}

document.getElementById("auto-place-btn").addEventListener("click", () => {
    if (gameState !== "setup") return;
    autoPlaceShips(playerBoard, true);
});

function updateVisuals() {
    const pCells = document.querySelectorAll("#player-board .cell");
    const oCells = document.querySelectorAll("#opponent-board .cell");
    
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
    
    // THE FIX: The "Ready to Fight" button should only be active during setup when 5 ships are placed.
    if (gameState === "setup" && shipsPlacedCount === 5) {
        rollBtn.style.opacity = "1";
        rollBtn.disabled = false;
    } else {
        rollBtn.style.opacity = "0.5";
        rollBtn.disabled = true;
    }
}

function checkWin() {
    const pRemaining = playerBoard.filter(v => v === 1).length;
    const oRemaining = opponentBoard.filter(v => v === 1).length;
    const statusText = document.getElementById("status-display"); // Replaces the lame alert

    if (oRemaining === 0 && gameState === "playing") {
        SystemUI.playSound('win'); 
        statusText.innerText = "VICTORY! ENEMY FLEET SUNK!";
        gameState = "finished";
        updateVisuals();
    } else if (pRemaining === 0 && gameState === "playing") {
        SystemUI.playSound('lose'); 
        statusText.innerText = "DEFEAT! YOUR FLEET IS GONE!";
        gameState = "finished";
        updateVisuals();
    }
}

function resetGame() {
    SystemUI.playSound('shuffle');
    playerBoard.fill(0); opponentBoard.fill(0);
    gameState = "setup"; shipsPlacedCount = 0; turn = 1;
    placedShips.clear();
    document.querySelectorAll(".ship-btn").forEach(b => b.disabled = false);
    document.querySelectorAll(".ship-btn").forEach(b => b.classList.remove("selected"));
    document.getElementById("ship-selector").classList.remove("hidden");
    document.getElementById("status-display").innerText = "PLACE YOUR FLEET";
    initBoards();
}

document.getElementById("restart-btn").addEventListener("click", resetGame);

initBoards();