// ==========================================
// 1. INITIALIZE CASINO OS & MULTIPLAYER STATE
// ==========================================
let gameMode = localStorage.getItem("ttt_mode") || "ai"; 
let mySymbol = "X"; 
let currentRoomId = null; 
let isHost = false;
let chatStarted = false; // NEW: Tracks if we've loaded the chat yet

SystemUI.init({
    gameName: "TIC-TAC-TOE",
    rules: "Take turns placing X's and O's. Match 3 symbols to win.<br><br>• Challenge a friend locally, test your skills against the AI, or play Online!",
    hudDropdowns: [
        {
            id: "sys-ttt-mode",
            label: "Game Mode",
            options: [
                { value: "ai",     label: "🤖 vs AI" },
                { value: "local",  label: "👥 Hotseat" },
                { value: "online", label: "🌐 Online" }
            ]
        }
    ]
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
        currentRoomId = null; 
        SystemUI.stopChat();
        chatStarted = false;
        restartGame();
    }
});

// Sync gameMode after system_ui.js forces dropdown to 'ai' via setTimeout(0)
setTimeout(() => { gameMode = document.getElementById("sys-ttt-mode").value; }, 10);

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
    chatStarted = false;
    
    window.dbSet(window.dbRef(window.db, 'rooms/' + currentRoomId), {
        board: ["", "", "", "", "", "", "", "", ""],
        turn: "X",
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
    
    window.dbGet(window.dbChild(window.dbRef(window.db), `rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.players === 1) {
                currentRoomId = code;
                isHost = false;
                mySymbol = "O";
                chatStarted = false;
                
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

// The Magic Listener
function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, 'rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) return;

        // Fire once for BOTH host and joiner when game starts
        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            lobbyUI.classList.add("hidden");
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
        }

        if (data.status !== "playing") return;

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

    if (gameMode === "online") {
        if (currentPlayer !== mySymbol) {
            SystemUI.playSound('click'); 
            return; 
        }
        
        SystemUI.playSound('chipTable');
        
        let newBoard = [...board];
        newBoard[clickedCellIndex] = mySymbol;
        let nextTurn = mySymbol === "X" ? "O" : "X";
        
        window.dbUpdate(window.dbRef(window.db, 'rooms/' + currentRoomId), {
            board: newBoard,
            turn: nextTurn
        });
        return; 
    }

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
            let winner = currentPlayer === "X" ? "O" : "X"; 
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

document.getElementById("lobby-close-btn").addEventListener("click", () => {
    SystemUI.playSound('click');
    document.getElementById("multiplayer-lobby").classList.add("hidden");
});

document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    SystemUI.playSound('click');
    document.getElementById("multiplayer-lobby").classList.add("hidden");
    SystemUI.stopChat();
    chatStarted = false;
    const modeSelect = document.getElementById("sys-ttt-mode");
    modeSelect.value = "local";
    modeSelect.dispatchEvent(new Event("change")); 
});