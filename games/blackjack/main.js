// 1. Initial State & Memory
let playerHand = [];
let dealerHand = [];
let currentBet = 0;
let isGameOver = true;

// Load from local storage
let money = parseInt(localStorage.getItem("blackjack_money")) || 100;
let playerName = localStorage.getItem("blackjack_name") || "Player";
let savedDifficulty = localStorage.getItem("blackjack_diff") || "17";
let winStreak = parseInt(localStorage.getItem("blackjack_streak")) || 0;

// 2. Audio Setup
const cardSound = new Audio("card-flip.mp3");
const winSound = new Audio("win.mp3");
const loseSound = new Audio("lose.mp3");
const shuffleSound = new Audio("shuffle.mp3");
const tieSound = new Audio("tie.mp3");

// 3. UI Setup on Load
document.getElementById("player-name-input").value = playerName;
document.getElementById("player-name-display").innerText = playerName;
document.getElementById("difficulty").value = savedDifficulty;
document.getElementById("bankroll-display").innerText = "Bankroll: $" + money;
document.getElementById("win-streak-display").innerText = "Streak: " + winStreak;
updateBetMinimum();

// Modal Functions (Updated to Auto-Dismiss Toast)
let modalTimer; // Variable to keep track of the timer

function showModal(title, message) {
  document.getElementById("modal-title").innerText = title;
  document.getElementById("modal-message").innerText = message;
  const overlay = document.getElementById("modal-overlay");
  
  overlay.classList.remove("hidden");

  // Clear any existing timer so they don't overlap if triggered quickly
  clearTimeout(modalTimer);
  
  // Auto-hide the modal after 3 seconds (3000 milliseconds)
  modalTimer = setTimeout(() => {
    overlay.classList.add("hidden");
  }, 3000);
}

function updateBetMinimum() {
  const diff = document.getElementById("difficulty").value;
  const betInp = document.getElementById("bet-input");
  betInp.value = (diff === "19") ? 10 : (diff === "17" ? 5 : 2);
}

// Transaction Log Helper Function
function logTransaction(message, type) {
  const logList = document.getElementById("log-list");
  const li = document.createElement("li");
  li.innerText = message;
  if (type) li.classList.add(type);
  logList.appendChild(li);
  
  // Auto-scroll to the bottom of the log box
  const logBox = document.getElementById("transaction-log");
  logBox.scrollTop = logBox.scrollHeight;
}

// 4. Deck Logic
const suits = ["♠", "♥", "♦", "♣"];
const ranks = [
  { name: "A", value: 11 }, { name: "2", value: 2 }, { name: "3", value: 3 },
  { name: "4", value: 4 }, { name: "5", value: 5 }, { name: "6", value: 6 },
  { name: "7", value: 7 }, { name: "8", value: 8 }, { name: "9", value: 9 },
  { name: "10", value: 10 }, { name: "J", value: 10 }, { name: "Q", value: 10 },
  { name: "K", value: 10 }
];
let deck = [];

