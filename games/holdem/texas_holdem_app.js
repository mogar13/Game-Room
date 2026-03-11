// =============================================
// TEXAS HOLD 'EM — texas_holdem_app.js
// The Game Shack | Casino OS (V2 Engine)
// Modes: vs AI | Online
// =============================================

// ── 1. INITIALIZE OS & STATE ─────────────────
let gameMode = "ai";
localStorage.setItem("poker_mode", "ai"); 

let aiDiff   = localStorage.getItem("poker_diff") || "normal";
let myId = 1;
let currentRoomId = null;
let isHost = true;
let chatStarted = false;
let seats = [];

const BUY_IN = 1000;
const BIG_BLIND = 20;
const SMALL_BLIND = 10;

let p1Name = SystemUI.getPlayerName();
let p2Name = "AI (" + aiDiff.charAt(0).toUpperCase() + aiDiff.slice(1) + ")";

SystemUI.init({
    gameName: "TEXAS HOLD 'EM",
    rules: "Each player gets two private cards. Five community cards are dealt face up. Combine them to make the best 5-card poker hand. Standard betting rules: Check, Call, Raise, or Fold.",
    hudDropdowns: [
        {
            id: "sys-poker-mode",
            options: [
                { value: "ai",     label: "🤖 vs AI"  },
                { value: "online", label: "🌐 Online"  }
            ]
        },
        {
            id: "sys-poker-diff",
            options: [
                { value: "easy",   label: "Easy"   },
                { value: "normal", label: "Normal" },
                { value: "hard",   label: "Hard"   }
            ]
        }
    ]
});

// Delay to sync OS dropdowns
setTimeout(() => {
    const modeEl = document.getElementById("sys-poker-mode");
    const diffEl = document.getElementById("sys-poker-diff");
    if(modeEl) modeEl.value = gameMode;
    if(diffEl) diffEl.value = aiDiff;
    syncDiffVisibility();
}, 10);

document.getElementById("sys-poker-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("poker_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    syncDiffVisibility();

    if (gameMode === "online") {
        SystemUI.v2Lobby.show();
    } else {
        SystemUI.v2Lobby.hide();
        SystemUI.stopChat(); chatStarted = false;
        myId = 1; isHost = true;
        resetGame();
    }
});

document.getElementById("sys-poker-diff").addEventListener("change", (e) => {
    aiDiff = e.target.value;
    localStorage.setItem("poker_diff", aiDiff);
    p2Name = "AI (" + aiDiff.charAt(0).toUpperCase() + aiDiff.slice(1) + ")";
    updateNames();
});

function syncDiffVisibility() {
    const wrap = document.getElementById("sys-poker-diff")?.parentElement;
    if (wrap) wrap.style.display = gameMode === "ai" ? "" : "none";
}

function updateNames() {
    document.getElementById("player-name").innerText = p1Name;
    document.getElementById("opp-name").innerText = p2Name;
}

// ── 2. GAME STATE ────────────────────────────
let deck = [];
let playerHand = [];
let opponentHand = [];
let communityCards = [];
let playerStack = 0;
let opponentStack = 0;
let pot = 0;
let playerBet = 0;
let opponentBet = 0;
let dealerButton = 1; // 1 = player, 2 = opponent
let currentPhase = "preflop"; // preflop, flop, turn, river, showdown
let activeTurn = 1; // 1 = player, 2 = opponent
let lastAction = "";
let isGameOver = false;
let gameIsActive = false;

