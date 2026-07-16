// =============================================
// 8-BALL POOL — pool_app.js
// The Game Shack | Casino OS
// =============================================
'use strict';

// ── CONSTANTS ─────────────────────────────────
const BALL_R     = PoolPhysics.BALL_R;
const MAX_PULL   = 130;     // px — drag distance for full power
const MAX_POWER  = 38;      // px/frame initial cue speed at full pull
const MIN_POWER  = 2.5;
const RAIL_W     = 30;
const POCKET_R_CORNER = 19;
const POCKET_R_SIDE   = 16;

const BALL_CFG = {
    0:  { fill: '#f6f6f6', type: 'cue'    },
    1:  { fill: '#f5c518', type: 'solid'  },
    2:  { fill: '#1a5fb4', type: 'solid'  },
    3:  { fill: '#e74c3c', type: 'solid'  },
    4:  { fill: '#7c3fbd', type: 'solid'  },
    5:  { fill: '#e67e22', type: 'solid'  },
    6:  { fill: '#1a8a3a', type: 'solid'  },
    7:  { fill: '#8b1a1a', type: 'solid'  },
    8:  { fill: '#1a1a1a', type: 'eight'  },
    9:  { fill: '#f5c518', type: 'stripe' },
    10: { fill: '#1a5fb4', type: 'stripe' },
    11: { fill: '#e74c3c', type: 'stripe' },
    12: { fill: '#7c3fbd', type: 'stripe' },
    13: { fill: '#e67e22', type: 'stripe' },
    14: { fill: '#1a8a3a', type: 'stripe' },
    15: { fill: '#8b1a1a', type: 'stripe' }
};

// ── GAME STATE ────────────────────────────────
let gameMode    = 'ai';
let aiDifficulty = localStorage.getItem('pool_diff') || 'normal';
let myId        = 1;
let isHost      = true;
let currentRoomId  = null;
let roomListener   = null;
let chatStarted    = false;
let lastActionTs   = 0;
let lastSyncTime   = 0;
let lastRematchTs  = 0;
let pendingGameState = null;
let sessionScore   = [0, 0];
let playerNames    = ['', ''];

// ── VIRTUAL COORDINATES ───────────────────────
// All physics and every coordinate that crosses the wire live in a FIXED
// virtual space, letterbox-scaled to each client's canvas. Previously the
// table was sized from the local window, so two players with different
// screens simulated different tables and every shot desynced.
const VW = 1100, VH = 600;

let canvas, ctx, spinCanvas, spinCtx;
let W = VW, H = VH;
let viewScale = 1, viewOffX = 0, viewOffY = 0, viewDpr = 1;
let table = { x: 0, y: 0, w: 0, h: 0 };
let pockets = [];
let headStringX = 0;   // x-coord of the kitchen line

// Monotonic ordering for state pushes (wall clocks differ between machines
// and silently dropped the other player's moves).
let stateSeq = 0;
let pendingAction = null;   // remote shot deferred while our sim is running
let remoteAim = null;       // opponent's live aim {angle, pull, ts}
let lastAimPush = 0;

let balls = [];
let gamePhase   = 'idle';   // idle | break | playing | shooting | ball_in_hand | ai_thinking | ended | awaiting_host
let activeTurn  = 0;
let assignment  = [null, null];
let firstContact = null;
let foulThisTurn = false;
let railHitThisTurn = false;     // for break: requires 4 balls hit rail OR a pot
let pottedThisTurn = [];
let cueBallPottedThisTurn = false;
let kitchenRestricted = false;   // true = ball-in-hand only behind head string (post-break scratch)
let isBreakShot = true;          // true on the very first shot of a new rack
let ballInHandPos = null;
let lastTime = 0;
let spinApplied = false;
let lastFoulMsg = '';
let lastFoulMsgUntil = 0;

// ── AIM / SHOT STATE ──────────────────────────
let aimAngle   = 0;
let isDragging = false;
let dragStart  = null;
let dragLast   = null;
let shotPower  = 0;
let spinTop    = 0;
let spinSide   = 0;
let spinDragging = false;

// Track AI cue motion for drawing during the "thinking" phase
let aiAimPullback = 0;

// ── SYSTEM UI ─────────────────────────────────
SystemUI.init({
    gameName: '8-BALL POOL',
    rules: 'Drag the cue back to set power, release to shoot. Use the spin pad to add english (top/back/side spin). Pot all your balls (solids 1–7 or stripes 9–15) then legally pot the 8-ball to win. Scratching or hitting the wrong ball gives ball-in-hand to your opponent — potting the 8-ball early loses the game.',
    hudDropdowns: [
        { id: 'pool-mode', options: [{ value: 'ai', label: '🤖 vs AI' }, { value: 'online', label: '🌐 Online' }] },
        { id: 'pool-diff', label: 'AI', options: [{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }] }
    ]
});

const checkDB = setInterval(() => {
    if (window.poolFirebaseReady || window.db) { clearInterval(checkDB); initPool(); }
}, 50);

// ── INIT ──────────────────────────────────────
function initPool() {
    canvas    = document.getElementById('pool-canvas');
    ctx       = canvas.getContext('2d');
    spinCanvas = document.getElementById('spin-canvas');
    spinCtx   = spinCanvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const modeEl = document.getElementById('pool-mode');
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener('change', e => {
            gameMode = e.target.value;
            if (gameMode === 'online') {
                document.getElementById('action-zone').classList.add('hidden');
                SystemUI.v2Lobby.show();
            } else {
                document.getElementById('action-zone').classList.remove('hidden');
                SystemUI.v2Lobby.hide();
                if (roomListener) { roomListener(); roomListener = null; }
                SystemUI.stopChat(); chatStarted = false;
                myId = 1; isHost = true;
                resetGame();
                setPhase('break');
            }
        });
    }

    const diffEl = document.getElementById('pool-diff');
    if (diffEl) {
        diffEl.value = aiDifficulty;
        diffEl.addEventListener('change', e => {
            aiDifficulty = e.target.value;
            localStorage.setItem('pool_diff', aiDifficulty);
        });
    }

    canvas.addEventListener('mousedown',  onCanvasDown);
    canvas.addEventListener('mousemove',  onCanvasMove);
    canvas.addEventListener('mouseup',    onCanvasUp);
    canvas.addEventListener('mouseleave', () => { isDragging = false; shotPower = 0; updatePowerBar(0); });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onCanvasDown(e); }, { passive: false });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); onCanvasMove(e); }, { passive: false });
    canvas.addEventListener('touchend',   e => { e.preventDefault(); onTouchEnd(e); },   { passive: false });

    spinCanvas.addEventListener('mousedown',  onSpinDown);
    spinCanvas.addEventListener('mousemove',  onSpinMove);
    spinCanvas.addEventListener('mouseup',    () => { spinDragging = false; });
    spinCanvas.addEventListener('mouseleave', () => { spinDragging = false; });
    spinCanvas.addEventListener('touchstart', e => { e.preventDefault(); onSpinDown(e); }, { passive: false });
    spinCanvas.addEventListener('touchmove',  e => { e.preventDefault(); onSpinMove(e); }, { passive: false });
    spinCanvas.addEventListener('touchend',   () => { spinDragging = false; });

    // Double-click spin = reset to center
    spinCanvas.addEventListener('dblclick', () => {
        spinTop = 0; spinSide = 0; drawSpinControl();
    });

    document.getElementById('play-again-btn').addEventListener('click', () => {
        document.getElementById('result-modal').classList.add('hidden');
        if (gameMode === 'online') {
            if (isHost && currentRoomId) {
                startNewRack();
            } else {
                // Joiner: ask host for a rematch
                window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
                    rematchRequest: Date.now()
                });
                setTurnMsg('Waiting for opponent…');
            }
        } else {
            resetGame();
            setPhase('break');
        }
    });

    resetGame();
    setPhase('break');
    requestAnimationFrame(gameLoop);
}