function createDeck(numDecks = 1) {
  deck = [];
  for (let i = 0; i < numDecks; i++) {
    for (let suit of suits) {
      for (let rank of ranks) {
        deck.push({ suit: suit, name: rank.name, value: rank.value });
      }
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
  const card = deck.pop();
  hand.push(card);
  cardSound.play();
}

// 5. Core Game Flow
function startNewGame() {
  const betInput = document.getElementById("bet-input");
  const selectedBet = parseInt(betInput.value);
  const difficulty = document.getElementById("difficulty").value;
  
  let minBet = (difficulty === "19") ? 10 : (difficulty === "17" ? 5 : 2);
  
  if (selectedBet < minBet) {
    showModal("Invalid Bet", `Minimum bet for this difficulty is $${minBet}`);
    return;
  }
  if (selectedBet > money) {
    showModal("Not Enough Cash", "You don't have enough money for that bet!");
    return;
  }

  // Deduct bet and update Pot
  currentBet = selectedBet;
  money -= currentBet;
  localStorage.setItem("blackjack_money", money);
  
  // LOG: Dealing hand
  logTransaction(`Dealt new hand. Bet: $${currentBet}`, "log-info");
  
  document.getElementById("pot-display").innerText = "Pot: $" + currentBet;
  document.getElementById("bankroll-display").innerText = "Bankroll: $" + money;
  
  isGameOver = false;
  document.getElementById("hit").disabled = false;
  document.getElementById("stand").disabled = false;
  document.getElementById("double").disabled = false;
  document.getElementById("insurance").disabled = true;
  document.getElementById("restart").innerText = "Deal Cards";

  // Check Deck size and recreate based on difficulty
  let numDecks = (difficulty === "19") ? 6 : (difficulty === "17" ? 4 : 1);
  if (deck.length < 20) {
    createDeck(numDecks);
    shuffleDeck();
  }

  playerHand = [];
  dealerHand = [];

  dealCard(playerHand);
  dealCard(dealerHand);
  dealCard(playerHand);
  dealCard(dealerHand);

  renderGame();
  
  if (dealerHand[0].name === "A") {
    document.getElementById("insurance").disabled = false;
  }

  // Auto-check for Blackjack off the deal
  if (calculateScore(playerHand) === 21) {
    handleStand();
  }
}

function calculateScore(hand) {
  let score = 0;
  let aceCount = 0;
  for (let card of hand) {
    score += card.value;
    if (card.name === "A") aceCount++;
  }
  while (score > 21 && aceCount > 0) {
    score -= 10;
    aceCount--;
  }
  return score;
}

function handleStand() {
  if (isGameOver) return;
  document.getElementById("insurance").disabled = true;
  const difficultyLimit = Number(document.getElementById("difficulty").value);
  let dealerScore = calculateScore(dealerHand);
  
  while (dealerScore < difficultyLimit) {
    dealCard(dealerHand);
    dealerScore = calculateScore(dealerHand);
  }
  determineWinner();
}

function determineWinner() {
  isGameOver = true;
  document.getElementById("hit").disabled = true;
  document.getElementById("stand").disabled = true;
  document.getElementById("double").disabled = true;
  document.getElementById("insurance").disabled = true;

  renderGame(); // Re-render to show hidden dealer card

  const pScore = calculateScore(playerHand);
  const dScore = calculateScore(dealerHand);

  const playerHasBlackjack = (pScore === 21 && playerHand.length === 2);
  const dealerHasBlackjack = (dScore === 21 && dealerHand.length === 2);

  let title = "";
  let message = "";

  if (pScore > 21) {
    title = "Busted!"; 
    message = `You went over 21. You lost $${currentBet}.`;
    winStreak = 0;
    logTransaction(`Busted. Lost $${currentBet}.`, "log-lose");
    loseSound.play();
  } else if (playerHasBlackjack && !dealerHasBlackjack) {
    title = "Blackjack!"; 
    message = `Natural 21! You won $${currentBet * 1.5}!`;
    money += (currentBet * 2.5);
    winStreak++;
    logTransaction(`Blackjack! Won $${currentBet * 1.5}.`, "log-win");
    winSound.play();
  } else if (dScore > 21 || pScore > dScore) {
    title = "You Win!"; 
    message = `You beat the dealer and won $${currentBet * 2}!`;
    money += (currentBet * 2);
    winStreak++;
    logTransaction(`You win! Won $${currentBet}.`, "log-win");
    winSound.play();
  } else if (dScore > pScore) {
    title = "Dealer Wins!"; 
    message = `The dealer had a higher score. You lost $${currentBet}.`;
    winStreak = 0;
    logTransaction(`Dealer wins. Lost $${currentBet}.`, "log-lose");
    loseSound.play();
  } else {
    title = "Push (Tie)!"; 
    message = "It's a tie. Your bet has been returned.";
    money += currentBet;
    winStreak = 0;
    logTransaction(`Push (Tie). Bet returned.`, "log-info");
    tieSound.play();
  }

  currentBet = 0;
  localStorage.setItem("blackjack_money", money);
  localStorage.setItem("blackjack_streak", winStreak);
  document.getElementById("bankroll-display").innerText = "Bankroll: $" + money;
  document.getElementById("pot-display").innerText = "Pot: $0";
  document.getElementById("win-streak-display").innerText = "Streak: " + winStreak;

  if (money <= 0) {
    document.getElementById("restart").innerText = "Try Again ($100)";
  }

  // Slight delay before modal so you can see the cards first
  setTimeout(() => {
    showModal(title, message);
  }, 400); 
}

// 6. UI Rendering
function renderGame() {
  const playerEl = document.getElementById("player-cards");
  const dealerEl = document.getElementById("dealer-cards");
  playerEl.innerHTML = "";
  dealerEl.innerHTML = "";

  playerHand.forEach((card, index) => {
    const cardEl = document.createElement("div");
    cardEl.classList.add("card");
    if (card.suit === "♥" || card.suit === "♦") cardEl.classList.add("red");
    cardEl.innerText = card.name + card.suit;
    playerEl.appendChild(cardEl);

    setTimeout(() => {
      cardEl.classList.add("show");
    }, 10 + (index * 50));
  });

  dealerHand.forEach((card, index) => {
    const cardEl = document.createElement("div");
    cardEl.classList.add("card");
    if (index === 1 && !isGameOver) {
      cardEl.classList.add("hidden");
      cardEl.innerText = "?";
    } else {
      if (card.suit === "♥" || card.suit === "♦") cardEl.classList.add("red");
      cardEl.innerText = card.name + card.suit;
    }
    dealerEl.appendChild(cardEl);

    setTimeout(() => {
      cardEl.classList.add("show");
    }, 10 + (index * 50));
  });

  document.getElementById("player-score").innerText = "Score: " + calculateScore(playerHand);
  document.getElementById("dealer-score").innerText = isGameOver ? "Score: " + calculateScore(dealerHand) : "Score: ???";
  document.getElementById("deck-count").innerText = "Cards: " + deck.length;
}

// 7. Event Listeners
document.getElementById("restart").addEventListener("click", () => {
  if (money <= 0) {
    money = 100;
    localStorage.setItem("blackjack_money", money);
    document.getElementById("bankroll-display").innerText = "Bankroll: $100";
    
    winStreak = 0;
    localStorage.setItem("blackjack_streak", winStreak);
    document.getElementById("win-streak-display").innerText = "Streak: " + winStreak;
  }
  shuffleSound.play();
  startNewGame();
});

document.getElementById("hit").addEventListener("click", () => {
  if (isGameOver) return;
  document.getElementById("insurance").disabled = true;
  dealCard(playerHand);
  renderGame();
  
  if (calculateScore(playerHand) > 21) {
    determineWinner();
  } else if (calculateScore(playerHand) === 21) {
    handleStand();
  }
});

document.getElementById("stand").addEventListener("click", handleStand);

document.getElementById("double").addEventListener("click", () => {
  if (isGameOver || playerHand.length > 2) return;
  if (money < currentBet) {
    showModal("Not enough cash", "You don't have enough money to double your bet!");
    return;
  }
  
  document.getElementById("insurance").disabled = true;
  money -= currentBet;
  currentBet *= 2;
  logTransaction(`Doubled down! Total bet is now $${currentBet}.`, "log-info");
  
  document.getElementById("pot-display").innerText = "Pot: $" + currentBet;
  document.getElementById("bankroll-display").innerText = "Bankroll: $" + money;
  
  dealCard(playerHand);
  renderGame();
  
  if (calculateScore(playerHand) > 21) determineWinner();
  else handleStand();
});

document.getElementById("insurance").addEventListener("click", () => {
  if (isGameOver) return;
  const insBet = currentBet / 2;
  if (money < insBet) {
    showModal("Not enough cash", "You don't have enough money for insurance!");
    return;
  }
  
  money -= insBet;
  document.getElementById("bankroll-display").innerText = "Bankroll: $" + money;
  document.getElementById("insurance").disabled = true;
  
  logTransaction(`Bought Insurance for $${insBet}.`, "log-info");
  
  if (calculateScore(dealerHand) === 21) {
    money += (insBet * 3); 
    localStorage.setItem("blackjack_money", money);
    document.getElementById("bankroll-display").innerText = "Bankroll: $" + money;
    showModal("Insurance Paid!", `Dealer has Blackjack. You won $${insBet * 2}.`);
    
    logTransaction(`Insurance paid! Won $${insBet * 2}.`, "log-win");
    
    // Proceed to end the game after giving them a moment to read the modal
    setTimeout(() => {
      handleStand();
    }, 3000);
  } else {
    showModal("Safe!", "Dealer does not have Blackjack.");
  }
});

document.getElementById("save-name").addEventListener("click", () => {
  const nameInput = document.getElementById("player-name-input").value;
  playerName = nameInput || "Player";
  document.getElementById("player-name-display").innerText = playerName; 
  localStorage.setItem("blackjack_name", playerName);
  showModal("Settings Saved", `Your name is now ${playerName}.`);
});

document.getElementById("difficulty").addEventListener("change", (e) => {
  const diff = e.target.value;
  localStorage.setItem("blackjack_diff", diff);
  updateBetMinimum();
  
  // Clear the board, give the $100 reset, and wait for Deal Cards
  isGameOver = true;
  playerHand = [];
  dealerHand = [];
  deck = []; // Forces a brand new deck creation on next deal
  
  money = 100;
  localStorage.setItem("blackjack_money", money);
  document.getElementById("bankroll-display").innerText = "Bankroll: $100";
  document.getElementById("pot-display").innerText = "Pot: $0";
  
  winStreak = 0;
  localStorage.setItem("blackjack_streak", winStreak);
  document.getElementById("win-streak-display").innerText = "Streak: " + winStreak;
  
  renderGame();
  showModal("Difficulty Changed", "Bankroll reset to $100. Press 'Deal Cards' to start.");
});

// Mute Button Logic
let isMuted = false;
document.getElementById("mute-btn").addEventListener("click", () => {
  isMuted = !isMuted;
  document.getElementById("mute-btn").innerText = isMuted ? "🔇 Unmute" : "🔊 Mute";
  
  // Apply the muted state directly to the Audio objects
  cardSound.muted = isMuted;
  winSound.muted = isMuted;
  loseSound.muted = isMuted;
  shuffleSound.muted = isMuted;
  tieSound.muted = isMuted;
});

// Reset Data Logic
document.getElementById("reset-btn").addEventListener("click", () => {
  if(confirm("Are you sure you want to wipe all your data and start fresh?")) {
    localStorage.clear();
    window.location.reload(); // Instantly reloads the page with a clean slate
  }
});

// NEW: Rules Modal Logic
document.getElementById("rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.remove("hidden");
});

document.getElementById("close-rules-btn").addEventListener("click", () => {
  document.getElementById("rules-modal").classList.add("hidden");
});