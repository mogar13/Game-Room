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

let onlineSetupDone = false;
document.getElementById("sys-poker-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("poker_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    syncDiffVisibility();

    if (gameMode === "online") {
        if (!onlineSetupDone) {
            SystemUI.v2Lobby.hide();
            setupOnlineMode();
            onlineSetupDone = true;
        } else {
            SystemUI.v2Lobby.show();
        }
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
let dealerButton = 1; 
let currentPhase = "preflop"; 
let activeTurn = 1; 
let lastAction = "";
let isGameOver = false;
let gameIsActive = false;
let isAllIn = false;
let allCommunityCards = [];
let lastActionTs      = 0;
let joinerBoughtIn    = false;

// ── UNIVERSAL BETTING SETUP ───────────────────
let selectedBet = 0;
SystemUI.setupBetting("os-betting-rack", {
    onBet: function(val) {
        if (!gameIsActive || isGameOver) return;
        const diff = opponentBet - playerBet;
        const minRaise = diff > 0 ? diff + BIG_BLIND : BIG_BLIND;
        
        if (selectedBet + val > playerStack) {
            showToast("Not Enough Cash", "You don't have enough chips for that bet.");
            return;
        }
        if (selectedBet === 0) SystemUI.playSound('chipTable');
        else SystemUI.playSound('chipStack');

        selectedBet += val;
        SystemUI.updateBetDisplay(selectedBet);
        
        const raiseBtn = document.getElementById("btn-raise");
        if (selectedBet >= minRaise) {
            raiseBtn.disabled = false;
            raiseBtn.innerText = "Raise $" + selectedBet;
        } else {
            raiseBtn.disabled = true;
            raiseBtn.innerText = "Raise (Min $" + minRaise + ")";
        }
    },
    onClear: function() {
        if (!gameIsActive || isGameOver) return;
        selectedBet = 0;
        SystemUI.updateBetDisplay(selectedBet);
        const raiseBtn = document.getElementById("btn-raise");
        raiseBtn.disabled = true;
        raiseBtn.innerText = "Raise";
    }
});

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

function getCombinations(array, size) {
    let result = [];
    function p(t, i) {
        if (t.length === size) { result.push(t); return; }
        if (i + 1 <= array.length) { p(t.concat([array[i]]), i + 1); p(t, i + 1); }
    }
    p([], 0);
    return result;
}

function evaluateHand(cards) {
    let evalCards = [...cards];
    // Pad partial hands to 5 to avoid crashing during early AI eval
    while (evalCards.length < 5) {
        evalCards.push({ rank: '2', suit: 'none' + Math.random() });
    }
    
    let combos = getCombinations(evalCards, 5);
    let bestScore = -1;
    let bestLabel = "";
    
    for (let combo of combos) {
        let sorted = [...combo].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
        let ranks = sorted.map(c => getRankValue(c.rank));
        let suits = sorted.map(c => c.suit);
        
        let rankCounts = {};
        ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
        
        let isFlush = new Set(suits).size === 1;
        let isStraight = false;
        let highStraight = 0;
        
        // A-5 low straight
        if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
            isStraight = true; highStraight = 5;
            ranks = [5, 4, 3, 2, 1]; 
        } else if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
            isStraight = true; highStraight = ranks[0];
        }
        
        let groups = Object.keys(rankCounts).map(r => ({ rank: parseInt(r), count: rankCounts[r] }));
        groups.sort((a, b) => {
            if (a.count !== b.count) return b.count - a.count;
            return b.rank - a.rank;
        });
        
        let type = 0;
        let label = "High Card";
        
        if (isStraight && isFlush) { type = 8; label = "Straight Flush"; }
        else if (groups[0].count === 4) { type = 7; label = "Four of a Kind"; }
        else if (groups[0].count === 3 && groups[1].count === 2) { type = 6; label = "Full House"; }
        else if (isFlush) { type = 5; label = "Flush"; }
        else if (isStraight) { type = 4; label = "Straight"; }
        else if (groups[0].count === 3) { type = 3; label = "Three of a Kind"; }
        else if (groups[0].count === 2 && groups[1].count === 2) { type = 2; label = "Two Pair"; }
        else if (groups[0].count === 2) { type = 1; label = "Pair"; }
        
        let score = type * 10000000000 + 
                    groups[0].rank * 100000000 + 
                    (groups.length > 1 ? groups[1].rank * 1000000 : 0) + 
                    (groups.length > 2 ? groups[2].rank * 10000 : 0) + 
                    (groups.length > 3 ? groups[3].rank * 100 : 0) + 
                    (groups.length > 4 ? groups[4].rank : 0);
                    
        if (score > bestScore) {
            bestScore = score;
            bestLabel = label;
        }
    }
    return { score: bestScore, label: bestLabel };
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
        if (isAllIn) isHidden = false; // Reveal cards immediately on all-in
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
    const myTurn = (gameMode === "online") ? (activeTurn === myId) : (activeTurn === 1);
    if (!gameIsActive || isGameOver || !myTurn || isAllIn) {
        ctrl.classList.add("hidden");
        if (window.SystemUI && SystemUI.enableBetting) SystemUI.enableBetting(false);
        return;
    }
    ctrl.classList.remove("hidden");
    if (window.SystemUI && SystemUI.enableBetting) SystemUI.enableBetting(true);
    
    const callBtn = document.getElementById("btn-check-call");
    const raiseBtn = document.getElementById("btn-raise");
    const diff = opponentBet - playerBet;
    
    selectedBet = 0;
    if (window.SystemUI && SystemUI.updateBetDisplay) SystemUI.updateBetDisplay(selectedBet);
    raiseBtn.disabled = true;
    raiseBtn.innerText = "Raise";

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
    isAllIn = false;
    
    dealerButton = (dealerButton === 1) ? 2 : 1;
    
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
    if (gameMode === "online") {
        allCommunityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    }
    if (gameMode === "online" && isHost) {
        const preflopStatus = "Pre-flop: " + (activeTurn === 1 ? "Your Turn" : "Opponent's Turn...");
        pushHostState(preflopStatus, false, 0);
    }
}