// ── RESIZE / LAYOUT ───────────────────────────
// Table geometry is FIXED in virtual space — identical on every client.
function computeTableLayout() {
    const maxW = VW - 16;
    const maxH = VH - 12;
    let tw = maxW - RAIL_W * 2;
    let th = tw / 2;
    if (th > maxH - RAIL_W * 2) { th = maxH - RAIL_W * 2; tw = th * 2; }
    tw = Math.floor(tw); th = Math.floor(th);
    const tx = Math.floor((VW - tw - RAIL_W * 2) / 2) + RAIL_W;
    const ty = Math.floor((VH - th - RAIL_W * 2) / 2) + RAIL_W;

    table = { x: tx, y: ty, w: tw, h: th };
    headStringX = tx + tw * 0.25;

    // Pockets — corners use slightly inset capture point so a ball must enter the throat
    const CI = 8;
    pockets = [
        { x: tx + CI,        y: ty + CI,        r: POCKET_R_CORNER, kind: 'TL' },
        { x: tx + tw - CI,   y: ty + CI,        r: POCKET_R_CORNER, kind: 'TR' },
        { x: tx + CI,        y: ty + th - CI,   r: POCKET_R_CORNER, kind: 'BL' },
        { x: tx + tw - CI,   y: ty + th - CI,   r: POCKET_R_CORNER, kind: 'BR' },
        { x: tx + tw / 2,    y: ty,             r: POCKET_R_SIDE,   kind: 'TM' },
        { x: tx + tw / 2,    y: ty + th,        r: POCKET_R_SIDE,   kind: 'BM' }
    ];
}
computeTableLayout();

function resizeCanvas() {
    const outer = document.getElementById('game-outer');
    const action = document.getElementById('action-zone');
    const cssW = outer.clientWidth;
    const cssH = outer.clientHeight - (action ? action.offsetHeight : 0);

    viewDpr = window.devicePixelRatio || 1;
    canvas.width  = cssW * viewDpr;
    canvas.height = cssH * viewDpr;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    viewScale = Math.min(cssW / VW, cssH / VH);
    viewOffX  = (cssW - VW * viewScale) / 2;
    viewOffY  = (cssH - VH * viewScale) / 2;
}

// ── BALL SETUP ────────────────────────────────
function buildRack() {
    balls = [];
    for (let i = 0; i <= 15; i++) balls.push(PoolPhysics.makeBall(i, 0, 0));

    // Cue ball on the head spot
    balls[0].x = table.x + table.w * 0.20;
    balls[0].y = table.y + table.h / 2;

    // Standard 8-ball rack: 8 in center (row 2 col 1), corners must be one solid + one stripe.
    // Tightly-packed triangle apex on the foot spot (right ¾).
    const rx = table.x + table.w * 0.72;
    const ry = table.y + table.h / 2;
    const sp = BALL_R * 2 + 0.4;

    const rackIds = [
        1,                  // apex
        9,  2,              // row 2
        3,  8, 10,          // row 3 (8 in center)
        4, 14,  7, 11,      // row 4
        12,  6, 15, 13,  5  // row 5 (back row)
    ];
    let ri = 0;
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col <= row; col++) {
            balls[rackIds[ri]].x = rx + row * sp * 0.866;
            balls[rackIds[ri]].y = ry + (col - row / 2) * sp;
            ri++;
        }
    }
}

function resetGame() {
    activeTurn  = 0;
    assignment  = [null, null];
    firstContact = null;
    foulThisTurn = false;
    railHitThisTurn = false;
    pottedThisTurn = [];
    cueBallPottedThisTurn = false;
    kitchenRestricted = false;
    isBreakShot = true;
    ballInHandPos = null;
    spinApplied = false;
    isDragging = false;
    shotPower  = 0;
    spinTop    = 0;
    spinSide   = 0;
    lastTime   = 0;

    buildRack();
    updateUI();
    drawSpinControl();
    updatePowerBar(0);
}

// ── PHASE MANAGEMENT ──────────────────────────
function setPhase(phase) {
    gamePhase = phase;
    updateUI();
    refreshTurnMsg();
}

function refreshTurnMsg() {
    if (lastFoulMsgUntil > performance.now()) return;     // hold foul message briefly
    if (gamePhase === 'break') {
        setTurnMsg(isMyTurn() ? '🎱 BREAK SHOT — drag cue to shoot' : `${getPlayerName(activeTurn)} is breaking…`);
    } else if (gamePhase === 'playing') {
        setTurnMsg(isMyTurn() ? '🏹 YOUR TURN' : `${getPlayerName(activeTurn)}'s turn…`);
    } else if (gamePhase === 'ball_in_hand') {
        const where = kitchenRestricted ? ' (behind head string)' : '';
        setTurnMsg(isMyTurn() ? `✋ BALL IN HAND${where} — click to place` : `${getPlayerName(activeTurn)}'s ball in hand…`);
    } else if (gamePhase === 'ai_thinking') {
        setTurnMsg('🤖 AI is thinking…');
    } else if (gamePhase === 'shooting') {
        setTurnMsg('');
    } else if (gamePhase === 'awaiting_host') {
        setTurnMsg('Syncing…');
    }
}

function isMyTurn() {
    if (gameMode === 'ai') return activeTurn === 0;
    return activeTurn === myId - 1;
}

function canAim() {
    if (gamePhase !== 'playing' && gamePhase !== 'break') return false;
    if (!isMyTurn()) return false;
    if (!PoolPhysics.isSettled(balls)) return false;
    return true;
}

function getPlayerName(idx) {
    if (gameMode === 'ai') return idx === 0 ? (SystemUI.getPlayerName ? SystemUI.getPlayerName() : 'You') : '🤖 AI';
    return playerNames[idx] || (idx === 0 ? 'P1' : 'P2');
}

function getCueBall() { return balls[0]; }

// ── INPUT ─────────────────────────────────────
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    // Map CSS pixels into the fixed virtual table space
    return {
        x: (src.clientX - rect.left - viewOffX) / viewScale,
        y: (src.clientY - rect.top  - viewOffY) / viewScale
    };
}

function onCanvasDown(e) {
    const pos = getCanvasPos(e);
    const cb  = getCueBall();

    if (gamePhase === 'ball_in_hand' && isMyTurn()) {
        if (isValidCueBallPos(pos.x, pos.y)) {
            cb.x = pos.x; cb.y = pos.y;
            cb.pocketed = false; cb.scale = 1;
            kitchenRestricted = false;
            setPhase('playing');
            if (gameMode === 'online') sendBallInHand(pos.x, pos.y);
        }
        return;
    }

    if (!canAim()) return;

    // Aim toward press point
    aimAngle   = Math.atan2(pos.y - cb.y, pos.x - cb.x);
    isDragging = true;
    dragStart  = pos;
    dragLast   = pos;
    shotPower  = 0;
    updatePowerBar(0);
}

function onCanvasMove(e) {
    const pos = getCanvasPos(e);
    const cb  = getCueBall();

    if (gamePhase === 'ball_in_hand' && isMyTurn()) {
        ballInHandPos = isValidCueBallPos(pos.x, pos.y) ? pos : null;
        return;
    }

    if (cb && (gamePhase === 'playing' || gamePhase === 'break') && !isDragging && isMyTurn()) {
        // Hover aim
        aimAngle = Math.atan2(pos.y - cb.y, pos.x - cb.x);
        pushAimState();
        return;
    }

    if (!isDragging) return;

    dragLast = pos;
    // Power = drag projected onto the OPPOSITE of the aim direction.
    // Pulling back charges; pushing forward (past the cue ball) does nothing.
    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;
    const pullDirX = -Math.cos(aimAngle);
    const pullDirY = -Math.sin(aimAngle);
    const pull = Math.max(0, dx * pullDirX + dy * pullDirY);
    shotPower = Math.min(pull / MAX_PULL * MAX_POWER, MAX_POWER);
    updatePowerBar(shotPower / MAX_POWER);
    pushAimState();
}

