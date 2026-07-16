// ==========================================
// 1. INITIALIZE OS & STATE
// ==========================================
SystemUI.init({
    gameName: "SOLITAIRE PRO",
    rules: "Stack cards descending, alternating colors. Double-tap a card to auto-send it to the Foundation.",
    hudDropdowns: [
        {
            id: "sys-draw-mode",
            options: [
                { value: "1", label: "Draw 1 Card" },
                { value: "3", label: "Draw 3 Cards" }
            ]
        },
        {
            id: "sys-difficulty",
            options: [
                { value: "random", label: "Standard (Random)" },
                { value: "winnable", label: "Easy (Winnable)" }
            ]
        }
    ]
});

let drawMode = parseInt(localStorage.getItem("solitaire_draw_mode")) || 1;
let difficulty = localStorage.getItem("solitaire_diff") || "random";

if(document.getElementById("sys-draw-mode")) {
    document.getElementById("sys-draw-mode").value = drawMode;
    document.getElementById("sys-draw-mode").addEventListener("change", (e) => {
        drawMode = parseInt(e.target.value);
        localStorage.setItem("solitaire_draw_mode", drawMode);
        if(moves > 0) resetGame(); 
    });
}

if(document.getElementById("sys-difficulty")) {
    document.getElementById("sys-difficulty").value = difficulty;
    document.getElementById("sys-difficulty").addEventListener("change", (e) => {
        difficulty = e.target.value;
        localStorage.setItem("solitaire_diff", difficulty);
        if(moves > 0) resetGame(); 
    });
}

// --- SPECIFIC AUDIO MAPPING ---
const sfxClick = new Audio('../../system/audio/click1.mp3');
const sfxSlide = new Audio('../../system/audio/card-slide-6.ogg');
const sfxDraw = new Audio('../../system/audio/card-draw.ogg');
const sfxShuffle = new Audio('../../system/audio/shuffle.mp3');
const sfxWin = new Audio('../../system/audio/win.ogg');

function playSFX(audioObj) {
    if (SystemUI.isMuted) return;
    audioObj.pause();
    audioObj.currentTime = 0;
    audioObj.play().catch(e => console.log("Audio failed:", e));
}

// --- GAME STATE ---
let deck = [];
let stock = [];
let waste = [];
let foundations = [[], [], [], []];
let tableau = [[], [], [], [], [], [], []];

let moves = 0;
let timeElapsed = 0;
let timerInterval = null;
let isPlaying = false;

// --- UNDO HISTORY ---
let historyStack = [];

function saveState() {
    historyStack.push({
        stock: JSON.parse(JSON.stringify(stock)),
        waste: JSON.parse(JSON.stringify(waste)),
        foundations: JSON.parse(JSON.stringify(foundations)),
        tableau: JSON.parse(JSON.stringify(tableau)),
        moves: moves
    });
    document.getElementById("undo-btn").disabled = false;
}

document.getElementById("undo-btn").addEventListener("click", () => {
    if (historyStack.length === 0) return;
    let prevState = historyStack.pop();
    
    stock = prevState.stock;
    waste = prevState.waste;
    foundations = prevState.foundations;
    tableau = prevState.tableau;
    moves = prevState.moves;
    
    document.getElementById("moves-display").innerText = moves;
    if (historyStack.length === 0) document.getElementById("undo-btn").disabled = true;
    
    playSFX(sfxSlide);
    renderBoard();
});

// --- PHYSICS ENGINE STATE ---
let dragStack = []; 
let dragData = [];  
let dragOrigin = null; 
let startX = 0, startY = 0;
let lastTap = 0; 
let isDrawingAnim = false; // Flag for drawing animation
let isDealing = false; // Input lock during the deal animation

// ==========================================
// 2. TIMERS & DECK LOGIC
// ==========================================
function startTimer() {
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeElapsed++;
        let m = Math.floor(timeElapsed / 60);
        let s = timeElapsed % 60;
        document.getElementById("timer-display").innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }, 1000);
}

function updateMoves() {
    moves++;
    document.getElementById("moves-display").innerText = moves;
    if(moves === 1 && !isPlaying) {
        isPlaying = true;
        startTimer();
    }
}

