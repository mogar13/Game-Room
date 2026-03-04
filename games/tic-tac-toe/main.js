// 1. Initial State
let board = ["", "", "", "", "", "", "", "", ""];
let currentPlayer = "X";
let gameActive = true;
let isSinglePlayer = false; // This is now set by the Menu

const statusDisplay = document.getElementById("status-display");
const mainMenu = document.getElementById("main-menu");

const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

// --- NEW: Menu Logic ---
document.getElementById("btn-vs-ai").addEventListener("click", () => {
    isSinglePlayer = true;
    startGame();
});

document.getElementById("btn-multi").addEventListener("click", () => {
    isSinglePlayer = false;
    startGame();
});

document.getElementById("change-mode-btn").addEventListener("click", () => {
    mainMenu.classList.remove("hidden");
});

function startGame() {
    mainMenu.classList.add("hidden");
    restartGame(); // Clears the board and sets the correct starting text
}
// -----------------------

// 2. Core Engine Functions
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

// 3. The Smart Bot Logic
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

// 4. Checking Results & Restarts
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

// Listeners for the board and restart
document.querySelectorAll('.cell').forEach(cell => cell.addEventListener('click', handleCellClick));
document.getElementById("restart-btn").addEventListener("click", restartGame);