// Throttled broadcast of the shooter's aim so the opponent can watch the
// shot being lined up instead of staring at a frozen table.
function pushAimState() {
    if (gameMode !== 'online' || !currentRoomId || !window.db) return;
    const now = performance.now();
    if (now - lastAimPush < 130) return;
    lastAimPush = now;
    try {
        window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
            aimState: { angle: aimAngle, pull: shotPower / MAX_POWER, pusher: myId, ts: Date.now() }
        });
    } catch (e) {}
}

function onCanvasUp() {
    if (!isDragging) return;
    isDragging = false;
    const power = shotPower;
    shotPower = 0;
    updatePowerBar(0);

    if (!canAim() || power < MIN_POWER) return;

    if (gameMode === 'online') {
        executeShot(aimAngle, power, spinTop, spinSide);
        sendShot(aimAngle, power, spinTop, spinSide);
    } else {
        executeShot(aimAngle, power, spinTop, spinSide);
    }
}

function onTouchEnd(e) {
    if (!isDragging) { shotPower = 0; updatePowerBar(0); return; }
    onCanvasUp();
}

function isValidCueBallPos(x, y) {
    if (x - BALL_R < table.x || x + BALL_R > table.x + table.w) return false;
    if (y - BALL_R < table.y || y + BALL_R > table.y + table.h) return false;
    if (kitchenRestricted && x > headStringX) return false;
    for (const b of balls) {
        if (b.id === 0 || b.pocketed) continue;
        if (Math.hypot(x - b.x, y - b.y) < BALL_R * 2 + 1.5) return false;
    }
    // Don't drop inside a pocket throat
    for (const p of pockets) {
        if (Math.hypot(x - p.x, y - p.y) < p.r + BALL_R) return false;
    }
    return true;
}

// ── SPIN CONTROL ──────────────────────────────
function onSpinDown(e) { spinDragging = true; setSpinFromEvent(e); }
function onSpinMove(e) { if (spinDragging) setSpinFromEvent(e); }

function setSpinFromEvent(e) {
    const rect = spinCanvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    const cx   = spinCanvas.width  / 2;
    const cy   = spinCanvas.height / 2;
    const r    = cx - 4;
    let dx = (src.clientX - rect.left) * (spinCanvas.width / rect.width)  - cx;
    let dy = (src.clientY - rect.top)  * (spinCanvas.height / rect.height) - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > r) { dx = dx / dist * r; dy = dy / dist * r; }
    spinSide = dx / r;
    spinTop  = -(dy / r);
    drawSpinControl();
}

function drawSpinControl() {
    const c   = spinCtx;
    const cw  = spinCanvas.width;
    const ch  = spinCanvas.height;
    const cx  = cw / 2;
    const cy  = ch / 2;
    const r   = cx - 3;

    c.clearRect(0, 0, cw, ch);

    const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#d2d2d2');
    g.addColorStop(1, '#666');
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = g; c.fill();

    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 1; c.setLineDash([2, 3]);
    c.beginPath();
    c.moveTo(cx, cy - r + 2); c.lineTo(cx, cy + r - 2);
    c.moveTo(cx - r + 2, cy); c.lineTo(cx + r - 2, cy);
    c.stroke(); c.setLineDash([]);

    const dx = spinSide * (r - 5);
    const dy = -spinTop * (r - 5);
    c.beginPath(); c.arc(cx + dx, cy + dy, 5, 0, Math.PI * 2);
    c.fillStyle = (spinTop !== 0 || spinSide !== 0) ? '#e74c3c' : 'rgba(0,0,0,0.45)';
    c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke();
}

// ── SHOT EXECUTION ────────────────────────────
function executeShot(angle, power, sTop, sSide) {
    if (gamePhase !== 'playing' && gamePhase !== 'break' && gamePhase !== 'ai_thinking') return;
    const cb = getCueBall();
    if (cb.pocketed) return;

    firstContact = null;
    foulThisTurn = false;
    railHitThisTurn = false;
    pottedThisTurn = [];
    cueBallPottedThisTurn = false;
    spinApplied = false;

    aimAngle = angle;
    PoolPhysics.fireCueBall(cb, angle, power, sTop, sSide);
    gamePhase = 'shooting';
    setTurnMsg('');

    if (window.SystemAudio?.play) window.SystemAudio.play('click');

    // Reset spin pad after firing
    spinTop = 0; spinSide = 0;
    drawSpinControl();
}

// ── GAME LOOP ─────────────────────────────────
function gameLoop(ts) {
    const dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = ts;
    update(dt);
    render();
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    // Pocket-fall scale animation
    for (const b of balls) {
        if (b.pocketed && b.scale > 0) {
            b.scale -= dt * 4;
            if (b.scale < 0) b.scale = 0;
        }
    }

    if (gamePhase !== 'shooting') return;

    // Track rail hits (for break legality + safety detection)
    const speeds = balls.map(b => b.pocketed ? 0 : Math.hypot(b.vx, b.vy));
    const newSunk = PoolPhysics.step(balls, table, pockets);

    // Detect first contact: a non-cue ball acquired velocity since last frame
    if (firstContact === null) {
        const cb = getCueBall();
        if (!cb.pocketed) {
            for (const b of balls) {
                if (b.id === 0 || b.pocketed) continue;
                if (Math.hypot(b.vx, b.vy) > 0.6 && speeds[b.id] < 0.6) {
                    firstContact = b.id;
                    if (window.SystemAudio?.play) window.SystemAudio.play('click');
                    break;
                }
            }
        }
    }

    // Apply spin push at first contact
    if (firstContact !== null && !spinApplied) {
        spinApplied = true;
        const cb = getCueBall();
        const ob = balls[firstContact];
        if (ob) PoolPhysics.applySpinEffect(cb, ob);
    }

    // Detect any ball touching a rail (rough — used only for break legality)
    if (!railHitThisTurn) {
        for (const b of balls) {
            if (b.pocketed) continue;
            if (b.x - b.r <= table.x + 0.5 || b.x + b.r >= table.x + table.w - 0.5 ||
                b.y - b.r <= table.y + 0.5 || b.y + b.r >= table.y + table.h - 0.5) {
                railHitThisTurn = true;
                break;
            }
        }
    }

    // Track pots
    for (const id of newSunk) {
        if (id === 0) cueBallPottedThisTurn = true;
        else if (!pottedThisTurn.includes(id)) pottedThisTurn.push(id);
        if (window.SystemAudio?.play) window.SystemAudio.play('chipTable');
    }

    if (PoolPhysics.isSettled(balls)) {
        // The shooter (whoever's turn it currently is) owns the resolution.
        // The other client just simulated for visuals and waits for the state push.
        const iWasShooter = (gameMode !== 'online') || (activeTurn === myId - 1);
        if (iWasShooter) {
            resolveTurn();
        } else {
            gamePhase = 'awaiting_host';
            updateUI();
            if (pendingGameState) {
                const ps = pendingGameState;
                pendingGameState = null;
                applyGameState(ps);
            }
            tryPendingAction();
        }
    }
}

