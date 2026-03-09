// ==========================================
// 1. SYSTEM UI & AUDIO SETUP
// ==========================================
let gameMode = "ai"; // FIX: ALWAYS default to vs AI on launch
localStorage.setItem("poker_mode", "ai"); // Clear any cached online state

let aiDifficulty = localStorage.getItem("poker_diff") || "normal";

SystemUI.init({
    gameName: "TEXAS HOLD 'EM",
    rules: "Form the best 5-card hand using your 2 hole cards and the 5 community cards. Match bets to stay in the hand.",
    hudDropdowns: [
        {
            id: "sys-poker-mode",
            options: [
                { value: "ai",     label: "🤖 vs AI" },
                { value: "local",  label: "👥 Hotseat" },
                { value: "online", label: "🌐 Online" }
            ]
        },
        {
            id: "sys-poker-diff",
            options: [
                { value: "normal", label: "Normal AI" },
                { value: "hard",   label: "Hard AI" }
            ]
        }
    ]
});

// ==========================================
// 2. MULTIPLAYER & MODES (V2 Engine)
// ==========================================
let currentRoomId = null;
let isHost = true; // FIX: Default to host so the local start button works perfectly
let myId = 1; 
let chatStarted = false; 
let seats = [];
let roomListener = null;

// Sync dropdowns after SystemUI injects them
setTimeout(() => {
    const modeSelect = document.getElementById("sys-poker-mode");
    const diffSelect = document.getElementById("sys-poker-diff");
    
    if (modeSelect) {
        modeSelect.value = gameMode;
        modeSelect.addEventListener("change", (e) => {
            gameMode = e.target.value;
            localStorage.setItem("poker_mode", gameMode);
            document.getElementById("sys-modal").classList.add("sys-hidden");
            updateLabels();
            
            if (gameMode === "online") {
                SystemUI.v2Lobby.show();
            } else {
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat(); chatStarted = false;
                myId = 1;
                isHost = true;
                if (roomListener) { roomListener(); roomListener = null; }
            }
        });
    }
    
    if (diffSelect) {
        diffSelect.value = aiDifficulty;
        diffSelect.addEventListener("change", (e) => {
            aiDifficulty = e.target.value;
            localStorage.setItem("poker_diff", aiDifficulty);
            updateLabels();
        });
    }
    
    updateLabels();
}, 10);

function updateLabels() {
    document.getElementById("player-name").innerText = SystemUI.getPlayerName();
    if (gameMode === "ai") {
        document.getElementById("opp-name").innerText = `AI (${aiDifficulty})`;
        document.getElementById("sys-poker-diff").style.display = "inline-block";
    } else if (gameMode === "online") {
        const opp = myId === 1 ? (seats[1]?.name || "Opponent") : (seats[0]?.name || "Opponent");
        document.getElementById("opp-name").innerText = opp;
        document.getElementById("sys-poker-diff").style.display = "none";
    } else {
        document.getElementById("opp-name").innerText = "Opponent";
        document.getElementById("sys-poker-diff").style.display = "none";
    }
}

const sfxCard = new Audio('../../system/audio/card-slide-6.ogg');
const sfxChip = new Audio('../../system/audio/chip-lay-1.ogg');

function playFastSound(audioObj) {
    if (SystemUI.isMuted) return;
    audioObj.pause();
    audioObj.currentTime = 0;
    audioObj.play().catch(e => console.log("Audio blocked", e));
}

function showToast(title, message) {
    document.getElementById("modal-title").innerText = title;
    document.getElementById("modal-message").innerText = message;
    const overlay = document.getElementById("toast-modal");
    overlay.classList.remove("hidden");
    setTimeout(() => overlay.classList.add("hidden"), 3500);
}

// ==========================================
// QOL: HAND GUIDE
// ==========================================
document.getElementById("btn-show-guide").addEventListener("click", () => {
    document.getElementById("hand-guide-modal").classList.remove("hidden");
});
document.getElementById("close-guide-btn").addEventListener("click", () => {
    document.getElementById("hand-guide-modal").classList.add("hidden");
});

