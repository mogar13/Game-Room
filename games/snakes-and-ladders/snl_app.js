// ==========================================
// 1. INITIALIZE CASINO OS & MULTIPLAYER STATE
// ==========================================
let gameMode = localStorage.getItem("snl_mode") || "ai"; 
let myId = 1; 
let currentRoomId = null; 
let isHost = false;
let chatStarted = false; // NEW: Tracks if we've loaded the chat yet

SystemUI.init({
    gameName: "SNAKES & LADDERS PRO",
    rules: `
        <ul style="text-align: left; line-height: 1.6; font-size: 0.9rem; color: #ddd;">
            <li>Roll the dice and race to 100!</li>
            <li><strong>Ladders:</strong> Land on the bottom to climb up.</li>
            <li><strong>Snakes:</strong> Land on the head and slide down.</li>
            <li>Land exactly on 100 to win the game.</li>
        </ul>
    `,
    hudDropdowns: [
        {
            id: "sys-snl-mode",
            options: [
                { value: "ai", label: "🤖 vs AI" },
                { value: "local", label: "👥 Hotseat" },
                { value: "online", label: "🌐 Online" }
            ]
        }
    ]
});

// Handle OS Menu Changes
document.getElementById("sys-snl-mode").value = gameMode;
document.getElementById("sys-snl-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("snl_mode", gameMode);
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
document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if(confirm("Reset the game?")) {
        resetGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});

function playDiceSound(file) {
    const audio = new Audio(`../../system/audio/${file}.ogg`);
    audio.play().catch(e => console.log("Audio failed:", e));
}

// ==========================================
// 2. FIREBASE MULTIPLAYER LOBBY LOGIC
// ==========================================
const btnCreateRoom = document.getElementById("btn-create-room");
const btnJoinRoom = document.getElementById("btn-join-room");
const joinInput = document.getElementById("join-room-input");
const errorMsg = document.getElementById("lobby-error-msg");
const lobbyUI = document.getElementById("multiplayer-lobby");

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for(let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// HOST creates a room
btnCreateRoom.addEventListener("click", () => {
    SystemUI.playSound('click');
    currentRoomId = generateRoomCode();
    isHost = true;
    myId = 1;
    chatStarted = false;

    window.dbSet(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), {
        pos1: 1,
        pos2: 1,
        turn: 1,
        players: 1,
        status: "waiting"
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        btnCreateRoom.disabled = true;
        listenToRoom();
    });
});

