// =============================================
// CHECKERS — checkers_app.js (V2 Engine + Upgraded AI)
// =============================================

const BUY_IN  = 150;
const WIN_PAY = 300;

// --- Game State ---
let gameActive = false;
let board      = []; 
let currentTurn   = 'red';   
let selectedCell  = null;    
let highlightMoves = [];     
let forcedJumpers  = [];     
let multiJumpPiece = null;   

// --- Animation / Drag State ---
let animating    = false;
let dragSrc      = null;
let isDragging   = false;
let lastMoveFrom = null;
let lastMoveTo   = null;
let jumpWarnTimer = null;

// --- Online (V2 Drop-In) ---
let isOnline      = false;
let myColor       = null;
let currentRoomId = null;
let roomListener  = null;
let chatStarted   = false;
let seats         = []; 
let myId          = 1; 
let isHost        = true; 

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
        SystemUI.v2Lobby.show();
    } else {
        SystemUI.stopChat();
        chatStarted = false;
        SystemUI.v2Lobby.hide();
        // Tear down hosted room / joined seat so it can't ghost in Firebase
        if (window.SystemMatch) SystemMatch.cleanup();
        myId = 1;
        isHost = true;
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
    for (let r = 0; r < 3; r++)
        for (let c = 0; c < 8; c++)
            if ((r + c) % 2 === 1) board[r][c] = { color: 'black', king: false };
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

    const mode = document.getElementById('sys-chk-mode').value;
    const isMyTurn = !animating && gameActive && (
        (mode === 'ai'      && currentTurn === 'red') ||
        (mode === 'hotseat') ||
        (mode === 'online'  && currentTurn === myColor)
    );

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const isDark = (r + c) % 2 === 1;
            const sq = document.createElement('div');
            sq.className = `sq ${isDark ? 'dark' : 'light'}`;
            sq.dataset.r = r;
            sq.dataset.c = c;

            if (isDark) {
                sq.addEventListener('dragstart', e => e.preventDefault());

                const isSelected     = selectedCell && selectedCell.r === r && selectedCell.c === c;
                const moveTarget     = highlightMoves.find(m => m.r === r && m.c === c);
                const isMoveTarget   = !!moveTarget;
                const isCapTarget    = isMoveTarget && moveTarget.jumped && moveTarget.jumped.length > 0;
                const isForcedJumper = !selectedCell && forcedJumpers.some(p => p.r === r && p.c === c);
                const isLastFrom     = lastMoveFrom && lastMoveFrom.r === r && lastMoveFrom.c === c;
                const isLastTo       = lastMoveTo   && lastMoveTo.r   === r && lastMoveTo.c   === c;

                if (isSelected)   sq.classList.add('selected');
                if (isCapTarget)  sq.classList.add('cap-ring');
                if (isMoveTarget && !isSelected) sq.classList.add('can-move');
                if (isForcedJumper) sq.classList.add('must-jump');
                if (isLastFrom && !isSelected && !isMoveTarget) sq.classList.add('last-from');
                if (isLastTo   && !isSelected && !isMoveTarget) sq.classList.add('last-to');

                if (isMoveTarget && !board[r][c]) {
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
                    img.src = piece.color === 'red'
                        ? '../../system/images/pieces/red/token_circle_3d_red.png'
                        : '../../system/images/pieces/black/token_circle_3d_black.png';
                    img.alt = piece.color;
                    img.draggable = false;
                    pieceEl.appendChild(img);
                    sq.appendChild(pieceEl);

                    if (isMyTurn && piece.color === currentTurn) {
                        sq.classList.add('draggable');
                        sq.addEventListener('mousedown', e => {
                            if (e.button !== 0 || animating) return;
                            onSquareClick(r, c);
                            if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
                                dragSrc = { r, c };
                            }
                        });
                        sq.addEventListener('touchstart', e => {
                            if (animating) return;
                            e.preventDefault();
                            onSquareClick(r, c);
                            if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
                                dragSrc = { r, c };
                            }
                        }, { passive: false });
                    }
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
    banner.style.color = '';
    banner.classList.remove('hidden');
}

// =============================================
// JUMP WARNING
// =============================================
function showJumpWarning() {
    const banner = document.getElementById('turn-banner');
    banner.textContent = '⚠ A JUMP IS AVAILABLE — MUST JUMP!';
    banner.style.color = '#e87070';
    banner.classList.remove('hidden');
    clearTimeout(jumpWarnTimer);
    jumpWarnTimer = setTimeout(() => {
        banner.style.color = '';
        updateStats();
    }, 1800);
    renderBoard();
    SystemUI.playSound('click');
}