// ==========================================
// 3. DECK & GAME VARIABLES
// ==========================================
let deck = [];
let myCards = [];
let oppCards = [];
let communityCards = [];

let pot = 0;
let myRoundBet = 0;
let oppRoundBet = 0;
let myStack = 0; 
let oppStack = 0;

const BUY_IN_AMOUNT = 1000;
let currentPhase = "idle"; 
let currentTurn = 1;
let playerHasActed = false;
let oppHasActed = false;

// ==========================================
// 4. OS BETTING INTEGRATION
// ==========================================
let rackBetAmount = 0;

SystemUI.setupBetting("os-betting-rack", {
    onBet: function(val) {
        if (currentPhase === "idle" || currentPhase === "showdown" || currentTurn !== 1) return;
        
        let callAmount = oppRoundBet - myRoundBet;
        let maxRaise = myStack - callAmount;
        
        if (rackBetAmount + val > maxRaise) {
            SystemUI.playSound('lose'); 
            return;
        }
        
        rackBetAmount += val;
        playFastSound(sfxChip);
        updateActionButtons();
    },
    onClear: function() {
        if (currentPhase === "idle" || currentPhase === "showdown" || currentTurn !== 1) return;
        rackBetAmount = 0;
        updateActionButtons();
    }
});

// ==========================================
// 5. DECK ENGINE & ECONOMY
// ==========================================
function buildDeck() {
    deck = [];
    const suits = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
    const values = [
        { name: '2', val: 2 }, { name: '3', val: 3 }, { name: '4', val: 4 }, { name: '5', val: 5 }, 
        { name: '6', val: 6 }, { name: '7', val: 7 }, { name: '8', val: 8 }, { name: '9', val: 9 }, 
        { name: '10', val: 10 }, { name: 'J', val: 11 }, { name: 'Q', val: 12 }, { name: 'K', val: 13 }, { name: 'A', val: 14 }
    ];
    suits.forEach(suit => {
        values.forEach(v => {
            deck.push({ suit: suit, name: v.name, value: v.val, img: `../../system/images/cards/standard/card${suit}${v.name}.png` });
        });
    });
}

function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

// Buy In & Cash Out Logic
document.getElementById("start-game-btn").addEventListener("click", () => {
    if (gameMode === "online" && myId === 2) return; 

    if (myStack <= 0) {
        if (SystemUI.money < BUY_IN_AMOUNT) {
            showToast("Insufficient Funds", "You don't have enough in your Casino Bankroll to buy in!");
            return;
        }
        SystemUI.money -= BUY_IN_AMOUNT;
        SystemUI.updateMoneyDisplay();
        myStack = BUY_IN_AMOUNT;
        oppStack = BUY_IN_AMOUNT; 
        SystemUI.playSound('chipStack');
    }
    
    document.getElementById("pre-game-controls").classList.add("hidden");
    document.getElementById("poker-controls").classList.remove("hidden");
    startHand();
});

document.getElementById("cash-out-btn").addEventListener("click", () => {
    if (myStack > 0) {
        SystemUI.money += myStack;
        SystemUI.updateMoneyDisplay();
        SystemUI.playSound('win');
        showToast("Cashed Out!", `You deposited $${myStack} back into your bankroll.`);
        
        myStack = 0;
        oppStack = 0;
        updateUI();
        document.getElementById("start-game-btn").innerText = `BUY IN ($${BUY_IN_AMOUNT})`;
        document.getElementById("cash-out-btn").classList.add("hidden");
    }
});

function startHand() {
    buildDeck();
    shuffleDeck();
    
    myCards = [deck.pop(), deck.pop()];
    oppCards = [deck.pop(), deck.pop()];
    communityCards = [];
    
    pot = 0; myRoundBet = 0; oppRoundBet = 0;
    playerHasActed = false; oppHasActed = false;
    rackBetAmount = 0;
    currentPhase = "pre-flop";
    currentTurn = 1; 
    
    placeBet(1, 10); // Small Blind
    placeBet(2, 10); // Big Blind
    
    updateUI(true); 
    setStatus("Pre-Flop: Your Turn");
    updateActionButtons();
    if (gameMode === "online") pushToFirebase();
}

