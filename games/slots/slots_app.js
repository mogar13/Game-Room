// --- 1. BOOT UP THE CASINO OS ---
SystemUI.init({
    gameName: "VIDEO SLOTS",
    rules: `
        <strong style="color:#f1c40f;">Wins evaluate left-to-right on active paylines.</strong><br><br>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
            <img src="lucky-seven.png" style="width:25px;"> 
            <span><strong>JACKPOT:</strong> 5x = 100x | 4x = 25x | 3x = 5x</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
            <img src="diamond.png" style="width:25px;"> <img src="gold.png" style="width:25px;"> 
            <span><strong>HIGH TIER:</strong> 5x = 50x | 4x = 10x | 3x = 2x</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-weight:bold; color:#e74c3c;">ANY FRUIT / BELL</span>
            <span><strong>LOW TIER:</strong> 5x = 10x | 4x = 3x | 3x = 1x</span>
        </div>
    `
});

// --- 2. GAME VARIABLES ---
let baseBet = 0;
let activeLines = 5;
let isSpinning = false;

const symbols = ["bell.png", "cherries.png", "orange.png", "plum.png", "watermelon.png", "lucky-seven.png", "diamond.png", "gold.png"];

const paylines = [
    [1, 1, 1, 1, 1], // Mid
    [0, 0, 0, 0, 0], // Top
    [2, 2, 2, 2, 2], // Bot
    [0, 1, 2, 1, 0], // "V"
    [2, 1, 0, 1, 2]  // "^"
];

// OS BETTING INTEGRATION
SystemUI.setupBetting("os-betting-rack", {
    onBet: function(val) {
        if (isSpinning) return;
        // In slots, selecting a chip increases the BASE bet per line
        if (SystemUI.money >= (baseBet + val) * activeLines) { 
            baseBet += val; 
            updateHUD(); 
        }
    },
    onClear: function() {
        if (isSpinning) return;
        baseBet = 0;
        updateHUD();
    }
});


function updateHUD() {
    let totalBet = baseBet * activeLines;
    
    SystemUI.updateMoneyDisplay();
    // Update the OS rack's total display
    SystemUI.updateBetDisplay(totalBet);
    // Disable chips while spinning
    SystemUI.enableBetting(!isSpinning);

    document.getElementById("deck-base-bet").innerText = baseBet;
    document.getElementById("deck-lines").innerText = activeLines;
    document.getElementById("deck-total-bet").innerText = totalBet;
    
    document.getElementById("btn-spin").disabled = (totalBet === 0 || totalBet > SystemUI.money || isSpinning);
}

function updateLineButtons() {
    document.querySelectorAll(".line-btn").forEach(btn => {
        btn.classList.toggle("active", parseInt(btn.dataset.line) <= activeLines);
    });
}

function initReels() {
    for (let i = 1; i <= 5; i++) {
        const strip = document.getElementById(`strip-${i}`);
        strip.innerHTML = "";
        for (let j = 0; j < 40; j++) {
            let sym = symbols[Math.floor(Math.random() * symbols.length)];
            strip.innerHTML += `<div class="slot-item"><img src="${sym}"></div>`;
        }
        strip.style.transition = "none";
        strip.style.transform = `translateY(-${37 * 80}px)`;
    }
}

function showLinePreview(lineNum) {
    if (isSpinning) return;
    const line = paylines[lineNum - 1];
    const targetPosition = 37;

    for (let c = 0; c < 5; c++) {
        const strip = document.getElementById(`strip-${c + 1}`);
        const slotItemWrapper = strip.children[targetPosition + line[c]];
        if (slotItemWrapper) {
            slotItemWrapper.classList.add("line-preview");
            slotItemWrapper.dataset.lineId = lineNum;
        }
    }
}

function clearLinePreview() {
    document.querySelectorAll(".line-preview").forEach(el => el.classList.remove("line-preview"));
}

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

// Wire the "INFO" button to trigger the OS Modal
document.getElementById("btn-paytable").addEventListener("click", () => {
    document.getElementById("sys-modal").classList.remove("sys-hidden");
});