// =============================================
// MOVE LOGIC
// =============================================
function getMovesForPiece(r, c, b) {
    const piece = b[r][c];
    if (!piece) return { moves: [], jumps: [] };

    const dirs = [];
    if (piece.color === 'red'   || piece.king) dirs.push([-1, -1], [-1, 1]); 
    if (piece.color === 'black' || piece.king) dirs.push([ 1, -1], [ 1, 1]); 

    const moves = [], jumps = [];
    for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > 7 || nc < 0 || nr > 7 || nc > 7) continue;

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
    if (!gameActive || animating) return;

    const mode = document.getElementById('sys-chk-mode').value;
    if (mode === 'online'  && currentTurn !== myColor)  return;
    if (mode === 'ai'      && currentTurn !== 'red')    return;

    const piece = board[r][c];

    if (multiJumpPiece) {
        const target = highlightMoves.find(m => m.r === r && m.c === c);
        if (target) doMove(multiJumpPiece.r, multiJumpPiece.c, target);
        return;
    }

    if (selectedCell) {
        const target = highlightMoves.find(m => m.r === r && m.c === c);
        if (target) { doMove(selectedCell.r, selectedCell.c, target); return; }
    }

    if (piece && piece.color === currentTurn) {
        if (forcedJumpers.length > 0 && !forcedJumpers.some(p => p.r === r && p.c === c)) {
            showJumpWarning();
            return;
        }

        selectedCell = { r, c };
        const { moves, jumps } = getMovesForPiece(r, c, board);
        highlightMoves = forcedJumpers.length > 0 ? jumps : [...jumps, ...moves];
        renderBoard();
        return;
    }

    selectedCell = null;
    highlightMoves = [];
    renderBoard();
}

// =============================================
// ANIMATION + MOVE WRAPPER
// =============================================
function doMove(fromR, fromC, move) {
    const piece = board[fromR][fromC];
    if (!piece) { executeMove(fromR, fromC, move); return; }

    const imgSrc = piece.color === 'red'
        ? '../../system/images/pieces/red/pieceRed_border12.png'
        : '../../system/images/pieces/black/pieceBlack_border12.png';

    selectedCell   = null;
    highlightMoves = [];
    dragSrc        = null;
    renderBoard();

    animatePiece(fromR, fromC, move.r, move.c, imgSrc, piece.king, () => {
        animating = false;
        executeMove(fromR, fromC, move);
    });
}

function animatePiece(fromR, fromC, toR, toC, imgSrc, isKing, callback) {
    animating = true;
    const boardEl = document.getElementById('checkers-board');
    const fromEl  = boardEl.children[fromR * 8 + fromC];
    const toEl    = boardEl.children[toR   * 8 + toC];

    if (!fromEl || !toEl) { animating = false; callback(); return; }

    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    const pieceW = fr.width * 0.82;
    const pieceH = fr.height * 0.82;
    const offX   = (fr.width  - pieceW) / 2;
    const offY   = (fr.height - pieceH) / 2;

    const srcPiece = fromEl.querySelector('.piece');
    if (srcPiece) srcPiece.style.opacity = '0';

    const ghost = document.createElement('div');
    ghost.className = 'piece-ghost' + (isKing ? ' king' : '');
    const img = document.createElement('img');
    img.src = imgSrc;
    ghost.appendChild(img);
    ghost.style.cssText = `
        left: ${fr.left + offX}px;
        top:  ${fr.top  + offY}px;
        width:  ${pieceW}px;
        height: ${pieceH}px;
    `;
    document.body.appendChild(ghost);

    requestAnimationFrame(() => requestAnimationFrame(() => {
        const destOffX = (tr.width  - pieceW) / 2;
        const destOffY = (tr.height - pieceH) / 2;
        ghost.style.left = (tr.left + destOffX) + 'px';
        ghost.style.top  = (tr.top  + destOffY) + 'px';
    }));

    setTimeout(() => {
        ghost.remove();
        if (srcPiece) srcPiece.style.opacity = '';
        callback();
    }, 210);
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

    lastMoveFrom = { r: fromR, c: fromC };
    lastMoveTo   = { r: move.r, c: move.c };

    const becameKing = !piece.king && (
        (piece.color === 'red'   && move.r === 0) ||
        (piece.color === 'black' && move.r === 7)
    );
    if (becameKing) {
        board[move.r][move.c].king = true;
        SystemUI.playSound('chipTable');
    }

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
            if (mode === 'online') pushToFirebase();
            return;
        }
    }

    endTurn();
}

