// ==========================================
// 1. INITIALIZE CASINO OS & MULTIPLAYER STATE
// ==========================================
let gameMode = localStorage.getItem("snl_mode") || "ai"; 
let myId = 1; 
let currentRoomId = null; 
let isHost = false;

SystemUI.init({
    gameName: "SNAKES & LADDERS",
    rules: "Roll the dice to move. Green = Ladder, Red = Snake. Land on 100 to win!",
    customToggles: `
        <div class="settings-group" style="text-align:left;">
            <label style="display:block; margin-bottom:5px; color:#bdc3c7;">Game Mode:</label>
            <select id="sys-snl-mode" style="width:100%; padding:10px; border-radius:5px; border:1px solid #34495e; background:#2c3e50; color:white;">
                <option value="ai">🤖 Play vs AI</option>
                <option value="local">👥 Local Multiplayer</option>
                <option value="online">🌐 Online Multiplayer</option>
            </select>
        </div>
    `
});

// DIRECT AUDIO FUNCTION - No more hallucinating hub keys
function playSNLSound(file) {
    const audio = new Audio(`../../system/audio/${file}.ogg`);
    audio.play().catch(e => console.log("Audio failed:", e));
}

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
        currentRoomId = null;
        resetToLocalAI();
    }
});

// CLOSE LOBBY FIX: Allows user to go back to game
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    gameMode = "ai";
    localStorage.setItem("snl_mode", "ai");
    document.getElementById("sys-snl-mode").value = "ai";
    document.getElementById("multiplayer-lobby").classList.add("hidden");
    resetToLocalAI();
});

document.getElementById("lobby-close-btn").addEventListener("click", () => {
    document.getElementById("multiplayer-lobby").classList.add("hidden");
});

if (gameMode === "online") {
    document.getElementById("multiplayer-lobby").classList.remove("hidden");
}

// ==========================================
// 2. FIREBASE MULTIPLAYER LOGIC
// ==========================================
const btnCreateRoom = document.getElementById("btn-create-room");
const btnJoinRoom = document.getElementById("btn-join-room");
const joinInput = document.getElementById("join-room-input");
const errorMsg = document.getElementById("lobby-error-msg");
const lobbyUI = document.getElementById("multiplayer-lobby");

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for(let i=0; i<4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

btnCreateRoom.addEventListener("click", () => {
    SystemUI.playSound('click');
    currentRoomId = generateRoomCode();
    isHost = true;
    myId = 1;
    
    window.dbSet(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), {
        players: { 1: { pos: 1, type: "human" } },
        turn: 1,
        status: "waiting",
        playerCount: 1
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        listenToRoom();
    });
});