// ── 3. CARD & HAND LOGIC ──────────────────────
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function buildDeck() {
    deck = [];
    for (let s of SUITS) {
        for (let r of RANKS) {
            deck.push({ rank: r, suit: s });
        }
    }
    shuffle(deck);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function getRankValue(rank) {
    if (rank === 'T') return 10;
    if (rank === 'J') return 11;
    if (rank === 'Q') return 12;
    if (rank === 'K') return 13;
    if (rank === 'A') return 14;
    return parseInt(rank);
}

function evaluateHand(cards) {
    // Basic hand evaluator for 1v1
    // Returns { score, label }
    // Higher score = better hand
    
    // Sort cards by rank value
    let sorted = [...cards].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
    let ranks = sorted.map(c => c.rank);
    let suits = sorted.map(c => c.suit);
    
    // Count ranks
    let rankCounts = {};
    ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
    let counts = Object.values(rankCounts).sort((a, b) => b - a);
    
    // Check for flush
    let isFlush = false;
    let flushSuit = "";
    ['s','h','d','c'].forEach(s => {
        if (suits.filter(suit => suit === s).length >= 5) {
            isFlush = true;
            flushSuit = s;
        }
    });

    // Check for straight
    let uniqueRanks = [...new Set(ranks.map(r => getRankValue(r)))].sort((a, b) => b - a);
    let isStraight = false;
    let highStraight = 0;

    // A-5 low straight
    if (uniqueRanks.includes(14) && uniqueRanks.includes(2) && uniqueRanks.includes(3) && uniqueRanks.includes(4) && uniqueRanks.includes(5)) {
        isStraight = true;
        highStraight = 5;
    }

    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
        if (uniqueRanks[i] - uniqueRanks[i+4] === 4) {
            isStraight = true;
            highStraight = uniqueRanks[i];
            break;
        }
    }

    // Straight Flush
    if (isFlush && isStraight) {
        // Simple approximation for 1v1 logic
        return { score: 800 + highStraight, label: "Straight Flush" };
    }

    // 4 of a Kind
    if (counts[0] === 4) {
        let r = Object.keys(rankCounts).find(k => rankCounts[k] === 4);
        return { score: 700 + getRankValue(r), label: "Four of a Kind" };
    }

    // Full House
    if (counts[0] === 3 && counts[1] >= 2) {
        let r = Object.keys(rankCounts).find(k => rankCounts[k] === 3);
        return { score: 600 + getRankValue(r), label: "Full House" };
    }

    // Flush
    if (isFlush) {
        let flushCards = sorted.filter(c => c.suit === flushSuit);
        return { score: 500 + getRankValue(flushCards[0].rank), label: "Flush" };
    }

    // Straight
    if (isStraight) {
        return { score: 400 + highStraight, label: "Straight" };
    }

    // 3 of a Kind
    if (counts[0] === 3) {
        let r = Object.keys(rankCounts).find(k => rankCounts[k] === 3);
        return { score: 300 + getRankValue(r), label: "Three of a Kind" };
    }

    // Two Pair
    if (counts[0] === 2 && counts[1] === 2) {
        let r = Object.keys(rankCounts).filter(k => rankCounts[k] === 2).map(k => getRankValue(k)).sort((a,b)=>b-a);
        return { score: 200 + r[0], label: "Two Pair" };
    }

    // Pair
    if (counts[0] === 2) {
        let r = Object.keys(rankCounts).find(k => rankCounts[k] === 2);
        return { score: 100 + getRankValue(r), label: "Pair" };
    }

    // High Card
    return { score: getRankValue(ranks[0]), label: "High Card" };
}

// ── 4. UI RENDERING ───────────────────────────
function renderTable() {
    const pContainer = document.getElementById("player-cards");
    const oContainer = document.getElementById("opp-cards");
    const cContainer = document.getElementById("community-cards");
    
    pContainer.innerHTML = '';
    oContainer.innerHTML = '';
    cContainer.innerHTML = '';

    playerHand.forEach(card => pContainer.appendChild(createCardUI(card)));
    opponentHand.forEach((card, i) => {
        let isHidden = (currentPhase !== 'showdown' && !isGameOver);
        oContainer.appendChild(createCardUI(card, isHidden));
    });
    communityCards.forEach(card => cContainer.appendChild(createCardUI(card)));

    document.getElementById("player-stack").innerText = playerStack;
    document.getElementById("opp-stack").innerText = opponentStack;
    document.getElementById("main-pot").innerText = "POT: $" + pot;
    document.getElementById("main-pot").classList.toggle("hidden", pot === 0);

    const pBubble = document.getElementById("player-bet-bubble");
    pBubble.innerText = "Bet: $" + playerBet;
    pBubble.classList.toggle("hidden", playerBet === 0);

    const oBubble = document.getElementById("opp-bet-bubble");
    oBubble.innerText = "Bet: $" + opponentBet;
    oBubble.classList.toggle("hidden", opponentBet === 0);

    document.getElementById("player-dealer-button").classList.toggle("hidden", dealerButton !== 1);
    document.getElementById("opp-dealer-button").classList.toggle("hidden", dealerButton !== 2);

    updateControls();
    SystemUI.renderTableStacks(playerBet, "player-table-chips");
    SystemUI.renderTableStacks(opponentBet, "opp-table-chips");
    SystemUI.renderTableStacks(pot, "main-pot-chips");
}

