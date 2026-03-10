// =============================================
// SCRABBLE — scrabble_app.js
// The Game Shack | Casino OS
// Modes: vs AI | Hotseat | Online
// =============================================

// ── 1. OS INIT ───────────────────────────────
let gameMode    = "ai";
let aiDifficulty = "medium";
let chatStarted = false;
let currentRoomId = null;
let myId    = 1;
let isHost  = false;

SystemUI.init({
    gameName: "SCRABBLE",
    rules: "Take turns placing tiles on the board to form words. Words must connect to existing tiles. Double/Triple Letter and Word squares multiply your score. Use all 7 tiles for a 50-point BINGO bonus!",
    hudDropdowns: [
        {
            id: "sys-scrabble-mode",
            options: [
                { value: "ai",      label: "🤖 vs AI"   },
                { value: "hotseat", label: "👥 Hotseat"  },
                { value: "online",  label: "🌐 Online"   }
            ]
        }
    ]
});

setTimeout(() => { gameMode = document.getElementById("sys-scrabble-mode").value; }, 10);

document.getElementById("sys-scrabble-mode").addEventListener("change", e => {
    gameMode = e.target.value;
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby")?.classList.add("hidden");
        SystemUI.stopChat();
        chatStarted = false;
    }
});

// ── 2. TILE DATA ─────────────────────────────
const TILE_VALUES = {
    a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,
    n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10,blank:0
};

const TILE_DISTRIBUTION = {
    a:9,b:2,c:2,d:4,e:12,f:2,g:3,h:2,i:9,j:1,k:1,l:4,m:2,
    n:6,o:8,p:2,q:1,r:6,s:4,t:6,u:4,v:2,w:2,x:1,y:2,z:1,blank:2
};

const IMG_PATH = "../../system/images/pieces/word-games/";

// ── 3. BOARD LAYOUT DATA ─────────────────────
const BOARD_SIZE = 15;

// Premium square types (r,c) → 'tw'|'dw'|'tl'|'dl'|'star'
const PREMIUM = {};
[
    [0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]
].forEach(([r,c]) => PREMIUM[`${r},${c}`] = "tw");
[
    [1,1],[2,2],[3,3],[4,4],[1,13],[2,12],[3,11],[4,10],
    [10,4],[11,3],[12,2],[13,1],[10,10],[11,11],[12,12],[13,13]
].forEach(([r,c]) => PREMIUM[`${r},${c}`] = "dw");
[
    [1,5],[1,9],[5,1],[5,5],[5,9],[5,13],
    [9,1],[9,5],[9,9],[9,13],[13,5],[13,9]
].forEach(([r,c]) => PREMIUM[`${r},${c}`] = "tl");
[
    [0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],
    [6,2],[6,6],[6,8],[6,12],[7,3],[7,11],
    [8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],
    [12,6],[12,8],[14,3],[14,11]
].forEach(([r,c]) => PREMIUM[`${r},${c}`] = "dl");
PREMIUM["7,7"] = "star";

const PREMIUM_LABELS = {
    tw: "TW", dw: "DW", tl: "TL", dl: "DL", star: "★"
};

// ── 4. GAME STATE ────────────────────────────
let board       = [];   // 15×15: null | { letter, value, isBlank, locked }
let tileBag     = [];
let players     = [];   // [{name, score, rack:[], isAI}]
let currentTurn = 0;    // 0|1
let gamePhase   = "idle"; // idle|playing|gameover
let consecutivePasses = 0;

// Currently placed (not yet committed)
let pendingTiles = []; // [{row, col, letter, value, isBlank, rackIdx}]

// Drag state
let dragState = null;  // {letter, value, isBlank, rackIdx, boardRow, boardCol}

// Dictionary cache
const dictCache = {};  // word → true|false

// AI
let aiTimeout = null;

// ── 5. BOARD RENDERING ───────────────────────
function buildBoard() {
    const boardEl = document.getElementById("board");
    boardEl.innerHTML = "";

    const area = document.getElementById("board-area");
    const areaW = area.clientWidth - 16;
    const areaH = area.clientHeight - 16;
    const cellSize = Math.floor(Math.min(areaW, areaH) / BOARD_SIZE);

    boardEl.style.width  = `${cellSize * BOARD_SIZE + BOARD_SIZE - 1}px`;
    boardEl.style.height = `${cellSize * BOARD_SIZE + BOARD_SIZE - 1}px`;
    boardEl.style.fontSize = `${cellSize}px`; // for em-based labels

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement("div");
            cell.className = "board-cell";
            cell.id = `cell-${r}-${c}`;
            cell.dataset.row = r;
            cell.dataset.col = c;

            const key = `${r},${c}`;
            if (PREMIUM[key]) {
                cell.classList.add(PREMIUM[key]);
                const lbl = document.createElement("span");
                lbl.className = "cell-label";
                lbl.textContent = PREMIUM_LABELS[PREMIUM[key]];
                cell.appendChild(lbl);
            }

            // Board cell click (place dragged tile or select for placement)
            cell.addEventListener("click",       () => onCellClick(r, c));
            cell.addEventListener("pointerenter",() => cell.classList.add("drag-over-hover"));
            cell.addEventListener("pointerleave",() => cell.classList.remove("drag-over-hover"));

            boardEl.appendChild(cell);
        }
    }

    // Size rack tiles
    const rackTileSize = Math.min(cellSize, 72);
    document.documentElement.style.setProperty("--tile-size", `${rackTileSize}px`);

    // Update board display with existing tiles
    renderBoard();
}

function renderBoard() {
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            renderCell(r, c);
        }
    }
}

function renderCell(r, c) {
    const cell = document.getElementById(`cell-${r}-${c}`);
    if (!cell) return;

    // Remove existing tile wrap
    cell.querySelector(".tile-img-wrap")?.remove();
    cell.classList.remove("newly-placed", "invalid");

    const tile = board[r][c];
    const pending = pendingTiles.find(p => p.row === r && p.col === c);

    if (tile || pending) {
        const data = tile || pending;
        const wrap = makeTileImgWrap(data.letter, data.value, data.isBlank);
        wrap.style.cssText = "position:absolute;inset:0;";
        cell.appendChild(wrap);
        if (pending) {
            cell.classList.add("newly-placed");
            // Always (re-)attach drag handler for pending tiles
            // Use a named handler so we can remove/re-add cleanly
            cell._pendingDragHandler = (e) => onBoardTileDragStart(e, r, c);
            cell.addEventListener("pointerdown", cell._pendingDragHandler, { once: true });
        }
    } else {
        // Restore premium label
        if (!cell.querySelector(".cell-label") && PREMIUM[`${r},${c}`]) {
            const lbl = document.createElement("span");
            lbl.className = "cell-label";
            lbl.textContent = PREMIUM_LABELS[PREMIUM[`${r},${c}`]];
            cell.appendChild(lbl);
        }
    }
}

