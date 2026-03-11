// ==========================================
// CONNECT 4 PRO — c4_app.js (V2 Engine)
// Dynamic Seat Array & Drop-In AI Architecture
// ==========================================

// ── 1. CASINO OS INIT ──────────────────────
let gameMode  = "ai";
localStorage.setItem("c4_mode", "ai"); // Force offline start
let myPlayer  = 1;        // online: which player number am I
let currentRoomId = null;
let isHost    = true;     // Default true so local buttons work
let chatStarted = false;
let seats = [];

SystemUI.init({
    gameName: "CONNECT 4",
    rules: "Drop chips into columns to connect 4 in a row — horizontally, vertically, or diagonally. Challenge the AI, play locally against a friend, or battle online!",
    hudDropdowns: [
        {
            id: "sys-c4-mode",
            options: [
                { value: "ai",     label: "🤖 vs AI"   },
                { value: "local",  label: "👥 Hotseat"  },
                { value: "online", label: "🌐 Online"   }
            ]
        },
        {
            id: "sys-c4-diff",
            options: [
                { value: "easy",   label: "Easy"   },
                { value: "medium", label: "Medium" },
                { value: "hard",   label: "Hard"   }
            ]
        }
    ]
});

setTimeout(() => {
    const modeEl = document.getElementById("sys-c4-mode");
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener("change", e => {
            gameMode = e.target.value;
            localStorage.setItem("c4_mode", gameMode);
            document.getElementById("sys-modal").classList.add("sys-hidden");
            syncDiffVisibility();
            if (gameMode === "online") {
                SystemUI.v2Lobby.show();
            } else {
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat();
                chatStarted = false;
                myPlayer = 1;
                isHost = true;
                initGame();
            }
        });
    }

    document.getElementById("sys-c4-diff").addEventListener("change", () => {
        if (gameMode === "ai") initGame();
    });

    syncDiffVisibility();
    initGame();
}, 10);

document.getElementById("sys-reset-game-btn").addEventListener("click", () => {
    if (confirm("Restart the game?")) {
        initGame();
        document.getElementById("sys-modal").classList.add("sys-hidden");
    }
});

function syncDiffVisibility() {
    const wrap = document.getElementById("sys-c4-diff")?.closest(".hud-dropdown-wrap") ||
                 document.getElementById("sys-c4-diff")?.parentElement;
    if (wrap) wrap.style.display = gameMode === "ai" ? "" : "none";
}

// ── 2. GAME STATE ──────────────────────────
const ROWS = 6, COLS = 7;

let grid        = [];   // grid[r][c] = 0|1|2
let currentTurn = 1;    // 1 or 2
let gameActive  = false;
let dropping    = false; // block input while chip is animating

const statusDisplay = document.getElementById("status-display");
const boardEl       = document.getElementById("c4-board");

// ── 3. BOARD BUILD ─────────────────────────
function buildBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const slot = document.createElement("div");
            slot.className = "slot";
            slot.dataset.r = r;
            slot.dataset.c = c;
            const chip = document.createElement("div");
            chip.className = "chip";
            slot.appendChild(chip);
            boardEl.appendChild(slot);
        }
    }
}

// ── 4. COLUMN CLICK / HOVER ────────────────
boardEl.addEventListener("click", e => {
    if (!gameActive || dropping) return;
    if (gameMode === "ai"     && currentTurn !== 1) return;
    if (gameMode === "online" && currentTurn !== myPlayer) return;

    const col = getColFromEvent(e);
    if (col === -1) return;
    humanDropChip(col);
});

boardEl.addEventListener("mousemove", e => {
    const col = getColFromEvent(e);
    updateColHover(col);
});

boardEl.addEventListener("mouseleave", () => updateColHover(-1));

// Touch: column from touch position
boardEl.addEventListener("touchstart", e => {
    if (!gameActive || dropping) return;
    if (gameMode === "ai"     && currentTurn !== 1) return;
    if (gameMode === "online" && currentTurn !== myPlayer) return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    const col = getColFromPoint(touch.clientX, touch.clientY);
    if (col !== -1) humanDropChip(col);
}, { passive: false });

function getColFromEvent(e) {
    return getColFromPoint(e.clientX, e.clientY);
}

function getColFromPoint(x, y) {
    const rect = boardEl.getBoundingClientRect();
    if (y < rect.top || y > rect.bottom) return -1;
    const relX = x - rect.left;
    const slotW = rect.width / COLS;
    const col = Math.floor(relX / slotW);
    return (col >= 0 && col < COLS) ? col : -1;
}