function createCardUI(card, isHidden = false) {
    const el = document.createElement("div");
    el.className = "card";
    if (isHidden) {
        el.classList.add("hidden-card");
    } else {
        const suitMap = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" };
        const rankMap = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
        const rankName = rankMap[card.rank] || card.rank;
        const suitName = suitMap[card.suit];
        el.innerHTML = `<img src="../../system/images/cards/standard/card${suitName}${rankName}.png" style="width:100%; height:100%; border-radius:6px;">`;
    }
    return el;
}

function updateControls() {
    const ctrl = document.getElementById("poker-controls");
    if (!gameIsActive || isGameOver || activeTurn !== 1) {
        ctrl.classList.add("hidden");
        return;
    }
    ctrl.classList.remove("hidden");
    
    const callBtn = document.getElementById("btn-check-call");
    const diff = opponentBet - playerBet;
    if (diff > 0) {
        callBtn.innerText = "Call $" + diff;
        callBtn.className = "action-btn safe-btn";
    } else {
        callBtn.innerText = "Check";
        callBtn.className = "action-btn safe-btn";
    }
}

function setStatus(msg) {
    document.getElementById("game-status-text").innerText = msg;
}

// ── 5. GAME LOGIC ─────────────────────────────
function startGame() {
    if (SystemUI.money < BUY_IN) {
        showToast("Error", "You need $" + BUY_IN + " to buy in!");
        return;
    }
    SystemUI.money -= BUY_IN;
    SystemUI.updateMoneyDisplay();
    
    // AUDIT: Tracking game start
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("poker");

    playerStack = BUY_IN;
    opponentStack = BUY_IN;
    gameIsActive = true;
    document.getElementById("start-game-btn").classList.add("hidden");
    document.getElementById("cash-out-btn").classList.remove("hidden");
    startNewHand();
}

function startNewHand() {
    buildDeck();
    playerHand = [deck.pop(), deck.pop()];
    opponentHand = [deck.pop(), deck.pop()];
    communityCards = [];
    pot = 0;
    playerBet = 0;
    opponentBet = 0;
    currentPhase = "preflop";
    isGameOver = false;
    
    dealerButton = (dealerButton === 1) ? 2 : 1;
    
    // Post Blinds
    if (dealerButton === 1) {
        postBet(1, SMALL_BLIND);
        postBet(2, BIG_BLIND);
        activeTurn = 1;
    } else {
        postBet(2, SMALL_BLIND);
        postBet(1, BIG_BLIND);
        activeTurn = 2;
    }

    SystemUI.playSound('shuffle');
    setStatus("Pre-flop: Your Turn");
    renderTable();
    
    if (activeTurn === 2 && gameMode === "ai") setTimeout(aiAction, 1200);
}

function postBet(player, amt) {
    if (player === 1) {
        let actual = Math.min(amt, playerStack);
        playerStack -= actual;
        playerBet += actual;
    } else {
        let actual = Math.min(amt, opponentStack);
        opponentStack -= actual;
        opponentBet += actual;
    }
}

function handleAction(type, amount = 0) {
    if (activeTurn !== 1 || isGameOver) return;
    
    if (type === 'fold') {
        fold(1);
    } else if (type === 'check-call') {
        const diff = opponentBet - playerBet;
        if (diff > 0) {
            postBet(1, diff);
            SystemUI.playSound('chipStack');
            advancePhase();
        } else {
            SystemUI.playSound('click');
            advancePhase();
        }
    } else if (type === 'raise') {
        // Logic for raise can be added if slider exists
    }
}

function fold(player) {
    isGameOver = true;
    const winner = (player === 1) ? 2 : 1;
    resolvePot(winner);
    setStatus(getPlayerName(player) + " folds.");
    SystemUI.playSound('card');
    setTimeout(checkMatchOver, 2000);
}

