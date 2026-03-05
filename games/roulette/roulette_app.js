// ==========================================
// 1. INITIAL STATE & SHARED BANKROLL
// ==========================================
let money = parseInt(localStorage.getItem("blackjack_money")) || 5000;
let currentBetAmount = 0;
let selectedChip = 10;
let bets = {}; // Stores { cellId: amount }
let isSpinning = false;

const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

function updateHUD() {
    document.getElementById("bankroll-display").innerText = `$${money}`;
    document.getElementById("current-bet").innerText = `Bet: $${currentBetAmount}`;
}

// ==========================================
// 2. GRID GENERATION (1-36)
// ==========================================
function initTable() {
    const grid = document.getElementById("numbers-grid");
    // Numbers are usually arranged in 3 rows: 
    // Row 1: 3, 6, 9...
    // Row 2: 2, 5, 8...
    // Row 3: 1, 4, 7...
    // We will inject them in order to match the CSS Grid column flow.
    for (let i = 1; i <= 36; i++) {
        const cell = document.createElement("div");
        const isRed = redNumbers.includes(i);
        cell.className = `cell ${isRed ? 'red' : 'black'}`;
        cell.innerText = i;
        cell.dataset.num = i;
        cell.addEventListener("click", () => placeBet(i.toString(), cell));
        grid.appendChild(cell);
    }
}

// ==========================================
// 3. BETTING LOGIC
// ==========================================
document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
        selectedChip = parseInt(chip.dataset.val);
        // Visual feedback for selected chip could be added here
    });
});

document.querySelectorAll(".bet-area").forEach(area => {
    area.addEventListener("click", () => placeBet(area.dataset.type, area));
});

function placeBet(id, element) {
    if (isSpinning) return;
    if (money < selectedChip) return alert("Not enough cash!");

    money -= selectedChip;
    currentBetAmount += selectedChip;
    bets[id] = (bets[id] || 0) + selectedChip;

    // Visual: Add a "chip" marker to the cell
    let chipMarker = element.querySelector(".table-chip");
    if (!chipMarker) {
        chipMarker = document.createElement("div");
        chipMarker.className = "table-chip";
        element.appendChild(chipMarker);
    }
    chipMarker.innerText = bets[id];

    updateHUD();
}

// ==========================================
// 4. SPIN & WIN LOGIC
// ==========================================
document.getElementById("spin-btn").addEventListener("click", () => {
    if (isSpinning || currentBetAmount === 0) return;
    
    isSpinning = true;
    const wheel = document.getElementById("roulette-wheel");
    const winningNumber = Math.floor(Math.random() * 37);
    
    // Calculate a large random rotation + offset for the winning number
    // Each pocket is approx 9.7 degrees (360/37)
    const extraSpins = 5 + Math.random() * 5;
    const totalRotation = (extraSpins * 360) + (winningNumber * (360 / 37));
    
    wheel.style.transform = `rotate(${totalRotation}deg)`;

    setTimeout(() => {
        determineWinners(winningNumber);
    }, 4100);
});

function determineWinners(winningNum) {
    isSpinning = false;
    let totalWin = 0;
    const isRed = redNumbers.includes(winningNum);
    const isEven = winningNum !== 0 && winningNum % 2 === 0;

    // Check every bet placed
    for (let id in bets) {
        let amount = bets[id];
        
        // 1. Straight Up (Single Number)
        if (id === winningNum.toString()) {
            totalWin += amount * 36;
        }
        // 2. Outside Bets
        else if (id === "red" && isRed) totalWin += amount * 2;
        else if (id === "black" && !isRed && winningNum !== 0) totalWin += amount * 2;
        else if (id === "even" && isEven) totalWin += amount * 2;
        else if (id === "odd" && !isEven && winningNum !== 0) totalWin += amount * 2;
    }

    if (totalWin > 0) {
        alert(`Number ${winningNum} hits! You won $${totalWin}!`);
        money += totalWin;
    } else {
        alert(`Number ${winningNum} hits. Better luck next time!`);
    }

    // Reset Table
    bets = {};
    currentBetAmount = 0;
    document.querySelectorAll(".table-chip").forEach(c => c.remove());
    localStorage.setItem("blackjack_money", money);
    updateHUD();
}

initTable();
updateHUD();