function updateColHover(col) {
    boardEl.querySelectorAll(".slot").forEach(s => s.classList.remove("col-hover"));
    if (col < 0) return;
    boardEl.querySelectorAll(`.slot[data-c="${col}"]`).forEach(s => s.classList.add("col-hover"));
}

// ── 5. HUMAN MOVE ──────────────────────────
function humanDropChip(col) {
    const row = getLowestEmpty(col);
    if (row === -1) return; // column full

    if (gameMode === "online") {
        pushOnlineMove(col);
        return;
    }

    dropChip(row, col, currentTurn, () => {
        const win = checkWin(currentTurn);
        if (win) { endGame(currentTurn, win); return; }
        if (isBoardFull()) { endGame(0); return; }

        currentTurn = currentTurn === 1 ? 2 : 1;
        updateStatus();

        if (gameMode === "ai" && currentTurn === 2) {
            dropping = true;
            setTimeout(doAI, 520);
        }
    });
}

// ── 6. DROP CHIP (with animation) ──────────
function dropChip(row, col, player, callback) {
    dropping = true;
    grid[row][col] = player;

    const slotEl = getSlot(row, col);
    const chipEl = slotEl.querySelector(".chip");
    chipEl.classList.remove("player1", "player2");
    void chipEl.offsetWidth; // trigger reflow
    chipEl.classList.add(player === 1 ? "player1" : "player2");

    SystemUI.playSound("chipTable");

    setTimeout(() => {
        dropping = false;
        if (callback) callback();
    }, 420); 
}

// ── 7. AI ──────────────────────────────────
function doAI() {
    if (!gameActive || currentTurn !== 2) { dropping = false; return; }

    const diff = document.getElementById("sys-c4-diff").value;
    let col;

    if (diff === "easy") {
        col = randomMove();
    } else if (diff === "medium") {
        // Upgraded Medium: Depth 3 Minimax, 10% chance to make a human blunder
        if (Math.random() < 0.10) {
            col = mediumMove(); 
        } else {
            col = minimaxMove(3);
        }
    } else {
        // Upgraded Hard: Depth 7 + Move Ordering
        col = minimaxMove(7);
    }

    const row = getLowestEmpty(col);
    
    if (gameMode === "online") {
        pushOnlineMove(col);
    } else {
        dropChip(row, col, 2, () => {
            const win = checkWin(2);
            if (win) { endGame(2, win); return; }
            if (isBoardFull()) { endGame(0); return; }
            currentTurn = 1;
            updateStatus();
        });
    }
}

function randomMove() {
    const open = [];
    for (let c = 0; c < COLS; c++) if (getLowestEmpty(c) !== -1) open.push(c);
    return open[Math.floor(Math.random() * open.length)];
}

function mediumMove() {
    // Win if possible
    for (let c = 0; c < COLS; c++) {
        const r = getLowestEmpty(c);
        if (r === -1) continue;
        grid[r][c] = 2;
        if (checkWin(2)) { grid[r][c] = 0; return c; }
        grid[r][c] = 0;
    }
    // Block player win
    for (let c = 0; c < COLS; c++) {
        const r = getLowestEmpty(c);
        if (r === -1) continue;
        grid[r][c] = 1;
        if (checkWin(1)) { grid[r][c] = 0; return c; }
        grid[r][c] = 0;
    }
    // Prefer center
    const pref = [3, 2, 4, 1, 5, 0, 6];
    for (const c of pref) if (getLowestEmpty(c) !== -1) return c;
    return randomMove();
}

function minimaxMove(depth) {
    let bestVal = -Infinity, bestCol = 3;
    const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6]; // Alpha-Beta Move Ordering
    
    for (let i = 0; i < COLS; i++) {
        let c = COLUMN_ORDER[i];
        const r = getLowestEmpty(c);
        if (r === -1) continue;
        grid[r][c] = 2;
        const val = minimax(grid, depth - 1, -Infinity, Infinity, false);
        grid[r][c] = 0;
        if (val > bestVal) { bestVal = val; bestCol = c; }
    }
    return bestCol;
}

