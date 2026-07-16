// ==========================================
// 1. INITIALIZE CASINO OS & MULTIPLAYER STATE
// ==========================================
// FIX: Force AI mode on boot so it never deadlocks in a ghost online state
let gameMode = "ai"; 
localStorage.setItem("ttt_mode", "ai");

let aiDifficulty = localStorage.getItem("ttt_diff") || "hard";
let mySymbol = "X"; 
let currentRoomId = null; 
let isHost = true; 
let chatStarted = false; 
let seats = [];
let roomListener = null;
let isThinking = false;

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
        },
        {
            id: "sys-ttt-diff",
            label: "Difficulty",
            options: [
                { value: "easy",   label: "Easy" },
                { value: "normal", label: "Normal" },
                { value: "hard",   label: "Hard" }
            ]
        }
    ]
});

// Setup dropdown listeners securely
setTimeout(() => {
    const modeSelect = document.getElementById("sys-ttt-mode");
    const diffSelect = document.getElementById("sys-ttt-diff");

    if (modeSelect) {
        modeSelect.value = gameMode;
        modeSelect.addEventListener("change", (e) => {
            gameMode = e.target.value;
            localStorage.setItem("ttt_mode", gameMode);
            document.getElementById("sys-modal")?.classList.add("sys-hidden"); 
            syncDiffVisibility();
            
            if (gameMode === "online") {
                SystemUI.v2Lobby.show();
            } else {
                SystemUI.v2Lobby.hide();
                currentRoomId = null; 
                SystemUI.stopChat();
                chatStarted = false;
                isHost = true;
                if (roomListener) { roomListener(); roomListener = null; }
                restartGame();
            }
        });
    }

    if (diffSelect) {
        diffSelect.value = aiDifficulty;
        diffSelect.addEventListener("change", (e) => {
            aiDifficulty = e.target.value;
            localStorage.setItem("ttt_diff", aiDifficulty);
        });
    }

    document.getElementById("sys-reset-game-btn")?.addEventListener("click", () => {
        if(confirm("Wipe the board and restart the game?")) {
            restartGame();
            document.getElementById("sys-modal")?.classList.add("sys-hidden");
        }
    });

    syncDiffVisibility();
    restartGame();
}, 100);

function syncDiffVisibility() {
    const wrap = document.getElementById("sys-ttt-diff")?.closest(".hud-dropdown-wrap") ||
                 document.getElementById("sys-ttt-diff")?.parentElement;
    if (wrap) wrap.style.display = gameMode === "ai" ? "" : "none";
}

// ==========================================
// 2. V2 MULTIPLAYER LOBBY LOGIC (via SystemMatch)
// ==========================================
SystemMatch.setup({
    gameId:   "ttt",
    roomPath: "ttt_rooms",
    autoShow: false,
    buildSeats: () => [
        { type: "human", name: SystemUI.getPlayerName() },
        { type: "ai",    name: "AI (" + aiDifficulty + ")" }
    ],
    extraRoomFields: () => ({
        board: ["", "", "", "", "", "", "", "", ""],
        turn:  "X"
    }),
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true;
        mySymbol = "X";
        chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false;
        mySymbol = "O";
        chatStarted = false;
        seats = SystemMatch.getSeats();
        // TTT auto-starts on join (no host-pressed Start button).
        if (window.db && window.dbUpdate) {
            window.dbUpdate(window.dbRef(window.db, 'ttt_rooms/' + roomId), { status: "playing" });
        }
        listenToRoom();
    },
    onLeave: () => {
        gameMode = "local";
        const modeEl = document.getElementById("sys-ttt-mode");
        if (modeEl) modeEl.value = "local";
        chatStarted = false;
        if (roomListener) { roomListener(); roomListener = null; }
        currentRoomId = null;
        restartGame();
    },
    onStart: () => {
        if (window.db && currentRoomId) {
            window.dbUpdate(window.dbRef(window.db, 'ttt_rooms/' + currentRoomId), { status: "playing" });
        }
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    if (roomListener) roomListener();

    roomListener = window.dbOnValue(window.dbRef(window.db, 'ttt_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if(!data) {
            // Room node removed — the host quit. Don't freeze the guest.
            if (gameMode === "online" && currentRoomId && !isHost) {
                exitOnline("Host left the game");
            }
            return;
        }
        if (data.status === "abandoned") {
            // Guest closed their tab mid-game
            if (gameMode === "online" && currentRoomId && isHost) {
                exitOnline("Opponent left the game");
            }
            return;
        }

        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);

        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, (typeof SystemUI.getPlayerName === 'function' ? SystemUI.getPlayerName() : "Player"));
            }
        }

        if (data.status !== "playing") return;

        board = data.board || ["", "", "", "", "", "", "", "", ""];
        currentPlayer = data.turn;
        gameActive = true; 
        
        updateVisualBoard();
        checkResult(true); 
        
        if (gameActive) {
            statusDisplay.innerText = currentPlayer === mySymbol ? "YOUR TURN!" : "Opponent is thinking...";
            
            // V2 Drop-In AI
            if (isHost) {
                const turnIdx = currentPlayer === "X" ? 0 : 1;
                if (seats[turnIdx] && seats[turnIdx].type === "ai") {
                    setTimeout(computerMove, 800);
                }
            }
        }
    });
}

