let money = parseInt(localStorage.getItem("blackjack_money")) || 5000;
let winStreak = 0;
let currentBet = 0;

const playerImg = document.getElementById("player-img");
const cpuImg = document.getElementById("cpu-img");
const playerBox = document.getElementById("player-hand");
const cpuBox = document.getElementById("cpu-hand");
const statusText = document.getElementById("status-text");
const resultOverlay = document.getElementById("result-overlay");

function updateUI() {
    document.getElementById("bankroll-display").innerHTML = `<img src="../blackjack/dollar.png" class="hud-icon"> $${money}`;
    document.getElementById("streak-display").innerHTML = `<img src="../blackjack/streak.png" class="hud-icon"> ${winStreak}`;
    document.getElementById("current-bet-val").innerText = currentBet;
    
    document.querySelectorAll(".choice-btn").forEach(btn => btn.disabled = (currentBet === 0));
}

// Betting Logic
document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
        let val = parseInt(chip.dataset.val);
        if (money >= val) {
            money -= val;
            currentBet += val;
            updateUI();
        }
    });
});

document.getElementById("clear-bet").addEventListener("click", () => {
    money += currentBet;
    currentBet = 0;
    updateUI();
});

// Animation and Round Logic
document.querySelectorAll(".choice-btn").forEach(btn => {
    btn.addEventListener("click", () => startThrow(btn.id));
});

function startThrow(playerChoice) {
    resultOverlay.classList.add("hidden");
    
    // Set both to Rock for the shake
    playerImg.src = "rock.png";
    cpuImg.src = "rock.png";

    // Add CSS Animation
    playerBox.classList.add("shaking");
    cpuBox.classList.add("shaking");

    // Disable buttons during animation
    document.querySelectorAll(".choice-btn").forEach(b => b.disabled = true);

    // Wait for the shake (1.5 seconds) then reveal
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
        money += currentBet;
    } else if (
        (playerChoice === "rock" && cpuChoice === "scissors") ||
        (playerChoice === "paper" && cpuChoice === "rock") ||
        (playerChoice === "scissors" && cpuChoice === "paper")
    ) {
        statusText.innerText = "YOU WIN!";
        money += (currentBet * 2);
        winStreak++;
    } else {
        statusText.innerText = "CPU WINS!";
        winStreak = 0;
    }

    resultOverlay.classList.remove("hidden");
    currentBet = 0;
    localStorage.setItem("blackjack_money", money);
    updateUI();
}

updateUI();