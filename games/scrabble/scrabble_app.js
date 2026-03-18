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

setTimeout(() => { 
    const modeEl = document.getElementById("sys-scrabble-mode");
    if (modeEl) {
        gameMode = modeEl.value; 
        
        if (gameMode === "online") {
            document.getElementById("setup-panel").style.display = "none";
            document.getElementById("start-btn").style.display = "none";
        }

        modeEl.addEventListener("change", e => {
            gameMode = e.target.value;
            localStorage.setItem("scrabble_mode", gameMode);
            document.getElementById("sys-modal")?.classList.add("sys-hidden");
            
            if (gameMode === "online") {
                document.getElementById("setup-panel").style.display = "none";
                document.getElementById("start-btn").style.display = "none";
                SystemUI.v2Lobby.show();
            } else {
                document.getElementById("setup-panel").style.display = "";
                document.getElementById("start-btn").style.display = "";
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat();
                chatStarted = false;
                myId = 1; isHost = true;
            }
        });
    }

    const setupPanel = document.getElementById("setup-panel");
    if (setupPanel && !document.getElementById("count-row-wrapper")) {
        const countRow = document.createElement("div");
        countRow.id = "count-row-wrapper";
        countRow.className = "setup-row";
        countRow.innerHTML = `
            <span class="setup-label">PLAYERS</span>
            <div id="local-count-btns" style="display:flex; gap:6px;">
                <button class="count-btn ${lobbyPlayerCount === 2 ? 'active' : ''}" data-count="2" style="padding:9px 14px; background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); color:var(--muted); font-family:'Libre Baskerville', serif; font-size:0.68rem; cursor:pointer;">2</button>
                <button class="count-btn ${lobbyPlayerCount === 3 ? 'active' : ''}" data-count="3" style="padding:9px 14px; background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); color:var(--muted); font-family:'Libre Baskerville', serif; font-size:0.68rem; cursor:pointer;">3</button>
                <button class="count-btn ${lobbyPlayerCount === 4 ? 'active' : ''}" data-count="4" style="padding:9px 14px; background:var(--panel); border:1px solid var(--border); border-radius:var(--radius); color:var(--muted); font-family:'Libre Baskerville', serif; font-size:0.68rem; cursor:pointer;">4</button>
            </div>
        `;
        setupPanel.appendChild(countRow);

        document.querySelectorAll(".count-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                new Audio('../../system/audio/click1.mp3').play().catch(e=>{});
                document.querySelectorAll(".count-btn").forEach(b => {
                    b.classList.remove("active");
                    b.style.background = "var(--panel)";
                    b.style.borderColor = "var(--border)";
                });
                btn.classList.add("active");
                btn.style.background = "rgba(212,168,64,0.18)";
                btn.style.borderColor = "var(--gold-lt)";
                lobbyPlayerCount = parseInt(btn.dataset.count);
                localStorage.setItem("scrabble_pcount", lobbyPlayerCount);
            });
        });
    }
}, 10);

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
function renderRack() {
    const rack  = document.getElementById("rack");
    if (!rack) return;
    rack.innerHTML = "";
    const hand = players[currentTurn]?.rack || [];

    hand.forEach((tile, i) => {
        if (!tile) {
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
        recallTile(tileData);
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
        renderCell(tileData.boardRow, tileData.boardCol);
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
    if (word.length < 2) return false;
    if (dictCache[word] !== undefined) return dictCache[word];
    if (COMMON_WORDS.has(word)) { dictCache[word] = true; return true; }
    try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        const valid = res.ok;
        dictCache[word] = valid;
        return valid;
    } catch {
        dictCache[word] = true;
        return true;
    }
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
        aiTimeout = setTimeout(aiPlayTurn, 2200);
    }
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
        if (winner.name === players[myId-1].name) SystemStats.recordWin("scrabble", 0);
        else SystemStats.recordLoss("scrabble");
    }
    new Audio('../../system/audio/victory.mp3').play().catch(e=>{});
    document.getElementById("game-over-modal").classList.remove("hidden");
    return true;
}

