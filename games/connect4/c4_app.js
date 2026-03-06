// ==========================================
// 1. INITIALIZE CASINO OS & MULTIPLAYER STATE
// ==========================================
let gameMode = localStorage.getItem("c4_mode") || "ai"; // "ai", "local", or "online"
let myPlayerId = 1; // 1 = Yellow (Host), 2 = Blue (Guest)
let currentRoomId = null; 
let isHost = false;

SystemUI.init({
    gameName: "CONNECT 4",
    rules: "Drop your chips into the columns. The first player to connect 4 chips in a row (horizontal, vertical, or diagonal) wins!<br><br>• Play locally, test your skills against the AI, or play Online!",
    customToggles: `
        <div class="settings-group" style="text-align:left;">
            <label style="display:block; margin-bottom:5px; color:#bdc3c7;">Game Mode:</label>
            <select id="sys-c4-mode" style="width:100%; padding:10px; border-radius:5px; border:1px solid #34495e; background:#2c3e50; color:white;">
                <option value="ai">🤖 Play vs AI</option>
                <option value="local">👥 Local Multiplayer</option>
                <option value="online">🌐 Online Multiplayer</option>
            </select>
        </div>
    `
});

document.getElementById("sys-c4-mode").value = gameMode;
document.getElementById("sys-c4-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("c4_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden"); 
    
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        currentRoomId = null; 
        restartGame();
    }
});

if (gameMode === "online") {
    const lobby = document.getElementById("multiplayer-lobby");
    if(lobby) lobby.classList.remove("hidden");
}

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if(confirm("Wipe the board and restart the game?")) {
        restartGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});

// ==========================================
// 2. BUILD THE BOARD (7 Cols x 6 Rows)
// ==========================================
const ROWS = 6;
const COLS = 7;
let board = []; 
let currentPlayer = 1; 
let gameActive = true;
const statusDisplay = document.getElementById("status-display");

function createBoard() {
    const boardElement = document.getElementById("c4-board");
    boardElement.innerHTML = ""; 
    board = [];

    for (let r = 0; r < ROWS; r++) {
        let rowArray = [];
        for (let c = 0; c < COLS; c++) {
            rowArray.push(0); 
            let slot = document.createElement("div");
            slot.className = "slot";
            slot.id = `slot-${r}-${c}`;
            
            // Create a wrapper for the chip to handle the animation cleanly inside the hole
            let chip = document.createElement("div");
            chip.className = "chip";
            slot.appendChild(chip);

            slot.addEventListener("click", () => handleColumnClick(c));
            boardElement.appendChild(slot);
        }
        board.push(rowArray);
    }
    updateStatus();
}

// ==========================================
// 3. FIREBASE MULTIPLAYER LOGIC
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

