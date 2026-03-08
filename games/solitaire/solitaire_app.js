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
        }
    ]
});

let drawMode = parseInt(localStorage.getItem("solitaire_draw_mode")) || 1;
if(document.getElementById("sys-draw-mode")) {
    document.getElementById("sys-draw-mode").value = drawMode;
    document.getElementById("sys-draw-mode").addEventListener("change", (e) => {
        drawMode = parseInt(e.target.value);
        localStorage.setItem("solitaire_draw_mode", drawMode);
        document.getElementById("sys-modal").classList.add("sys-hidden");
        // Changing modes mid-game forces a restart
        if(moves > 0) resetGame(); 
    });
}

function playSound(type) {
    const audio = new Audio(`../../system/audio/${type}.ogg`);
    audio.play().catch(e => console.log("Audio failed:", e));
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

// --- PHYSICS ENGINE STATE ---
let dragStack = []; 
let dragData = [];  
let dragOrigin = null; 
let startX = 0, startY = 0;
let lastTap = 0; // For double-tap detection

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
                id: `${value}_${suit}`,
                suit: suit,
                value: value,
                rank: index + 1, 
                color: (suit === 'Hearts' || suit === 'Diamonds') ? 'red' : 'black',
                isFaceUp: false,
                img: `../../system/images/cards/standard/card${suit}${value}.png`
            });
        });
    });
    
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function resetGame() {
    if(timerInterval) clearInterval(timerInterval);
    timeElapsed = 0; moves = 0; isPlaying = false;
    document.getElementById("timer-display").innerText = "0:00";
    document.getElementById("moves-display").innerText = "0";
    document.getElementById("restart-btn").classList.add("hidden");
    document.getElementById("deal-btn").classList.remove("hidden");
    
    stock = []; waste = []; foundations = [[], [], [], []]; tableau = [[], [], [], [], [], [], []];
    renderBoard();
}

document.getElementById("restart-btn").addEventListener("click", resetGame);

document.getElementById("deal-btn").addEventListener("click", () => {
    playSound('shuffle');
    buildDeck();
    document.getElementById("deal-btn").classList.add("hidden");
    document.getElementById("restart-btn").classList.remove("hidden");
    
    stock = [...deck];
    
    let delay = 0;
    for (let col = 0; col < 7; col++) {
        for (let row = 0; row <= col; row++) {
            setTimeout(() => {
                let card = stock.pop();
                if (row === col) card.isFaceUp = true;
                tableau[col].push(card);
                playSound('card-draw'); 
                renderBoard();
            }, delay);
            delay += 60; 
        }
    }
    
    setTimeout(() => {
        document.getElementById("stock-back").classList.remove("hidden");
        renderBoard();
    }, delay);
});

// ==========================================
// 3. STOCK & WASTE LOGIC
// ==========================================
document.getElementById("stock").addEventListener("click", () => {
    if (!isPlaying && moves === 0) { isPlaying = true; startTimer(); }
    
    if (stock.length > 0) {
        let pullCount = Math.min(drawMode, stock.length);
        for(let i=0; i<pullCount; i++){
            let card = stock.pop();
            card.isFaceUp = true;
            waste.push(card);
        }
        playSound('card-draw');
        updateMoves();
    } else if (waste.length > 0) {
        stock = waste.reverse();
        stock.forEach(c => c.isFaceUp = false);
        waste = [];
        playSound('shuffle');
        updateMoves();
    }
    renderBoard();
});

// ==========================================
// 4. RENDER ENGINE & DOUBLE-TAP LOGIC
// ==========================================
function bindPointerEvents(cardEl, cardData, origin, isTopCard) {
    cardEl.classList.add("draggable");
    
    cardEl.addEventListener("pointerdown", (e) => {
        if (e.button === 2) return;
        
        let currentTime = new Date().getTime();
        let tapLength = currentTime - lastTap;
        
        // Double Tap Detection (Only valid on the top card of a stack)
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
        // Remove from origin
        if (origin.pile === 'tableau') {
            tableau[origin.col].pop();
            autoFlipTopCard(origin.col);
        } else if (origin.pile === 'waste') {
            waste.pop();
        } else if (origin.pile === 'foundation') {
            return; // Can't autoplay from foundation to foundation
        }
        
        foundations[validFoundationIndex].push(card);
        playSound('card-shove-2');
        updateMoves();
        renderBoard();
        checkWinCondition();
    }
}

function renderBoard() {
    const stockBack = document.getElementById("stock-back");
    if (stock.length > 0 && deck.length > 0) stockBack.classList.remove("hidden");
    else stockBack.classList.add("hidden");

    // Render Waste Pile (Fanned out if Draw 3)
    const wasteDiv = document.getElementById("waste");
    wasteDiv.innerHTML = "";
    if (waste.length > 0) {
        // Only show up to the top 3 cards
        let startIdx = Math.max(0, waste.length - (drawMode === 3 ? 3 : 1));
        let visibleWaste = waste.slice(startIdx);
        
        visibleWaste.forEach((card, index) => {
            const cardEl = document.createElement("div");
            cardEl.className = "playing-card";
            cardEl.style.backgroundImage = `url('${card.img}')`;
            
            // Fanning visual
            if(drawMode === 3) cardEl.style.left = `${index * (window.innerWidth > 600 ? 20 : 12)}px`;
            
            // Only the very top card is draggable
            if (index === visibleWaste.length - 1) {
                bindPointerEvents(cardEl, card, {pile: 'waste', index: waste.length - 1}, true);
            }
            wasteDiv.appendChild(cardEl);
        });
    }

    // Render Foundations (Now Draggable!)
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

    // Render Tableau
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

    // --- CHECK DROP ON FOUNDATION ---
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
            if (dragOrigin.pile === 'tableau') {
                tableau[dragOrigin.col].pop();
                autoFlipTopCard(dragOrigin.col);
            } else if (dragOrigin.pile === 'waste') waste.pop();
            
            foundations[fIndex].push(bottomDragCard);
            playSound('card-shove-2');
            updateMoves();
            checkWinCondition();
        } else validMove = false;
    } 
    // --- CHECK DROP ON TABLEAU ---
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
            if (dragOrigin.pile === 'tableau') {
                tableau[dragOrigin.col].splice(dragOrigin.index, dragData.length);
                autoFlipTopCard(dragOrigin.col); 
            } else if (dragOrigin.pile === 'waste') {
                waste.pop();
            } else if (dragOrigin.pile === 'foundation') {
                foundations[dragOrigin.pileIndex].pop();
            }
            
            tableau[targetColIndex].push(...dragData);
            playSound('card-shove-2');
            updateMoves();
        } else validMove = false;
    }

    if (!validMove) playSound('lose'); 

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
            playSound('card-draw'); 
        }
    }
}

function checkWinCondition() {
    if (foundations.every(f => f.length === 13)) {
        if(timerInterval) clearInterval(timerInterval);
        setTimeout(() => {
            playSound('win');
            alert(`YOU WIN! Time: ${document.getElementById("timer-display").innerText} | Moves: ${moves}`);
            document.getElementById("restart-btn").innerText = "Play Again";
        }, 500);
    }
}