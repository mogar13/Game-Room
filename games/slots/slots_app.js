let money = parseInt(localStorage.getItem("blackjack_money")) || 5000;
let baseBet = 0;
let activeLines = 5;
let reelMode = 5; 
let isSpinning = false;

const symbols = ["bell.png", "cherries.png", "orange.png", "plum.png", "watermelon.png", "lucky-seven.png", "diamond.png", "gold.png"];

const paylines = [
    [1, 1, 1, 1, 1], // Mid
    [0, 0, 0, 0, 0], // Top
    [2, 2, 2, 2, 2], // Bot
    [0, 1, 2, 1, 0], // "V"
    [2, 1, 0, 1, 2]  // "^"
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
        btn.classList.toggle("active", parseInt(btn.dataset.line) <= activeLines);
    });
}

document.getElementById("btn-mode").addEventListener("click", () => {
    if (isSpinning) return;
    reelMode = (reelMode === 5) ? 3 : 5;
    document.getElementById("btn-mode").innerText = `MODE: ${reelMode}-REEL`;
    document.querySelectorAll(".reel-ext").forEach(el => el.style.display = (reelMode === 3 ? "none" : "block"));
});

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

document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
        if (isSpinning) return;
        let val = parseInt(chip.dataset.val);
        if (money >= (baseBet + val) * activeLines) { baseBet += val; updateHUD(); }
    });
});

document.getElementById("clear-bet").addEventListener("click", () => {
    if (isSpinning) return;
    baseBet = 0;
    updateHUD();
});

document.getElementById("btn-paytable").addEventListener("click", () => document.getElementById("paytable-modal").classList.remove("hidden"));
document.getElementById("close-paytable").addEventListener("click", () => document.getElementById("paytable-modal").classList.add("hidden"));

document.getElementById("btn-spin").addEventListener("click", () => {
    if (isSpinning || (baseBet * activeLines) > money) return;
    money -= (baseBet * activeLines);
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
    const offset = (reelMode === 3) ? 1 : 0;

    console.log(`=== FINAL GRID (${reelMode}-REEL) ===`);
    for(let r=0; r<3; r++) {
        let rowStr = "";
        for(let c=0; c<reelMode; c++) rowStr += `[ ${matrix[r][c + offset].split('.')[0].padEnd(10)} ] `;
        console.log(rowStr);
    }

    for (let i = 0; i < activeLines; i++) {
        let line = paylines[i];
        let startSymbol = matrix[line[offset]][offset]; 
        let matchCount = 1;
        let coords = [{row: line[offset], col: offset}];

        for (let c = 1; c < reelMode; c++) {
            let currentCol = c + offset;
            if (matrix[line[currentCol]][currentCol] === startSymbol) {
                matchCount++;
                coords.push({row: line[currentCol], col: currentCol});
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

    document.getElementById("deck-win").innerText = totalWin;
    document.getElementById("deck-win").style.color = totalWin > 0 ? "#2ecc71" : "white";
    if (totalWin > 0) highlightWinners(winningCoords);
    money += totalWin;
    localStorage.setItem("blackjack_money", money);
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