// ── 6. TILE IMAGE HELPER ─────────────────────
function makeTileImgWrap(letter, value, isBlank) {
    const size = document.documentElement.style.getPropertyValue("--tile-size") || "56px";
    const wrap = document.createElement("div");
    wrap.className = "tile-img-wrap";
    wrap.style.width  = "100%";
    wrap.style.height = "100%";

    const letterImg = document.createElement("img");
    letterImg.className = "tile-letter";
    const imgName = isBlank ? "blank" : letter.toLowerCase();
    letterImg.src = `${IMG_PATH}${imgName}.png`;
    letterImg.alt = letter;
    letterImg.draggable = false;

    // Value overlay (only for non-blank real tiles — blank shows 0)
    const valueImg = document.createElement("img");
    valueImg.className = "tile-value";
    valueImg.src = `${IMG_PATH}${value}.png`;
    valueImg.alt = String(value);
    valueImg.draggable = false;

    wrap.appendChild(letterImg);
    wrap.appendChild(valueImg);
    return wrap;
}

function makeTileEl(letter, value, isBlank, rackIdx) {
    const size = document.documentElement.style.getPropertyValue("--tile-size") || "56px";
    const sizeN = parseInt(size);
    const el = document.createElement("div");
    el.className = "rack-tile";
    el.dataset.letter  = letter;
    el.dataset.value   = value;
    el.dataset.isBlank = isBlank ? "1" : "0";
    el.dataset.rackIdx = rackIdx;
    el.style.width  = size;
    el.style.height = size;

    const wrap = makeTileImgWrap(letter, value, isBlank);
    wrap.style.cssText = "";
    wrap.style.width  = "100%";
    wrap.style.height = "100%";
    el.appendChild(wrap);

    el.addEventListener("pointerdown", e => onTileDragStart(e, el));
    return el;
}

// ── 7. RACK RENDERING ────────────────────────
function renderRack() {
    const rack  = document.getElementById("rack");
    rack.innerHTML = "";
    const hand = players[currentTurn]?.rack || [];

    hand.forEach((tile, i) => {
        if (!tile) {
            // Empty slot placeholder
            const slot = document.createElement("div");
            slot.style.cssText = `width:var(--tile-size,56px);height:var(--tile-size,56px);`;
            rack.appendChild(slot);
            return;
        }
        const el = makeTileEl(tile.letter, tile.value, tile.isBlank, i);
        if (pendingTiles.some(p => p.rackIdx === i)) {
            el.classList.add("dragging-source");
        }
        rack.appendChild(el);
    });
}

// ── 8. DRAG AND DROP (pointer events, NOT draggable) ──
let ghostEl = null;

function onTileDragStart(e, el) {
    if (gamePhase !== "playing") return;
    if (currentTurn === 1 && gameMode === "ai") return;
    if (gameMode === "online" && currentTurn !== (myId - 1)) return;

    // If in exchange mode, toggle selection instead
    if (!document.getElementById("exchange-zone").classList.contains("hidden")) {
        el.classList.toggle("selected-exchange");
        new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
        return;
    }

    e.preventDefault();

    const rackIdx = parseInt(el.dataset.rackIdx);

    // Prevent dragging a tile that's already placed on the board
    if (pendingTiles.some(p => p.rackIdx === rackIdx)) return;

    const letter  = el.dataset.letter;
    const value   = parseInt(el.dataset.value);
    const isBlank = el.dataset.isBlank === "1";

    dragState = { letter, value, isBlank, rackIdx, fromBoard: false };

    // Create ghost
    ghostEl = document.createElement("div");
    ghostEl.id = "drag-ghost";
    const size = document.documentElement.style.getPropertyValue("--tile-size") || "56px";
    ghostEl.style.width  = size;
    ghostEl.style.height = size;
    const wrap = makeTileImgWrap(letter, value, isBlank);
    wrap.style.cssText = "width:100%;height:100%;";
    ghostEl.appendChild(wrap);
    document.body.appendChild(ghostEl);

    moveGhost(e.clientX, e.clientY);
    ghostEl.style.display = "block";

    el.classList.add("dragging-source");

    document.addEventListener("pointermove",  onDragMove);
    document.addEventListener("pointerup",    onDragEnd);
    document.addEventListener("pointercancel",onDragCancel);
}

function moveGhost(x, y) {
    if (!ghostEl) return;
    ghostEl.style.left = `${x}px`;
    ghostEl.style.top  = `${y}px`;
}

function onDragMove(e) {
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
    highlightDropTarget(e.clientX, e.clientY);
}

function highlightDropTarget(x, y) {
    document.querySelectorAll(".board-cell.drag-over").forEach(c => c.classList.remove("drag-over"));
    const target = getCellFromPoint(x, y);
    if (target) target.classList.add("drag-over");
}

function onDragEnd(e) {
    document.removeEventListener("pointermove",  onDragMove);
    document.removeEventListener("pointerup",    onDragEnd);
    document.removeEventListener("pointercancel",onDragCancel);
    document.querySelectorAll(".board-cell.drag-over").forEach(c => c.classList.remove("drag-over"));

    if (ghostEl) { ghostEl.remove(); ghostEl = null; }

    if (!dragState) return;

    const target = getCellFromPoint(e.clientX, e.clientY);
    if (target) {
        const r = parseInt(target.dataset.row);
        const c = parseInt(target.dataset.col);
        placeTileOnBoard(dragState, r, c);
    } else {
        // Dropped off board — return to rack
        recallTile(dragState);
    }

    dragState = null;
    renderRack();
}

function onDragCancel() {
    document.removeEventListener("pointermove",  onDragMove);
    document.removeEventListener("pointerup",    onDragEnd);
    document.removeEventListener("pointercancel",onDragCancel);
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    dragState = null;
    renderRack();
}

function getCellFromPoint(x, y) {
    // Temporarily hide ghost to hit-test the board cell underneath
    if (ghostEl) ghostEl.style.display = "none";
    const el = document.elementFromPoint(x, y);
    if (ghostEl) ghostEl.style.display = "block";
    if (!el) return null;
    const cell = el.closest(".board-cell");
    return cell || null;
}

// ── 9. TILE PLACEMENT ────────────────────────
function placeTileOnBoard(tileData, row, col) {
    // Can't place on occupied cell
    if (board[row][col] || pendingTiles.find(p => p.row === row && p.col === col)) {
        recallTile(tileData);
        return;
    }

    // Remove from pending if it was already on board (drag from board cell)
    if (tileData.fromBoard) {
        pendingTiles = pendingTiles.filter(p => !(p.row === tileData.boardRow && p.col === tileData.boardCol));
        renderCell(tileData.boardRow, tileData.boardCol);
    }

    // Handle blank tile — ask for letter
    if (tileData.isBlank) {
        showBlankModal((chosenLetter) => {
            pendingTiles.push({
                row, col,
                letter: chosenLetter.toUpperCase(),
                value: 0,
                isBlank: true,
                rackIdx: tileData.rackIdx
            });
            renderCell(row, col);
            updateWordPreview();
            new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
        });
        return;
    }

    pendingTiles.push({
        row, col,
        letter: tileData.letter,
        value: tileData.value,
        isBlank: false,
        rackIdx: tileData.rackIdx
    });

    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    renderCell(row, col); // renderCell now attaches the pointerdown handler
    updateWordPreview();
}