function endTurn() {
    multiJumpPiece = null;
    selectedCell   = null;
    highlightMoves = [];

    const opponent = currentTurn === 'red' ? 'black' : 'red';
    const { allMoves: oppM, allJumps: oppJ } = getAllMoves(opponent, board);

    if (oppM.length === 0 && oppJ.length === 0) {
        renderBoard();
        endGame(currentTurn);
        // Push the winner explicitly so the other client learns the game ended.
        if (document.getElementById('sys-chk-mode').value === 'online') pushToFirebase(currentTurn);
        return;
    }

    currentTurn   = opponent;
    forcedJumpers = getForcedJumpers(currentTurn, board);

    const mode = document.getElementById('sys-chk-mode').value;
    if (mode === 'online') {
        pushToFirebase();
        
        if (isHost && gameActive) {
            const currentSeatIdx = currentTurn === 'red' ? 0 : 1;
            if (seats[currentSeatIdx] && seats[currentSeatIdx].type === 'ai') {
                setTimeout(doAITurn, 750);
            }
        }
    } else {
        renderBoard();
        if (mode === 'ai' && currentTurn === 'black') setTimeout(doAITurn, 750);
    }
}

// =============================================
// AI (Upgraded Brain: Minimax with Alpha-Beta)
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
        // Normal uses Depth 3
        chosen = minimaxSearch(board, 3, 'black');
    } else { 
        // Hard uses Depth 6
        chosen = minimaxSearch(board, 6, 'black');
    }

    selectedCell   = { r: chosen.fromR, c: chosen.fromC };
    highlightMoves = [];
    renderBoard();

    setTimeout(() => {
        doMove(chosen.fromR, chosen.fromC, chosen);
    }, 420);
}

function minimaxSearch(currentBoard, depth, color) {
    const { allMoves, allJumps } = getAllMoves(color, currentBoard);
    const pool = allJumps.length > 0 ? allJumps : allMoves;
    if (pool.length === 1) return pool[0];

    let bestMove = pool[0];
    let bestValue = -Infinity;

    for (const move of pool) {
        const nextBoard = simulateMove(currentBoard, move.fromR, move.fromC, move);
        const val = minimax(nextBoard, depth - 1, -Infinity, Infinity, false, 'red');
        if (val > bestValue) {
            bestValue = val;
            bestMove = move;
        }
    }
    return bestMove;
}

function minimax(b, depth, alpha, beta, isMaximizing, turnColor) {
    const { allMoves, allJumps } = getAllMoves(turnColor, b);
    const pool = allJumps.length > 0 ? allJumps : allMoves;

    if (depth === 0 || pool.length === 0) {
        return evalBoard(b, 'black'); // Evaluate from AI perspective
    }

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const m of pool) {
            const nextB = simulateMove(b, m.fromR, m.fromC, m);
            const ev = minimax(nextB, depth - 1, alpha, beta, false, 'red');
            maxEval = Math.max(maxEval, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const m of pool) {
            const nextB = simulateMove(b, m.fromR, m.fromC, m);
            const ev = minimax(nextB, depth - 1, alpha, beta, true, 'black');
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function doAIMultiJump(r, c, jumps) {
    if (!gameActive) return;
    const chosen = jumps[Math.floor(Math.random() * jumps.length)];
    setTimeout(() => doMove(r, c, chosen), 500);
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

function evalBoard(b, aiColor) {
    let score = 0;
    const oppColor = aiColor === 'black' ? 'red' : 'black';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = b[r][c];
            if (!p) continue;

            let val = p.king ? 50 : 10;
            
            // Positional bonus (encourage center control)
            if (r > 1 && r < 6 && c > 1 && c < 6) val += 2;

            if (p.color === aiColor) score += val;
            else score -= val;
        }
    }
    return score + Math.random(); // Add tiny jitter
}

// =============================================
// GLOBAL DRAG LISTENERS
// =============================================
document.addEventListener('mousemove', () => {
    if (dragSrc) isDragging = true;
});

document.addEventListener('mouseup', e => {
    if (!dragSrc) return;
    const wasDragging = isDragging;
    isDragging = false;
    if (!wasDragging) { dragSrc = null; return; }

    const dropEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-r]');
    if (dropEl) {
        const dr = parseInt(dropEl.dataset.r);
        const dc = parseInt(dropEl.dataset.c);
        if (!isNaN(dr) && !isNaN(dc)) {
            const src = multiJumpPiece || selectedCell;
            if (src) {
                const target = highlightMoves.find(m => m.r === dr && m.c === dc);
                if (target) { doMove(src.r, src.c, target); dragSrc = null; return; }
            }
        }
    }
    dragSrc = null;
});

