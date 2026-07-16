// ==========================================
// 1. INITIALIZE CASINO OS & MULTIPLAYER STATE
// ==========================================
let gameMode = "ai"; // FIX: ALWAYS default to vs AI on launch
localStorage.setItem("snl_mode", "ai"); // Clear any cached online state

let myId = 1;
let currentRoomId = null;
let isHost = true; // Default to host so local roll buttons work
let chatStarted = false;
let roomListener = null;      // onValue unsubscribe fn — detach on exit
let onlineWinHandled = false; // guards stats/announce firing once per finished game
let lastSeenRoll = 0;         // last die value received over the wire

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

// Handle OS Menu Changes (Wait for SystemUI to inject dropdowns)
setTimeout(() => {
    const modeDropdown = document.getElementById("sys-snl-mode");
    if (modeDropdown) {
        modeDropdown.value = gameMode;
        modeDropdown.addEventListener("change", (e) => {
            gameMode = e.target.value;
            localStorage.setItem("snl_mode", gameMode);
            document.getElementById("sys-modal").classList.add("sys-hidden");
            
            if (gameMode === "online") {
                document.getElementById("multiplayer-lobby").classList.remove("hidden");
            } else {
                document.getElementById("multiplayer-lobby").classList.add("hidden");
                cleanupOnlineRoom();
                SystemUI.stopChat();
                chatStarted = false;

                // Reset host privileges so local buttons work
                myId = 1;
                isHost = true;
                resetGame();
            }
        });
    }
}, 10);

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

function listenToRoom() {
    if (roomListener) roomListener();
    roomListener = window.dbOnValue(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            // Room node removed — the host quit. Don't freeze the joiner.
            if (gameMode === "online" && currentRoomId && !isHost) {
                exitOnlineToLocal("HOST LEFT THE GAME");
            }
            return;
        }

        if (data.status === "abandoned") {
            // Joiner closed their tab mid-game
            if (gameMode === "online" && currentRoomId && isHost) {
                exitOnlineToLocal("OPPONENT LEFT THE GAME");
            }
            return;
        }

        if (data.status === "playing" && !chatStarted) {
            chatStarted = true;
            if (lobbyUI) lobbyUI.classList.add("hidden");
            SystemUI.playSound('win');
            SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
        }

        playerPositions[0] = data.pos1 || 1;
        playerPositions[1] = data.pos2 || 1;
        currentPlayer = data.turn || 1;

        // Show the opponent's die roll as it arrives
        if (data.lastRoll && data.lastRoll !== lastSeenRoll) {
            lastSeenRoll = data.lastRoll;
            dieImg.src = `../../system/images/dice/${diceFaces[data.lastRoll - 1]}`;
        } else if (!data.lastRoll) {
            lastSeenRoll = 0;
        }

        renderPlayers();

        if (data.status === "finished") {
            handleOnlineWin(data);
            return;
        }
        onlineWinHandled = false;

        updateTurnUI();
        rollBtn.disabled = (currentPlayer !== myId || isMoving);
    });
}

// Announce + record the finished game exactly once, then the HOST pushes a
// fresh board so both clients get a clean rematch instead of re-firing the
// win off the stale pos=100 room state.
function handleOnlineWin(data) {
    rollBtn.disabled = true;
    if (onlineWinHandled) return;
    onlineWinHandled = true;

    const iWon = data.winner === myId;
    turnIndicator.innerText = iWon ? "YOU WIN!" : "OPPONENT WINS!";
    turnIndicator.style.color = "#f1c40f";
    SystemUI.playSound(iWon ? 'win' : 'lose');

    if (typeof SystemStats !== 'undefined') {
        if (iWon) SystemStats.recordWin("snl", 0);
        else SystemStats.recordLoss("snl");
    }

    if (isHost) {
        setTimeout(() => {
            if (gameMode === "online" && currentRoomId) {
                window.dbUpdate(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), {
                    pos1: 1, pos2: 1, turn: 1, status: "playing",
                    winner: null, lastRoll: null
                });
            }
        }, 3000);
    }
}

// Detach the listener and (host only) delete the room node.
function cleanupOnlineRoom() {
    if (roomListener) { roomListener(); roomListener = null; }
    if (isHost && currentRoomId && window.db && window.dbSet) {
        try { window.dbSet(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), null); } catch (e) {}
    }
    currentRoomId = null;
    onlineWinHandled = false;
    lastSeenRoll = 0;
    document.getElementById("room-code-display").classList.add("hidden");
    btnCreateRoom.disabled = false;
}

