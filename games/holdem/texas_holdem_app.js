// =============================================
// TEXAS HOLD 'EM — texas_holdem_app.js
// The Game Shack | Casino OS (V2 Engine)
// Modes: vs AI | Online | 2-4 Players
// =============================================

// ── 1. INITIALIZE OS & STATE ─────────────────
let gameMode = "ai";
localStorage.setItem("poker_mode", "ai"); 

let aiDifficulty = localStorage.getItem("poker_diff") || "normal";
let playerCount  = parseInt(localStorage.getItem("poker_pcount") || "2");

let myId = 1;
let currentRoomId = null;
let isHost = true; 
let chatStarted = false;
let seats = [];
let roomListener = null;

let lastPushTime = 0;
let lastSyncTime = 0;

const BUY_IN = 1000;
const BIG_BLIND = 20;
const SMALL_BLIND = 10;

// Unified Player Arrays (Index 0 is P1, Index 1 is P2, etc.)
let hands = [[], [], [], []];
let stacks = [0, 0, 0, 0];
let bets = [0, 0, 0, 0];
let folded = [false, false, false, false];
let isAllIn = [false, false, false, false];
let playerNames = ["Player 1", "AI 2", "AI 3", "AI 4"];

let deck = [];
let communityCards = [];
let allCommunityCards = [];
let pot = 0;
let dealerButton = 0; 
let activeTurn = 0; 
let currentPhase = "preflop"; 
let isGameOver = false;
let gameIsActive = false;
let currentBetToMatch = 0;
let playersActed = 0;
let joinerBoughtIn = false;
let lastActionTs = 0;

// --- CUSTOM AUDIO ---
const sfxDraw = new Audio('../../system/audio/card-draw.ogg');
const sfxPlay = new Audio('../../system/audio/card-shove-2.ogg');
const sfxWin = new Audio('../../system/audio/win.ogg');
const sfxLose = new Audio('../../system/audio/lose.ogg');

function playCustomSound(type) {
    let snd;
    if (type === 'draw' || type === 'card' || type === 'shuffle') snd = sfxDraw;
    else if (type === 'play' || type === 'chipStack') snd = sfxPlay;
    else if (type === 'win') snd = sfxWin;
    else if (type === 'lose') snd = sfxLose;
    else if (type === 'click') snd = sfxPlay;

    if (snd) {
        snd.pause();
        snd.currentTime = 0;
        snd.play().catch(e => console.log("Audio failed:", e));
    }
}

SystemUI.init({
    gameName: "TEXAS HOLD 'EM",
    rules: "Combine your two hole cards with five community cards to make the best 5-card poker hand. Standard betting: Check, Call, Raise, or Fold.",
    hudDropdowns: [
        { 
            id: "sys-poker-mode", 
            options: [ 
                { value: "ai", label: "🤖 vs AI" }, 
                { value: "online", label: "🌐 Online" } 
            ] 
        },
        {
            id: "sys-poker-count",
            label: "Players",
            options: [
                { value: "2", label: "2 Players" },
                { value: "3", label: "3 Players" },
                { value: "4", label: "4 Players" }
            ]
        },
        {
            id: "sys-poker-diff",
            label: "Level",
            options: [
                { value: "easy",   label: "Easy" },
                { value: "normal", label: "Normal" },
                { value: "hard",   label: "Hard" }
            ]
        }
    ]
});

const checkDBReadyPoker = setInterval(() => {
    if (window.db) {
        clearInterval(checkDBReadyPoker);
        initPoker();
    }
}, 50);