document.addEventListener('touchmove', () => {
    if (dragSrc) isDragging = true;
}, { passive: true });

document.addEventListener('touchend', e => {
    if (!dragSrc) return;
    const wasDragging = isDragging;
    isDragging = false;
    if (!wasDragging) { dragSrc = null; return; }

    const touch  = e.changedTouches[0];
    const dropEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-r]');
    if (dropEl) {
        const dr = parseInt(dropEl.dataset.r);
        const dc = parseInt(dropEl.dataset.c);
        if (!isNaN(dr) && !isNaN(dc)) {
            const src = multiJumpPiece || selectedCell;
            if (src) {
                const target = highlightMoves.find(m => m.r === dr && m.c === dc);
                if (target) { doMove(src.r, src.c, target); dragSrc = null; return; }
            }
        }
    }
    dragSrc = null;
});

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
        
        // AUDIT: Safely track play count via OS 2.0
        if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart("checkers");
    }

    gameActive     = true;
    currentTurn    = 'red';
    multiJumpPiece = null;
    selectedCell   = null;
    highlightMoves = [];
    lastMoveFrom   = null;
    lastMoveTo     = null;

    initBoard();
    forcedJumpers = getForcedJumpers(currentTurn, board);
    renderBoard();

    document.getElementById('start-game-btn').textContent = 'RESET';

    const p1Lbl = document.getElementById('p1-label');
    const p2Lbl = document.getElementById('p2-label');
    if (mode === 'hotseat') { p1Lbl.textContent = 'Red'; p2Lbl.textContent = 'Black'; }
    else if (mode === 'online') { p1Lbl.textContent = seats[0] ? seats[0].name : 'Red'; p2Lbl.textContent = seats[1] ? seats[1].name : 'Black'; }
    else { p1Lbl.textContent = 'You'; p2Lbl.textContent = 'AI'; }

    updateStats();
}

function resetGame() {
    gameActive     = false;
    animating      = false;
    multiJumpPiece = null;
    selectedCell   = null;
    highlightMoves = [];
    forcedJumpers  = [];
    currentTurn    = 'red';
    lastMoveFrom   = null;
    lastMoveTo     = null;
    dragSrc        = null;
    isDragging     = false;

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
        
        // AUDIT: Safely track online wins/losses
        if (typeof SystemStats !== 'undefined') {
            if (playerWon) SystemStats.recordWin("checkers", WIN_PAY);
            else SystemStats.recordLoss("checkers");
        }
    } else {
        title = playerWon ? '🏆 You Win!' : '💀 You Lose';
        msg   = playerWon ? `You win $${WIN_PAY}!` : 'The AI won this round.';
        if (playerWon) { SystemUI.money += WIN_PAY; SystemUI.updateMoneyDisplay(); }
        SystemUI.playSound(playerWon ? 'win' : 'lose');
        
        // AUDIT: Safely track AI wins/losses
        if (typeof SystemStats !== 'undefined') {
            if (playerWon) SystemStats.recordWin("checkers", WIN_PAY);
            else SystemStats.recordLoss("checkers");
        }
    }

    showToast(title, msg);
    
    if (mode === 'online' && myId === 2) {
        document.getElementById('start-game-btn').textContent = 'WAITING FOR HOST';
    } else {
        document.getElementById('start-game-btn').textContent = 'PLAY AGAIN ($150)';
    }
}

// =============================================
// ONLINE MULTIPLAYER (V2)
// =============================================

SystemMatch.setup({
    gameId:   "checkers",
    roomPath: "checkers_rooms",
    autoShow: false,
    buildSeats: () => {
        const diff = document.getElementById('sys-chk-diff').value;
        return [
            { type: "human", name: SystemUI.getPlayerName() },
            { type: "ai",    name: "AI (" + diff + ")" }
        ];
    },
    extraRoomFields: () => ({
        currentTurn: "red",
        board: null
    }),
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1; myColor = "red"; chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; myId = 2; myColor = "black"; chatStarted = false;
        seats = SystemMatch.getSeats();
        listenToRoom();
    },
    onLeave: () => {
        gameMode = "ai";
        document.getElementById("sys-chk-mode").value = "ai";
        document.getElementById('sys-chk-diff').parentElement.style.display = '';
        localStorage.setItem("chess_mode", "ai");
        myId = 1;
        isHost = true;
        chatStarted = false;
        if (roomListener) { roomListener(); roomListener = null; }
        resetGame();
    },
    onStart: () => {
        initBoard();
        currentTurn   = 'red';
        gameActive    = true;
        forcedJumpers = getForcedJumpers(currentTurn, board);

        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'checkers_rooms/' + currentRoomId), {
                status: "playing",
                board: board,
                currentTurn: currentTurn
            });
        }
    },
    onClose: () => {
        if (gameMode === "online" && !gameActive) {
            gameMode = "ai";
            document.getElementById("sys-chk-mode").value = "ai";
            document.getElementById('sys-chk-diff').parentElement.style.display = '';
            myId = 1;
            isHost = true;
            if (roomListener) { roomListener(); roomListener = null; }
            resetGame();
        }
    }
});