btnJoinRoom.addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = joinInput.value.toUpperCase();
    if(code.length !== 4) { errorMsg.innerText = "Code must be 4 characters."; return; }

    window.dbGet(window.dbChild(window.dbRef(window.db), `snl_rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.playerCount < 4) {
                currentRoomId = code;
                isHost = false;
                const count = data.playerCount + 1;
                myId = count;
                
                let updates = {};
                updates[`players/${count}`] = { pos: 1, type: "human" };
                updates['playerCount'] = count;
                updates['status'] = "playing";
                
                window.dbUpdate(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), updates);
                lobbyUI.classList.add("hidden");
                listenToRoom();
            } else {
                errorMsg.innerText = "Room is full!";
            }
        } else {
            errorMsg.innerText = "Room not found.";
        }
    });
});

function listenToRoom() {
    window.dbOnValue(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) return;
        
        if(data.status === "playing" && !lobbyUI.classList.contains("hidden")) {
            lobbyUI.classList.add("hidden");
            SystemUI.playSound('win');
        }
        
        players = data.players;
        turn = data.turn;
        updateVisuals();
    });
}

// ==========================================
// 3. SOUNDS & DICE
// ==========================================
const ladders = { 4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91 };
const snakes = { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78 };
const pawnClasses = ["p-red", "p-yellow", "p-blue", "p-green"];

let players = { 1: { pos: 1, type: "human" }, 2: { pos: 1, type: "ai" } };
let turn = 1;
let isMoving = false;
const rollBtn = document.getElementById("roll-btn"); // Added reference

async function handleRoll() {
    if (isMoving) return;
    if (gameMode === "online" && turn !== myId) return;

    // LOCK BUTTON DURING ROLL
    rollBtn.disabled = true;
    rollBtn.style.opacity = "0.5";

    // AUDIO: Dice Shake 1
    playSNLSound('dice-shake-1');
    const dieImg = document.getElementById("die-img");
    dieImg.classList.add("rolling");
    
    let roll = 1;
    for(let i=0; i<12; i++) {
        roll = Math.floor(Math.random()*6)+1;
        dieImg.src = `../../system/images/dice/dieWhite_border${roll}.png`; 
        await new Promise(r => setTimeout(r, 70));
    }
    
    dieImg.classList.remove("rolling");
    
    // AUDIO: Dice Throw 1
    playSNLSound('dice-throw-1');
    
    await movePlayer(turn, roll);
}

async function movePlayer(id, steps) {
    isMoving = true;
    for(let i=0; i<steps; i++) {
        if(players[id].pos >= 100) break;
        players[id].pos++;
        
        SystemUI.playSound('switch4'); 
        updateVisuals();
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    if(ladders[players[id].pos]) {
        await new Promise(r => setTimeout(r, 300));
        players[id].pos = ladders[players[id].pos];
        SystemUI.playSound('win'); 
    } else if(snakes[players[id].pos]) {
        await new Promise(r => setTimeout(r, 300));
        players[id].pos = snakes[players[id].pos];
        SystemUI.playSound('lose'); 
    }
    
    updateVisuals();
    
    if (gameMode === "online") {
        const nextTurn = (turn % Object.keys(players).length) + 1;
        window.dbUpdate(window.dbRef(window.db, 'snl_rooms/' + currentRoomId), {
            players: players,
            turn: nextTurn
        });
    } else {
        if(players[id].pos >= 100) { SystemUI.playSound('win'); alert(`Player ${id} Wins!`); isMoving = false; return; }
        turn = (turn % Object.keys(players).length) + 1;
        isMoving = false;
        updateVisuals(); // Re-check button lock after turn change
        if(gameMode === "ai" && players[turn].type === "ai") setTimeout(handleRoll, 1000);
    }
    isMoving = false;
}

// ==========================================
// 4. BOARD & NEON CANVAS
// ==========================================
function updateVisuals() {
    Object.keys(players).forEach(id => {
        let pDiv = document.getElementById(`pawn-${id}`);
        if(!pDiv) {
            pDiv = document.createElement("div");
            pDiv.id = `pawn-${id}`;
            pDiv.className = `pawn ${pawnClasses[id-1]}`;
            document.body.appendChild(pDiv);
        }
        const cell = document.getElementById(`cell-${players[id].pos}`);
        const rect = cell.getBoundingClientRect();
        const offsets = [[4,4], [28,4], [4,28], [28,28]];
        const [ox, oy] = offsets[id-1];
        pDiv.style.left = `${rect.left + ox}px`;
        pDiv.style.top = `${rect.top + oy}px`;
    });
    document.getElementById("status-display").innerText = `PLAYER ${turn}'S TURN`;

    // TURN LOCK: Lock button if not human turn
    const isMyTurn = (gameMode === "online") ? (turn === myId) : (players[turn].type === "human");
    if (isMyTurn && !isMoving) {
        rollBtn.disabled = false;
        rollBtn.style.opacity = "1";
    } else {
        rollBtn.disabled = true;
        rollBtn.style.opacity = "0.5";
    }
}

function init() {
    const board = document.getElementById("board");
    board.innerHTML = `<canvas id="snl-canvas" style="position:absolute; top:0; left:0; pointer-events:none; z-index:5;"></canvas>`;
    for (let r = 9; r >= 0; r--) {
        for (let c = 0; c < 10; c++) {
            let num = (r % 2 !== 0) ? (r * 10) + (9 - c) + 1 : (r * 10) + c + 1;
            let cell = document.createElement("div");
            cell.className = "cell"; cell.id = `cell-${num}`; cell.innerText = num;
            board.appendChild(cell);
        }
    }
    updateVisuals();
    setTimeout(drawNeonLines, 500); 
}

function drawNeonLines() {
    const canvas = document.getElementById("snl-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const bRect = document.getElementById("board").getBoundingClientRect();
    canvas.width = bRect.width; canvas.height = bRect.height;
    ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.strokeStyle = "#2ecc71"; ctx.shadowBlur = 15; ctx.shadowColor = "#2ecc71";
    for(let s in ladders) drawLine(ctx, s, ladders[s], bRect);
    ctx.strokeStyle = "#e74c3c"; ctx.shadowBlur = 15; ctx.shadowColor = "#e74c3c";
    for(let s in snakes) drawLine(ctx, s, snakes[s], bRect);
}

function drawLine(ctx, start, end, bRect) {
    const sRect = document.getElementById(`cell-${start}`).getBoundingClientRect();
    const eRect = document.getElementById(`cell-${end}`).getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(sRect.left - bRect.left + 30, sRect.top - bRect.top + 30);
    ctx.lineTo(eRect.left - bRect.left + 30, eRect.top - bRect.top + 30);
    ctx.stroke();
}

function resetToLocalAI() {
    players = { 1: { pos: 1, type: "human" }, 2: { pos: 1, type: "ai" } };
    turn = 1; 
    document.querySelectorAll('.pawn').forEach(p => p.remove());
    init();
}

document.getElementById("roll-btn").addEventListener("click", handleRoll);
init();