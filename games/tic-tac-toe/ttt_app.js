// ==========================================
// 1. INITIALIZE CASINO OS & MULTIPLAYER STATE
// ==========================================
let gameMode = localStorage.getItem("ttt_mode") || "ai"; // "ai", "local", or "online"
let mySymbol = "X"; // Defaults to X for local/AI. In online, Host=X, Guest=O.
let currentRoomId = null; 
let isHost = false;

SystemUI.init({
    gameName: "TIC-TAC-TOE",
    rules: "Take turns placing X's and O's. Match 3 symbols to win.<br><br>• Challenge a friend locally, test your skills against the AI, or play Online!",
    customToggles: `
        <div class="settings-group" style="text-align:left;">
            <label style="display:block; margin-bottom:5px; color:#bdc3c7;">Game Mode:</label>
            <select id="sys-ttt-mode" style="width:100%; padding:10px; border-radius:5px; border:1px solid #34495e; background:#2c3e50; color:white;">
                <option value="ai">🤖 Play vs AI</option>
                <option value="local">👥 Local Multiplayer</option>
                <option value="online">🌐 Online Multiplayer</option>
            </select>
        </div>
    `
});

// Handle OS Menu Changes
document.getElementById("sys-ttt-mode").value = gameMode;
document.getElementById("sys-ttt-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("ttt_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden"); 
    
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        currentRoomId = null; // Disconnect from online
        restartGame();
    }
});

