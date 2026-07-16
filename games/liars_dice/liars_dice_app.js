// =============================================
// LIAR'S DICE PRO — liars_dice_app.js
// =============================================

let gameMode = "ai";
let aiDifficulty = "normal";
let playerCount = 2;
let myId = 1;
let currentRoomId = null;
let isHost = true;
let activeTurn = 0;

let hands = [[], [], [], []];
let dieCounts = [5, 5, 5, 5];
let playerNames = ["You", "AI 2", "AI 3", "AI 4"];
let currentBid = { qty: 0, face: 0, bidder: -1 };
let gameIsActive = false;
let isRevealPhase = false;

// Staged Bid Variables
let stagedQty = 1;
let stagedFace = 2;

SystemUI.init({
    gameName: "LIAR'S DICE PRO",
    rules: "Each player has 5 secret dice. Bid on the total number of dice of a certain face across the whole table. 1s are WILD. Call 'LIAR' if you think the previous bid is too high!",
    hudDropdowns: [
        // Online removed: it was never implemented (the lobby opened but no
        // game data ever synced, so both players hung after the first bid).
        // Re-add only alongside a real SystemMatch integration.
        { id: "sys-mode", options: [{value:"ai", label:"🤖 vs AI"}] },
        { id: "sys-count", options: [{value:2, label:"2 Players"}, {value:3, label:"3 Players"}, {value:4, label:"4 Players"}] },
        { id: "sys-diff", options: [{value:"easy", label:"Easy"}, {value:"normal", label:"Normal"}, {value:"hard", label:"Hard"}] }
    ]
});

// Sync Dropdowns
setTimeout(() => {
    document.getElementById("sys-mode").addEventListener("change", (e) => {
        gameMode = e.target.value;
        resetGame();
    });
    document.getElementById("sys-count").addEventListener("change", (e) => {
        playerCount = parseInt(e.target.value);
        resetGame();
    });
    document.getElementById("sys-diff").addEventListener("change", (e) => {
        aiDifficulty = e.target.value;
        resetGame();
    });
}, 10);

// --- STORE INTEGRATION ---
function getDicePrefix() {
    const inv = (window.SystemProfile && window.SystemProfile.data.inventory) ? window.SystemProfile.data.inventory : [];
    let prefix = "dieWhite_border"; // Base asset
    return prefix;
}

function resetGame() {
    gameIsActive = false;
    dieCounts = [5, 5, 5, 5];
    currentBid = { qty: 0, face: 0, bidder: -1 };
    
    if (gameMode !== "online") {
        playerNames[0] = SystemUI.getPlayerName();
        for (let i = 1; i < 4; i++) {
            playerNames[i] = "AI " + (i + 1) + " (" + aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1) + ")";
        }
    }
    
    document.getElementById("start-game-btn").classList.remove("hidden");
    document.getElementById("game-controls").classList.add("hidden");
    setStatus("Waiting to start...");
    renderTable();
}

function startRound() {
    gameIsActive = true;
    isRevealPhase = false;
    currentBid = { qty: 0, face: 0, bidder: -1 };
    
    for (let i = 0; i < playerCount; i++) {
        hands[i] = [];
        if (dieCounts[i] > 0) {
            for (let j = 0; j < dieCounts[i]; j++) {
                hands[i].push(Math.floor(Math.random() * 6) + 1);
            }
        }
    }

    SystemUI.playSound('shake'); 
    document.getElementById("game-controls").classList.remove("hidden");
    document.getElementById("start-game-btn").classList.add("hidden");
    
    activeTurn = 0;
    while (dieCounts[activeTurn] <= 0) activeTurn = (activeTurn + 1) % playerCount;

    setStatus("Round Started! Your bid.");
    renderTable();
}

