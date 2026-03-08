// =============================================
// CHECKERS — checkers_app.js
// =============================================

const BUY_IN  = 150;
const WIN_PAY = 300;

// --- Game State ---
let gameActive = false;
let board      = []; // board[r][c] = null | { color:'red'|'black', king:bool }
let currentTurn   = 'red';   // red = player / p1, black = ai / p2
let selectedCell  = null;    // { r, c }
let highlightMoves = [];     // [{ r, c, jumped:[{r,c}] }]
let forcedJumpers  = [];     // [{ r, c }] — pieces that must jump this turn
let multiJumpPiece = null;   // { r, c } when mid-multi-jump

// --- Online ---
let isOnline      = false;
let myColor       = null;
let currentRoomId = null;
let roomListener  = null;
let chatStarted   = false;

// =============================================
// SYSTEM UI INIT
// =============================================
SystemUI.init({
    gameName: 'CHECKERS',
    rules: `Classic 8×8 checkers. Pieces move diagonally forward on dark squares. Jump over an opponent's piece to capture it — jumps are mandatory if available! Reach the far end to crown a King, which can move in all four diagonal directions. Chain multiple jumps in one turn when possible. Capture all enemy pieces (or leave them with no valid moves) to win. Casino mode: $${BUY_IN} buy-in, win $${WIN_PAY}.`,
    hudDropdowns: [
        {
            id: 'sys-chk-mode',
            label: 'Mode',
            options: [
                { value: 'ai',       label: '🤖 vs AI'    },
                { value: 'hotseat',  label: '👥 Hotseat'  },
                { value: 'online',   label: '🌐 Online'   }
            ]
        },
        {
            id: 'sys-chk-diff',
            label: 'AI Difficulty',
            options: [
                { value: 'easy',   label: 'Easy'   },
                { value: 'normal', label: 'Normal' },
                { value: 'hard',   label: 'Hard'   }
            ]
        }
    ]
});

// =============================================
// MODE / DIFF CHANGE LISTENERS
// =============================================
document.getElementById('sys-chk-mode').addEventListener('change', function () {
    const diffEl = document.getElementById('sys-chk-diff');
    diffEl.parentElement.style.display = this.value === 'ai' ? '' : 'none';

    if (this.value === 'online') {
        if (gameActive) resetGame();
        SystemUI.stopChat();
        chatStarted = false;
        showLobby();
    } else {
        SystemUI.stopChat();
        chatStarted = false;
        hideLobby();
        resetGame();
    }
});

document.getElementById('sys-chk-diff').addEventListener('change', function () {
    if (gameActive) resetGame();
});

// =============================================
// BOARD INIT
// =============================================
function initBoard() {
    board = Array.from({ length: 8 }, () => Array(8).fill(null));
    // Black: rows 0-2, dark squares (top)
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 8; c++)
            if ((r + c) % 2 === 1) board[r][c] = { color: 'black', king: false };
    // Red: rows 5-7, dark squares (bottom)
    for (let r = 5; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if ((r + c) % 2 === 1) board[r][c] = { color: 'red', king: false };
}

// =============================================
// RENDER
// =============================================
function renderBoard() {
    const boardEl = document.getElementById('checkers-board');
    boardEl.innerHTML = '';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const isDark = (r + c) % 2 === 1;
            const sq = document.createElement('div');
            sq.className = `sq ${isDark ? 'dark' : 'light'}`;

            if (isDark) {
                const isSelected    = selectedCell && selectedCell.r === r && selectedCell.c === c;
                const isMoveTarget  = highlightMoves.find(m => m.r === r && m.c === c);
                const isForcedJumper = !selectedCell && forcedJumpers.some(p => p.r === r && p.c === c);

                if (isSelected)     sq.classList.add('selected');
                if (isMoveTarget)   sq.classList.add('can-move');
                if (isForcedJumper) sq.classList.add('must-jump');

                if (isMoveTarget) {
                    const dot = document.createElement('div');
                    dot.className = 'move-dot';
                    sq.appendChild(dot);
                }

                sq.addEventListener('click', () => onSquareClick(r, c));

                const piece = board[r][c];
                if (piece) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `piece${piece.king ? ' king' : ''}`;
                    const img = document.createElement('img');
                    const col = piece.color;
                    img.src = col === 'red'
                        ? '../../system/images/pieces/red/pieceRed_border12.png'
                        : '../../system/images/pieces/black/pieceBlack_border12.png';
                    img.alt = col;
                    pieceEl.appendChild(img);
                    sq.appendChild(pieceEl);
                }
            }

            boardEl.appendChild(sq);
        }
    }

    updateStats();
}

