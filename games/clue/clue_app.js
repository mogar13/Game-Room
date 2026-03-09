// =============================================
// CLUE — clue_app.js
// The Game Shack | Casino OS
// Modes: vs AI | Hotseat | Online
// =============================================

// ── 1. OS INIT ────────────────────────────────
let gameMode    = localStorage.getItem("clue_mode") || "ai";
let chatStarted = false;
let currentRoomId = null;
let myId    = 1;
let isHost  = false;

let myPlayerIndex = 0; // which player slot is "me" (0-based)

SystemUI.init({
    gameName: "CLUE",
    rules: "Move around the mansion, make suggestions to eliminate suspects, weapons and rooms. Be first to correctly accuse the murderer, weapon and room to win!",
    hudDropdowns: [
        {
            id: "sys-clue-mode",
            options: [
                { value: "ai",      label: "🤖 vs AI"  },
                { value: "hotseat", label: "👥 Hotseat" },
                { value: "online",  label: "🌐 Online"  }
            ]
        }
    ]
});

setTimeout(() => {
    gameMode = document.getElementById("sys-clue-mode").value;
}, 10);

document.getElementById("sys-clue-mode").addEventListener("change", e => {
    gameMode = e.target.value;
    localStorage.setItem("clue_mode", gameMode);
    document.getElementById("sys-modal").classList.add("sys-hidden");
    if (gameMode === "online") {
        document.getElementById("multiplayer-lobby").classList.remove("hidden");
    } else {
        document.getElementById("multiplayer-lobby").classList.add("hidden");
        SystemUI.stopChat();
        chatStarted = false;
    }
});

// ── 2. GAME CONSTANTS ────────────────────────
const SUSPECTS = [
    { id: "scarlett", name: "Miss Scarlett",    color: "#e74c3c", icon: "💃", start: [7, 24]  },
    { id: "mustard",  name: "Col. Mustard",     color: "#f39c12", icon: "🎩", start: [0, 17]  },
    { id: "white",    name: "Mrs. White",        color: "#ecf0f1", icon: "👩", start: [9, 0]   },
    { id: "green",    name: "Mr. Green",         color: "#27ae60", icon: "🕵️", start: [14, 0]  },
    { id: "peacock",  name: "Mrs. Peacock",      color: "#2980b9", icon: "🦚", start: [23, 6]  },
    { id: "plum",     name: "Prof. Plum",        color: "#8e44ad", icon: "🎓", start: [23, 19] }
];

const WEAPONS = [
    { id: "candlestick", name: "Candlestick", icon: "🕯️" },
    { id: "knife",       name: "Knife",       icon: "🔪" },
    { id: "pipe",        name: "Lead Pipe",   icon: "🪛" },
    { id: "revolver",    name: "Revolver",    icon: "🔫" },
    { id: "rope",        name: "Rope",        icon: "🪢" },
    { id: "wrench",      name: "Wrench",      icon: "🔧" }
];

const ROOMS = [
    { id: "kitchen",      name: "Kitchen",       icon: "🍳" },
    { id: "ballroom",     name: "Ballroom",      icon: "🎶" },
    { id: "conservatory", name: "Conservatory",  icon: "🌿" },
    { id: "billiard",     name: "Billiard Room", icon: "🎱" },
    { id: "library",      name: "Library",       icon: "📚" },
    { id: "study",        name: "Study",         icon: "🕯️" },
    { id: "hall",         name: "Hall",          icon: "🚪" },
    { id: "lounge",       name: "Lounge",        icon: "🛋️" },
    { id: "dining",       name: "Dining Room",   icon: "🍷" }
];

// Secret passages (bidirectional)
const SECRET_PASSAGES = {
    kitchen:      "study",
    study:        "kitchen",
    lounge:       "conservatory",
    conservatory: "lounge"
};

// ── 3. BOARD DEFINITION ──────────────────────
/*
 * 24×24 grid. Each cell is one of:
 *   'W'  = wall (impassable, outer wall / solid block)
 *   'C'  = corridor (walkable)
 *   'D'  = door (entry/exit to a room — walkable)
 *   room id string = room floor (walkable when already in room or entering through door)
 *
 * Rows 0-23 (top to bottom), Cols 0-23 (left to right).
 * Board based on the classic Clue/Cluedo layout.
 */

// Shorthand builder
const W = 'W', C = 'C', D = 'D';
const KI = 'kitchen', BA = 'ballroom', CO = 'conservatory';
const BI = 'billiard', LI = 'library', ST = 'study';
const HA = 'hall', LO = 'lounge', DI = 'dining';
const XX = 'center'; // inaccessible centre

// prettier-ignore
const BOARD_MAP = [
//   0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16   17   18   19   20   21   22   23
    [KI,  KI,  KI,  KI,  KI,  W,   BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  W,   CO,  CO,  CO,  CO,  CO,  CO,  W ],  // 0
    [KI,  KI,  KI,  KI,  KI,  W,   BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  W,   CO,  CO,  CO,  CO,  CO,  CO,  W ],  // 1
    [KI,  KI,  KI,  KI,  KI,  W,   BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  W,   CO,  CO,  CO,  CO,  CO,  CO,  W ],  // 2
    [KI,  KI,  KI,  KI,  KI,  W,   BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  W,   CO,  CO,  CO,  CO,  CO,  CO,  W ],  // 3
    [KI,  KI,  KI,  KI,  KI,  D,   BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  BA,  D,   CO,  CO,  CO,  CO,  CO,  CO,  W ],  // 4
    [W,   W,   W,   D,   W,   C,   C,   C,   C,   D,   W,   W,   W,   W,   D,   C,   C,   C,   W,   W,   W,   W,   D,   W ],  // 5
    [DI,  DI,  DI,  C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   W ],  // 6  (row 6 col 23 is start for Peacock)
    [DI,  DI,  DI,  DI,  C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   W ],  // 7  (Scarlett starts col 24 → use row 7, col 23)
    [DI,  DI,  DI,  DI,  C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   W,   W ],  // 8
    [DI,  DI,  DI,  DI,  D,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   W,   W ],  // 9  (White starts row 9 col 0 → door)
    [W,   W,   W,   D,   W,   C,   C,   C,   XX,  XX,  XX,  XX,  XX,  XX,  XX,  C,   C,   C,   W,   D,   W,   W,   W,   W ],  // 10
    [BI,  BI,  BI,  C,   C,   C,   XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  C,   C,   C,   DI,  DI,  DI,  DI,  W ],  // 11
    [BI,  BI,  BI,  BI,  C,   C,   XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  C,   C,   DI,  DI,  DI,  DI,  DI,  W ],  // 12
    [BI,  BI,  BI,  BI,  C,   C,   XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  C,   C,   DI,  DI,  DI,  DI,  DI,  W ],  // 13
    [BI,  BI,  BI,  BI,  C,   C,   XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  C,   C,   DI,  DI,  DI,  DI,  DI,  W ],  // 14  (Green starts row 14 col 0)
    [W,   W,   W,   D,   C,   C,   XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  C,   C,   D,   DI,  DI,  DI,  DI,  W ],  // 15
    [LI,  LI,  LI,  C,   C,   C,   XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  XX,  C,   C,   C,   W,   W,   W,   W,   W ],  // 16
    [LI,  LI,  LI,  LI,  C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   W ],  // 17  (Mustard starts row 0 col 17 → actually start[17,0])
    [LI,  LI,  LI,  LI,  D,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   C,   W ],  // 18
    [LI,  LI,  LI,  LI,  W,   W,   W,   D,   W,   C,   C,   C,   C,   C,   D,   W,   W,   W,   W,   W,   W,   W,   W,   W ],  // 19  (Plum at row 23 col 19)
    [W,   W,   W,   W,   W,   W,   HA,  HA,  HA,  D,   C,   C,   C,   D,   HA,  HA,  HA,  W,   ST,  ST,  ST,  ST,  ST,  W ],  // 20
    [W,   W,   W,   W,   W,   W,   HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  W,   ST,  ST,  ST,  ST,  ST,  W ],  // 21
    [W,   LO,  LO,  LO,  LO,  W,   HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  W,   ST,  ST,  ST,  ST,  ST,  W ],  // 22
    [W,   LO,  LO,  LO,  LO,  D,   HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  HA,  W,   ST,  ST,  ST,  ST,  ST,  W ]   // 23
];