function onBoardTileDragStart(e, row, col) {
    const pending = pendingTiles.find(p => p.row === row && p.col === col);
    if (!pending) return;
    e.preventDefault();
    dragState = { ...pending, fromBoard: true, boardRow: row, boardCol: col };

    ghostEl = document.createElement("div");
    ghostEl.id = "drag-ghost";
    const size = document.documentElement.style.getPropertyValue("--tile-size") || "56px";
    ghostEl.style.width  = size;
    ghostEl.style.height = size;
    const wrap = makeTileImgWrap(pending.letter, pending.value, pending.isBlank);
    wrap.style.cssText = "width:100%;height:100%;";
    ghostEl.appendChild(wrap);
    document.body.appendChild(ghostEl);
    moveGhost(e.clientX, e.clientY);
    ghostEl.style.display = "block";

    document.addEventListener("pointermove",  onDragMove);
    document.addEventListener("pointerup",    onDragEnd);
    document.addEventListener("pointercancel",onDragCancel);
}

function onCellClick(row, col) {
    // If a pending tile is here and we have no drag, remove it
    const pendingIdx = pendingTiles.findIndex(p => p.row === row && p.col === col);
    if (pendingIdx >= 0 && !dragState) {
        recallTile(pendingTiles[pendingIdx]);
        pendingTiles.splice(pendingIdx, 1);
        renderCell(row, col);
        renderRack();
        updateWordPreview();
        new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    }
}

function recallTile(tileData) {
    // If dragged from the board but dropped off-board, keep it in pendingTiles
    // (it's still there) but re-render the cell so the pointerdown handler is restored
    if (tileData && tileData.fromBoard) {
        renderCell(tileData.boardRow, tileData.boardCol);
    }
    // Rack-sourced tile: was never removed from pendingTiles here, nothing to do
    // renderRack() is called by the caller
}

function recallAllTiles() {
    pendingTiles = [];
    renderBoard();
    renderRack();
    updateWordPreview();
}

// ── 10. WORD VALIDATION & SCORING ────────────
function getCurrentWords() {
    // Find all words formed by pending tiles
    if (pendingTiles.length === 0) return [];

    // Determine placement direction
    const rows = [...new Set(pendingTiles.map(p => p.row))];
    const cols = [...new Set(pendingTiles.map(p => p.col))];
    const isHorizontal = rows.length === 1;
    const isVertical   = cols.length === 1;
    const isSingle     = pendingTiles.length === 1;

    if (!isSingle && !isHorizontal && !isVertical) return null; // Invalid placement

    // Check no gap in placement
    if (isHorizontal && !isSingle) {
        const r = rows[0];
        const minC = Math.min(...cols);
        const maxC = Math.max(...cols);
        for (let c = minC; c <= maxC; c++) {
            if (!board[r][c] && !pendingTiles.find(p => p.row === r && p.col === c)) return null; // Gap
        }
    }
    if (isVertical && !isSingle) {
        const cl = cols[0];
        const minR = Math.min(...rows);
        const maxR = Math.max(...rows);
        for (let r = minR; r <= maxR; r++) {
            if (!board[r][cl] && !pendingTiles.find(p => p.row === r && p.col === cl)) return null;
        }
    }

    const allWords = [];

    // Main word
    const mainWord = extractWord(isVertical ? "vertical" : "horizontal", rows[0], cols[0]);
    if (mainWord && mainWord.word.length >= 2) allWords.push(mainWord);

    // Cross words formed by each pending tile
    const crossDir = isVertical ? "horizontal" : "vertical";
    pendingTiles.forEach(p => {
        const cross = extractWord(crossDir, p.row, p.col);
        if (cross && cross.word.length >= 2) allWords.push(cross);
    });

    // Single tile — check both directions
    if (isSingle) {
        const h = extractWord("horizontal", rows[0], cols[0]);
        const v = extractWord("vertical",   rows[0], cols[0]);
        const result = [];
        if (h && h.word.length >= 2) result.push(h);
        if (v && v.word.length >= 2) result.push(v);
        return result.length > 0 ? result : null;
    }

    return allWords.length > 0 ? allWords : null;
}

function extractWord(dir, startR, startC) {
    // Walk to the start of the word
    let r = startR, c = startC;
    if (dir === "horizontal") {
        while (c > 0 && (board[r][c-1] || pendingTiles.find(p => p.row === r && p.col === c-1))) c--;
    } else {
        while (r > 0 && (board[r-1][c] || pendingTiles.find(p => p.row === r-1 && p.col === c))) r--;
    }

    // Walk forward collecting tiles
    let word = "";
    const cells = [];
    let cr = r, cc = c;
    while (cr < BOARD_SIZE && cc < BOARD_SIZE) {
        const existing = board[cr][cc];
        const pending  = pendingTiles.find(p => p.row === cr && p.col === cc);
        const tile = existing || pending;
        if (!tile) break;
        word += tile.letter;
        cells.push({ row: cr, col: cc, tile, isPending: !!pending });
        if (dir === "horizontal") cc++; else cr++;
    }

    if (word.length < 1) return null;
    return { word, cells, dir };
}

function calcWordScore(wordObj) {
    let base = 0;
    let wordMult = 1;
    const usedPremium = new Set();

    wordObj.cells.forEach(({ row, col, tile, isPending }) => {
        const key = `${row},${col}`;
        const prem = isPending ? PREMIUM[key] : null; // Only count premium for newly placed tiles
        let letterVal = tile.value;

        if (prem === "dl") { letterVal *= 2; }
        if (prem === "tl") { letterVal *= 3; }
        base += letterVal;

        if (prem === "dw" || prem === "star") wordMult *= 2;
        if (prem === "tw")                    wordMult *= 3;
    });

    return base * wordMult;
}

function calcTotalScore(words) {
    let total = words.reduce((sum, w) => sum + calcWordScore(w), 0);
    // BINGO: all 7 tiles used
    if (pendingTiles.length === 7) total += 50;
    return total;
}

function updateWordPreview() {
    const preview = document.getElementById("word-preview");
    const playBtn = document.getElementById("btn-play");

    if (pendingTiles.length === 0) {
        preview.classList.add("hidden");
        playBtn.disabled = true;
        // Clear invalid markers
        document.querySelectorAll(".board-cell.invalid").forEach(c => c.classList.remove("invalid"));
        return;
    }

    const words = getCurrentWords();
    const connected = isFirstMove()
        ? pendingTiles.some(p => p.row === 7 && p.col === 7)
        : isConnected();

    if (!words || words.length === 0 || !connected) {
        preview.classList.add("hidden");
        playBtn.disabled = true;
        pendingTiles.forEach(p => {
            document.getElementById(`cell-${p.row}-${p.col}`)?.classList.add("invalid");
        });
        return;
    }

    // Clear invalid markers
    pendingTiles.forEach(p => {
        document.getElementById(`cell-${p.row}-${p.col}`)?.classList.remove("invalid");
    });

    const score = calcTotalScore(words);
    const wordStr = words.map(w => w.word.toLowerCase()).join(", ");

    document.getElementById("word-preview-text").textContent = wordStr;
    document.getElementById("word-preview-score").textContent = `+${score}`;
    preview.classList.remove("hidden");
    playBtn.disabled = false;
}