if (gameMode === "online") {
    document.getElementById("multiplayer-lobby").classList.remove("hidden");
}

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if(confirm("Wipe the board and restart the game?")) {
        restartGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});

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
    for(let i=0; i<4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// HOST creates a room
btnCreateRoom.addEventListener("click", () => {
    SystemUI.playSound('click');
    currentRoomId = generateRoomCode();
    isHost = true;
    mySymbol = "X";
    
    // Create the room structure in Firebase
    window.dbSet(window.dbRef(window.db, 'rooms/' + currentRoomId), {
        board: ["", "", "", "", "", "", "", "", ""],
        turn: "X",
        players: 1,
        status: "waiting"
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        btnCreateRoom.disabled = true;
        listenToRoom(); // Start watching the database
    });
});

// GUEST joins a room
btnJoinRoom.addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = joinInput.value.toUpperCase();
    if(code.length !== 4) { errorMsg.innerText = "Code must be 4 characters."; return; }
    
    // Check if room exists in Firebase
    window.dbGet(window.dbChild(window.dbRef(window.db), `rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.players === 1) {
                // Room is open! Join it.
                currentRoomId = code;
                isHost = false;
                mySymbol = "O";
                
                window.dbUpdate(window.dbRef(window.db, 'rooms/' + currentRoomId), {
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
    window.dbOnValue(window.dbRef(window.db, 'rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) return; // Room deleted

        // If guest joined, hide lobby for the host
        if(data.status === "playing" && !lobbyUI.classList.contains("hidden")) {
            lobbyUI.classList.add("hidden");
            SystemUI.playSound('win'); // Happy sound when connected
        }

        // --- THE FIREBASE CHOP FIX ---
        // Force the board to always have 9 slots, restoring any empty strings Firebase deleted
        board = ["", "", "", "", "", "", "", "", ""];
        if (data.board) {
            for (let i = 0; i < 9; i++) {
                board[i] = data.board[i] || "";
            }
        }
        
        currentPlayer = data.turn;
        gameActive = true; 
        
        updateVisualBoard();
        checkResult(true); 
        
        if (gameActive) {
            statusDisplay.innerText = currentPlayer === mySymbol ? "YOUR TURN!" : "Opponent is thinking...";
        }
    });
}


// ==========================================
// 3. CORE ENGINE STATE
// ==========================================
let board = ["", "", "", "", "", "", "", "", ""];
let currentPlayer = "X";
let gameActive = true;
const statusDisplay = document.getElementById("status-display");

const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]
];

statusDisplay.innerText = `It's ${currentPlayer}'s turn`;


// ==========================================
// 4. GAMEPLAY LOGIC
// ==========================================
function handleCellClick(clickedCellEvent) {
    const clickedCellIndex = parseInt(clickedCellEvent.target.getAttribute('data-index'));

    if (board[clickedCellIndex] !== "" || !gameActive) return;

    // ONLINE NETWORK CHECK: Is it actually my turn?
    if (gameMode === "online") {
        if (currentPlayer !== mySymbol) {
            SystemUI.playSound('click'); // Reject sound
            return; 
        }
        
        SystemUI.playSound('chipTable');
        
        // Build new board array and send to Firebase
        let newBoard = [...board];
        newBoard[clickedCellIndex] = mySymbol;
        let nextTurn = mySymbol === "X" ? "O" : "X";
        
        window.dbUpdate(window.dbRef(window.db, 'rooms/' + currentRoomId), {
            board: newBoard,
            turn: nextTurn
        });
        return; // Exit function. The listener will draw the X/O for us!
    }

    // LOCAL / AI LOGIC
    SystemUI.playSound('chipTable');
    updateCell(clickedCellEvent.target, clickedCellIndex);
    checkResult(false);

    if (gameMode === "ai" && gameActive && currentPlayer === "O") {
        statusDisplay.innerText = "Computer is thinking...";
        setTimeout(computerMove, 600); 
    }
}

function updateCell(cell, index) {
    board[index] = currentPlayer;
    cell.innerText = currentPlayer;
    cell.classList.add(currentPlayer.toLowerCase()); 
}

function updateVisualBoard() {
    const cells = document.querySelectorAll('.cell');
    cells.forEach((cell, index) => {
        let val = board[index];
        cell.innerText = val;
        cell.className = "cell"; 
        if(val) cell.classList.add(val.toLowerCase());
    });
}

function computerMove() {
    if (!gameActive) return;
    let availableMoves = [];
    board.forEach((val, index) => { if (val === "") availableMoves.push(index); });
    let moveIndex = -1;

    moveIndex = findBestMove("O"); 
    if (moveIndex === -1) moveIndex = findBestMove("X"); 
    if (moveIndex === -1 && board[4] === "") moveIndex = 4; 
    if (moveIndex === -1) { 
        moveIndex = availableMoves[Math.floor(Math.random() * availableMoves.length)];
    }

    const targetCell = document.querySelector(`.cell[data-index="${moveIndex}"]`);
    SystemUI.playSound('chipTable');
    updateCell(targetCell, moveIndex);
    checkResult(false);
}

function findBestMove(playerSymbol) {
    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i];
        if (board[a] === playerSymbol && board[b] === playerSymbol && board[c] === "") return c;
        if (board[a] === playerSymbol && board[c] === playerSymbol && board[b] === "") return b;
        if (board[b] === playerSymbol && board[c] === playerSymbol && board[a] === "") return a;
    }
    return -1; 
}

function checkResult(isFromNetwork) {
    let roundWon = false;
    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i];
        if (board[a] && board[a] === board[b] && board[b] === board[c]) {
            roundWon = true; break;
        }
    }

    if (roundWon) {
        if (gameMode === "online") {
            let winner = currentPlayer === "X" ? "O" : "X"; // The person who just moved won
            statusDisplay.innerText = winner === mySymbol ? "YOU WIN!" : "OPPONENT WINS!";
            if(!isFromNetwork) SystemUI.playSound(winner === mySymbol ? 'win' : 'lose');
        } else if (gameMode === "ai" && currentPlayer === "O") {
            statusDisplay.innerText = "Computer Wins!";
            if(!isFromNetwork) SystemUI.playSound('lose');
        } else {
            statusDisplay.innerText = `Player ${currentPlayer} Wins!`;
            if(!isFromNetwork) SystemUI.playSound('win');
        }
        gameActive = false; return;
    }

    if (!board.includes("")) {
        statusDisplay.innerText = "It's a draw!";
        if(!isFromNetwork) SystemUI.playSound('tie');
        gameActive = false; return;
    }

    if(gameMode !== "online") {
        currentPlayer = currentPlayer === "X" ? "O" : "X";
        if (gameMode !== "ai" || currentPlayer === "X") {
            statusDisplay.innerText = `It's ${currentPlayer}'s turn`;
        }
    }
}

document.getElementById("restart-btn").addEventListener("click", () => {
    restartGame();
});

function restartGame() {
    SystemUI.playSound('shuffle'); 

    if (gameMode === "online") {
        if (isHost) {
            window.dbUpdate(window.dbRef(window.db, 'rooms/' + currentRoomId), {
                board: ["", "", "", "", "", "", "", "", ""],
                turn: "X"
            });
        } else {
            alert("Only the Host can restart the game!");
        }
        return;
    }

    board = ["", "", "", "", "", "", "", "", ""];
    currentPlayer = "X";
    gameActive = true;
    statusDisplay.innerText = `It's ${currentPlayer}'s turn`;
    document.querySelectorAll('.cell').forEach(cell => {
        cell.innerText = "";
        cell.className = "cell";
    });
}

document.querySelectorAll('.cell').forEach(cell => cell.addEventListener('click', handleCellClick));