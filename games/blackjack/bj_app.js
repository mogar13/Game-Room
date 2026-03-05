let savedDifficulty = localStorage.getItem("blackjack_diff") || "17";

SystemUI.init({
    gameName: "BLACKJACK PRO",
    rules: `
        <ul style="text-align: left; line-height: 1.6; font-size: 0.95rem; margin-bottom: 20px; color: #ddd; padding-left: 20px;">
            <li><strong>Payouts:</strong> Standard wins pay 1:1. Natural Blackjack pays 3:2.</li>
            <li><strong>Double Down:</strong> Double your initial bet, receive ONE card, and automatically stand.</li>
            <li><strong>Insurance:</strong> If Dealer shows an Ace, insure for half your bet. Pays 2:1 if Dealer has Blackjack.</li>
        </ul>
    `,
    customToggles: `
        <div class="settings-group" style="text-align:left;">
            <label style="display:block; margin-bottom:5px; color:#bdc3c7;">Table Difficulty:</label>
            <select id="sys-difficulty" style="width:100%; padding:10px; border-radius:5px; border:1px solid #34495e; background:#2c3e50; color:white;">
                <option value="15">Easy ($2 Min)</option>
                <option value="17">Normal ($5 Min)</option>
                <option value="19">Hard ($10 Min)</option>
            </select>
        </div>
    `
});

document.getElementById("sys-difficulty").value = savedDifficulty;
document.getElementById("sys-difficulty").addEventListener("change", (e) => {
    savedDifficulty = e.target.value;
    localStorage.setItem("blackjack_diff", savedDifficulty);
    deck = []; 
    showToast("Difficulty Changed", "Rules updated for the next hand.");
    updateBetUI();
});

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if(confirm("Reset your Blackjack streak and difficulty?")) {
        localStorage.removeItem("blackjack_streak");
        localStorage.removeItem("blackjack_diff");
        window.location.reload();
    }
});


let playerHand = [];
let dealerHand = [];
let currentBet = 0;
let isGameOver = true;
let deck = [];
let winStreak = parseInt(localStorage.getItem("blackjack_streak")) || 0;

function updateStreakUI() { document.getElementById("streak-val").innerText = winStreak; }
updateStreakUI();

// Audio
const cardSound = new Audio("card-flip.mp3");
const winSound = new Audio("win.mp3");
const loseSound = new Audio("lose.mp3");
const shuffleSound = new Audio("shuffle.mp3");
const tieSound = new Audio("tie.mp3");

function playSfx(audioObj) {
    if (!SystemUI.isMuted) { audioObj.currentTime = 0; audioObj.play(); }
}

// OS BETTING INTEGRATION
SystemUI.setupBetting("os-betting-rack", {
    onBet: function(val) {
        if (!isGameOver) return;
        if (currentBet + val > SystemUI.money) {
            showToast("Not Enough Cash", "You don't have enough bankroll for that bet.");
            return;
        }
        currentBet += val;
        updateBetUI();
    },
    onClear: function() {
        if (!isGameOver) return;
        currentBet = 0;
        updateBetUI();
    }
});

function updateBetUI() {
    SystemUI.updateBetDisplay(currentBet);
    SystemUI.enableBetting(isGameOver); 
    
    let minBet = (savedDifficulty === "19") ? 10 : (savedDifficulty === "17" ? 5 : 2);
    const dealBtn = document.getElementById("deal-btn");
    
    if (currentBet < minBet) {
        dealBtn.disabled = true;
        dealBtn.innerText = `DEAL (Min $${minBet})`; 
    } else {
        dealBtn.disabled = false;
        dealBtn.innerText = `DEAL`;
    }
    
    renderTableChips();
}

function renderTableChips() {
    const potDisplay = document.getElementById("table-pot-display");
    
    if (currentBet === 0) {
        potDisplay.classList.add("hidden");
        SystemUI.renderTableStacks(0, "table-bet-chips"); // clears player
        if (document.getElementById("dealer-bet-chips")) SystemUI.renderTableStacks(0, "dealer-bet-chips"); // clears dealer
        return;
    }

    // Multiply by 2 to represent the actual total pot (Player bet + Dealer Match)
    potDisplay.innerText = `POT: $${currentBet * 2}`;
    potDisplay.classList.remove("hidden");

    SystemUI.renderTableStacks(currentBet, "table-bet-chips");
    if (document.getElementById("dealer-bet-chips")) {
        SystemUI.renderTableStacks(currentBet, "dealer-bet-chips");
    }
}


