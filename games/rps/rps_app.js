// ==========================================
// 1. INITIALIZE CASINO OS
// ==========================================
SystemUI.init({
    gameName: "RPS ARENA",
    rules: `
        <ul style="text-align: left; line-height: 1.6; font-size: 0.95rem; margin-bottom: 20px; color: #ddd; padding-left: 20px;">
            <li><strong>The Basics:</strong> Rock crushes Scissors. Scissors cut Paper. Paper covers Rock.</li>
            <li><strong>Payouts:</strong> Beating the CPU pays 1:1 (Double your bet).</li>
            <li><strong>Ties:</strong> A tie results in a push (Bet returned).</li>
        </ul>
    `
});

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if(confirm("Reset your RPS win streak?")) {
        localStorage.removeItem("rps_streak");
        window.location.reload();
    }
});

// ==========================================
// 2. CORE LOGIC & OS BETTING
// ==========================================
let winStreak = parseInt(localStorage.getItem("rps_streak")) || 0;
let currentBet = 0;
let isAnimating = false;

const playerImg = document.getElementById("player-img");
const cpuImg = document.getElementById("cpu-img");
const playerBox = document.getElementById("player-hand");
const cpuBox = document.getElementById("cpu-hand");
const statusText = document.getElementById("status-text");
const resultOverlay = document.getElementById("result-overlay");

// Setup Universal Betting Rack
SystemUI.setupBetting("os-betting-rack", {
    onBet: function(val) {
        if (isAnimating) return;
        if (SystemUI.money >= val) { 
            SystemUI.money -= val;
            currentBet += val;
            updateUI();
        } else {
            alert("Not enough cash!");
        }
    },
    onClear: function() {
        if (isAnimating) return;
        SystemUI.money += currentBet; // Refund
        currentBet = 0;
        updateUI();
    }
});

function updateUI() {
    SystemUI.updateMoneyDisplay(); 
    SystemUI.updateBetDisplay(currentBet); // Updates OS bubble
    document.getElementById("streak-val").innerText = winStreak;
    
    // Disable play buttons if no bet placed
    document.querySelectorAll(".choice-btn").forEach(btn => btn.disabled = (currentBet === 0 || isAnimating));
}

// ==========================================
// 3. ANIMATION AND ROUND RESOLUTION
// ==========================================
document.querySelectorAll(".choice-btn").forEach(btn => {
    btn.addEventListener("click", () => startThrow(btn.id));
});

function startThrow(playerChoice) {
    if (currentBet === 0) return;
    
    isAnimating = true;
    resultOverlay.classList.add("hidden");
    
    playerImg.src = "rock.png";
    cpuImg.src = "rock.png";

    playerBox.classList.add("shaking");
    cpuBox.classList.add("shaking");

    updateUI(); 
    SystemUI.enableBetting(false); // OS visually grays out chips

    setTimeout(() => {
        playerBox.classList.remove("shaking");
        cpuBox.classList.remove("shaking");
        resolveGame(playerChoice);
    }, 1500);
}

function resolveGame(playerChoice) {
    const choices = ["rock", "paper", "scissors"];
    const cpuChoice = choices[Math.floor(Math.random() * 3)];
    
    playerImg.src = `${playerChoice}.png`;
    cpuImg.src = `${cpuChoice}.png`;

    if (playerChoice === cpuChoice) {
        statusText.innerText = "TIE!";
        SystemUI.money += currentBet; // Push
    } else if (
        (playerChoice === "rock" && cpuChoice === "scissors") ||
        (playerChoice === "paper" && cpuChoice === "rock") ||
        (playerChoice === "scissors" && cpuChoice === "paper")
    ) {
        statusText.innerText = "YOU WIN!";
        SystemUI.money += (currentBet * 2); // Payout
        winStreak++;
    } else {
        statusText.innerText = "CPU WINS!";
        winStreak = 0;
    }

    resultOverlay.classList.remove("hidden");
    currentBet = 0;
    isAnimating = false;
    
    localStorage.setItem("rps_streak", winStreak);
    updateUI();
    SystemUI.enableBetting(true); // OS re-enables chips
}

updateUI();