function initPoker() {
    const modeEl = document.getElementById("sys-poker-mode");
    const countEl = document.getElementById("sys-poker-count");
    const diffEl = document.getElementById("sys-poker-diff");

    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", (e) => {
            gameMode = e.target.value;
            localStorage.setItem("poker_mode", gameMode);
            if (gameMode === "online") { 
                document.getElementById("action-zone").classList.add("hidden");
                SystemUI.v2Lobby.show(); 
            } else {
                document.getElementById("action-zone").classList.remove("hidden");
                SystemUI.v2Lobby.hide();
                if (roomListener) { roomListener(); roomListener = null; }
                // Full teardown: deletes a hosted room / frees a joined seat and
                // stops chat. Without this, switching back to AI after hosting
                // left a ghost "waiting" room in Firebase every time.
                if (window.SystemMatch) SystemMatch.cleanup();
                chatStarted = false;
                currentRoomId = null;
                myId = 1; isHost = true;
                joinerBoughtIn = false; lastSyncTime = 0; lastActionTs = 0;
                resetGame();
            }
        });
    }

    if (countEl) {
        countEl.value = playerCount;
        countEl.addEventListener("change", (e) => {
            playerCount = parseInt(e.target.value);
            localStorage.setItem("poker_pcount", playerCount);
            resetGame();
        });
    }

    if (diffEl) {
        diffEl.value = aiDifficulty;
        diffEl.addEventListener("change", (e) => {
            aiDifficulty = e.target.value;
            localStorage.setItem("poker_diff", aiDifficulty);
            resetGame();
        });
    }

    // Hand Guide Listeners
    document.getElementById("btn-show-guide").addEventListener("click", () => {
        document.getElementById("hand-guide-modal").classList.remove("hidden");
    });
    document.getElementById("close-guide-btn").addEventListener("click", () => {
        document.getElementById("hand-guide-modal").classList.add("hidden");
    });
    
    resetGame();
}

// ── UNIVERSAL BETTING SETUP ───────────────────
let selectedBet = 0;
SystemUI.setupBetting("os-betting-rack", {
    onBet: function(val) {
        if (!gameIsActive || isGameOver || activeTurn !== (myId - 1)) return;
        const diff = currentBetToMatch - bets[myId - 1];
        const minRaise = diff > 0 ? diff + BIG_BLIND : BIG_BLIND;
        
        if (selectedBet + val > stacks[myId - 1]) {
            showToast("Not Enough Cash", "You don't have enough chips.");
            return;
        }
        playCustomSound(selectedBet === 0 ? 'click' : 'play');
        selectedBet += val;
        SystemUI.updateBetDisplay(selectedBet);
        
        const raiseBtn = document.getElementById("btn-raise");
        if (selectedBet >= minRaise || selectedBet === stacks[myId - 1]) {
            raiseBtn.disabled = false;
            raiseBtn.innerText = (selectedBet === stacks[myId - 1]) ? "ALL IN $" + selectedBet : "Raise $" + selectedBet;
        } else {
            raiseBtn.disabled = true;
            raiseBtn.innerText = "Raise (Min $" + minRaise + ")";
        }
    },
    onClear: function() {
        if (!gameIsActive || isGameOver || activeTurn !== (myId - 1)) return;
        selectedBet = 0;
        SystemUI.updateBetDisplay(selectedBet);
        document.getElementById("btn-raise").disabled = true;
        document.getElementById("btn-raise").innerText = "Raise";
    }
});

// ── 3. CARD & HAND LOGIC ──────────────────────
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function buildDeck() {
    deck = [];
    for (let s of SUITS) {
        for (let r of RANKS) { deck.push({ rank: r, suit: s }); }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function getRankValue(rank) {
    if (rank === 'T') return 10; if (rank === 'J') return 11;
    if (rank === 'Q') return 12; if (rank === 'K') return 13;
    if (rank === 'A') return 14; return parseInt(rank);
}

function evaluateHand(cards) {
    let evalCards = [...cards];
    while (evalCards.length < 5) evalCards.push({ rank: '2', suit: 'none' + Math.random() });
    
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
        
        if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
            isStraight = true; ranks = [5, 4, 3, 2, 1]; 
        } else if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
            isStraight = true;
        }
        
        let groups = Object.keys(rankCounts).map(r => ({ rank: parseInt(r), count: rankCounts[r] }));
        groups.sort((a, b) => (a.count !== b.count) ? b.count - a.count : b.rank - a.rank);
        
        let type = 0; let label = "High Card";
        if (isStraight && isFlush) { type = 8; label = "Straight Flush"; }
        else if (groups[0].count === 4) { type = 7; label = "Four of a Kind"; }
        else if (groups[0].count === 3 && groups[1].count === 2) { type = 6; label = "Full House"; }
        else if (isFlush) { type = 5; label = "Flush"; }
        else if (isStraight) { type = 4; label = "Straight"; }
        else if (groups[0].count === 3) { type = 3; label = "Three of a Kind"; }
        else if (groups[0].count === 2 && groups[1].count === 2) { type = 2; label = "Two Pair"; }
        else if (groups[0].count === 2) { type = 1; label = "Pair"; }
        
        let score = type * 10000000000 + groups[0].rank * 100000000 + (groups.length > 1 ? groups[1].rank * 1000000 : 0) + (groups.length > 2 ? groups[2].rank * 10000 : 0) + (groups.length > 3 ? groups[3].rank * 100 : 0) + (groups.length > 4 ? groups[4].rank : 0);
        if (score > bestScore) { bestScore = score; bestLabel = label; }
    }
    return { score: bestScore, label: bestLabel };
}

