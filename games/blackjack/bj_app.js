// =============================================
// BLACKJACK PRO — V2.1 Multiplayer Engine (4-Player)
// =============================================

let savedDifficulty = localStorage.getItem("blackjack_diff") || "17";
let lobbyPlayerCount = parseInt(localStorage.getItem("blackjack_pcount") || "1");

SystemUI.init({
    gameName: "BLACKJACK PRO",
    rules: `
        <ul style="text-align: left; line-height: 1.6; font-size: 0.95rem; margin-bottom: 20px; color: #ddd; padding-left: 20px;">
            <li><strong>Payouts:</strong> Standard wins pay 1:1. Natural Blackjack pays 3:2.</li>
            <li><strong>Double Down:</strong> Double your initial bet, receive ONE card, and automatically stand.</li>
            <li><strong>Insurance:</strong> If Dealer shows an Ace, insure for half your bet. Pays 2:1 if Dealer has Blackjack.</li>
        </ul>
    `,
    hudDropdowns: [
        {
            id: "sys-difficulty",
            label: "Difficulty",
            options: [
                { value: "15", label: "Easy" },
                { value: "17", label: "Normal" },
                { value: "19", label: "Hard" }
            ]
        },
        {
            id: "sys-pcount",
            label: "Players",
            options: [
                { value: "1", label: "1 Seat" },
                { value: "2", label: "2 Seats" },
                { value: "3", label: "3 Seats" },
                { value: "4", label: "4 Seats" }
            ]
        },
        {
            id: "sys-bj-mode",
            label: "Mode",
            options: [
                { value: "ai",     label: "🤖 vs Dealer" },
                { value: "online", label: "🌐 Online" }
            ]
        }
    ]
});

// --- Online (V2 Drop-In) ---
let gameMode      = "ai"; 
let currentRoomId = null;
let roomListener  = null;
let chatStarted   = false;
let seats         = []; 
let myId          = 1; 
let isHost        = true; 

let lastPushTime = 0;
let lastSyncTime = 0;

// --- Multiplayer State Arrays (Expanded to 4) ---
let playerHands  = [[], [], [], []];
let dealerHand   = [];
let currentBets  = [0, 0, 0, 0];
let playerStatus = ["active", "active", "active", "active"]; 
let gamePhase    = "betting"; 
let activeSeat   = 0;
let deck         = [];
let winStreak    = parseInt(localStorage.getItem("blackjack_streak")) || 0;

// UI Sync
setTimeout(() => {
    document.getElementById("sys-difficulty").value = savedDifficulty;
    document.getElementById("sys-pcount").value = String(lobbyPlayerCount);
    
    const modeEl = document.getElementById("sys-bj-mode");
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", function () {
            gameMode = this.value;
            localStorage.setItem("blackjack_mode", gameMode);
            syncPCountVisibility();
            if (this.value === "online") {
                SystemUI.v2Lobby.show();
            } else {
                SystemUI.v2Lobby.hide();
                myId = 1; isHost = true;
                SystemUI.stopChat(); chatStarted = false;
                if(roomListener) { roomListener(); roomListener = null; }
                resetTableForBetting();
            }
        });
    }

    const countEl = document.getElementById("sys-pcount");
    if (countEl) {
        countEl.addEventListener("change", (e) => {
            lobbyPlayerCount = parseInt(e.target.value);
            localStorage.setItem("blackjack_pcount", e.target.value);
            resetTableForBetting();
        });
    }

    syncPCountVisibility();
    updateDealerRuleText();
}, 10);

function syncPCountVisibility() {
    const wrap = document.getElementById("sys-pcount")?.closest(".hud-dropdown-wrap") ||
                 document.getElementById("sys-pcount")?.parentElement;
    if (wrap) wrap.style.display = gameMode === "ai" ? "" : "none";
}

function updateDealerRuleText() {
    const el = document.getElementById("dealer-rule-text");
    if (!el) return;
    if (savedDifficulty === "15")      el.textContent = "Dealer must draw to 14 and stand on 15";
    else if (savedDifficulty === "19") el.textContent = "Dealer must draw to 18 and stand on 19";
    else                               el.textContent = "Dealer must draw to 16 and stand on 17";
}

