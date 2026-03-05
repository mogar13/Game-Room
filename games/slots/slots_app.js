let money = parseInt(localStorage.getItem("blackjack_money")) || 5000;
let baseBet = 0;
let activeLines = 5;
let reelMode = 5; // Toggles between 3 and 5
let isSpinning = false;

// Locked in perfectly.
const symbols = [
    "bell.png", "cherries.png", "orange.png", "plum.png", 
    "watermelon.png", "lucky-seven.png", "diamond.png", "gold.png" 
];

// The 5 Paylines (Row Indices: 0=Top, 1=Mid, 2=Bot)
const paylines = [
    [1, 1, 1, 1, 1], // Line 1: Mid
    [0, 0, 0, 0, 0], // Line 2: Top
    [2, 2, 2, 2, 2], // Line 3: Bot
    [0, 1, 2, 1, 0], // Line 4: "V"
    [2, 1, 0, 1, 2]  // Line 5: "^"
];

function updateHUD() {
    let totalBet = baseBet * activeLines;
    document.getElementById("bankroll-display").innerHTML = `<img src="../blackjack/dollar.png" class="hud-icon"> $${money}`;
    document.getElementById("deck-base-bet").innerText = baseBet;
    document.getElementById("deck-lines").innerText = activeLines;
    document.getElementById("deck-total-bet").innerText = totalBet;
    
    document.getElementById("btn-spin").disabled = (totalBet === 0 || totalBet > money || isSpinning);
}

function updateLineButtons() {
    document.querySelectorAll(".line-btn").forEach(btn => {
        let lineNum = parseInt(btn.dataset.line);
        if (lineNum <= activeLines) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

// Reel Mode Toggle (3-Reel vs 5-Reel)
document.getElementById("btn-mode").addEventListener("click", () => {
    if (isSpinning) return;
    reelMode = (reelMode === 5) ? 3 : 5;
    document.getElementById("btn-mode").innerText = `MODE: ${reelMode}-REEL`;

    const extraReels = document.querySelectorAll(".reel-ext");
    if (reelMode === 3) {
        extraReels.forEach(el => el.style.display = "none");
    } else {
        extraReels.forEach(el => el.style.display = "block");
    }
});

// Interactive Line Previews
function showLinePreview(lineNum) {
    if (isSpinning) return;
    const lineIndex = lineNum - 1;
    const line = paylines[lineIndex];
    const targetPosition = 35; // Baseline Mid index

    for (let c = 0; c < reelMode; c++) {
        const strip = document.getElementById(`strip-${c + 1}`);
        const childIndex = (targetPosition - 1) + line[c];
        const slotItemWrapper = strip.children[childIndex];
        
        if (slotItemWrapper) {
            slotItemWrapper.classList.add("line-preview");
            slotItemWrapper.dataset.lineId = lineNum;
        }
    }
}

function clearLinePreview() {
    document.querySelectorAll(".line-preview").forEach(el => {
        el.classList.remove("line-preview");
        delete el.dataset.lineId;
    });
}

// Line Selectors & Hover Events
document.querySelectorAll(".line-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        if (isSpinning) return;
        activeLines = parseInt(e.target.dataset.line);
        updateLineButtons();
        updateHUD();
    });
    btn.addEventListener("mouseenter", (e) => showLinePreview(parseInt(e.target.dataset.line)));
    btn.addEventListener("mouseleave", clearLinePreview);
});

function initReels() {
    for (let i = 1; i <= 5; i++) {
        const strip = document.getElementById(`strip-${i}`);
        strip.innerHTML = "";
        const totalItems = 40;
        const targetPosition = 35;
        
        for (let j = 0; j < totalItems; j++) {
            let sym = symbols[Math.floor(Math.random() * symbols.length)];
            strip.innerHTML += `<div class="slot-item"><img src="${sym}"></div>`;
        }
        strip.style.transition = "none";
        strip.style.transform = `translateY(-${(targetPosition - 1) * 80}px)`;
    }
}

// Betting Logic
document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
        if (isSpinning) return;
        let val = parseInt(chip.dataset.val);
        if (money >= (baseBet + val) * activeLines) {
            baseBet += val;
            updateHUD();
        } else {
            alert("Not enough bankroll to cover that multi-line bet!");
        }
    });
});

document.getElementById("clear-bet").addEventListener("click", () => {
    if (isSpinning) return;
    baseBet = 0;
    updateHUD();
});

// Modals
document.getElementById("btn-paytable").addEventListener("click", () => document.getElementById("paytable-modal").classList.remove("hidden"));
document.getElementById("close-paytable").addEventListener("click", () => document.getElementById("paytable-modal").classList.add("hidden"));