function getCombinations(array, size) {
    let result = [];
    function p(t, i) {
        if (t.length === size) { result.push(t); return; }
        if (i + 1 <= array.length) { p(t.concat([array[i]]), i + 1); p(t, i + 1); }
    }
    p([], 0); return result;
}

// ── 4. UI RENDERING ───────────────────────────
function renderTable() {
    const ids = {
        bottom: { name: "player-name", stack: "player-stack", cards: "player-cards", chips: "player-table-chips", bubble: "player-bet-bubble", dealer: "player-dealer-button", area: "player-area" },
        top:    { name: "opp-name", stack: "opp-stack", cards: "opp-cards", chips: "opp-table-chips", bubble: "opp-bet-bubble", dealer: "opp-dealer-button", area: "opponent-area" },
        left:   { name: "left-name", stack: "left-stack", cards: "left-cards", chips: "left-table-chips", bubble: "left-bet-bubble", dealer: "left-dealer-button", area: "left-area" },
        right:  { name: "right-name", stack: "right-stack", cards: "right-cards", chips: "right-table-chips", bubble: "right-bet-bubble", dealer: "right-dealer-button", area: "right-area" }
    };
    
    const seatMap = { 
        2: { bottom: 0, top: 1 }, 
        3: { bottom: 0, left: 1, right: 2 }, 
        4: { bottom: 0, left: 1, top: 2, right: 3 } 
    };
    
    const config = seatMap[playerCount] || seatMap[2];

    ["opponent-area", "left-area", "right-area"].forEach(id => document.getElementById(id).classList.add("hidden"));

    Object.entries(config).forEach(([pos, relIdx]) => {
        const pIdx = (myId - 1 + relIdx) % playerCount;
        const ui = ids[pos];
        const areaEl = document.getElementById(ui.area);
        if (!areaEl) return;

        areaEl.classList.remove("hidden");
        document.getElementById(ui.name).innerText = playerNames[pIdx];
        document.getElementById(ui.stack).innerText = stacks[pIdx];
        
        const cardBox = document.getElementById(ui.cards);
        cardBox.innerHTML = '';
        
        if (hands[pIdx]) {
            hands[pIdx].forEach(c => {
                let isHidden = (pIdx !== (myId-1) && currentPhase !== 'showdown' && !isGameOver);
                // Reveal if someone is All-In and we aren't in preflop
                if (isAllIn.some(val => val === true) && currentPhase !== 'preflop') isHidden = false;
                cardBox.appendChild(createCardUI(c, isHidden));
            });
        }

        SystemUI.renderTableStacks(bets[pIdx], ui.chips);
        document.getElementById(ui.bubble).innerText = "Bet: $" + bets[pIdx];
        document.getElementById(ui.bubble).classList.toggle("hidden", bets[pIdx] === 0);
        document.getElementById(ui.dealer).classList.toggle("hidden", dealerButton !== pIdx);
        
        cardBox.style.opacity = (folded[pIdx]) ? "0.3" : "1";
        
        const nameEl = document.getElementById(ui.name);
        if (pIdx === activeTurn && gameIsActive && !isGameOver) {
            nameEl.style.color = "#2ecc71";
            nameEl.style.textShadow = "0 0 10px #2ecc71";
        } else {
            nameEl.style.color = "#f1c40f";
            nameEl.style.textShadow = "none";
        }
    });

    const ccBox = document.getElementById("community-cards");
    ccBox.innerHTML = ''; 
    communityCards.forEach(c => ccBox.appendChild(createCardUI(c)));
    
    document.getElementById("main-pot").innerText = "POT: $" + pot;
    document.getElementById("main-pot").classList.toggle("hidden", pot === 0);
    SystemUI.renderTableStacks(pot, "main-pot-chips");
    updateControls();
}