// Room label positions [row%, col%] as percentage of board size
const ROOM_LABELS = {
    kitchen:      { text: "Kitchen",      row: 2,  col: 2  },
    ballroom:     { text: "Ballroom",     row: 2,  col: 11 },
    conservatory: { text: "Conservatory", row: 2,  col: 20 },
    billiard:     { text: "Billiard\nRoom", row: 12, col: 1.5 },
    library:      { text: "Library",      row: 17, col: 1.5 },
    study:        { text: "Study",        row: 21, col: 20 },
    hall:         { text: "Hall",         row: 22, col: 11 },
    lounge:       { text: "Lounge",       row: 22, col: 2.5 },
    dining:       { text: "Dining\nRoom", row: 12, col: 21 }
};

// ── 4. BFS PATHFINDING ───────────────────────
/*
 * BFS (Breadth-First Search) finds the shortest path on an unweighted grid.
 *
 * How it works:
 * 1. Start from the player's current cell.
 * 2. Expand outward level by level (each level = 1 step).
 * 3. Stop expanding a branch once it exceeds the remaining move budget.
 * 4. Collect all reachable corridor + door cells within N steps.
 * 5. If a door is reached, the whole room it belongs to becomes reachable.
 *
 * Returns a Set of "row,col" strings representing valid destination cells.
 */
function getReachableCells(startRow, startCol, steps, currentRoomId) {
    const reachable = new Set();
    const visited   = new Map(); // "r,c" → min steps used
    const queue     = [{ r: startRow, c: startCol, steps: 0 }];
    visited.set(`${startRow},${startCol}`, 0);

    // If player is in a room, they must first exit through a door
    // BFS starts from the door cells of their current room
    let initialCells = [];
    if (currentRoomId) {
        // Find all door cells adjacent to this room
        const doors = getDoorCellsForRoom(currentRoomId);
        doors.forEach(([dr, dc]) => {
            initialCells.push({ r: dr, c: dc, steps: 1 });
            visited.set(`${dr},${dc}`, 1);
        });
        // Also allow secret passage (costs all remaining steps)
        if (SECRET_PASSAGES[currentRoomId]) {
            reachable.add(`room:${SECRET_PASSAGES[currentRoomId]}`);
        }
    } else {
        initialCells = [{ r: startRow, c: startCol, steps: 0 }];
    }

    const bfsQueue = [...initialCells];

    while (bfsQueue.length > 0) {
        const { r, c, steps: used } = bfsQueue.shift();

        if (used > steps) continue;

        const cellType = BOARD_MAP[r] && BOARD_MAP[r][c];
        if (!cellType) continue;

        // If we stepped into a door, the whole room is reachable (stop here)
        if (cellType === D) {
            const roomId = getAdjacentRoom(r, c);
            if (roomId) { reachable.add(`room:${roomId}`); continue; }
        }

        // If we stepped into a room tile (from a door in prev step), mark room
        if (isRoomId(cellType)) {
            reachable.add(`room:${cellType}`);
            continue; // don't traverse inside rooms
        }

        // Corridor: mark and expand
        if (cellType === C || cellType === D) {
            reachable.add(`${r},${c}`);
        }

        if (used < steps) {
            const neighbours = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
            for (const [nr, nc] of neighbours) {
                if (nr < 0 || nr >= 24 || nc < 0 || nc >= 24) continue;
                const nType = BOARD_MAP[nr][nc];
                if (nType === W || nType === XX) continue;
                const key = `${nr},${nc}`;
                if (!visited.has(key) || visited.get(key) > used + 1) {
                    visited.set(key, used + 1);
                    bfsQueue.push({ r: nr, c: nc, steps: used + 1 });
                }
            }
        }
    }

    return reachable;
}

function isRoomId(val) {
    return [KI,BA,CO,BI,LI,ST,HA,LO,DI].includes(val);
}

// Given a door cell, find which room it's adjacent to
function getAdjacentRoom(r, c) {
    const dirs = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
    for (const [nr, nc] of dirs) {
        if (nr < 0 || nr >= 24 || nc < 0 || nc >= 24) continue;
        const t = BOARD_MAP[nr][nc];
        if (isRoomId(t)) return t;
    }
    return null;
}

// Get all door cells that are adjacent to a room
function getDoorCellsForRoom(roomId) {
    const doors = [];
    for (let r = 0; r < 24; r++) {
        for (let c = 0; c < 24; c++) {
            if (BOARD_MAP[r][c] !== D) continue;
            if (getAdjacentRoom(r, c) === roomId) {
                doors.push([r, c]);
            }
        }
    }
    return doors;
}

// Get the room a player is currently in (null if in corridor)
function getRoomAt(r, c) {
    const t = BOARD_MAP[r][c];
    return isRoomId(t) ? t : null;
}

// ── 5. GAME STATE ────────────────────────────
let numPlayers   = 4;
let players      = []; // { name, suspectId, color, icon, row, col, inRoom, hand, eliminated, isAI }
let envelope     = { suspect: null, weapon: null, room: null }; // the solution
let currentTurn  = 0;  // index into players[]
let diceRoll     = 0;
let stepsLeft    = 0;
let gamePhase    = "idle"; // idle | rolling | moving | suggesting | showing | accusing | gameover
let pendingSuggestion = null; // { suspect, weapon, room, byPlayer, checkingPlayer }
let notesData    = {}; // notes[playerIdx][itemId] = '' | 'x' | 'check' | '?'

// Suggestion/accusation selections
let selectedSuspect = null;
let selectedWeapon  = null;
let selectedRoom    = null;