// ── 11. PLAY WORD ─────────────────────────────
async function playWord() {
    const words = getCurrentWords();
    if (!words || words.length === 0) return;

    // Must be connected to existing tiles (or first move through center)
    if (!isFirstMove() && !isConnected()) {
        new Audio('../../system/audio/defeat.mp3').play().catch(e=>{});
        showTurnMsg("Must connect to existing tiles");
        return;
    }

    if (isFirstMove()) {
        const touchesCenter = pendingTiles.some(p => p.row === 7 && p.col === 7);
        if (!touchesCenter) {
            new Audio('../../system/audio/defeat.mp3').play().catch(e=>{});
            showTurnMsg("First word must cover the center ★");
            return;
        }
    }

    // Validate all words
    document.getElementById("btn-play").disabled = true;
    showTurnMsg("Checking words...");

    const wordStrs = words.map(w => w.word.toLowerCase());
    const validations = await Promise.all(wordStrs.map(w => checkWord(w)));

    if (validations.some(v => !v)) {
        const badWords = wordStrs.filter((w, i) => !validations[i]);
        showTurnMsg(`Invalid: ${badWords.join(", ")}`);
        new Audio('../../system/audio/defeat.mp3').play().catch(e=>{});
        document.getElementById("btn-play").disabled = false;
        // Mark invalid cells
        pendingTiles.forEach(p => {
            document.getElementById(`cell-${p.row}-${p.col}`)?.classList.add("invalid");
        });
        return;
    }

    // Commit tiles to board
    const score = calcTotalScore(words);
    pendingTiles.forEach(p => {
        board[p.row][p.col] = { letter: p.letter, value: p.value, isBlank: p.isBlank, locked: true };
        // Remove from player rack
        players[currentTurn].rack[p.rackIdx] = null;
    });

    // Update score
    players[currentTurn].score += score;
    consecutivePasses = 0;

    // Log
    const mainWord = wordStrs[0].toUpperCase();
    addLogEntry(players[currentTurn].name, mainWord, score, false);

    // Update last play
    document.getElementById("last-play").classList.remove("hidden");
    document.getElementById("last-play-word").textContent = mainWord;
    document.getElementById("last-play-score").textContent = `+${score} points`;

    new Audio('../../system/audio/victory.mp3').play().catch(e=>{});

    // Draw new tiles
    const nullCount = players[currentTurn].rack.filter(t => t === null).length;
    const drawn = drawTiles(nullCount);
    let rackIdx = 0;
    players[currentTurn].rack.forEach((t, i) => {
        if (t === null) {
            players[currentTurn].rack[i] = drawn[rackIdx++] || null;
        }
    });
    players[currentTurn].rack = players[currentTurn].rack.filter(t => t !== null);

    pendingTiles = [];

    updateScoreDisplay();
    renderBoard();

    if (gameMode === "online") pushOnlineState();

    // Check game over
    if (checkGameOver()) return;

    // Next turn
    nextTurn();
}

function isFirstMove() {
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            if (board[r][c]) return false;
    return true;
}

function isConnected() {
    // Check if any pending tile is adjacent to a locked board tile
    return pendingTiles.some(p => {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
        return dirs.some(([dr,dc]) => {
            const nr = p.row + dr, nc = p.col + dc;
            return nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE
                && board[nr][nc] && !pendingTiles.find(pp => pp.row === nr && pp.col === nc);
        });
    });
}

// ── 12. DICTIONARY CHECK ─────────────────────
// Built-in common 2-3 letter word list for speed
const COMMON_WORDS = new Set(
    "aa ab ad ae ag ah ai al am an ar as at aw ax ay ba be bi bo by da de do ea ed ef eh el em en er es et ex fa fe fi gi go ha he hi hm ho id if in is it ja jo ka ki la li lo ma me mi mm mo mu my na ne no nu ob od oe of oh oi ok om on op or os ow ox oy pa pe pi po qi re sh si so ta te ti to ug uh um un up ur us ut wo xi xu ya ye yo za abs ace act add age ago aid aim air ale all alp alt amp and ant any ape apt arc are ark arm art ash ask ass ate auk awe awl awn axe aye bad bag ban bar bat bay bed beg bet bid big bin bit boa bog boo bop bow box boy bud bug bun bus but buy bye cab can cap car cat caw cob cod cog cop cow cry cub cup cut dab dam day deb den dew did die dig dim dip doe dog don dot dry dub dud dug duo ear eat ego elk elm emu end era eve ewe eye fab fad fan far fat fax fay fed few fez fib fig fin fir fit fix fly fob foe fog fop for fox fry fub fun fur gab gag gap gar gas gel gem get gig gin gnu god goo got gum gun gut guy gym had ham has hat hay hem her hew hex hey hid hip his hit hob hoe hog hop hot how hub hug hum hut ice icy ill imp ink inn ion ire irk jab jag jam jar jaw jay jet jig job jog jot joy jug jut keg kid kin kit lab lag lam lap law lax lay lea led leg let lid lip lit lob log lot low lug mad man map mar mat maw may men met mew mid mix mob mod mom mop mow mud mug mum nun oak oat odd ode off old opt orb ore our out owe owl own pal pan pap par pat paw pay pea peg pet pew pie pig pin pit ply pod pop pot pow pro pry pub pug pun pup pus put rag ram ran rap rat raw ray red ref rep rid rig rim rip rob rod rot row rub rug rum rut rye sad sag sap sat saw say sea set sew she sir ski sky sly sob sod son sop sot sow spa spy sty sub sue sum sun tab tan tap tar tat tax tee ten the thy tic tie tin tip toe ton too top tow toy try tub tug tun two ugh urn use van vat vow wad wag war was wax way web wed wig win wit woe wok won woo wow yak yam yap yew zig zip zoo".split(" ")
);

async function checkWord(word) {
    if (word.length < 2) return false;
    if (dictCache[word] !== undefined) return dictCache[word];
    if (COMMON_WORDS.has(word)) { dictCache[word] = true; return true; }

    // API check for longer/uncommon words
    try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        const valid = res.ok;
        dictCache[word] = valid;
        return valid;
    } catch {
        // Network error — allow word (graceful fallback)
        dictCache[word] = true;
        return true;
    }
}

// ── 13. GAME INIT ─────────────────────────────
function initGame(mode, difficulty) {
    gameMode = mode;
    aiDifficulty = difficulty;

    board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    tileBag = buildBag();
    pendingTiles = [];
    consecutivePasses = 0;
    currentTurn = 0;

    const p1Name = SystemUI.getPlayerName() || "Player 1";
    const p2Name = mode === "hotseat" ? "Player 2" : mode === "online" ? "Player 2" : "Computer";

    players = [
        { name: p1Name, score: 0, rack: [], isAI: false },
        { name: p2Name, score: 0, rack: [], isAI: mode === "ai" }
    ];

    // Deal 7 tiles to each player
    players.forEach(p => { p.rack = drawTiles(7); });

    gamePhase = "playing";

    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("p1-name").textContent = p1Name;
    document.getElementById("p2-name").textContent = p2Name;

    buildBoard();
    renderRack();
    updateBagCount();
    updateScoreDisplay();
    updateTurnDisplay();

    document.getElementById("btn-play").disabled   = true;
    document.getElementById("btn-recall").disabled = false;
}