// The opponent vanished — clean up and drop back to hotseat with a notice.
function exitOnline(message) {
    if (roomListener) { roomListener(); roomListener = null; }
    if (window.SystemMatch) {
        // Room is already gone when the host left — blank the seats first so
        // cleanup() doesn't write a ghost seat-release into a deleted room.
        if (!isHost) SystemMatch.setSeats([]);
        SystemMatch.cleanup(); // host: removes room node; both: stops chat
    }
    currentRoomId = null;
    chatStarted = false;
    SystemUI.v2Lobby.hide();
    gameMode = "local";
    localStorage.setItem("ttt_mode", "local");
    const modeEl = document.getElementById("sys-ttt-mode");
    if (modeEl) modeEl.value = "local";
    syncDiffVisibility();
    isHost = true;
    restartGame();
    statusDisplay.innerText = message;
}

// Guest closing the tab mid-game flags the room abandoned so the host's
// listener can react. (Host tab-close removal is handled by SystemMatch.)
window.addEventListener("beforeunload", () => {
    if (gameMode === "online" && currentRoomId && !isHost && chatStarted && window.db && window.dbUpdate) {
        try { window.dbUpdate(window.dbRef(window.db, 'ttt_rooms/' + currentRoomId), { status: "abandoned" }); } catch (e) {}
    }
});

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

// ==========================================
// 4. GAMEPLAY LOGIC
// ==========================================
function handleCellClick(clickedCellEvent) {
    const clickedCellIndex = parseInt(clickedCellEvent.target.getAttribute('data-index'));

    if (board[clickedCellIndex] !== "" || !gameActive || isThinking) return;

    if (gameMode === "online") {
        if (currentPlayer !== mySymbol) {
            SystemUI.playSound('click'); 
            return; 
        }
        
        SystemUI.playSound('chipTable');
        let newBoard = [...board];
        newBoard[clickedCellIndex] = mySymbol;
        let nextTurn = mySymbol === "X" ? "O" : "X";
        
        if(window.db) {
            window.dbUpdate(window.dbRef(window.db, 'ttt_rooms/' + currentRoomId), {
                board: newBoard,
                turn: nextTurn
            });
        }
        return; 
    }

    SystemUI.playSound('chipTable');
    updateCell(clickedCellEvent.target, clickedCellIndex);
    checkResult(false);

    if (gameMode === "ai" && gameActive && currentPlayer === "O") {
        isThinking = true;
        statusDisplay.innerText = "Computer is thinking...";
        setTimeout(computerMove, 600); 
    }
}

function updateCell(cell, index) {
    board[index] = currentPlayer;
    if (cell) {
        cell.innerText = currentPlayer;
        cell.className = "cell"; 
        cell.classList.add(currentPlayer.toLowerCase());
    }
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

// ==========================================
// 5. UPGRADED AI BRAIN (Minimax)
// ==========================================
function computerMove() {
    if (!gameActive) { isThinking = false; return; }
    
    let moveIndex = -1;

    if (aiDifficulty === "easy") {
        let availableMoves = [];
        board.forEach((val, index) => { if (val === "") availableMoves.push(index); });
        moveIndex = availableMoves[Math.floor(Math.random() * availableMoves.length)];
    } else if (aiDifficulty === "normal") {
        if (Math.random() < 0.2) {
            let availableMoves = [];
            board.forEach((val, index) => { if (val === "") availableMoves.push(index); });
            moveIndex = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        } else {
            moveIndex = findBestMoveLogic("O"); 
            if (moveIndex === -1) moveIndex = findBestMoveLogic("X"); 
            if (moveIndex === -1 && board[4] === "") moveIndex = 4; 
            if (moveIndex === -1) {
                let availableMoves = [];
                board.forEach((val, index) => { if (val === "") availableMoves.push(index); });
                moveIndex = availableMoves[Math.floor(Math.random() * availableMoves.length)];
            }
        }
    } else {
        moveIndex = getMinimaxMove(board, "O");
    }

    if (gameMode === "online") {
        let newBoard = [...board];
        newBoard[moveIndex] = currentPlayer;
        let nextTurn = currentPlayer === "X" ? "O" : "X";
        if(window.db) {
            window.dbUpdate(window.dbRef(window.db, 'ttt_rooms/' + currentRoomId), {
                board: newBoard,
                turn: nextTurn
            });
        }
    } else {
        const targetCell = document.querySelector(`.cell[data-index="${moveIndex}"]`);
        SystemUI.playSound('chipTable');
        updateCell(targetCell, moveIndex);
        checkResult(false);
    }
    isThinking = false;
}

function findBestMoveLogic(playerSymbol) {
    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i];
        if (board[a] === playerSymbol && board[b] === playerSymbol && board[c] === "") return c;
        if (board[a] === playerSymbol && board[c] === playerSymbol && board[b] === "") return b;
        if (board[b] === playerSymbol && board[c] === playerSymbol && board[a] === "") return a;
    }
    return -1; 
}