function createCardUI(card, isHidden = false) {
    const el = document.createElement("div"); el.className = "card";
    if (isHidden) el.classList.add("hidden-card");
    else {
        const suitMap = { s: "Spades", h: "Hearts", d: "Diamonds", c: "Clubs" }, rankMap = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
        el.innerHTML = `<img src="../../system/images/cards/standard/card${suitMap[card.suit]}${rankMap[card.rank]||card.rank}.png" style="width:100%;height:100%;border-radius:6px;">`;
    }
    return el;
}

function updateControls() {
    const ctrl = document.getElementById("poker-controls");
    const myTurn = (activeTurn === (myId - 1));
    if (!gameIsActive || isGameOver || !myTurn || isAllIn[myId-1]) {
        ctrl.classList.add("hidden"); SystemUI.enableBetting(false); return;
    }
    ctrl.classList.remove("hidden"); SystemUI.enableBetting(true);
    const callBtn = document.getElementById("btn-check-call");
    const diff = currentBetToMatch - bets[myId - 1];
    callBtn.innerText = (diff > 0) ? "Call $" + diff : "Check";
}

// ── 5. GAME LOGIC ─────────────────────────────
function startGame() {
    if (gameMode === "online" && !isHost) return; // joiners mirror host state; never self-start
    if (SystemUI.money < BUY_IN) {
        showToast("Error", "Need $" + BUY_IN + " to buy in!");
        // Online: the room status may already be 'playing' — revert it so the room isn't bricked.
        if (gameMode === "online" && isHost && currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'holdem_rooms/' + currentRoomId), { status: "waiting" });
            SystemUI.v2Lobby.show();
        }
        return;
    }
    SystemUI.money -= BUY_IN; SystemUI.updateMoneyDisplay();
    
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("poker");

    for (let i = 0; i < playerCount; i++) stacks[i] = BUY_IN;
    
    gameIsActive = true; 
    dealerButton = Math.floor(Math.random() * playerCount);
    
    document.getElementById("start-game-btn").classList.add("hidden");
    document.getElementById("cash-out-btn").classList.remove("hidden");
    startNewHand();
}

function getNextActive(currentIndex) {
    let next = currentIndex;
    let safeguard = 0;
    do {
        next = (next + 1) % playerCount;
        safeguard++;
        if(safeguard > 10) return next;
    } while (folded[next] || (stacks[next] === 0 && !isAllIn[next]));
    return next;
}

function startNewHand() {
    buildDeck(); hands = [[],[],[],[]]; bets = [0,0,0,0]; folded = [false,false,false,false]; isAllIn = [false,false,false,false];
    communityCards = []; pot = 0; currentPhase = "preflop"; isGameOver = false; playersActed = 0;
    
    for (let i=0; i<playerCount; i++) {
        if (stacks[i] > 0) hands[i] = [deck.pop(), deck.pop()];
        else folded[i] = true;
    }

    dealerButton = (dealerButton + 1) % playerCount;
    let sbIdx = getNextActive(dealerButton);
    let bbIdx = getNextActive(sbIdx);
    
    postBet(sbIdx, SMALL_BLIND); 
    postBet(bbIdx, BIG_BLIND);
    
    currentBetToMatch = BIG_BLIND; 
    activeTurn = getNextActive(bbIdx);
    
    playCustomSound('shuffle'); 
    setStatus("Pre-flop"); 
    renderTable();

    if (gameMode === "online") {
        allCommunityCards = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    }
    
    checkAITurn(); 
    if (gameMode === "online" && isHost) pushHostState();
}

function postBet(pIdx, amt) {
    let actual = Math.min(amt, stacks[pIdx]); 
    stacks[pIdx] -= actual; 
    bets[pIdx] += actual;
    if (stacks[pIdx] === 0) isAllIn[pIdx] = true;
}

function handleAction(type, amount = 0) {
    if (activeTurn !== (myId - 1) || isGameOver) return;
    if (gameMode === "online" && !isHost) { sendJoinerAction(type, amount); return; }
    applyAction(myId - 1, type, amount);
}