function buildBag() {
    const bag = [];
    Object.entries(TILE_DISTRIBUTION).forEach(([letter, count]) => {
        for (let i = 0; i < count; i++) {
            const isBlank = letter === "blank";
            bag.push({
                letter: isBlank ? "" : letter.toUpperCase(),
                value: TILE_VALUES[letter],
                isBlank
            });
        }
    });
    return shuffleArr(bag);
}

function drawTiles(n) {
    const drawn = [];
    for (let i = 0; i < n && tileBag.length > 0; i++) {
        drawn.push(tileBag.pop());
    }
    return drawn;
}

function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ── 14. TURN MANAGEMENT ──────────────────────
function nextTurn() {
    pendingTiles = [];
    currentTurn = currentTurn === 0 ? 1 : 0;
    renderRack();
    updateTurnDisplay();
    updateScoreDisplay();
    updateWordPreview();

    if (players[currentTurn].isAI) {
        showTurnMsg("Computer is thinking...");
        aiTimeout = setTimeout(aiPlayTurn, 2200);
    }
}

function updateTurnDisplay() {
    const isMyTurn = (gameMode === "online")
        ? currentTurn === (myId - 1)
        : currentTurn === 0 || gameMode === "hotseat";

    const name = players[currentTurn].name;
    document.getElementById("p1-score-block").classList.toggle("active-player", currentTurn === 0);
    document.getElementById("p2-score-block").classList.toggle("active-player", currentTurn === 1);

    if (players[currentTurn].isAI) {
        document.getElementById("turn-label").textContent = `${name.toUpperCase()}'s TURN`;
        document.getElementById("turn-sub").textContent = "Thinking...";
    } else if (gameMode === "hotseat" || (gameMode === "online" && currentTurn === (myId - 1))) {
        document.getElementById("turn-label").textContent = `${name.toUpperCase()}'s TURN`;
        document.getElementById("turn-sub").textContent = "Place tiles on the board";
    } else {
        document.getElementById("turn-label").textContent = `${name.toUpperCase()}'s TURN`;
        document.getElementById("turn-sub").textContent = "Waiting...";
    }

    document.getElementById("btn-play").disabled     = true;
    document.getElementById("btn-exchange").disabled  = !isMyTurn || players[currentTurn].isAI;
    document.getElementById("btn-pass").disabled      = !isMyTurn || players[currentTurn].isAI;
    document.getElementById("btn-recall").disabled    = !isMyTurn || players[currentTurn].isAI;
    document.getElementById("btn-trade-cards")?.style.setProperty("display","none");
}

function updateScoreDisplay() {
    document.getElementById("p1-score").textContent = players[0].score;
    document.getElementById("p2-score").textContent = players[1].score;
    updateBagCount();
}

function updateBagCount() {
    document.getElementById("bag-count").textContent = tileBag.length;
}

function showTurnMsg(msg) {
    document.getElementById("turn-sub").textContent = msg;
}

function addLogEntry(playerName, word, points, isPass) {
    const log = document.getElementById("play-log");
    const entry = document.createElement("div");
    entry.className = "log-entry";
    if (isPass) {
        entry.innerHTML = `<span class="log-pass">${playerName}: passed</span>`;
    } else {
        entry.innerHTML = `<span class="log-word">${word}</span><span class="log-pts">+${points}</span>`;
    }
    log.insertBefore(entry, log.firstChild);
}

// ── 15. PASS & EXCHANGE ──────────────────────
function passAction() {
    recallAllTiles();
    consecutivePasses++;
    addLogEntry(players[currentTurn].name, "", 0, true);
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    if (gameMode === "online") pushOnlineState();
    if (checkGameOver()) return;
    nextTurn();
}

function startExchangeMode() {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    if (tileBag.length < 7) {
        showTurnMsg("Not enough tiles in bag to exchange");
        return;
    }
    document.getElementById("exchange-zone").classList.remove("hidden");
    document.getElementById("rack-inner").classList.add("hidden");
    // Unmark any existing selections
    document.querySelectorAll(".rack-tile.selected-exchange").forEach(el => el.classList.remove("selected-exchange"));
}

function cancelExchange() {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    document.getElementById("exchange-zone").classList.add("hidden");
    document.getElementById("rack-inner").classList.remove("hidden");
    document.querySelectorAll(".rack-tile.selected-exchange").forEach(el => el.classList.remove("selected-exchange"));
}

function confirmExchange() {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    const selected = [...document.querySelectorAll(".rack-tile.selected-exchange")];
    if (selected.length === 0) { cancelExchange(); return; }

    const indices = selected.map(el => parseInt(el.dataset.rackIdx)).sort((a,b) => b - a);

    // Return tiles to bag
    const returned = indices.map(i => players[currentTurn].rack[i]);
    returned.forEach(t => tileBag.push(t));
    shuffleArr(tileBag);

    // Remove from rack
    indices.forEach(i => players[currentTurn].rack.splice(i, 1));

    // Draw replacements
    const newTiles = drawTiles(indices.length);
    players[currentTurn].rack.push(...newTiles);

    cancelExchange();
    renderRack();
    updateBagCount();
    consecutivePasses++;
    addLogEntry(players[currentTurn].name, "", 0, true);
    if (checkGameOver()) return;
    nextTurn();
}

// ── 16. BLANK TILE MODAL ─────────────────────
let blankCallback = null;

function showBlankModal(callback) {
    blankCallback = callback;
    const grid = document.getElementById("blank-letter-grid");
    grid.innerHTML = "";
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter => {
        const btn = document.createElement("button");
        btn.className = "blank-choice";
        btn.textContent = letter;
        btn.addEventListener("click", () => {
            document.getElementById("blank-modal").classList.add("hidden");
            if (blankCallback) blankCallback(letter);
        });
        grid.appendChild(btn);
    });
    document.getElementById("blank-modal").classList.remove("hidden");
}