// ── TURN RESOLUTION ───────────────────────────
function resolveTurn() {
    const cb = getCueBall();
    const wasBreak = isBreakShot;
    isBreakShot = false;

    const myType    = assignment[activeTurn];
    const myBalls   = getBallsOfType(myType);
    const earlyPot  = pottedThisTurn.filter(id => id !== 8);

    // Legality is judged from PRE-SHOT state: balls potted this shot are
    // already flagged pocketed, so add back this shot's suit pots when
    // deciding whether the 8 was the required target.
    const pottedMine = myType === null ? 0 : pottedThisTurn.filter(id => {
        const t = BALL_CFG[id]?.type;
        return myType === 'solids' ? t === 'solid' : t === 'stripe';
    }).length;
    const hadSuitBallsPreShot = myBalls.length + pottedMine > 0;

    let foul = false;
    let foulReason = '';
    let scratched = cueBallPottedThisTurn;

    // Scratch
    if (scratched) {
        foul = true; foulReason = '⚠️ Scratch — ball in hand';
        cb.pocketed = false; cb.scale = 1;
        // Park cue ball off-table until opponent places it, so it doesn't render on a pocket
        cb.x = -100; cb.y = -100;
        cb.vx = 0;  cb.vy = 0;
    }

    // No first contact at all
    if (!foul && firstContact === null) {
        foul = true; foulReason = '⚠️ Foul: no ball contacted';
    }

    // Hit wrong ball first
    if (!foul && myType !== null && firstContact !== null) {
        const hitType = BALL_CFG[firstContact]?.type;
        const mustHit = myType === 'solids' ? 'solid' : 'stripe';
        if (!hadSuitBallsPreShot) {
            if (hitType !== 'eight') { foul = true; foulReason = '⚠️ Foul: must hit 8-ball'; }
        } else if (hitType !== mustHit) {
            foul = true; foulReason = `⚠️ Foul: hit wrong ball first`;
        }
    }

    // Break-specific: legal break requires a ball to hit a rail OR a ball pocketed
    let illegalBreak = false;
    if (wasBreak && pottedThisTurn.length === 0 && !railHitThisTurn) {
        illegalBreak = true;
        foul = true;
        foulReason = '⚠️ Illegal break — opponent ball in hand';
    }

    // 8-ball pot — final-game test
    if (pottedThisTurn.includes(8)) {
        // Determine if 8 was legal: shooter must have cleared their suit, no scratch, no foul
        const myB = getBallsOfType(assignment[activeTurn]);
        const cleared = myB.length === 0;
        if (!cleared || foul || scratched) {
            endGame(1 - activeTurn, '8-ball pocketed illegally!');
            return;
        } else {
            endGame(activeTurn, 'Cleared the rack and sunk the 8-ball!');
            return;
        }
    }

    // First-pot suit assignment (only on a clean, non-break legal pot — 8-ball first pot doesn't assign)
    if (assignment[0] === null && earlyPot.length > 0 && !scratched && !illegalBreak) {
        // If both stripes and solids potted on the break, leave open until next pot.
        const types = earlyPot.map(id => BALL_CFG[id]?.type);
        const hasSolid  = types.includes('solid');
        const hasStripe = types.includes('stripe');
        if (hasSolid && !hasStripe) {
            assignment[activeTurn] = 'solids';
            assignment[1 - activeTurn] = 'stripes';
        } else if (hasStripe && !hasSolid) {
            assignment[activeTurn] = 'stripes';
            assignment[1 - activeTurn] = 'solids';
        }
        // If both: table stays open (assignment remains null)
    }

    if (foul) {
        showFoul(foulReason);
        activeTurn = 1 - activeTurn;
        kitchenRestricted = scratched && wasBreak;     // kitchen rule only on break scratch
        setPhase('ball_in_hand');
    } else {
        // No foul → keep turn iff at least one of YOUR balls was pocketed (or table open + any solid/stripe)
        const madeProgress = pottedThisTurn.some(id => {
            if (id === 8) return false;
            const t = BALL_CFG[id].type;
            if (myType === 'solids') return t === 'solid';
            if (myType === 'stripes') return t === 'stripe';
            return t === 'solid' || t === 'stripe';   // open table
        });
        if (!madeProgress) activeTurn = 1 - activeTurn;
        setPhase('playing');
    }

    updateUI();

    // Shooter pushes the authoritative result to the opponent
    if (gameMode === 'online') pushGameState();

    if (gameMode === 'ai' && activeTurn === 1 && gamePhase !== 'ended') {
        setTimeout(doAITurn, 700);
    }
}

function showFoul(text) {
    setTurnMsg(text);
    lastFoulMsg = text;
    lastFoulMsgUntil = performance.now() + 1800;
    setTimeout(refreshTurnMsg, 1850);
}

function getBallsOfType(type) {
    if (!type) return balls.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8);
    const t = type === 'solids' ? 'solid' : 'stripe';
    return balls.filter(b => !b.pocketed && BALL_CFG[b.id]?.type === t);
}

function endGame(winnerIdx, reason) {
    gamePhase = 'ended';
    const isMyWin = (gameMode === 'ai' && winnerIdx === 0) ||
                    (gameMode === 'online' && winnerIdx === myId - 1);

    if (isMyWin) sessionScore[0]++; else sessionScore[1]++;

    if (typeof SystemStats !== 'undefined') {
        if (isMyWin) SystemStats.recordWin('pool', 0);
        else SystemStats.recordLoss('pool');
    }

    if (gameMode === 'online') pushGameState({ winnerIdx, endReason: reason });

    setTimeout(() => showResultModal(isMyWin, winnerIdx, reason), 800);
}

function showResultModal(isMyWin, winnerIdx, reason) {
    document.getElementById('modal-title').innerText = isMyWin ? '🏆 YOU WIN!' : '💀 YOU LOSE!';
    document.getElementById('modal-msg').innerText   = `${getPlayerName(winnerIdx)} wins! ${reason || ''}`;
    document.getElementById('modal-session').innerText = `Session: ${sessionScore[0]} – ${sessionScore[1]}`;
    document.getElementById('result-modal').classList.remove('hidden');
}

function startNewRack() {
    document.getElementById('result-modal').classList.add('hidden');
    resetGame();
    setPhase('break');
    if (gameMode === 'online' && isHost) pushGameState();
}

// ── RENDERING ─────────────────────────────────
function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(viewDpr * viewScale, 0, 0, viewDpr * viewScale, viewDpr * viewOffX, viewDpr * viewOffY);
    drawTable();
    drawPockets();
    drawHeadStringIfNeeded();
    drawAimGuide();
    drawBallInHandPreview();
    drawBalls();
    drawCue();
}