function buildDeck() {
    deck = [];
    const suits = ['Spades', 'Hearts', 'Diamonds', 'Clubs'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    suits.forEach(suit => {
        values.forEach((value, index) => {
            deck.push({
                id: `${value}_${suit}`, suit: suit, value: value, rank: index + 1, 
                color: (suit === 'Hearts' || suit === 'Diamonds') ? 'red' : 'black',
                isFaceUp: false, img: `../../system/images/cards/standard/card${suit}${value}.png`
            });
        });
    });
    
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function resetGame() {
    // AUDIT: Safely track loss if restarting an active game
    if (isPlaying && typeof SystemStats !== 'undefined') {
        SystemStats.recordLoss("solitaire");
    }

    if(timerInterval) clearInterval(timerInterval);
    timeElapsed = 0; moves = 0; isPlaying = false;
    historyStack = [];
    document.getElementById("timer-display").innerText = "0:00";
    document.getElementById("moves-display").innerText = "0";
    document.getElementById("restart-btn").classList.add("hidden");
    document.getElementById("undo-btn").classList.add("hidden");
    document.getElementById("deal-btn").classList.remove("hidden");
    document.getElementById("undo-btn").disabled = true;
    
    stock = []; waste = []; foundations = [[], [], [], []]; tableau = [[], [], [], [], [], [], []];
    renderBoard();
}

document.getElementById("restart-btn").addEventListener("click", resetGame);

document.getElementById("deal-btn").addEventListener("click", () => {
    // AUDIT: Safely track play count via OS 2.0
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("solitaire");

    playSFX(sfxShuffle);
    buildDeck();
    historyStack = [];
    isDealing = true;
    document.getElementById("deal-btn").classList.add("hidden");
    document.getElementById("restart-btn").classList.remove("hidden");
    document.getElementById("undo-btn").classList.remove("hidden");
    
    stock = [...deck];
    
    // DEALING ANIMATION
    let delay = 0;
    for (let col = 0; col < 7; col++) {
        for (let row = 0; row <= col; row++) {
            setTimeout(() => {
                let card = stock.pop();
                if (row === col) card.isFaceUp = true;
                tableau[col].push(card);
                playSFX(sfxDraw); 
                renderBoard();
            }, delay);
            delay += 50; 
        }
    }
    
    // THE "WINNABLE" DECK MANIPULATOR
    setTimeout(() => {
        if (difficulty === "winnable") {
            // Find the 4 Aces hidden in the stock or tableau
            let aces = [];
            stock = stock.filter(c => { if(c.rank===1){aces.push(c); return false;} return true; });
            tableau.forEach(col => {
                for(let i=0; i<col.length; i++) {
                    if(col[i].rank === 1 && !col[i].isFaceUp) { aces.push(col.splice(i, 1)[0]); i--; }
                }
            });
            
            // Force the Aces to be the face-up cards on the first 4 columns
            for(let i=0; i<4 && aces.length>0; i++) {
                if(tableau[i].length > 0 && tableau[i][tableau[i].length-1].isFaceUp) {
                    let oldFaceUp = tableau[i].pop();
                    oldFaceUp.isFaceUp = false;
                    stock.unshift(oldFaceUp); // throw it back in the stock
                }
                let a = aces.pop();
                a.isFaceUp = true;
                tableau[i].push(a);
            }
        }
        document.getElementById("stock-back").classList.remove("hidden");
        isDealing = false;
        renderBoard();
    }, delay + 100);
});

// ==========================================
// 3. STOCK & WASTE LOGIC (WITH ANIMATIONS)
// ==========================================
document.getElementById("stock").addEventListener("click", () => {
    if (deck.length === 0 || isDealing) return;
    if (!isPlaying && moves === 0) { isPlaying = true; startTimer(); }
    saveState();
    
    const stockBack = document.getElementById("stock-back");

    if (stock.length > 0) {
        let pullCount = Math.min(drawMode, stock.length);
        for(let i=0; i<pullCount; i++){
            let card = stock.pop();
            card.isFaceUp = true;
            waste.push(card);
        }
        playSFX(sfxDraw);
        updateMoves();
        isDrawingAnim = true; // Trigger CSS Animation
        renderBoard();
        
        // Remove animation class after it plays so it doesn't repeat randomly
        setTimeout(() => { isDrawingAnim = false; renderBoard(); }, 250);
        
    } else if (waste.length > 0) {
        stock = waste.reverse();
        stock.forEach(c => c.isFaceUp = false);
        waste = [];
        playSFX(sfxShuffle);
        updateMoves();
        
        // Refill Animation
        stockBack.classList.remove("hidden");
        stockBack.classList.add("refill-anim");
        setTimeout(() => stockBack.classList.remove("refill-anim"), 300);
        renderBoard();
    }
});

// ==========================================
// 4. RENDER ENGINE & DOUBLE-TAP LOGIC
// ==========================================
function bindPointerEvents(cardEl, cardData, origin, isTopCard) {
    cardEl.classList.add("draggable");
    
    cardEl.addEventListener("pointerdown", (e) => {
        if (e.button === 2) return;
        playSFX(sfxClick); // Play the exact mp3 requested on click
        
        let currentTime = new Date().getTime();
        let tapLength = currentTime - lastTap;
        
        if (tapLength < 300 && tapLength > 0 && isTopCard) {
            e.preventDefault();
            attemptAutoPlay(cardData, origin);
        } else {
            startDrag(e, cardEl, cardData, origin);
        }
        lastTap = currentTime;
    });
}

function attemptAutoPlay(card, origin) {
    let validFoundationIndex = -1;

    for (let i = 0; i < 4; i++) {
        const fArray = foundations[i];
        if (fArray.length === 0) {
            if (card.rank === 1) { validFoundationIndex = i; break; }
        } else {
            const topFCard = fArray[fArray.length - 1];
            if (topFCard.suit === card.suit && card.rank === topFCard.rank + 1) {
                validFoundationIndex = i; break;
            }
        }
    }

    if (validFoundationIndex !== -1) {
        saveState();
        if (origin.pile === 'tableau') {
            tableau[origin.col].pop();
            autoFlipTopCard(origin.col);
        } else if (origin.pile === 'waste') waste.pop();
        else if (origin.pile === 'foundation') return; 
        
        foundations[validFoundationIndex].push(card);
        playSFX(sfxSlide); // Auto-play success sound
        updateMoves();
        renderBoard();
        checkWinCondition();
    }
}

function renderBoard() {
    const stockBack = document.getElementById("stock-back");
    
    // VISUAL DECK THICKNESS
    if (stock.length > 0 && deck.length > 0) {
        stockBack.classList.remove("hidden");
        let thickness = Math.floor(stock.length / 4); // 0 to 6 pixels
        let shadows = [];
        for(let i=1; i<=thickness; i++) { shadows.push(`-${i}px ${i}px 0 #fff`); }
        stockBack.style.boxShadow = shadows.length > 0 ? shadows.join(', ') : 'none';
        stockBack.style.transform = `translate(${thickness}px, -${thickness}px)`;
    } else {
        stockBack.classList.add("hidden");
        stockBack.style.boxShadow = 'none';
    }

    const wasteDiv = document.getElementById("waste");
    wasteDiv.innerHTML = "";
    if (waste.length > 0) {
        let startIdx = Math.max(0, waste.length - (drawMode === 3 ? 3 : 1));
        let visibleWaste = waste.slice(startIdx);
        
        visibleWaste.forEach((card, index) => {
            const cardEl = document.createElement("div");
            cardEl.className = "playing-card";
            if (isDrawingAnim) cardEl.classList.add("draw-anim"); // Fire animation!
            cardEl.style.backgroundImage = `url('${card.img}')`;
            
            if(drawMode === 3) cardEl.style.left = `${index * (window.innerWidth > 600 ? 20 : 12)}px`;
            
            if (index === visibleWaste.length - 1) {
                bindPointerEvents(cardEl, card, {pile: 'waste', index: waste.length - 1}, true);
            }
            wasteDiv.appendChild(cardEl);
        });
    }

    for (let i = 0; i < 4; i++) {
        const fDiv = document.querySelector(`.foundation[data-pile="f${i}"]`);
        fDiv.innerHTML = "";
        if (foundations[i].length > 0) {
            const topFCard = foundations[i][foundations[i].length - 1];
            const cardEl = document.createElement("div");
            cardEl.className = "playing-card"; 
            cardEl.style.backgroundImage = `url('${topFCard.img}')`;
            bindPointerEvents(cardEl, topFCard, {pile: 'foundation', pileIndex: i}, true);
            fDiv.appendChild(cardEl);
        }
    }

    for (let col = 0; col < 7; col++) {
        const colDiv = document.querySelector(`.tableau-col[data-col="${col}"]`);
        colDiv.innerHTML = ""; 
        let verticalOffset = 0;

        tableau[col].forEach((card, index) => {
            const cardEl = document.createElement("div");
            cardEl.className = "playing-card";
            cardEl.style.top = `${verticalOffset}px`;
            cardEl.style.zIndex = index;
            
            if (card.isFaceUp) {
                cardEl.style.backgroundImage = `url('${card.img}')`;
                const isTopCard = index === tableau[col].length - 1;
                bindPointerEvents(cardEl, card, {pile: 'tableau', col: col, index: index}, isTopCard);
                verticalOffset += window.innerWidth > 600 ? 30 : 20; 
            } else {
                cardEl.classList.add("card-back");
                verticalOffset += window.innerWidth > 600 ? 10 : 6; 
            }
            
            colDiv.appendChild(cardEl);
        });
    }
}

// ==========================================
// 5. THE PHYSICS DRAG ENGINE
// ==========================================
function startDrag(e, cardEl, cardData, origin) {
    let cardsToGrab = [];
    if (origin.pile === 'tableau') cardsToGrab = tableau[origin.col].slice(origin.index);
    else if (origin.pile === 'waste') cardsToGrab = [waste[origin.index]];
    else if (origin.pile === 'foundation') cardsToGrab = [foundations[origin.pileIndex][foundations[origin.pileIndex].length - 1]];
    
    if (cardsToGrab.length === 0) return;

    dragData = cardsToGrab;
    dragOrigin = origin;
    dragStack = [];
    startX = e.clientX;
    startY = e.clientY;

    if (origin.pile === 'tableau') {
        const colDiv = document.querySelector(`.tableau-col[data-col="${origin.col}"]`);
        const allCardsInCol = Array.from(colDiv.children);
        for (let i = origin.index; i < allCardsInCol.length; i++) {
            const c = allCardsInCol[i];
            c.classList.add("dragging");
            dragStack.push(c);
        }
    } else {
        cardEl.classList.add("dragging");
        dragStack.push(cardEl);
    }

    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", onDragEnd);
}

function onDragMove(e) {
    if (dragStack.length === 0) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    dragStack.forEach(cardEl => { cardEl.style.transform = `translate(${dx}px, ${dy}px)`; });
}

function onDragEnd(e) {
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", onDragEnd);

    if (dragStack.length === 0) return;

    let dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    let targetCol = dropTarget ? dropTarget.closest('.tableau-col') : null;
    let targetFoundation = dropTarget ? dropTarget.closest('.foundation') : null;

    let validMove = false;
    const bottomDragCard = dragData[0]; 

    if (targetFoundation && dragData.length === 1) { 
        const fIndex = parseInt(targetFoundation.dataset.pile.replace('f', ''));
        const fArray = foundations[fIndex];

        if (fArray.length === 0) {
            if (bottomDragCard.rank === 1) validMove = true; 
        } else {
            const topFCard = fArray[fArray.length - 1];
            if (topFCard.suit === bottomDragCard.suit && bottomDragCard.rank === topFCard.rank + 1) validMove = true;
        }

        if (validMove && dragOrigin.pile !== 'foundation') {
            saveState();
            if (dragOrigin.pile === 'tableau') {
                tableau[dragOrigin.col].pop();
                autoFlipTopCard(dragOrigin.col);
            } else if (dragOrigin.pile === 'waste') waste.pop();
            
            foundations[fIndex].push(bottomDragCard);
            playSFX(sfxSlide);
            updateMoves();
            checkWinCondition();
        } else validMove = false;
    } 
    else if (targetCol) {
        const targetColIndex = parseInt(targetCol.dataset.col);
        const colArray = tableau[targetColIndex];
        
        if (colArray.length === 0) {
            if (bottomDragCard.rank === 13) validMove = true; 
        } else {
            const topCardInCol = colArray[colArray.length - 1];
            if (topCardInCol.isFaceUp && topCardInCol.color !== bottomDragCard.color && topCardInCol.rank === bottomDragCard.rank + 1) {
                validMove = true;
            }
        }

        if (validMove && (dragOrigin.pile !== 'tableau' || targetColIndex !== dragOrigin.col)) {
            saveState();
            if (dragOrigin.pile === 'tableau') {
                tableau[dragOrigin.col].splice(dragOrigin.index, dragData.length);
                autoFlipTopCard(dragOrigin.col); 
            } else if (dragOrigin.pile === 'waste') waste.pop();
            else if (dragOrigin.pile === 'foundation') foundations[dragOrigin.pileIndex].pop();
            
            tableau[targetColIndex].push(...dragData);
            playSFX(sfxSlide);
            updateMoves();
        } else validMove = false;
    }

    if (!validMove) {
        // If they drop it in invalid spot, don't play slide sound, let it snap back
    } 

    dragStack.forEach(cardEl => {
        cardEl.classList.remove("dragging");
        cardEl.style.transform = "none";
    });
    
    dragStack = []; dragData = []; dragOrigin = null;
    renderBoard(); 
}

function autoFlipTopCard(colIndex) {
    const colArray = tableau[colIndex];
    if (colArray.length > 0) {
        const topCard = colArray[colArray.length - 1];
        if (!topCard.isFaceUp) {
            topCard.isFaceUp = true;
            playSFX(sfxDraw); 
        }
    }
}

function checkWinCondition() {
    if (foundations.every(f => f.length === 13)) {
        // AUDIT: Safely track win via OS 2.0
        if (typeof SystemStats !== 'undefined') SystemStats.recordWin("solitaire", 0);

        isPlaying = false;
        if(timerInterval) clearInterval(timerInterval);
        setTimeout(() => {
            playSFX(sfxWin);
            alert(`YOU WIN! Time: ${document.getElementById("timer-display").innerText} | Moves: ${moves}`);
            document.getElementById("restart-btn").innerText = "Play Again";
        }, 500);
    }
}