// ── 18. AI PLAYER ─────────────────────────────
const AI_WORDS = ("aa ab ad ae ag ah ai al am an ar as at aw ax ay ba be bi bo by da de do ea ed ef eh el em en er es et ex fa fe fi gi go ha he hi ho id if in is it jo ka ki la li lo ma me mi mo mu my na ne no nu ob od oe of oh oi ok om on op or os ow ox oy pa pe pi po qi re sh si so ta te ti to ug uh um un up ur us ut wo xi xu ya ye yo za ace act add age ago aid aim air ale all alp alt amp and ant any ape apt arc are ark arm art ash ask ate awe awl awn axe aye bad bag ban bar bat bay bed beg bet bid big bin bit boa bog bow box boy bud bug bun bus but buy bye cab can cap car cat cob cod cog cop cow cry cub cup cut dam day den dew die dig dim dip doe dog don dot dry dub dug duo ear eat ego elk elm emu end era eve ewe eye fad fan far fat fax fed few fez fib fig fin fir fit fix fly foe fog fop for fox fry fun fur gab gap gas gel gem get gig gin gnu god got gum gun gut guy gym had ham has hat hay hem her hew hex hey hid hip hit hob hoe hog hop hot how hub hug hum hut ice ill imp ink inn ion ire irk jab jam jar jaw jet jig job jog jot joy jug jut keg kid kin kit lab lag lap law lay lea led leg let lid lip lit lob log lot low lug mad man map mar mat maw may men met mew mid mix mob mod mom mop mow mud mug mum nun oak oat odd ode off old opt orb ore our out owe owl own pal pan par pat paw pay pea peg pet pie pig pin pit ply pod pop pot row rub rug rum rut rye sad sag sap sat saw say sea set sew she sir ski sky sob sod son sow spa spy sub sue sum sun tab tan tap tar tax tee ten tie tin tip toe ton too top tow toy try tub tug tun two ugh urn use van vat vow wad wag war was wax way web wed win wit woe won woo yak yam yap yew zip zoo abs acre aged aims airs ales ally also alto aloe alms amps bale ball band bane bang bank bare bark barn base bath bead beam bean bear beat beef been beer bell belt best bill bind bite blob blow blue blur boar boat bold bolt bond bone book boom boot bore born boss both bout bowl brag bran brew brim brow buck bull bump burn bust cafe cage cake call calm came camp cane cape card care cart case cash cast cave cell cent chap char chat chef chew chin chip chop cite clad clam clap claw clay clip clog clot club clue coal coat coil coin cold colt come cone cook cool cope core cork corn cost cove crab cram crew crop crow cube cure curl curt cute damp dare dark darn dart dash data date dawn dead deaf deal dean dear deck deed deep deer deft deli dent deny desk dial dice dike dill dime dine dire disk dive dock dome done doom door dose dote dove down drab drag dram drip drop drug drum dual dumb dump dune dusk dust each earl earn ease east edge emit epic even ever evil exam exit face fact fade fail fair fake fall fame fare farm fast fate fawn feat feed feel feet fell felt fend fern fest feud file fill film find fine fire firm fish fist flag flap flat flaw flea fled flew flip flit floe flow foam foil fold fond font food fool fore fork fort foul four fowl free fret fuel full fume fund fuse fuzz gale gall game gang gape gash gate gawk gaze gear gent gild gilt gist give glad glee glen glib glob glow glum glut goad goat gold golf gone good gore gown grab grad gram gray grew grid grim grin grip grit grow grub gulf gull gulp gust hack hail hair hale hall halt hand hang hard hare hark harm harp hart hate haul have hawk heal heap hear heat heel held helm help here hero hewn hide high hike hill hint hire hive hoax hock hold hole home hone honk hood hoop hoot hope horn hose host hour hull hump hung hunk hunt hurl hymn icon idea idle inch into iron isle item jade jail jeer jerk jest join joke jolt junk jury just keen keep kelp kept kern kick kind king kite knee knob knot know lack lame lamp land lane lard lark lash last late laud lawn laze lazy lead leaf leak lean leap leer left lend lens less lest levy lime limp line link lion list live load loaf loan loft loom loon loop lore loss lost loud love lull lump lung lure lurk lust lute lynx mace made mail main make male mall malt mane mare mark mart mash mask mast mate maze mead meal mean meet melt memo mend menu mere mesh mild mile milk mill mime mind mine mint mire mist moan moat mock mode mold mole molt monk mood moon moor moot more morn most mote muse musk must mute myth nail name nape nave neat neck need nest next nice nick node norm note noun nude null numb oath oboe okra once only onto open oral orca oval oven over oxen pace pack pact page paid pail pain pair pale palm pane park part pass past path pave peak peal pear peat peek peel peer pelt pest pick pike pile pill pine ping pipe pith plan plod plot plow plug plum plus poem poet pole poll polo pond pore pork port pose post pour pray prey prod prop prow pull pulp pump pure push putt quit race rack rage raid rail rain ramp rang rank rant rape rash rate rave read real reap reed reef reel rely rend rent rest rice rich rick ride rife rift ring riot rise risk roam roar robe rock rode role roll romp rook room root rope rose rosy rout rove rude ruin rule rump rune ruse rush rust safe sage sail sale salt same sand sane sang sank sash save scam scan scar seal seam seep seer self sell semi send sent sewn shed shin ship shoe shod shop shot show shut side sigh silk sill sing sink sire site size skid skim skin skip slab slap slat sled slew slid slim slip slit slob slop slot slow slug slum slur smog smug snag snap snip snob snow snub soak soap sock soft soil sold sole some song soon sort soul soup sour span spar spit spot spun spur stab stag star stay stem step stew stir stop stub stud stun such suit sulk sung sunk sure surf swam swan swap swat sway swim swum tack tail tale talk tall tame tang tart task taut teal team tear teed tell tend tent term text than that them then thin this tide till tilt time tire toad toil told toll tomb tome tone tong took tore torn tort toss tour town trek trim trio trip trod trot true tuft tune turf tusk twig twin type ugly upon urge vain vale vast veal veil vein vend vent very vest view vile vine void vole volt vote wade wail wake wale walk wall wand wane ward ware warm warn warp wart wash wasp weal wean wear weep weld well wend went were west wide wile will wilt wily wind wine wing wink wire wise wish wisp with woke wolf womb wool word wore work worm worn wove wren writ yawl year yell yelp yore your zeal zest zinc zone zoom").split(" ").filter(Boolean);

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
    const moves = [];
    for (const word of AI_WORDS) {
        if (word.length < 2) continue;
        if (aiDifficulty === "easy" && word.length > 4) continue;
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
    if (aiDifficulty === "easy") return moves[Math.floor(Math.random() * Math.min(8, moves.length))];
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
        const saved = pendingTiles; pendingTiles = placement; const words = getCurrentWords();
        const connected = isFirst ? placement.some(p => p.row === 7 && p.col === 7) || (words && words[0]?.cells.some(c => c.row === 7 && c.col === 7)) : isConnected();
        const score = (words && connected) ? calcTotalScore(words) : 0; pendingTiles = saved;
        if (!words || !connected || score <= 0) continue;
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
                        currentRoomId = code; isHost = false; myId = joinedIdx + 1; chatStarted = false;
                        window.dbUpdate(window.dbRef(window.db, `scrabble_rooms/${code}`), { seats: updatedSeats });
                        SystemUI.v2Lobby.showRoomPhase(code, false);
                        listenToRoom();
                    } else { SystemUI.v2Lobby.showError("ROOM FULL"); }
                }
            } else { SystemUI.v2Lobby.showError("ROOM NOT FOUND"); }
        });
    },
    onLeave: () => {
        if (isHost && currentRoomId) window.dbSet(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), null);
        gameMode = "ai";
        document.getElementById("sys-scrabble-mode").value = "ai";
        SystemUI.stopChat(); chatStarted = false;
    },
    onStart: () => { window.dbUpdate(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), { status: "playing" }); },
    onClose: () => {
        if (gameMode === "online" && gamePhase === "idle") {
            if (isHost && currentRoomId) window.dbSet(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), null);
            gameMode = "ai"; document.getElementById("sys-scrabble-mode").value = "ai";
        }
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
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