function renderTable() {
    const seatMap = { 2:{bottom:0, top:1}, 3:{bottom:0, left:1, right:2}, 4:{bottom:0, left:1, top:2, right:3} };
    const config = seatMap[playerCount] || seatMap[2];
    const dicePrefix = getDicePrefix();
    
    ["opponent-area", "left-area", "right-area"].forEach(id => document.getElementById(id).classList.add("hidden"));

    Object.entries(config).forEach(([pos, relIdx]) => {
        const pIdx = (myId - 1 + relIdx) % playerCount;
        const areaId = pos === "bottom" ? "player-area" : (pos === "top" ? "opponent-area" : pos + "-area");
        const areaEl = document.getElementById(areaId);
        if (!areaEl) return;

        areaEl.classList.remove("hidden");
        
        const nameId = pos === "bottom" ? "p1-name" : `p${pIdx+1}-name`;
        const countId = pos === "bottom" ? "p1-count" : `p${pIdx+1}-count`;
        
        document.getElementById(nameId).innerText = playerNames[pIdx];
        document.getElementById(countId).innerText = dieCounts[pIdx];

        if (dieCounts[pIdx] <= 0) {
            areaEl.style.opacity = "0.3";
            return;
        } else {
            areaEl.style.opacity = "1";
        }

        // Cleaned up rendering logic: let the CSS handle the sizing and shadow
        if (pIdx === (myId - 1)) {
            const container = document.getElementById("your-dice-container");
            container.innerHTML = "";
            hands[myId - 1].forEach(val => {
                container.innerHTML += `<div class="die"><img src="../../system/images/dice/${dicePrefix}${val}.png"></div>`;
            });
        } else {
            const cup = document.getElementById(`p${pIdx+1}-cup`);
            if (isRevealPhase) {
                cup.style.backgroundImage = "none";
                cup.style.display = "flex";
                cup.style.gap = "5px";
                cup.style.justifyContent = "center";
                cup.style.flexWrap = "wrap";
                cup.style.width = "180px"; // Expand cup to act as a grid
                cup.innerHTML = hands[pIdx].map(v => `<div class="die"><img src="../../system/images/dice/${dicePrefix}${v}.png"></div>`).join("");
            } else {
                cup.innerHTML = "";
                cup.style.backgroundImage = ""; 
                cup.style.display = "block";
                cup.style.width = "80px"; // Shrink back to normal cup size
            }
        }

        const nameEl = document.getElementById(nameId);
        if (pIdx === activeTurn && gameIsActive && !isRevealPhase) {
            nameEl.style.color = "#2ecc71";
            nameEl.style.textShadow = "0 0 10px #2ecc71";
        } else {
            nameEl.style.color = "#f1c40f";
            nameEl.style.textShadow = "none";
        }
    });

    const bidDisp = document.getElementById("current-bid-display");
    if (currentBid.qty > 0) {
        bidDisp.classList.remove("hidden");
        document.getElementById("bid-qty").innerText = currentBid.qty;
        document.getElementById("bid-face").innerText = currentBid.face === 1 ? "1s (W)" : currentBid.face + "s";
    } else {
        bidDisp.classList.add("hidden");
    }

    updateControls();
}

function updateStepperUI() {
    document.getElementById("display-qty").innerText = stagedQty;
    document.getElementById("display-face").innerText = stagedFace === 1 ? "1s (W)" : stagedFace + "s";
}

function updateControls() {
    const isMyTurn = (activeTurn === (myId - 1));
    const ctrl = document.getElementById("game-controls");
    
    if (!gameIsActive || !isMyTurn || isRevealPhase) {
        ctrl.style.opacity = "0.5";
        ctrl.style.pointerEvents = "none";
    } else {
        ctrl.style.opacity = "1";
        ctrl.style.pointerEvents = "all";
    }
    
    if (isMyTurn && !isRevealPhase) {
        if (currentBid.qty === 0) {
            stagedQty = 1;
            stagedFace = 2;
        } else {
            stagedQty = currentBid.qty + 1;
            stagedFace = currentBid.face;
        }
        updateStepperUI();
    }

    document.getElementById("btn-liar").disabled = (currentBid.qty === 0);
}

// --- STEPPER BUTTON EVENTS ---
document.getElementById("btn-qty-down").addEventListener("click", () => {
    let minQty = currentBid.qty === 0 ? 1 : currentBid.qty;
    if (stagedQty > minQty) { 
        stagedQty--; 
        updateStepperUI(); 
        SystemUI.playSound('click'); 
    }
});

document.getElementById("btn-qty-up").addEventListener("click", () => {
    if (stagedQty < 40) { 
        stagedQty++; 
        updateStepperUI(); 
        SystemUI.playSound('click'); 
    }
});

document.getElementById("btn-face-down").addEventListener("click", () => {
    const order = [2, 3, 4, 5, 6, 1]; 
    let idx = order.indexOf(stagedFace);
    if (idx > 0) { 
        stagedFace = order[idx - 1]; 
        updateStepperUI(); 
        SystemUI.playSound('click'); 
    }
});

