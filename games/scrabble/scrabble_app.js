// =============================================
// SCRABBLE — scrabble_app.js
// The Game Shack | Casino OS
// Modes: vs AI | Hotseat | Online
// =============================================

// ── 1. OS INIT ───────────────────────────────
let gameMode    = "ai";
let aiDifficulty = "medium";
let lobbyPlayerCount = parseInt(localStorage.getItem("scrabble_pcount") || "2");
let chatStarted = false;
let currentRoomId = null;
let myId    = 1;
let isHost  = true;
let seats   = [];

SystemUI.init({
    gameName: "SCRABBLE",
    rules: "Take turns placing tiles on the board to form words. Words must connect to existing tiles. Double/Triple Letter and Word squares multiply your score. Use all 7 tiles for a 50-point BINGO bonus!",
    hudDropdowns: [
        {
            id: "sys-scrabble-mode",
            label: "Mode",
            options: [
                { value: "ai",      label: "🤖 vs AI"   },
                { value: "hotseat", label: "👥 Hotseat"  },
                { value: "online",  label: "🌐 Online"   }
            ]
        }
    ]
});

function applyModeUI() {
    const setupPanel = document.getElementById("setup-panel");
    const startBtn   = document.getElementById("start-btn");
    const diffRow    = document.getElementById("difficulty-row");
    if (gameMode === "online") {
        if (setupPanel) setupPanel.style.display = "none";
        if (startBtn)   startBtn.style.display   = "none";
        SystemUI.v2Lobby?.show();
    } else {
        if (setupPanel) setupPanel.style.display = "";
        if (startBtn)   startBtn.style.display   = "";
        if (diffRow)    diffRow.style.display    = (gameMode === "ai") ? "" : "none";
        SystemUI.v2Lobby?.hide();
        SystemUI.stopChat?.();
        chatStarted = false;
        myId = 1; isHost = true;
    }
}

function buildStartScreen() {
    document.querySelectorAll("#opponent-row .opp-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            new Audio('../../system/audio/click1.mp3').play().catch(()=>{});
            document.querySelectorAll("#opponent-row .opp-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            gameMode = btn.dataset.mode;
            localStorage.setItem("scrabble_mode", gameMode);
            const modeEl = document.getElementById("sys-scrabble-mode");
            if (modeEl) modeEl.value = gameMode;
            applyModeUI();
        });
    });

    document.querySelectorAll("#difficulty-btns .diff-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            new Audio('../../system/audio/click1.mp3').play().catch(()=>{});
            document.querySelectorAll("#difficulty-btns .diff-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            aiDifficulty = btn.dataset.diff;
        });
    });

    const setupPanel = document.getElementById("setup-panel");
    if (setupPanel && !document.getElementById("count-row-wrapper")) {
        const countRow = document.createElement("div");
        countRow.id = "count-row-wrapper";
        countRow.className = "setup-row";
        countRow.innerHTML = `
            <span class="setup-label">PLAYERS</span>
            <div id="local-count-btns">
                ${[2,3,4].map(n => `<button class="opp-btn count-btn${lobbyPlayerCount===n?' active':''}" data-count="${n}">${n}</button>`).join("")}
            </div>
        `;
        setupPanel.appendChild(countRow);
        document.querySelectorAll(".count-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                new Audio('../../system/audio/click1.mp3').play().catch(()=>{});
                document.querySelectorAll(".count-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                lobbyPlayerCount = parseInt(btn.dataset.count);
                localStorage.setItem("scrabble_pcount", lobbyPlayerCount);
            });
        });
    }
}

setTimeout(() => {
    const savedMode = localStorage.getItem("scrabble_mode");
    if (savedMode) gameMode = savedMode;

    const modeEl = document.getElementById("sys-scrabble-mode");
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", e => {
            gameMode = e.target.value;
            localStorage.setItem("scrabble_mode", gameMode);
            document.getElementById("sys-modal")?.classList.add("sys-hidden");
            document.querySelectorAll("#opponent-row .opp-btn").forEach(b => {
                b.classList.toggle("active", b.dataset.mode === gameMode);
            });
            applyModeUI();
        });
    }

    document.querySelectorAll("#opponent-row .opp-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.mode === gameMode);
    });

    buildStartScreen();
    applyModeUI();
}, 50);

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
let board       = [];
let tileBag     = [];
let players     = [];
let currentTurn = 0;    
let gamePhase   = "idle"; 
let consecutivePasses = 0;
let pendingTiles = []; 
let dragState = null;  
const dictCache = {};  
let aiTimeout = null;