function minimax(g, depth, alpha, beta, maximising) {
    const w1 = checkWinGrid(g, 1), w2 = checkWinGrid(g, 2);
    if (w2) return  1000000 + depth;
    if (w1) return -1000000 - depth;
    if (isBoardFullGrid(g) || depth === 0) return scoreGrid(g);

    const COLUMN_ORDER = [3, 2, 4, 1, 5, 0, 6]; // Alpha-Beta Move Ordering

    if (maximising) {
        let best = -Infinity;
        for (let i = 0; i < COLS; i++) {
            let c = COLUMN_ORDER[i];
            const r = getLowestEmptyGrid(g, c);
            if (r === -1) continue;
            g[r][c] = 2;
            best = Math.max(best, minimax(g, depth - 1, alpha, beta, false));
            g[r][c] = 0;
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (let i = 0; i < COLS; i++) {
            let c = COLUMN_ORDER[i];
            const r = getLowestEmptyGrid(g, c);
            if (r === -1) continue;
            g[r][c] = 1;
            best = Math.min(best, minimax(g, depth - 1, alpha, beta, true));
            g[r][c] = 0;
            beta = Math.min(beta, best);
            if (beta <= alpha) break;
        }
        return best;
    }
}

function scoreGrid(g) {
    let score = 0;
    // Enhanced Center column preference
    for (let r = 0; r < ROWS; r++) {
        if (g[r][3] === 2) score += 6;
        else if (g[r][3] === 1) score -= 6;
        if (g[r][2] === 2) score += 3;
        else if (g[r][2] === 1) score -= 3;
        if (g[r][4] === 2) score += 3;
        else if (g[r][4] === 1) score -= 3;
    }
    const windows = getAllWindows(g);
    for (const w of windows) score += scoreWindow(w);
    return score;
}

function scoreWindow(w) {
    const twos = w.filter(x => x === 2).length;
    const ones = w.filter(x => x === 1).length;
    const empty = w.filter(x => x === 0).length;
    
    let score = 0;
    if (twos === 4) score += 10000;
    else if (twos === 3 && empty === 1) score += 10;
    else if (twos === 2 && empty === 2) score += 3;

    // Heavily penalize letting the opponent get a 3-in-a-row setup
    if (ones === 3 && empty === 1) score -= 80;
    else if (ones === 2 && empty === 2) score -= 4;
    else if (ones === 4) score -= 10000;
    
    return score;
}

function getAllWindows(g) {
    const ws = [];
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c <= COLS - 4; c++)
            ws.push([g[r][c], g[r][c+1], g[r][c+2], g[r][c+3]]);
    for (let r = 0; r <= ROWS - 4; r++)
        for (let c = 0; c < COLS; c++)
            ws.push([g[r][c], g[r+1][c], g[r+2][c], g[r+3][c]]);
    for (let r = 0; r <= ROWS - 4; r++)
        for (let c = 0; c <= COLS - 4; c++)
            ws.push([g[r][c], g[r+1][c+1], g[r+2][c+2], g[r+3][c+3]]);
    for (let r = 3; r < ROWS; r++)
        for (let c = 0; c <= COLS - 4; c++)
            ws.push([g[r][c], g[r-1][c+1], g[r-2][c+2], g[r-3][c+3]]);
    return ws;
}

// ── 8. WIN CHECK ───────────────────────────
function checkWin(player) {
    return checkWinGrid(grid, player);
}

function checkWinGrid(g, player) {
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c <= COLS - 4; c++)
            if (g[r][c]===player && g[r][c+1]===player && g[r][c+2]===player && g[r][c+3]===player)
                return [[r,c],[r,c+1],[r,c+2],[r,c+3]];
    for (let r = 0; r <= ROWS - 4; r++)
        for (let c = 0; c < COLS; c++)
            if (g[r][c]===player && g[r+1][c]===player && g[r+2][c]===player && g[r+3][c]===player)
                return [[r,c],[r+1,c],[r+2,c],[r+3,c]];
    for (let r = 0; r <= ROWS - 4; r++)
        for (let c = 0; c <= COLS - 4; c++)
            if (g[r][c]===player && g[r+1][c+1]===player && g[r+2][c+2]===player && g[r+3][c+3]===player)
                return [[r,c],[r+1,c+1],[r+2,c+2],[r+3,c+3]];
    for (let r = 3; r < ROWS; r++)
        for (let c = 0; c <= COLS - 4; c++)
            if (g[r][c]===player && g[r-1][c+1]===player && g[r-2][c+2]===player && g[r-3][c+3]===player)
                return [[r,c],[r-1,c+1],[r-2,c+2],[r-3,c+3]];
    return null;
}

// ── 9. HELPERS ─────────────────────────────
function getLowestEmpty(col) {
    return getLowestEmptyGrid(grid, col);
}

function getLowestEmptyGrid(g, col) {
    for (let r = ROWS - 1; r >= 0; r--) if (g[r][col] === 0) return r;
    return -1;
}