function splashChipsToPot() {
    myRoundBet = 0; oppRoundBet = 0;
    playFastSound(sfxChip);
    updateUI();
}

function advancePhase() {
    splashChipsToPot();
    
    if (currentPhase === "pre-flop") {
        currentPhase = "flop";
        deck.pop(); communityCards.push(deck.pop(), deck.pop(), deck.pop());
        setStatus("The Flop. Your Turn.");
    } else if (currentPhase === "flop") {
        currentPhase = "turn";
        deck.pop(); communityCards.push(deck.pop());
        setStatus("The Turn. Your Turn.");
    } else if (currentPhase === "turn") {
        currentPhase = "river";
        deck.pop(); communityCards.push(deck.pop());
        setStatus("The River. Your Turn.");
    } else if (currentPhase === "river") {
        currentPhase = "showdown";
        executeShowdown();
        return;
    }
    
    currentTurn = 1; 
    rackBetAmount = 0;
    SystemUI.updateBetDisplay(0);
    updateUI(true);
    updateActionButtons();
    if (gameMode === "online") pushToFirebase();
}

// ==========================================
// 6. PLAYER ACTIONS & SMART AI
// ==========================================
function placeBet(playerNum, amount) {
    if (playerNum === 1) {
        let act = Math.min(amount, myStack);
        myStack -= act; myRoundBet += act; pot += act;
    } else {
        let act = Math.min(amount, oppStack);
        oppStack -= act; oppRoundBet += act; pot += act;
    }
    playFastSound(sfxChip);
}

document.getElementById("btn-fold").addEventListener("click", () => {
    setStatus("You Folded."); oppStack += pot; endHand();
    if (gameMode === "online") pushToFirebase();
});

document.getElementById("btn-check-call").addEventListener("click", () => {
    playerHasActed = true;
    let callAmount = oppRoundBet - myRoundBet;
    if (callAmount > 0) { placeBet(1, callAmount); setStatus("You Called."); } 
    else { setStatus("You Checked."); }
    
    rackBetAmount = 0;
    updateUI();
    checkPhaseAdvance();
    if (gameMode === "online") pushToFirebase();
});

document.getElementById("btn-raise").addEventListener("click", () => {
    if (rackBetAmount <= 0) return;
    let callAmount = oppRoundBet - myRoundBet;
    let totalBet = callAmount + rackBetAmount;
    
    playerHasActed = true; oppHasActed = false; 
    placeBet(1, totalBet);
    setStatus(`You Raised $${rackBetAmount}.`);
    
    rackBetAmount = 0;
    updateUI();
    checkPhaseAdvance();
    if (gameMode === "online") pushToFirebase();
});

function checkPhaseAdvance() {
    if (playerHasActed && oppHasActed && (myRoundBet === oppRoundBet || myStack === 0 || oppStack === 0)) {
        setTimeout(() => {
            playerHasActed = false; oppHasActed = false;
            if (currentPhase !== "showdown") advancePhase();
        }, 1000);
    } else {
        currentTurn = currentTurn === 1 ? 2 : 1;
        updateActionButtons();
        
        // Host runs AI turn for bot seat
        if (currentTurn === 2) {
            if (gameMode === "ai") setTimeout(aiTurn, 1200);
            else if (gameMode === "online" && isHost && seats[1].type === "ai") setTimeout(aiTurn, 1200);
        }
    }
}