// ── 17. GAME OVER CHECK ──────────────────────
function checkGameOver() {
    // End if a player has no tiles and bag is empty
    const emptyRack = players.some(p => p.rack.length === 0 && tileBag.length === 0);
    // Or 4 consecutive passes
    const maxPasses = consecutivePasses >= 4;

    if (!emptyRack && !maxPasses) return false;

    gamePhase = "gameover";

    // Deduct remaining tile values
    players.forEach((p, i) => {
        const deduct = p.rack.reduce((sum, t) => sum + (t ? t.value : 0), 0);
        p.score -= deduct;
        if (p.score < 0) p.score = 0;
        // Bonus to opponent if they ran out
        if (p.rack.length === 0) {
            const opp = players[1 - i];
            const bonus = opp.rack.reduce((sum, t) => sum + (t ? t.value : 0), 0);
            p.score += bonus;
        }
    });

    updateScoreDisplay();

    const winner = players[0].score >= players[1].score ? players[0] : players[1];
    const loser  = players[0].score >= players[1].score ? players[1] : players[0];
    const isTie  = players[0].score === players[1].score;

    document.getElementById("game-over-emoji").textContent = isTie ? "🤝" : "🏆";
    document.getElementById("game-over-title").textContent = isTie ? "TIE GAME" : "WINNER!";
    document.getElementById("game-over-msg").textContent =
        isTie
        ? `Both players scored ${players[0].score} points.`
        : `${winner.name} wins with ${winner.score} points!\n${loser.name}: ${loser.score} points`;

    new Audio('../../system/audio/victory.mp3').play().catch(e=>{});
    document.getElementById("game-over-modal").classList.remove("hidden");
    return true;
}

// ── 18. AI PLAYER ─────────────────────────────
/*
 * AI strategy (word-list based, no permutation explosion):
 * 1. Filter AI_WORDS to words formable from rack + board letters
 * 2. For each candidate word, find every valid board position
 * 3. Score each valid placement, pick best
 * 4. If no valid move: exchange tiles or pass
 */

const AI_WORDS = (
  "aa ab ad ae ag ah ai al am an ar as at aw ax ay ba be bi bo by da de do " +
  "ea ed ef eh el em en er es et ex fa fe gi go ha he hi ho id if in is it " +
  "jo ka ki la li lo ma me mi mo mu my na ne no nu ob od oe of oh oi ok om on " +
  "op or os ow ox oy pa pe pi po qi re sh si so ta te ti to ug uh um un up us " +
  "ut wo xi xu ya ye yo za " +
  "ace act add age ago aid aim air ale all amp and ant any ape apt arc are ark " +
  "arm art ash ask ate awe awl awn axe aye bad bag ban bar bat bay bed beg bet " +
  "bid big bin bit boa bog bow box boy bud bug bun bus but bye cab can cap car " +
  "cat cob cod cog cop cow cry cub cup cut dam day den dew die dig dim dip doe " +
  "dog dot dry dub dug duo ear eat ego elk elm emu end era eve ewe eye fad fan " +
  "far fat fax fed few fez fib fig fin fir fit fix fly foe fog for fox fry fun " +
  "fur gab gap gas gel gem get gin gnu god got gum gun gut had ham has hat hay " +
  "hem her hew hey hid hip hit hob hoe hog hop hot hub hug hum hut ice ill imp " +
  "ink inn ion ire irk jab jam jar jaw jet jig job jog jot joy jug jut keg kid " +
  "kin kit lab lag lap law lay lea led leg let lid lip lit lob log lot low lug " +
  "mad man map mar mat maw may men met mid mix mob mop mow mud mug nun oak oat " +
  "odd ode off old opt orb ore our out owe owl own pal pan par pat paw pay pea " +
  "peg pet pie pig pin pit ply pod pop pot row rub rug rum rut rye sad sag sap " +
  "sat saw say sea set sew sir ski sky sob sod son sow spa spy sub sue sum sun " +
  "tab tan tap tar tax tee ten tie tin tip toe ton too top tow toy try tub tug " +
  "urn use van vat vow wad wag war wax way web wed win wit woe won woo yak yam " +
  "yap yew zip zoo abs acre aged aims airs ales ally also alto aloe alms amps " +
  "bale ball band bane bang bank bare bark barn base bath bead beam bean bear " +
  "beat beef been beer bell belt best bill bind bite blob blow blue blur boar " +
  "boat bold bolt bond bone book boom boot bore born boss both bout bowl brag " +
  "bran brew brim brow buck bull bump burn bust cafe cage cake call calm came " +
  "camp cane cape card care cart case cash cast cave cell cent chap char chat " +
  "chef chew chin chip chop cite clad clam clap claw clay clip clog clot club " +
  "clue coal coat coil coin cold colt come cone cook cool cope core cork corn " +
  "cost cove crab cram crew crop crow cube cure curl curt cute damp dare dark " +
  "darn dart dash data date dawn dead deaf deal dean dear deck deed deep deer " +
  "deft deli dent deny desk dial dice dike dill dime dine dire disk dive dock " +
  "dome done doom door dose dote dove down drab drag dram drip drop drug drum " +
  "dual dumb dump dune dusk dust each earl earn ease east edge emit epic even " +
  "ever evil exam exit face fact fade fail fair fake fall fame fare farm fast " +
  "fate fawn feat feed feel feet fell felt fend fern fest feud file fill film " +
  "find fine fire firm fish fist flag flap flat flaw flea fled flew flip flit " +
  "floe flow foam foil fold fond font food fool fore fork fort foul four fowl " +
  "free fret fuel full fume fund fuse fuzz gale gall game gang gape gash gate " +
  "gawk gaze gear gent gild gilt gist give glad glee glen glib glob glow glum " +
  "glut goad goat gold golf gone good gore gown grab grad gram gray grew grid " +
  "grim grin grip grit grow grub gulf gull gulp gust hack hail hair hale hall " +
  "halt hand hang hard hare hark harm harp hart hate haul have hawk heal heap " +
  "hear heat heel held helm help here hero hewn hide high hike hill hint hire " +
  "hive hoax hock hold hole home hone honk hood hoop hoot hope horn hose host " +
  "hour hull hump hung hunk hunt hurl hymn icon idea idle inch into iron isle " +
  "item jade jail jeer jerk jest join joke jolt junk jury just keen keep kelp " +
  "kept kern kick kind king kite knee knob knot know lack lame lamp land lane " +
  "lard lark lash last late laud lawn laze lazy lead leaf leak lean leap leer " +
  "left lend lens less lest levy lime limp line link lion list live load loaf " +
  "loan loft loom loon loop lore loss lost loud love lull lump lung lure lurk " +
  "lust lute lynx mace made mail main make male mall malt mane mare mark mart " +
  "mash mask mast mate maze mead meal mean meet melt memo mend menu mere mesh " +
  "mild mile milk mill mime mind mine mint mire mist moan moat mock mode mold " +
  "mole molt monk mood moon moor moot more morn most mote muse musk must mute " +
  "myth nail name nape nave neat neck need nest next nice nick node norm note " +
  "noun nude null numb oath oboe okra once only onto open oral orca oval oven " +
  "over oxen pace pack pact page paid pail pain pair pale palm pane park part " +
  "pass past path pave peak peal pear peat peek peel peer pelt pest pick pike " +
  "pile pill pine ping pipe pith plan plod plot plow plug plum plus poem poet " +
  "pole poll polo pond pore pork port pose post pour pray prey prod prop prow " +
  "pull pulp pump pure push putt quit race rack rage raid rail rain ramp rang " +
  "rank rant rape rash rate rave read real reap reed reef reel rely rend rent " +
  "rest rice rich rick ride rife rift ring riot rise risk roam roar robe rock " +
  "rode role roll romp rook room root rope rose rosy rout rove rude ruin rule " +
  "rump rune ruse rush rust safe sage sail sale salt same sand sane sang sank " +
  "sash save scam scan scar seal seam seep seer self sell semi send sent sewn " +
  "shed shin ship shoe shod shop shot show shut side sigh silk sill sing sink " +
  "sire site size skid skim skin skip slab slap slat sled slew slid slim slip " +
  "slit slob slop slot slow slug slum slur smog smug snag snap snip snob snow " +
  "snub soak soap sock soft soil sold sole some song soon sort soul soup sour " +
  "span spar spit spot spun spur stab stag star stay stem step stew stir stop " +
  "stub stud stun such suit sulk sung sunk sure surf swam swan swap swat sway " +
  "swim swum tack tail tale talk tall tame tang tart task taut teal team tear " +
  "teed tell tend tent term text than that them then thin this tide till tilt " +
  "time tire toad toil told toll tomb tome tone tong took tore torn tort toss " +
  "tour town trek trim trio trip trod trot true tuft tune turf tusk twig twin " +
  "type ugly upon urge vain vale vast veal veil vein vend vent very vest view " +
  "vile vine void vole volt vote wade wail wake wale walk wall wand wane ward " +
  "ware warm warn warp wart wash wasp weal wean wear weep weld well wend went " +
  "were west wide wile will wilt wily wind wine wing wink wire wise wish wisp " +
  "with woke wolf womb wool word wore work worm worn wove wren writ yawl year " +
  "yell yelp yore your zeal zest zinc zone zoom"
).split(" ").filter(Boolean);