// The opponent vanished — clean up and drop back to vs-AI mode with a notice.
function exitOnlineToLocal(message) {
    cleanupOnlineRoom();
    SystemUI.stopChat();
    chatStarted = false;
    gameMode = "ai";
    const modeEl = document.getElementById("sys-snl-mode");
    if (modeEl) modeEl.value = "ai";
    localStorage.setItem("snl_mode", "ai");
    lobbyUI.classList.add("hidden");
    myId = 1;
    isHost = true;
    resetGame();
    turnIndicator.innerText = message;
    turnIndicator.style.color = "#e67e22";
    setTimeout(() => { if (gameMode !== "online") updateTurnUI(); }, 2500);
}

// Host closing the tab removes the room; joiner closing mid-game flags it
// abandoned so the host's listener can react instead of waiting forever.
window.addEventListener("beforeunload", () => {
    if (!currentRoomId || !window.db) return;
    try {
        if (isHost) {
            window.dbSet(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), null);
        } else if (chatStarted) {
            window.dbUpdate(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), { status: "abandoned" });
        }
    } catch (e) {}
});

// ==========================================
// 3. BOARD & GAME LOGIC
// ==========================================
const board = document.getElementById("board");
const turnIndicator = document.getElementById("turn-indicator");
const rollBtn = document.getElementById("roll-btn");
const dieImg = document.getElementById("die-img");

const diceFaces = [
    "dieWhite_border1.png",
    "dieWhite_border2.png",
    "dieWhite_border3.png",
    "dieWhite_border4.png",
    "dieWhite_border5.png",
    "dieWhite_border6.png"
];

let playerPositions = [1, 1]; 
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
    for (let row = 9; row >= 0; row--) {
        if (row % 2 === 0) { 
            for (let col = 1; col <= 10; col++) {
                addCell(row * 10 + col);
            }
        } else { 
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
        drawArrow(ctx, start, end);
    }

    ctx.strokeStyle = "#e74c3c";
    ctx.shadowColor = "#e74c3c";
    ctx.shadowBlur = 6;
    for (const [from, to] of Object.entries(snakes)) {
        const start = getCellCenter(parseInt(from));
        const end   = getCellCenter(parseInt(to));
        if (!start || !end) continue;
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

window.addEventListener("resize", () => {
    drawSnakesAndLadders();
});

const piecePaths = [
    "../../system/images/pieces/red/pieceRed_border03.png",   
    "../../system/images/pieces/blue/pieceBlue_border04.png"  
];

const tokenOffsets = [
    { left: "5%",  bottom: "5%"  },  
    { left: "50%", bottom: "5%"  }   
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

function updateTurnUI() {
    if (currentPlayer === 1) {
        turnIndicator.innerText = "Player 1's Turn";
        turnIndicator.style.color = "#e74c3c"; 
    } else {
        turnIndicator.innerText = gameMode === "ai" ? "AI is Thinking..." : "Player 2's Turn";
        turnIndicator.style.color = "#3498db"; 
    }
}

// ==========================================
// 4. DICE & MOVEMENT
// ==========================================
async function rollDice() {
    if (isMoving) return;
    if (gameMode === "online" && currentPlayer !== myId) return;

    // AUDIT: Tracking game start
    if (typeof SystemStats !== 'undefined' && playerPositions[0] === 1 && playerPositions[1] === 1) {
        SystemStats.recordGameStart("snl");
    }

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
        lastSeenRoll = roll; // we already animated our own roll locally
        const update = {
            lastRoll: roll,
            turn: currentPlayer === 1 ? 2 : 1,
            [`pos${currentPlayer}`]: newPos
        };
        // The winner's client marks the game finished — clients announce off
        // the status flag, never off raw positions.
        if (newPos === 100) {
            update.status = "finished";
            update.winner = myId;
        }
        window.dbUpdate(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), update);
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

    if (targetPos > 100) return; 

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

    // AUDIT: Tracking final result
    if (typeof SystemStats !== 'undefined' && gameMode !== "local") {
        if ((gameMode === "ai" && playerPositions[0] === 100) || (gameMode === "online" && playerPositions[myId-1] === 100)) {
            SystemStats.recordWin("snl", 0);
        } else {
            SystemStats.recordLoss("snl");
        }
    }

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
    cleanupOnlineRoom();
    SystemUI.stopChat();
    chatStarted = false;

    myId = 1;
    isHost = true;
    resetGame();
});