// ── 6. BOARD RENDERING ───────────────────────
function calcCellSize() {
    const mainArea  = document.getElementById("main-area");
    const sidePanel = document.getElementById("side-panel");
    const available = Math.min(
        mainArea.clientHeight,
        mainArea.clientWidth - sidePanel.clientWidth - 4
    );
    return Math.floor(available / 24);
}

function renderBoard() {
    const cell  = calcCellSize();
    const board = document.getElementById("clue-board");
    document.documentElement.style.setProperty("--cell", cell + "px");

    board.style.gridTemplateColumns = `repeat(24, ${cell}px)`;
    board.style.gridTemplateRows    = `repeat(24, ${cell}px)`;
    board.style.width  = (cell * 24) + "px";
    board.style.height = (cell * 24) + "px";

    board.innerHTML = "";

    for (let r = 0; r < 24; r++) {
        for (let c = 0; c < 24; c++) {
            const type = BOARD_MAP[r][c];
            const el   = document.createElement("div");
            el.className = "cell";
            el.dataset.r = r;
            el.dataset.c = c;

            if (type === W)        el.classList.add("wall");
            else if (type === D)   el.classList.add("door", "corridor");
            else if (type === XX)  el.classList.add("center");
            else if (type === C)   el.classList.add("corridor");
            else if (isRoomId(type)) {
                el.classList.add("room");
                el.dataset.room = type;
            }

            el.addEventListener("click", onCellClick);
            board.appendChild(el);
        }
    }

    renderRoomLabels(cell);
    renderTokens();
}

function renderRoomLabels(cell) {
    const labelContainer = document.getElementById("room-labels");
    labelContainer.innerHTML = "";
    const boardEl = document.getElementById("clue-board");
    const rect    = boardEl.getBoundingClientRect();

    Object.entries(ROOM_LABELS).forEach(([roomId, info]) => {
        const label = document.createElement("div");
        label.className = "room-label";
        label.textContent = info.text;
        label.style.left = ((info.col + 0.5) * cell) + "px";
        label.style.top  = ((info.row + 0.5) * cell) + "px";
        labelContainer.appendChild(label);
    });
}

function cellEl(r, c) {
    return document.querySelector(`#clue-board .cell[data-r="${r}"][data-c="${c}"]`);
}

// ── 7. TOKEN RENDERING ───────────────────────
function renderTokens() {
    // Clear existing tokens
    document.querySelectorAll(".player-token").forEach(t => t.remove());

    // Group players by cell
    const cellGroups = {};
    players.forEach((p, i) => {
        if (p.eliminated) return;
        const key = p.inRoom ? `room:${p.inRoom}` : `${p.row},${p.col}`;
        if (!cellGroups[key]) cellGroups[key] = [];
        cellGroups[key].push({ p, i });
    });

    Object.entries(cellGroups).forEach(([key, group]) => {
        group.forEach(({ p, i }, slotIdx) => {
            const token = document.createElement("div");
            token.className = `player-token token-${p.suspectId}`;
            token.style.background = p.color;
            token.title = p.name;
            token.dataset.playerIdx = i;

            // Stack tokens if multiple in same cell
            if (group.length > 1) {
                const offsets = [
                    [5,  5 ], [40, 5 ], [5,  40], [40, 40],
                    [20, 5 ], [5,  20]
                ];
                const [top, left] = offsets[slotIdx] || [5, 5];
                token.style.top    = top  + "%";
                token.style.left   = left + "%";
                token.style.width  = "48%";
                token.style.height = "48%";
            }

            if (p.inRoom) {
                // Place token on a room cell (find first room cell)
                const roomCells = document.querySelectorAll(
                    `#clue-board .cell[data-room="${p.inRoom}"]`
                );
                if (roomCells.length > 0) {
                    const mid = Math.floor(roomCells.length / 2) + slotIdx;
                    roomCells[Math.min(mid, roomCells.length - 1)].appendChild(token);
                }
            } else {
                const el = cellEl(p.row, p.col);
                if (el) el.appendChild(token);
            }
        });
    });
}

// ── 8. VALID MOVE HIGHLIGHTS ─────────────────
let reachableSet = new Set();

function highlightReachable() {
    clearHighlights();
    const p = players[currentTurn];
    reachableSet = getReachableCells(p.row, p.col, stepsLeft, p.inRoom);

    reachableSet.forEach(key => {
        if (key.startsWith("room:")) {
            // Highlight all cells of that room
            const roomId = key.replace("room:", "");
            document.querySelectorAll(`#clue-board .cell[data-room="${roomId}"]`)
                .forEach(el => el.classList.add("valid-move"));
        } else {
            const [r, c] = key.split(",").map(Number);
            const el = cellEl(r, c);
            if (el) el.classList.add("valid-move");
        }
    });
}

function clearHighlights() {
    document.querySelectorAll(".cell.valid-move").forEach(el => el.classList.remove("valid-move"));
}

// ── 9. CELL CLICK HANDLER ────────────────────
function onCellClick(e) {
    if (gamePhase !== "moving") return;
    if (!isMyTurn()) return;

    const el   = e.currentTarget;
    const r    = parseInt(el.dataset.r);
    const c    = parseInt(el.dataset.c);
    const type = BOARD_MAP[r][c];

    if (!el.classList.contains("valid-move")) return;

    const p = players[currentTurn];

    // Moving into a room cell
    if (isRoomId(type)) {
        movePlayerToRoom(currentTurn, type);
        return;
    }

    // Moving into a corridor or door cell
    if (type === C || type === D) {
        const adjacentRoom = getAdjacentRoom(r, c);
        if (adjacentRoom && reachableSet.has(`room:${adjacentRoom}`)) {
            movePlayerToRoom(currentTurn, adjacentRoom);
        } else {
            movePlayerToCorridor(currentTurn, r, c);
        }
    }
}

function movePlayerToRoom(playerIdx, roomId) {
    const p  = players[playerIdx];
    p.inRoom = roomId;
    // Place on a logical room cell (first non-occupied room cell)
    const roomCells = document.querySelectorAll(`#clue-board .cell[data-room="${roomId}"]`);
    if (roomCells.length > 0) {
        const midCell = roomCells[Math.floor(roomCells.length / 2)];
        p.row = parseInt(midCell.dataset.r);
        p.col = parseInt(midCell.dataset.c);
    }

    clearHighlights();
    reachableSet.clear();
    renderTokens();
    gamePhase = "suggesting";
    updateActionButtons();
    setTurnAction(`In the ${getRoomName(roomId)}`);

    if (gameMode === "online") pushGameState();
}

function movePlayerToCorridor(playerIdx, r, c) {
    const p  = players[playerIdx];
    p.row    = r;
    p.col    = c;
    p.inRoom = null;

    clearHighlights();
    reachableSet.clear();
    renderTokens();
    gamePhase = "suggesting";
    updateActionButtons();
    setTurnAction("Moved");

    if (gameMode === "online") pushGameState();
}