function aiPlayTurn() {
    if (gamePhase !== "playing" || !players[1].isAI) return;

    const rack = players[1].rack.filter(Boolean);
    if (rack.length === 0) { passAction(); return; }

    const isFirst = isFirstMove();
    const bestMove = findBestAIMove(rack, isFirst);

    if (!bestMove) {
        if (tileBag.length >= 7) {
            aiExchange(rack);
        } else {
            passAction();
        }
        return;
    }

    // Animate placement tile by tile
    let i = 0;
    const placeNext = () => {
        if (i >= bestMove.placement.length) {
            const words = getCurrentWords();
            if (!words || words.length === 0) { recallAllTiles(); passAction(); return; }
            const score = calcTotalScore(words);

            pendingTiles.forEach(p => {
                board[p.row][p.col] = { letter: p.letter, value: p.value, isBlank: p.isBlank, locked: true };
                players[1].rack[p.rackIdx] = null;
            });

            players[1].score += score;
            consecutivePasses = 0;

            const mainWord = words[0].word.toUpperCase();
            addLogEntry(players[1].name, mainWord, score, false);
            document.getElementById("last-play").classList.remove("hidden");
            document.getElementById("last-play-word").textContent  = mainWord;
            document.getElementById("last-play-score").textContent = `+${score} points`;

            new Audio('../../system/audio/click1.mp3').play().catch(e=>{});

            const nullCount = players[1].rack.filter(t => t === null).length;
            const drawn = drawTiles(nullCount);
            let di = 0;
            players[1].rack.forEach((t, ri) => {
                if (t === null) players[1].rack[ri] = drawn[di++] || null;
            });
            players[1].rack = players[1].rack.filter(Boolean);

            pendingTiles = [];
            updateScoreDisplay();
            renderBoard();

            if (gameMode === "online") pushOnlineState();
            if (checkGameOver()) return;
            nextTurn();
            return;
        }

        const p = bestMove.placement[i++];
        pendingTiles.push(p);
        renderCell(p.row, p.col);
        updateWordPreview();
        aiTimeout = setTimeout(placeNext, 700);
    };

    aiTimeout = setTimeout(placeNext, 1200);
}

function findBestAIMove(rack, isFirst) {
    const rackLetters = rack.map(t => t.isBlank ? "*" : t.letter.toLowerCase());
    const anchors = getAnchors(isFirst);
    const moves = [];

    for (const word of AI_WORDS) {
        if (word.length < 2) continue;
        if (aiDifficulty === "easy"   && word.length > 4) continue;
        if (aiDifficulty === "medium" && word.length > 6) continue;

        for (const [ar, ac] of anchors) {
            for (const dir of ["horizontal", "vertical"]) {
                const found = tryWordAtAnchor(word, rack, rackLetters, ar, ac, dir, isFirst);
                if (found) moves.push(...found);
            }
        }
    }

    if (moves.length === 0) return null;
    moves.sort((a, b) => b.score - a.score);

    if (aiDifficulty === "easy") {
        const pool = moves.slice(0, Math.min(8, moves.length));
        return pool[Math.floor(Math.random() * pool.length)];
    }
    return moves[0];
}

function getAnchors(isFirst) {
    if (isFirst) return [[7, 7]];
    const anchors = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c]) continue;
            const adjacent = [[-1,0],[1,0],[0,-1],[0,1]].some(([dr,dc]) => {
                const nr = r + dr, nc = c + dc;
                return nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc];
            });
            if (adjacent) anchors.push([r, c]);
        }
    }
    return anchors;
}

function tryWordAtAnchor(word, rackObjs, rackLetters, ar, ac, dir, isFirst) {
    const results = [];

    for (let wordPos = 0; wordPos < word.length; wordPos++) {
        const startR = dir === "vertical"   ? ar - wordPos : ar;
        const startC = dir === "horizontal" ? ac - wordPos : ac;
        if (startR < 0 || startC < 0) continue;

        const endR = dir === "vertical"   ? startR + word.length - 1 : startR;
        const endC = dir === "horizontal" ? startC + word.length - 1 : startC;
        if (endR >= BOARD_SIZE || endC >= BOARD_SIZE) continue;

        // No tile immediately before or after the word
        const prevR = dir === "vertical"   ? startR - 1 : startR;
        const prevC = dir === "horizontal" ? startC - 1 : startC;
        if (prevR >= 0 && prevC >= 0 && board[prevR][prevC]) continue;
        const nextR = dir === "vertical"   ? endR + 1 : endR;
        const nextC = dir === "horizontal" ? endC + 1 : endC;
        if (nextR < BOARD_SIZE && nextC < BOARD_SIZE && board[nextR][nextC]) continue;

        const placement = [];
        const usedRack = new Set();
        let valid = true;
        let usesRackTile = false;

        for (let i = 0; i < word.length; i++) {
            const r = dir === "vertical"   ? startR + i : startR;
            const c = dir === "horizontal" ? startC + i : startC;
            const letter = word[i];
            const existing = board[r][c];

            if (existing) {
                if (existing.letter.toLowerCase() !== letter) { valid = false; break; }
            } else {
                const ri = findRackTile(letter, rackLetters, usedRack);
                if (ri === -1) { valid = false; break; }
                usedRack.add(ri);
                const tile = rackObjs[ri];
                placement.push({
                    row: r, col: c,
                    letter: letter.toUpperCase(),
                    value: tile.isBlank ? 0 : tile.value,
                    isBlank: tile.isBlank,
                    rackIdx: ri
                });
                usesRackTile = true;
            }
        }

        if (!valid || !usesRackTile || placement.length === 0) continue;

        // Simulate and validate
        const saved = pendingTiles;
        pendingTiles = placement;
        const words = getCurrentWords();
        const connected = isFirst
            ? placement.some(p => p.row === 7 && p.col === 7) || (words && words[0]?.cells.some(c => c.row === 7 && c.col === 7))
            : isConnected();
        const score = (words && connected) ? calcTotalScore(words) : 0;
        pendingTiles = saved;

        if (!words || !connected || score <= 0) continue;
        results.push({ placement, score, word });
    }

    return results.length > 0 ? results : null;
}