// Core action executor — used for the local player, AI seats, and joiner actions
// relayed to the host. handleAction() keeps the "is it my seat" guard for clicks.
function applyAction(pIdx, type, amount = 0) {
    if (isGameOver || activeTurn !== pIdx) return;

    playersActed++;
    if (type === 'fold') { folded[pIdx] = true; playCustomSound('card'); }
    else if (type === 'check-call') {
        const diff = currentBetToMatch - bets[pIdx];
        if (diff > 0) { postBet(pIdx, diff); playCustomSound('play'); } else playCustomSound('click');
    } else if (type === 'raise') {
        postBet(pIdx, amount);
        currentBetToMatch = bets[pIdx];
        playersActed = 1;
        playCustomSound('play');
    }
    advanceTurn();
}

function advanceTurn() {
    let unfolded = folded.filter(f => !f);
    if (unfolded.length === 1) {
        isGameOver = true; 
        let winIdx = folded.findIndex(f => !f);
        stacks[winIdx] += (pot + bets.reduce((a,b)=>a+b,0));
        setStatus(playerNames[winIdx] + " wins (Everyone folded).");
        if (gameMode === "online" && isHost) pushHostState();
        setTimeout(startNewHand, 2500); return;
    }

    let activeIndices = []; 
    for (let i=0; i<playerCount; i++) if(!folded[i] && !isAllIn[i]) activeIndices.push(i);
    
    if (activeIndices.length <= 1 || (playersActed >= activeIndices.length && activeIndices.every(i => bets[i] === currentBetToMatch))) {
        advancePhase();
    } else { 
        activeTurn = (activeTurn + 1) % playerCount; 
        while(folded[activeTurn] || isAllIn[activeTurn]) activeTurn = (activeTurn + 1) % playerCount; 
        renderTable(); 
        checkAITurn(); 
        if(gameMode === "online" && isHost) pushHostState(); 
    }
}

function advancePhase() {
    bets.forEach((b,i) => { pot += b; bets[i] = 0; }); 
    currentBetToMatch = 0; 
    playersActed = 0;
    
    if (currentPhase === "preflop") { 
        currentPhase = "flop"; 
        for(let i=0; i<3; i++) communityCards.push(gameMode==="online" ? allCommunityCards[i] : deck.pop()); 
    }
    else if (currentPhase === "flop") { 
        currentPhase = "turn"; 
        communityCards.push(gameMode==="online" ? allCommunityCards[3] : deck.pop()); 
    }
    else if (currentPhase === "turn") { 
        currentPhase = "river"; 
        communityCards.push(gameMode==="online" ? allCommunityCards[4] : deck.pop()); 
    }
    else { showdown(); return; }

    playCustomSound('card'); 
    activeTurn = getNextActive(dealerButton);
    setStatus(currentPhase.toUpperCase()); 
    renderTable(); 
    checkAITurn(); 
    if (gameMode === "online" && isHost) pushHostState();
}

function showdown() {
    isGameOver = true; 
    let best = -1, winners = [];
    for (let i=0; i<playerCount; i++) if(!folded[i]) {
        let res = evaluateHand([...hands[i], ...communityCards]);
        if (res.score > best) { best = res.score; winners = [i]; } 
        else if (res.score === best) winners.push(i);
    }
    
    let label = evaluateHand([...hands[winners[0]], ...communityCards]).label;
    winners.forEach(w => stacks[w] += Math.floor(pot/winners.length)); 
    pot = 0; 
    renderTable();
    
    setStatus(winners.length === 1 ? playerNames[winners[0]] + " wins with " + label : "Split Pot (" + label + ")");
    if (winners.includes(myId-1)) playCustomSound('win'); else playCustomSound('lose');
    
    if (gameMode === "online" && isHost) pushHostState(); 
    setTimeout(startNewHand, 3500);
}

function setStatus(msg) { document.getElementById("game-status-text").innerText = msg; }

function resetGame() { 
    gameIsActive = false; hands=[[],[],[],[]]; stacks=[0,0,0,0]; bets=[0,0,0,0]; 
    folded=[false,false,false,false]; communityCards=[]; pot=0; 
    document.getElementById("start-game-btn").classList.remove("hidden"); 
    document.getElementById("cash-out-btn").classList.add("hidden");
    setStatus("Waiting to start..."); 
    renderTable(); 
}