function useSecretPassage(playerIdx) {
    const p      = players[playerIdx];
    const destId = SECRET_PASSAGES[p.inRoom];
    if (!destId) return;
    movePlayerToRoom(playerIdx, destId);
    setTurnAction(`Used secret passage → ${getRoomName(destId)}`);
}

// ── 10. GAME SETUP ───────────────────────────
function initGame(count) {
    numPlayers = count;
    players    = [];
    notesData  = {};

    // Build player list
    SUSPECTS.slice(0, count).forEach((s, i) => {
        const isHuman = (gameMode === "hotseat") ? true
                      : (gameMode === "online")  ? (i === myPlayerIndex)
                      : (i === 0);
        players.push({
            name:       i === 0 ? SystemUI.getPlayerName() : (gameMode === "hotseat" ? `Player ${i+1}` : s.name),
            suspectId:  s.id,
            color:      s.color,
            icon:       s.icon,
            row:        s.start[0],
            col:        s.start[1],
            inRoom:     null,
            hand:       [],
            eliminated: false,
            isAI:       !isHuman
        });
        notesData[i] = {};
    });

    // Deal cards
    dealCards();

    // Init notepad (mark own cards as safe)
    players[myPlayerIndex].hand.forEach(cardId => {
        notesData[myPlayerIndex][cardId] = 'check';
    });

    currentTurn = 0;
    gamePhase   = "rolling";
    pendingSuggestion = null;

    renderBoard();
    renderPlayerList();
    renderHand();
    buildNotepad();
    updateTurnUI();
    updateActionButtons();

    document.getElementById("start-screen").classList.add("hidden");
}

function dealCards() {
    // Pick solution (one from each category)
    const shuffledSuspects = shuffleArr([...SUSPECTS]);
    const shuffledWeapons  = shuffleArr([...WEAPONS]);
    const shuffledRooms    = shuffleArr([...ROOMS]);

    envelope.suspect = shuffledSuspects[0].id;
    envelope.weapon  = shuffledWeapons[0].id;
    envelope.room    = shuffledRooms[0].id;

    // Remaining cards dealt evenly
    const deck = [
        ...shuffledSuspects.slice(1).map(s => ({ id: s.id, type: "suspect", name: s.name, icon: s.icon })),
        ...shuffledWeapons.slice(1).map(w  => ({ id: w.id, type: "weapon",  name: w.name, icon: w.icon })),
        ...shuffledRooms.slice(1).map(r    => ({ id: r.id, type: "room",    name: r.name, icon: r.icon }))
    ];
    shuffleArr(deck);

    let playerIdx = 0;
    deck.forEach(card => {
        players[playerIdx % numPlayers].hand.push(card.id);
        playerIdx++;
    });

    // Store full card info for rendering
    window.cardInfo = {};
    [...SUSPECTS, ...WEAPONS, ...ROOMS].forEach(item => {
        const type = SUSPECTS.includes(item) ? "suspect" : WEAPONS.includes(item) ? "weapon" : "room";
        window.cardInfo[item.id] = { ...item, type };
    });
}