function findRackTile(letter, rackLetters, usedIndices) {
    for (let i = 0; i < rackLetters.length; i++) {
        if (!usedIndices.has(i) && rackLetters[i] === letter) return i;
    }
    for (let i = 0; i < rackLetters.length; i++) {
        if (!usedIndices.has(i) && rackLetters[i] === "*") return i;
    }
    return -1;
}


function aiExchange(rack) {
    // Return lowest-value tiles
    const sorted = [...rack].sort((a, b) => a.value - b.value);
    const toExchange = sorted.slice(0, Math.ceil(sorted.length / 2));
    toExchange.forEach(tile => {
        const idx = players[1].rack.indexOf(tile);
        if (idx >= 0) {
            tileBag.push(players[1].rack[idx]);
            players[1].rack.splice(idx, 1);
        }
    });
    shuffleArr(tileBag);
    const newTiles = drawTiles(toExchange.length);
    players[1].rack.push(...newTiles);
    consecutivePasses++;
    addLogEntry(players[1].name, "", 0, true);
    updateBagCount();
    if (checkGameOver()) return;
    nextTurn();
}

// ── 19. ONLINE MULTIPLAYER ───────────────────
function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            document.getElementById("multiplayer-lobby")?.classList.add("hidden");
            if (!chatStarted) {
                chatStarted = true;
                new Audio('../../system/audio/victory.mp3').play().catch(e=>{});
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            startOnlineGame(data);
            return;
        }
        if (gamePhase !== "playing") return;
        syncOnlineState(data);
    });
}

function startOnlineGame(data) {
    const count = parseInt(data.playerCount || 2);
    initGame("online", "medium");
    if (data.board)   board   = data.board;
    if (data.bag)     tileBag = data.bag;
    if (data.players) {
        players.forEach((p, i) => {
            if (data.players[i]) {
                p.score = data.players[i].score || 0;
                p.rack  = data.players[i].rack  || p.rack;
            }
        });
    }
    currentTurn = data.currentTurn || 0;
    renderBoard();
    renderRack();
    updateScoreDisplay();
    updateTurnDisplay();
}

function syncOnlineState(data) {
    if (!data) return;
    board       = data.board       || board;
    tileBag     = data.bag         || tileBag;
    currentTurn = data.currentTurn ?? currentTurn;
    if (data.players) {
        players.forEach((p, i) => {
            if (data.players[i]) {
                p.score = data.players[i].score;
                p.rack  = data.players[i].rack || p.rack;
            }
        });
    }
    pendingTiles = [];
    renderBoard();
    renderRack();
    updateScoreDisplay();
    updateTurnDisplay();
}

function pushOnlineState() {
    if (!currentRoomId) return;
    window.dbSet(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), {
        status: "playing",
        board,
        bag: tileBag,
        currentTurn,
        players: players.map(p => ({ name: p.name, score: p.score, rack: p.rack }))
    });
}

// ── 20. UI EVENT WIRING ───────────────────────
document.getElementById("btn-play").addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    if (gamePhase !== "playing") return;
    if (currentTurn === 1 && gameMode === "ai") return;
    if (pendingTiles.length === 0) return;
    playWord();
});

document.getElementById("btn-recall").addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    recallAllTiles();
    renderRack();
});

document.getElementById("btn-pass").addEventListener("click", passAction);

document.getElementById("btn-exchange").addEventListener("click", startExchangeMode);

document.getElementById("btn-exchange-confirm").addEventListener("click", confirmExchange);
document.getElementById("btn-exchange-cancel").addEventListener("click", cancelExchange);

document.getElementById("btn-save-game")?.addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    if (gameMode === "online") {
        alert("Online games are saved automatically to the server.");
        return;
    }
    if (gamePhase !== "playing") {
        alert("Can only save while playing.");
        return;
    }
    const saveData = {
        gameMode, aiDifficulty, currentTurn, gamePhase, consecutivePasses,
        board, tileBag, players
    };
    localStorage.setItem("scrabble_save_state", JSON.stringify(saveData));
    addLogEntry("SYSTEM", "GAME SAVED", 0, false);
});

document.getElementById("btn-load-game")?.addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    if (gameMode === "online") {
        alert("Cannot load local saves in online mode.");
        return;
    }
    const saved = localStorage.getItem("scrabble_save_state");
    if (!saved) {
        alert("No saved game found!");
        return;
    }
    try {
        const data = JSON.parse(saved);
        gameMode = data.gameMode;
        aiDifficulty = data.aiDifficulty;
        currentTurn = data.currentTurn;
        gamePhase = data.gamePhase;
        consecutivePasses = data.consecutivePasses;
        board = data.board;
        tileBag = data.bag || data.tileBag;
        players = data.players;

        document.getElementById("start-screen").classList.add("hidden");
        document.getElementById("p1-name").textContent = players[0].name;
        document.getElementById("p2-name").textContent = players[1].name;

        pendingTiles = [];
        if (ghostEl) { ghostEl.remove(); ghostEl = null; }
        dragState = null;

        buildBoard(); 
        renderRack();
        updateBagCount();
        updateScoreDisplay();
        updateTurnDisplay();
        updateWordPreview();
        
        addLogEntry("SYSTEM", "GAME LOADED", 0, false);
    } catch (e) {
        alert("Error loading game.");
        console.error(e);
    }
});

document.getElementById("btn-play-again").addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    document.getElementById("game-over-modal").classList.add("hidden");
    initGame(gameMode, aiDifficulty);
});

// Setup screen buttons
document.querySelectorAll(".opp-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
        document.querySelectorAll(".opp-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.mode;
        document.getElementById("difficulty-row").style.display = mode === "ai" ? "" : "none";
        if (mode === "online") {
            document.getElementById("multiplayer-lobby")?.classList.remove("hidden");
        }
    });
});

document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
        document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
    });
});

document.getElementById("start-btn").addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    const modeBtn = document.querySelector(".opp-btn.active");
    const diffBtn = document.querySelector(".diff-btn.active");
    const mode = modeBtn?.dataset.mode || "ai";
    const diff = diffBtn?.dataset.diff || "medium";

    if (mode === "online") {
        // Handled by multiplayer lobby
        return;
    }

    initGame(mode, diff);
});

// Keyboard shortcut: Enter = play, Escape = recall
document.addEventListener("keydown", e => {
    if (gamePhase !== "playing") return;
    if (e.key === "Enter" && !document.getElementById("btn-play").disabled) playWord();
    if (e.key === "Escape") recallAllTiles();
});

// Resize: rebuild board
window.addEventListener("resize", () => {
    if (gamePhase === "playing") buildBoard();
});