function listenToRoom() {
    let onlineGameStarted = false;
    
    if (roomListener) roomListener();
    roomListener = window.dbOnValue(window.dbRef(window.db, `checkers_rooms/${currentRoomId}`), snap => {
        const data = snap.val();
        if (!data) {
            // Host deleted the room — free the joiner instead of freezing.
            if (!isHost && document.getElementById('sys-chk-mode').value === 'online') {
                if (roomListener) { roomListener(); roomListener = null; }
                SystemMatch.setSeats([]); // room is gone — skip the ghost seat write
                SystemMatch.cleanup();
                chatStarted = false;
                SystemUI.v2Lobby.hide();
                showToast('Host Left', 'The host left the game. Returning to AI mode.');
                document.getElementById('sys-chk-mode').value = 'ai';
                document.getElementById('sys-chk-diff').parentElement.style.display = '';
                myId = 1;
                isHost = true;
                myColor = null;
                resetGame();
            }
            return;
        }

        seats = data.seats || [];
        SystemUI.v2Lobby.renderSeats(seats);

        if (data.status === 'playing' && !onlineGameStarted) {
            onlineGameStarted = true;
            SystemUI.v2Lobby.hide();
            if (!chatStarted) {
                chatStarted = true;
                SystemUI.playSound('win');
                SystemUI.startChat(currentRoomId, SystemUI.getPlayerName());
            }
        }
        
        if (data.status === 'playing' && data.board) {
            board = Array.from({ length: 8 }, (_, r) =>
                Array.from({ length: 8 }, (_, c) => (data.board[r] && data.board[r][c]) ? data.board[r][c] : null)
            );
            currentTurn   = data.currentTurn;
            multiJumpPiece = null;
            selectedCell   = null;
            highlightMoves = [];

            if (data.winner) {
                renderBoard();
                // Announce/record once per client — the mover already ran
                // endGame locally, so only end a still-active game here.
                if (gameActive) {
                    gameActive = false;
                    endGame(data.winner);
                }
                return;
            }

            gameActive    = true;
            forcedJumpers = getForcedJumpers(currentTurn, board);

            const p1L = document.getElementById('p1-label');
            const p2L = document.getElementById('p2-label');
            p1L.textContent = myColor === 'red'   ? 'You' : (seats[0] ? seats[0].name : 'Red');
            p2L.textContent = myColor === 'black' ? 'You' : (seats[1] ? seats[1].name : 'Black');

            renderBoard();
            
            if (isHost) {
                const currentSeatIdx = currentTurn === 'red' ? 0 : 1;
                if (seats[currentSeatIdx] && seats[currentSeatIdx].type === "ai" && !animating) {
                    setTimeout(doAITurn, 750);
                }
            }
        }
    });
}

// The winner (a color) is passed explicitly from the win branch of endTurn —
// recomputing it here after the turn flip gave the wrong answer and never fired.
function pushToFirebase(winner) {
    const payload = {
        board:       board,
        currentTurn: currentTurn,
        status:      'playing',
        seats:       seats,
        winner:      winner || null
    };

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
    
    if (mode === 'online') { 
        if (myId === 2) return; 
        
        initBoard();
        currentTurn   = 'red';
        gameActive    = true;
        forcedJumpers = getForcedJumpers(currentTurn, board);
        pushToFirebase();
        return; 
    }
    
    if (gameActive) resetGame();
    else startGame();
});

document.getElementById('toast-modal').addEventListener('click', () => {
    document.getElementById('toast-modal').classList.add('hidden');
});

document.getElementById('sys-reset-game-btn').addEventListener('click', () => {
    if (window.SystemProfile && typeof window.SystemProfile.setMoney === 'function') {
        window.SystemProfile.setMoney(5000);
    } else {
        SystemUI.money = 5000;
    }
    SystemUI.updateMoneyDisplay();
    resetGame();
    document.getElementById('sys-modal').classList.add('sys-hidden');
});

initBoard();
renderBoard();