// Toast Modal
let modalTimer;
let resetPending = false;
function showToast(title, message, resetTableAfter = false) {
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-message").innerText = message;
  const overlay = document.getElementById("toast-modal");
  overlay.classList.remove("hidden");
  resetPending = resetTableAfter;

  clearTimeout(modalTimer);
  modalTimer = setTimeout(() => {
    overlay.classList.add("hidden");
    if (resetTableAfter) resetTableForBetting();
  }, 3500);
}
document.getElementById("toast-modal").addEventListener("click", () => {
  const overlay = document.getElementById("toast-modal");
  if (!overlay.classList.contains("hidden")) {
    clearTimeout(modalTimer);
    overlay.classList.add("hidden");
    if (resetPending) { resetTableForBetting(); resetPending = false; }
  }
});

function resetTableForBetting() {
  if (SystemUI.money <= 0) {
    SystemUI.money = 1000; 
    SystemUI.updateMoneyDisplay();
    showToast("Bankrupt!", "The casino pities you. Here is $1000 on the house.");
  }
  isGameOver = true;
  playerHand = [];
  dealerHand = [];
  currentBet = 0;
  updateBetUI();
  updateStreakUI();
  renderGame(); 
  document.getElementById("playing-controls").classList.add("hidden");
  document.getElementById("betting-controls").classList.remove("hidden");
}

const suits = ["♠", "♥", "♦", "♣"];
const ranks = [
  { name: "A", value: 11 }, { name: "2", value: 2 }, { name: "3", value: 3 },
  { name: "4", value: 4 }, { name: "5", value: 5 }, { name: "6", value: 6 },
  { name: "7", value: 7 }, { name: "8", value: 8 }, { name: "9", value: 9 },
  { name: "10", value: 10 }, { name: "J", value: 10 }, { name: "Q", value: 10 },
  { name: "K", value: 10 }
];

function createDeck(numDecks = 1) {
  deck = [];
  for (let i = 0; i < numDecks; i++) {
    for (let suit of suits) {
      for (let rank of ranks) { deck.push({ suit, name: rank.name, value: rank.value }); }
    }
  }
}