function shuffleArr(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ── 11. TURN MANAGEMENT ──────────────────────
function isMyTurn() {
    if (gameMode === "online")  return currentTurn === myPlayerIndex;
    if (gameMode === "hotseat") return true;
    return !players[currentTurn].isAI;
}

function rollDice() {
    if (gamePhase !== "rolling" || !isMyTurn()) return;

    const d1 = Math.ceil(Math.random() * 6);
    const d2 = Math.ceil(Math.random() * 6);
    diceRoll  = d1 + d2;
    stepsLeft = diceRoll;

    // Animate dice
    ["die-1","die-2"].forEach(id => {
        const el = document.getElementById(id);
        el.classList.remove("rolling");
        void el.offsetWidth;
        el.classList.add("rolling");
    });
    setTimeout(() => {
        document.getElementById("die-1").textContent = d1;
        document.getElementById("die-2").textContent = d2;
        document.getElementById("dice-total").textContent = `= ${diceRoll}`;
    }, 250);

    SystemUI.playSound('click');
    gamePhase = "moving";
    setTimeout(() => {
        highlightReachable();
        updateActionButtons();
        setTurnAction(`Move up to ${stepsLeft} steps`);
    }, 300);

    if (gameMode === "online") pushGameState();
}

function endTurn() {
    clearHighlights();
    reachableSet.clear();
    gamePhase = "rolling";

    // Advance to next non-eliminated player
    let next = (currentTurn + 1) % numPlayers;
    while (players[next].eliminated) {
        next = (next + 1) % numPlayers;
        if (next === currentTurn) break; // all eliminated (shouldn't happen)
    }
    currentTurn = next;

    diceRoll  = 0;
    stepsLeft = 0;
    document.getElementById("die-1").textContent = "?";
    document.getElementById("die-2").textContent = "?";
    document.getElementById("dice-total").textContent = "";

    updateTurnUI();
    updateActionButtons();

    if (gameMode === "online") pushGameState();

    // AI turn
    if (players[currentTurn].isAI && gamePhase === "rolling") {
        setTimeout(aiTakeTurn, 1200);
    }
}

// ── 12. UI HELPERS ───────────────────────────
function getRoomName(id)    { return ROOMS.find(r => r.id === id)?.name    || id; }
function getSuspectName(id) { return SUSPECTS.find(s => s.id === id)?.name || id; }
function getWeaponName(id)  { return WEAPONS.find(w => w.id === id)?.name  || id; }
function getSuspectIcon(id) { return SUSPECTS.find(s => s.id === id)?.icon || "👤"; }
function getWeaponIcon(id)  { return WEAPONS.find(w => w.id === id)?.icon  || "❓"; }
function getRoomIcon(id)    { return ROOMS.find(r => r.id === id)?.icon    || "🚪"; }

function setTurnAction(text) { document.getElementById("turn-action").textContent = text; }

function updateTurnUI() {
    const p = players[currentTurn];
    document.getElementById("turn-badge").style.background = p.color;
    document.getElementById("turn-name").textContent = p.name + (p.isAI ? " (AI)" : "");
    setTurnAction("Roll to move");
}

function updateActionButtons() {
    const p       = players[currentTurn];
    const canAct  = isMyTurn();
    const inRoom  = !!p.inRoom;
    const phase   = gamePhase;

    document.getElementById("roll-btn").classList.toggle("hidden",
        phase !== "rolling" || !canAct);

    document.getElementById("suggest-btn").classList.toggle("hidden",
        !inRoom || phase !== "suggesting" || !canAct);

    document.getElementById("accuse-btn").classList.toggle("hidden",
        !canAct || (phase !== "suggesting" && phase !== "rolling"));

    document.getElementById("end-turn-btn").classList.toggle("hidden",
        !canAct || (phase !== "suggesting" && phase !== "moving"));

    // Highlight active player in player list
    document.querySelectorAll(".player-row").forEach((row, i) => {
        row.classList.toggle("active-turn", i === currentTurn);
    });
}

function renderPlayerList() {
    const list = document.getElementById("player-list");
    list.innerHTML = "";
    players.forEach((p, i) => {
        const row = document.createElement("div");
        row.className = "player-row" + (p.eliminated ? " eliminated" : "");
        row.innerHTML = `
            <div class="pr-dot" style="background:${p.color}"></div>
            <div class="pr-name${i === myPlayerIndex ? " is-you" : ""}">${p.name}</div>
            <div class="pr-cards">${p.hand.length}🃏</div>
        `;
        list.appendChild(row);
    });
}

function renderHand() {
    const container = document.getElementById("hand-cards");
    container.innerHTML = "";
    const myHand    = players[myPlayerIndex].hand;

    myHand.forEach(cardId => {
        const info = window.cardInfo[cardId];
        if (!info) return;
        const card = document.createElement("div");
        card.className = `clue-card card-${info.type}`;
        card.title     = info.name;
        card.innerHTML = `
            <span class="card-icon">${info.icon}</span>
            <span class="card-name">${info.name}</span>
        `;
        container.appendChild(card);
    });
}

// ── 13. NOTEPAD ──────────────────────────────
/*
 * Notepad grid layout:
 * - Row 0: header row (blank + player name columns)
 * - Rows 1+: one row per suspect/weapon/room
 * - Each data cell cycles through: '' → 'x' → 'check' → '?' → ''
 * - My own column auto-marks cards I hold as 'check'
 */
function buildNotepad() {
    const sections = [
        { id: "note-suspects", items: SUSPECTS, label: "Suspects" },
        { id: "note-weapons",  items: WEAPONS,  label: "Weapons"  },
        { id: "note-rooms",    items: ROOMS,     label: "Rooms"    }
    ];

    sections.forEach(({ id, items }) => {
        const grid = document.getElementById(id);
        const cols = 1 + numPlayers;
        grid.style.gridTemplateColumns = `minmax(90px,1fr) ${Array(numPlayers).fill("30px").join(" ")}`;

        // Header row
        const blankHeader = document.createElement("div");
        blankHeader.className = "note-cell note-header";
        grid.appendChild(blankHeader);

        players.forEach((p, i) => {
            const hdr = document.createElement("div");
            hdr.className   = "note-cell note-header";
            hdr.textContent = p.name.slice(0, 2).toUpperCase();
            hdr.title       = p.name;
            grid.appendChild(hdr);
        });

        // Item rows
        items.forEach(item => {
            const label = document.createElement("div");
            label.className   = "note-cell note-label";
            label.textContent = item.name;
            grid.appendChild(label);

            players.forEach((p, pIdx) => {
                const cell = document.createElement("div");
                cell.className   = "note-cell";
                cell.dataset.item   = item.id;
                cell.dataset.player = pIdx;
                cell.textContent = "";

                // Pre-mark own hand
                if (pIdx === myPlayerIndex && p.hand.includes(item.id)) {
                    cell.dataset.mark = "check";
                    cell.textContent  = "✓";
                }

                cell.addEventListener("click", () => cycleNoteMark(cell, pIdx));
                grid.appendChild(cell);
            });
        });
    });
}

const MARK_CYCLE = ["", "x", "check", "?"];
const MARK_DISPLAY = { "": "", "x": "✗", "check": "✓", "?": "?" };

function cycleNoteMark(cell, playerIdx) {
    const current = cell.dataset.mark || "";
    const nextIdx = (MARK_CYCLE.indexOf(current) + 1) % MARK_CYCLE.length;
    const next    = MARK_CYCLE[nextIdx];
    cell.dataset.mark = next;
    cell.textContent  = MARK_DISPLAY[next] || "";
}

// Auto-mark when we learn a card from a suggestion result
function autoMarkNotepad(cardId, playerIdx, mark) {
    const cells = document.querySelectorAll(
        `.note-cell[data-item="${cardId}"][data-player="${playerIdx}"]`
    );
    cells.forEach(cell => {
        cell.dataset.mark = mark;
        cell.textContent  = MARK_DISPLAY[mark] || "";
    });
}

// ── 14. SUGGESTION FLOW ──────────────────────
function openSuggestModal() {
    if (!players[currentTurn].inRoom) return;

    selectedSuspect = null;
    selectedWeapon  = null;

    const modal    = document.getElementById("suggest-modal");
    const roomName = getRoomName(players[currentTurn].inRoom);
    document.getElementById("suggest-room-label").textContent = `In the ${roomName}...`;

    // Build suspect picker
    buildPickerRow("suggest-suspect-row", SUSPECTS, (id) => { selectedSuspect = id; });

    // Build weapon picker
    buildPickerRow("suggest-weapon-row", WEAPONS, (id) => { selectedWeapon = id; });

    document.getElementById("suggest-confirm").disabled = true;
    modal.classList.remove("hidden");

    // Enable confirm when both selected
    modal.addEventListener("click", checkSuggestReady);
}

function checkSuggestReady() {
    document.getElementById("suggest-confirm").disabled = !(selectedSuspect && selectedWeapon);
}

function buildPickerRow(containerId, items, onSelect) {
    const row = document.getElementById(containerId);
    row.innerHTML = "";
    items.forEach(item => {
        const btn = document.createElement("button");
        btn.className   = "pick-btn";
        btn.textContent = `${item.icon} ${item.name}`;
        btn.dataset.id  = item.id;
        btn.addEventListener("click", () => {
            row.querySelectorAll(".pick-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            onSelect(item.id);
            checkSuggestReady();
        });
        row.appendChild(btn);
    });
}

document.getElementById("suggest-cancel").addEventListener("click",
    () => document.getElementById("suggest-modal").classList.add("hidden"));

document.getElementById("suggest-confirm").addEventListener("click", () => {
    if (!selectedSuspect || !selectedWeapon) return;
    document.getElementById("suggest-modal").classList.add("hidden");

    const roomId = players[currentTurn].inRoom;
    makeSuggestion(currentTurn, selectedSuspect, selectedWeapon, roomId);
});

function makeSuggestion(byPlayer, suspectId, weaponId, roomId) {
    // Move the accused suspect into this room
    const suspectPlayerIdx = players.findIndex(p => p.suspectId === suspectId);
    if (suspectPlayerIdx >= 0) {
        movePlayerToRoom(suspectPlayerIdx, roomId);
    }

    pendingSuggestion = {
        suspect: suspectId,
        weapon:  weaponId,
        room:    roomId,
        byPlayer,
        checkingPlayer: (byPlayer + 1) % numPlayers
    };

    gamePhase = "showing";
    setTurnAction(`${getSuspectName(suspectId)} with the ${getWeaponName(weaponId)} in the ${getRoomName(roomId)}`);

    if (gameMode === "online") pushGameState();
    checkNextPlayerForCard();
}

function checkNextPlayerForCard() {
    const { byPlayer, checkingPlayer, suspect, weapon, room } = pendingSuggestion;

    if (checkingPlayer === byPlayer) {
        // Gone full circle — nobody could disprove
        showResultModal(null, null);
        return;
    }

    const checker = players[checkingPlayer];
    const matchingCards = [suspect, weapon, room].filter(id => checker.hand.includes(id));

    if (gameMode === "hotseat" || (gameMode === "online" && checkingPlayer === myPlayerIndex)) {
        // Human player must choose a card to show
        openShowCardModal(checkingPlayer, matchingCards, byPlayer, suspect, weapon, room);
    } else if (gameMode === "ai" || checker.isAI) {
        // AI: automatically shows the first matching card (lowest-info reveal)
        setTimeout(() => {
            if (matchingCards.length > 0) {
                const cardToShow = matchingCards[0];
                processCardShown(checkingPlayer, cardToShow, byPlayer);
            } else {
                // Pass to next player
                pendingSuggestion.checkingPlayer = (checkingPlayer + 1) % numPlayers;
                checkNextPlayerForCard();
            }
        }, 900);
    } else {
        // Online: wait for the checking player to submit their card
        if (matchingCards.length === 0) {
            // Auto-pass
            pendingSuggestion.checkingPlayer = (checkingPlayer + 1) % numPlayers;
            pushGameState();
            checkNextPlayerForCard();
        }
        // Otherwise the other client will fire openShowCardModal
    }
}

function openShowCardModal(playerIdx, matchingCards, forPlayer, suspect, weapon, room) {
    const modal   = document.getElementById("show-card-modal");
    const checker = players[playerIdx];
    const asker   = players[forPlayer];

    document.getElementById("show-card-title").textContent =
        `${checker.name}: Show a Card`;
    document.getElementById("show-card-sub").textContent =
        `${asker.name} suggested: ${getSuspectName(suspect)}, ${getWeaponName(weapon)}, ${getRoomName(room)}`;

    const optionsRow = document.getElementById("show-card-options");
    const noneDiv    = document.getElementById("show-card-none");
    optionsRow.innerHTML = "";

    if (matchingCards.length === 0) {
        optionsRow.classList.add("hidden");
        noneDiv.classList.remove("hidden");
        document.getElementById("show-card-pass").onclick = () => {
            modal.classList.add("hidden");
            pendingSuggestion.checkingPlayer = (pendingSuggestion.checkingPlayer + 1) % numPlayers;
            if (gameMode === "online") pushGameState();
            checkNextPlayerForCard();
        };
    } else {
        noneDiv.classList.add("hidden");
        optionsRow.classList.remove("hidden");

        matchingCards.forEach(cardId => {
            const info = window.cardInfo[cardId];
            const btn  = document.createElement("button");
            btn.className   = "pick-btn";
            btn.textContent = `${info.icon} ${info.name}`;
            btn.addEventListener("click", () => {
                modal.classList.add("hidden");
                processCardShown(playerIdx, cardId, forPlayer);
            });
            optionsRow.appendChild(btn);
        });
    }

    modal.classList.remove("hidden");
}

function processCardShown(showingPlayer, cardId, toPlayer) {
    // Update notes: mark card as safe for showing player
    autoMarkNotepad(cardId, showingPlayer, "check");

    // Show result only to the suggestion maker
    if (toPlayer === myPlayerIndex) {
        const info = window.cardInfo[cardId];
        showResultModal(showingPlayer, cardId);
    } else {
        // Other players just see "a card was shown"
        showResultModal(showingPlayer, null);
    }

    pendingSuggestion = null;
    if (gameMode === "online") pushGameState();
}

function showResultModal(showingPlayer, cardId) {
    const modal = document.getElementById("result-modal");
    const title = document.getElementById("result-modal-title");
    const body  = document.getElementById("result-modal-body");

    if (showingPlayer === null) {
        title.textContent = "No Disproof!";
        body.innerHTML    = `<p style="color:var(--parchment);text-align:center;margin:12px 0;font-style:italic;">Nobody could disprove the suggestion.<br>The solution may be closer than you think...</p>`;
    } else if (cardId) {
        const info = window.cardInfo[cardId];
        title.textContent = "Card Shown";
        body.innerHTML    = `
            <p style="text-align:center;color:var(--muted);margin-bottom:12px;font-style:italic;">
                ${players[showingPlayer].name} showed you:
            </p>
            <div style="text-align:center;font-size:2rem;margin:8px 0">${info.icon}</div>
            <div style="text-align:center;font-family:'Playfair Display',serif;font-size:1.1rem;color:var(--gold);margin-bottom:8px">${info.name}</div>
        `;
    } else {
        title.textContent = "Card Shown";
        body.innerHTML    = `<p style="text-align:center;color:var(--muted);margin:12px 0;font-style:italic;">${players[showingPlayer].name} showed a card to the suggester.</p>`;
    }

    modal.classList.remove("hidden");
}

document.getElementById("result-modal-ok").addEventListener("click", () => {
    document.getElementById("result-modal").classList.add("hidden");
    gamePhase = "suggesting";
    updateActionButtons();
});

// ── 15. ACCUSATION FLOW ──────────────────────
function openAccuseModal() {
    selectedSuspect = null;
    selectedWeapon  = null;
    selectedRoom    = null;

    buildPickerRow("accuse-suspect-row", SUSPECTS, (id) => { selectedSuspect = id; });
    buildPickerRow("accuse-weapon-row",  WEAPONS,  (id) => { selectedWeapon  = id; });
    buildPickerRow("accuse-room-row",    ROOMS,    (id) => { selectedRoom    = id; });

    document.getElementById("accuse-confirm").disabled = true;
    document.getElementById("accuse-modal").addEventListener("click", () => {
        document.getElementById("accuse-confirm").disabled =
            !(selectedSuspect && selectedWeapon && selectedRoom);
    });
    document.getElementById("accuse-modal").classList.remove("hidden");
}

document.getElementById("accuse-cancel").addEventListener("click",
    () => document.getElementById("accuse-modal").classList.add("hidden"));

document.getElementById("accuse-confirm").addEventListener("click", () => {
    if (!selectedSuspect || !selectedWeapon || !selectedRoom) return;
    document.getElementById("accuse-modal").classList.add("hidden");
    resolveAccusation(currentTurn, selectedSuspect, selectedWeapon, selectedRoom);
});

function resolveAccusation(playerIdx, suspectId, weaponId, roomId) {
    const correct = suspectId === envelope.suspect &&
                    weaponId  === envelope.weapon  &&
                    roomId    === envelope.room;

    if (correct) {
        endGame(playerIdx);
    } else {
        // Wrong accusation — player is eliminated
        players[playerIdx].eliminated = true;
        renderPlayerList();
        SystemUI.playSound('lose');

        // Show elimination result
        const modal = document.getElementById("result-modal");
        document.getElementById("result-modal-title").textContent = "Wrong Accusation!";
        document.getElementById("result-modal-body").innerHTML = `
            <p style="text-align:center;color:var(--red,#e74c3c);margin:8px 0;font-size:1rem;">
                ${players[playerIdx].name} has been eliminated!
            </p>
            <p style="text-align:center;color:var(--muted);font-style:italic;margin-top:8px;font-size:0.85rem;">
                They may still prove or disprove suggestions, but cannot win.
            </p>
        `;
        modal.classList.remove("hidden");
        document.getElementById("result-modal-ok").onclick = () => {
            modal.classList.add("hidden");
            document.getElementById("result-modal-ok").onclick = () => {
                modal.classList.add("hidden");
                gamePhase = "suggesting";
                updateActionButtons();
            };
            endTurn();
        };

        // Check if all human players are eliminated
        const remaining = players.filter(p => !p.eliminated && !p.isAI);
        if (remaining.length === 0) endGame(-1);
    }

    if (gameMode === "online") pushGameState();
}

// ── 16. GAME END ─────────────────────────────
function endGame(winnerIdx) {
    gamePhase = "gameover";
    clearHighlights();
    stopAllAI();

    const suspectName = getSuspectName(envelope.suspect);
    const weaponName  = getWeaponName(envelope.weapon);
    const roomName    = getRoomName(envelope.room);

    if (winnerIdx >= 0) {
        const winner = players[winnerIdx];
        document.getElementById("game-over-emoji").textContent = winnerIdx === myPlayerIndex ? "🏆" : "🔍";
        document.getElementById("game-over-title").textContent = `${winner.name} Wins!`;
        document.getElementById("game-over-msg").textContent   = "The mystery has been solved!";
        SystemUI.playSound(winnerIdx === myPlayerIndex ? 'win' : 'lose');
    } else {
        document.getElementById("game-over-emoji").textContent = "💀";
        document.getElementById("game-over-title").textContent = "No Winner!";
        document.getElementById("game-over-msg").textContent   = "All players made wrong accusations.";
        SystemUI.playSound('lose');
    }

    document.getElementById("game-over-solution").innerHTML =
        `It was <strong>${suspectName}</strong><br>with the <strong>${weaponName}</strong><br>in the <strong>${roomName}</strong>`;

    document.getElementById("game-over-modal").classList.remove("hidden");

    if (gameMode === "online") {
        window.dbUpdate(window.dbRef(window.db, 'clue_rooms/' + currentRoomId), {
            status: "finished", winner: winnerIdx
        });
    }
}

// ── 17. AI BRAIN ─────────────────────────────
/*
 * AI Deduction Logic:
 * 1. The AI maintains its own notepad (suspectNotes, weaponNotes, roomNotes).
 * 2. When it witnesses a card shown (or holds one), it marks it as "safe".
 * 3. When making a suggestion, it picks from the "unknown" pool —
 *    preferring items it hasn't seen disproved yet.
 * 4. When making an accusation, it only does so if it has narrowed each
 *    category to exactly one unknown.
 * 5. Movement: prioritises rooms it hasn't visited with unknown cards.
 */

let aiSuspectsSeen = {}; // cardId → true if AI knows it's safe
let aiWeaponsSeen  = {};
let aiRoomsSeen    = {};
let aiTimers       = [];

function stopAllAI() { aiTimers.forEach(t => clearTimeout(t)); aiTimers = []; }

function aiTakeTurn() {
    if (!players[currentTurn].isAI || gamePhase !== "rolling") return;

    const p = players[currentTurn];

    // Roll dice (AI always rolls)
    const d1 = Math.ceil(Math.random() * 6);
    const d2 = Math.ceil(Math.random() * 6);
    diceRoll  = d1 + d2;
    stepsLeft = diceRoll;

    document.getElementById("die-1").textContent  = d1;
    document.getElementById("die-2").textContent  = d2;
    document.getElementById("dice-total").textContent = `= ${diceRoll}`;
    updateTurnUI();
    gamePhase = "moving";

    // Choose destination
    const reachable = getReachableCells(p.row, p.col, stepsLeft, p.inRoom);
    let destination = null;

    // Prefer rooms with unknown cards
    const roomKeys = [...reachable].filter(k => k.startsWith("room:"));
    if (roomKeys.length > 0) {
        // Pick the room with the most unknowns
        const scored = roomKeys.map(key => {
            const rid     = key.replace("room:", "");
            const unknown = !aiRoomsSeen[rid] ? 1 : 0;
            return { rid, unknown };
        });
        scored.sort((a, b) => b.unknown - a.unknown);
        destination = { type: "room", id: scored[0].rid };
    } else {
        // Pick a random corridor cell
        const corridorKeys = [...reachable].filter(k => !k.startsWith("room:"));
        if (corridorKeys.length > 0) {
            const pick = corridorKeys[Math.floor(Math.random() * corridorKeys.length)];
            const [r, c] = pick.split(",").map(Number);
            destination  = { type: "corridor", r, c };
        }
    }

    const t1 = setTimeout(() => {
        if (destination) {
            if (destination.type === "room") {
                movePlayerToRoom(currentTurn, destination.id);
            } else {
                movePlayerToCorridor(currentTurn, destination.r, destination.c);
            }
        }

        gamePhase = "suggesting";
        updateActionButtons();

        // Suggest if in a room
        if (p.inRoom) {
            const t2 = setTimeout(() => {
                const aiSuggestion = buildAISuggestion(p.inRoom);
                makeSuggestion(currentTurn, aiSuggestion.suspect, aiSuggestion.weapon, p.inRoom);

                // After suggestion resolves, try to accuse if ready
                const t3 = setTimeout(() => {
                    if (aiReadyToAccuse()) {
                        const acc = buildAIAccusation();
                        resolveAccusation(currentTurn, acc.suspect, acc.weapon, acc.room);
                    } else {
                        endTurn();
                    }
                }, 2000);
                aiTimers.push(t3);
            }, 1000);
            aiTimers.push(t2);
        } else {
            const t2 = setTimeout(endTurn, 800);
            aiTimers.push(t2);
        }
    }, 800);
    aiTimers.push(t1);
}

function buildAISuggestion(roomId) {
    // Pick the most "unknown" suspect and weapon
    const unknownSuspects = SUSPECTS.filter(s => !players[currentTurn].hand.includes(s.id) && !aiSuspectsSeen[s.id]);
    const unknownWeapons  = WEAPONS.filter(w  => !players[currentTurn].hand.includes(w.id) && !aiWeaponsSeen[w.id]);

    const suspect = unknownSuspects.length > 0
        ? unknownSuspects[Math.floor(Math.random() * unknownSuspects.length)].id
        : SUSPECTS[Math.floor(Math.random() * SUSPECTS.length)].id;

    const weapon = unknownWeapons.length > 0
        ? unknownWeapons[Math.floor(Math.random() * unknownWeapons.length)].id
        : WEAPONS[Math.floor(Math.random() * WEAPONS.length)].id;

    return { suspect, weapon };
}

function aiReadyToAccuse() {
    const unknownS = SUSPECTS.filter(s => !players[currentTurn].hand.includes(s.id) && !aiSuspectsSeen[s.id]);
    const unknownW = WEAPONS.filter(w  => !players[currentTurn].hand.includes(w.id) && !aiWeaponsSeen[w.id]);
    const unknownR = ROOMS.filter(r    => !players[currentTurn].hand.includes(r.id) && !aiRoomsSeen[r.id]);
    return unknownS.length === 1 && unknownW.length === 1 && unknownR.length === 1;
}

function buildAIAccusation() {
    const s = SUSPECTS.find(s => !players[currentTurn].hand.includes(s.id) && !aiSuspectsSeen[s.id]);
    const w = WEAPONS.find(w  => !players[currentTurn].hand.includes(w.id) && !aiWeaponsSeen[w.id]);
    const r = ROOMS.find(r    => !players[currentTurn].hand.includes(r.id) && !aiRoomsSeen[r.id]);
    return { suspect: s?.id, weapon: w?.id, room: r?.id };
}

// Update AI's seen-cards when a suggestion is resolved
function aiLearnCard(cardId) {
    if (SUSPECTS.find(s => s.id === cardId)) aiSuspectsSeen[cardId] = true;
    if (WEAPONS.find(w  => w.id === cardId)) aiWeaponsSeen[cardId]  = true;
    if (ROOMS.find(r    => r.id === cardId)) aiRoomsSeen[cardId]    = true;
}

// ── 18. BUTTON WIRING ────────────────────────
document.getElementById("roll-btn").addEventListener("click", rollDice);

document.getElementById("suggest-btn").addEventListener("click", () => {
    if (gamePhase !== "suggesting" || !isMyTurn()) return;
    openSuggestModal();
});

document.getElementById("accuse-btn").addEventListener("click", () => {
    if (!isMyTurn()) return;
    openAccuseModal();
});

document.getElementById("end-turn-btn").addEventListener("click", () => {
    if (!isMyTurn()) return;
    endTurn();
});

document.getElementById("notepad-toggle-btn").addEventListener("click", () =>
    document.getElementById("notepad-overlay").classList.remove("hidden"));
document.getElementById("notepad-close").addEventListener("click", () =>
    document.getElementById("notepad-overlay").classList.add("hidden"));

document.getElementById("start-btn").addEventListener("click", () => {
    const activeBtn = document.querySelector(".count-btn.active");
    const count     = activeBtn ? parseInt(activeBtn.dataset.count) : 4;

    if (gameMode === "online" && !isHost) return;
    initGame(count);
});

document.querySelectorAll(".count-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".count-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        numPlayers = parseInt(btn.dataset.count);
    });
});