// ── 6. AI LOGIC ───────────────────────────────
let aiActionToken = 0; // invalidates stale scheduled AI actions (guards double-fire)
function checkAITurn() {
    if (isGameOver || activeTurn === (myId-1)) return;
    if (gameMode === "online") {
        // SystemMatch fills unjoined seats with AI — the HOST must play them.
        if (!isHost) return;
        const seat = seats[activeTurn];
        if (!seat || seat.type !== "ai") return;
    }
    const token = ++aiActionToken;
    const turnAtSchedule = activeTurn;
    const phaseAtSchedule = currentPhase;
    setTimeout(() => {
        if (token !== aiActionToken) return;
        if (isGameOver || activeTurn !== turnAtSchedule || currentPhase !== phaseAtSchedule) return;
        aiAction();
    }, 1200);
}

function aiAction() {
    if (isGameOver || activeTurn === (myId-1)) return;
    const pIdx = activeTurn;
    const diff = currentBetToMatch - bets[pIdx];
    const canCheck = (diff === 0);
    
    let currentBest = evaluateHand([...hands[pIdx], ...communityCards]);
    let handRank = Math.floor(currentBest.score / 10000000000);
    
    let action = "check-call";
    let raiseAmt = 0;
    let r = Math.random();
    
    if (aiDifficulty === "easy") {
        if (!canCheck && r < 0.3) action = "fold";
    } else if (aiDifficulty === "normal") {
        if (!canCheck && handRank === 0 && diff > BIG_BLIND * 2 && r < 0.5) action = "fold";
        else if (handRank >= 2 && r < 0.3 && stacks[pIdx] > BIG_BLIND) {
            action = "raise"; raiseAmt = diff + BIG_BLIND;
        }
    } else if (aiDifficulty === "hard") {
        if (handRank >= 1 && r < 0.5 && stacks[pIdx] > BIG_BLIND) {
            action = "raise"; raiseAmt = diff + (BIG_BLIND * 2);
        } else if (handRank === 0 && !canCheck && r < 0.6) {
            if (r < 0.2) { action = "raise"; raiseAmt = diff + BIG_BLIND; }
            else action = "fold";
        }
    }
    
    if (action === "raise" && raiseAmt > stacks[pIdx]) raiseAmt = stacks[pIdx];
    if (action === "raise" && raiseAmt === 0) action = "check-call";

    if (action === "fold") applyAction(pIdx, 'fold');
    else if (action === "raise") applyAction(pIdx, 'raise', raiseAmt);
    else applyAction(pIdx, 'check-call');
}

// ── 7. UI EVENTS ──────────────────────────────
document.getElementById("start-game-btn").addEventListener("click", startGame);

document.getElementById("cash-out-btn").addEventListener("click", () => {
    if (confirm("Cash out $" + stacks[myId - 1] + "?")) {
        SystemUI.money += stacks[myId - 1];
        SystemUI.updateMoneyDisplay();
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("poker", stacks[myId - 1]);
        resetGame();
    }
});

document.getElementById("btn-fold").addEventListener("click", () => handleAction('fold'));
document.getElementById("btn-check-call").addEventListener("click", () => handleAction('check-call'));
document.getElementById("btn-raise").addEventListener("click", () => handleAction('raise', selectedBet));

function showToast(title, msg) { 
    document.getElementById("modal-title").innerText = title; 
    document.getElementById("modal-message").innerText = msg; 
    document.getElementById("toast-modal").classList.remove("hidden"); 
    setTimeout(() => document.getElementById("toast-modal").classList.add("hidden"), 3000); 
}