function updateStats() {
    const redCount   = board.flat().filter(p => p && p.color === 'red').length;
    const blackCount = board.flat().filter(p => p && p.color === 'black').length;

    document.getElementById('piece-count-display').textContent = `🔴 ${redCount} vs ${blackCount} ⚫`;
    document.getElementById('p1-captured').textContent = 12 - blackCount;
    document.getElementById('p2-captured').textContent = 12 - redCount;

    document.getElementById('p1-stat').classList.toggle('active-turn', gameActive && currentTurn === 'red');
    document.getElementById('p2-stat').classList.toggle('active-turn', gameActive && currentTurn === 'black');

    const banner = document.getElementById('turn-banner');
    if (!gameActive) { banner.classList.add('hidden'); return; }

    const mode = document.getElementById('sys-chk-mode').value;
    let msg = '';
    if (mode === 'hotseat') {
        msg = currentTurn === 'red' ? '🔴 Red\'s Turn' : '⚫ Black\'s Turn';
    } else if (mode === 'online') {
        msg = currentTurn === myColor ? '✅ Your Turn' : '⏳ Opponent\'s Turn...';
    } else {
        msg = currentTurn === 'red' ? '✅ Your Turn' : '🤖 AI Thinking...';
    }
    banner.textContent = msg;
    banner.classList.remove('hidden');
}

// =============================================
// MOVE LOGIC
// =============================================
function getMovesForPiece(r, c, b) {
    const piece = b[r][c];
    if (!piece) return { moves: [], jumps: [] };

    const dirs = [];
    if (piece.color === 'red'   || piece.king) dirs.push([-1, -1], [-1, 1]); // red moves up
    if (piece.color === 'black' || piece.king) dirs.push([ 1, -1], [ 1, 1]); // black moves down

    const moves = [], jumps = [];
    for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;

        if (!b[nr][nc]) {
            moves.push({ r: nr, c: nc, jumped: [] });
        } else if (b[nr][nc].color !== piece.color) {
            const jr = r + dr * 2, jc = c + dc * 2;
            if (jr >= 0 && jr <= 7 && jc >= 0 && jc <= 7 && !b[jr][jc]) {
                jumps.push({ r: jr, c: jc, jumped: [{ r: nr, c: nc }] });
            }
        }
    }
    return { moves, jumps };
}

function getAllMoves(color, b) {
    let allMoves = [], allJumps = [];
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (b[r][c] && b[r][c].color === color) {
                const { moves, jumps } = getMovesForPiece(r, c, b);
                allMoves.push(...moves.map(m => ({ ...m, fromR: r, fromC: c })));
                allJumps.push(...jumps.map(j => ({ ...j, fromR: r, fromC: c })));
            }
    return { allMoves, allJumps };
}

function getForcedJumpers(color, b) {
    const jumpers = [];
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (b[r][c] && b[r][c].color === color) {
                const { jumps } = getMovesForPiece(r, c, b);
                if (jumps.length > 0) jumpers.push({ r, c });
            }
    return jumpers;
}