document.getElementById("btn-play-again").addEventListener("click", () => {
    document.getElementById("game-over-modal").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
});

window.addEventListener("resize", () => {
    if (gamePhase !== "idle") renderBoard();
});

// ── 19. FIREBASE ONLINE ──────────────────────
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
    isHost = true; myId = 1; myPlayerIndex = 0; chatStarted = false;

    window.dbSet(window.dbRef(window.db, 'clue_rooms/' + currentRoomId), {
        status: "waiting", players: 1, hostName: SystemUI.getPlayerName()
    }).then(() => {
        document.getElementById("room-code-display").classList.remove("hidden");
        document.getElementById("host-room-id").innerText = currentRoomId;
        document.getElementById("btn-create-room").disabled = true;
        listenToRoom();
    });
});

document.getElementById("btn-join-room").addEventListener("click", () => {
    SystemUI.playSound('click');
    const code = document.getElementById("join-room-input").value.toUpperCase().trim();

    window.dbGet(window.dbChild(window.dbRef(window.db), `clue_rooms/${code}`)).then(snapshot => {
        if (snapshot.exists()) {
            const data         = snapshot.val();
            const playerCount  = data.players || 1;
            currentRoomId      = code;
            isHost             = false;
            myId               = playerCount + 1;
            myPlayerIndex      = playerCount;
            chatStarted        = false;

            window.dbUpdate(window.dbRef(window.db, 'clue_rooms/' + currentRoomId), {
                players: myId,
                [`p${myId}Name`]: SystemUI.getPlayerName(),
                status: myId >= 2 ? "playing" : "waiting"
            });
            lobbyUI.classList.add("hidden");
            listenToRoom();
        } else {
            document.getElementById("lobby-error-msg").textContent = "Room not found.";
        }
    });
});