// ── 5. BOARD RENDERING ───────────────────────
function buildBoard() {
    const boardEl = document.getElementById("board");
    if (!boardEl) return;
    boardEl.innerHTML = "";

    const area = document.getElementById("board-area");
    const areaW = area.clientWidth - 16;
    const areaH = area.clientHeight - 16;
    const cellSize = Math.floor(Math.min(areaW, areaH) / BOARD_SIZE);

    boardEl.style.width  = `${cellSize * BOARD_SIZE + BOARD_SIZE - 1}px`;
    boardEl.style.height = `${cellSize * BOARD_SIZE + BOARD_SIZE - 1}px`;
    boardEl.style.fontSize = `${cellSize}px`; 

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

            cell.addEventListener("click",       () => onCellClick(r, c));
            cell.addEventListener("pointerenter",() => cell.classList.add("drag-over-hover"));
            cell.addEventListener("pointerleave",() => cell.classList.remove("drag-over-hover"));

            boardEl.appendChild(cell);
        }
    }

    const rackTileSize = Math.min(cellSize, 72);
    document.documentElement.style.setProperty("--tile-size", `${rackTileSize}px`);
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
            cell._pendingDragHandler = (e) => onBoardTileDragStart(e, r, c);
            cell.addEventListener("pointerdown", cell._pendingDragHandler, { once: true });
        }
    } else {
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
function getDisplayPlayerIdx() {
    // Whose rack to show. Hotseat passes the screen between players, AI never reveals
    // its rack, online never reveals opponents' racks.
    if (gameMode === "hotseat") return currentTurn;
    if (gameMode === "online")  return Math.max(0, myId - 1);
    return 0; // ai mode: always the human
}

function renderRack() {
    const rack  = document.getElementById("rack");
    if (!rack) return;
    rack.innerHTML = "";
    const displayIdx = getDisplayPlayerIdx();
    const hand = players[displayIdx]?.rack || [];
    const showPending = displayIdx === currentTurn;

    hand.forEach((tile, i) => {
        if (!tile) {
            const slot = document.createElement("div");
            slot.style.cssText = `width:var(--tile-size,56px);height:var(--tile-size,56px);`;
            rack.appendChild(slot);
            return;
        }
        const el = makeTileEl(tile.letter, tile.value, tile.isBlank, i);
        if (showPending && pendingTiles.some(p => p.rackIdx === i)) {
            el.classList.add("dragging-source");
        }
        rack.appendChild(el);
    });
}

// ── 8. DRAG AND DROP ─────────────────────────
let ghostEl = null;

function onTileDragStart(e, el) {
    if (gamePhase !== "playing") return;
    if (players[currentTurn]?.isAI) return;
    if (gameMode === "online" && currentTurn !== (myId - 1)) return;

    if (!document.getElementById("exchange-zone").classList.contains("hidden")) {
        el.classList.toggle("selected-exchange");
        new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
        return;
    }

    e.preventDefault();
    const rackIdx = parseInt(el.dataset.rackIdx);
    if (pendingTiles.some(p => p.rackIdx === rackIdx)) return;

    const letter  = el.dataset.letter;
    const value   = parseInt(el.dataset.value);
    const isBlank = el.dataset.isBlank === "1";

    dragState = { letter, value, isBlank, rackIdx, fromBoard: false };

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
    if (ghostEl) ghostEl.style.display = "none";
    const el = document.elementFromPoint(x, y);
    if (ghostEl) ghostEl.style.display = "block";
    if (!el) return null;
    return el.closest(".board-cell") || null;
}

// ── 9. TILE PLACEMENT ────────────────────────
function placeTileOnBoard(tileData, row, col) {
    if (board[row][col] || pendingTiles.find(p => p.row === row && p.col === col)) {
        // Drop landed on an occupied cell — leave any source tile where it was.
        if (tileData && tileData.fromBoard) renderCell(tileData.boardRow, tileData.boardCol);
        return;
    }

    if (tileData.fromBoard) {
        pendingTiles = pendingTiles.filter(p => !(p.row === tileData.boardRow && p.col === tileData.boardCol));
        renderCell(tileData.boardRow, tileData.boardCol);
    }

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
    renderCell(row, col); 
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
    if (tileData && tileData.fromBoard) {
        pendingTiles = pendingTiles.filter(p => !(p.row === tileData.boardRow && p.col === tileData.boardCol));
        renderCell(tileData.boardRow, tileData.boardCol);
        renderRack();
        updateWordPreview();
    }
}

function recallAllTiles() {
    pendingTiles = [];
    renderBoard();
    renderRack();
    updateWordPreview();
}

// ── 10. WORD VALIDATION & SCORING ────────────
function getCurrentWords() {
    if (pendingTiles.length === 0) return [];
    const rows = [...new Set(pendingTiles.map(p => p.row))];
    const cols = [...new Set(pendingTiles.map(p => p.col))];
    const isHorizontal = rows.length === 1;
    const isVertical   = cols.length === 1;
    const isSingle     = pendingTiles.length === 1;

    if (!isSingle && !isHorizontal && !isVertical) return null;

    if (isHorizontal && !isSingle) {
        const r = rows[0];
        const minC = Math.min(...cols);
        const maxC = Math.max(...cols);
        for (let c = minC; c <= maxC; c++) {
            if (!board[r][c] && !pendingTiles.find(p => p.row === r && p.col === c)) return null; 
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
    const mainWord = extractWord(isVertical ? "vertical" : "horizontal", rows[0], cols[0]);
    if (mainWord && mainWord.word.length >= 2) allWords.push(mainWord);

    const crossDir = isVertical ? "horizontal" : "vertical";
    pendingTiles.forEach(p => {
        const cross = extractWord(crossDir, p.row, p.col);
        if (cross && cross.word.length >= 2) allWords.push(cross);
    });

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
    let r = startR, c = startC;
    if (dir === "horizontal") {
        while (c > 0 && (board[r][c-1] || pendingTiles.find(p => p.row === r && p.col === c-1))) c--;
    } else {
        while (r > 0 && (board[r-1][c] || pendingTiles.find(p => p.row === r-1 && p.col === c))) r--;
    }

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
    wordObj.cells.forEach(({ row, col, tile, isPending }) => {
        const key = `${row},${col}`;
        const prem = isPending ? PREMIUM[key] : null; 
        let letterVal = tile.value;
        if (prem === "dl") letterVal *= 2;
        if (prem === "tl") letterVal *= 3;
        base += letterVal;
        if (prem === "dw" || prem === "star") wordMult *= 2;
        if (prem === "tw")                    wordMult *= 3;
    });
    return base * wordMult;
}

function calcTotalScore(words) {
    let total = words.reduce((sum, w) => sum + calcWordScore(w), 0);
    if (pendingTiles.length === 7) total += 50;
    return total;
}

function updateWordPreview() {
    const preview = document.getElementById("word-preview");
    const playBtn = document.getElementById("btn-play");
    if (!preview || !playBtn) return;

    if (pendingTiles.length === 0) {
        preview.classList.add("hidden");
        playBtn.disabled = true;
        document.querySelectorAll(".board-cell.invalid").forEach(c => c.classList.remove("invalid"));
        return;
    }

    const words = getCurrentWords();
    const connected = isFirstMove() ? pendingTiles.some(p => p.row === 7 && p.col === 7) : isConnected();

    if (!words || words.length === 0 || !connected) {
        preview.classList.add("hidden");
        playBtn.disabled = true;
        pendingTiles.forEach(p => { document.getElementById(`cell-${p.row}-${p.col}`)?.classList.add("invalid"); });
        return;
    }

    pendingTiles.forEach(p => { document.getElementById(`cell-${p.row}-${p.col}`)?.classList.remove("invalid"); });

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

    if (!isFirstMove() && !isConnected()) {
        new Audio('../../system/audio/defeat.mp3').play().catch(e=>{});
        showTurnMsg("Must connect to existing tiles");
        return;
    }

    if (isFirstMove() && !pendingTiles.some(p => p.row === 7 && p.col === 7)) {
        new Audio('../../system/audio/defeat.mp3').play().catch(e=>{});
        showTurnMsg("First word must cover the center ★");
        return;
    }

    document.getElementById("btn-play").disabled = true;
    showTurnMsg("Checking words...");

    const wordStrs = words.map(w => w.word.toLowerCase());
    const validations = await Promise.all(wordStrs.map(w => checkWord(w)));

    if (validations.some(v => !v)) {
        const badWords = wordStrs.filter((w, i) => !validations[i]);
        showTurnMsg(`Invalid: ${badWords.join(", ")}`);
        new Audio('../../system/audio/defeat.mp3').play().catch(e=>{});
        document.getElementById("btn-play").disabled = false;
        pendingTiles.forEach(p => { document.getElementById(`cell-${p.row}-${p.col}`)?.classList.add("invalid"); });
        return;
    }

    const score = calcTotalScore(words);
    pendingTiles.forEach(p => {
        board[p.row][p.col] = { letter: p.letter, value: p.value, isBlank: p.isBlank, locked: true };
        players[currentTurn].rack[p.rackIdx] = null;
    });

    players[currentTurn].score += score;
    consecutivePasses = 0;

    const mainWord = wordStrs[0].toUpperCase();
    addLogEntry(players[currentTurn].name, mainWord, score, false);

    document.getElementById("last-play").classList.remove("hidden");
    document.getElementById("last-play-word").textContent = mainWord;
    document.getElementById("last-play-score").textContent = `+${score} points`;

    new Audio('../../system/audio/victory.mp3').play().catch(e=>{});

    const nullCount = players[currentTurn].rack.filter(t => t === null).length;
    const drawn = drawTiles(nullCount);
    let rackIdx = 0;
    players[currentTurn].rack.forEach((t, i) => {
        if (t === null) players[currentTurn].rack[i] = drawn[rackIdx++] || null;
    });
    players[currentTurn].rack = players[currentTurn].rack.filter(t => t !== null);

    pendingTiles = [];
    updateScoreDisplay();
    renderBoard();

    if (gameMode === "online") pushOnlineState();
    if (checkGameOver()) return;
    nextTurn();
}

function isFirstMove() {
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            if (board[r][c]) return false;
    return true;
}

function isConnected() {
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
const COMMON_WORDS = new Set("aa ab ad ae ag ah ai al am an ar as at aw ax ay ba be bi bo by da de do ea ed ef eh el em en er es et ex fa fe fi gi go ha he hi hm ho id if in is it ja jo ka ki la li lo ma me mi mm mo mu my na ne no nu ob od oe of oh oi ok om on op or os ow ox oy pa pe pi po qi re sh si so ta te ti to ug uh um un up ur us ut wo xi xu ya ye yo za abs ace act add age ago aid aim air ale all alp alt amp and ant any ape apt arc are ark arm art ash ask ass ate auk awe awl awn axe aye bad bag ban bar bat bay bed beg bet bid big bin bit boa bog boo bop bow box boy bud bug bun bus but buy bye cab can cap car cat caw cob cod cog cop cow cry cub cup cut dab dam day deb den dew did die dig dim dip doe dog don dot dry dub dud dug duo ear eat ego elk elm emu end era eve ewe eye fab fad fan far fat fax fay fed few fez fib fig fin fir fit fix fly fob foe fog fop for fox fry fub fun fur gab gag gap gar gas gel gem get gig gin gnu god goo got gum gun gut guy gym had ham has hat hay hem her hew hex hey hid hip his hit hob hoe hog hop hot how hub hug hum hut ice icy ill imp ink inn ion ire irk jab jag jam jar jaw jay jet jig job jog jot joy jug jut keg kid kin kit lab lag lam lap law lax lay lea led leg let lid lip lit lob log lot low lug mad man map mar mat maw may men met mew mid mix mob mod mom mop mow mud mug mum nun oak oat odd ode off old opt orb ore our out owe owl own pal pan pap par pat paw pay pea peg pet pew pie pig pin pit ply pod pop pot pow pro pry pub pug pun pup pus put rag ram ran rap rat raw ray red ref rep rid rig rim rip rob rod rot row rub rug rum rut rye sad sag sap sat saw say sea set sew she sir ski sky sly sob sod son sop sot sow spa spy sty sub sue sum sun tab tan tap tar tat tax tee ten the thy tic tie tin tip toe ton too top tow toy try tub tug tun two ugh urn use van vat vow wad wag war was wax way web wed wig win wit woe wok won woo wow yak yam yap yew zig zip zoo".split(" "));

async function checkWord(word) {
    const w = (word || "").toLowerCase();
    if (w.length < 2) return false;
    if (dictCache[w] !== undefined) return dictCache[w];
    if (window.SCRABBLE_DICT && window.SCRABBLE_DICT.has(w)) { dictCache[w] = true; return true; }
    if (COMMON_WORDS.has(w)) { dictCache[w] = true; return true; }
    // Local TWL is the authoritative source; treat misses as invalid even if the
    // online API would accept (keeps human plays consistent with what AI sees).
    dictCache[w] = false;
    return false;
}

// ── 13. GAME INIT ─────────────────────────────
function initGame(mode, difficulty, count = 2) {
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("scrabble");

    gameMode = mode;
    aiDifficulty = difficulty;
    lobbyPlayerCount = count;

    board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    tileBag = buildBag();
    pendingTiles = [];
    consecutivePasses = 0;
    currentTurn = 0;

    players = [];
    const p1Name = SystemUI.getPlayerName() || "Player 1";
    players.push({ name: p1Name, score: 0, rack: drawTiles(7), isAI: false });

    if (mode === "online") {
        for (let i = 1; i < seats.length; i++) {
            players.push({ name: seats[i].name, score: 0, rack: drawTiles(7), isAI: seats[i].type === "ai" });
        }
    } else if (mode === "ai") {
        for (let i = 1; i < count; i++) {
            players.push({ name: `Computer ${i}`, score: 0, rack: drawTiles(7), isAI: true });
        }
    } else {
        for (let i = 1; i < count; i++) {
            players.push({ name: `Player ${i+1}`, score: 0, rack: drawTiles(7), isAI: false });
        }
    }

    gamePhase = "playing";
    document.getElementById("start-screen").classList.add("hidden");
    
    const scoreBlock = document.getElementById("score-block");
    if (scoreBlock) {
        scoreBlock.innerHTML = "";
        players.forEach((p, i) => {
            const div = document.createElement("div");
            div.id = `p${i+1}-score-block`;
            div.className = "player-score" + (i === 0 ? " active-player" : "");
            div.innerHTML = `
                <div class="ps-name" id="p${i+1}-name">${p.name}</div>
                <div class="ps-score" id="p${i+1}-score">0</div>
                <div class="ps-label">POINTS</div>
            `;
            scoreBlock.appendChild(div);
        });
    }

    buildBoard();
    renderRack();
    updateBagCount();
    updateScoreDisplay();
    updateTurnDisplay();
    
    if (gameMode === "online" && isHost) pushOnlineState();
}

function buildBag() {
    const bag = [];
    Object.entries(TILE_DISTRIBUTION).forEach(([letter, count]) => {
        for (let i = 0; i < count; i++) {
            const isBlank = letter === "blank";
            bag.push({ letter: isBlank ? "" : letter.toUpperCase(), value: TILE_VALUES[letter], isBlank });
        }
    });
    return shuffleArr(bag);
}

function drawTiles(n) {
    const drawn = [];
    for (let i = 0; i < n && tileBag.length > 0; i++) { drawn.push(tileBag.pop()); }
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
    currentTurn = (currentTurn + 1) % players.length;
    renderRack();
    updateTurnDisplay();
    updateScoreDisplay();
    updateWordPreview();

    if (gameMode === "online") pushOnlineState();

    if (players[currentTurn]?.isAI) {
        showTurnMsg(`${players[currentTurn].name} is thinking...`);
        // In online mode only the host drives AI turns to avoid double plays.
        if (gameMode !== "online" || isHost) {
            scheduleAiTurn(2200);
        }
    }
}

// Schedules an AI move if one isn't already pending. aiTimeout is used as the
// "AI is committed" flag and cleared when the move finishes so we can re-arm.
function scheduleAiTurn(delay) {
    if (aiTimeout) return;
    aiTimeout = setTimeout(() => { aiTimeout = null; aiPlayTurn(); }, delay);
}

function updateTurnDisplay() {
    const isMyTurn = (gameMode === "online") ? currentTurn === (myId - 1) : currentTurn === 0 || gameMode === "hotseat";
    const name = players[currentTurn]?.name || "Player";

    players.forEach((_, i) => {
        const block = document.getElementById(`p${i+1}-score-block`);
        if (block) block.classList.toggle("active-player", currentTurn === i);
    });

    const label = document.getElementById("turn-label");
    const sub = document.getElementById("turn-sub");
    if (label) label.textContent = `${name.toUpperCase()}'s TURN`;
    if (sub) {
        if (players[currentTurn]?.isAI) sub.textContent = "Thinking...";
        else if (isMyTurn) sub.textContent = "Place tiles on the board";
        else sub.textContent = "Waiting...";
    }

    const btnP = document.getElementById("btn-play");
    const btnE = document.getElementById("btn-exchange");
    const btnPass = document.getElementById("btn-pass");
    const btnR = document.getElementById("btn-recall");

    if (btnP) btnP.disabled = true;
    if (btnE) btnE.disabled = !isMyTurn || players[currentTurn]?.isAI;
    if (btnPass) btnPass.disabled = !isMyTurn || players[currentTurn]?.isAI;
    if (btnR) btnR.disabled = !isMyTurn || players[currentTurn]?.isAI;
}

function updateScoreDisplay() {
    players.forEach((p, i) => {
        const el = document.getElementById(`p${i+1}-score`);
        if (el) el.textContent = p.score;
    });
    updateBagCount();
}

function updateBagCount() {
    const el = document.getElementById("bag-count");
    if (el) el.textContent = tileBag.length;
}

function showTurnMsg(msg) {
    const el = document.getElementById("turn-sub");
    if (el) el.textContent = msg;
}

function addLogEntry(playerName, word, points, isPass) {
    const log = document.getElementById("play-log");
    if (!log) return;
    const entry = document.createElement("div");
    entry.className = "log-entry";
    if (isPass) entry.innerHTML = `<span class="log-pass">${playerName}: passed</span>`;
    else entry.innerHTML = `<span class="log-word">${word}</span><span class="log-pts">+${points}</span>`;
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
    if (tileBag.length < 7) { showTurnMsg("Not enough tiles in bag to exchange"); return; }
    document.getElementById("exchange-zone").classList.remove("hidden");
    document.getElementById("rack-inner").classList.add("hidden");
    document.querySelectorAll(".rack-tile.selected-exchange").forEach(el => el.classList.remove("selected-exchange"));
}

function cancelExchange() {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    document.getElementById("exchange-zone").classList.add("hidden");
    document.getElementById("rack-inner").classList.remove("hidden");
}

function confirmExchange() {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    const selected = [...document.querySelectorAll(".rack-tile.selected-exchange")];
    if (selected.length === 0) { cancelExchange(); return; }
    const indices = selected.map(el => parseInt(el.dataset.rackIdx)).sort((a,b) => b - a);
    const returned = indices.map(i => players[currentTurn].rack[i]);
    returned.forEach(t => tileBag.push(t));
    shuffleArr(tileBag);
    indices.forEach(i => players[currentTurn].rack.splice(i, 1));
    const newTiles = drawTiles(indices.length);
    players[currentTurn].rack.push(...newTiles);
    cancelExchange(); renderRack(); updateBagCount();
    consecutivePasses++;
    addLogEntry(players[currentTurn].name, "", 0, true);
    if (checkGameOver()) return;
    nextTurn();
}

// ── 16. BLANK TILE MODAL ─────────────────────
function showBlankModal(callback) {
    const grid = document.getElementById("blank-letter-grid");
    grid.innerHTML = "";
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter => {
        const btn = document.createElement("button");
        btn.className = "blank-choice";
        btn.textContent = letter;
        btn.addEventListener("click", () => {
            document.getElementById("blank-modal").classList.add("hidden");
            if (callback) callback(letter);
        });
        grid.appendChild(btn);
    });
    document.getElementById("blank-modal").classList.remove("hidden");
}

// ── 17. GAME OVER CHECK ──────────────────────
function checkGameOver() {
    const emptyRack = players.some(p => p.rack.length === 0 && tileBag.length === 0);
    const maxPasses = consecutivePasses >= players.length * 2;
    if (!emptyRack && !maxPasses) return false;
    gamePhase = "gameover";
    players.forEach((p, i) => {
        const deduct = p.rack.reduce((sum, t) => sum + (t ? t.value : 0), 0);
        p.score = Math.max(0, p.score - deduct);
        if (p.rack.length === 0) {
            players.forEach((opp, oi) => { if (oi !== i) p.score += opp.rack.reduce((sum, t) => sum + (t ? t.value : 0), 0); });
        }
    });
    updateScoreDisplay();
    const sorted = [...players].sort((a,b) => b.score - a.score);
    const winner = sorted[0];
    document.getElementById("game-over-emoji").textContent = "🏆";
    document.getElementById("game-over-title").textContent = "WINNER!";
    document.getElementById("game-over-msg").textContent = `${winner.name} wins with ${winner.score} points!`;
    if (typeof SystemStats !== 'undefined' && gameMode !== "hotseat") {
        // Compare by seat index — names are display strings and can collide.
        if (players.indexOf(winner) === myId - 1) SystemStats.recordWin("scrabble", 0);
        else SystemStats.recordLoss("scrabble");
    }
    new Audio('../../system/audio/victory.mp3').play().catch(e=>{});
    document.getElementById("game-over-modal").classList.remove("hidden");
    return true;
}

// ── 18. AI PLAYER ─────────────────────────────
// Word buckets (cached). Built lazily from window.SCRABBLE_WORDS (TWL ~84k words)
// loaded by scrabble_dict.js. Falls back to COMMON_WORDS if the dict didn't load.
let _aiWordBuckets = null;
function getAiWordBuckets() {
    if (_aiWordBuckets) return _aiWordBuckets;
    const source = (window.SCRABBLE_WORDS && window.SCRABBLE_WORDS.length)
        ? window.SCRABBLE_WORDS
        : Array.from(COMMON_WORDS);
    const buckets = {};
    for (const w of source) {
        const len = w.length;
        if (len < 2 || len > 8) continue;
        (buckets[len] = buckets[len] || []).push(w);
    }
    _aiWordBuckets = buckets;
    return buckets;
}

// (Legacy inline AI word list removed; SCRABBLE_WORDS / SCRABBLE_DICT in
// scrabble_dict.js is now the single source of truth.)

function aiPlayTurn() {
    if (gamePhase !== "playing" || !players[currentTurn]?.isAI) return;
    const rack = players[currentTurn].rack.filter(Boolean);
    if (rack.length === 0) { passAction(); return; }
    const bestMove = findBestAIMove(rack, isFirstMove());
    if (!bestMove) {
        if (tileBag.length >= 7) aiExchange(rack);
        else passAction();
        return;
    }
    let i = 0;
    const placeNext = () => {
        if (i >= bestMove.placement.length) {
            aiTimeout = null;
            const words = getCurrentWords();
            if (!words || words.length === 0) { recallAllTiles(); passAction(); return; }
            const score = calcTotalScore(words);
            pendingTiles.forEach(p => {
                board[p.row][p.col] = { letter: p.letter, value: p.value, isBlank: p.isBlank, locked: true };
                players[currentTurn].rack[p.rackIdx] = null;
            });
            players[currentTurn].score += score; consecutivePasses = 0;
            const mainWord = words[0].word.toUpperCase();
            addLogEntry(players[currentTurn].name, mainWord, score, false);
            document.getElementById("last-play").classList.remove("hidden");
            document.getElementById("last-play-word").textContent  = mainWord;
            document.getElementById("last-play-score").textContent = `+${score} points`;
            new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
            const drawn = drawTiles(players[currentTurn].rack.filter(t => t === null).length);
            let di = 0;
            players[currentTurn].rack.forEach((t, ri) => {
                if (t === null) players[currentTurn].rack[ri] = drawn[di++] || null;
            });
            players[currentTurn].rack = players[currentTurn].rack.filter(Boolean);
            pendingTiles = []; updateScoreDisplay(); renderBoard();
            if (gameMode === "online") pushOnlineState();
            if (checkGameOver()) return;
            nextTurn(); return;
        }
        const p = bestMove.placement[i++];
        pendingTiles.push(p); renderCell(p.row, p.col); updateWordPreview();
        aiTimeout = setTimeout(placeNext, 700);
    };
    aiTimeout = setTimeout(placeNext, 1200);
}

function findBestAIMove(rack, isFirst) {
    const rackLetters = rack.map(t => t.isBlank ? "*" : t.letter.toLowerCase());
    const anchors = getAnchors(isFirst);
    const buckets = getAiWordBuckets();

    const maxLen = aiDifficulty === "easy" ? 5 : aiDifficulty === "medium" ? 7 : 8;
    const minLen = 2;

    // Quick rack-feasibility filter — discard words the rack can't plausibly help build.
    // The remaining shortfall (up to maxBoardSupply letters) must be covered by board tiles.
    const rackCounts = {}; let blanks = 0;
    for (const l of rackLetters) {
        if (l === "*") blanks++;
        else rackCounts[l] = (rackCounts[l] || 0) + 1;
    }
    const maxBoardSupply = isFirst ? 0 : 5;
    const canSupplyEnough = (w) => {
        const need = Math.max(1, w.length - maxBoardSupply);
        const wc = {};
        for (const c of w) wc[c] = (wc[c] || 0) + 1;
        let supplied = 0; let bl = blanks;
        for (const c in wc) {
            const have = rackCounts[c] || 0;
            const use = Math.min(have, wc[c]); supplied += use;
            const short = wc[c] - use;
            if (short > 0) {
                const ub = Math.min(bl, short);
                bl -= ub; supplied += ub;
            }
        }
        return supplied >= need;
    };

    // Candidate words longest-first (big plays score more, often a bingo).
    const candidates = [];
    for (let len = maxLen; len >= minLen; len--) {
        const bucket = buckets[len] || [];
        for (const w of bucket) if (canSupplyEnough(w)) candidates.push(w);
    }

    const moves = [];
    let work = aiDifficulty === "hard" ? 350000 : aiDifficulty === "medium" ? 120000 : 40000;

    outer: for (const word of candidates) {
        for (const [ar, ac] of anchors) {
            for (const dir of ["horizontal", "vertical"]) {
                if (--work <= 0) break outer;
                const found = tryWordAtAnchor(word, rack, rackLetters, ar, ac, dir, isFirst);
                if (found) moves.push(...found);
            }
        }
    }

    if (moves.length === 0) return null;
    moves.sort((a, b) => b.score - a.score);

    if (aiDifficulty === "easy") {
        // Pick a deliberately mediocre move — prefer scores ≤ 18, fall back to lowest 10.
        const weak = moves.filter(m => m.score <= 18);
        const pool = weak.length > 0 ? weak : moves.slice(-Math.min(moves.length, 10));
        return pool[Math.floor(Math.random() * pool.length)];
    }
    if (aiDifficulty === "medium") {
        // Top 5, biased toward best.
        const pool = moves.slice(0, Math.min(5, moves.length));
        const idx = Math.floor(Math.pow(Math.random(), 1.7) * pool.length);
        return pool[idx];
    }
    return moves[0]; // hard: optimal among what we found
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
        const startR = dir === "vertical" ? ar - wordPos : ar;
        const startC = dir === "horizontal" ? ac - wordPos : ac;
        if (startR < 0 || startC < 0) continue;
        const endR = dir === "vertical" ? startR + word.length - 1 : startR;
        const endC = dir === "horizontal" ? startC + word.length - 1 : startC;
        if (endR >= BOARD_SIZE || endC >= BOARD_SIZE) continue;
        const prevR = dir === "vertical" ? startR - 1 : startR;
        const prevC = dir === "horizontal" ? startC - 1 : startC;
        if (prevR >= 0 && prevC >= 0 && board[prevR][prevC]) continue;
        const nextR = dir === "vertical" ? endR + 1 : endR;
        const nextC = dir === "horizontal" ? endC + 1 : endC;
        if (nextR < BOARD_SIZE && nextC < BOARD_SIZE && board[nextR][nextC]) continue;
        const placement = []; const usedRack = new Set(); let valid = true; let usesRackTile = false;
        for (let i = 0; i < word.length; i++) {
            const r = dir === "vertical" ? startR + i : startR;
            const c = dir === "horizontal" ? startC + i : startC;
            const letter = word[i]; const existing = board[r][c];
            if (existing) { if (existing.letter.toLowerCase() !== letter) { valid = false; break; }
            } else {
                const ri = findRackTile(letter, rackLetters, usedRack);
                if (ri === -1) { valid = false; break; }
                usedRack.add(ri); const tile = rackObjs[ri];
                placement.push({ row: r, col: c, letter: letter.toUpperCase(), value: tile.isBlank ? 0 : tile.value, isBlank: tile.isBlank, rackIdx: ri });
                usesRackTile = true;
            }
        }
        if (!valid || !usesRackTile || placement.length === 0) continue;
        const saved = pendingTiles; pendingTiles = placement;
        const words = getCurrentWords();
        const connected = isFirst ? placement.some(p => p.row === 7 && p.col === 7) || (words && words[0]?.cells.some(c => c.row === 7 && c.col === 7)) : isConnected();
        // Validate every formed word (main + every cross-word). Without this the
        // AI happily plays "REAL" horizontally while creating "ZQ" vertically.
        let allValid = !!(words && connected);
        if (allValid) {
            const dict = window.SCRABBLE_DICT;
            for (const fw of words) {
                const key = fw.word.toLowerCase();
                if (dict ? !dict.has(key) : !COMMON_WORDS.has(key)) { allValid = false; break; }
            }
        }
        const score = allValid ? calcTotalScore(words) : 0;
        pendingTiles = saved;
        if (!allValid || score <= 0) continue;
        results.push({ placement, score, word });
    }
    return results.length > 0 ? results : null;
}

function findRackTile(letter, rackLetters, usedIndices) {
    for (let i = 0; i < rackLetters.length; i++) { if (!usedIndices.has(i) && rackLetters[i] === letter) return i; }
    for (let i = 0; i < rackLetters.length; i++) { if (!usedIndices.has(i) && rackLetters[i] === "*") return i; }
    return -1;
}

function aiExchange(rack) {
    const sorted = [...rack].sort((a, b) => a.value - b.value);
    const toExchange = sorted.slice(0, Math.ceil(sorted.length / 2));
    toExchange.forEach(tile => {
        const idx = players[currentTurn].rack.indexOf(tile);
        if (idx >= 0) {
            tileBag.push(players[currentTurn].rack[idx]);
            players[currentTurn].rack.splice(idx, 1);
        }
    });
    shuffleArr(tileBag);
    players[currentTurn].rack.push(...drawTiles(toExchange.length));
    consecutivePasses++; addLogEntry(players[currentTurn].name, "", 0, true); updateBagCount();
    if (checkGameOver()) return;
    nextTurn();
}

// ── 19. ONLINE MULTIPLAYER ───────────────────

function updateLobbyPreview() {
    const slots = [];
    const colors = ["#f5edd8", "#d4a840", "#e8c060", "#c8b888"];
    slots.push({ type: "host", name: SystemUI.getPlayerName(), color: colors[0] });
    for (let i = 1; i < lobbyPlayerCount; i++) {
        let name = "Waiting...";
        let type = "ai";
        if (seats[i]) {
            name = seats[i].name;
            type = seats[i].type;
        } else {
            name = "AI " + i + " (" + aiDifficulty + ")";
        }
        slots.push({ type, name, color: colors[i % colors.length] });
    }
    SystemUI.v2Lobby.updatePreview(slots);
}

SystemUI.v2Lobby.setup({
    settingsConfig: [
        {
            id: "lobby-count",
            label: "PLAYERS",
            type: "select",
            default: lobbyPlayerCount,
            options: [{ value: 2, label: "2" }, { value: 3, label: "3" }, { value: 4, label: "4" }]
        },
        {
            id: "lobby-diff",
            label: "AI DIFFICULTY",
            type: "select",
            default: aiDifficulty,
            options: [{ value: "easy", label: "EASY" }, { value: "medium", label: "MEDIUM" }, { value: "hard", label: "HARD" }]
        }
    ],
    onSettingsRendered: () => { updateLobbyPreview(); },
    onSettingChange: (key, val) => {
        if (key === "lobby-count") lobbyPlayerCount = parseInt(val);
        else if (key === "lobby-diff") aiDifficulty = val;
        updateLobbyPreview();
    },
    onHost: () => {
        currentRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        isHost = true; myId = 1; chatStarted = false;
        stateSeq = 0; lastSyncTime = 0; lastPushTime = 0;

        board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
        tileBag = buildBag();

        seats = [{ type: "human", name: SystemUI.getPlayerName() }];
        for (let i = 1; i < lobbyPlayerCount; i++) { seats.push({ type: "ai", name: "AI " + i }); }
        
        window.dbSet(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), {
            status: "waiting", seats: seats
        }).then(() => {
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
            listenToRoom();
        });
    },
    onJoin: (code) => {
        window.dbGet(window.dbChild(window.dbRef(window.db), `scrabble_rooms/${code}`)).then(snap => {
            if (snap.exists()) {
                const data = snap.val();
                if (data.status === "waiting") {
                    const updatedSeats = data.seats ? [...data.seats] : [];
                    let joinedIdx = -1;
                    for (let i = 1; i < updatedSeats.length; i++) {
                        if (updatedSeats[i].type === "ai") {
                            joinedIdx = i;
                            updatedSeats[i] = { type: "human", name: SystemUI.getPlayerName() };
                            break;
                        }
                    }
                    if (joinedIdx !== -1) {
                        const myName = SystemUI.getPlayerName();
                        window.dbUpdate(window.dbRef(window.db, `scrabble_rooms/${code}`), { seats: updatedSeats })
                            .then(() => window.dbGet(window.dbChild(window.dbRef(window.db), `scrabble_rooms/${code}`)))
                            .then(verifySnap => {
                                // Verify the claim stuck — a simultaneous joiner may have
                                // overwritten this seat (same pattern as SystemMatch).
                                const v = verifySnap.val();
                                const claimed = v && v.seats && v.seats[joinedIdx];
                                if (!claimed || claimed.type !== "human" || claimed.name !== myName) {
                                    SystemUI.v2Lobby.showError("SEAT TAKEN");
                                    return;
                                }
                                currentRoomId = code; isHost = false; myId = joinedIdx + 1; chatStarted = false;
                                stateSeq = 0; lastSyncTime = 0; lastPushTime = 0;
                                SystemUI.v2Lobby.showRoomPhase(code, false);
                                listenToRoom();
                            });
                    } else { SystemUI.v2Lobby.showError("ROOM FULL"); }
                }
            } else { SystemUI.v2Lobby.showError("ROOM NOT FOUND"); }
        });
    },
    onLeave: () => {
        leaveCurrentRoom();
        gameMode = "ai";
        localStorage.setItem("scrabble_mode", gameMode);
        const modeEl = document.getElementById("sys-scrabble-mode");
        if (modeEl) modeEl.value = "ai";
        document.querySelectorAll("#opponent-row .opp-btn").forEach(b => {
            b.classList.toggle("active", b.dataset.mode === "ai");
        });
        applyModeUI();
    },
    onStart: () => { window.dbUpdate(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), { status: "playing" }); },
    onClose: () => {
        if (gameMode === "online" && gamePhase === "idle") {
            leaveCurrentRoom();
            gameMode = "ai"; document.getElementById("sys-scrabble-mode").value = "ai";
        }
    }
});