// =============================================
// CLICK HANDLER
// =============================================
function onSquareClick(r, c) {
    if (!gameActive) return;

    const mode = document.getElementById('sys-chk-mode').value;
    if (mode === 'online'  && currentTurn !== myColor)  return;
    if (mode === 'ai'      && currentTurn !== 'red')    return;

    const piece = board[r][c];

    // Mid multi-jump: only the jumping piece's valid targets are clickable
    if (multiJumpPiece) {
        const target = highlightMoves.find(m => m.r === r && m.c === c);
        if (target) executeMove(multiJumpPiece.r, multiJumpPiece.c, target);
        return;
    }

    // Clicking a highlighted move target
    if (selectedCell) {
        const target = highlightMoves.find(m => m.r === r && m.c === c);
        if (target) { executeMove(selectedCell.r, selectedCell.c, target); return; }
    }

    // Selecting a piece
    if (piece && piece.color === currentTurn) {
        // Forced jump? Can only select forced jumpers
        if (forcedJumpers.length > 0 && !forcedJumpers.some(p => p.r === r && p.c === c)) return;

        selectedCell = { r, c };
        const { moves, jumps } = getMovesForPiece(r, c, board);
        highlightMoves = forcedJumpers.length > 0 ? jumps : [...jumps, ...moves];
        renderBoard();
        return;
    }

    // Clicking empty / wrong piece — deselect
    selectedCell = null;
    highlightMoves = [];
    renderBoard();
}

// =============================================
// EXECUTE MOVE
// =============================================
function executeMove(fromR, fromC, move) {
    const piece = board[fromR][fromC];
    board[move.r][move.c] = { ...piece };
    board[fromR][fromC] = null;

    for (const j of move.jumped) board[j.r][j.c] = null;
    SystemUI.playSound('click');

    // King promotion
    const becameKing = !piece.king && (
        (piece.color === 'red'   && move.r === 0) ||
        (piece.color === 'black' && move.r === 7)
    );
    if (becameKing) {
        board[move.r][move.c].king = true;
        SystemUI.playSound('chipTable');
    }

    // Check multi-jump (only if captured and not just kinged)
    if (move.jumped.length > 0 && !becameKing) {
        const { jumps: further } = getMovesForPiece(move.r, move.c, board);
        if (further.length > 0) {
            multiJumpPiece = { r: move.r, c: move.c };
            selectedCell   = { r: move.r, c: move.c };
            highlightMoves = further;
            renderBoard();

            const mode = document.getElementById('sys-chk-mode').value;
            if (mode === 'ai' && currentTurn === 'black') {
                setTimeout(() => doAIMultiJump(move.r, move.c, further), 600);
            }
            return;
        }
    }

    endTurn();
}

function endTurn() {
    multiJumpPiece = null;
    selectedCell   = null;
    highlightMoves = [];

    // Check if opponent has any moves left
    const opponent = currentTurn === 'red' ? 'black' : 'red';
    const { allMoves: oppM, allJumps: oppJ } = getAllMoves(opponent, board);

    if (oppM.length === 0 && oppJ.length === 0) {
        renderBoard();
        endGame(currentTurn);
        return;
    }

    currentTurn   = opponent;
    forcedJumpers = getForcedJumpers(currentTurn, board);

    const mode = document.getElementById('sys-chk-mode').value;
    if (mode === 'online') {
        pushToFirebase();
    } else {
        renderBoard();
        if (mode === 'ai' && currentTurn === 'black') setTimeout(doAITurn, 750);
    }
}

// =============================================
// AI
// =============================================
function doAITurn() {
    if (!gameActive || currentTurn !== 'black') return;

    const diff = document.getElementById('sys-chk-diff').value;
    const { allMoves, allJumps } = getAllMoves('black', board);
    const pool = allJumps.length > 0 ? allJumps : allMoves;
    if (pool.length === 0) return;

    let chosen;
    if (diff === 'easy') {
        chosen = pool[Math.floor(Math.random() * pool.length)];

    } else if (diff === 'normal') {
        if (allJumps.length > 0) {
            chosen = allJumps[Math.floor(Math.random() * allJumps.length)];
        } else {
            const scored = allMoves.map(m => ({
                m,
                score: (board[m.fromR][m.fromC].king ? 1 : 0)
                     + (m.c > 1 && m.c < 6 ? 0.5 : 0)
                     + Math.random() * 1.5
            }));
            scored.sort((a, b) => b.score - a.score);
            chosen = scored[0].m;
        }
    } else { // hard
        chosen = getBestMove('black', board);
    }

    // Brief visual selection before moving
    selectedCell   = { r: chosen.fromR, c: chosen.fromC };
    highlightMoves = [];
    renderBoard();

    setTimeout(() => {
        selectedCell = null;
        executeMove(chosen.fromR, chosen.fromC, chosen);
    }, 420);
}