function isBoardFull() { return isBoardFullGrid(grid); }
function isBoardFullGrid(g) {
    for (let c = 0; c < COLS; c++) if (g[0][c] === 0) return false;
    return true;
}

function getSlot(r, c) {
    return boardEl.querySelector(`.slot[data-r="${r}"][data-c="${c}"]`);
}

// ── 10. STATUS ─────────────────────────────
function updateStatus() {
    if (!gameActive) return;
    if (gameMode === "ai") {
        statusDisplay.textContent = currentTurn === 1 ? "YOUR TURN" : "AI THINKING...";
    } else if (gameMode === "local") {
        statusDisplay.textContent = `PLAYER ${currentTurn}'S TURN`;
    } else {
        if (currentTurn === myPlayer) {
            statusDisplay.textContent = "YOUR TURN";
        } else {
            const oppName = seats[currentTurn - 1] ? seats[currentTurn - 1].name : "OPPONENT";
            statusDisplay.textContent = `${oppName}'S TURN`;
        }
    }
}

// ── 11. END GAME ───────────────────────────
function endGame(winner, winCells) {
    gameActive = false;

    if (winCells) {
        for (const [r, c] of winCells) {
            getSlot(r, c)?.querySelector(".chip")?.classList.add("winning-piece");
        }
    }

    if (winner === 0) {
        statusDisplay.textContent = "IT'S A DRAW!";
        SystemUI.playSound("tie");
        return;
    }

    if (gameMode === "ai") {
        if (winner === 1) {
            statusDisplay.textContent = "YOU WIN! 🏆";
            SystemUI.playSound("win");
            // AUDIT: Safely track wins
            if (typeof SystemStats !== 'undefined') SystemStats.recordWin("connect4", 0);
        } else {
            statusDisplay.textContent = "AI WINS!";
            SystemUI.playSound("lose");
            // AUDIT: Safely track losses
            if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("connect4");
        }
    } else if (gameMode === "local") {
        statusDisplay.textContent = `PLAYER ${winner} WINS! 🏆`;
        SystemUI.playSound("win");
    } else {
        if (winner === myPlayer) {
            statusDisplay.textContent = "YOU WIN! 🏆";
            SystemUI.playSound("win");
            // AUDIT: Safely track wins
            if (typeof SystemStats !== 'undefined') SystemStats.recordWin("connect4", 0);
        } else {
            const oppName = seats[winner - 1] ? seats[winner - 1].name : "OPPONENT";
            statusDisplay.textContent = `${oppName} WINS!`;
            SystemUI.playSound("lose");
            // AUDIT: Safely track losses
            if (typeof SystemStats !== 'undefined') SystemStats.recordLoss("connect4");
        }
    }
}

// ── 12. INIT / RESTART ─────────────────────
function initGame() {
    if (gameMode === "online" && myPlayer === 2) {
        statusDisplay.textContent = "WAITING FOR HOST TO RESTART";
        return; 
    }

    // AUDIT: Safely track play count via OS 2.0
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("connect4");

    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    currentTurn = 1;
    gameActive  = true;
    dropping    = false;

    buildBoard();
    updateStatus();
    updateColHover(-1);
    
    if (gameMode === "online" && isHost) {
        window.dbUpdate(window.dbRef(window.db, "c4_rooms/" + currentRoomId), {
            grid: gridToFirebase(),
            turn: 1,
            status: "playing",
            winner: null,
            winCells: null
        });
    }
}

document.getElementById("restart-btn").addEventListener("click", () => {
    SystemUI.playSound("shuffle");
    initGame();
});

// ── 13. ONLINE MULTIPLAYER (V2 LOBBY) ──────