function drawTable() {
    const { x: tx, y: ty, w: tw, h: th } = table;
    const rw = RAIL_W;

    // Outer wood
    const woodGrad = ctx.createLinearGradient(tx - rw, ty - rw, tx - rw, ty + th + rw);
    woodGrad.addColorStop(0, '#3a1f0d');
    woodGrad.addColorStop(0.5, '#6b3a18');
    woodGrad.addColorStop(1, '#2c180a');
    ctx.fillStyle = woodGrad;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, tx - rw, ty - rw, tw + rw * 2, th + rw * 2, 14);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Rail bevel
    ctx.fillStyle = '#4a210d';
    roundRect(ctx, tx - rw + 4, ty - rw + 4, tw + rw * 2 - 8, th + rw * 2 - 8, 11);
    ctx.fill();

    // Diamond markers on rails
    ctx.fillStyle = '#f4e7c2';
    const diamondsTopBot = 7;
    const diamondsLR     = 3;
    for (let i = 1; i < diamondsTopBot + 1; i++) {
        if (i === Math.ceil((diamondsTopBot + 1) / 2)) continue;     // skip side-pocket spot
        const dx = tx + (tw / (diamondsTopBot + 1)) * i;
        drawDiamond(dx, ty - rw / 2, 3);
        drawDiamond(dx, ty + th + rw / 2, 3);
    }
    for (let i = 1; i <= diamondsLR; i++) {
        const dy = ty + (th / (diamondsLR + 1)) * i;
        drawDiamond(tx - rw / 2, dy, 3);
        drawDiamond(tx + tw + rw / 2, dy, 3);
    }

    // Felt
    const feltGrad = ctx.createRadialGradient(tx + tw / 2, ty + th / 2, 20, tx + tw / 2, ty + th / 2, Math.max(tw, th) * 0.7);
    feltGrad.addColorStop(0, '#2a8a44');
    feltGrad.addColorStop(0.7, '#175e25');
    feltGrad.addColorStop(1, '#0a3010');
    ctx.fillStyle = feltGrad;
    ctx.fillRect(tx, ty, tw, th);

    // Subtle inner shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);

    // Head string + foot spot
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(headStringX, ty + 4);
    ctx.lineTo(headStringX, ty + th - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // Foot spot
    ctx.beginPath();
    ctx.arc(tx + tw * 0.72, ty + th / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
}

function drawDiamond(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
}

function drawPockets() {
    for (const p of pockets) {
        ctx.save();
        // Outer leather
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
        ctx.fillStyle = '#1a0c08';
        ctx.fill();

        // Hole
        const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        pg.addColorStop(0, '#000000');
        pg.addColorStop(0.7, '#0a0604');
        pg.addColorStop(1, '#1f0e07');
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = pg;
        ctx.fill();

        // Leather highlight ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120, 80, 50, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }
}

function drawHeadStringIfNeeded() {
    if (gamePhase !== 'ball_in_hand' || !kitchenRestricted) return;
    const { x: tx, y: ty, w: tw, h: th } = table;
    ctx.save();
    ctx.fillStyle = 'rgba(241, 196, 15, 0.08)';
    ctx.fillRect(tx, ty, headStringX - tx, th);
    ctx.strokeStyle = 'rgba(241, 196, 15, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(headStringX, ty);
    ctx.lineTo(headStringX, ty + th);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawBalls() {
    // Shadows
    for (const b of balls) {
        if (b.pocketed && b.scale <= 0) continue;
        ctx.save();
        const r = b.r * b.scale;
        ctx.beginPath();
        ctx.arc(b.x + 2, b.y + 3, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${0.3 * b.scale})`;
        ctx.fill();
        ctx.restore();
    }
    for (const b of balls) {
        if (b.pocketed && b.scale <= 0) continue;
        drawBall(b);
    }
}

function drawBall(b) {
    const cfg = BALL_CFG[b.id];
    if (!cfg) return;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(b.scale, b.scale);

    const r = b.r;

    // Base body
    if (cfg.type === 'cue') {
        const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.7, '#dadada');
        g.addColorStop(1, '#7a7a7a');
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
    } else if (cfg.type === 'solid' || cfg.type === 'eight') {
        const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
        g.addColorStop(0, lighten(cfg.fill, 38));
        g.addColorStop(0.45, cfg.fill);
        g.addColorStop(1, lighten(cfg.fill, -55));
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
    } else {
        // Stripe ball — white base with a colored equatorial band
        const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.05);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.7, '#dadada');
        g.addColorStop(1, '#7a7a7a');
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();

        ctx.save();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();
        const sg = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.4);
        sg.addColorStop(0, lighten(cfg.fill, 25));
        sg.addColorStop(0.5, cfg.fill);
        sg.addColorStop(1, lighten(cfg.fill, -35));
        ctx.fillStyle = sg;
        ctx.fillRect(-r, -r * 0.4, r * 2, r * 0.8);
        ctx.restore();
    }

    // Number disc (skip cue ball)
    if (b.id > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.font = `bold ${Math.round(r * 0.85)}px Orbitron, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.id, 0, 1);
    }

    // Specular crescent
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.32, r * 0.36, 0, Math.PI * 2);
    const shine = ctx.createRadialGradient(-r * 0.4, -r * 0.42, 0, -r * 0.3, -r * 0.32, r * 0.36);
    shine.addColorStop(0, 'rgba(255,255,255,0.65)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.fill();

    // Pocket fade
    if (b.pocketed && b.scale < 1) {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${1 - b.scale})`;
        ctx.fill();
    }

    ctx.restore();
}

function drawCue() {
    const cb = getCueBall();
    if (!cb || cb.pocketed) return;
    if (gamePhase !== 'playing' && gamePhase !== 'break' && gamePhase !== 'ai_thinking') return;
    if (!PoolPhysics.isSettled(balls)) return;

    // Determine whose cue to draw
    const showMine     = isMyTurn() && gameMode !== 'ai';
    const showAI       = gameMode === 'ai' && activeTurn === 1;
    const showLocalAi  = gameMode === 'ai' && activeTurn === 0;
    const showRemote   = gameMode === 'online' && !isMyTurn();
    if (!showMine && !showAI && !showLocalAi && !showRemote) return;

    const CUE_LEN  = 150;
    const CUE_W_TIP = 3;
    const CUE_W_BUTT = 10;
    const MIN_GAP  = 5;
    let cueAngle = aimAngle;
    let pullback = 0;
    if (showRemote) {
        // Opponent's live aim, streamed while they line up the shot
        if (!remoteAim || Date.now() - (remoteAim.ts || 0) > 8000) return;
        cueAngle = remoteAim.angle;
        pullback = (remoteAim.pull || 0) * 28;
    } else {
        if (isDragging) pullback = (shotPower / MAX_POWER) * 28;
        if (showAI)     pullback = aiAimPullback * 28;
    }
    const gap      = MIN_GAP + pullback;

    const tipX   = cb.x - Math.cos(cueAngle) * (cb.r + gap);
    const tipY   = cb.y - Math.sin(cueAngle) * (cb.r + gap);
    const buttX  = tipX  - Math.cos(cueAngle) * CUE_LEN;
    const buttY  = tipY  - Math.sin(cueAngle) * CUE_LEN;

    ctx.save();
    const angle = cueAngle;
    const perp  = angle + Math.PI / 2;
    const px = Math.cos(perp);
    const py = Math.sin(perp);

    // Shaft
    const cueGrad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
    cueGrad.addColorStop(0, '#f5e6c8');
    cueGrad.addColorStop(0.25, '#c8a050');
    cueGrad.addColorStop(0.6, '#8b5e3c');
    cueGrad.addColorStop(1, '#3d220f');

    ctx.beginPath();
    ctx.moveTo(tipX  + px * CUE_W_TIP  / 2, tipY  + py * CUE_W_TIP  / 2);
    ctx.lineTo(tipX  - px * CUE_W_TIP  / 2, tipY  - py * CUE_W_TIP  / 2);
    ctx.lineTo(buttX - px * CUE_W_BUTT / 2, buttY - py * CUE_W_BUTT / 2);
    ctx.lineTo(buttX + px * CUE_W_BUTT / 2, buttY + py * CUE_W_BUTT / 2);
    ctx.closePath();
    ctx.fillStyle = cueGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Ferrule (white)
    const ferrX = tipX + Math.cos(angle + Math.PI) * 6;
    const ferrY = tipY + Math.sin(angle + Math.PI) * 6;
    ctx.beginPath();
    ctx.moveTo(tipX  + px * CUE_W_TIP  / 2, tipY  + py * CUE_W_TIP  / 2);
    ctx.lineTo(tipX  - px * CUE_W_TIP  / 2, tipY  - py * CUE_W_TIP  / 2);
    ctx.lineTo(ferrX - px * (CUE_W_TIP * 1.1) / 2, ferrY - py * (CUE_W_TIP * 1.1) / 2);
    ctx.lineTo(ferrX + px * (CUE_W_TIP * 1.1) / 2, ferrY + py * (CUE_W_TIP * 1.1) / 2);
    ctx.closePath();
    ctx.fillStyle = '#fdfdf6';
    ctx.fill();

    // Chalk tip
    ctx.beginPath();
    ctx.arc(tipX, tipY, CUE_W_TIP / 1.4, 0, Math.PI * 2);
    ctx.fillStyle = '#2da4d8';
    ctx.fill();

    ctx.restore();
}

function drawAimGuide() {
    const cb = getCueBall();
    if (!cb || cb.pocketed) return;
    if (gamePhase !== 'playing' && gamePhase !== 'break' && gamePhase !== 'ai_thinking') return;
    if (!PoolPhysics.isSettled(balls)) return;
    if (gameMode === 'online' && !isMyTurn()) return;
    if (gameMode === 'ai' && activeTurn === 1 && gamePhase !== 'ai_thinking') return;

    ctx.save();
    const hit = PoolPhysics.castRay(balls, cb.x, cb.y, aimAngle, 0);

    if (hit) {
        // Cue → ghost
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(255,255,255,0.42)';
        ctx.beginPath();
        ctx.moveTo(cb.x, cb.y);
        ctx.lineTo(hit.gx, hit.gy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ghost ball
        ctx.beginPath();
        ctx.arc(hit.gx, hit.gy, BALL_R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Object ball direction
        const nx = (hit.ball.x - hit.gx) / (BALL_R * 2);
        const ny = (hit.ball.y - hit.gy) / (BALL_R * 2);
        const obLen = 70;
        ctx.beginPath();
        ctx.moveTo(hit.ball.x, hit.ball.y);
        ctx.lineTo(hit.ball.x + nx * obLen, hit.ball.y + ny * obLen);
        ctx.strokeStyle = 'rgba(120,255,140,0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cue ball post-collision direction (90° rule + spin influence)
        // Tangent to collision normal
        let deflAngle = Math.atan2(-nx, ny);
        // Make sure deflection points "with" the original aim's tangential component
        const aimDx = Math.cos(aimAngle), aimDy = Math.sin(aimAngle);
        const tangX = -ny, tangY = nx;
        if (aimDx * tangX + aimDy * tangY < 0) deflAngle += Math.PI;

        // Spin influence
        if (spinTop >  0.55) deflAngle = aimAngle;            // strong topspin → follow
        else if (spinTop < -0.55) deflAngle = aimAngle + Math.PI; // strong backspin → draw
        else deflAngle += spinTop * 0.45;
        deflAngle += spinSide * 0.20;

        // Cut angle scaling — head-on shots stop the cue, thin cuts let it travel
        const cutDot = Math.abs(aimDx * nx + aimDy * ny);     // 1 = full hit, 0 = grazing
        const baseLen = 80 * (1 - cutDot * 0.7);
        const cuePathLen = Math.max(20, baseLen);

        const cuePath = PoolPhysics.castRayToRail(hit.gx, hit.gy, deflAngle, table);
        const drawLen = Math.min(cuePath, cuePathLen);
        const ex = hit.gx + Math.cos(deflAngle) * drawLen;
        const ey = hit.gy + Math.sin(deflAngle) * drawLen;
        ctx.beginPath();
        ctx.moveTo(hit.gx, hit.gy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = 'rgba(180,200,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

    } else {
        // No ball — line to rail and one reflection
        const railDist = PoolPhysics.castRayToRail(cb.x, cb.y, aimAngle, table);
        const hx = cb.x + Math.cos(aimAngle) * railDist;
        const hy = cb.y + Math.sin(aimAngle) * railDist;

        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(cb.x, cb.y);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.setLineDash([]);

        const { x: tx, y: ty, w: tw, h: th } = table;
        let reflAngle = aimAngle;
        if (Math.abs(hx - tx) < 1.5 || Math.abs(hx - (tx + tw)) < 1.5) reflAngle = Math.PI - aimAngle;
        if (Math.abs(hy - ty) < 1.5 || Math.abs(hy - (ty + th)) < 1.5) reflAngle = -aimAngle;

        const reflDist = PoolPhysics.castRayToRail(hx, hy, reflAngle, table);
        const ex = hx + Math.cos(reflAngle) * Math.min(reflDist, 180);
        const ey = hy + Math.sin(reflAngle) * Math.min(reflDist, 180);
        ctx.setLineDash([4, 9]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.restore();
}

function drawBallInHandPreview() {
    if (gamePhase !== 'ball_in_hand' || !isMyTurn()) return;
    if (!ballInHandPos) return;
    const pos = ballInHandPos;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, BALL_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// ── UI ────────────────────────────────────────
function setTurnMsg(text) {
    const el = document.getElementById('turn-msg');
    if (!el) return;
    el.innerText = text || '';
    el.classList.toggle('foul', !!(text && text.startsWith('⚠')));
}

function updatePowerBar(pct) {
    const fill = document.getElementById('power-fill');
    if (!fill) return;
    fill.style.width = (pct * 100) + '%';
    fill.style.background = pct < 0.4 ? '#2ecc71' : pct < 0.72 ? '#f1c40f' : '#e74c3c';
}

function updateUI() {
    document.getElementById('pname-0').innerText = getPlayerName(0);
    document.getElementById('pname-1').innerText = getPlayerName(1);

    const typeLabels = { solids: '🔴 SOLIDS', stripes: '🟡 STRIPES' };
    for (let i = 0; i < 2; i++) {
        const el = document.getElementById('ptype-' + i);
        const t = assignment[i];
        el.innerText = typeLabels[t] || '—';
        el.style.color = t === 'solids' ? '#e74c3c' : (t === 'stripes' ? '#f1c40f' : 'rgba(255,255,255,0.4)');
        el.style.fontWeight = t ? '900' : 'normal';
        updateBallDots(i);
        document.getElementById('pinfo-' + i).style.opacity = activeTurn === i ? '1' : '0.45';
    }
}

function updateBallDots(playerIdx) {
    const el = document.getElementById(`bdots-${playerIdx}`);
    if (!el) return;
    const type = assignment[playerIdx];
    if (!type) { el.innerHTML = ''; return; }
    const ids = type === 'solids' ? [1,2,3,4,5,6,7] : [9,10,11,12,13,14,15];
    el.innerHTML = ids.map(id => {
        const b = balls[id];
        const pocketed = b && b.pocketed;
        if (pocketed) return `<div class="ball-dot" style="background:#222; opacity:0.3;"></div>`;
        const fill = BALL_CFG[id].fill;
        if (BALL_CFG[id].type === 'stripe') {
            const bg = `linear-gradient(to bottom, #e8e8e8 28%, ${fill} 28%, ${fill} 72%, #e8e8e8 72%)`;
            return `<div class="ball-dot" style="background:${bg}; border:1px solid rgba(255,255,255,0.25);"></div>`;
        }
        return `<div class="ball-dot" style="background:${fill};"></div>`;
    }).join('');
}