function doAIMultiJump(r, c, jumps) {
    if (!gameActive) return;
    const chosen = jumps[Math.floor(Math.random() * jumps.length)];
    setTimeout(() => executeMove(r, c, chosen), 500);
}

function getBestMove(color, b) {
    const { allMoves, allJumps } = getAllMoves(color, b);
    const pool = allJumps.length > 0 ? allJumps : allMoves;

    let best = pool[0], bestScore = -Infinity;
    for (const move of pool) {
        const sim   = simulateMove(b, move.fromR, move.fromC, move);
        const score = evalBoard(sim, color) + Math.random() * 0.1; // tiny noise avoids repetition
        if (score > bestScore) { bestScore = score; best = move; }
    }
    return best;
}

function simulateMove(b, fromR, fromC, move) {
    const nb = b.map(row => row.map(p => p ? { ...p } : null));
    nb[move.r][move.c] = { ...nb[fromR][fromC] };
    nb[fromR][fromC] = null;
    for (const j of move.jumped) nb[j.r][j.c] = null;
    if (nb[move.r][move.c].color === 'black' && move.r === 7) nb[move.r][move.c].king = true;
    if (nb[move.r][move.c].color === 'red'   && move.r === 0) nb[move.r][move.c].king = true;
    return nb;
}

function evalBoard(b, myColor) {
    let score = 0;
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
            const p = b[r][c];
            if (!p) continue;
            const val = p.king ? 3 : 1;
            score += p.color === myColor ? val : -val;
        }
    return score;
}

// =============================================
// GAME LIFECYCLE
// =============================================
function startGame() {
    const mode = document.getElementById('sys-chk-mode').value;

    if (mode !== 'online') {
        if (SystemUI.money < BUY_IN) {
            showToast('Insufficient Funds', `You need $${BUY_IN} to buy in.`);
            return;
        }
        SystemUI.money -= BUY_IN;
        SystemUI.updateMoneyDisplay();
        SystemUI.playSound('chipTable');
    }

    gameActive     = true;
    currentTurn    = 'red';
    multiJumpPiece = null;
    selectedCell   = null;
    highlightMoves = [];

    initBoard();
    forcedJumpers = getForcedJumpers(currentTurn, board);
    renderBoard();

    document.getElementById('start-game-btn').textContent = 'RESET';

    const p1Lbl = document.getElementById('p1-label');
    const p2Lbl = document.getElementById('p2-label');
    if (mode === 'hotseat') { p1Lbl.textContent = 'Red'; p2Lbl.textContent = 'Black'; }
    else if (mode === 'online') { p1Lbl.textContent = myColor === 'red' ? 'You' : 'Them'; p2Lbl.textContent = myColor === 'black' ? 'You' : 'Them'; }
    else { p1Lbl.textContent = 'You'; p2Lbl.textContent = 'AI'; }

    updateStats();
}

function resetGame() {
    gameActive     = false;
    multiJumpPiece = null;
    selectedCell   = null;
    highlightMoves = [];
    forcedJumpers  = [];
    currentTurn    = 'red';

    initBoard();
    renderBoard();

    document.getElementById('turn-banner').classList.add('hidden');
    document.getElementById('start-game-btn').textContent = 'BUY IN ($150)';
    document.getElementById('p1-captured').textContent = '0';
    document.getElementById('p2-captured').textContent = '0';
    document.getElementById('piece-count-display').textContent = '12 vs 12';
}

