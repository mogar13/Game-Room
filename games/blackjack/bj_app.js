// ==========================================
// 1. INITIAL STATE & MEMORY
// ==========================================
let playerHand = [];
let dealerHand = [];
let currentBet = 0;
let isGameOver = true;
let deck = [];

// Load from local storage (100% Retained)
let money = parseInt(localStorage.getItem("blackjack_money")) || 100;
let playerName = localStorage.getItem("blackjack_name") || "Player";
let savedDifficulty = localStorage.getItem("blackjack_diff") || "17";
let winStreak = parseInt(localStorage.getItem("blackjack_streak")) || 0;

// ==========================================
// 2. AUDIO SETUP (100% Retained)
// ==========================================
const cardSound = new Audio("card-flip.mp3");
const winSound = new Audio("win.mp3");
const loseSound = new Audio("lose.mp3");
const shuffleSound = new Audio("shuffle.mp3");
const tieSound = new Audio("tie.mp3");
let isMuted = false;

// ==========================================
// 3. UI INITIALIZATION & HUD
// ==========================================
function updateHUD() {
  document.getElementById("bankroll-display").innerText = `💰 $${money}`;
  document.getElementById("streak-display").innerText = `🔥 ${winStreak}`;
  document.getElementById("player-name-input").value = playerName;
  document.getElementById("difficulty").value = savedDifficulty;
}
updateHUD();

// ==========================================
// 4. MODALS & SETTINGS
// ==========================================
// Settings Modal
document.getElementById("settings-btn").addEventListener("click", () => {
  document.getElementById("settings-modal").classList.remove("hidden");
});

document.getElementById("close-settings-btn").addEventListener("click", () => {
  // Save settings when closing
  playerName = document.getElementById("player-name-input").value || "Player";
  let newDiff = document.getElementById("difficulty").value;
  
  if (newDiff !== savedDifficulty) {
    savedDifficulty = newDiff;
    deck = []; // Force deck shuffle for new difficulty rules
    showToast("Difficulty Changed", "Rules updated for the next hand.");
  }
  
  localStorage.setItem("blackjack_name", playerName);
  localStorage.setItem("blackjack_diff", savedDifficulty);
  document.getElementById("settings-modal").classList.add("hidden");
  updateBetUI();
});

// Rules Modal
document.getElementById("rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.remove("hidden");
});
document.getElementById("close-rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.add("hidden");
});

// Toast (Auto-dismissing message)
let modalTimer;
function showToast(title, message, resetTableAfter = false) {
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-message").innerText = message;
  const overlay = document.getElementById("toast-modal");
  overlay.classList.remove("hidden");

  clearTimeout(modalTimer);
  modalTimer = setTimeout(() => {
    overlay.classList.add("hidden");
    if (resetTableAfter) resetTableForBetting();
  }, 3500);
}

// System Buttons
document.getElementById("mute-btn").addEventListener("click", () => {
  isMuted = !isMuted;
  document.getElementById("mute-btn").innerText = isMuted ? "🔇 Unmute" : "🔊 Mute";
  cardSound.muted = winSound.muted = loseSound.muted = shuffleSound.muted = tieSound.muted = isMuted;
});

document.getElementById("reset-btn").addEventListener("click", () => {
  if(confirm("Wipe all data and start fresh?")) {
    localStorage.clear();
    window.location.reload();
  }
});

// ==========================================
// 5. BETTING PHASE (The Chips)
// ==========================================
function updateBetUI() {
  document.getElementById("current-bet-text").innerText = `Bet: $${currentBet}`;
  let minBet = (savedDifficulty === "19") ? 10 : (savedDifficulty === "17" ? 5 : 2);
  document.getElementById("deal-btn").disabled = (currentBet < minBet);
}

document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    if (!isGameOver) return; // Can't bet while playing
    let val = parseInt(chip.getAttribute("data-val"));
    if (currentBet + val > money) {
      showToast("Not Enough Cash", "You don't have enough bankroll for that bet.");
      return;
    }
    currentBet += val;
    updateBetUI();
  });
});

document.getElementById("clear-bet-btn").addEventListener("click", () => {
  if (!isGameOver) return;
  currentBet = 0;
  updateBetUI();
});

function resetTableForBetting() {
  if (money <= 0) {
    money = 100;
    showToast("Bankrupt!", "The casino pities you. Here is $100 on the house.");
  }
  
  isGameOver = true;
  playerHand = [];
  dealerHand = [];
  currentBet = 0;
  updateBetUI();
  updateHUD();
  renderGame(); // Clears the felt
  
  // Swap UI back to chips
  document.getElementById("playing-controls").classList.add("hidden");
  document.getElementById("betting-controls").classList.remove("hidden");
}

// ==========================================
// 6. CORE GAME & DECK LOGIC (100% Retained)
// ==========================================
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
  cardSound.play();
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