// ── AI ────────────────────────────────────────
async function doAITurn() {
    if (gamePhase !== 'playing' && gamePhase !== 'break' && gamePhase !== 'ball_in_hand') return;
    if (activeTurn !== 1) return;
    if (!PoolPhysics.isSettled(balls)) return;

    if (gamePhase === 'ball_in_hand') {
        // Pick a smart ball-in-hand spot: behind cue line if kitchen-restricted, otherwise near best pot
        const cb = getCueBall();
        cb.pocketed = false; cb.scale = 1;
        const spot = pickAIBallInHand();
        cb.x = spot.x; cb.y = spot.y;
        kitchenRestricted = false;
        setPhase('playing');
        await new Promise(r => setTimeout(r, 500));
    }

    const cb = getCueBall();
    if (!cb || cb.pocketed) return;

    const shot = calcAIShot();
    let shotAngle, shotPowerVal;
    const noiseScale = aiDifficulty === 'easy' ? 0.20 : aiDifficulty === 'normal' ? 0.07 : 0.018;
    if (shot) {
        shotAngle    = shot.angle + (Math.random() - 0.5) * noiseScale;
        shotPowerVal = Math.max(MIN_POWER * 1.5,
                       Math.min(MAX_POWER, shot.power * (1 + (Math.random() - 0.5) * noiseScale)));
    } else {
        // Defensive nudge — aim at a target ball softly
        const targets = getBallsOfType(assignment[1]);
        const t = targets[0] || balls[8];
        shotAngle = t ? Math.atan2(t.y - cb.y, t.x - cb.x) : Math.random() * Math.PI * 2;
        shotPowerVal = MAX_POWER * 0.45;
    }

    aimAngle = shotAngle;
    setPhase('ai_thinking');
    setTurnMsg('🤖 AI is thinking…');

    // Animate the cue pull-back during the thinking pause
    const start = performance.now();
    const dur = 1100;
    const peak = Math.min(1, shotPowerVal / MAX_POWER);
    aiAimPullback = 0;
    await new Promise(resolve => {
        function tick() {
            const t = (performance.now() - start) / dur;
            if (t >= 1) { aiAimPullback = peak; resolve(); return; }
            aiAimPullback = Math.sin(Math.min(t, 1) * Math.PI / 2) * peak;
            requestAnimationFrame(tick);
        }
        tick();
    });
    aiAimPullback = 0;

    executeShot(shotAngle, shotPowerVal, 0, 0);
    if (gameMode === 'online') sendShot(shotAngle, shotPowerVal, 0, 0);
}