function listenToRoom() {
    let onlineGameStarted = false;
    window.dbOnValue(window.dbRef(window.db, 'clue_rooms/' + currentRoomId), snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (data.status === "playing" && !onlineGameStarted) {
            onlineGameStarted = true;
            lobbyUI.classList.add("hidden");
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
            if (isHost) {
                const count = data.players || 2;
                initGame(count);
                pushGameState();
            }
            return;
        }
        if (onlineGameStarted) syncFromFirebase(data);
    });
}

function pushGameState() {
    if (gameMode !== "online" || !currentRoomId) return;
    window.dbUpdate(window.dbRef(window.db, 'clue_rooms/' + currentRoomId), {
        gameState: JSON.stringify({
            players:           players.map(p => ({ ...p, hand: p.hand })),
            envelope:          envelope,
            currentTurn:       currentTurn,
            gamePhase:         gamePhase,
            pendingSuggestion: pendingSuggestion
        }),
        status: gamePhase === "gameover" ? "finished" : "playing"
    });
}

function syncFromFirebase(data) {
    if (!data || !data.gameState) return;
    try {
        const state = JSON.parse(data.gameState);

        players         = state.players;
        envelope        = state.envelope;
        currentTurn     = state.currentTurn;
        gamePhase       = state.gamePhase;
        pendingSuggestion = state.pendingSuggestion;

        renderBoard();
        renderPlayerList();
        updateTurnUI();
        updateActionButtons();

        // Trigger show-card modal for this player if needed
        if (gamePhase === "showing" && pendingSuggestion) {
            const { checkingPlayer, suspect, weapon, room, byPlayer } = pendingSuggestion;
            if (checkingPlayer === myPlayerIndex) {
                const matchingCards = [suspect, weapon, room].filter(id =>
                    players[myPlayerIndex].hand.includes(id));
                openShowCardModal(myPlayerIndex, matchingCards, byPlayer, suspect, weapon, room);
            }
        }

        if (state.gamePhase === "gameover") endGame(data.winner ?? -1);
    } catch (e) { console.error("Sync error:", e); }
}

document.getElementById("lobby-close-btn").addEventListener("click", () => lobbyUI.classList.add("hidden"));
document.getElementById("btn-cancel-lobby").addEventListener("click", () => {
    gameMode = "ai";
    document.getElementById("sys-clue-mode").value = "ai";
    localStorage.setItem("clue_mode", "ai");
    lobbyUI.classList.add("hidden");
    SystemUI.stopChat(); chatStarted = false;
});