document.getElementById("btn-face-up").addEventListener("click", () => {
    const order = [2, 3, 4, 5, 6, 1];
    let idx = order.indexOf(stagedFace);
    if (idx < 5) { 
        stagedFace = order[idx + 1]; 
        updateStepperUI(); 
        SystemUI.playSound('click'); 
    }
});


function handleBid() {
    const qty = stagedQty;
    const face = stagedFace;

    if (qty < currentBid.qty || (qty === currentBid.qty && face <= currentBid.face && face !== 1)) {
        alert("Bid must be higher quantity, or same quantity with a higher face value!");
        return;
    }

    currentBid = { qty, face, bidder: activeTurn };
    SystemUI.playSound('click');
    advanceTurn();
}

function handleLiar() {
    isRevealPhase = true;
    renderTable();

    const faceToCount = currentBid.face;
    let totalFound = 0;

    hands.forEach(h => {
        h.forEach(val => {
            if (val === faceToCount || val === 1) totalFound++;
        });
    });

    const isBluff = totalFound < currentBid.qty;
    const loserIdx = isBluff ? currentBid.bidder : activeTurn;

    setStatus(`Total ${faceToCount === 1 ? "1s" : faceToCount + "s"} (inc. Wilds): ${totalFound}. ${playerNames[loserIdx]} loses a die!`);
    
    if (loserIdx === (myId - 1)) SystemUI.playSound('lose');
    else SystemUI.playSound('win');

    dieCounts[loserIdx]--;

    setTimeout(() => {
        let aliveCount = dieCounts.filter(c => c > 0).length;
        if (aliveCount <= 1) {
            let winnerIdx = dieCounts.findIndex(c => c > 0);
            alert(`${playerNames[winnerIdx]} WINS THE GAME!`);
            resetGame();
        } else {
            startRound();
        }
    }, 4500);
}

function advanceTurn() {
    activeTurn = (activeTurn + 1) % playerCount;
    while (dieCounts[activeTurn] <= 0) activeTurn = (activeTurn + 1) % playerCount;
    
    setStatus(activeTurn === (myId - 1) ? "YOUR TURN" : `${playerNames[activeTurn]}'s Turn...`);
    renderTable();
    
    if (activeTurn !== (myId - 1) && gameMode === "ai") {
        setTimeout(aiAction, 1500);
    }
}

function aiAction() {
    if (isRevealPhase || !gameIsActive) return;

    const myDice = hands[activeTurn];
    const totalDiceInPlay = dieCounts.reduce((a, b) => a + b, 0);
    
    let counts = {2:0, 3:0, 4:0, 5:0, 6:0, 1:0};
    myDice.forEach(val => counts[val]++);

    let bestFace = 2;
    let maxCount = -1;
    for (let i = 2; i <= 6; i++) {
        let totalWithWilds = counts[i] + counts[1];
        if (totalWithWilds > maxCount) {
            maxCount = totalWithWilds;
            bestFace = i;
        }
    }

    let unknownDice = totalDiceInPlay - myDice.length;
    let expectedOthers = Math.floor(unknownDice / 3);
    let safeBid = maxCount + expectedOthers;
    
    let riskTolerance = 1;
    if (aiDifficulty === "easy") riskTolerance = 2;
    else if (aiDifficulty === "hard") riskTolerance = 0;

    if (currentBid.qty > safeBid + riskTolerance) {
        handleLiar();
        return;
    }

    let nextQty = currentBid.qty === 0 ? Math.max(1, maxCount) : currentBid.qty + 1;
    let nextFace = (currentBid.qty === 0) ? bestFace : currentBid.face;

    if (currentBid.qty > 0 && nextFace !== bestFace && nextQty > currentBid.qty) {
        nextFace = bestFace;
    }

    currentBid = { qty: nextQty, face: nextFace, bidder: activeTurn };
    SystemUI.playSound('click');
    advanceTurn();
}

function setStatus(m) { document.getElementById("game-status-text").innerText = m; }

document.getElementById("start-game-btn").addEventListener("click", startRound);
document.getElementById("btn-bid").addEventListener("click", handleBid);
document.getElementById("btn-liar").addEventListener("click", handleLiar);