document.getElementById("btn-spin").addEventListener("click", () => {
    if (isSpinning || (baseBet * activeLines) > SystemUI.money) return;
    clearLinePreview();
    
    // Deduct money directly from the OS
    SystemUI.money -= (baseBet * activeLines);
    
    isSpinning = true;
    updateHUD();
    document.getElementById("deck-win").innerText = "0";
    document.querySelectorAll(".winning-pulse").forEach(el => el.classList.remove("winning-pulse"));

    let resultMatrix = [[], [], []];
    for (let col = 0; col < 5; col++) {
        resultMatrix[0][col] = symbols[Math.floor(Math.random() * symbols.length)];
        resultMatrix[1][col] = symbols[Math.floor(Math.random() * symbols.length)];
        resultMatrix[2][col] = symbols[Math.floor(Math.random() * symbols.length)];
    }

    for (let col = 0; col < 5; col++) {
        spinReel(`strip-${col + 1}`, resultMatrix[0][col], resultMatrix[1][col], resultMatrix[2][col], 2000 + (col * 300));
    }

    setTimeout(() => evaluateMatrix(resultMatrix), 2000 + (4 * 300) + 100);
});

function spinReel(stripId, symTop, symMid, symBot, duration) {
    const strip = document.getElementById(stripId);
    let oldTop = strip.children[37]?.querySelector("img").getAttribute("src") || symbols[0];
    let oldMid = strip.children[38]?.querySelector("img").getAttribute("src") || symbols[0];
    let oldBot = strip.children[39]?.querySelector("img").getAttribute("src") || symbols[0];

    strip.style.transition = "none";
    strip.style.transform = "translateY(0px)";
    strip.innerHTML = "";

    for (let i = 0; i < 40; i++) {
        let sym = symbols[Math.floor(Math.random() * symbols.length)];
        if (i === 0) sym = oldTop; if (i === 1) sym = oldMid; if (i === 2) sym = oldBot;
        if (i === 37) sym = symTop; if (i === 38) sym = symMid; if (i === 39) sym = symBot;
        strip.innerHTML += `<div class="slot-item"><img src="${sym}"></div>`;
    }
    void strip.offsetWidth;
    strip.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.9, 0.1, 1)`;
    strip.style.transform = `translateY(-${37 * 80}px)`;
}

function evaluateMatrix(matrix) {
    let totalWin = 0;
    let winningCoords = [];

    for (let i = 0; i < activeLines; i++) {
        let line = paylines[i];
        let startSymbol = matrix[line[0]][0]; 
        let matchCount = 1;
        let coords = [{row: line[0], col: 0}];

        for (let c = 1; c < 5; c++) {
            if (matrix[line[c]][c] === startSymbol) {
                matchCount++;
                coords.push({row: line[c], col: c});
            } else break;
        }
        
        if (matchCount >= 3) {
            let multi = (startSymbol === "lucky-seven.png") ? (matchCount === 5 ? 100 : (matchCount === 4 ? 25 : 5)) :
                        (startSymbol === "diamond.png" || startSymbol === "gold.png") ? (matchCount === 5 ? 50 : (matchCount === 4 ? 10 : 2)) :
                        (matchCount === 5 ? 10 : (matchCount === 4 ? 3 : 1));
            
            totalWin += (baseBet * multi);
            winningCoords = winningCoords.concat(coords);
        }
    }

    const winDisp = document.getElementById("deck-win");
    winDisp.innerText = totalWin;
    winDisp.style.color = totalWin > 0 ? "#2ecc71" : "white";
    if (totalWin > 0) highlightWinners(winningCoords);

    // Pay the OS
    SystemUI.money += totalWin;
    
    isSpinning = false;
    updateHUD(); 
}

function highlightWinners(coords) {
    coords.forEach(coord => {
        const strip = document.getElementById(`strip-${coord.col + 1}`);
        if (strip?.children[37 + coord.row]) strip.children[37 + coord.row].classList.add("winning-pulse");
    });
}

initReels();
updateHUD();