// ==========================================
// 7. PLAYING PHASE (Actions)
// ==========================================
document.getElementById("deal-btn").addEventListener("click", () => {
  money -= currentBet; // Deduct the bet
  updateHUD();
  isGameOver = false;
  shuffleSound.play();

  // Swap UI to Action Buttons
  document.getElementById("betting-controls").classList.add("hidden");
  document.getElementById("playing-controls").classList.remove("hidden");
  document.getElementById("hit-btn").disabled = false;
  document.getElementById("stand-btn").disabled = false;
  document.getElementById("double-btn").disabled = false;
  document.getElementById("insurance-btn").classList.add("hidden");

  // Deck Management based on Difficulty
  let numDecks = (savedDifficulty === "19") ? 6 : (savedDifficulty === "17" ? 4 : 1);
  if (deck.length < 20) {
    createDeck(numDecks);
    shuffleDeck();
  }

  // Deal Initial Cards
  dealCard(playerHand); dealCard(dealerHand);
  dealCard(playerHand); dealCard(dealerHand);
  renderGame();

  // Insurance Check
  if (dealerHand[0].name === "A") {
    document.getElementById("insurance-btn").classList.remove("hidden");
  }

  // Auto-Blackjack Check
  if (calculateScore(playerHand) === 21) {
    handleStand();
  }
});

document.getElementById("hit-btn").addEventListener("click", () => {
  if (isGameOver) return;
  document.getElementById("insurance-btn").classList.add("hidden");
  document.getElementById("double-btn").disabled = true; // Can only double on first 2 cards
  
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
  if (money < currentBet) {
    showToast("Not enough cash", "You don't have enough to double down!");
    return;
  }
  
  document.getElementById("insurance-btn").classList.add("hidden");
  money -= currentBet;
  currentBet *= 2;
  updateHUD();
  
  dealCard(playerHand);
  renderGame();
  
  if (calculateScore(playerHand) > 21) determineWinner();
  else handleStand();
});

document.getElementById("insurance-btn").addEventListener("click", () => {
  if (isGameOver) return;
  const insBet = currentBet / 2;
  if (money < insBet) {
    showToast("Not enough cash", "You don't have enough for insurance!");
    return;
  }
  
  money -= insBet;
  updateHUD();
  document.getElementById("insurance-btn").classList.add("hidden");
  
  if (calculateScore(dealerHand) === 21) {
    money += (insBet * 3); 
    updateHUD();
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

  renderGame(); // Reveals dealer's hidden card

  const pScore = calculateScore(playerHand);
  const dScore = calculateScore(dealerHand);
  const playerHasBlackjack = (pScore === 21 && playerHand.length === 2);
  const dealerHasBlackjack = (dScore === 21 && dealerHand.length === 2);

  let title = "", message = "";

  if (pScore > 21) {
    title = "Busted!"; 
    message = `You went over 21. Lost $${currentBet}.`;
    winStreak = 0;
    loseSound.play();
  } else if (playerHasBlackjack && !dealerHasBlackjack) {
    title = "Blackjack!"; 
    message = `Natural 21! Won $${currentBet * 1.5}!`;
    money += (currentBet * 2.5);
    winStreak++;
    winSound.play();
  } else if (dScore > 21 || pScore > dScore) {
    title = "You Win!"; 
    message = `Beat the dealer! Won $${currentBet * 2}!`;
    money += (currentBet * 2);
    winStreak++;
    winSound.play();
  } else if (dScore > pScore) {
    title = "Dealer Wins!"; 
    message = `Dealer had a higher score. Lost $${currentBet}.`;
    winStreak = 0;
    loseSound.play();
  } else {
    title = "Push (Tie)!"; 
    message = "It's a tie. Bet returned.";
    money += currentBet;
    winStreak = 0;
    tieSound.play();
  }

  localStorage.setItem("blackjack_money", money);
  localStorage.setItem("blackjack_streak", winStreak);
  
  // Wait a split second so the player can see the cards before the toast covers it
  setTimeout(() => {
    showToast(title, message, true); // 'true' tells it to reset to Betting Phase after closing
  }, 1000);
}

// ==========================================
// 8. RENDERING CARDS & BUBBLES
// ==========================================
function renderGame() {
  const playerEl = document.getElementById("player-cards");
  const dealerEl = document.getElementById("dealer-cards");
  const pBubble = document.getElementById("player-score");
  const dBubble = document.getElementById("dealer-score");

  playerEl.innerHTML = "";
  dealerEl.innerHTML = "";

  playerHand.forEach((card, index) => {
    const cardEl = document.createElement("div");
    cardEl.classList.add("card");
    if (card.suit === "♥" || card.suit === "♦") cardEl.classList.add("red");
    cardEl.innerText = card.name + card.suit;
    playerEl.appendChild(cardEl);
  });

  dealerHand.forEach((card, index) => {
    const cardEl = document.createElement("div");
    cardEl.classList.add("card");
    if (index === 1 && !isGameOver) {
      cardEl.classList.add("hidden-card");
    } else {
      if (card.suit === "♥" || card.suit === "♦") cardEl.classList.add("red");
      cardEl.innerText = card.name + card.suit;
    }
    dealerEl.appendChild(cardEl);
  });

  // Update Score Bubbles
  if (playerHand.length > 0) {
    pBubble.innerText = calculateScore(playerHand);
    pBubble.classList.remove("hidden");
  } else {
    pBubble.classList.add("hidden");
  }

  if (dealerHand.length > 0) {
    if (isGameOver) {
      dBubble.innerText = calculateScore(dealerHand);
    } else {
      // Show only the visible card's value for the dealer
      dBubble.innerText = dealerHand[0].value === 11 ? 11 : dealerHand[0].value;
    }
    dBubble.classList.remove("hidden");
  } else {
    dBubble.classList.add("hidden");
  }
}

// Initialize the first view
updateBetUI();