document.getElementById("sys-difficulty").addEventListener("change", (e) => {
    savedDifficulty = e.target.value;
    localStorage.setItem("blackjack_diff", savedDifficulty);
    deck = [];
    updateDealerRuleText();
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

function updateStreakUI() { 
    const el = document.getElementById("streak-val");
    if (el) el.innerText = winStreak; 
}
updateStreakUI();

SystemUI.setupBetting("os-betting-rack", {
    onBet: function(val) {
        if (gamePhase !== "betting") return;
        if (currentBets[myId - 1] + val > SystemUI.money) {
            showToast("Not Enough Cash", "You don't have enough bankroll for that bet.");
            return;
        }
        if (currentBets[myId - 1] === 0) SystemUI.playSound('chipTable');
        else SystemUI.playSound('chipStack');

        currentBets[myId - 1] += val;
        updateBetUI();
        if (gameMode === "online") pushGameState();
    },
    onClear: function() {
        if (gamePhase !== "betting") return;
        currentBets[myId - 1] = 0;
        updateBetUI();
        if (gameMode === "online") pushGameState();
    }
});

function updateBetUI() {
    SystemUI.updateBetDisplay(currentBets[myId - 1]);
    SystemUI.enableBetting(gamePhase === "betting"); 
    
    let minBet = (savedDifficulty === "19") ? 10 : (savedDifficulty === "17" ? 5 : 2);
    const dealBtn = document.getElementById("deal-btn");
    
    if (dealBtn) {
        if (gameMode === "online" && !isHost) {
            dealBtn.disabled = true;
            dealBtn.innerText = "WAITING FOR HOST";
        } else if (currentBets[0] < minBet) {
            dealBtn.disabled = true;
            dealBtn.innerText = `DEAL (Min $${minBet})`; 
        } else {
            dealBtn.disabled = false;
            dealBtn.innerText = `DEAL`;
        }
    }
    
    renderTableChips();
}

function renderTableChips() {
    const activeCount = gameMode === "online" ? seats.length : lobbyPlayerCount;
    
    for (let i = 0; i < 4; i++) {
        const betContainer = document.getElementById(`table-bet-chips-${i}`);
        const potDisplay = document.getElementById(`table-pot-display-${i}`);
        
        if (!betContainer) continue;
        
        if (i >= activeCount) {
            betContainer.innerHTML = "";
            if (potDisplay) potDisplay.classList.add("hidden");
            continue;
        }

        if (currentBets[i] === 0) {
            if (potDisplay) potDisplay.classList.add("hidden");
            SystemUI.renderTableStacks(0, `table-bet-chips-${i}`);
        } else {
            if (potDisplay) {
                potDisplay.innerText = `$${currentBets[i]}`;
                potDisplay.classList.remove("hidden");
            }
            SystemUI.renderTableStacks(currentBets[i], `table-bet-chips-${i}`);
        }
    }
}

let modalTimer;
let resetPending = false;
function showToast(title, message, resetTableAfter = false) {
  const tEl = document.getElementById("modal-title");
  const mEl = document.getElementById("modal-message");
  if(tEl) tEl.innerText = title;
  if(mEl) mEl.innerText = message;
  const overlay = document.getElementById("toast-modal");
  if (overlay) overlay.classList.remove("hidden");
  resetPending = resetTableAfter;

  clearTimeout(modalTimer);
  modalTimer = setTimeout(() => {
    if (overlay) overlay.classList.add("hidden");
    if (resetTableAfter && isHost) resetTableForBetting();
  }, 3500);
}

document.getElementById("toast-modal")?.addEventListener("click", function() {
  if (!this.classList.contains("hidden")) {
    clearTimeout(modalTimer);
    this.classList.add("hidden");
    if (resetPending && isHost) {
      resetPending = false;
      resetTableForBetting();
    }
  }
});

function resetTableForBetting() {
  if (!isHost && gameMode === "online") return;
  gamePhase = "betting";
  playerHands = [[], [], [], []];
  dealerHand = [];
  playerStatus = ["active", "active", "active", "active"];
  activeSeat = 0;
  
  updateBetUI(); 
  updateStreakUI();
  renderGame(); 
  
  const playingBox = document.getElementById("playing-controls");
  const bettingBox = document.getElementById("betting-controls");
  if (playingBox) playingBox.classList.add("hidden");
  if (bettingBox) bettingBox.classList.remove("hidden");
  
  if (gameMode === "online") pushGameState();
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
  SystemUI.playSound('card');
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

// ── GAME FLOW ─────────────────────────────────

document.getElementById("deal-btn").addEventListener("click", () => {
  if (gameMode === "online" && !isHost) return;
  if (SystemUI.money < currentBets[0] && myId === 1) {
      showToast("Bankrupt", "You can't afford this bet anymore. Clear or lower your bet.");
      return;
  }
  
  SystemUI.money -= currentBets[0]; 
  SystemUI.updateMoneyDisplay();
  
  const activeCount = gameMode === "online" ? seats.length : lobbyPlayerCount;
  for (let i = 1; i < activeCount; i++) {
      if ((gameMode === "online" && seats[i]?.type === "ai") || gameMode === "ai") {
          if (currentBets[i] === 0) currentBets[i] = 10; 
      }
  }
  
  if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("blackjack");
  
  gamePhase = "dealing";
  updateBetUI(); 
  SystemUI.playSound('shuffle');

  document.getElementById("betting-controls").classList.add("hidden");
  document.getElementById("playing-controls").classList.remove("hidden");
  disableActionButtons();

  let numDecks = (savedDifficulty === "19") ? 6 : (savedDifficulty === "17" ? 4 : 1);
  if (deck.length < (activeCount * 5) + 10) { createDeck(numDecks); shuffleDeck(); }

  let delay = 100;
  for (let i = 0; i < activeCount; i++) {
      setTimeout(() => { dealCard(playerHands[i]); renderGame(); }, delay);
      delay += 200;
  }
  setTimeout(() => { dealCard(dealerHand); renderGame(); }, delay);
  delay += 200;
  for (let i = 0; i < activeCount; i++) {
      setTimeout(() => { dealCard(playerHands[i]); renderGame(); }, delay);
      delay += 200;
  }
  setTimeout(() => { 
      dealCard(dealerHand); 
      gamePhase = "playing";
      activeSeat = 0;
      for(let i=0; i<activeCount; i++) {
          if(calculateScore(playerHands[i]) === 21) playerStatus[i] = "blackjack";
      }
      renderGame(); 
      updateTurnUI();
      if (gameMode === "online") pushGameState();
      processTurn(); 
  }, delay);
});

function disableActionButtons() {
    document.getElementById("hit-btn").disabled = true;
    document.getElementById("stand-btn").disabled = true;
    document.getElementById("double-btn").disabled = true;
    document.getElementById("split-btn").disabled = true;
    document.getElementById("insurance-btn").classList.add("hidden");
}

function updateTurnUI() {
    disableActionButtons();
    for(let i=0; i<4; i++) {
        const box = document.getElementById(`box-slot-${i}`);
        if(box) box.classList.toggle("active-turn", i === activeSeat && gamePhase === "playing");
    }
    if (gamePhase !== "playing") return;
    if (activeSeat === myId - 1) {
        document.getElementById("hit-btn").disabled = false;
        document.getElementById("stand-btn").disabled = false;
        document.getElementById("double-btn").disabled = (playerHands[activeSeat].length > 2);
        if (dealerHand.length > 0 && dealerHand[0].name === "A" && playerHands[activeSeat].length === 2) {
            document.getElementById("insurance-btn").classList.remove("hidden");
        }
    }
}

function processTurn() {
    if (gamePhase !== "playing") return;
    const activeCount = gameMode === "online" ? seats.length : lobbyPlayerCount;
    while (activeSeat < activeCount && playerStatus[activeSeat] !== "active") {
        activeSeat++;
    }
    if (activeSeat >= activeCount) {
        if (isHost) handleDealerTurn();
        return;
    }
    updateTurnUI();
    if (gameMode === "online" && isHost) pushGameState();
    if (isHost) {
        const isBot = (gameMode === "online") ? seats[activeSeat]?.type === "ai" : (activeSeat > 0);
        if (isBot) {
            setTimeout(() => playAiTurn(), 1000);
        }
    }
}

function playAiTurn() {
    if (gamePhase !== "playing" || playerStatus[activeSeat] !== "active") return;
    const score = calculateScore(playerHands[activeSeat]);
    if (score < 17) {
        dealCard(playerHands[activeSeat]);
        renderGame();
        if (calculateScore(playerHands[activeSeat]) > 21) {
            playerStatus[activeSeat] = "busted";
        }
        if (gameMode === "online") pushGameState();
        setTimeout(processTurn, 1000);
    } else {
        playerStatus[activeSeat] = "stand";
        if (gameMode === "online") pushGameState();
        processTurn();
    }
}

document.getElementById("hit-btn").addEventListener("click", () => {
  if (gamePhase !== "playing" || activeSeat !== myId - 1) return;
  document.getElementById("insurance-btn").classList.add("hidden");
  dealCard(playerHands[activeSeat]);
  renderGame();
  const score = calculateScore(playerHands[activeSeat]);
  if (score > 21) playerStatus[activeSeat] = "busted";
  else if (score === 21) playerStatus[activeSeat] = "stand";
  if (gameMode === "online") pushGameState();
  processTurn();
});

document.getElementById("stand-btn").addEventListener("click", () => {
  if (gamePhase !== "playing" || activeSeat !== myId - 1) return;
  document.getElementById("insurance-btn").classList.add("hidden");
  playerStatus[activeSeat] = "stand";
  if (gameMode === "online") pushGameState();
  processTurn();
});

document.getElementById("double-btn").addEventListener("click", () => {
  if (gamePhase !== "playing" || activeSeat !== myId - 1 || playerHands[activeSeat].length > 2) return;
  if (SystemUI.money < currentBets[activeSeat]) {
    showToast("Not enough cash", "You don't have enough to double down!");
    return;
  }
  document.getElementById("insurance-btn").classList.add("hidden");
  SystemUI.money -= currentBets[activeSeat];
  currentBets[activeSeat] *= 2;
  SystemUI.updateMoneyDisplay();
  renderTableChips();
  dealCard(playerHands[activeSeat]);
  renderGame();
  if (calculateScore(playerHands[activeSeat]) > 21) playerStatus[activeSeat] = "busted";
  else playerStatus[activeSeat] = "stand";
  if (gameMode === "online") pushGameState();
  processTurn();
});

document.getElementById("insurance-btn").addEventListener("click", () => {
  if (gamePhase !== "playing" || activeSeat !== myId - 1) return;
  const insBet = currentBets[activeSeat] / 2;
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
    SystemUI.playSound('win');
    if (typeof SystemStats !== 'undefined') SystemStats.recordWin("blackjack", insBet * 3);
    showToast("Insurance Paid!", `Dealer has Blackjack. You won $${insBet * 2}.`);
    setTimeout(() => {
        gamePhase = "dealerTurn";
        if (gameMode === "online" && isHost) pushGameState();
        if (isHost) handleDealerTurn();
    }, 2500);
  } else {
    showToast("Safe!", "Dealer does not have Blackjack.");
    if (gameMode === "online") pushGameState();
  }
});

function handleDealerTurn() {
  if (!isHost) return;
  gamePhase = "dealerTurn";
  if (gameMode === "online") pushGameState();
  renderGame(); 
  const allDone = playerStatus.every(s => s === "busted" || s === "blackjack" || s === "inactive");
  const difficultyLimit = Number(savedDifficulty);
  function playDealerAction() {
      let dealerScore = calculateScore(dealerHand);
      if (!allDone && dealerScore < difficultyLimit) {
          dealCard(dealerHand);
          renderGame();
          if (gameMode === "online") pushGameState();
          setTimeout(playDealerAction, 800);
      } else {
          determineWinners();
      }
  }
  setTimeout(playDealerAction, 800);
}

function determineWinners() {
  gamePhase = "payout";
  disableActionButtons();
  renderGame(); 
  const dScore = calculateScore(dealerHand);
  const dealerHasBlackjack = (dScore === 21 && dealerHand.length === 2);
  const myIdx = myId - 1;
  const pScore = calculateScore(playerHands[myIdx]);
  const playerHasBlackjack = (pScore === 21 && playerHands[myIdx].length === 2);
  const bet = currentBets[myIdx];
  let title = "", message = "";
  if (playerStatus[myIdx] === "busted") {
    title = "Busted!"; message = `You went over 21. Lost $${bet}.`;
    winStreak = 0; SystemUI.playSound('lose');
    if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("blackjack");
  } else if (playerHasBlackjack && !dealerHasBlackjack) {
    title = "Blackjack!"; message = `Natural 21! Won $${bet * 1.5}!`;
    SystemUI.money += (bet * 2.5); winStreak++; SystemUI.playSound('win');
    if (typeof SystemStats !== 'undefined') SystemStats.recordWin("blackjack", bet * 2.5);
    if (typeof SystemUI.unlockAchievement !== 'undefined') SystemUI.unlockAchievement("blackjack_hand");
  } else if (dScore > 21 || pScore > dScore) {
    title = "You Win!"; message = `Beat the dealer! Won $${bet * 2}!`;
    SystemUI.money += (bet * 2); winStreak++; SystemUI.playSound('win');
    if (typeof SystemStats !== 'undefined') SystemStats.recordWin("blackjack", bet * 2);
  } else if (dScore > pScore || (dealerHasBlackjack && !playerHasBlackjack)) {
    title = "Dealer Wins!"; message = `Dealer had a higher score. Lost $${bet}.`;
    winStreak = 0; SystemUI.playSound('lose');
    if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("blackjack");
  } else {
    title = "Push (Tie)!"; message = "It's a tie. Bet returned.";
    SystemUI.money += bet; winStreak = 0; SystemUI.playSound('tie');
  }
  SystemUI.updateMoneyDisplay();
  localStorage.setItem("blackjack_streak", winStreak);
  updateStreakUI();
  if (gameMode === "online") pushGameState();
  setTimeout(() => { showToast(title, message, true); }, 1000);
}

function getEquipment() {
    const loadout = (window.SystemProfile && window.SystemProfile.getLoadout) ? window.SystemProfile.getLoadout() : {};
    const useJumbo = loadout.deck === "deck_alt";
    const deckFolder = useJumbo ? "standard-1" : "standard";
    
    let backImg = "cardBack_blue1.png"; 
    const equippedId = loadout.cardback || "back_b1";

    if (window.SystemStore && window.SystemStore.CATALOG && window.SystemStore.CATALOG[equippedId]) {
        backImg = window.SystemStore.CATALOG[equippedId].value;
    }
    
    // Safely route mix-and-matched decks and backs without any math hacks
    if (useJumbo && !backImg.includes("../")) {
        backImg = "../standard/" + backImg;
    }
    
    return { folder: deckFolder, back: backImg };
}

function getCardImage(card) {
  const equip = getEquipment();
  const suitMap = { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" };
  if (equip.folder === "standard-1") {
      const jumboSuitMap = { "♠": "spades", "♥": "hearts", "♦": "diamonds", "♣": "clubs" };
      let nameStr = card.name;
      if (nameStr === "A") nameStr = "ace";
      else if (nameStr === "J") nameStr = "jack";
      else if (nameStr === "Q") nameStr = "queen";
      else if (nameStr === "K") nameStr = "king";
      else if (parseInt(nameStr) < 10) nameStr = "0" + nameStr;
      return `../../system/images/cards/standard-1/${jumboSuitMap[card.suit]}_${nameStr}.png`;
  }
  return `../../system/images/cards/standard/card${suitMap[card.suit]}${card.name}.png`;
}

function createCardElement(card, isHidden) {
  const equip = getEquipment();
  const cardEl = document.createElement("div");
  cardEl.classList.add("card");
  if (isHidden) {
    cardEl.classList.add("hidden-card");
    const backPath = `../../system/images/cards/${equip.folder}/${equip.back}`;
    cardEl.innerHTML = `<img src="${backPath}" style="width: 100%; height: 100%; border-radius: 6px; display: block;">`;
    return cardEl;
  }
  let imgFile = getCardImage(card);
  cardEl.innerHTML = `<img src="${imgFile}" style="width: 100%; height: 100%; border-radius: 6px; display: block;">`;
  cardEl.style.border = "none"; cardEl.style.backgroundColor = "transparent";
  return cardEl;
}

function renderGame() {
  const dealerEl = document.getElementById("dealer-cards");
  const dBubble = document.getElementById("dealer-score");
  if (dealerEl) dealerEl.innerHTML = "";
  dealerHand.forEach((card, index) => {
    let isHidden = (index === 1 && gamePhase !== "dealerTurn" && gamePhase !== "payout");
    if (dealerEl) dealerEl.appendChild(createCardElement(card, isHidden));
  });
  if (dBubble) {
      if (dealerHand.length > 0 && (gamePhase === "dealerTurn" || gamePhase === "payout")) {
          dBubble.innerText = calculateScore(dealerHand); 
          dBubble.classList.remove("hidden");
      } else { dBubble.classList.add("hidden"); }
  }

  const activeCount = gameMode === "online" ? seats.length : lobbyPlayerCount;
  for (let i = 0; i < 4; i++) {
      const pEl = document.getElementById(`player-cards-${i}`);
      const pBubble = document.getElementById(`player-score-${i}`);
      const pLabel = document.getElementById(`player-name-${i}`);
      const boxSlot = document.getElementById(`box-slot-${i}`);
      if (!pEl) continue;
      if (i >= activeCount) { if (boxSlot) boxSlot.classList.add("hidden"); continue; }
      
      if (boxSlot) {
          boxSlot.classList.remove("hidden");
          if (activeCount === 1 && i === 0) {
              boxSlot.style.left = "50%";
              boxSlot.style.transform = "translateX(-50%) rotate(0deg)";
          } else {
              boxSlot.style.left = "";
              boxSlot.style.transform = "";
          }
      }
      
      if (pLabel) {
          if (gameMode === "online" && seats[i]) pLabel.innerText = seats[i].name;
          else if (i === 0) pLabel.innerText = SystemUI.getPlayerName();
          else pLabel.innerText = `AI ${i+1}`;
      }

      pEl.innerHTML = "";
      playerHands[i].forEach((card, idx) => {
          let isHidden = false;
          pEl.appendChild(createCardElement(card, isHidden));
      });

      if (pBubble) {
          if (playerHands[i].length > 0) {
              pBubble.innerText = calculateScore(playerHands[i]); 
              pBubble.classList.remove("hidden");
          } else { pBubble.classList.add("hidden"); }
      }
  }
}

// --- V2 MULTIPLAYER (Lobby Hooks) ---

function updateLobbyPreview() {
    const slots = [{ type: "host", name: SystemUI.getPlayerName(), color: "#e74c3c" }];
    for (let i = 1; i < lobbyPlayerCount; i++) {
        slots.push({ type: "ai", name: "AI " + i, color: "#3498db" });
    }
    SystemUI.v2Lobby.updatePreview(slots);
}

SystemMatch.setup({
    gameId:   "blackjack",
    roomPath: "bj_rooms",
    autoShow: false,
    getSeatCount: () => lobbyPlayerCount,
    buildSeats: (count) => {
        const out = [{ type: "human", name: SystemUI.getPlayerName() }];
        for (let i = 1; i < count; i++) out.push({ type: "ai", name: "AI " + i });
        return out;
    },
    extraRoomFields: () => ({ ts: Date.now() }),
    settingsConfig: [
        {
            id: "lobby-count",
            label: "PLAYERS",
            type: "select",
            default: lobbyPlayerCount,
            options: [
                { value: 1, label: "1 PLAYER" },
                { value: 2, label: "2 PLAYERS" },
                { value: 3, label: "3 PLAYERS" },
                { value: 4, label: "4 PLAYERS" }
            ]
        },
        {
            id: "sys-difficulty-lobby",
            label: "RULES",
            type: "select",
            default: savedDifficulty,
            options: [
                { value: "15", label: "EASY (Stand 15)" },
                { value: "17", label: "NORMAL (Stand 17)" },
                { value: "19", label: "HARD (Stand 19)" }
            ]
        }
    ],
    onSettingsRendered: () => { updateLobbyPreview(); },
    onSettingChange: (key, val) => {
        if (key === "lobby-count") {
            lobbyPlayerCount = parseInt(val);
            localStorage.setItem("blackjack_pcount", val);
            const localPCount = document.getElementById("sys-pcount");
            if (localPCount) localPCount.value = val;
            if (isHost && currentRoomId) {
                SystemMatch.resizeSeats(lobbyPlayerCount);
                seats = SystemMatch.getSeats();
            }
        } else if (key === "sys-difficulty-lobby") {
            savedDifficulty = val;
            localStorage.setItem("blackjack_diff", val);
            const localDiff = document.getElementById("sys-difficulty");
            if (localDiff) localDiff.value = val;
            updateDealerRuleText();
        }
        updateLobbyPreview();
    },
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1; chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; chatStarted = false;
        myId = SystemMatch.getMyId();
        seats = SystemMatch.getSeats();
        // Blackjack auto-starts on join (matches original behavior).
        if (window.db && window.dbUpdate) {
            window.dbUpdate(window.dbRef(window.db, 'bj_rooms/' + roomId), { status: "playing", ts: Date.now() });
        }
        listenToRoom();
    },
    onLeave: () => {
        gameMode = "ai"; myId = 1; isHost = true;
        document.getElementById("sys-bj-mode").value = "ai";
        localStorage.setItem("blackjack_mode", "ai");
        syncPCountVisibility();
        resetTableForBetting();
    },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'bj_rooms/' + currentRoomId), { status: "playing", ts: Date.now() });
        }
    },
    onClose: () => {
        if (gameMode === "online" && gamePhase === "betting") {
            gameMode = "ai";
            document.getElementById("sys-bj-mode").value = "ai";
            syncPCountVisibility();
            myId = 1; isHost = true;
        }
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    roomListener = window.dbOnValue(window.dbRef(window.db,'bj_rooms/'+currentRoomId), snap=>{
        const data=snap.val(); if(!data) return;
        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);
        if(data.status==="playing" && !onlineGameStarted){
            onlineGameStarted = true; SystemUI.v2Lobby.hide();
            if(!chatStarted){ chatStarted=true; SystemUI.startChat(currentRoomId,SystemUI.getPlayerName()); }
        }
        if (onlineGameStarted && data.gameState) syncOnlineState(data.gameState);
    });
}

