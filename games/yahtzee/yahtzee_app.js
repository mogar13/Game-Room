// ==========================================
// 1. INITIALIZE OS & STATE
// ==========================================
let gameMode = localStorage.getItem("ytz_mode") || "ai";
let aiDifficulty = localStorage.getItem("ytz_diff") || "normal";
let myId = 1;
let currentRoomId = null;
let isHost = false;
let chatStarted = false;

SystemUI.init({
    gameName: "YAHTZEE",
    rules: `
        <ul style="text-align: left; line-height: 1.7; font-size: 0.9rem; color: #ddd; padding-left: 18px;">
            <li>Roll <strong>5 dice</strong> up to 3 times per turn.</li>
            <li>Tap dice between rolls to <strong>keep</strong> them.</li>
            <li>After rolling, pick a <strong>category</strong> to score.</li>
            <li>Upper bonus: <strong>+35 pts</strong> if upper section ≥ 63.</li>
            <li>YAHTZEE = all 5 dice the same (<strong>50 pts</strong>).</li>
            <li>13 rounds total — highest score wins!</li>
        </ul>
    `,
    hudDropdowns: [
        {
            id: "sys-ytz-mode",
            label: "Mode",
            options: [
                { value: "ai",     label: "🤖 vs AI" },
                { value: "local",  label: "👥 Hotseat" },
                { value: "online", label: "🌐 Online" }
            ]
        },
        {
            id: "sys-ytz-diff",
            label: "AI",
            options: [
                { value: "normal", label: "Normal" },
                { value: "hard",   label: "Hard" }
            ]
        }
    ]
});

document.getElementById("sys-ytz-mode").value = gameMode;
document.getElementById("sys-ytz-diff").value = aiDifficulty;
updateAiDiffVisibility();

document.getElementById("sys-ytz-mode").addEventListener("change", (e) => {
    gameMode = e.target.value;
    localStorage.setItem("ytz_mode", gameMode);
    updateAiDiffVisibility();
    updatePlayerLabels();
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        SystemUI.stopChat();
        chatStarted = false;
    }
});

document.getElementById("sys-ytz-diff").addEventListener("change", (e) => {
    aiDifficulty = e.target.value;
    localStorage.setItem("ytz_diff", aiDifficulty);
});

function updateAiDiffVisibility() {
    document.getElementById("sys-ytz-diff").style.display = gameMode === "ai" ? "" : "none";
}

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if (confirm("Reset the current game?")) {
        resetGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});

// ==========================================
// 2. FIREBASE MULTIPLAYER LOBBY
// ==========================================
const lobbyUI = document.getElementById("multiplayer-lobby");

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