function shuffleDeck() {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function dealCard(hand) {
  hand.push(deck.pop());
  playSfx(cardSound);
}

function calculateScore(hand) {
  let score = 0, aceCount = 0;
  for (let card of hand) {
    score += card.value;
    if (card.name === "A") aceCount++;
  }
  while (score > 21 && aceCount > 0) { score -= 10; aceCount--; }
  return score;
}

document.getElementById("deal-btn").addEventListener("click", () => {
  SystemUI.money -= currentBet; 
  SystemUI.updateMoneyDisplay();
  
  isGameOver = false;
  updateBetUI(); // Turns chips gray
  playSfx(shuffleSound);

  document.getElementById("betting-controls").classList.add("hidden");
  document.getElementById("playing-controls").classList.remove("hidden");
  document.getElementById("hit-btn").disabled = false;
  document.getElementById("stand-btn").disabled = false;
  document.getElementById("double-btn").disabled = false;
  document.getElementById("insurance-btn").classList.add("hidden");

  let numDecks = (savedDifficulty === "19") ? 6 : (savedDifficulty === "17" ? 4 : 1);
  if (deck.length < 20) { createDeck(numDecks); shuffleDeck(); }

  dealCard(playerHand); dealCard(dealerHand);
  dealCard(playerHand); dealCard(dealerHand);
  renderGame();

  if (dealerHand[0].name === "A") document.getElementById("insurance-btn").classList.remove("hidden");
  if (calculateScore(playerHand) === 21) handleStand();
});

document.getElementById("hit-btn").addEventListener("click", () => {
  if (isGameOver) return;
  document.getElementById("insurance-btn").classList.add("hidden");
  document.getElementById("double-btn").disabled = true; 
  dealCard(playerHand);
  renderGame();
  
  if (calculateScore(playerHand) > 21) determineWinner();
  else if (calculateScore(playerHand) === 21) handleStand();
});

document.getElementById("stand-btn").addEventListener("click", handleStand);

function handleStand() {
  if (isGameOver) return;
  document.getElementById("insurance-btn").classList.add("hidden");
  const difficultyLimit = Number(savedDifficulty);
  let dealerScore = calculateScore(dealerHand);
  
  while (dealerScore < difficultyLimit) {
    dealCard(dealerHand);
    dealerScore = calculateScore(dealerHand);
  }
  determineWinner();
}

document.getElementById("double-btn").addEventListener("click", () => {
  if (isGameOver || playerHand.length > 2) return;
  if (SystemUI.money < currentBet) {
    showToast("Not enough cash", "You don't have enough to double down!");
    return;
  }
  
  document.getElementById("insurance-btn").classList.add("hidden");
  SystemUI.money -= currentBet;
  currentBet *= 2;
  SystemUI.updateMoneyDisplay();
  
  renderTableChips();
  dealCard(playerHand);
  renderGame();
  
  if (calculateScore(playerHand) > 21) determineWinner();
  else handleStand();
});

document.getElementById("insurance-btn").addEventListener("click", () => {
  if (isGameOver) return;
  const insBet = currentBet / 2;
  if (SystemUI.money < insBet) {
    showToast("Not enough cash", "You don't have enough for insurance!");
    return;
  }
  
  SystemUI.money -= insBet;
  SystemUI.updateMoneyDisplay();
  document.getElementById("insurance-btn").classList.add("hidden");
  
  if (calculateScore(dealerHand) === 21) {
    SystemUI.money += (insBet * 3); 
    SystemUI.updateMoneyDisplay();
    showToast("Insurance Paid!", `Dealer has Blackjack. You won $${insBet * 2}.`);
    setTimeout(handleStand, 2500);
  } else {
    showToast("Safe!", "Dealer does not have Blackjack.");
  }
});

function determineWinner() {
  isGameOver = true;
  document.getElementById("hit-btn").disabled = true;
  document.getElementById("stand-btn").disabled = true;
  document.getElementById("double-btn").disabled = true;
  renderGame(); 

  const pScore = calculateScore(playerHand);
  const dScore = calculateScore(dealerHand);
  const playerHasBlackjack = (pScore === 21 && playerHand.length === 2);
  const dealerHasBlackjack = (dScore === 21 && dealerHand.length === 2);

  let title = "", message = "";

  if (pScore > 21) {
    title = "Busted!"; message = `You went over 21. Lost $${currentBet}.`;
    winStreak = 0; playSfx(loseSound);
  } else if (playerHasBlackjack && !dealerHasBlackjack) {
    title = "Blackjack!"; message = `Natural 21! Won $${currentBet * 1.5}!`;
    SystemUI.money += (currentBet * 2.5); winStreak++; playSfx(winSound);
  } else if (dScore > 21 || pScore > dScore) {
    title = "You Win!"; message = `Beat the dealer! Won $${currentBet * 2}!`;
    SystemUI.money += (currentBet * 2); winStreak++; playSfx(winSound);
  } else if (dScore > pScore) {
    title = "Dealer Wins!"; message = `Dealer had a higher score. Lost $${currentBet}.`;
    winStreak = 0; playSfx(loseSound);
  } else {
    title = "Push (Tie)!"; message = "It's a tie. Bet returned.";
    SystemUI.money += currentBet; winStreak = 0; playSfx(tieSound);
  }

  SystemUI.updateMoneyDisplay();
  localStorage.setItem("blackjack_streak", winStreak);
  setTimeout(() => { showToast(title, message, true); }, 1000);
}

function getCardImage(card) {
  const suitMap = { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" };
  return `card${suitMap[card.suit]}${card.name}.png`;
}

function createCardElement(card, isHidden) {
  const cardEl = document.createElement("div");
  cardEl.classList.add("card");
  if (isHidden) {
    cardEl.classList.add("hidden-card");
    return cardEl;
  }
  let imgFile = getCardImage(card);
  cardEl.innerHTML = `<img src="${imgFile}" style="width: 100%; height: 100%; border-radius: 6px; display: block;">`;
  cardEl.style.border = "none"; cardEl.style.backgroundColor = "transparent";
  return cardEl;
}

function renderGame() {
  const playerEl = document.getElementById("player-cards");
  const dealerEl = document.getElementById("dealer-cards");
  const pBubble = document.getElementById("player-score");
  const dBubble = document.getElementById("dealer-score");

  playerEl.innerHTML = ""; dealerEl.innerHTML = "";

  playerHand.forEach((card) => playerEl.appendChild(createCardElement(card, false)));
  dealerHand.forEach((card, index) => {
    let isHidden = (index === 1 && !isGameOver);
    dealerEl.appendChild(createCardElement(card, isHidden));
  });

  if (playerHand.length > 0) {
    pBubble.innerText = calculateScore(playerHand); pBubble.classList.remove("hidden");
  } else { pBubble.classList.add("hidden"); }

  if (dealerHand.length > 0) {
    if (isGameOver) {
      dBubble.innerText = calculateScore(dealerHand); dBubble.classList.remove("hidden");
    } else { dBubble.classList.add("hidden"); }
  } else { dBubble.classList.add("hidden"); }
}

updateBetUI();