function pushGameState() {
    if (gameMode !== "online" || !window.db) return;
    const now = Date.now();
    lastPushTime = now;
    window.dbUpdate(window.dbRef(window.db, 'bj_rooms/' + currentRoomId), {
        gameState: JSON.stringify({
            gamePhase: gamePhase,
            activeSeat: activeSeat,
            playerHands: playerHands,
            dealerHand: dealerHand,
            currentBets: currentBets,
            playerStatus: playerStatus,
            ts: now,
            pusher: myId
        })
    });
}

function syncOnlineState(stateJson) {
    try {
        const data = typeof stateJson === "string" ? JSON.parse(stateJson) : stateJson;
        if (!data.ts || (data.pusher === myId && data.ts === lastPushTime) || data.ts <= lastSyncTime) return;
        lastSyncTime = data.ts;
        gamePhase = data.gamePhase;
        activeSeat = data.activeSeat;
        playerHands = data.playerHands || [[], [], [], []];
        dealerHand = data.dealerHand || [];
        currentBets = data.currentBets || [0, 0, 0, 0];
        playerStatus = data.playerStatus || ["active", "active", "active", "active"];
        if (gamePhase === "betting") {
            document.getElementById("playing-controls")?.classList.add("hidden");
            document.getElementById("betting-controls")?.classList.remove("hidden");
        } else {
            document.getElementById("betting-controls")?.classList.add("hidden");
            document.getElementById("playing-controls")?.classList.remove("hidden");
        }
        renderGame(); updateBetUI(); updateTurnUI();
        if (isHost && gamePhase === "playing") {
            const isBot = seats[activeSeat]?.type === "ai";
            if (isBot) playAiTurn();
        }
    } catch (e) { console.error("Sync Error:", e); }
}

window.addEventListener("beforeunload", () => { 
    if (isHost && currentRoomId && gameMode === "online" && window.db) {
        window.dbSet(window.dbRef(window.db, `bj_rooms/${currentRoomId}`), null);
    }
});

resetTableForBetting();
updateBetUI();