// Upgraded "Smart" AI Engine
function aiTurn() {
    if (currentPhase === "showdown" || currentTurn !== 2) return;
    oppHasActed = true;
    let callAmount = myRoundBet - oppRoundBet;
    
    let isStrong = false;
    let isMonster = false;
    let winProb = 0.2; // Base probability

    // Evaluate Hand
    if (currentPhase === "pre-flop") {
        let val1 = oppCards[0].value;
        let val2 = oppCards[1].value;
        if ((val1 >= 10 && val2 >= 10) || val1 === val2) isStrong = true;
        if ((val1 >= 13 && val2 >= 13) || (val1 === val2 && val1 >= 10)) isMonster = true;
        winProb = isMonster ? 0.8 : (isStrong ? 0.5 : 0.2);
    } else {
        let handEval = getBestHand(oppCards, communityCards);
        if (handEval.score >= 1000000) isStrong = true; 
        if (handEval.score >= 3000000) isMonster = true; 
        winProb = handEval.score / 9000000;
    }

    let action = "call"; 
    let raiseAmount = 0;
    let potOdds = callAmount / (pot + callAmount) || 0;

    if (aiDifficulty === "hard") {
        let roll = Math.random();
        // Monster Logic: Trap or Overbet
        if (isMonster) {
            if (callAmount === 0 && roll < 0.4) action = "check"; // Trap bait
            else { action = "raise"; raiseAmount = callAmount + (pot * 0.5) + 50; }
        } 
        // Bluffing Logic: 15% bluff on garbage
        else if (!isStrong && roll < 0.15) {
            action = "raise";
            raiseAmount = callAmount + (pot * 0.3) + 20;
        } 
        // Mathematical Logic: Chasing the pot
        else if (winProb > potOdds) {
            action = "call";
        } else {
            action = callAmount > 20 ? "fold" : "check";
        }
    } else {
        // Normal Honest AI
        if (isMonster) {
            action = "raise";
            raiseAmount = callAmount + 30;
        } else if (isStrong) {
            action = "call";
        } else {
            if (callAmount > 40) action = "fold";
            else if (callAmount > 0) action = Math.random() < 0.3 ? "call" : "fold";
            else action = "check";
        }
    }

    // Execute Action
    if (action === "fold") {
        setStatus("AI Folds."); myStack += pot; endHand(); 
    } else if (action === "raise") {
        if (oppStack <= callAmount) { 
           placeBet(2, oppStack); setStatus("AI Calls (All-In).");
        } else {
           playerHasActed = false;
           let actualRaise = Math.min(raiseAmount, oppStack);
           placeBet(2, actualRaise);
           setStatus(`AI Raises $${Math.floor(actualRaise - callAmount)}.`);
        }
    } else if (action === "check" || action === "call") {
        if (callAmount > 0) { placeBet(2, callAmount); setStatus("AI Calls."); } 
        else { setStatus("AI Checks."); }
    }

    updateUI(); 
    checkPhaseAdvance();
    if (gameMode === "online") pushToFirebase();
}

// ==========================================
// 7. POKER MATH & SHOWDOWN
// ==========================================
function executeShowdown() {
    splashChipsToPot();
    document.getElementById("poker-controls").classList.add("hidden");
    
    const myHand = getBestHand(myCards, communityCards);
    const oppHand = getBestHand(oppCards, communityCards);

    let winningCards = [];

    if (myHand.score > oppHand.score) {
        setStatus(`YOU WIN with ${myHand.name}!`); SystemUI.playSound('win'); myStack += pot;
        winningCards = myHand.best5;
    } else if (oppHand.score > myHand.score) {
        setStatus(`OPPONENT WINS with ${oppHand.name}!`); SystemUI.playSound('lose'); oppStack += pot;
        winningCards = oppHand.best5;
    } else {
        setStatus(`SPLIT POT! Tie with ${myHand.name}.`); SystemUI.playSound('tie');
        myStack += Math.floor(pot / 2); oppStack += Math.floor(pot / 2);
        winningCards = [...myHand.best5, ...oppHand.best5]; 
    }
    
    updateUI(false, winningCards); 
    endHand();
}