if(btnCreateRoom) {
    btnCreateRoom.addEventListener("click", () => {
        SystemUI.playSound('click');
        currentRoomId = generateRoomCode();
        isHost = true;
        myPlayerId = 1;
        
        window.dbSet(window.dbRef(window.db, 'c4_rooms/' + currentRoomId), {
            board: board,
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
}

if(btnJoinRoom) {
    btnJoinRoom.addEventListener("click", () => {
        SystemUI.playSound('click');
        const code = joinInput.value.toUpperCase();
        if(code.length !== 4) { errorMsg.innerText = "Code must be 4 characters."; return; }
        
        window.dbGet(window.dbChild(window.dbRef(window.db), `c4_rooms/${code}`)).then((snapshot) => {
            if (snapshot.exists() && snapshot.val().players === 1) {
                currentRoomId = code;
                isHost = false;
                myPlayerId = 2;
                
                window.dbUpdate(window.dbRef(window.db, 'c4_rooms/' + currentRoomId), {
                    players: 2,
                    status: "playing"
                });
                
                lobbyUI.classList.add("hidden");
                listenToRoom();
            } else {
                errorMsg.innerText = "Room full or not found.";
            }
        });
    });
}

function listenToRoom() {
    window.dbOnValue(window.dbRef(window.db, 'c4_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) return; 

        if(data.status === "playing" && lobbyUI && !lobbyUI.classList.contains("hidden")) {
            lobbyUI.classList.add("hidden");
            SystemUI.playSound('win'); 
        }

        board = [];
        for(let r = 0; r < ROWS; r++) {
            let newRow = [];
            for(let c = 0; c < COLS; c++) {
                newRow.push((data.board && data.board[r] && data.board[r][c]) ? data.board[r][c] : 0);
            }
            board.push(newRow);
        }
        
        currentPlayer = data.turn;
        gameActive = true; 
        
        updateVisualBoard();
        checkResult(true); 
        
        if (gameActive) updateStatus();
    });
}

// ==========================================
// 4. GAMEPLAY LOGIC (Gravity & Placing)
// ==========================================
function getLowestEmptyRow(boardState, col) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (boardState[r][col] === 0) return r;
    }
    return -1;
}

function handleColumnClick(col) {
    if (!gameActive) return;

    if (gameMode === "online" && currentPlayer !== myPlayerId) {
        SystemUI.playSound('click'); 
        return; 
    }

    let targetRow = getLowestEmptyRow(board, col);
    if (targetRow === -1) return; // Column full

    SystemUI.playSound('chipStack'); 

    if (gameMode === "online") {
        let newBoard = JSON.parse(JSON.stringify(board)); 
        newBoard[targetRow][col] = myPlayerId;
        let nextTurn = myPlayerId === 1 ? 2 : 1;
        
        window.dbUpdate(window.dbRef(window.db, 'c4_rooms/' + currentRoomId), {
            board: newBoard,
            turn: nextTurn
        });
        return; 
    }

    board[targetRow][col] = currentPlayer;
    updateVisualBoard();
    checkResult(false);

    if (gameMode === "ai" && gameActive && currentPlayer === 2) {
        statusDisplay.innerText = "AI is thinking...";
        setTimeout(computerMove, 600); 
    }
}

function updateVisualBoard() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let chip = document.getElementById(`slot-${r}-${c}`).querySelector('.chip');
            // Remove previous classes safely
            chip.className = "chip"; 
            if (board[r][c] === 1) chip.classList.add("player1");
            if (board[r][c] === 2) chip.classList.add("player2");
        }
    }
}

function updateStatus() {
    if(gameMode === "online") {
        statusDisplay.innerText = currentPlayer === myPlayerId ? "YOUR TURN!" : "Opponent's Turn...";
        statusDisplay.style.color = myPlayerId === 1 ? "#f1c40f" : "#3498db";
    } else {
        let name = currentPlayer === 1 ? "Yellow" : "Blue";
        statusDisplay.innerText = `${name}'s Turn`;
        statusDisplay.style.color = currentPlayer === 1 ? "#f1c40f" : "#3498db";
    }
}

// ==========================================
// 5. SMARTER AI LOGIC (Win, Block, Center)
// ==========================================
function computerMove() {
    if (!gameActive) return;
    
    let validCols = [];
    for(let c=0; c<COLS; c++) {
        if(board[0][c] === 0) validCols.push(c);
    }
    if(validCols.length === 0) return;

    let bestCol = -1;

    // Priority 1: Can the AI win right now?
    for(let c of validCols) {
        let r = getLowestEmptyRow(board, c);
        let tempBoard = JSON.parse(JSON.stringify(board));
        tempBoard[r][c] = 2; // AI is Player 2
        if(checkWinLogic(tempBoard, 2)) { bestCol = c; break; }
    }

    // Priority 2: Must the AI block the player from winning next turn?
    if(bestCol === -1) {
        for(let c of validCols) {
            let r = getLowestEmptyRow(board, c);
            let tempBoard = JSON.parse(JSON.stringify(board));
            tempBoard[r][c] = 1; // Human is Player 1
            if(checkWinLogic(tempBoard, 1)) { bestCol = c; break; }
        }
    }

    // Priority 3: Try to take the center column if it's available and not forced to block
    if(bestCol === -1 && validCols.includes(3) && Math.random() > 0.4) {
        bestCol = 3;
    }

    // Priority 4: Pick a random valid column
    if(bestCol === -1) {
        bestCol = validCols[Math.floor(Math.random() * validCols.length)];
    }

    handleColumnClick(bestCol);
}