let lastPushTime = 0;
function pushOnlineState() {
    if (!currentRoomId) return;
    const now = Date.now();
    lastPushTime = now;
    const logEl = document.getElementById("play-log");
    const serializedLog = [];
    if (logEl) logEl.querySelectorAll(".log-entry").forEach(el => { serializedLog.push({ html: el.innerHTML }); });

    window.dbUpdate(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), {
        gameState: JSON.stringify({
            board, bag: tileBag, currentTurn,
            players: players.map(p => ({ name: p.name, score: p.score, rack: p.rack, isAI: p.isAI })),
            consecutivePasses, gameLog: serializedLog,
            ts: now, pusher: myId
        })
    });
}

let lastSyncTime = 0;
function syncOnlineState(stateJson) {
    try {
        const s = typeof stateJson === "string" ? JSON.parse(stateJson) : stateJson;
        if (!s.ts || (s.pusher === myId && s.ts === lastPushTime) || s.ts <= lastSyncTime) return;
        lastSyncTime = s.ts;

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
            setTimeout(aiPlayTurn, 2000);
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
    const modeBtn = document.querySelector(".opp-btn.active");
    const mode = modeBtn ? modeBtn.dataset.mode : "ai";
    if (mode === "online") return;
    
    const diffBtn = document.querySelector(".diff-btn.active");
    const diff = diffBtn ? diffBtn.dataset.diff : "medium";
    
    initGame(mode, diff, lobbyPlayerCount);
});

window.addEventListener("resize", () => { if (gamePhase === "playing") buildBoard(); });
window.addEventListener("beforeunload", () => {
    if (isHost && currentRoomId && gameMode === "online") window.dbSet(window.dbRef(window.db, `scrabble_rooms/${currentRoomId}`), null);
});