function pickAIBallInHand() {
    // Try a handful of candidate positions; pick one with a clear shot at one of our balls
    let best = null;
    let bestScore = -Infinity;
    const tries = 80;
    const xMin = table.x + 30;
    const xMax = kitchenRestricted ? headStringX - BALL_R - 2 : table.x + table.w - 30;
    for (let i = 0; i < tries; i++) {
        const px = xMin + Math.random() * Math.max(1, xMax - xMin);
        const py = table.y + 20 + Math.random() * (table.h - 40);
        if (!isValidCueBallPos(px, py)) continue;
        // Score = best shot from here
        const cb = getCueBall();
        const ox = cb.x, oy = cb.y;
        cb.x = px; cb.y = py;
        const shot = calcAIShot();
        cb.x = ox; cb.y = oy;
        const s = shot ? -shot.cost : -1e6;
        if (s > bestScore) { bestScore = s; best = { x: px, y: py }; }
    }
    return best || { x: table.x + table.w * 0.20, y: table.y + table.h / 2 };
}

function calcAIShot() {
    const cb       = getCueBall();
    const myType   = assignment[1];
    const myBalls  = getBallsOfType(myType);
    const targets  = myBalls.length > 0 ? myBalls
                   : (assignment[1] !== null ? [balls[8]]
                      : balls.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8));

    let bestShot = null;
    let bestScore = -Infinity;

    for (const target of targets) {
        for (const pocket of pockets) {
            const dx = pocket.x - target.x;
            const dy = pocket.y - target.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 2) continue;
            const nx = dx / dist, ny = dy / dist;

            const gx = target.x - nx * BALL_R * 2;
            const gy = target.y - ny * BALL_R * 2;

            // Skip ghost positions outside the table
            if (gx < table.x + BALL_R || gx > table.x + table.w - BALL_R) continue;
            if (gy < table.y + BALL_R || gy > table.y + table.h - BALL_R) continue;

            const angle = Math.atan2(gy - cb.y, gx - cb.x);
            const cbDist = Math.hypot(gx - cb.x, gy - cb.y);

            // LOS cue → ghost
            const los = PoolPhysics.castRay(balls, cb.x, cb.y, angle, 0);
            if (!los || los.ball.id !== target.id) continue;

            // LOS object → pocket
            const potAngle = Math.atan2(pocket.y - target.y, pocket.x - target.x);
            const potLos = PoolPhysics.castRay(balls, target.x, target.y, potAngle, target.id);
            if (potLos && potLos.dist < dist - BALL_R) continue;

            // Cut angle: dot of (cue→ghost) and (target→pocket)
            const cax = (gx - cb.x) / cbDist;
            const cay = (gy - cb.y) / cbDist;
            const cutDot = Math.max(-1, Math.min(1, cax * nx + cay * ny));
            const cutAngle = Math.acos(cutDot);

            // Score: closer + straighter is better
            let score = 1000 - cbDist * 0.4 - cutAngle * 80 - dist * 0.15;
            // Penalize side-pocket shots for non-ideal angles
            if ((pocket.kind === 'TM' || pocket.kind === 'BM') && Math.abs(target.x - pocket.x) > 35) {
                score -= 60;
            }

            if (score > bestScore) {
                bestScore = score;
                // Pick power proportional to distance, capped by difficulty
                const cap = aiDifficulty === 'easy' ? 0.55 : aiDifficulty === 'normal' ? 0.75 : 0.85;
                let power = Math.min(MAX_POWER * cap, (cbDist + dist) * 0.045);
                power = Math.max(power, MIN_POWER * 3);
                bestShot = { angle, power, cost: -score };
            }
        }
    }
    return bestShot;
}

// ── ONLINE MULTIPLAYER ────────────────────────
SystemUI.v2Lobby.setup({
    onHost: () => {
        currentRoomId = Math.random().toString(36).substr(2, 4).toUpperCase();
        isHost = true; myId = 1;
        lastActionTs = 0; lastSyncTime = 0; lastRematchTs = 0; stateSeq = 0;
        pendingGameState = null; pendingAction = null; remoteAim = null;
        playerNames[0] = SystemUI.getPlayerName();
        window.dbSet(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
            status: 'waiting',
            seats: [{ type: 'human', name: SystemUI.getPlayerName() }, { type: 'open', name: '' }],
            createdAt: Date.now(), ts: Date.now()
        }).then(() => {
            SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
            listenToRoom();
        });
    },
    onJoin: code => {
        window.dbGet(window.dbChild(window.dbRef(window.db), `pool_rooms/${code}`)).then(snap => {
            if (!snap.exists()) { SystemUI.v2Lobby.showError('ROOM NOT FOUND'); return; }
            const data = snap.val();
            if (data.status !== 'waiting') { SystemUI.v2Lobby.showError('GAME IN PROGRESS'); return; }
            currentRoomId = code; isHost = false; myId = 2;
            lastActionTs = 0; lastSyncTime = 0; lastRematchTs = 0; stateSeq = 0;
            pendingGameState = null; pendingAction = null; remoteAim = null;
            playerNames[0] = data.seats[0]?.name || 'Player 1';
            playerNames[1] = SystemUI.getPlayerName();
            const updated = [...data.seats];
            updated[1] = { type: 'human', name: playerNames[1] };
            window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + code), { seats: updated, ts: Date.now() });
            SystemUI.v2Lobby.showRoomPhase(code, false);
            listenToRoom();
        });
    },
    onLeave: () => {
        // Tidy the room on the way out: host removes it, joiner frees the
        // seat / flags the match so the host isn't stranded.
        if (currentRoomId && window.db) {
            try {
                if (isHost) {
                    window.dbSet(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), null);
                } else if (onlineGameStarted) {
                    window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), { status: 'abandoned' });
                } else {
                    window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
                        seats: [{ type: 'human', name: playerNames[0] || 'Player 1' }, { type: 'open', name: '' }]
                    });
                }
            } catch (e) {}
        }
        exitOnlineToLocal('');
    },
    onStart: () => {
        window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), { status: 'playing', ts: Date.now() });
    }
});

let onlineGameStarted = false;

function listenToRoom() {
    onlineGameStarted = false;
    roomListener = window.dbOnValue(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), snap => {
        const data = snap.val();
        if (!data) {
            // Room deleted = host left. Don't leave the joiner staring at
            // a dead table.
            if (!isHost && currentRoomId) exitOnlineToLocal('🚪 Host left the game');
            return;
        }

        // Joiner closed their tab mid-game — put the host back in the lobby.
        if (data.status === 'abandoned' && isHost) {
            hostBackToLobby('🚪 Opponent left');
            return;
        }

        if (data.seats) {
            SystemUI.v2Lobby.renderSeats(data.seats);
            if (data.seats[0]) playerNames[0] = data.seats[0].name || playerNames[0];
            if (data.seats[1] && data.seats[1].type === 'human') playerNames[1] = data.seats[1].name || playerNames[1];
        }

        if (data.status === 'playing') {
            SystemUI.v2Lobby.hide();
            document.getElementById('action-zone').classList.remove('hidden');
            gameMode = 'online';
            if (!chatStarted) { chatStarted = true; SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); }

            // Both clients reset cleanly the first time they see 'playing'
            if (!onlineGameStarted) {
                onlineGameStarted = true;
                resetGame();
                resizeCanvas();
                setPhase('break');
                updateUI();
                // Host establishes the initial authoritative state
                if (isHost) pushGameState();
            }

            if (data.gameState) { applyGameState(data.gameState); tryPendingAction(); }
        } else if (data.status === 'waiting') {
            onlineGameStarted = false;
        }

        // Either side can request a rematch; only the host actually starts it
        if (isHost && data.rematchRequest && data.rematchRequest !== lastRematchTs) {
            lastRematchTs = data.rematchRequest;
            if (gamePhase === 'ended') startNewRack();
        }

        // Opponent's live aim (QoL: watch them line up the shot)
        if (data.aimState && data.aimState.pusher !== myId) {
            remoteAim = data.aimState;
        }

        if (data.playerAction && data.playerAction.ts !== lastActionTs) {
            lastActionTs = data.playerAction.ts;
            const a = data.playerAction;
            // Ignore actions we wrote ourselves
            if (a.pusher === myId) return;
            handleRemoteAction(a);
        }
    });
}