function getBestHand(holeCards, community) {
    let allCards = [...holeCards, ...community].sort((a, b) => b.value - a.value);
    let vCount = {}, sCount = {};
    allCards.forEach(c => { vCount[c.value] = (vCount[c.value] || 0) + 1; sCount[c.suit] = (sCount[c.suit] || 0) + 1; });

    let quads = [], trips = [], pairs = [];
    Object.keys(vCount).map(Number).sort((a,b)=>b-a).forEach(v => {
        if (vCount[v] === 4) quads.push(v); else if (vCount[v] === 3) trips.push(v); else if (vCount[v] === 2) pairs.push(v);
    });

    let flushSuit = Object.keys(sCount).find(s => sCount[s] >= 5);
    let flushCards = flushSuit ? allCards.filter(c => c.suit === flushSuit) : [];

    function getStraightCards(arr) {
        let u = [];
        arr.forEach(c => { if(!u.find(x => x.value === c.value)) u.push(c); });
        if(u.find(c=>c.value===14)) u.push({...u.find(c=>c.value===14), value: 1}); 
        u.sort((a,b)=>b.value-a.value);
        let cons = [u[0]];
        for(let i=1; i<u.length; i++) {
            if(u[i-1].value - 1 === u[i].value) {
                cons.push(u[i]);
                if(cons.length === 5) return cons;
            } else if (u[i-1].value !== u[i].value) {
                cons = [u[i]];
            }
        } return null;
    }

    let strCards = getStraightCards(allCards);
    let strFlushCards = flushSuit ? getStraightCards(flushCards) : null;

    const k = (ex, cnt) => allCards.filter(c => !ex.includes(c.value)).slice(0, cnt);
    const getC = (valArr) => allCards.filter(c => valArr.includes(c.value));
    
    let score = 0, name = "", best5 = [];

    if (strFlushCards) { name = strFlushCards[0].value === 14 ? "Royal Flush" : "Straight Flush"; score = 8000000 + strFlushCards[0].value; best5 = strFlushCards; } 
    else if (quads.length > 0) { name = "Four of a Kind"; let ks = k([quads[0]], 1); score = 7000000 + (quads[0]*100) + ks[0].value; best5 = [...getC([quads[0]]), ...ks]; } 
    else if (trips.length > 0 && pairs.length > 0) { name = "Full House"; score = 6000000 + (trips[0]*100) + pairs[0]; best5 = [...getC([trips[0]]).slice(0,3), ...getC([pairs[0]]).slice(0,2)]; } 
    else if (trips.length > 1) { name = "Full House"; score = 6000000 + (trips[0]*100) + trips[1]; best5 = [...getC([trips[0]]).slice(0,3), ...getC([trips[1]]).slice(0,2)]; } 
    else if (flushCards.length > 0) { name = "Flush"; best5 = flushCards.slice(0,5); score = 5000000 + (best5[0].value*10000) + (best5[1].value*100) + best5[2].value; } 
    else if (strCards) { name = "Straight"; score = 4000000 + strCards[0].value; best5 = strCards; } 
    else if (trips.length > 0) { name = "Three of a Kind"; let ks = k([trips[0]], 2); score = 3000000 + (trips[0]*10000) + (ks[0].value*100) + ks[1].value; best5 = [...getC([trips[0]]).slice(0,3), ...ks]; } 
    else if (pairs.length > 1) { name = "Two Pair"; let ks = k([pairs[0], pairs[1]], 1); score = 2000000 + (pairs[0]*10000) + (pairs[1]*100) + ks[0].value; best5 = [...getC([pairs[0]]).slice(0,2), ...getC([pairs[1]]).slice(0,2), ...ks]; } 
    else if (pairs.length === 1) { name = "Pair"; let ks = k([pairs[0]], 3); score = 1000000 + (pairs[0]*10000) + (ks[0].value*100) + ks[1].value; best5 = [...getC([pairs[0]]).slice(0,2), ...ks]; } 
    else { name = "High Card"; best5 = allCards.slice(0,5); score = (best5[0].value*10000) + (best5[1].value*100) + best5[2].value; }

    return { name, score, best5 };
}