// Tear down the active room: unsubscribe the listener, free the seat (joiner) or
// delete the room (host), and clear local room state. Safe to call when not in a room.
function leaveCurrentRoom() {
    if (roomUnsub) { try { roomUnsub(); } catch (e) {} roomUnsub = null; }
    if (currentRoomId) {
        if (isHost) {
            window.dbSet(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), null);
        } else if (myId > 1 && seats[myId - 1]) {
            // Hand the seat back to AI so the host can keep going or fill it.
            const updated = [...seats];
            updated[myId - 1] = { type: "ai", name: "AI " + (myId - 1) };
            window.dbUpdate(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), { seats: updated })
                .catch(() => {});
        }
    }
    currentRoomId = null;
    isHost = true;
    myId = 1;
    seats = [];
    chatStarted = false;
    SystemUI.stopChat?.();
}

let roomUnsub = null;
function listenToRoom() {
    if (roomUnsub) { try { roomUnsub(); } catch (e) {} roomUnsub = null; }
    let onlineGameStarted = false;
    const roomId = currentRoomId;
    roomUnsub = window.dbOnValue(window.dbRef(window.db, `scrabble_rooms/${roomId}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            // Room was deleted — host left or kicked us. Bounce back to start.
            if (currentRoomId === roomId) handleRoomClosed();
            return;
        }
        if (data.seats) {
            seats = data.seats;
            SystemUI.v2Lobby.renderSeats(seats);
            if (players && players.length > 0) {
                seats.forEach((seat, idx) => {
                    if (players[idx]) {
                        players[idx].name = seat.name;
                        players[idx].isAI = seat.type === "ai";
                    }
                });
                updateTurnDisplay();
                // If a human seat just flipped to AI (player disconnected) and it's
                // currently their turn, the host needs to take over so the game doesn't stall.
                if (isHost && gamePhase === "playing" && players[currentTurn]?.isAI) {
                    scheduleAiTurn(1500);
                }
            }
        }
        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound("win");
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            if (isHost) initGame("online", aiDifficulty, seats.length);
            else {
                document.getElementById("start-screen").classList.add("hidden");
                if (data.gameState) syncOnlineState(data.gameState);
            }
            return;
        }
        if (onlineGameStarted && data.gameState) syncOnlineState(data.gameState);
    });
}

function handleRoomClosed() {
    const wasPlaying = gamePhase === "playing";
    if (roomUnsub) { try { roomUnsub(); } catch (e) {} roomUnsub = null; }
    currentRoomId = null;
    seats = [];
    chatStarted = false;
    SystemUI.stopChat?.();
    if (wasPlaying) {
        // Host disconnected mid-game — show a soft notice and bail to start screen.
        gamePhase = "idle";
        document.getElementById("game-over-emoji").textContent = "🔌";
        document.getElementById("game-over-title").textContent = "ROOM CLOSED";
        document.getElementById("game-over-msg").textContent = "Host left the game.";
        document.getElementById("game-over-modal").classList.remove("hidden");
    }
    gameMode = "ai";
    localStorage.setItem("scrabble_mode", gameMode);
    const modeEl = document.getElementById("sys-scrabble-mode");
    if (modeEl) modeEl.value = "ai";
    document.querySelectorAll("#opponent-row .opp-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.mode === "ai");
    });
    document.getElementById("start-screen").classList.remove("hidden");
    applyModeUI();
}

let lastPushTime = 0;
// Monotonic push ordering — wall clocks aren't comparable across machines,
// and every turn-holder pushes, so ts-based ordering dropped real moves.
let stateSeq = 0;
function pushOnlineState() {
    if (!currentRoomId) return;
    const now = Date.now();
    lastPushTime = now;
    stateSeq++;
    const logEl = document.getElementById("play-log");
    const serializedLog = [];
    if (logEl) logEl.querySelectorAll(".log-entry").forEach(el => { serializedLog.push({ html: el.innerHTML }); });

    window.dbUpdate(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), {
        gameState: JSON.stringify({
            board, bag: tileBag, currentTurn,
            players: players.map(p => ({ name: p.name, score: p.score, rack: p.rack, isAI: p.isAI })),
            consecutivePasses, gameLog: serializedLog,
            ts: now, pusher: myId, seq: stateSeq
        })
    });
}

let lastSyncTime = 0;
function syncOnlineState(stateJson) {
    try {
        const s = typeof stateJson === "string" ? JSON.parse(stateJson) : stateJson;
        if (s.seq) {
            // Fast-forward past our own echoes, drop stale packets only.
            if (s.pusher === myId) { stateSeq = Math.max(stateSeq, s.seq); return; }
            if (s.seq < stateSeq) return;
            stateSeq = s.seq;
        } else if (!s.ts || (s.pusher === myId && s.ts === lastPushTime) || s.ts <= lastSyncTime) {
            return; // legacy packet without seq
        }
        lastSyncTime = s.ts || lastSyncTime;

        if (players.length === 0) {
            initGame("online", aiDifficulty, s.players.length);
        }

        board = s.board; tileBag = s.bag; currentTurn = s.currentTurn;
        consecutivePasses = s.consecutivePasses;
        players = s.players;

        const logEl = document.getElementById("play-log");
        if (logEl && s.gameLog) {
            logEl.innerHTML = "";
            s.gameLog.forEach(l => {
                const entry = document.createElement("div");
                entry.className = "log-entry"; entry.innerHTML = l.html;
                logEl.appendChild(entry);
            });
        }

        pendingTiles = [];
        renderBoard(); renderRack(); updateScoreDisplay(); updateTurnDisplay();

        if (isHost && players[currentTurn].isAI && gamePhase === "playing") {
            scheduleAiTurn(2000);
        }

        if (gamePhase === "playing" && checkGameOver()) return;
    } catch (e) { console.error("Sync error:", e); }
}

// ── 20. UI EVENT WIRING ───────────────────────
document.getElementById("btn-play").addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    if (gamePhase !== "playing" || players[currentTurn]?.isAI || pendingTiles.length === 0) return;
    playWord();
});

document.getElementById("btn-recall").addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    recallAllTiles(); renderRack();
});

document.getElementById("btn-pass").addEventListener("click", passAction);
document.getElementById("btn-exchange").addEventListener("click", startExchangeMode);
document.getElementById("btn-exchange-confirm").addEventListener("click", confirmExchange);
document.getElementById("btn-exchange-cancel").addEventListener("click", cancelExchange);

document.getElementById("start-btn").addEventListener("click", () => {
    new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
    if (gameMode === "online") return;
    initGame(gameMode, aiDifficulty, lobbyPlayerCount);
});

window.addEventListener("resize", () => { if (gamePhase === "playing") buildBoard(); });
window.addEventListener("beforeunload", () => {
    if (!currentRoomId || gameMode !== "online") return;
    if (isHost) {
        // Host leaves → kill the room so any joiners get bounced.
        window.dbSet(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), null);
    } else if (myId > 1 && seats[myId - 1]) {
        // Joiner leaves → free their seat so the host can keep the game going (AI takes over).
        const updated = [...seats];
        updated[myId - 1] = { type: "ai", name: "AI " + (myId - 1) };
        window.dbUpdate(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), { seats: updated });
    }
});