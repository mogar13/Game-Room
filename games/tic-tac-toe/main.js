// ==========================================
// 1. INITIALIZE CASINO OS
// ==========================================
let isSinglePlayer = localStorage.getItem("ttt_mode") !== "local"; // Defaults to AI

SystemUI.init({
    gameName: "TIC-TAC-TOE",
    rules: "Take turns placing X's and O's. Match 3 symbols in a horizontal, vertical, or diagonal row to win.<br><br>• You can challenge a friend locally, or test your skills against the AI.",
    customToggles: `
        <div class="settings-group" style="text-align:left;">
            <label style="display:block; margin-bottom:5px; color:#bdc3c7;">Game Mode:</label>
            <select id="sys-ttt-mode" style="width:100%; padding:10px; border-radius:5px; border:1px solid #34495e; background:#2c3e50; color:white;">
                <option value="ai">🤖 Play vs AI</option>
                <option value="local">👥 Local Multiplayer</option>
            </select>
        </div>
    `
});

// Sync OS Mode Toggle
document.getElementById("sys-ttt-mode").value = isSinglePlayer ? "ai" : "local";
document.getElementById("sys-ttt-mode").addEventListener("change", (e) => {
    isSinglePlayer = (e.target.value === "ai");
    localStorage.setItem("ttt_mode", e.target.value);
    restartGame();
    // Auto-close modal when they switch modes so they can play instantly
    document.getElementById("sys-modal").classList.add("sys-hidden"); 
});

// Hook the OS Reset Button to clear the board
document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if(confirm("Wipe the board and restart the game?")) {
        restartGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});


// ==========================================
// 2. CORE ENGINE STATE
// ==========================================
let board = ["", "", "", "", "", "", "", "", ""];
let currentPlayer = "X";
let gameActive = true;

const statusDisplay = document.getElementById("status-display");

const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

// Kick off the initial state text
statusDisplay.innerText = `It's ${currentPlayer}'s turn`;


// ==========================================
// 3. GAMEPLAY LOGIC
// ==========================================
function handleCellClick(clickedCellEvent) {
    const clickedCell = clickedCellEvent.target;
    const clickedCellIndex = parseInt(clickedCell.getAttribute('data-index'));

    if (board[clickedCellIndex] !== "" || !gameActive) return;

    updateCell(clickedCell, clickedCellIndex);
    checkResult();

    // Trigger the Bot's turn
    if (isSinglePlayer && gameActive && currentPlayer === "O") {
        statusDisplay.innerText = "Computer is thinking...";
        setTimeout(computerMove, 600); 
    }
}

function updateCell(cell, index) {
    board[index] = currentPlayer;
    cell.innerText = currentPlayer;
    cell.classList.add(currentPlayer.toLowerCase()); 
}

// 4. The Smart Bot Logic
function computerMove() {
    if (!gameActive) return;

    let availableMoves = [];
    board.forEach((val, index) => {
        if (val === "") availableMoves.push(index);
    });

    let moveIndex = -1;

    moveIndex = findBestMove("O"); // Win
    if (moveIndex === -1) moveIndex = findBestMove("X"); // Block
    if (moveIndex === -1 && board[4] === "") moveIndex = 4; // Center
    if (moveIndex === -1) { // Random
        const randomIndex = Math.floor(Math.random() * availableMoves.length);
        moveIndex = availableMoves[randomIndex];
    }

    const targetCell = document.querySelector(`.cell[data-index="${moveIndex}"]`);
    updateCell(targetCell, moveIndex);
    checkResult();
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

// 5. Checking Results & Restarts
function checkResult() {
    let roundWon = false;
    for (let i = 0; i < winningConditions.length; i++) {
        const winCondition = winningConditions[i];
        let a = board[winCondition[0]];
        let b = board[winCondition[1]];
        let c = board[winCondition[2]];
        if (a === '' || b === '' || c === '') continue;
        if (a === b && b === c) {
            roundWon = true;
            break;
        }
    }

    if (roundWon) {
        if (isSinglePlayer && currentPlayer === "O") {
            statusDisplay.innerText = "Computer Wins!";
        } else {
            statusDisplay.innerText = `Player ${currentPlayer} Wins!`;
        }
        gameActive = false;
        return;
    }

    if (!board.includes("")) {
        statusDisplay.innerText = "It's a draw!";
        gameActive = false;
        return;
    }

    currentPlayer = currentPlayer === "X" ? "O" : "X";
    if (currentPlayer === "X" || !isSinglePlayer) {
        statusDisplay.innerText = `It's ${currentPlayer}'s turn`;
    }
}

function restartGame() {
    board = ["", "", "", "", "", "", "", "", ""];
    currentPlayer = "X";
    gameActive = true;
    statusDisplay.innerText = `It's ${currentPlayer}'s turn`;
    document.querySelectorAll('.cell').forEach(cell => {
        cell.innerText = "";
        cell.classList.remove('x', 'o');
    });
}

// Listeners
document.querySelectorAll('.cell').forEach(cell => cell.addEventListener('click', handleCellClick));
document.getElementById("restart-btn").addEventListener("click", restartGame);