// ── 8. ONLINE MULTIPLAYER ──────────────────────
function setupOnlineMode() {
    SystemMatch.setup({
        gameId:   "holdem",
        roomPath: "holdem_rooms",
        autoShow: false,
        getSeatCount: () => playerCount,
        buildSeats: (count) => {
            const out = [{ type: "human", name: SystemUI.getPlayerName() }];
            for (let i = 1; i < count; i++) out.push({ type: "ai", name: "AI " + (i + 1) });
            return out;
        },
        extraRoomFields: () => ({ ts: Date.now() }),
        settingsConfig: [
            { id: "lobby-count", label: "PLAYERS", type: "select", default: playerCount, options: [{value:2, label:"2"},{value:3, label:"3"},{value:4, label:"4"}] }
        ],
        onSettingsRendered: () => updateLobbyPreview(),
        onSettingChange: (key, val) => {
            if (key === "lobby-count") playerCount = parseInt(val);
            updateLobbyPreview();
            if (isHost && currentRoomId && key === "lobby-count") {
                SystemMatch.resizeSeats(playerCount);
                seats = SystemMatch.getSeats();
            }
        },
        onHost: (roomId) => {
            currentRoomId = roomId;
            isHost = true; myId = 1;
            lastSyncTime = 0; lastActionTs = 0; joinerBoughtIn = false;
            seats = SystemMatch.getSeats();
            listenToRoom();
        },
        onJoin: (roomId) => {
            currentRoomId = roomId;
            isHost = false;
            lastSyncTime = 0; lastActionTs = 0; joinerBoughtIn = false;
            myId = SystemMatch.getMyId();
            seats = SystemMatch.getSeats();
            listenToRoom();
        },
        onLeave: () => {
            // Joiner leaving mid-hand: flag the room so the host doesn't wait on a dead seat,
            // and cash their remaining stack back out before the reload wipes local state.
            if (!isHost && currentRoomId && gameIsActive && window.db && window.dbUpdate) {
                try { window.dbUpdate(window.dbRef(window.db, 'holdem_rooms/' + currentRoomId), { status: "abandoned" }); } catch (e) {}
            }
            if (!isHost && joinerBoughtIn && gameIsActive && stacks[myId - 1] > 0) {
                SystemUI.money += stacks[myId - 1];
                SystemUI.updateMoneyDisplay();
            }
            location.reload();
        },
        onStart: () => {
            if (SystemUI.money < BUY_IN) {
                // SystemMatch already flipped status to 'playing' — revert it and say why.
                showToast("Insufficient Funds", "You need $" + BUY_IN + " to buy in!");
                if (currentRoomId && window.db) {
                    window.dbUpdate(window.dbRef(window.db, 'holdem_rooms/' + currentRoomId), { status: "waiting" });
                }
                return;
            }
            if (currentRoomId && window.db) {
                window.dbUpdate(window.dbRef(window.db, 'holdem_rooms/' + currentRoomId), { status: "playing", ts: Date.now() });
            }
        }
    });
}

// Exit online mode back to local play (host left / opponent abandoned).
function exitOnlineToLocal(hostGone) {
    // Cash the local player's live stack back out before wiping state.
    const mySeat = myId - 1;
    if (gameIsActive && stacks[mySeat] > 0 && (isHost || joinerBoughtIn)) {
        SystemUI.money += stacks[mySeat];
        SystemUI.updateMoneyDisplay();
    }
    if (roomListener) { roomListener(); roomListener = null; }
    if (hostGone) SystemMatch._roomId = null; // node already deleted — stop cleanup() writing a ghost room
    SystemMatch.cleanup();
    chatStarted = false;
    currentRoomId = null;
    joinerBoughtIn = false;
    lastSyncTime = 0; lastActionTs = 0;
    gameMode = "ai"; isHost = true; myId = 1;
    localStorage.setItem("poker_mode", "ai");
    const modeEl = document.getElementById("sys-poker-mode");
    if (modeEl) modeEl.value = "ai";
    if (SystemUI.v2Lobby) SystemUI.v2Lobby.hide();
    document.getElementById("action-zone").classList.remove("hidden");
    resetGame();
}

// Joiner closing the tab mid-hand: tell the host instead of leaving a frozen human seat.
window.addEventListener("beforeunload", () => {
    if (gameMode === "online" && !isHost && currentRoomId && gameIsActive && window.db && window.dbUpdate) {
        try { window.dbUpdate(window.dbRef(window.db, 'holdem_rooms/' + currentRoomId), { status: "abandoned" }); } catch (e) {}
    }
});

function updateLobbyPreview() {
    const slots = [{ type: "host", name: SystemUI.getPlayerName(), color: "#e74c3c" }];
    for (let i = 1; i < playerCount; i++) slots.push({ type: "ai", name: "AI " + (i + 1), color: "#3498db" });
    SystemUI.v2Lobby.updatePreview(slots);
}