function endGame(winner) {
    gameActive = false;
    const mode = document.getElementById('sys-chk-mode').value;

    let title = '', msg = '';
    const playerWon = (mode === 'ai' && winner === 'red')
                   || (mode === 'online' && winner === myColor);

    if (mode === 'hotseat') {
        title = winner === 'red' ? '🔴 Red Wins!' : '⚫ Black Wins!';
        msg   = 'All enemy pieces captured.';
        SystemUI.money += BUY_IN;
        SystemUI.updateMoneyDisplay();
        SystemUI.playSound('win');
    } else if (mode === 'online') {
        title = playerWon ? '🏆 You Win!' : '💀 You Lose';
        msg   = playerWon ? `You win $${WIN_PAY}!` : 'Better luck next time.';
        if (playerWon) { SystemUI.money += WIN_PAY; SystemUI.updateMoneyDisplay(); }
        SystemUI.playSound(playerWon ? 'win' : 'lose');
        SystemUI.stopChat();
        chatStarted = false;
    } else {
        title = playerWon ? '🏆 You Win!' : '💀 You Lose';
        msg   = playerWon ? `You win $${WIN_PAY}!` : 'The AI won this round.';
        if (playerWon) { SystemUI.money += WIN_PAY; SystemUI.updateMoneyDisplay(); }
        SystemUI.playSound(playerWon ? 'win' : 'lose');
    }

    showToast(title, msg);
    document.getElementById('start-game-btn').textContent = 'PLAY AGAIN ($150)';
}

// =============================================
// ONLINE MULTIPLAYER
// =============================================
function showLobby() {
    document.getElementById('multiplayer-lobby').classList.remove('hidden');
    wireLobbyButtons();
}

function hideLobby() {
    document.getElementById('multiplayer-lobby').classList.add('hidden');
}

function wireLobbyButtons() {
    // Clone to remove stale listeners
    ['btn-create-room','btn-join-room','btn-cancel-lobby','lobby-close-btn'].forEach(id => {
        const el = document.getElementById(id);
        const clone = el.cloneNode(true);
        el.replaceWith(clone);
    });

    document.getElementById('btn-create-room').addEventListener('click', createRoom);
    document.getElementById('btn-join-room').addEventListener('click', joinRoom);

    function cancelOnline() {
        hideLobby();
        if (roomListener) { roomListener(); roomListener = null; }
        SystemUI.stopChat();
        chatStarted = false;
        document.getElementById('sys-chk-mode').value = 'ai';
        document.getElementById('sys-chk-diff').parentElement.style.display = '';
        resetGame();
    }
    document.getElementById('btn-cancel-lobby').addEventListener('click', cancelOnline);
    document.getElementById('lobby-close-btn').addEventListener('click', cancelOnline);
}

function createRoom() {
    const roomId   = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoomId  = roomId;
    myColor        = 'red';
    isOnline       = true;
    chatStarted    = false;

    window.dbSet(window.dbRef(window.db, `checkers_rooms/${roomId}`), {
        status: 'waiting',
        p1Name: SystemUI.getPlayerName(),
        p2Name: null,
        currentTurn: 'red',
        board: null
    });

    document.getElementById('room-code-display').classList.remove('hidden');
    document.getElementById('host-room-id').textContent = roomId;
    document.getElementById('btn-create-room').disabled = true;

    window.dbOnValue(window.dbRef(window.db, `checkers_rooms/${roomId}/status`), snap => {
        if (snap.val() === 'playing') {
            hideLobby();
            onOnlineStart();
        }
    });
}