// Execute a remote action now if the phase allows, otherwise hold it until
// our local simulation settles (it used to be silently dropped, leaving the
// two clients on different shots).
function handleRemoteAction(a) {
    if (gamePhase === 'shooting' || gamePhase === 'awaiting_host') {
        pendingAction = a;
        return;
    }
    executeRemoteAction(a);
}

function executeRemoteAction(a) {
    remoteAim = null;
    if (a.action === 'shot') {
        aimAngle = a.angle;
        executeShot(a.angle, a.power, a.spinTop, a.spinSide);
    } else if (a.action === 'ball_in_hand') {
        const cb = getCueBall();
        cb.pocketed = false; cb.scale = 1;
        cb.x = a.x; cb.y = a.y;
        kitchenRestricted = false;
        setPhase('playing');
    }
}

function tryPendingAction() {
    if (!pendingAction) return;
    if (gamePhase === 'playing' || gamePhase === 'break' || gamePhase === 'ball_in_hand') {
        const a = pendingAction;
        pendingAction = null;
        executeRemoteAction(a);
    }
}

// ── LEAVE / DISCONNECT RECOVERY ───────────────
function exitOnlineToLocal(msg) {
    if (roomListener) { roomListener(); roomListener = null; }
    SystemUI.stopChat(); chatStarted = false;
    currentRoomId = null;
    lastActionTs = 0; lastSyncTime = 0; lastRematchTs = 0; stateSeq = 0;
    pendingGameState = null; pendingAction = null; remoteAim = null;
    onlineGameStarted = false;
    myId = 1; isHost = true;
    gameMode = 'ai';
    const modeEl = document.getElementById('pool-mode');
    if (modeEl) modeEl.value = 'ai';
    document.getElementById('action-zone').classList.remove('hidden');
    document.getElementById('result-modal').classList.add('hidden');
    resetGame();
    setPhase('break');
    if (msg) setTurnMsg(msg);
}

function hostBackToLobby(msg) {
    pendingGameState = null; pendingAction = null; remoteAim = null;
    onlineGameStarted = false;
    stateSeq = 0;
    resetGame();
    setPhase('break');
    document.getElementById('result-modal').classList.add('hidden');
    const seats = [{ type: 'human', name: SystemUI.getPlayerName() }, { type: 'open', name: '' }];
    window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
        status: 'waiting', seats,
        gameState: null, playerAction: null, aimState: null, rematchRequest: null,
        ts: Date.now()
    });
    SystemUI.v2Lobby.renderSeats(seats);
    document.getElementById('v2-lobby-overlay').classList.remove('sys-hidden');
    SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
    if (msg) setTurnMsg(msg);
}

// Room hygiene: pool rooms used to live forever (no cleanup at all).
window.addEventListener('beforeunload', () => {
    if (gameMode !== 'online' || !currentRoomId || !window.db) return;
    try {
        if (isHost) {
            window.dbSet(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), null);
        } else {
            window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), { status: 'abandoned' });
        }
    } catch (e) {}
});

function pushGameState(extra) {
    if (gameMode !== 'online' || !currentRoomId) return;
    stateSeq++;
    const ballData = balls.map(b => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed }));
    const payload = {
        balls: JSON.stringify(ballData),
        activeTurn,
        assignment: JSON.stringify(assignment),
        kitchenRestricted,
        isBreakShot,
        gamePhase,
        seq: stateSeq,
        ts: Date.now(),
        pusher: myId
    };
    if (extra && typeof extra.winnerIdx === 'number') {
        payload.winnerIdx = extra.winnerIdx;
        payload.endReason = extra.endReason || '';
    }
    window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), { gameState: payload });
}

function applyGameState(s) {
    if (!s) return;
    // Order by monotonic seq — both players push state, and comparing their
    // wall clocks (old behavior) dropped every move from the machine whose
    // clock ran behind.
    if (s.seq) {
        if (s.seq < stateSeq) return;
        stateSeq = s.seq;
    } else if (s.ts <= lastSyncTime) return;
    // Skip our own pushes
    if (s.pusher === myId) { lastSyncTime = s.ts; return; }
    // If our local physics is still resolving, defer until settle
    if (gamePhase === 'shooting') { pendingGameState = s; return; }
    lastSyncTime = s.ts;
    pendingGameState = null;

    const wasEnded = gamePhase === 'ended';

    if (gamePhase !== 'shooting') {
        try {
            const bd = JSON.parse(s.balls);
            bd.forEach(d => {
                const b = balls[d.id];
                if (b) {
                    b.x = d.x; b.y = d.y; b.pocketed = d.pocketed;
                    b.vx = 0; b.vy = 0;
                    if (!b.pocketed) b.scale = 1;
                }
            });
        } catch(e) {}
    }
    try { assignment = JSON.parse(s.assignment); } catch(e) {}
    activeTurn = s.activeTurn;
    if (typeof s.kitchenRestricted === 'boolean') kitchenRestricted = s.kitchenRestricted;
    if (typeof s.isBreakShot === 'boolean') isBreakShot = s.isBreakShot;

    const newPhase = s.gamePhase || gamePhase;

    if (gamePhase !== 'shooting') {
        // End-of-game just announced by host
        if (newPhase === 'ended' && !wasEnded && typeof s.winnerIdx === 'number') {
            gamePhase = 'ended';
            const isMyWin = s.winnerIdx === myId - 1;
            if (isMyWin) sessionScore[0]++; else sessionScore[1]++;
            if (typeof SystemStats !== 'undefined') {
                if (isMyWin) SystemStats.recordWin('pool', 0);
                else SystemStats.recordLoss('pool');
            }
            setTimeout(() => showResultModal(isMyWin, s.winnerIdx, s.endReason || ''), 800);
        }
        // Host started a new rack — clear shot state and dismiss any leftover modal
        else if (wasEnded && (newPhase === 'break' || newPhase === 'playing')) {
            document.getElementById('result-modal').classList.add('hidden');
            firstContact = null;
            pottedThisTurn = [];
            cueBallPottedThisTurn = false;
            railHitThisTurn = false;
            spinApplied = false;
            gamePhase = newPhase;
        } else {
            gamePhase = newPhase;
        }
    }
    updateUI();
    refreshTurnMsg();
}

function sendShot(angle, power, sTop, sSide) {
    if (!currentRoomId) return;
    window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
        playerAction: { action: 'shot', angle, power, spinTop: sTop, spinSide: sSide,
                        pusher: myId, ts: Date.now() },
        aimState: null
    });
}

function sendBallInHand(x, y) {
    if (!currentRoomId) return;
    window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
        playerAction: { action: 'ball_in_hand', x, y,
                        pusher: myId, ts: Date.now() }
    });
}

// ── UTILS ─────────────────────────────────────
function lighten(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    let r = ((num >> 16) & 0xff) + amt;
    let g = ((num >>  8) & 0xff) + amt;
    let b = ( num        & 0xff) + amt;
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