function advancePhase() {
    // Collect bets into pot
    pot += playerBet + opponentBet;
    playerBet = 0;
    opponentBet = 0;
    
    if (currentPhase === "preflop") {
        currentPhase = "flop";
        communityCards.push(deck.pop(), deck.pop(), deck.pop());
        SystemUI.playSound('card');
    } else if (currentPhase === "flop") {
        currentPhase = "turn";
        communityCards.push(deck.pop());
        SystemUI.playSound('card');
    } else if (currentPhase === "turn") {
        currentPhase = "river";
        communityCards.push(deck.pop());
        SystemUI.playSound('card');
    } else if (currentPhase === "river") {
        currentPhase = "showdown";
        showdown();
        return;
    }

    activeTurn = (dealerButton === 1) ? 2 : 1;
    setStatus(currentPhase.toUpperCase());
    renderTable();

    if (activeTurn === 2 && gameMode === "ai") setTimeout(aiAction, 1200);
}

function showdown() {
    isGameOver = true;
    const pResult = evaluateHand([...playerHand, ...communityCards]);
    const oResult = evaluateHand([...opponentHand, ...communityCards]);
    
    let winner = 0;
    if (pResult.score > oResult.score) winner = 1;
    else if (oResult.score > pResult.score) winner = 2;
    else winner = 0; // tie

    renderTable();
    
    let msg = "";
    if (winner === 1) {
        msg = "You win with " + pResult.label + "!";
        SystemUI.playSound('win');
        resolvePot(1);
    } else if (winner === 2) {
        msg = "Opponent wins with " + oResult.label + "!";
        SystemUI.playSound('lose');
        resolvePot(2);
    } else {
        msg = "Split Pot! Both have " + pResult.label;
        SystemUI.playSound('tie');
        resolvePot(0);
    }
    
    setStatus(msg);
    setTimeout(checkMatchOver, 3000);
}

function resolvePot(winner) {
    if (winner === 1) playerStack += pot;
    else if (winner === 2) opponentStack += pot;
    else {
        playerStack += pot / 2;
        opponentStack += pot / 2;
    }
    pot = 0;
    renderTable();
}

function checkMatchOver() {
    if (playerStack <= 0) {
        showToast("Match Over", "You went bust! Better luck next time.");
        
        // AUDIT: Tracking loss
        if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("poker");
        
        resetGame();
    } else if (opponentStack <= 0) {
        showToast("Match Over", "You cleaned them out! You win the match.");
        
        // AUDIT: Tracking win
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("poker", playerStack);
        
        SystemUI.money += playerStack;
        SystemUI.updateMoneyDisplay();
        resetGame();
    } else {
        startNewHand();
    }
}

function resetGame() {
    gameIsActive = false;
    playerStack = 0;
    opponentStack = 0;
    playerHand = [];
    opponentHand = [];
    communityCards = [];
    pot = 0;
    document.getElementById("start-game-btn").classList.remove("hidden");
    document.getElementById("cash-out-btn").classList.add("hidden");
    setStatus("Waiting to start...");
    renderTable();
}

// ── 6. AI LOGIC ───────────────────────────────
function aiAction() {
    if (activeTurn !== 2 || isGameOver) return;
    
    // Simple AI: will always call or check
    const diff = playerBet - opponentBet;
    if (diff > 0) {
        postBet(2, diff);
        SystemUI.playSound('chipStack');
        advancePhase();
    } else {
        advancePhase();
    }
}

// ── 7. UI EVENTS ──────────────────────────────
document.getElementById("start-game-btn").addEventListener("click", startGame);

document.getElementById("cash-out-btn").addEventListener("click", () => {
    if (confirm("Cash out your current stack of $" + playerStack + "?")) {
        SystemUI.money += playerStack;
        SystemUI.updateMoneyDisplay();
        
        // AUDIT: Recording cash out win
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("poker", playerStack);
        
        resetGame();
    }
});

document.getElementById("btn-fold").addEventListener("click", () => handleAction('fold'));
document.getElementById("btn-check-call").addEventListener("click", () => handleAction('check-call'));

document.getElementById("btn-show-guide").addEventListener("click", () => {
    document.getElementById("hand-guide-modal").classList.remove("hidden");
});
document.getElementById("close-guide-btn").addEventListener("click", () => {
    document.getElementById("hand-guide-modal").classList.add("hidden");
});

function showToast(title, msg) {
    document.getElementById("modal-title").innerText = title;
    document.getElementById("modal-message").innerText = msg;
    document.getElementById("toast-modal").classList.remove("hidden");
    setTimeout(() => {
        document.getElementById("toast-modal").classList.add("hidden");
    }, 3000);
}

renderTable();