document.getElementById("btn-create-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    currentRoomId = generateRoomCode();
    isHost = true;
    myId = 1;
    chatStarted = false;

    const initScores = makeFreshScores();
    window.dbSet(window.dbRef(window.db, 'yahtzee_rooms/' + currentRoomId), {
        dice: [1,1,1,1,1],
        kept: [false,false,false,false,false],
        rollsLeft: 3,
        currentTurn: 1,
        round: 1,
        scores1: initScores,
        scores2: initScores,
        yahtzeeBonus1: 0,
        yahtzeeBonus2: 0,
        players: 1,
        status: "waiting"
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        document.getElementById("btn-create-room").disabled = true;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = document.getElementById("join-room-input").value.toUpperCase();
    if (code.length !== 4) { document.getElementById("lobby-error-msg").innerText = "Code must be 4 characters."; return; }

    window.dbGet(window.dbChild(window.dbRef(window.db), `yahtzee_rooms/${code}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.players === 1) {
                currentRoomId = code;
                isHost = false;
                myId = 2;
                chatStarted = false;
                window.dbUpdate(window.dbRef(window.db, 'yahtzee_rooms/' + currentRoomId), {
                    players: 2, status: "playing"
                });
                lobbyUI.classList.add("hidden");
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
                listenToRoom();
            } else {
                document.getElementById("lobby-error-msg").innerText = "Room is full!";
            }
        } else {
            document.getElementById("lobby-error-msg").innerText = "Room not found.";
        }
    });
});

function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, 'yahtzee_rooms/' + currentRoomId), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Fire once for BOTH host and joiner — independent of lobby visibility
        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            if (lobbyUI) lobbyUI.classList.add("hidden");
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            startOnlineGame(data);
            return;
        }

        if (gameState !== "playing") return;
        syncOnlineState(data);
    });
}

document.getElementById("lobby-close-btn").addEventListener("click", () => {
    SystemUI.playSound('click');
    lobbyUI.classList.add("hidden");
});
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    SystemUI.playSound('click');
    gameMode = "ai";
    document.getElementById("sys-ytz-mode").value = "ai";
    localStorage.setItem("ytz_mode", "ai");
    lobbyUI.classList.add("hidden");
    updateAiDiffVisibility();
    updatePlayerLabels();
    SystemUI.stopChat();
    chatStarted = false;
});

// ==========================================
// 3. SCORING CATEGORIES
// ==========================================
const CATS = [
    { id: 'ones',          label: '⚀ Ones',           section: 'upper' },
    { id: 'twos',          label: '⚁ Twos',           section: 'upper' },
    { id: 'threes',        label: '⚂ Threes',         section: 'upper' },
    { id: 'fours',         label: '⚃ Fours',          section: 'upper' },
    { id: 'fives',         label: '⚄ Fives',          section: 'upper' },
    { id: 'sixes',         label: '⚅ Sixes',          section: 'upper' },
    { id: 'threeOfKind',   label: 'Three of a Kind',  section: 'lower' },
    { id: 'fourOfKind',    label: 'Four of a Kind',   section: 'lower' },
    { id: 'fullHouse',     label: 'Full House',        section: 'lower' },
    { id: 'smallStraight', label: 'Small Straight',   section: 'lower' },
    { id: 'largeStraight', label: 'Large Straight',   section: 'lower' },
    { id: 'yahtzee',       label: 'YAHTZEE!',          section: 'lower' },
    { id: 'chance',        label: 'Chance',            section: 'lower' },
];
const UPPER_IDS = CATS.filter(c => c.section === 'upper').map(c => c.id);

function makeFreshScores() {
    const s = {};
    CATS.forEach(c => s[c.id] = null);
    return s;
}

function calcScore(catId, dice) {
    const counts = [0,0,0,0,0,0];
    dice.forEach(d => counts[d - 1]++);
    const sum = dice.reduce((a, b) => a + b, 0);
    const maxCount = Math.max(...counts);

    switch (catId) {
        case 'ones':          return counts[0] * 1;
        case 'twos':          return counts[1] * 2;
        case 'threes':        return counts[2] * 3;
        case 'fours':         return counts[3] * 4;
        case 'fives':         return counts[4] * 5;
        case 'sixes':         return counts[5] * 6;
        case 'threeOfKind':   return maxCount >= 3 ? sum : 0;
        case 'fourOfKind':    return maxCount >= 4 ? sum : 0;
        case 'fullHouse': {
            const hasThree = counts.some(c => c === 3);
            const hasTwo   = counts.some(c => c === 2);
            return (hasThree && hasTwo) || maxCount === 5 ? 25 : 0;
        }
        case 'smallStraight': {
            const unique = [...new Set(dice)].sort((a, b) => a - b).join('');
            return unique.includes('1234') || unique.includes('2345') || unique.includes('3456') ? 30 : 0;
        }
        case 'largeStraight': {
            const unique = [...new Set(dice)].sort((a, b) => a - b).join('');
            return (unique === '12345' || unique === '23456') ? 40 : 0;
        }
        case 'yahtzee':  return maxCount === 5 ? 50 : 0;
        case 'chance':   return sum;
        default: return 0;
    }
}

function calcUpperTotal(scores) {
    return UPPER_IDS.reduce((acc, id) => acc + (scores[id] || 0), 0);
}

function calcTotalScore(scores, yahtzeeBonus) {
    const upper = calcUpperTotal(scores);
    const bonus = upper >= 63 ? 35 : 0;
    const lower = CATS.filter(c => c.section === 'lower')
        .reduce((acc, c) => acc + (scores[c.id] || 0), 0);
    return upper + bonus + lower + (yahtzeeBonus || 0) * 100;
}

// ==========================================
// 4. CORE GAME STATE
// ==========================================
let gameState = "idle";
let dice = [1, 1, 1, 1, 1];
let kept = [false, false, false, false, false];
let rollsLeft = 3;
let currentTurn = 1;    // 1 or 2
let round = 1;          // 1-13
let scores1 = makeFreshScores();
let scores2 = makeFreshScores();
let yahtzeeBonus1 = 0;
let yahtzeeBonus2 = 0;
let hasRolledThisTurn = false;

const TOTAL_ROUNDS = 13;
const BUY_IN = 200;
const PAYOUT = 400;

// ==========================================
// 5. INIT DICE TRAY
// ==========================================
(function buildDiceTray() {
    const tray = document.getElementById("dice-tray");
    for (let i = 0; i < 5; i++) {
        const die = document.createElement("div");
        die.className = "die idle";
        die.dataset.idx = i;
        die.innerHTML = `<img src="../../system/images/dice/dieWhite_border1.png" alt="die">`;
        die.addEventListener("click", () => toggleKeep(i));
        tray.appendChild(die);
    }
})();

function getDieEl(idx) {
    return document.querySelector(`.die[data-idx="${idx}"]`);
}

function updateDiceDisplay() {
    for (let i = 0; i < 5; i++) {
        const el = getDieEl(i);
        el.querySelector("img").src = `../../system/images/dice/dieWhite_border${dice[i]}.png`;
        el.classList.toggle("kept", kept[i]);
        el.classList.toggle("idle", !hasRolledThisTurn || gameState !== "playing");
    }
}

function toggleKeep(idx) {
    if (gameState !== "playing") return;
    if (!hasRolledThisTurn) return;
    if (rollsLeft === 0) return;
    if (gameMode === "ai" && currentTurn === 2) return;
    if (gameMode === "online" && currentTurn !== myId) return;

    kept[idx] = !kept[idx];
    SystemUI.playSound('chipTable');
    updateDiceDisplay();
}

// ==========================================
// 6. ROLL LOGIC
// ==========================================
function rollDice() {
    if (gameState !== "playing") return;
    if (rollsLeft <= 0) return;
    if (gameMode === "ai" && currentTurn === 2) return;
    if (gameMode === "online" && currentTurn !== myId) return;

    new Audio('../../system/audio/dice-shake-1.ogg').play().catch(()=>{});
    document.getElementById("roll-btn").disabled = true;

    // Animate non-kept dice
    for (let i = 0; i < 5; i++) {
        if (!kept[i]) {
            const el = getDieEl(i);
            el.classList.add("rolling");
            setTimeout(() => el.classList.remove("rolling"), 420);
        }
    }

    setTimeout(() => {
        for (let i = 0; i < 5; i++) {
            if (!kept[i]) {
                dice[i] = Math.ceil(Math.random() * 6);
            }
        }
        rollsLeft--;
        hasRolledThisTurn = true;

        new Audio('../../system/audio/dice-throw-1.ogg').play().catch(()=>{});
        updateDiceDisplay();
        updateRollInfo();
        renderScorecard();

        document.getElementById("roll-btn").disabled = false;
        if (rollsLeft <= 0) {
            document.getElementById("roll-btn").disabled = true;
        }

        // Online: push dice state
        if (gameMode === "online") {
            window.dbUpdate(window.dbRef(window.db, 'yahtzee_rooms/' + currentRoomId), {
                dice: dice,
                kept: kept,
                rollsLeft: rollsLeft
            });
        }
    }, 420);
}

// ==========================================
// 7. SCORECARD PANEL
// ==========================================
let scorecardOpen = false;

document.getElementById("scorecard-toggle-btn").addEventListener("click", openScorecard);
document.getElementById("scorecard-close-btn").addEventListener("click", closeScorecard);
document.getElementById("scorecard-backdrop").addEventListener("click", closeScorecard);

function openScorecard() {
    scorecardOpen = true;
    document.getElementById("scorecard-panel").classList.add("open");
    document.getElementById("scorecard-backdrop").classList.remove("hidden");
    renderScorecard();
}

function closeScorecard() {
    scorecardOpen = false;
    document.getElementById("scorecard-panel").classList.remove("open");
    document.getElementById("scorecard-backdrop").classList.add("hidden");
}

function renderScorecard() {
    const inner = document.getElementById("scorecard-inner");

    // Can the current player score right now?
    const isMyTurn = gameState === "playing" && (
        (gameMode !== "online" && gameMode !== "ai") ||
        (gameMode === "ai" && currentTurn === 1) ||
        (gameMode === "online" && currentTurn === myId)
    );
    const canScore = isMyTurn && hasRolledThisTurn;

    const s1 = scores1;
    const s2 = scores2;
    const yb1 = yahtzeeBonus1;
    const yb2 = yahtzeeBonus2;

    const p1Label = document.getElementById("p1-label").innerText;
    const p2Label = document.getElementById("p2-label").innerText;

    let html = `<table class="scorecard-table">
        <thead>
            <tr>
                <th style="width:50%">Category</th>
                <th class="score-col">${p1Label}</th>
                <th class="score-col">${p2Label}</th>
            </tr>
        </thead>
        <tbody>
            <tr class="scorecard-section-header"><td colspan="3">UPPER SECTION</td></tr>`;

    CATS.filter(c => c.section === 'upper').forEach(cat => {
        const v1 = s1[cat.id];
        const v2 = s2[cat.id];
        // Potential score for MY scores if can score
        const pot = canScore && v1 === null && currentTurn === 1 ? calcScore(cat.id, dice) :
                    canScore && v2 === null && currentTurn === 2 ? calcScore(cat.id, dice) : null;

        const myScores = currentTurn === 1 ? s1 : s2;
        const isClickable = canScore && myScores[cat.id] === null;

        html += `<tr class="scorecard-row${isClickable ? ' can-score' : ''}" 
                     ${isClickable ? `onclick="scoreCategory('${cat.id}')"` : ''}>
            <td>${cat.label}</td>
            ${scoreCellHtml(v1, currentTurn === 1 && canScore && v1 === null, calcScore(cat.id, dice))}
            ${scoreCellHtml(v2, currentTurn === 2 && canScore && v2 === null, calcScore(cat.id, dice))}
        </tr>`;
    });

    // Upper bonus row
    const upper1 = calcUpperTotal(s1);
    const upper2 = calcUpperTotal(s2);
    const bonus1Txt = s1.sixes !== null && UPPER_IDS.every(id => s1[id] !== null)
        ? (upper1 >= 63 ? '+35' : '0')
        : `${upper1}/63`;
    const bonus2Txt = s2.sixes !== null && UPPER_IDS.every(id => s2[id] !== null)
        ? (upper2 >= 63 ? '+35' : '0')
        : `${upper2}/63`;

    html += `<tr class="scorecard-total-row">
        <td>Bonus (≥63)</td>
        <td class="score-col ${upper1 >= 63 ? 'bonus-achieved' : 'bonus-pending'}">${bonus1Txt}</td>
        <td class="score-col ${upper2 >= 63 ? 'bonus-achieved' : 'bonus-pending'}">${bonus2Txt}</td>
    </tr>`;

    html += `<tr class="scorecard-section-header"><td colspan="3">LOWER SECTION</td></tr>`;

    CATS.filter(c => c.section === 'lower').forEach(cat => {
        const v1 = s1[cat.id];
        const v2 = s2[cat.id];
        const myScores = currentTurn === 1 ? s1 : s2;
        const isClickable = canScore && myScores[cat.id] === null;

        html += `<tr class="scorecard-row${isClickable ? ' can-score' : ''}"
                     ${isClickable ? `onclick="scoreCategory('${cat.id}')"` : ''}>
            <td>${cat.label}</td>
            ${scoreCellHtml(v1, currentTurn === 1 && canScore && v1 === null, calcScore(cat.id, dice))}
            ${scoreCellHtml(v2, currentTurn === 2 && canScore && v2 === null, calcScore(cat.id, dice))}
        </tr>`;
    });

    // Yahtzee bonus row
    html += `<tr class="scorecard-row">
        <td>Yahtzee Bonus</td>
        <td class="score-col ${yb1 > 0 ? '' : 'zero'}">${yb1 > 0 ? '+' + (yb1 * 100) : '—'}</td>
        <td class="score-col ${yb2 > 0 ? '' : 'zero'}">${yb2 > 0 ? '+' + (yb2 * 100) : '—'}</td>
    </tr>`;

    // Totals
    const total1 = calcTotalScore(s1, yb1);
    const total2 = calcTotalScore(s2, yb2);
    html += `<tr class="scorecard-total-row">
        <td>GRAND TOTAL</td>
        <td class="score-col">${total1}</td>
        <td class="score-col">${total2}</td>
    </tr>`;

    html += `</tbody></table>`;
    inner.innerHTML = html;
}

function scoreCellHtml(existingVal, isPotential, potentialVal) {
    if (existingVal !== null) {
        return `<td class="score-col${existingVal === 0 ? ' zero' : ''}">${existingVal}</td>`;
    }
    if (isPotential) {
        return `<td class="score-col available">${potentialVal}</td>`;
    }
    return `<td class="score-col zero">—</td>`;
}

// ==========================================
// 8. SCORING A CATEGORY
// ==========================================
function scoreCategory(catId) {
    if (gameState !== "playing") return;
    if (!hasRolledThisTurn) return;
    if (gameMode === "online" && currentTurn !== myId) return;
    if (gameMode === "ai" && currentTurn !== 1) return;

    const myScores = currentTurn === 1 ? scores1 : scores2;
    if (myScores[catId] !== null) return;

    const val = calcScore(catId, dice);

    // Yahtzee bonus check
    if (catId === 'yahtzee' && val === 0 && myScores['yahtzee'] === 50) {
        // bonus yahtzee — handled below if rolled a yahtzee
    }

    // Check for bonus Yahtzee (already scored 50 in yahtzee, rolling another)
    const counts = [0,0,0,0,0,0];
    dice.forEach(d => counts[d-1]++);
    if (Math.max(...counts) === 5 && myScores['yahtzee'] === 50) {
        if (currentTurn === 1) yahtzeeBonus1++;
        else yahtzeeBonus2++;
        SystemUI.playSound('win');
        showToast("BONUS YAHTZEE!", "+100 bonus points!");
    }

    myScores[catId] = val;
    SystemUI.playSound(val > 0 ? 'chipTable' : 'click');

    if (gameMode === "online") {
        const updateObj = {
            dice: [1,1,1,1,1],
            kept: [false,false,false,false,false],
            rollsLeft: 3
        };
        if (currentTurn === 1) {
            updateObj.scores1 = scores1;
            updateObj.yahtzeeBonus1 = yahtzeeBonus1;
        } else {
            updateObj.scores2 = scores2;
            updateObj.yahtzeeBonus2 = yahtzeeBonus2;
        }
        advanceTurnOnline(updateObj);
        return;
    }

    closeScorecard();
    advanceTurnLocal();
}

// ==========================================
// 9. TURN MANAGEMENT
// ==========================================
function advanceTurnLocal() {
    const allScored1 = CATS.every(c => scores1[c.id] !== null);
    const allScored2 = gameMode === "ai" || gameMode === "local"
        ? CATS.every(c => scores2[c.id] !== null)
        : true;

    if (allScored1 && allScored2) {
        endGame();
        return;
    }

    // Switch turn
    if (gameMode === "local" || gameMode === "ai") {
        currentTurn = currentTurn === 1 ? 2 : 1;
        // Advance round after both players have gone
        if (currentTurn === 1) round++;
    }

    // Reset for new turn
    dice = [1,1,1,1,1];
    kept = [false,false,false,false,false];
    rollsLeft = 3;
    hasRolledThisTurn = false;

    updateDiceDisplay();
    updateRollInfo();
    updateTurnBanner();
    updateScoreUI();
    renderScorecard();

    document.getElementById("roll-btn").disabled = false;

    if (gameMode === "ai" && currentTurn === 2) {
        setTimeout(aiTakeTurn, 800);
    }
}

function advanceTurnOnline(updateObj) {
    const allScored1 = CATS.every(c => scores1[c.id] !== null);
    const allScored2 = CATS.every(c => scores2[c.id] !== null);

    if (allScored1 && allScored2) {
        updateObj.status = "done";
        window.dbUpdate(window.dbRef(window.db, 'yahtzee_rooms/' + currentRoomId), updateObj);
        endGame();
        return;
    }

    const nextTurn = currentTurn === 1 ? 2 : 1;
    const nextRound = nextTurn === 1 ? round + 1 : round;
    updateObj.currentTurn = nextTurn;
    updateObj.round = nextRound;

    window.dbUpdate(window.dbRef(window.db, 'yahtzee_rooms/' + currentRoomId), updateObj);
}

// ==========================================
// 10. AI LOGIC
// ==========================================
function aiTakeTurn() {
    if (gameState !== "playing") return;

    // AI gets up to 3 rolls
    aiRollStep(3);
}

function aiRollStep(rollsRemaining) {
    if (gameState !== "playing") return;

    // Roll non-kept dice
    new Audio('../../system/audio/dice-shake-1.ogg').play().catch(()=>{});
    for (let i = 0; i < 5; i++) {
        if (!kept[i]) dice[i] = Math.ceil(Math.random() * 6);
    }
    rollsLeft = rollsRemaining - 1;
    hasRolledThisTurn = true;

    // Animate dice
    for (let i = 0; i < 5; i++) {
        if (!kept[i]) {
            const el = getDieEl(i);
            el.classList.add("rolling");
            setTimeout(() => el.classList.remove("rolling"), 420);
        }
    }

    setTimeout(() => {
        new Audio('../../system/audio/dice-throw-1.ogg').play().catch(()=>{});
        updateDiceDisplay();
        updateRollInfo();
        renderScorecard();

        if (rollsLeft > 0) {
            // Decide what to keep
            kept = aiDecideKeep(dice, scores2, aiDifficulty);
            updateDiceDisplay();

            // Decide whether to roll again or score
            const bestCat = aiBestCategory(dice, scores2);
            const bestScore = calcScore(bestCat, dice);

            // Hard always re-rolls if benefit; Normal has 80% chance
            const shouldReroll = rollsLeft > 0 && !kept.every(k => k) &&
                (aiDifficulty === "hard" || Math.random() < 0.8);

            if (shouldReroll) {
                setTimeout(() => aiRollStep(rollsLeft), 900);
                return;
            }
        }

        // Score the best available category
        setTimeout(() => {
            const catId = aiBestCategory(dice, scores2);
            const val = calcScore(catId, dice);

            // Bonus yahtzee check
            const counts = [0,0,0,0,0,0];
            dice.forEach(d => counts[d-1]++);
            if (Math.max(...counts) === 5 && scores2['yahtzee'] === 50) {
                yahtzeeBonus2++;
            }

            scores2[catId] = val;
            SystemUI.playSound(val > 0 ? 'chipTable' : 'click');

            updateScoreUI();
            renderScorecard();
            closeScorecard();
            advanceTurnLocal();
        }, 700);
    }, 500);
}

function aiDecideKeep(dice, scores, diff) {
    const counts = [0,0,0,0,0,0];
    dice.forEach(d => counts[d-1]++);
    const maxCount = Math.max(...counts);
    const maxFace = counts.indexOf(maxCount) + 1;

    if (diff === "normal") {
        // Simple: keep matching faces, with some randomness
        if (Math.random() < 0.15) return [false,false,false,false,false]; // sometimes reroll all
        return dice.map(d => d === maxFace && maxCount >= 2);
    }

    // Hard: smarter decision
    // Check for large straight potential
    const unique = [...new Set(dice)].sort((a,b)=>a-b);
    if (unique.length === 5 && scores['largeStraight'] === null) {
        return dice.map(() => true); // keep all — already a large straight
    }
    if (unique.length >= 4 && scores['largeStraight'] === null) {
        // Keep the straight dice
        const seq = findLongestSeq(dice);
        return dice.map(d => seq.includes(d));
    }

    // Keep Yahtzee or four of a kind
    if (maxCount >= 4) return dice.map(d => d === maxFace);

    // Full house check
    if (maxCount === 3 && counts.filter(c => c > 0).length === 2) {
        return dice.map(() => true); // already full house
    }

    // Three of a kind: keep the triplet
    if (maxCount >= 3) return dice.map(d => d === maxFace);

    // Two pair: keep both pairs
    const pairs = counts.map((c, i) => c >= 2 ? i + 1 : 0).filter(v => v > 0);
    if (pairs.length >= 2) return dice.map(d => pairs.includes(d));

    // One pair: keep the pair
    if (maxCount === 2) return dice.map(d => d === maxFace);

    // Default: keep highest face value dice
    return dice.map(d => d >= 5);
}

function findLongestSeq(dice) {
    const unique = [...new Set(dice)].sort((a,b)=>a-b);
    let best = [unique[0]];
    let current = [unique[0]];
    for (let i = 1; i < unique.length; i++) {
        if (unique[i] === unique[i-1] + 1) {
            current.push(unique[i]);
            if (current.length > best.length) best = [...current];
        } else {
            current = [unique[i]];
        }
    }
    return best;
}

function aiBestCategory(dice, scores) {
    let best = null;
    let bestVal = -1;

    // Hard: pick highest score. Normal: pick highest with slight randomness
    const available = CATS.filter(c => scores[c.id] === null);
    available.forEach(cat => {
        let val = calcScore(cat.id, dice);

        // Prefer not zeroing out valuable categories
        if (aiDifficulty === "normal" && Math.random() < 0.2) {
            val += Math.random() * 5; // small noise
        }

        if (val > bestVal) {
            bestVal = val;
            best = cat.id;
        }
    });

    // If all available give 0, pick least valuable to sacrifice
    if (bestVal === 0 && available.length > 0) {
        // Sacrifice upper section first (smaller payout), avoid sacrificing Yahtzee/straights if possible
        const sacrifice = available.find(c => c.section === 'upper') || available[0];
        return sacrifice.id;
    }

    return best || available[0].id;
}

// ==========================================
// 11. ONLINE SYNC
// ==========================================
function startOnlineGame(data) {
    dice = data.dice || [1,1,1,1,1];
    kept = data.kept || [false,false,false,false,false];
    rollsLeft = data.rollsLeft !== undefined ? data.rollsLeft : 3;
    currentTurn = data.currentTurn || 1;
    round = data.round || 1;
    scores1 = data.scores1 || makeFreshScores();
    scores2 = data.scores2 || makeFreshScores();
    yahtzeeBonus1 = data.yahtzeeBonus1 || 0;
    yahtzeeBonus2 = data.yahtzeeBonus2 || 0;
    hasRolledThisTurn = rollsLeft < 3;
    gameState = "playing";

    updateDiceDisplay();
    updateRollInfo();
    updateTurnBanner();
    updateScoreUI();
    renderScorecard();
    document.getElementById("start-game-btn").classList.add("hidden");
    document.getElementById("roll-btn").classList.remove("hidden");
    document.getElementById("scorecard-toggle-btn").classList.remove("hidden");
    document.getElementById("roll-btn").disabled = currentTurn !== myId;
}

function syncOnlineState(data) {
    if (!data || gameState !== "playing") return;

    dice = data.dice || dice;
    kept = data.kept || kept;
    rollsLeft = data.rollsLeft !== undefined ? data.rollsLeft : rollsLeft;
    currentTurn = data.currentTurn || currentTurn;
    round = data.round || round;
    scores1 = data.scores1 || scores1;
    scores2 = data.scores2 || scores2;
    yahtzeeBonus1 = data.yahtzeeBonus1 || 0;
    yahtzeeBonus2 = data.yahtzeeBonus2 || 0;
    hasRolledThisTurn = rollsLeft < 3;

    updateDiceDisplay();
    updateRollInfo();
    updateTurnBanner();
    updateScoreUI();
    renderScorecard();

    document.getElementById("roll-btn").disabled = currentTurn !== myId || rollsLeft <= 0;

    if (data.status === "done") {
        endGame();
        return;
    }
}

// ==========================================
// 12. GAME INIT / RESET
// ==========================================
function initGame() {
    if (gameMode !== "local" && SystemUI.money < BUY_IN) {
        showToast("Insufficient Funds", "You need $200 to buy in!");
        return;
    }

    if (gameMode === "ai") {
        SystemUI.money -= BUY_IN;
        SystemUI.updateMoneyDisplay();
    }

    dice = [1,1,1,1,1];
    kept = [false,false,false,false,false];
    rollsLeft = 3;
    currentTurn = 1;
    round = 1;
    scores1 = makeFreshScores();
    scores2 = makeFreshScores();
    yahtzeeBonus1 = 0;
    yahtzeeBonus2 = 0;
    hasRolledThisTurn = false;
    gameState = "playing";

    SystemUI.playSound('shuffle');

    updateDiceDisplay();
    updateRollInfo();
    updateTurnBanner();
    updateScoreUI();
    renderScorecard();

    document.getElementById("start-game-btn").classList.add("hidden");
    document.getElementById("roll-btn").classList.remove("hidden");
    document.getElementById("scorecard-toggle-btn").classList.remove("hidden");
    document.getElementById("roll-btn").disabled = false;
}

function resetGame() {
    gameState = "idle";
    dice = [1,1,1,1,1];
    kept = [false,false,false,false,false];
    rollsLeft = 3;
    currentTurn = 1;
    round = 1;
    scores1 = makeFreshScores();
    scores2 = makeFreshScores();
    yahtzeeBonus1 = 0;
    yahtzeeBonus2 = 0;
    hasRolledThisTurn = false;

    updateDiceDisplay();
    updateRollInfo();
    updateTurnBanner();
    updateScoreUI();
    closeScorecard();

    document.getElementById("start-game-btn").classList.remove("hidden");
    document.getElementById("roll-btn").classList.add("hidden");
    document.getElementById("roll-btn").disabled = false;
    document.getElementById("scorecard-toggle-btn").classList.add("hidden");
    document.getElementById("turn-banner").classList.add("hidden");
    document.getElementById("round-display").innerText = "—";
}

// ==========================================
// 13. UI HELPERS
// ==========================================
function updateScoreUI() {
    const t1 = calcTotalScore(scores1, yahtzeeBonus1);
    const t2 = calcTotalScore(scores2, yahtzeeBonus2);
    document.getElementById("p1-score").innerText = t1;
    document.getElementById("p2-score").innerText = t2;
    document.getElementById("p1-stat").classList.toggle("active-turn", currentTurn === 1 && gameState === "playing");
    document.getElementById("p2-stat").classList.toggle("active-turn", currentTurn === 2 && gameState === "playing");
    if (gameState === "playing") {
        document.getElementById("round-display").innerText = `${round}/13`;
    }
}

function updateRollInfo() {
    const info = document.getElementById("roll-info");
    if (gameState !== "playing") { info.classList.add("hidden"); return; }
    info.classList.remove("hidden");

    const rtEl = document.getElementById("rolls-left-text");
    if (rollsLeft <= 0) {
        rtEl.innerText = "No rolls left";
        rtEl.style.color = "#e74c3c";
    } else {
        rtEl.innerText = `${rollsLeft} roll${rollsLeft !== 1 ? 's' : ''} left`;
        rtEl.style.color = "#f1c40f";
    }
    document.getElementById("kept-hint").style.display = hasRolledThisTurn ? "" : "none";
}

function updateTurnBanner() {
    const banner = document.getElementById("turn-banner");
    if (gameState !== "playing") { banner.classList.add("hidden"); return; }
    banner.classList.remove("hidden");

    if (gameMode === "online") {
        banner.innerText = currentTurn === myId ? "⭐ Your Turn — Roll the dice!" : "Opponent's turn...";
        banner.style.color = currentTurn === myId ? "#f1c40f" : "#3498db";
    } else if (gameMode === "ai") {
        banner.innerText = currentTurn === 1 ? "⭐ Your Turn — Roll the dice!" : "🤖 AI Rolling...";
        banner.style.color = currentTurn === 1 ? "#f1c40f" : "#3498db";
    } else {
        banner.innerText = currentTurn === 1 ? "⭐ Player 1's Turn" : "⭐ Player 2's Turn";
        banner.style.color = currentTurn === 1 ? "#f1c40f" : "#e74c3c";
    }
}

function updatePlayerLabels() {
    if (gameMode === "ai") {
        document.getElementById("p1-label").innerText = "You";
        document.getElementById("p2-label").innerText = "AI";
    } else if (gameMode === "local") {
        document.getElementById("p1-label").innerText = "P1";
        document.getElementById("p2-label").innerText = "P2";
    } else {
        document.getElementById("p1-label").innerText = myId === 1 ? "You" : "P1";
        document.getElementById("p2-label").innerText = myId === 2 ? "You" : "P2";
    }
}

// ==========================================
// 14. END GAME
// ==========================================
function endGame() {
    gameState = "idle";
    closeScorecard();

    const t1 = calcTotalScore(scores1, yahtzeeBonus1);
    const t2 = calcTotalScore(scores2, yahtzeeBonus2);
    let title, message;

    if (gameMode === "ai") {
        if (t1 > t2) {
            SystemUI.money += PAYOUT;
            SystemUI.updateMoneyDisplay();
            SystemUI.playSound('win');
            title = "You Win!";
            message = `You beat the AI ${t1}–${t2}! Won $${PAYOUT}!`;
        } else if (t2 > t1) {
            SystemUI.playSound('lose');
            title = "AI Wins!";
            message = `AI won ${t2}–${t1}. Better luck next time!`;
        } else {
            SystemUI.money += BUY_IN;
            SystemUI.updateMoneyDisplay();
            SystemUI.playSound('tie');
            title = "It's a Tie!";
            message = `Both scored ${t1}. Buy-in returned.`;
        }
    } else if (gameMode === "local") {
        if (t1 > t2) {
            SystemUI.playSound('win');
            title = "Player 1 Wins!";
            message = `P1 wins ${t1}–${t2}!`;
        } else if (t2 > t1) {
            SystemUI.playSound('win');
            title = "Player 2 Wins!";
            message = `P2 wins ${t2}–${t1}!`;
        } else {
            SystemUI.playSound('tie');
            title = "It's a Tie!";
            message = `Both scored ${t1}!`;
        }
    } else {
        const myScore = myId === 1 ? t1 : t2;
        const oppScore = myId === 1 ? t2 : t1;
        const iWon = myScore > oppScore;
        const isTie = myScore === oppScore;
        SystemUI.playSound(isTie ? 'tie' : iWon ? 'win' : 'lose');
        title = isTie ? "It's a Tie!" : iWon ? "You Win!" : "Opponent Wins!";
        message = `Final: You ${myScore} – Opponent ${oppScore}`;
    }

    showToast(title, message);
    document.getElementById("turn-banner").classList.add("hidden");

    setTimeout(() => {
        document.getElementById("start-game-btn").classList.remove("hidden");
        document.getElementById("roll-btn").classList.add("hidden");
        document.getElementById("scorecard-toggle-btn").classList.add("hidden");
        document.getElementById("round-display").innerText = "—";
    }, 3600);
}

// ==========================================
// 15. TOAST MODAL
// ==========================================
let toastTimer;
function showToast(title, message) {
    document.getElementById("modal-title").innerText = title;
    document.getElementById("modal-message").innerText = message;
    const overlay = document.getElementById("toast-modal");
    overlay.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => overlay.classList.add("hidden"), 3500);
}
document.getElementById("toast-modal").addEventListener("click", () => {
    document.getElementById("toast-modal").classList.add("hidden");
});

// ==========================================
// 16. KICKSTART
// ==========================================
document.getElementById("start-game-btn").addEventListener("click", initGame);
document.getElementById("roll-btn").addEventListener("click", rollDice);

updatePlayerLabels();
updateScoreUI();