function joinRoom() {
    const code  = document.getElementById('join-room-input').value.trim();
    const errEl = document.getElementById('lobby-error-msg');
    errEl.textContent = '';

    if (code.length !== 4) { errEl.textContent = 'Enter a valid 4-digit code.'; return; }

    window.dbGet(window.dbChild(window.dbRef(window.db), `checkers_rooms/${code}`)).then(snap => {
        if (!snap.exists() || snap.val().status !== 'waiting') {
            errEl.textContent = 'Room not found or already full.';
            return;
        }
        currentRoomId = code;
        myColor       = 'black';
        isOnline      = true;
        chatStarted   = false;

        window.dbUpdate(window.dbRef(window.db, `checkers_rooms/${code}`), {
            status: 'playing',
            p2Name: SystemUI.getPlayerName()
        });

        hideLobby();
        onOnlineStart();
    }).catch(() => { errEl.textContent = 'Error joining room.'; });
}

function onOnlineStart() {
    if (myColor === 'red') {
        // Host sets up the initial board
        initBoard();
        currentTurn   = 'red';
        gameActive    = true;
        forcedJumpers = getForcedJumpers(currentTurn, board);
        pushToFirebase();
    }

    document.getElementById('start-game-btn').textContent = 'RESET';

    if (roomListener) roomListener();
    roomListener = window.dbOnValue(window.dbRef(window.db, `checkers_rooms/${currentRoomId}`), snap => {
        const data = snap.val();
        if (!data) return;

        if (data.board) {
            // Firebase returns plain objects, not arrays — must convert back
            board = Array.from({ length: 8 }, (_, r) =>
                Array.from({ length: 8 }, (_, c) => (data.board[r] && data.board[r][c]) ? data.board[r][c] : null)
            );
            currentTurn   = data.currentTurn;
            gameActive    = data.status === 'playing';
            forcedJumpers = getForcedJumpers(currentTurn, board);
            multiJumpPiece = null;
            selectedCell   = null;
            highlightMoves = [];

            if (data.winner) {
                gameActive = false;
                endGame(data.winner);
                return;
            }

            renderBoard();
        }

        // Start chat once both players are in
        if (data.p1Name && data.p2Name && !chatStarted) {
            chatStarted = true;
            SystemUI.playSound('win');
            SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
        }

        const p1L = document.getElementById('p1-label');
        const p2L = document.getElementById('p2-label');
        p1L.textContent = myColor === 'red'   ? 'You' : (data.p1Name || 'Red');
        p2L.textContent = myColor === 'black' ? 'You' : (data.p2Name || 'Black');
    });
}

function pushToFirebase() {
    // Check for win before pushing
    const opponent = currentTurn === 'red' ? 'black' : 'red';
    const { allMoves: m, allJumps: j } = getAllMoves(currentTurn, board);
    const prevPlayerWon = (m.length === 0 && j.length === 0);

    const payload = {
        board:       board,
        currentTurn: currentTurn,
        status:      'playing'
    };

    if (prevPlayerWon) {
        // The player who just moved won
        payload.winner = opponent === 'red' ? 'black' : 'red'; // flipped — endTurn already switched
    }

    window.dbUpdate(window.dbRef(window.db, `checkers_rooms/${currentRoomId}`), payload);
}

// =============================================
// TOAST
// =============================================
function showToast(title, msg) {
    document.getElementById('modal-title').textContent   = title;
    document.getElementById('modal-message').textContent = msg;
    document.getElementById('toast-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('toast-modal').classList.add('hidden'), 3500);
}

// =============================================
// BUTTON EVENTS
// =============================================
document.getElementById('start-game-btn').addEventListener('click', () => {
    const mode = document.getElementById('sys-chk-mode').value;
    if (mode === 'online') { showLobby(); return; }
    if (gameActive) resetGame();
    else startGame();
});

document.getElementById('toast-modal').addEventListener('click', () => {
    document.getElementById('toast-modal').classList.add('hidden');
});

document.getElementById('sys-reset-game-btn').addEventListener('click', () => {
    SystemUI.money = 5000;
    localStorage.removeItem('blackjack_money');
    SystemUI.updateMoneyDisplay();
    resetGame();
    document.getElementById('sys-modal').classList.add('sys-hidden');
});

// Hide AI diff dropdown when not in AI mode
document.getElementById('sys-chk-diff').parentElement.style.display = '';

// Initial board render (pre-game)
initBoard();
renderBoard();