function postBet(player, amt) {
    if (player === 1) {
        let actual = Math.min(amt, playerStack);
        playerStack -= actual;
        playerBet += actual;
        if (playerStack === 0) isAllIn = true;
    } else {
        let actual = Math.min(amt, opponentStack);
        opponentStack -= actual;
        opponentBet += actual;
        if (opponentStack === 0) isAllIn = true;
    }
}

function handleAction(type, amount = 0) {
    const notMyTurn = (gameMode === "online") ? (activeTurn !== myId) : (activeTurn !== 1);
    if (notMyTurn || isGameOver) return;

    if (gameMode === "online" && !isHost) {
        sendJoinerAction(type, amount);
        return;
    }
    
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
        if (amount > 0) {
            postBet(1, amount);
            SystemUI.playSound('chipStack');
            advancePhase();
        }
    }
}

function fold(player) {
    isGameOver = true;
    const winner = (player === 1) ? 2 : 1;
    resolvePot(winner);
    setStatus(getPlayerName(player) + " folds.");
    SystemUI.playSound('card');
    if (gameMode === "online" && isHost) pushHostState(getPlayerName(player) + " folds.", false, 0);
    setTimeout(checkMatchOver, 2000);
}

function getPlayerName(player) {
    return player === 1 ? p1Name : p2Name;
}