SystemUI.v2Lobby.setup({
    onHost: () => {
        currentRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        isHost = true; myPlayer = 1; chatStarted = false;
        
        const diff = document.getElementById('sys-c4-diff').value;
        seats = [
            { type: "human", name: SystemUI.getPlayerName() },
            { type: "ai", name: "AI (" + diff + ")" }
        ];

        window.dbSet(window.dbRef(window.db, "c4_rooms/" + currentRoomId), {
            grid: gridToFirebase(),
            turn: 1,
            status: "waiting",
            seats: seats
        }).then(() => {
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
            listenToRoom();
        });
    },
    onJoin: (code) => {
        window.dbGet(window.dbChild(window.dbRef(window.db), `c4_rooms/${code}`)).then(snap => {
            if (snap.exists()) {
                let data = snap.val();
                if (data.seats && data.seats[1] && data.seats[1].type === "ai") {
                    currentRoomId = code; isHost = false; myPlayer = 2; chatStarted = false;
                    
                    let updatedSeats = data.seats;
                    updatedSeats[1] = { type: "human", name: SystemUI.getPlayerName() };
                    
                    window.dbUpdate(window.dbRef(window.db, "c4_rooms/" + currentRoomId), {
                        seats: updatedSeats
                    });
                    
                    SystemUI.v2Lobby.showRoomPhase(currentRoomId, false);
                    listenToRoom();
                } else {
                    SystemUI.v2Lobby.showError("ROOM FULL OR NO AI TO REPLACE");
                }
            } else {
                SystemUI.v2Lobby.showError("ROOM NOT FOUND");
            }
        });
    },
    onLeave: () => {
        gameMode = "ai";
        document.getElementById("sys-c4-mode").value = "ai";
        localStorage.setItem("c4_mode", "ai");
        syncDiffVisibility(); 
        myPlayer = 1;
        isHost = true;
        SystemUI.stopChat(); chatStarted = false;
        initGame();
    },
    onStart: () => {
        window.dbUpdate(window.dbRef(window.db, "c4_rooms/" + currentRoomId), {
            status: "playing"
        });
    },
    onClose: () => {
        if (gameMode === "online" && !gameActive) {
            gameMode = "ai";
            document.getElementById("sys-c4-mode").value = "ai";
            localStorage.setItem("c4_mode", "ai");
            syncDiffVisibility(); 
            myPlayer = 1;
            isHost = true;
            initGame();
        }
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, "c4_rooms/" + currentRoomId), snap => {
        const data = snap.val();
        if (!data) return;
        
        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);

        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound("win");
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
        }
        if (data.status !== "playing") return;

        // Render previous animations before syncing the new state
        if (gameActive && data.turn !== currentTurn) {
             const newGrid = firebaseToGrid(data.grid);
             // Find what changed
             for (let r=0; r<ROWS; r++) {
                 for (let c=0; c<COLS; c++) {
                     if (grid[r][c] === 0 && newGrid[r][c] !== 0) {
                         dropChip(r, c, newGrid[r][c], () => syncGameState(data, newGrid));
                         return; // Wait for animation to finish before updating state
                     }
                 }
             }
        }
        
        syncGameState(data, firebaseToGrid(data.grid));
    });
}

function syncGameState(data, newGrid) {
    grid = newGrid;
    currentTurn = data.turn;
    gameActive = true;

    syncBoardFromGrid();

    if (data.winner !== undefined && data.winner !== null) {
        const winCells = data.winCells || null;
        endGame(data.winner, winCells);
        return;
    }

    updateStatus();
    
    // V2 Drop-In AI: If a sync happens and it's an AI turn, host takes over!
    if (isHost && gameActive) {
        const currentSeatIdx = currentTurn - 1;
        if (seats[currentSeatIdx] && seats[currentSeatIdx].type === "ai" && !dropping) {
            dropping = true;
            setTimeout(doAI, 600);
        }
    }
}

function pushOnlineMove(col) {
    const row = getLowestEmpty(col);
    if (row === -1) return;
    
    // Local animation
    dropChip(row, col, currentTurn, () => {
        const win = checkWin(currentTurn);
        const full = isBoardFull();
        const nextTurn = currentTurn === 1 ? 2 : 1;

        const payload = {
            grid: gridToFirebase(),
            turn: nextTurn,
            status: "playing",
            seats: seats
        };
        if (win) {
            payload.winner = currentTurn;
            payload.winCells = win;
        } else if (full) {
            payload.winner = 0;
        }
        window.dbUpdate(window.dbRef(window.db, "c4_rooms/" + currentRoomId), payload);
    });
}

function syncBoardFromGrid() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const slot = getSlot(r, c);
            if (!slot) continue;
            const chip = slot.querySelector(".chip");
            
            // Only force the class if it doesn't have it, to avoid stuttering animations
            if (grid[r][c] === 1 && !chip.classList.contains("player1")) {
                chip.classList.add("player1");
                chip.classList.remove("player2");
            } else if (grid[r][c] === 2 && !chip.classList.contains("player2")) {
                chip.classList.add("player2");
                chip.classList.remove("player1");
            } else if (grid[r][c] === 0) {
                chip.classList.remove("player1", "player2", "winning-piece");
            }
        }
    }
}

function gridToFirebase() {
    const flat = [];
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            flat.push(grid[r][c]);
    return flat;
}

function firebaseToGrid(flat) {
    const g = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    if (!flat) return g;
    const arr = Array.isArray(flat) ? flat : Object.values(flat);
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            g[r][c] = arr[r * COLS + c] || 0;
    return g;
}