// GUEST joins a room
btnJoinRoom.addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = joinInput.value.toUpperCase();
    if(code.length !== 4) { errorMsg.innerText = "Code must be 4 characters."; return; }

    window.dbGet(window.dbChild(window.dbRef(window.db), `snl_rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.players === 1) {
                currentRoomId = code;
                isHost = false;
                myId = 2;
                chatStarted = false;

                window.dbUpdate(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), {
                    players: 2,
                    status: "playing"
                });

                lobbyUI.classList.add("hidden");
                listenToRoom();
            } else {
                errorMsg.innerText = "Room is full!";
            }
        } else {
            errorMsg.innerText = "Room not found. Check the code.";
        }
    });
});

// The Magic Listener: Triggers instantly when Firebase data changes
function listenToRoom() {
    window.dbOnValue(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // If guest joined, hide lobby for the host and trigger chat
        if (data.status === "playing" && !chatStarted) {
            chatStarted = true;
            if (lobbyUI) lobbyUI.classList.add("hidden");
            SystemUI.playSound('win');
            SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
        }

        // Sync positions and turn from Firebase
        playerPositions[0] = data.pos1 || 1;
        playerPositions[1] = data.pos2 || 1;
        currentPlayer = data.turn || 1;

        renderPlayers();
        updateTurnUI();

        // Check win after syncing
        if (playerPositions[0] === 100) {
            showWinner(myId === 1 ? "YOU WIN!" : "OPPONENT WINS!");
        } else if (playerPositions[1] === 100) {
            showWinner(myId === 2 ? "YOU WIN!" : "OPPONENT WINS!");
        }

        // Re-enable roll button if it's our turn
        rollBtn.disabled = (currentPlayer !== myId || isMoving);
    });
}

// ==========================================
// 3. BOARD & GAME LOGIC
// ==========================================
const board = document.getElementById("board");
const turnIndicator = document.getElementById("turn-indicator");
const rollBtn = document.getElementById("roll-btn");
const dieImg = document.getElementById("die-img");

// Dice face image filenames
const diceFaces = [
    "dieWhite_border1.png",
    "dieWhite_border2.png",
    "dieWhite_border3.png",
    "dieWhite_border4.png",
    "dieWhite_border5.png",
    "dieWhite_border6.png"
];

let playerPositions = [1, 1]; // P1 at index 0, P2 at index 1
let currentPlayer = 1; 
let isMoving = false;

const snakes = {
    16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78
};

const ladders = {
    1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100
};

function createBoard() {
    board.innerHTML = "";
    // ZIG-ZAG: Row 9 (top) down to Row 0 (bottom)
    // Row 0 (bottom): even → left-to-right → cells 1–10  (cell 1 = bottom-left)
    // Row 1:          odd  → right-to-left → cells 20–11
    // Row 2:          even → left-to-right → cells 21–30
    // ...etc
    for (let row = 9; row >= 0; row--) {
        if (row % 2 === 0) { // Even rows: left to right → cell 1 ends up at bottom-left
            for (let col = 1; col <= 10; col++) {
                addCell(row * 10 + col);
            }
        } else { // Odd rows: right to left
            for (let col = 10; col >= 1; col--) {
                addCell(row * 10 + col);
            }
        }
    }
    drawSnakesAndLadders();
    renderPlayers();
}

function addCell(num) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.id = `cell-${num}`;
    cell.innerText = num;
    board.appendChild(cell);
}

// ==========================================
// SNAKES & LADDERS CANVAS DRAWING
// ==========================================
function getCellCenter(cellNum) {
    const cell = document.getElementById(`cell-${cellNum}`);
    const boardEl = document.getElementById("board");
    if (!cell || !boardEl) return null;
    const boardRect = boardEl.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    return {
        x: cellRect.left - boardRect.left + cellRect.width / 2,
        y: cellRect.top  - boardRect.top  + cellRect.height / 2
    };
}

function drawSnakesAndLadders() {
    // Remove old canvas if it exists
    const old = document.getElementById("snl-canvas");
    if (old) old.remove();

    const boardEl = document.getElementById("board");
    const boardContainer = document.getElementById("board-container");
    const canvas = document.createElement("canvas");
    canvas.id = "snl-canvas";
    canvas.width = boardEl.offsetWidth;
    canvas.height = boardEl.offsetHeight;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "5";
    boardContainer.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // Draw Ladders (green)
    ctx.strokeStyle = "#2ecc71";
    ctx.shadowColor = "#2ecc71";
    ctx.shadowBlur = 6;
    for (const [from, to] of Object.entries(ladders)) {
        const start = getCellCenter(parseInt(from));
        const end   = getCellCenter(parseInt(to));
        if (!start || !end) continue;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        // Arrow head at top
        drawArrow(ctx, start, end);
    }

    // Draw Snakes (red)
    ctx.strokeStyle = "#e74c3c";
    ctx.shadowColor = "#e74c3c";
    ctx.shadowBlur = 6;
    for (const [from, to] of Object.entries(snakes)) {
        const start = getCellCenter(parseInt(from));
        const end   = getCellCenter(parseInt(to));
        if (!start || !end) continue;
        // Wavy snake line using quadratic curves
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2;
        const dx = end.y - start.y;
        const dy = start.x - end.x;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const wave = 18;
        ctx.quadraticCurveTo(mx + (dx/len)*wave, my + (dy/len)*wave, end.x, end.y);
        ctx.stroke();
        drawArrow(ctx, start, end);
    }
}

function drawArrow(ctx, from, to) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const size = 8;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(angle - Math.PI/6), to.y - size * Math.sin(angle - Math.PI/6));
    ctx.lineTo(to.x - size * Math.cos(angle + Math.PI/6), to.y - size * Math.sin(angle + Math.PI/6));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
}

// Redraw on resize so lines stay accurate
window.addEventListener("resize", () => {
    drawSnakesAndLadders();
});

// PNG piece paths
const piecePaths = [
    "../../system/images/pieces/red/pieceRed_border03.png",   // Player 1 - red
    "../../system/images/pieces/blue/pieceBlue_border04.png"  // Player 2 - blue
];

// Token positions in a 2x2 grid within each cell
const tokenOffsets = [
    { left: "5%",  bottom: "5%"  },  // P1: bottom-left
    { left: "50%", bottom: "5%"  },  // P2: bottom-right
    { left: "5%",  bottom: "50%" },  // P3: top-left
    { left: "50%", bottom: "50%" },  // P4: top-right
];

function renderPlayers() {
    document.querySelectorAll(".player-token").forEach(p => p.remove());

    playerPositions.forEach((pos, index) => {
        const cell = document.getElementById(`cell-${pos}`);
        if (cell) {
            const token = document.createElement("img");
            token.className = "player-token";
            token.src = piecePaths[index];
            token.alt = `Player ${index + 1}`;
            const offset = tokenOffsets[index];
            token.style.left = offset.left;
            token.style.bottom = offset.bottom;
            cell.appendChild(token);
        }
    });
}

// Turn text matches player token colors
function updateTurnUI() {
    if (currentPlayer === 1) {
        turnIndicator.innerText = "Player 1's Turn";
        turnIndicator.style.color = "#e74c3c"; // Red
    } else {
        turnIndicator.innerText = gameMode === "ai" ? "AI is Thinking..." : "Player 2's Turn";
        turnIndicator.style.color = "#3498db"; // Blue
    }
}

// ==========================================
// 4. DICE & MOVEMENT
// ==========================================
async function rollDice() {
    if (isMoving) return;
    if (gameMode === "online" && currentPlayer !== myId) return;

    isMoving = true;
    rollBtn.disabled = true;
    dieImg.classList.add("rolling");

    playDiceSound('dice-shake-1');

    let roll = 1;
    for (let i = 0; i < 10; i++) {
        roll = Math.floor(Math.random() * 6) + 1;
        dieImg.src = `../../system/images/dice/${diceFaces[roll - 1]}`;
        await new Promise(r => setTimeout(r, 100));
    }

    dieImg.classList.remove("rolling");
    playDiceSound('dice-throw-1');

    if (gameMode === "online") {
        const newPos = calculateNewPos(playerPositions[currentPlayer - 1], roll);
        window.dbUpdate(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), {
            lastRoll: roll,
            turn: currentPlayer === 1 ? 2 : 1,
            [`pos${currentPlayer}`]: newPos
        });
        isMoving = false;
    } else {
        await movePlayer(currentPlayer - 1, roll);

        if (checkWin()) {
            isMoving = false;
            return;
        }

        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updateTurnUI();
        isMoving = false;

        if (gameMode === "ai" && currentPlayer === 2) {
            rollBtn.disabled = true;
            setTimeout(rollDice, 1000);
        } else {
            rollBtn.disabled = false;
        }
    }
}

function calculateNewPos(current, roll) {
    let next = current + roll;
    if (next > 100) next = current; 
    if (snakes[next]) next = snakes[next];
    else if (ladders[next]) next = ladders[next];
    return next;
}

async function movePlayer(playerIdx, steps) {
    let targetPos = playerPositions[playerIdx] + steps;

    if (targetPos > 100) return; // Can't go past 100

    for (let i = 1; i <= steps; i++) {
        playerPositions[playerIdx]++;
        renderPlayers();
        SystemUI.playSound('click');
        await new Promise(r => setTimeout(r, 200));
    }

    let finalPos = playerPositions[playerIdx];
    if (snakes[finalPos]) {
        playerPositions[playerIdx] = snakes[finalPos];
        SystemUI.playSound('lose');
        renderPlayers();
        await new Promise(r => setTimeout(r, 300));
    } else if (ladders[finalPos]) {
        playerPositions[playerIdx] = ladders[finalPos];
        SystemUI.playSound('win');
        renderPlayers();
        await new Promise(r => setTimeout(r, 300));
    }
}

function checkWin() {
    if (playerPositions[0] === 100) {
        showWinner("PLAYER 1 WINS!");
        return true;
    } else if (playerPositions[1] === 100) {
        showWinner(gameMode === "ai" ? "AI WINS!" : "PLAYER 2 WINS!");
        return true;
    }
    return false;
}

function showWinner(message) {
    turnIndicator.innerText = message;
    turnIndicator.style.color = "#f1c40f";
    rollBtn.disabled = true;
    setTimeout(resetGame, 3000);
}

function resetGame() {
    playerPositions = [1, 1];
    currentPlayer = 1;
    isMoving = false;
    createBoard();
    updateTurnUI();
    rollBtn.disabled = false;
}

rollBtn.addEventListener("click", rollDice);
createBoard();
updateTurnUI();

// Handle OS Lobby Escapes
document.getElementById("lobby-close-btn").addEventListener("click", () => {
    SystemUI.playSound('click');
    document.getElementById("multiplayer-lobby").classList.add("hidden");
});

document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    SystemUI.playSound('click');
    gameMode = "ai";
    document.getElementById("sys-snl-mode").value = "ai";
    localStorage.setItem("snl_mode", "ai");
    document.getElementById("multiplayer-lobby").classList.add("hidden");
    SystemUI.stopChat();
    chatStarted = false;
    resetGame();
});