function advancePhase() {
    pot += playerBet + opponentBet;
    playerBet = 0;
    opponentBet = 0;
    
    if (isAllIn) {
        while(communityCards.length < 5) {
            if (gameMode === "online") {
                communityCards.push(allCommunityCards[communityCards.length]);
            } else {
                communityCards.push(deck.pop());
            }
        }
        currentPhase = "showdown";
        setStatus("ALL IN!");
        SystemUI.playSound('card');
        renderTable();
        setTimeout(showdown, 1500);
        return;
    }

    if (currentPhase === "preflop") {
        currentPhase = "flop";
        if (gameMode === "online") { communityCards = allCommunityCards.slice(0, 3); } else { communityCards.push(deck.pop(), deck.pop(), deck.pop()); }
        SystemUI.playSound('card');
    } else if (currentPhase === "flop") {
        currentPhase = "turn";
        if (gameMode === "online") { communityCards = allCommunityCards.slice(0, 4); } else { communityCards.push(deck.pop()); }
        SystemUI.playSound('card');
    } else if (currentPhase === "turn") {
        currentPhase = "river";
        if (gameMode === "online") { communityCards = allCommunityCards.slice(0, 5); } else { communityCards.push(deck.pop()); }
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
    if (gameMode === "online" && isHost) pushHostState(currentPhase.toUpperCase(), false, 0);
}

function showdown() {
    isGameOver = true;
    const pResult = evaluateHand([...playerHand, ...communityCards]);
    const oResult = evaluateHand([...opponentHand, ...communityCards]);
    
    let winner = 0;
    if (pResult.score > oResult.score) winner = 1;
    else if (oResult.score > pResult.score) winner = 2;
    else winner = 0; 

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
    if (gameMode === "online" && isHost) pushHostState(msg, false, 0);
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
        if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("poker");
        
        if (gameMode === "online" && isHost) pushHostState("Match Over — " + p2Name + " wins!", true, opponentStack);
        joinerBoughtIn = false;
        resetGame();
    } else if (opponentStack <= 0) {
        showToast("Match Over", "You cleaned them out! You win the match.");
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("poker", playerStack);
        
        SystemUI.money += playerStack;
        SystemUI.updateMoneyDisplay();
        if (gameMode === "online" && isHost) pushHostState("Match Over — " + p1Name + " wins!", true, 0);
        joinerBoughtIn = false;
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
    
    const diff = playerBet - opponentBet;
    const canCheck = (diff === 0);
    
    let currentBest = evaluateHand([...opponentHand, ...communityCards]);
    let handRank = Math.floor(currentBest.score / 10000000000);
    
    let action = "check-call";
    let amount = 0;
    let r = Math.random();
    
    if (aiDiff === "easy") {
        if (!canCheck && r < 0.2) action = "fold";
    } else if (aiDiff === "normal") {
        if (!canCheck && handRank === 0 && diff > BIG_BLIND * 2 && r < 0.7) {
            action = "fold";
        } else if (handRank >= 2 && r < 0.4 && opponentStack > BIG_BLIND) {
            action = "raise";
            amount = diff + BIG_BLIND * 2;
        }
    } else if (aiDiff === "hard") {
        if (handRank >= 1 && r < 0.5 && opponentStack > BIG_BLIND) {
            action = "raise";
            amount = diff + BIG_BLIND * 3;
        } else if (handRank === 0 && !canCheck && r < 0.8) {
            if (r < 0.2 && opponentStack > BIG_BLIND) {
                action = "raise"; amount = diff + BIG_BLIND * 2;
            } else {
                action = "fold";
            }
        }
    }
    
    if (action === "raise" && amount > opponentStack) amount = opponentStack;
    if (action === "raise" && amount === 0) action = "check-call";

    if (action === "fold") {
        fold(2);
    } else if (action === "raise") {
        postBet(2, amount);
        SystemUI.playSound('chipStack');
        advancePhase();
    } else {
        if (diff > 0) {
            postBet(2, diff);
            SystemUI.playSound('chipStack');
        } else {
            SystemUI.playSound('click');
        }
        advancePhase();
    }
}

// ── 7. UI EVENTS ──────────────────────────────
document.getElementById("start-game-btn").addEventListener("click", startGame);

document.getElementById("cash-out-btn").addEventListener("click", () => {
    if (confirm("Cash out your current stack of $" + playerStack + "?")) {
        SystemUI.money += playerStack;
        SystemUI.updateMoneyDisplay();
        
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("poker", playerStack);
        resetGame();
    }
});

document.getElementById("btn-fold").addEventListener("click", () => handleAction('fold'));
document.getElementById("btn-check-call").addEventListener("click", () => handleAction('check-call'));
document.getElementById("btn-raise").addEventListener("click", () => handleAction('raise', selectedBet));

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

// ── 8. ONLINE MULTIPLAYER (Match Controller) ──────────────────────────────

function setupOnlineMode() {
    SystemMatch.setup({
        gameId:   "holdem",
        roomPath: "holdem_rooms",
        onHost:   function(roomId) { listenToHoldemRoom(); },
        onJoin:   function(roomId) { listenToHoldemRoom(); },
        onLeave:  function() {
            gameMode = "ai"; myId = 1; isHost = true; chatStarted = false;
            resetGame();
        },
        onStart:  function() { },
        onClose:  function() { if (!gameIsActive) { } }
    });
}

function listenToHoldemRoom() {
    const roomId  = SystemMatch.getRoomId();
    const roomRef = window.dbRef(window.db, 'holdem_rooms/' + roomId);
    const unsub   = window.dbOnValue(roomRef, function(snap) {
        const data = snap.val();
        if (!data) return;

        SystemMatch.setSeats(data.seats || []);
        SystemUI.v2Lobby.renderSeats(SystemMatch.getSeats());

        if (isHost && data.seats && data.seats[1] && data.seats[1].type === 'human') {
            p2Name = data.seats[1].name || "Opponent";
            updateNames();
            const startBtn = document.getElementById('v2-btn-start');
            if (startBtn) startBtn.classList.remove('sys-hidden');
        }

        if (data.status === 'playing') {
            SystemUI.v2Lobby.hide();
            myId   = SystemMatch.getMyId();
            isHost = SystemMatch.isHost();
            if (!chatStarted) {
                SystemUI.startChat(roomId, SystemUI.getPlayerName());
                chatStarted = true;
            }
            if (isHost && !gameIsActive) {
                p1Name = SystemMatch.getSeatName(1);
                p2Name = SystemMatch.getSeatName(2);
                updateNames();
                startGame();
            }
            if (!isHost) {
                p1Name = SystemUI.getPlayerName();
                setStatus("Waiting for host to deal...");
            }
        }

        if (!isHost && data.gameState) {
            applyHostState(data.gameState);
        }

        if (isHost && data.playerAction && data.playerAction.ts !== lastActionTs) {
            lastActionTs = data.playerAction.ts;
            processJoinerAction(data.playerAction);
        }
    });
    SystemMatch.setListener(unsub);
}

function pushHostState(statusMsg, matchOver, joinerPayout) {
    if (gameMode !== "online" || !isHost || !window.db) return;
    const roomId = SystemMatch.getRoomId();
    if (!roomId) return;
    window.dbUpdate(window.dbRef(window.db, 'holdem_rooms/' + roomId), {
        gameState: {
            p1Hand:            playerHand,
            p2Hand:            opponentHand,
            allCommunityCards: allCommunityCards,
            communityCards:    communityCards,
            pot:               pot,
            p1Bet:             playerBet,
            p2Bet:             opponentBet,
            p1Stack:           playerStack,
            p2Stack:           opponentStack,
            activeTurn:        activeTurn,
            currentPhase:      currentPhase,
            dealerButton:      dealerButton,
            isGameOver:        isGameOver,
            gameIsActive:      gameIsActive,
            isAllIn:           isAllIn,
            statusMsg:         statusMsg || currentPhase.toUpperCase(),
            p1Name:            p1Name,
            matchOver:         matchOver    || false,
            joinerPayout:      joinerPayout || 0
        }
    });
}

function sendJoinerAction(type, amount = 0) {
    if (gameMode !== "online" || isHost || !window.db) return;
    const roomId = SystemMatch.getRoomId();
    if (!roomId) return;
    window.dbUpdate(window.dbRef(window.db, 'holdem_rooms/' + roomId), {
        playerAction: { action: type, amount: amount, ts: Date.now() }
    });
}

function processJoinerAction(payload) {
    const action = payload.action;
    const amount = payload.amount || 0;

    if (activeTurn !== 2 || isGameOver) return;
    if (action === 'fold') {
        isGameOver = true;
        resolvePot(1);
        const foldMsg = p2Name + " folds.";
        setStatus(foldMsg);
        SystemUI.playSound('card');
        renderTable();
        pushHostState(foldMsg, false, 0);
        setTimeout(checkMatchOver, 2000);
    } else if (action === 'check-call') {
        const diff = playerBet - opponentBet;
        if (diff > 0) {
            postBet(2, diff);
            SystemUI.playSound('chipStack');
        } else {
            SystemUI.playSound('click');
        }
        advancePhase();
    } else if (action === 'raise') {
        if (amount > 0) {
            postBet(2, amount);
            SystemUI.playSound('chipStack');
        }
        advancePhase();
    }
}

function applyHostState(state) {
    if (!state) return;
    playerHand        = state.p2Hand            || [];
    opponentHand      = state.p1Hand            || [];
    allCommunityCards = state.allCommunityCards  || [];
    communityCards    = state.communityCards     || [];
    pot               = state.pot               || 0;
    playerBet         = state.p2Bet             || 0;
    opponentBet       = state.p1Bet             || 0;
    playerStack       = state.p2Stack           || 0;
    opponentStack     = state.p1Stack           || 0;
    activeTurn        = state.activeTurn        || 1;
    currentPhase      = state.currentPhase      || "preflop";
    dealerButton      = state.dealerButton      || 1;
    isGameOver        = state.isGameOver        || false;
    gameIsActive      = state.gameIsActive      || false;
    isAllIn           = state.isAllIn           || false;
    if (state.p1Name) { p2Name = state.p1Name; updateNames(); }

    if (gameIsActive && !joinerBoughtIn) {
        joinerBoughtIn = true;
        if (SystemUI.money >= BUY_IN) {
            SystemUI.money -= BUY_IN;
            SystemUI.updateMoneyDisplay();
            if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("poker");
        }
    }

    if (gameIsActive) {
        document.getElementById("start-game-btn").classList.add("hidden");
        document.getElementById("cash-out-btn").classList.remove("hidden");
    }

    renderTable();
    setStatus(state.statusMsg || (activeTurn === 2 ? "YOUR TURN" : "Opponent's Turn..."));

    if (state.matchOver) {
        if (state.joinerPayout > 0) {
            SystemUI.money += state.joinerPayout;
            SystemUI.updateMoneyDisplay();
            if (typeof SystemStats !== 'undefined') SystemStats.recordWin("poker", state.joinerPayout);
        } else {
            if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("poker");
        }
        joinerBoughtIn = false;
        setTimeout(function() {
            resetGame();
            document.getElementById("start-game-btn").classList.add("hidden");
            setStatus("Waiting for host to start new match...");
        }, 3000);
    }
}

renderTable();