function getMinimaxMove(currentBoard, player) {
    let bestScore = -Infinity;
    let move = -1;
    for (let i = 0; i < 9; i++) {
        if (currentBoard[i] === "") {
            currentBoard[i] = player;
            let score = minimax(currentBoard, 0, false);
            currentBoard[i] = "";
            if (score > bestScore) {
                bestScore = score;
                move = i;
            }
        }
    }
    return move;
}

function minimax(tempBoard, depth, isMaximizing) {
    let result = evaluateBoard(tempBoard);
    if (result !== null) return result;

    if (isMaximizing) {
        let bestScore = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (tempBoard[i] === "") {
                tempBoard[i] = "O";
                let score = minimax(tempBoard, depth + 1, false);
                tempBoard[i] = "";
                bestScore = Math.max(score, bestScore);
            }
        }
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (let i = 0; i < 9; i++) {
            if (tempBoard[i] === "") {
                tempBoard[i] = "X";
                let score = minimax(tempBoard, depth + 1, true);
                tempBoard[i] = "";
                bestScore = Math.min(score, bestScore);
            }
        }
        return bestScore;
    }
}

function evaluateBoard(b) {
    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b1, c] = winningConditions[i];
        if (b[a] && b[a] === b[b1] && b[b1] === b[c]) {
            return b[a] === "O" ? 10 : -10;
        }
    }
    if (!b.includes("")) return 0;
    return null;
}

// ==========================================
// 6. RESULT CHECKING
// ==========================================
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

            // AUDIT: Track online win/loss
            if (typeof SystemStats !== 'undefined') {
                if (winner === mySymbol) SystemStats.recordWin("ttt", 0);
                else SystemStats.recordLoss("ttt");
            }
        } else if (gameMode === "ai" && currentPlayer === "O") {
            statusDisplay.innerText = "Computer Wins!";
            if(!isFromNetwork) SystemUI.playSound('lose');

            // AUDIT: Track AI loss
            if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("ttt");
        } else {
            statusDisplay.innerText = `Player ${currentPlayer} Wins!`;
            if(!isFromNetwork) SystemUI.playSound('win');

            // AUDIT: Track AI win
            if (typeof SystemStats !== 'undefined' && gameMode === "ai") SystemStats.recordWin("ttt", 0);
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

document.getElementById("restart-btn")?.addEventListener("click", restartGame);

function restartGame() {
    // AUDIT: Tracking game start
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("ttt");

    SystemUI.playSound('shuffle'); 
    isThinking = false;

    if (gameMode === "online") {
        // Either player may restart — the blank-board write is idempotent,
        // so the guest's RESTART works instead of silently doing nothing.
        if (window.db && currentRoomId) {
            window.dbUpdate(window.dbRef(window.db, 'ttt_rooms/' + currentRoomId), {
                board: ["", "", "", "", "", "", "", "", ""],
                turn: "X"
            });
        }
        return;
    }

    board = ["", "", "", "", "", "", "", "", ""];
    currentPlayer = "X";
    gameActive = true;
    if(statusDisplay) statusDisplay.innerText = `It's ${currentPlayer}'s turn`;
    document.querySelectorAll('.cell').forEach(cell => {
        cell.innerText = "";
        cell.className = "cell";
    });
}

document.querySelectorAll('.cell').forEach(cell => cell.addEventListener('click', handleCellClick));

// SAFE DOM CHECKS
document.getElementById("lobby-close-btn")?.addEventListener("click", () => {
    document.getElementById("multiplayer-lobby")?.classList.add("hidden");
});

document.getElementById("btn-cancel-lobby")?.addEventListener("click", () => {
    document.getElementById("multiplayer-lobby")?.classList.add("hidden");
    SystemUI.stopChat();
    chatStarted = false;
    const modeSelect = document.getElementById("sys-ttt-mode");
    if(modeSelect) {
        modeSelect.value = "local";
        modeSelect.dispatchEvent(new Event("change")); 
    }
});