// A pure logic function that ONLY checks for wins on a simulated board without updating the screen
function checkWinLogic(b, player) {
    // Horizontal
    for(let c=0; c<COLS-3; c++) {
        for(let r=0; r<ROWS; r++) {
            if(b[r][c] === player && b[r][c+1] === player && b[r][c+2] === player && b[r][c+3] === player) return true;
        }
    }
    // Vertical
    for(let c=0; c<COLS; c++) {
        for(let r=0; r<ROWS-3; r++) {
            if(b[r][c] === player && b[r+1][c] === player && b[r+2][c] === player && b[r+3][c] === player) return true;
        }
    }
    // Diagonal Down-Right
    for(let c=0; c<COLS-3; c++) {
        for(let r=0; r<ROWS-3; r++) {
            if(b[r][c] === player && b[r+1][c+1] === player && b[r+2][c+2] === player && b[r+3][c+3] === player) return true;
        }
    }
    // Diagonal Down-Left
    for(let c=0; c<COLS-3; c++) {
        for(let r=3; r<ROWS; r++) {
            if(b[r][c] === player && b[r-1][c+1] === player && b[r-2][c+2] === player && b[r-3][c+3] === player) return true;
        }
    }
    return false;
}

// ==========================================
// 6. VISUAL WIN CHECK
// ==========================================
function checkResult(isFromNetwork) {
    let won = false;
    let winningSlots = [];

    // Horizontal
    for (let c = 0; c < COLS - 3; c++) {
        for (let r = 0; r < ROWS; r++) {
            let p = board[r][c];
            if (p !== 0 && p === board[r][c+1] && p === board[r][c+2] && p === board[r][c+3]) {
                won = true; winningSlots = [[r,c], [r,c+1], [r,c+2], [r,c+3]];
            }
        }
    }
    // Vertical
    if (!won) {
        for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS - 3; r++) {
                let p = board[r][c];
                if (p !== 0 && p === board[r+1][c] && p === board[r+2][c] && p === board[r+3][c]) {
                    won = true; winningSlots = [[r,c], [r+1,c], [r+2,c], [r+3,c]];
                }
            }
        }
    }
    // Diagonal Down-Right
    if (!won) {
        for (let c = 0; c < COLS - 3; c++) {
            for (let r = 0; r < ROWS - 3; r++) {
                let p = board[r][c];
                if (p !== 0 && p === board[r+1][c+1] && p === board[r+2][c+2] && p === board[r+3][c+3]) {
                    won = true; winningSlots = [[r,c], [r+1,c+1], [r+2,c+2], [r+3,c+3]];
                }
            }
        }
    }
    // Diagonal Down-Left
    if (!won) {
        for (let c = 0; c < COLS - 3; c++) {
            for (let r = 3; r < ROWS; r++) {
                let p = board[r][c];
                if (p !== 0 && p === board[r-1][c+1] && p === board[r-2][c+2] && p === board[r-3][c+3]) {
                    won = true; winningSlots = [[r,c], [r-1,c+1], [r-2,c+2], [r-3,c+3]];
                }
            }
        }
    }

    if (won) {
        winningSlots.forEach(([r, c]) => {
            let chip = document.getElementById(`slot-${r}-${c}`).querySelector('.chip');
            chip.classList.add('winning-piece');
        });
        
        if (gameMode === "online") {
            let winner = currentPlayer === 1 ? 2 : 1; 
            statusDisplay.innerText = winner === myPlayerId ? "YOU WIN!" : "OPPONENT WINS!";
            if(!isFromNetwork) SystemUI.playSound(winner === myPlayerId ? 'win' : 'lose');
        } else if (gameMode === "ai" && currentPlayer === 2) {
            statusDisplay.innerText = "Computer Wins!";
            if(!isFromNetwork) SystemUI.playSound('lose');
        } else {
            statusDisplay.innerText = currentPlayer === 1 ? "Yellow Wins!" : "Blue Wins!";
            if(!isFromNetwork) SystemUI.playSound('win');
        }
        gameActive = false; return;
    }

    // Check Draw
    if (board[0].every(val => val !== 0)) {
        statusDisplay.innerText = "It's a draw!";
        if(!isFromNetwork) SystemUI.playSound('tie');
        gameActive = false; return;
    }

    if(gameMode !== "online") {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updateStatus();
    }
}

document.getElementById("restart-btn").addEventListener("click", () => {
    restartGame();
});

function restartGame() {
    SystemUI.playSound('shuffle'); 

    if (gameMode === "online") {
        if (isHost) {
            let emptyBoard = Array(6).fill().map(() => Array(7).fill(0));
            window.dbUpdate(window.dbRef(window.db, 'c4_rooms/' + currentRoomId), {
                board: emptyBoard,
                turn: 1
            });
        } else {
            alert("Only the Host can restart the game!");
        }
        return;
    }

    currentPlayer = 1;
    gameActive = true;
    createBoard();
}

// Kickstart
createBoard();