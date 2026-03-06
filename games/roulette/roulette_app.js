// ==========================================
// 1. INITIALIZE CASINO OS
// ==========================================
SystemUI.init({
    gameName: "ROULETTE",
    rules: `
        <ul style="text-align: left; line-height: 1.6; font-size: 0.95rem; margin-bottom: 20px; color: #ddd; padding-left: 20px;">
            <li><strong>Straight Up (1 Number):</strong> Pays 35 to 1.</li>
            <li><strong>Dozens (1st/2nd/3rd 12):</strong> Pays 2 to 1.</li>
            <li><strong>Outside Bets (Red/Black/Even/Odd):</strong> Pays 1 to 1.</li>
        </ul>
    `
});

// ==========================================
// 2. STATE & WHEEL CONFIG
// ==========================================
let currentTotalBet = 0;
let selectedChipAmount = 10;
let bets = {}; 
let isSpinning = false;
let currentRotation = 0; 
let ballRotation = 0; 

let calibrationOffset = 0; 

const wheelOrder = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

function updateUI() {
    SystemUI.updateMoneyDisplay();
    SystemUI.updateBetDisplay(currentTotalBet);
    document.getElementById("spin-btn").disabled = (currentTotalBet === 0 || isSpinning);
    SystemUI.enableBetting(!isSpinning);
}

// ==========================================
// 3. BUILD THE TABLE 
// ==========================================
function initTable() {
    const grid = document.getElementById("numbers-grid");
    const order = [3, 2, 1]; 
    
    const zeroCell = document.getElementById("zero-cell");
    if (zeroCell) zeroCell.addEventListener("click", () => placeBet("0", zeroCell));

    for (let col = 0; col < 12; col++) {
        for (let r = 0; r < 3; r++) {
            let num = order[r] + (col * 3);
            const cell = document.createElement("div");
            const isRed = redNumbers.includes(num);
            cell.className = `cell ${isRed ? 'red' : 'black'}`;
            cell.innerText = num;
            cell.dataset.num = num;
            cell.addEventListener("click", () => placeBet(num.toString(), cell));
            grid.appendChild(cell);
        }
    }
}

// ==========================================
// 4. OS BETTING INTEGRATION
// ==========================================
SystemUI.setupBetting("os-betting-rack", {
    onBet: function(val) {
        if (isSpinning) return;
        SystemUI.playSound('click'); // Selecting a chip just clicks
        selectedChipAmount = val; 
    },
    onClear: function() {
        if (isSpinning) return;
        SystemUI.money += currentTotalBet; 
        currentTotalBet = 0;
        bets = {};
        document.querySelectorAll(".board-chip-container").forEach(c => c.remove());
        updateUI();
    }
});

document.querySelectorAll(".bet-area").forEach(area => {
    area.addEventListener("click", () => placeBet(area.dataset.type, area));
});

function placeBet(id, element) {
    if (isSpinning) return;
    if (SystemUI.money < selectedChipAmount) return showToast("Not Enough Cash", "You don't have enough bankroll for that chip.");

    // Smart Audio: If bet already exists here, play stack sound. Else table sound.
    if (bets[id]) {
        SystemUI.playSound('chipStack');
    } else {
        SystemUI.playSound('chipTable');
    }

    SystemUI.money -= selectedChipAmount;
    currentTotalBet += selectedChipAmount;
    bets[id] = (bets[id] || 0) + selectedChipAmount;

    let chipMarker = element.querySelector(".board-chip-container");
    if (!chipMarker) {
        chipMarker = document.createElement("div");
        chipMarker.className = "board-chip-container";
        chipMarker.id = `stack-${id}`;
        element.appendChild(chipMarker);
    }
    
    SystemUI.renderTableStacks(bets[id], `stack-${id}`);
    updateUI();
}

let modalTimer;
function showToast(title, message) {
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-message").innerText = message;
  const overlay = document.getElementById("toast-modal");
  overlay.classList.remove("hidden");

  clearTimeout(modalTimer);
  modalTimer = setTimeout(() => { overlay.classList.add("hidden"); }, 3500);
}

document.getElementById("toast-modal").addEventListener("click", () => {
  document.getElementById("toast-modal").classList.add("hidden");
});

// ==========================================
// 6. PERFECT SPIN & BALL LOGIC
// ==========================================
document.getElementById("spin-btn").addEventListener("click", () => {
    if (isSpinning || currentTotalBet === 0) return;
    
    isSpinning = true;
    updateUI();
    
    // Trigger OS Roulette Sound!
    SystemUI.playSound('roulette');

    const wheel = document.getElementById("roulette-wheel");
    const ballTrack = document.getElementById("ball-track");
    const winningNumber = Math.floor(Math.random() * 37);
    
    const pocketIndex = wheelOrder.indexOf(winningNumber);
    const sliceAngle = 360 / 37;
    
    const targetAngle = 360 - (pocketIndex * sliceAngle) - calibrationOffset;
    const spinAmount = (360 * 7) + targetAngle - (currentRotation % 360);
    currentRotation += spinAmount;
    wheel.style.transform = `rotate(${currentRotation}deg)`;

    ballRotation -= (360 * 10);
    ballTrack.style.transform = `rotate(${ballRotation}deg)`;

    setTimeout(() => { determineWinners(winningNumber); }, 6100);
});

function determineWinners(winningNum) {
    let totalWin = 0;
    const isRed = redNumbers.includes(winningNum);
    const isEven = winningNum !== 0 && winningNum % 2 === 0;

    for (let id in bets) {
        let amount = bets[id];
        
        if (id === winningNum.toString()) totalWin += amount * 36;
        else if (id === "1st12" && winningNum >= 1 && winningNum <= 12) totalWin += amount * 3;
        else if (id === "2nd12" && winningNum >= 13 && winningNum <= 24) totalWin += amount * 3;
        else if (id === "3rd12" && winningNum >= 25 && winningNum <= 36) totalWin += amount * 3;
        else if (id === "red" && isRed) totalWin += amount * 2;
        else if (id === "black" && !isRed && winningNum !== 0) totalWin += amount * 2;
        else if (id === "even" && isEven) totalWin += amount * 2;
        else if (id === "odd" && !isEven && winningNum !== 0) totalWin += amount * 2;
    }

    if (totalWin > 0) {
        SystemUI.playSound('win');
        showToast(`Number ${winningNum}!`, `You won $${totalWin}!`);
        SystemUI.money += totalWin;
    } else {
        showToast(`Number ${winningNum}`, `Bank takes the board.`);
    }

    bets = {};
    currentTotalBet = 0;
    document.querySelectorAll(".board-chip-container").forEach(c => c.remove());
    isSpinning = false;
    updateUI();
}

initTable();
updateUI();