function endHand() {
    currentPhase = "showdown";
    document.getElementById("poker-controls").classList.add("hidden");
    document.getElementById("pre-game-controls").classList.remove("hidden");
    
    if (myStack > 0) {
        document.getElementById("start-game-btn").innerText = "Next Hand";
        document.getElementById("cash-out-btn").classList.remove("hidden");
    } else {
        document.getElementById("start-game-btn").innerText = `BUY IN ($${BUY_IN_AMOUNT})`;
        document.getElementById("cash-out-btn").classList.add("hidden");
    }
}

// ==========================================
// 8. RENDER & HELPERS
// ==========================================
function updateUI(animateNew = false, winningCards = []) {
    const potDisplay = document.getElementById("main-pot");
    if (pot > 0) {
        potDisplay.innerText = `POT: $${pot}`;
        potDisplay.classList.remove("hidden");
    } else {
        potDisplay.classList.add("hidden");
    }
    
    document.getElementById("player-stack").innerText = myStack;
    document.getElementById("opp-stack").innerText = oppStack;
    
    SystemUI.renderTableStacks(myRoundBet, "player-table-chips");
    SystemUI.renderTableStacks(oppRoundBet, "opp-table-chips");
    SystemUI.renderTableStacks(pot, "main-pot-chips");

    const pCardsDiv = document.getElementById("player-cards");
    pCardsDiv.innerHTML = "";
    myCards.forEach(card => {
        const c = document.createElement("div"); c.className = "card"; c.style.backgroundImage = `url('${card.img}')`;
        if (animateNew) c.classList.add("anim-deal");
        if (winningCards.length > 0 && !winningCards.find(w => w.name === card.name && w.suit === card.suit)) c.classList.add("dim");
        pCardsDiv.appendChild(c);
    });
    if(animateNew && myCards.length > 0) playFastSound(sfxCard);

    const oCardsDiv = document.getElementById("opp-cards");
    oCardsDiv.innerHTML = "";
    oppCards.forEach(card => {
        const c = document.createElement("div"); c.className = "card";
        c.style.backgroundImage = (currentPhase === "showdown" || gameMode === "local") ? `url('${card.img}')` : `url('../../system/images/cards/standard/cardBack_red2.png')`;
        if (animateNew) c.classList.add("anim-deal");
        if (winningCards.length > 0 && !winningCards.find(w => w.name === card.name && w.suit === card.suit)) c.classList.add("dim");
        oCardsDiv.appendChild(c);
    });

    const cCardsDiv = document.getElementById("community-cards");
    cCardsDiv.innerHTML = "";
    communityCards.forEach((card, index) => {
        const c = document.createElement("div"); c.className = "card"; c.style.backgroundImage = `url('${card.img}')`;
        
        let isNew = false;
        if (currentPhase === "flop" && index >= 0) isNew = true;
        if (currentPhase === "turn" && index === 3) isNew = true;
        if (currentPhase === "river" && index === 4) isNew = true;
        
        if (animateNew && isNew) { c.classList.add("anim-deal"); playFastSound(sfxCard); }
        if (winningCards.length > 0 && !winningCards.find(w => w.name === card.name && w.suit === card.suit)) c.classList.add("dim");
        
        cCardsDiv.appendChild(c);
    });

    const pBubble = document.getElementById("player-bet-bubble");
    if (myRoundBet > 0) { pBubble.innerText = `Bet: $${myRoundBet}`; pBubble.classList.remove("hidden"); } else pBubble.classList.add("hidden");
    
    const oBubble = document.getElementById("opp-bet-bubble");
    if (oppRoundBet > 0) { oBubble.innerText = `Bet: $${oppRoundBet}`; oBubble.classList.remove("hidden"); } else oBubble.classList.add("hidden");
    
    SystemUI.updateBetDisplay(rackBetAmount);
}

function updateActionButtons() {
    const isMyTurn = (currentTurn === 1);
    const callAmount = oppRoundBet - myRoundBet;
    
    document.getElementById("btn-fold").disabled = !isMyTurn;
    document.getElementById("btn-check-call").disabled = !isMyTurn;
    
    const raiseBtn = document.getElementById("btn-raise");
    raiseBtn.disabled = !isMyTurn || rackBetAmount === 0;
    
    if (isMyTurn) {
        document.getElementById("btn-check-call").innerText = callAmount > 0 ? `Call $${callAmount}` : "Check";
        raiseBtn.innerText = rackBetAmount > 0 ? `Raise $${rackBetAmount}` : "Raise";
    }
}

