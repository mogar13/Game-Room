// ==========================================
// 1. INITIALIZE CASINO OS
// ==========================================
let difficulty = "normal";

SystemUI.init({
    gameName: "MEMORY MATCH",
    rules: `
        <ul style="text-align: left; line-height: 1.6; font-size: 0.95rem; margin-bottom: 20px; color: #ddd; padding-left: 20px;">
            <li><strong>How to play:</strong> Flip cards to find matching pairs. Memorize their positions!</li>
            <li><strong>Payouts:</strong> Find all pairs to win the jackpot.</li>
            <li><strong>Difficulty:</strong> Higher difficulties cost more to buy-in, but yield massive rewards.</li>
        </ul>
    `,
    customToggles: `
        <div class="settings-group" style="text-align:left;">
            <label style="display:block; margin-bottom:5px; color:#bdc3c7;">Grid Difficulty:</label>
            <select id="sys-diff-select" style="width:100%; padding:10px; border-radius:5px; border:1px solid #34495e; background:#2c3e50; color:white;">
                <option value="easy">Easy (2x4 - $50 Buy-in)</option>
                <option value="normal" selected>Normal (4x4 - $100 Buy-in)</option>
                <option value="hard">Hard (6x6 - $250 Buy-in)</option>
            </select>
        </div>
    `
});

document.getElementById("sys-diff-select").addEventListener("change", (e) => {
    difficulty = e.target.value;
    const cost = difficulty === "easy" ? 50 : (difficulty === "normal" ? 100 : 250);
    document.getElementById("start-game-btn").innerText = `BUY IN ($${cost})`;
    document.getElementById("sys-modal").classList.add("sys-hidden");
});

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    SystemUI.playSound('click');
    alert("Memory Match does not track persistent stats yet!");
});

// Toast Modal logic
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
// 2. CORE GAME LOGIC
// ==========================================
let moves = 0;
let firstCard = null;
let secondCard = null;
let isLocking = false;
let matchesFound = 0;

const totalIcons = 18; 

function updateUI() {
    SystemUI.updateMoneyDisplay(); 
    document.getElementById("move-count").innerText = moves;
}

function initGame() {
    const configs = {
        "easy": { pairs: 4, cols: "easy", cost: 50 },
        "normal": { pairs: 8, cols: "normal", cost: 100 },
        "hard": { pairs: 18, cols: "hard", cost: 250 }
    };
    const config = configs[difficulty];

    if (SystemUI.money < config.cost) {
        showToast("Insufficient Funds", "You don't have enough cash for this difficulty!");
        return;
    }
    
    SystemUI.playSound('shuffle'); // Shuffle sound when buying in!
    SystemUI.money -= config.cost;
    moves = 0;
    matchesFound = 0;
    updateUI();

    const grid = document.getElementById("memory-grid");
    grid.innerHTML = "";
    grid.className = config.cols;

    let icons = Array.from({length: totalIcons}, (_, i) => i + 1);
    icons.sort(() => Math.random() - 0.5);
    let gameIcons = icons.slice(0, config.pairs);
    let cardSet = [...gameIcons, ...gameIcons];
    cardSet.sort(() => Math.random() - 0.5);

    cardSet.forEach(num => {
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.icon = num;
        card.innerHTML = `
            <div class="card-face card-front"></div>
            <div class="card-face card-back"><img src="../../system/images/icons/icon${num}.png"></div>
        `;
        card.addEventListener("click", () => flipCard(card));
        grid.appendChild(card);
    });
}

function flipCard(card) {
    if (isLocking || card === firstCard || card.classList.contains("matched")) return;
    
    SystemUI.playSound('card'); // Card slide sound!
    card.classList.add("flipped");

    if (!firstCard) {
        firstCard = card;
    } else {
        secondCard = card;
        moves++;
        updateUI();
        checkMatch();
    }
}

function checkMatch() {
    isLocking = true;
    let isMatch = firstCard.dataset.icon === secondCard.dataset.icon;

    if (isMatch) {
        setTimeout(() => {
            firstCard.classList.add("matched");
            secondCard.classList.add("matched");
            matchesFound++;
            resetTurn();
            
            const winTarget = difficulty === "easy" ? 4 : (difficulty === "normal" ? 8 : 18);
            if (matchesFound === winTarget) endGame();
        }, 500);
    } else {
        setTimeout(() => {
            SystemUI.playSound('card'); // Sound when flipping back over
            firstCard.classList.remove("flipped");
            secondCard.classList.remove("flipped");
            resetTurn();
        }, 1200);
    }
}

function resetTurn() {
    firstCard = null; secondCard = null; isLocking = false;
}

function endGame() {
    const baseWin = difficulty === "easy" ? 100 : (difficulty === "normal" ? 300 : 1000);
    
    SystemUI.money += baseWin;
    SystemUI.playSound('win'); // OS Win Sound!
    
    showToast("Jackpot!", `You found all pairs and won $${baseWin} in ${moves} moves!`);
    updateUI();
}

document.getElementById("start-game-btn").addEventListener("click", initGame);
updateUI();