function listenToRoom() {
    roomListener = window.dbOnValue(window.dbRef(window.db, 'holdem_rooms/' + currentRoomId), (snap) => {
        const data = snap.val();
        if (!data) {
            // Host left — SystemMatch deletes the room node. Don't leave the joiner frozen.
            if (!isHost) {
                showToast("Host Left", "The host closed the room.");
                exitOnlineToLocal(true);
            }
            return;
        }
        if (data.status === "abandoned") {
            if (isHost) {
                showToast("Opponent Left", "A player abandoned the match.");
                exitOnlineToLocal(false);
            }
            return;
        }
        seats = data.seats || []; SystemUI.v2Lobby.renderSeats(seats); playerNames = seats.map(s => s.name);
        playerCount = seats.length;
        // Keep SystemMatch's seat snapshot fresh — _releaseSeat writes the whole
        // seats array back, and a stale copy could clobber another joiner's seat.
        if (window.SystemMatch) SystemMatch.setSeats(seats);
        if (data.status === "playing") {
            SystemUI.v2Lobby.hide(); document.getElementById("action-zone").classList.remove("hidden");
            if (!chatStarted) { chatStarted = true; SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); }
            if (isHost && !gameIsActive) startGame(); else if (!isHost && data.gameState) applyHostState(data.gameState);
        }
        if (isHost && data.playerAction && data.playerAction.ts !== lastActionTs) {
            lastActionTs = data.playerAction.ts; processJoinerAction(data.playerAction);
        }
    });
    SystemMatch.setListener(roomListener);
}

function pushHostState() {
    if (gameMode !== "online" || !isHost || !currentRoomId || !window.db) return;
    // JSON string payload: RTDB deletes empty arrays ([] communityCards/hands at preflop),
    // which crashed the joiner's renderTable. A string round-trips them intact.
    window.dbUpdate(window.dbRef(window.db, 'holdem_rooms/' + currentRoomId), {
        gameState: JSON.stringify({ hands, allCommunityCards, communityCards, pot, bets, stacks, folded, isAllIn, activeTurn, currentPhase, dealerButton, isGameOver, gameIsActive, currentBetToMatch, ts: Date.now() })
    });
}

function sendJoinerAction(type, amount) {
    window.dbUpdate(window.dbRef(window.db, 'holdem_rooms/' + currentRoomId), { 
        playerAction: { action: type, amount, pIdx: (myId - 1), ts: Date.now() } 
    });
}

function processJoinerAction(p) { if (activeTurn === p.pIdx) applyAction(p.pIdx, p.action, p.amount); }

function applyHostState(stateJson) {
    let s;
    try {
        s = typeof stateJson === "string" ? JSON.parse(stateJson) : stateJson;
    } catch (e) { console.error("Poker sync error:", e); return; }
    if (!s || !s.ts || s.ts <= lastSyncTime) return; lastSyncTime = s.ts;

    // Default every array — belt and braces against stripped keys from older payloads.
    hands = s.hands || [[], [], [], []];
    for (let i = 0; i < hands.length; i++) { if (!hands[i]) hands[i] = []; }
    allCommunityCards = s.allCommunityCards || [];
    communityCards = s.communityCards || [];
    pot = s.pot || 0;
    bets = s.bets || [0, 0, 0, 0];
    stacks = s.stacks || [0, 0, 0, 0];
    folded = s.folded || [false, false, false, false];
    isAllIn = s.isAllIn || [false, false, false, false];
    activeTurn = s.activeTurn || 0;
    currentPhase = s.currentPhase || "preflop";
    dealerButton = s.dealerButton || 0;
    isGameOver = !!s.isGameOver;
    gameIsActive = !!s.gameIsActive;
    currentBetToMatch = s.currentBetToMatch || 0;

    // Joiner economy: pay the buy-in once, when we're dealt into our first hand
    // (mirrors the host's deduction in startGame). Cash-out credits the stack later.
    if (!isHost && !joinerBoughtIn && gameIsActive && hands[myId - 1] && hands[myId - 1].length > 0) {
        joinerBoughtIn = true;
        SystemUI.money -= BUY_IN;
        SystemUI.updateMoneyDisplay();
        if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("poker");
    }
    if (!isHost && gameIsActive) {
        document.getElementById("start-game-btn").classList.add("hidden");
        document.getElementById("cash-out-btn").classList.add("hidden");
    }

    renderTable();
    setStatus(activeTurn === (myId - 1) ? "YOUR TURN" : (playerNames[activeTurn] || ("Player " + (activeTurn + 1))).toUpperCase() + "'S TURN");
}

setupOnlineMode();