function setStatus(msg) { document.getElementById("game-status-text").innerText = msg; }

// --- V2 MULTIPLAYER (Lobby Hooks) ---
SystemUI.v2Lobby.setup({
    onHost: () => {
        currentRoomId = Math.random().toString(36).substring(2,6).toUpperCase();
        isHost = true; myId = 1; chatStarted = false;
        seats = [{ type: "human", name: SystemUI.getPlayerName() }, { type: "ai", name: "AI (" + aiDifficulty + ")" }];
        window.dbSet(window.dbRef(window.db,'poker_rooms/'+currentRoomId),{
            status: "waiting", seats: seats, currentTurn: 1, currentPhase: "idle", pot: 0, pStack: 0, oStack: 0
        }).then(()=>{
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
            listenToRoom();
        });
    },
    onJoin: (code) => {
        window.dbGet(window.dbChild(window.dbRef(window.db),`poker_rooms/${code}`)).then(snap=>{
            if(snap.exists()){
                let data = snap.val();
                if (data.seats && data.seats[1].type === "ai") {
                    currentRoomId = code; isHost = false; myId = 2; chatStarted = false;
                    let updatedSeats = data.seats;
                    updatedSeats[1] = { type: "human", name: SystemUI.getPlayerName() };
                    window.dbUpdate(window.dbRef(window.db,'poker_rooms/'+currentRoomId),{ seats: updatedSeats, status: "playing" });
                    SystemUI.v2Lobby.showRoomPhase(currentRoomId, false);
                    listenToRoom();
                }
            }
        });
    },
    onLeave: () => { gameMode="ai"; myId=1; isHost=true; if (roomListener) roomListener(); },
    onStart: () => { window.dbUpdate(window.dbRef(window.db,'poker_rooms/'+currentRoomId),{ status: "playing" }); }
});

function listenToRoom() {
    let onlineGameStarted = false;
    roomListener = window.dbOnValue(window.dbRef(window.db,'poker_rooms/'+currentRoomId), snap=>{
        const data=snap.val(); if(!data) return;
        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);
        if(data.status==="playing" && !onlineGameStarted){
            onlineGameStarted = true; SystemUI.v2Lobby.hide();
            if(!chatStarted){ chatStarted=true; SystemUI.startChat(currentRoomId,SystemUI.getPlayerName()); }
        }
        syncOnline(data);
    });
}

function syncOnline(data) {
    if (data.currentPhase === "idle") return;
    myCards = data.pCards || [];
    oppCards = data.oCards || [];
    communityCards = data.cCards || [];
    pot = data.pot || 0;
    myRoundBet = myId === 1 ? (data.pRoundBet || 0) : (data.oRoundBet || 0);
    oppRoundBet = myId === 1 ? (data.oRoundBet || 0) : (data.pRoundBet || 0);
    myStack = myId === 1 ? (data.pStack || 0) : (data.oStack || 0);
    oppStack = myId === 1 ? (data.oStack || 0) : (data.pStack || 0);
    currentTurn = data.currentTurn;
    currentPhase = data.currentPhase;
    updateUI();
    updateLabels();
    updateActionButtons();
}

function pushToFirebase() {
    if (gameMode !== "online") return;
    window.dbUpdate(window.dbRef(window.db,'poker_rooms/'+currentRoomId),{
        pCards: myCards, oCards: oppCards, cCards: communityCards,
        pot: pot, pRoundBet: myId === 1 ? myRoundBet : oppRoundBet,
        oRoundBet: myId === 1 ? oppRoundBet : myRoundBet,
        pStack: myId === 1 ? myStack : oppStack,
        oStack: myId === 1 ? oppStack : myStack,
        currentTurn: currentTurn, currentPhase: currentPhase
    });
}