// SPIN LOGIC
document.getElementById("btn-spin").addEventListener("click", () => {
    if (isSpinning) return;
    clearLinePreview(); 
    
    let totalBet = baseBet * activeLines;
    money -= totalBet;
    
    isSpinning = true;
    updateHUD();
    
    document.getElementById("deck-win").innerText = "0";
    document.getElementById("deck-win").style.color = "white";
    document.querySelectorAll(".winning-pulse").forEach(el => el.classList.remove("winning-pulse"));

    let resultMatrix = [ [], [], [] ];
    for (let col = 0; col < reelMode; col++) {
        resultMatrix[0][col] = symbols[Math.floor(Math.random() * symbols.length)];
        resultMatrix[1][col] = symbols[Math.floor(Math.random() * symbols.length)];
        resultMatrix[2][col] = symbols[Math.floor(Math.random() * symbols.length)];
    }

    for (let col = 0; col < reelMode; col++) {
        spinReel(`strip-${col + 1}`, resultMatrix[0][col], resultMatrix[1][col], resultMatrix[2][col], 2500 + (col * 400));
    }

    let totalSpinTime = 2500 + ((reelMode - 1) * 400) + 100;
    setTimeout(() => evaluateMatrix(resultMatrix), totalSpinTime);
});

function spinReel(stripId, symTop, symMid, symBot, duration) {
    const strip = document.getElementById(stripId);
    strip.style.transition = "none";
    strip.style.transform = "translateY(0px)";
    strip.innerHTML = "";

    const totalItems = 40;
    const targetPosition = 35;

    for (let i = 0; i < totalItems; i++) {
        let sym = symbols[Math.floor(Math.random() * symbols.length)];
        if (i === targetPosition - 1) sym = symTop;
        if (i === targetPosition) sym = symMid;
        if (i === targetPosition + 1) sym = symBot;
        strip.innerHTML += `<div class="slot-item"><img src="${sym}"></div>`;
    }

    void strip.offsetWidth; // Reflow
    strip.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.9, 0.1, 1)`;
    strip.style.transform = `translateY(-${(targetPosition - 1) * 80}px)`;
}

// EVALUATION ENGINE
function evaluateMatrix(matrix) {
    let totalWin = 0;
    let winningCoords = [];
    
    console.log("----- NEW SPIN RESULT -----");

    // Loop through strictly the active lines the user bet on
    for (let i = 0; i < activeLines; i++) {
        let line = paylines[i];
        let symbol = matrix[line[0]][0];
        let matchCount = 1;
        let coords = [ {row: line[0], col: 0} ];

        // Check sequentially from Left to Right
        for (let c = 1; c < reelMode; c++) {
            if (matrix[line[c]][c] === symbol) {
                matchCount++;
                coords.push({row: line[c], col: c});
            } else {
                break; // Sequence broken
            }
        }
        
        console.log(`Line ${i+1}: Started with [${symbol}]. Matched ${matchCount} in a row.`);

        if (matchCount >= 3) {
            let multi = 0;
            if (symbol === "lucky-seven.png") {
                multi = (matchCount === 5) ? 100 : (matchCount === 4) ? 25 : 5;
            } else if (symbol === "diamond.png" || symbol === "gold.png") { // THE GOLD TYPO IS FIXED HERE
                multi = (matchCount === 5) ? 50 : (matchCount === 4) ? 10 : 2;
            } else {
                multi = (matchCount === 5) ? 10 : (matchCount === 4) ? 3 : 1;
            }
            
            console.log(`>>> WIN! Line ${i+1} pays ${multi}x multiplier!`);
            totalWin += (baseBet * multi);
            winningCoords = winningCoords.concat(coords);
        }
    }

    const winScreen = document.getElementById("deck-win");

    if (totalWin > 0) {
        winScreen.innerText = totalWin;
        winScreen.style.color = "#2ecc71";
        highlightWinners(winningCoords); 
    } else {
        winScreen.style.color = "white";
    }

    money += totalWin;
    localStorage.setItem("blackjack_money", money);
    
    isSpinning = false;
    updateHUD();
}

function highlightWinners(coords) {
    const targetPosition = 35;
    coords.forEach(coord => {
        const strip = document.getElementById(`strip-${coord.col + 1}`);
        const childIndex = (targetPosition - 1) + coord.row;
        const slotItemWrapper = strip.children[childIndex];
        
        slotItemWrapper.classList.add("winning-pulse");
    });
}

initReels();
updateHUD();