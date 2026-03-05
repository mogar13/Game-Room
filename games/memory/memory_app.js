let money = parseInt(localStorage.getItem("blackjack_money")) || 5000;
let moves = 0;
let firstCard = null;
let secondCard = null;
let isLocking = false;
let matchesFound = 0;
let difficulty = "normal";

// Total unique icons available (1-18)
const totalIcons = 18;

function updateHUD() {
    document.getElementById("bankroll-display").innerHTML = `<img src="../blackjack/dollar.png" class="hud-icon"> $${money}`;
    document.getElementById("move-count").innerText = moves;
}

// Settings Logic
document.getElementById("settings-btn").addEventListener("click", () => document.getElementById("settings-modal").classList.remove("hidden"));
document.getElementById("close-settings-btn").addEventListener("click", () => {
    difficulty = document.getElementById("difficulty-select").value;
    document.getElementById("settings-modal").classList.add("hidden");
    const cost = difficulty === "easy" ? 50 : (difficulty === "normal" ? 100 : 250);
    document.getElementById("start-game-btn").innerText = `BUY IN ($${cost})`;
});

function initGame() {
    const configs = {
        "easy": { pairs: 4, cols: "easy", cost: 50 },
        "normal": { pairs: 8, cols: "normal", cost: 100 },
        "hard": { pairs: 18, cols: "hard", cost: 250 }
    };
    const config = configs[difficulty];

    if (money < config.cost) return alert("Insufficient funds for this difficulty!");
    
    money -= config.cost;
    moves = 0;
    matchesFound = 0;
    updateHUD();

    const grid = document.getElementById("memory-grid");
    grid.innerHTML = "";
    grid.className = config.cols;

    // Select random icons and double them
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
            <div class="card-face card-back"><img src="icon${num}.png"></div>
        `;
        card.addEventListener("click", () => flipCard(card));
        grid.appendChild(card);
    });
}

function flipCard(card) {
    if (isLocking || card === firstCard || card.classList.contains("matched")) return;
    card.classList.add("flipped");

    if (!firstCard) {
        firstCard = card;
    } else {
        secondCard = card;
        moves++;
        updateHUD();
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
            // Check win condition based on difficulty pairs
            const winTarget = difficulty === "easy" ? 4 : (difficulty === "normal" ? 8 : 18);
            if (matchesFound === winTarget) endGame();
        }, 500);
    } else {
        // 1.2-second delay to memorize if not a match
        setTimeout(() => {
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
    // Multiplier based on performance and difficulty
    const baseWin = difficulty === "easy" ? 100 : (difficulty === "normal" ? 300 : 1000);
    money += baseWin;
    localStorage.setItem("blackjack_money", money);
    alert(`Jackpot! You won $${baseWin}`);
    updateHUD();
}

document.getElementById("start-game-btn").addEventListener("click", initGame);
updateHUD();