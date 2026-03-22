// =============================================
// 8-BALL POOL — pool_app.js
// The Game Shack | Casino OS (V2 Engine)
// =============================================
'use strict';

// ── CONSTANTS ────────────────────────────────
const BALL_R     = PoolPhysics.BALL_R;
const MAX_PULL   = 110;    // px — max drag distance
const MAX_POWER  = 45;     // px/frame at full pull
const MIN_POWER  = 2;

const RAIL_W     = 38;
const POCKET_R_CORNER = 21;
const POCKET_R_SIDE   = 18;

// Ball visual data  id: [fill, stripe/solid]
const BALL_CFG = {
    0:  { fill: '#f0f0f0', type: 'cue'    },
    1:  { fill: '#f5c518', type: 'solid'  },
    2:  { fill: '#1a5fb4', type: 'solid'  },
    3:  { fill: '#e74c3c', type: 'solid'  },
    4:  { fill: '#7c3fbd', type: 'solid'  },
    5:  { fill: '#e67e22', type: 'solid'  },
    6:  { fill: '#2ecc71', type: 'solid'  },
    7:  { fill: '#8b1a1a', type: 'solid'  },
    8:  { fill: '#1a1a1a', type: 'eight'  },
    9:  { fill: '#f5c518', type: 'stripe' },
    10: { fill: '#1a5fb4', type: 'stripe' },
    11: { fill: '#e74c3c', type: 'stripe' },
    12: { fill: '#7c3fbd', type: 'stripe' },
    13: { fill: '#e67e22', type: 'stripe' },
    14: { fill: '#2ecc71', type: 'stripe' },
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
let sessionScore   = [0, 0];
let playerNames    = ['', ''];  // [host name, joiner name] — slot 0=host, 1=joiner

// table / canvas geometry (set in resize)
let canvas, ctx, spinCanvas, spinCtx;
let W = 0, H = 0;
let table = { x: 0, y: 0, w: 0, h: 0 };
let pockets = [];

// balls array — index = id (0 = cue ball)
let balls = [];
let gamePhase   = 'idle';   // idle | break | playing | ball_in_hand | ai_thinking | ended
let activeTurn  = 0;        // 0 or 1
let assignment  = [null, null]; // null | 'solids' | 'stripes'
let firstContact = null;    // ball id of first ball cue touched this shot
let foulThisTurn = false;
let pottedThisTurn = [];
let cueBallPottedThisTurn = false;
let ballInHandPos = null;   // { x, y } during ball-in-hand placement
let lastTime = 0;
let spinApplied = false;    // has spin effect been applied this shot

// ── AIMING STATE ─────────────────────────────
let aimAngle   = 0;
let isDragging = false;
let dragStart  = null;
let shotPower  = 0;
let spinTop    = 0;
let spinSide   = 0;
let spinDragging = false;

// ── SYSTEM UI ────────────────────────────────
SystemUI.init({
    gameName: '8-BALL POOL',
    rules: 'Drag the cue back to set power. Spin control sets ball contact point. Pot all your balls (solids 1–7 or stripes 9–15) then legally pot the 8-ball to win. Fouls give ball-in-hand to your opponent.',
    hudDropdowns: [
        { id: 'pool-mode', options: [{ value: 'ai', label: '🤖 vs AI' }, { value: 'online', label: '🌐 Online' }] },
        { id: 'pool-diff', label: 'AI', options: [{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }] }
    ]
});

const checkDB = setInterval(() => {
    if (window.poolFirebaseReady || window.db) { clearInterval(checkDB); initPool(); }
}, 50);

// ── INIT ─────────────────────────────────────
function initPool() {
    canvas    = document.getElementById('pool-canvas');
    ctx       = canvas.getContext('2d');
    spinCanvas = document.getElementById('spin-canvas');
    spinCtx   = spinCanvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mode dropdown
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
            }
        });
    }

    // Difficulty dropdown
    const diffEl = document.getElementById('pool-diff');
    if (diffEl) {
        diffEl.value = aiDifficulty;
        diffEl.addEventListener('change', e => {
            aiDifficulty = e.target.value;
            localStorage.setItem('pool_diff', aiDifficulty);
        });
    }

    // Canvas mouse/touch
    canvas.addEventListener('mousedown',  onCanvasDown);
    canvas.addEventListener('mousemove',  onCanvasMove);
    canvas.addEventListener('mouseup',    onCanvasUp);
    canvas.addEventListener('mouseleave', () => { isDragging = false; });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onCanvasDown(e); }, { passive: false });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); onCanvasMove(e); }, { passive: false });
    canvas.addEventListener('touchend',   e => { e.preventDefault(); onTouchEnd(e); }, { passive: false });

    // Spin canvas
    spinCanvas.addEventListener('mousedown',  onSpinDown);
    spinCanvas.addEventListener('mousemove',  onSpinMove);
    spinCanvas.addEventListener('mouseup',    () => { spinDragging = false; });
    spinCanvas.addEventListener('touchstart', e => { e.preventDefault(); onSpinDown(e); }, { passive: false });
    spinCanvas.addEventListener('touchmove',  e => { e.preventDefault(); onSpinMove(e); }, { passive: false });
    spinCanvas.addEventListener('touchend',   () => { spinDragging = false; });

    // Play again
    document.getElementById('play-again-btn').addEventListener('click', () => {
        document.getElementById('result-modal').classList.add('hidden');
        if (gameMode === 'online' && isHost && currentRoomId) {
            window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
                status: 'playing', ts: Date.now()
            });
        }
        resetGame();
        if (gameMode !== 'online') setPhase('break');
        else if (isHost) setTimeout(() => setPhase('break'), 300);
    });

    resetGame();
    setPhase('break');
    requestAnimationFrame(gameLoop);
}

// ── RESIZE ───────────────────────────────────
function resizeCanvas() {
    const outer = document.getElementById('game-outer');
    W = outer.clientWidth;
    H = outer.clientHeight - document.getElementById('action-zone').offsetHeight;
    canvas.width  = W;
    canvas.height = H;

    // Maintain ~2.1:1 table aspect ratio
    const maxW = W  - 20;
    const maxH = H  - 16;
    let tw = maxW - RAIL_W * 2;
    let th = tw / 2.1;
    if (th > maxH - RAIL_W * 2) { th = maxH - RAIL_W * 2; tw = th * 2.1; }
    tw = Math.floor(tw); th = Math.floor(th);
    const tx = Math.floor((W - tw - RAIL_W * 2) / 2) + RAIL_W;
    const ty = Math.floor((H - th - RAIL_W * 2) / 2) + RAIL_W;

    table = { x: tx, y: ty, w: tw, h: th };

    // Corner pockets inset 15px from the geometric corner so balls
    // rolling along rails don't false-pocket near the corners
    const CI = 15;
    pockets = [
        { x: tx + CI,        y: ty + CI,        r: POCKET_R_CORNER },
        { x: tx + tw - CI,   y: ty + CI,        r: POCKET_R_CORNER },
        { x: tx + CI,        y: ty + th - CI,   r: POCKET_R_CORNER },
        { x: tx + tw - CI,   y: ty + th - CI,   r: POCKET_R_CORNER },
        { x: tx + tw/2,      y: ty,             r: POCKET_R_SIDE   },
        { x: tx + tw/2,      y: ty + th,        r: POCKET_R_SIDE   }
    ];

    // Reposition balls proportionally if already placed
    // (balls are repositioned on resetGame, so just rebuild rack)
    if (gamePhase === 'idle' || gamePhase === 'break') {
        buildRack();
    }
}

// ── COLOR HELPER ─────────────────────────────
function adjustColorLightness(hex, percent) {
    let num = parseInt(hex.replace('#', ''), 16);
    let r = (num >> 16) + Math.round(2.55 * percent);
    let g = ((num >> 8) & 0x00FF) + Math.round(2.55 * percent);
    let b = (num & 0x0000FF) + Math.round(2.55 * percent);
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return '#' + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}

// ── BALL SETUP ───────────────────────────────
function buildRack() {
    balls = [];
    for (let i = 0; i <= 15; i++) balls.push(PoolPhysics.makeBall(i, 0, 0));

    // Cue ball — left quarter
    const cueBall = balls[0];
    cueBall.x = table.x + table.w * 0.24;
    cueBall.y = table.y + table.h / 2;

    // Rack apex — right 3/4 mark
    const rx = table.x + table.w * 0.74;
    const ry = table.y + table.h / 2;
    const sp = BALL_R * 2 + 0.5;

    // Standard 8-ball rack layout (id order)
    // Row 0: 1
    // Row 1: 2,  3
    // Row 2: 4,  8,  5
    // Row 3: 6,  9,  10, 7
    // Row 4: 11, 12, 13, 14, 15
    // with 8 at center (row2, pos1)
    const rackIds = [1, 9, 2, 3, 8, 10, 4, 14, 7, 11, 12, 6, 15, 13, 5];
    let ri = 0;
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col <= row; col++) {
            const bx = rx + row * sp;
            const by = ry + (col - row / 2) * sp;
            balls[rackIds[ri]].x = bx;
            balls[rackIds[ri]].y = by;
            ri++;
        }
    }
}

function resetGame() {
    gamePhase   = 'idle';
    activeTurn  = 0;
    assignment  = [null, null];
    firstContact = null;
    foulThisTurn = false;
    pottedThisTurn = [];
    cueBallPottedThisTurn = false;
    ballInHandPos = null;
    spinApplied = false;
    isDragging = false;
    shotPower  = 0;
    spinTop    = 0;
    spinSide   = 0;
    lastTime   = 0;
    spinApplied = false;

    buildRack();
    updateUI();
    drawSpinControl();
    updatePowerBar(0);
}

// ── PHASE MANAGEMENT ─────────────────────────
function setPhase(phase) {
    gamePhase = phase;
    updateUI();
    if (phase === 'break') setTurnMsg(activeTurn === myId - 1 ? '🎱 BREAK SHOT — Click & drag to shoot' : `${balls[0] ? getPlayerName(activeTurn) : '...'} is breaking...`);
    if (phase === 'playing') setTurnMsg(isMyTurn() ? '🏹 YOUR TURN' : `${getPlayerName(activeTurn)}'s turn...`);
    if (phase === 'ball_in_hand') setTurnMsg(isMyTurn() ? '✋ BALL IN HAND — Click to place cue ball' : `${getPlayerName(activeTurn)}'s ball in hand...`);
    if (phase === 'ai_thinking') setTurnMsg('🤖 AI is thinking...');
}

function isMyTurn() {
    if (gameMode === 'ai')     return activeTurn === 0;
    return activeTurn === myId - 1;
}

function canAim() {
    if (gamePhase !== 'playing' && gamePhase !== 'break') return false;
    if (!isMyTurn()) return false;
    if (!PoolPhysics.isSettled(balls)) return false;
    return true;
}

function getPlayerName(idx) {
    if (idx === 0) return document.getElementById('pname-0').innerText || 'P1';
    return document.getElementById('pname-1').innerText || 'P2';
}

function getCueBall() { return balls[0]; }

// ── CANVAS INTERACTION ───────────────────────
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const sx   = canvas.width  / rect.width;
    const sy   = canvas.height / rect.height;
    const src  = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
}

function onTouchEnd(e) {
    // touchend has empty e.touches — must use e.changedTouches
    if (e.changedTouches && e.changedTouches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const sx   = canvas.width  / rect.width;
        const sy   = canvas.height / rect.height;
        const t    = e.changedTouches[0];
        const fakeE = { clientX: t.clientX, clientY: t.clientY };
        const rect2 = canvas.getBoundingClientRect();
        const pos = { x: (t.clientX - rect2.left) * sx, y: (t.clientY - rect2.top) * sy };
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
}

function onCanvasDown(e) {
    const pos = getCanvasPos(e);
    const cb  = getCueBall();

    // Ball-in-hand placement
    if (gamePhase === 'ball_in_hand' && isMyTurn()) {
        if (isValidCueBallPos(pos.x, pos.y)) {
            cb.x = pos.x; cb.y = pos.y;
            cb.pocketed = false;
            cb.scale = 1;
            setPhase('playing');
            if (gameMode === 'online') sendBallInHand(pos.x, pos.y);
        }
        return;
    }

    if (!canAim()) return;

    isDragging  = true;
    dragStart   = pos;
    aimAngle    = Math.atan2(pos.y - cb.y, pos.x - cb.x);
    shotPower   = 0;
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
        // Hover: update aim angle only on my turn
        aimAngle = Math.atan2(pos.y - cb.y, pos.x - cb.x);
        return;
    }

    if (!isDragging) return;

    // Calculate pullback power
    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;
    // Project onto the PULL direction (opposite of aim)
    const pullDirX = -Math.cos(aimAngle);
    const pullDirY = -Math.sin(aimAngle);
    const pull = Math.max(0, dx * pullDirX + dy * pullDirY);
    shotPower = Math.min(pull / MAX_PULL * MAX_POWER, MAX_POWER);
    updatePowerBar(shotPower / MAX_POWER);
}

function onCanvasUp(e) {
    if (!isDragging) return;
    isDragging = false;
    const power = shotPower;
    shotPower = 0;
    updatePowerBar(0);

    if (!canAim() || power < MIN_POWER) return;

    if (gameMode === 'online') {
        // Execute locally immediately for instant response,
        // then broadcast so the other player can simulate the same shot
        executeShot(aimAngle, power, spinTop, spinSide);
        sendShot(aimAngle, power, spinTop, spinSide);
    } else {
        executeShot(aimAngle, power, spinTop, spinSide);
    }
}

function isValidCueBallPos(x, y) {
    if (x - BALL_R < table.x || x + BALL_R > table.x + table.w) return false;
    if (y - BALL_R < table.y || y + BALL_R > table.y + table.h) return false;
    // Must not overlap any ball
    for (const b of balls) {
        if (b.id === 0 || b.pocketed) continue;
        if (Math.hypot(x - b.x, y - b.y) < BALL_R * 2 + 2) return false;
    }
    return true;
}

// ── SPIN CONTROL ─────────────────────────────
function onSpinDown(e) {
    spinDragging = true;
    setSpinFromEvent(e);
}
function onSpinMove(e) {
    if (spinDragging) setSpinFromEvent(e);
}
function setSpinFromEvent(e) {
    const rect = spinCanvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    const cx   = spinCanvas.width  / 2;
    const cy   = spinCanvas.height / 2;
    const r    = cx - 4;
    let dx = (src.clientX - rect.left) * (spinCanvas.width / rect.width) - cx;
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

    // Ball face
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#e8e8e8');
    g.addColorStop(0.6, '#c8c8c8');
    g.addColorStop(1, '#888');
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fillStyle = g;
    c.fill();

    // Guide cross
    c.strokeStyle = 'rgba(0,0,0,0.2)';
    c.lineWidth = 1;
    c.setLineDash([2, 3]);
    c.beginPath();
    c.moveTo(cx, cy - r + 2); c.lineTo(cx, cy + r - 2);
    c.moveTo(cx - r + 2, cy); c.lineTo(cx + r - 2, cy);
    c.stroke();
    c.setLineDash([]);

    // Spin dot
    const dx = spinSide * (r - 5);
    const dy = -spinTop * (r - 5);
    const dotX = cx + dx;
    const dotY = cy + dy;

    c.beginPath();
    c.arc(dotX, dotY, 5, 0, Math.PI * 2);
    c.fillStyle = (spinTop !== 0 || spinSide !== 0) ? '#e74c3c' : 'rgba(0,0,0,0.4)';
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.stroke();
}

// ── SHOT EXECUTION ───────────────────────────
function executeShot(angle, power, sTop, sSide) {
    if (gamePhase !== 'playing' && gamePhase !== 'break') return;
    const cb = getCueBall();
    if (cb.pocketed) return;

    firstContact = null;
    foulThisTurn = false;
    pottedThisTurn = [];
    cueBallPottedThisTurn = false;
    spinApplied = false;

    PoolPhysics.fireCueBall(cb, angle, power, sTop, sSide);
    gamePhase = 'shooting';

    // Reset spin after firing
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
    // Shrink pocketed balls for the falling animation
    for (const b of balls) {
        if (b.pocketed && b.scale > 0) {
            b.scale -= dt * 4; // shrinks to 0 in 0.25 seconds
            if (b.scale < 0) b.scale = 0;
        }
    }

    if (gamePhase !== 'shooting') return;

    const newSunk = PoolPhysics.step(balls, table, pockets);

    // Detect first contact: was cue ball the first collision trigger?
    // We check by seeing if the cue ball is moving and any non-cue ball has velocity
    if (firstContact === null) {
        const cb = getCueBall();
        if (!cb.pocketed) {
            for (const b of balls) {
                if (b.id === 0 || b.pocketed) continue;
                if (Math.hypot(b.vx, b.vy) > 2) {
                    firstContact = b.id;
                    break;
                }
            }
        }
    }

    // Apply spin effect once at first contact
    if (firstContact !== null && !spinApplied) {
        spinApplied = true;
        const cb = getCueBall();
        const ob = balls[firstContact];
        if (ob) PoolPhysics.applySpinEffect(cb, ob);
    }

    // Track pocketed balls this shot
    for (const id of newSunk) {
        if (id === 0) cueBallPottedThisTurn = true;
        else if (!pottedThisTurn.includes(id)) pottedThisTurn.push(id);
    }

    if (PoolPhysics.isSettled(balls)) {
        // Only host runs resolveTurn authoritatively.
        // Joiner just simulates physics visually and waits for gameState.
        if (gameMode !== 'online' || isHost) {
            resolveTurn();
        } else {
            // Joiner: physics settled — block aiming until host confirms result
            gamePhase = 'awaiting_host';
            updateUI();
        }
    }
}

// ── TURN RESOLUTION ──────────────────────────
function resolveTurn() {
    const cb = getCueBall();

    // Determine fouls
    const myType    = assignment[activeTurn];
    const myBalls   = getBallsOfType(myType);
    const earlyPot  = pottedThisTurn.filter(id => id !== 8);

    let foul = false;
    let foulReason = '';

    // Scratch
    if (cueBallPottedThisTurn) {
        foul = true; foulReason = '⚠️ Scratch!';
        cb.pocketed = false;
        cb.scale = 1;
        cb.x = table.x + table.w * 0.24;
        cb.y = table.y + table.h / 2;
    }

    // No first contact or hit wrong ball first
    if (!foul && firstContact === null) {
        foul = true; foulReason = '⚠️ Foul: missed all balls!';
    }

    if (!foul && myType !== null && firstContact !== null) {
        const hitType = BALL_CFG[firstContact]?.type;
        const mustHit = myType === 'solids' ? 'solid' : 'stripe';
        // All solids/stripes are pocketed → must hit 8-ball
        if (myBalls.length === 0) {
            if (hitType !== 'eight') { foul = true; foulReason = '⚠️ Foul: hit wrong ball!'; }
        } else if (hitType !== mustHit) {
            foul = true; foulReason = '⚠️ Foul: hit wrong ball!';
        }
    }

    // 8-ball potted — check if legal
    if (pottedThisTurn.includes(8)) {
        const myB = getBallsOfType(assignment[activeTurn]);
        if (myB.length > 0 || foul || cueBallPottedThisTurn) {
            // Illegal 8-ball pot → lose
            endGame(1 - activeTurn, 'Illegal 8-ball pot!');
            return;
        } else {
            endGame(activeTurn, 'All balls potted!');
            return;
        }
    }

    // First pot: assign ball types
    if (assignment[0] === null && earlyPot.length > 0) {
        const potType = BALL_CFG[earlyPot[0]]?.type;
        if (potType === 'solid' || potType === 'stripe') {
            assignment[activeTurn] = potType === 'solid' ? 'solids' : 'stripes';
            assignment[1 - activeTurn] = potType === 'solid' ? 'stripes' : 'solids';
        }
    }

    if (foul) {
        showMsg(foulReason, 2.5);
        activeTurn = 1 - activeTurn;
        if (foul && !cueBallPottedThisTurn) {
            // Ball in hand for opponent
        }
        if (foul) {
            setPhase('ball_in_hand');
        } else {
            setPhase('playing');
        }
    } else {
        // Good pots keep the turn
        const madePot = pottedThisTurn.length > 0;
        if (!madePot) activeTurn = 1 - activeTurn;
        setPhase('playing');
    }

    updateUI();

    if (gameMode === 'online') {
        if (isHost) {
            pushGameState();
        } else {
            // Joiner ran resolveTurn locally for visual consistency but defers
            // authoritative turn state to the host's next gameState push.
            // Nothing else to do — gameState will arrive shortly and confirm.
        }
    }
    if (gameMode === 'ai' && activeTurn === 1 && gamePhase !== 'ended') {
        setTimeout(doAITurn, 1000);
    }
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

    if (gameMode === 'online' && isHost) pushGameState();

    setTimeout(() => {
        document.getElementById('modal-title').innerText = isMyWin ? '🏆 YOU WIN!' : '💀 YOU LOSE!';
        document.getElementById('modal-msg').innerText   = `${getPlayerName(winnerIdx)} wins! ${reason}`;
        document.getElementById('modal-session').innerText = `Session: ${sessionScore[0]} – ${sessionScore[1]}`;
        document.getElementById('result-modal').classList.remove('hidden');
    }, 800);
}

function showMsg(text, dur) {
    setTurnMsg(text);
}

// ── RENDERING ─────────────────────────────────
function render() {
    ctx.clearRect(0, 0, W, H);
    drawTable();
    drawPockets();
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
    woodGrad.addColorStop(0.5, '#6b320b');
    woodGrad.addColorStop(1, '#3a1f0d');
    ctx.fillStyle = woodGrad;
    
    // Drop shadow for the table
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, tx - rw, ty - rw, tw + rw * 2, th + rw * 2, 12);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Rail inner bevel
    ctx.fillStyle = '#4a210d';
    roundRect(ctx, tx - rw + 4, ty - rw + 4, tw + rw * 2 - 8, th + rw * 2 - 8, 10);
    ctx.fill();

    // Felt surface (richer vignette)
    const feltGrad = ctx.createRadialGradient(tx + tw / 2, ty + th / 2, 10, tx + tw / 2, ty + th / 2, Math.max(tw, th) * 0.75);
    feltGrad.addColorStop(0, '#228236');
    feltGrad.addColorStop(0.8, '#124f1c');
    feltGrad.addColorStop(1, '#082b0d');
    ctx.fillStyle = feltGrad;
    ctx.fillRect(tx, ty, tw, th);

    // Inner felt shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 12;
    ctx.strokeRect(tx, ty, tw, th);

    // Head/foot string markers
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(tx + tw * 0.25, ty + 4);
    ctx.lineTo(tx + tw * 0.25, ty + th - 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center dot
    ctx.beginPath();
    ctx.arc(tx + tw / 2, ty + th / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();

    // Rack spot
    ctx.beginPath();
    ctx.arc(tx + tw * 0.74, ty + th / 2, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawPockets() {
    for (const p of pockets) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        pg.addColorStop(0, '#1a0c08');
        pg.addColorStop(1, '#000000');
        ctx.fillStyle = pg;
        ctx.fill();
        
        // Inner shadow to simulate hole depth
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowColor = 'transparent';

        // Leather ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#3d1a08';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }
}

function drawBalls() {
    // Draw shadow first
    for (const b of balls) {
        if (b.pocketed && b.scale <= 0) continue;
        ctx.save();
        const currentR = b.r * b.scale;
        ctx.beginPath();
        ctx.arc(b.x + 2 * b.scale, b.y + 3 * b.scale, currentR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${0.3 * b.scale})`;
        ctx.fill();
        ctx.restore();
    }
    // Draw balls
    for (const b of balls) {
        if (b.pocketed && b.scale <= 0) continue;
        drawBall(b);
    }
}

function drawBall(b) {
    const cfg = BALL_CFG[b.id];
    if (!cfg) return;
    ctx.save();

    const currentR = b.r * b.scale;
    
    // Apply scale transformation center
    ctx.translate(b.x, b.y);
    ctx.scale(b.scale, b.scale);
    const bx = 0;
    const by = 0;

    // 3D Ball Shading - Base Radial Gradient
    const g = ctx.createRadialGradient(bx - b.r * 0.3, by - b.r * 0.3, b.r * 0.1, bx, by, b.r * 1.1);

    if (cfg.type === 'cue') {
        // White cue ball
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.7, '#d4d4d4');
        g.addColorStop(1, '#888888');
        ctx.beginPath();
        ctx.arc(bx, by, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
    } else if (cfg.type === 'solid' || cfg.type === 'eight') {
        // Base color
        g.addColorStop(0, adjustColorLightness(cfg.fill, 40));
        g.addColorStop(0.4, cfg.fill);
        g.addColorStop(1, adjustColorLightness(cfg.fill, -60));
        
        ctx.beginPath();
        ctx.arc(bx, by, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        
        // Number circle
        ctx.beginPath();
        ctx.arc(bx, by, b.r * 0.52, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fill();
    } else {
        // Stripe ball
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.7, '#d4d4d4');
        g.addColorStop(1, '#888888');
        
        ctx.beginPath();
        ctx.arc(bx, by, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        
        // Stripe band
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, b.r, 0, Math.PI * 2);
        ctx.clip();
        
        const stripeG = ctx.createRadialGradient(bx - b.r * 0.3, by - b.r * 0.3, b.r * 0.1, bx, by, b.r * 1.1);
        stripeG.addColorStop(0, adjustColorLightness(cfg.fill, 40));
        stripeG.addColorStop(0.4, cfg.fill);
        stripeG.addColorStop(1, adjustColorLightness(cfg.fill, -60));
        
        ctx.fillStyle = stripeG;
        ctx.fillRect(bx - b.r, by - b.r * 0.48, b.r * 2, b.r * 0.96);
        ctx.restore();
        
        // Number circle
        ctx.beginPath();
        ctx.arc(bx, by, b.r * 0.48, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
    }

    // Number text
    if (b.id > 0) {
        ctx.fillStyle = '#1a1a1a';
        ctx.font = `bold ${b.r * 0.92}px Orbitron, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.id, bx, by + 0.5);
    }

    // High-quality Specular shine (crescent highlight)
    ctx.beginPath();
    ctx.arc(bx - b.r * 0.25, by - b.r * 0.3, b.r * 0.35, 0, Math.PI * 2);
    const shineG = ctx.createRadialGradient(bx - b.r * 0.35, by - b.r * 0.4, 0, bx - b.r * 0.25, by - b.r * 0.3, b.r * 0.35);
    shineG.addColorStop(0, 'rgba(255,255,255,0.6)');
    shineG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shineG;
    ctx.fill();

    // Darken it slightly if it's falling in the pocket
    if (b.pocketed && b.scale < 1) {
        ctx.beginPath();
        ctx.arc(bx, by, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${1 - b.scale})`;
        ctx.fill();
    }

    ctx.restore();
}

function drawCue() {
    const cb = getCueBall();
    if (!cb || cb.pocketed) return;
    if (gamePhase !== 'playing' && gamePhase !== 'break') return;
    // Show cue for both players (including AI/opponent during their turn)
    if (!PoolPhysics.isSettled(balls) && gameMode === 'ai' && activeTurn === 1) return;
    if (!PoolPhysics.isSettled(balls) && isMyTurn()) return;
    if (!isMyTurn() && gameMode === 'online') return;

    const CUE_LEN  = 140;
    const CUE_W_TIP = 3;
    const CUE_W_BUTT = 10;
    const MIN_GAP  = 5;
    const pullback = isDragging ? (shotPower / MAX_POWER) * 28 : 0;
    const gap      = MIN_GAP + pullback;

    const tipX   = cb.x - Math.cos(aimAngle) * (cb.r + gap);
    const tipY   = cb.y - Math.sin(aimAngle) * (cb.r + gap);
    const buttX  = tipX  - Math.cos(aimAngle) * CUE_LEN;
    const buttY  = tipY  - Math.sin(aimAngle) * CUE_LEN;

    ctx.save();
    ctx.lineWidth = 1;

    // Cue body (gradient from tip to butt)
    const cueGrad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
    cueGrad.addColorStop(0, '#f5e6c8');
    cueGrad.addColorStop(0.25, '#c8a050');
    cueGrad.addColorStop(0.6, '#8b5e3c');
    cueGrad.addColorStop(1, '#5c3317');

    // Draw as a tapered rectangle
    const angle = aimAngle;
    const perp  = angle + Math.PI / 2;
    const px = Math.cos(perp);
    const py = Math.sin(perp);

    ctx.beginPath();
    ctx.moveTo(tipX  + px * CUE_W_TIP  / 2, tipY  + py * CUE_W_TIP  / 2);
    ctx.lineTo(tipX  - px * CUE_W_TIP  / 2, tipY  - py * CUE_W_TIP  / 2);
    ctx.lineTo(buttX - px * CUE_W_BUTT / 2, buttY - py * CUE_W_BUTT / 2);
    ctx.lineTo(buttX + px * CUE_W_BUTT / 2, buttY + py * CUE_W_BUTT / 2);
    ctx.closePath();
    ctx.fillStyle = cueGrad;
    ctx.fill();

    // Tip highlight
    ctx.beginPath();
    ctx.arc(tipX, tipY, CUE_W_TIP / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#6dc';
    ctx.fill();

    ctx.restore();
}

function drawAimGuide() {
    const cb = getCueBall();
    if (!cb || cb.pocketed) return;
    if (gamePhase !== 'playing' && gamePhase !== 'break') return;
    // Show aim guide for both players (including AI/opponent)
    if (!PoolPhysics.isSettled(balls) && gameMode === 'ai' && activeTurn === 1) return;
    if (!PoolPhysics.isSettled(balls) && isMyTurn()) return;
    if (!isMyTurn() && gameMode === 'online') return;

    ctx.save();

    // Ray from cue ball in aim direction
    const hit = PoolPhysics.castRay(balls, cb.x, cb.y, aimAngle, 0);

    if (hit) {
        // Dashed line from cue ball to ghost ball
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(cb.x, cb.y);
        ctx.lineTo(hit.gx, hit.gy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ghost ball outline
        ctx.beginPath();
        ctx.arc(hit.gx, hit.gy, BALL_R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Object ball direction after hit
        const nx = (hit.ball.x - hit.gx) / (BALL_R * 2);
        const ny = (hit.ball.y - hit.gy) / (BALL_R * 2);
        const obLen = 60;
        ctx.beginPath();
        ctx.moveTo(hit.ball.x, hit.ball.y);
        ctx.lineTo(hit.ball.x + nx * obLen, hit.ball.y + ny * obLen);
        ctx.strokeStyle = 'rgba(100,220,100,0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cue ball path after collision (90-degree rule + spin)
        // Base deflection: perpendicular to collision normal
        const baseAngle = Math.atan2(-nx, ny); // 90° from object ball direction
        const spinInfluence = spinTop * (Math.PI / 4);
        let deflAngle = baseAngle + spinInfluence;
        // Backspin reverses
        if (spinTop < -0.5) deflAngle = aimAngle + Math.PI;
        // Topspin follows through
        if (spinTop > 0.5)  deflAngle = aimAngle;

        const cuePath = PoolPhysics.castRayToRail(hit.gx, hit.gy, deflAngle, table);
        const cueEndX = hit.gx + Math.cos(deflAngle) * Math.min(cuePath, 70);
        const cueEndY = hit.gy + Math.sin(deflAngle) * Math.min(cuePath, 70);
        ctx.beginPath();
        ctx.moveTo(hit.gx, hit.gy);
        ctx.lineTo(cueEndX, cueEndY);
        ctx.strokeStyle = 'rgba(200,200,255,0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

    } else {
        // No ball hit — draw line to rail, then reflect
        const railDist = PoolPhysics.castRayToRail(cb.x, cb.y, aimAngle, table);
        const railHitX = cb.x + Math.cos(aimAngle) * railDist;
        const railHitY = cb.y + Math.sin(aimAngle) * railDist;

        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(cb.x, cb.y);
        ctx.lineTo(railHitX, railHitY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Reflect angle off the rail that was hit
        const { x: tx, y: ty, w: tw, h: th } = table;
        let reflAngle = aimAngle;
        // Which rail did we hit? Reflect the perpendicular component
        const hitLeft  = Math.abs(railHitX - tx)       < 1.5;
        const hitRight = Math.abs(railHitX - (tx + tw)) < 1.5;
        const hitTop   = Math.abs(railHitY - ty)       < 1.5;
        const hitBot   = Math.abs(railHitY - (ty + th)) < 1.5;
        if (hitLeft || hitRight) reflAngle = Math.PI - aimAngle;
        if (hitTop  || hitBot)   reflAngle = -aimAngle;

        // Draw reflected ray to next rail, fading out
        const reflDist = PoolPhysics.castRayToRail(railHitX, railHitY, reflAngle, table);
        const reflEndX = railHitX + Math.cos(reflAngle) * Math.min(reflDist, 160);
        const reflEndY = railHitY + Math.sin(reflAngle) * Math.min(reflDist, 160);

        ctx.setLineDash([4, 9]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(railHitX, railHitY);
        ctx.lineTo(reflEndX, reflEndY);
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
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// ── UI UPDATES ────────────────────────────────
function setTurnMsg(text) {
    const el = document.getElementById('turn-msg');
    if (el) el.innerText = text;
}

function updatePowerBar(pct) {
    const fill = document.getElementById('power-fill');
    if (!fill) return;
    fill.style.width = (pct * 100) + '%';
    fill.style.background = pct < 0.4 ? '#2ecc71' : pct < 0.72 ? '#f1c40f' : '#e74c3c';
}

function updateUI() {
    // Names — slot 0=host/player1, slot 1=joiner/player2
    if (gameMode === 'ai') {
        document.getElementById('pname-0').innerText = SystemUI.getPlayerName ? SystemUI.getPlayerName() : 'You';
        document.getElementById('pname-1').innerText = '🤖 AI';
    } else {
        document.getElementById('pname-0').innerText = playerNames[0] || 'Player 1';
        document.getElementById('pname-1').innerText = playerNames[1] || 'Player 2';
    }

    // Types
    const typeLabels = { solids: '🔴 SOLIDS', stripes: '🟡 STRIPES', null: '—' };
    
    const ptype0 = document.getElementById('ptype-0');
    ptype0.innerText = typeLabels[assignment[0]] || '—';
    ptype0.style.color = assignment[0] === 'solids' ? '#e74c3c' : (assignment[0] === 'stripes' ? '#f1c40f' : 'rgba(255,255,255,0.4)');
    ptype0.style.fontWeight = assignment[0] ? '900' : 'normal';
    ptype0.style.fontSize = assignment[0] ? '0.7rem' : '0.55rem';

    const ptype1 = document.getElementById('ptype-1');
    ptype1.innerText = typeLabels[assignment[1]] || '—';
    ptype1.style.color = assignment[1] === 'solids' ? '#e74c3c' : (assignment[1] === 'stripes' ? '#f1c40f' : 'rgba(255,255,255,0.4)');
    ptype1.style.fontWeight = assignment[1] ? '900' : 'normal';
    ptype1.style.fontSize = assignment[1] ? '0.7rem' : '0.55rem';

    // Ball dots
    updateBallDots(0);
    updateBallDots(1);

    // Active player highlight
    document.getElementById('pinfo-0').style.opacity = activeTurn === 0 ? '1' : '0.45';
    document.getElementById('pinfo-1').style.opacity = activeTurn === 1 ? '1' : '0.45';

    if (gamePhase === 'playing' || gamePhase === 'break') {
        const myT = isMyTurn();
        setTurnMsg(myT ? '🏹 YOUR TURN' : `${getPlayerName(activeTurn)}'s turn...`);
    }
}

function updateBallDots(playerIdx) {
    const el = document.getElementById(`bdots-${playerIdx}`);
    if (!el) return;
    const type = assignment[playerIdx];
    if (!type) { el.innerHTML = ''; return; }
    const ballType = type === 'solids' ? 'solid' : 'stripe';
    const ids = type === 'solids' ? [1,2,3,4,5,6,7] : [9,10,11,12,13,14,15];
    el.innerHTML = ids.map(id => {
        const b = balls[id];
        const pocketed = b && b.pocketed;
        if (pocketed) {
            return `<div class="ball-dot" style="background:#222; opacity:0.3;"></div>`;
        }
        const fill = BALL_CFG[id].fill;
        const isStripe = BALL_CFG[id].type === 'stripe';
        if (isStripe) {
            // White ball with colored stripe band through the center
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

    // Handle ball in hand BEFORE the thinking delay so phase is correct afterward
    if (gamePhase === 'ball_in_hand') {
        const cb = getCueBall();
        cb.pocketed = false;
        cb.scale = 1;
        cb.x = table.x + table.w * 0.24;
        cb.y = table.y + table.h / 2;
        setPhase('playing');
        await new Promise(r => setTimeout(r, 600));
    }

    // Calculate shot first so aimAngle is set BEFORE the delay,
    // letting the cue and aim guide render during the thinking pause
    const cb = getCueBall();
    if (!cb || cb.pocketed) return;

    const shot = calcAIShot();
    let shotAngle, shotPowerVal;
    if (shot) {
        const ns = aiDifficulty === 'easy' ? 0.22 : aiDifficulty === 'normal' ? 0.08 : 0.02;
        shotAngle    = shot.angle + (Math.random() - 0.5) * ns;
        shotPowerVal = Math.max(MIN_POWER, Math.min(MAX_POWER, shot.power * (1 + (Math.random() - 0.5) * ns)));
    } else {
        // No good shot found — just nudge the rack
        shotAngle    = Math.random() * Math.PI * 2;
        shotPowerVal = MAX_POWER * 0.4;
    }

    // Set aimAngle now so cue + guide are visible during the thinking delay
    aimAngle = shotAngle;

    setTurnMsg('🤖 AI is thinking...');
    await new Promise(r => setTimeout(r, 1400));

    executeShot(shotAngle, shotPowerVal, 0, 0);
    if (gameMode === 'online') sendShot(shotAngle, shotPowerVal, 0, 0);
}

function calcAIShot() {
    const cb       = getCueBall();
    const myType   = assignment[1];
    const myBalls  = getBallsOfType(myType);
    const targets  = myBalls.length > 0 ? myBalls : [balls[8]];

    let bestShot = null;
    let bestScore = -Infinity;

    for (const target of targets) {
        for (const pocket of pockets) {
            // Direction from target ball to pocket
            const dx = pocket.x - target.x;
            const dy = pocket.y - target.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 1) continue;
            const nx = dx / dist, ny = dy / dist;

            // Ghost ball position: where cue ball must contact target
            const gx = target.x - nx * BALL_R * 2;
            const gy = target.y - ny * BALL_R * 2;

            // Angle from cue ball to ghost ball
            const angle = Math.atan2(gy - cb.y, gx - cb.x);

            // Check line of sight from cue ball to ghost ball
            const los = PoolPhysics.castRay(balls, cb.x, cb.y, angle, 0);
            if (!los || los.ball.id !== target.id) continue;

            // Check target ball to pocket is clear
            const potAngle = Math.atan2(pocket.y - target.y, pocket.x - target.x);
            const potLos   = PoolPhysics.castRay(balls, target.x, target.y, potAngle, target.id);
            const potDist  = Math.hypot(pocket.x - target.x, pocket.y - target.y);
            if (potLos && potLos.dist < potDist - BALL_R) continue;

            // Score: shorter distance = easier, more direct angle = better
            const cbDist = Math.hypot(gx - cb.x, gy - cb.y);
            const cutAngle = Math.acos(Math.max(-1, Math.min(1, nx * Math.cos(angle) + ny * Math.sin(angle))));
            const score = 1000 - cbDist * 0.3 - cutAngle * 40 - dist * 0.1;

            if (score > bestScore) {
                bestScore = score;
                // Calculate power for the new scaled MAX_POWER math
                const power = Math.max(MIN_POWER * 2, Math.min(MAX_POWER * 0.85, (cbDist + dist) * 0.05));
                bestShot = { angle, power };
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
        if (roomListener) { roomListener(); roomListener = null; }
        SystemUI.stopChat(); chatStarted = false;
        myId = 1; isHost = true;
        document.getElementById('action-zone').classList.remove('hidden');
        gameMode = 'ai';
        resetGame(); setPhase('break');
    },
    onStart: () => {
        window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), { status: 'playing', ts: Date.now() });
    }
});

function listenToRoom() {
    roomListener = window.dbOnValue(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), snap => {
        const data = snap.val();
        if (!data) return;

        if (data.seats) {
            SystemUI.v2Lobby.renderSeats(data.seats);
            // Keep playerNames in sync from Firebase seats
            if (data.seats[0]) playerNames[0] = data.seats[0].name || playerNames[0];
            if (data.seats[1] && data.seats[1].type === 'human') playerNames[1] = data.seats[1].name || playerNames[1];
        }

        if (data.status === 'playing') {
            SystemUI.v2Lobby.hide();
            document.getElementById('action-zone').classList.remove('hidden');
            if (!chatStarted) { chatStarted = true; SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); }
            if (isHost && gamePhase === 'idle') {
                resetGame(); setPhase('break'); updateUI();
            } else if (!isHost) {
                gameMode = 'online';
                // Joiner: reset rack if starting fresh or replaying
                if (gamePhase === 'idle' || gamePhase === 'ended') {
                    resetGame();
                    resizeCanvas();
                    setPhase('break');
                    updateUI();
                }
                if (data.gameState) applyGameState(data.gameState);
            }
        }

        if (data.playerAction && data.playerAction.ts !== lastActionTs) {
            lastActionTs = data.playerAction.ts;
            const a = data.playerAction;
            if (a.action === 'shot') {
                // Only execute if we didn't fire this shot ourselves
                // (shooter already executed locally in onCanvasUp / doAITurn)
                const shotByMe = (isHost && a.shooterId === 'host') ||
                                 (!isHost && a.shooterId === 'joiner');
                if (!shotByMe) {
                    aimAngle = a.angle;
                    executeShot(a.angle, a.power, a.spinTop, a.spinSide);
                }
            }
            if (a.action === 'ball_in_hand') {
                const cb = getCueBall();
                cb.pocketed = false; cb.scale = 1; cb.x = a.x; cb.y = a.y;
                setPhase('playing');
                if (isHost) pushGameState();
            }
        }
    });
}

function pushGameState() {
    if (!isHost || gameMode !== 'online') return;
    const ballData = balls.map(b => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed }));
    window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
        gameState: {
            balls: JSON.stringify(ballData),
            activeTurn, assignment: JSON.stringify(assignment),
            gamePhase, ts: Date.now()
        }
    });
}

function applyGameState(s) {
    if (!s || s.ts <= lastSyncTime) return;
    lastSyncTime = s.ts;
    // Never teleport balls while physics is running locally
    if (gamePhase !== 'shooting') {
        try {
            const bd = JSON.parse(s.balls);
            bd.forEach(d => {
                const b = balls[d.id];
                if (b) {
                    b.x = d.x; b.y = d.y; b.pocketed = d.pocketed; b.vx = 0; b.vy = 0;
                    if (!b.pocketed) b.scale = 1;
                }
            });
        } catch(e) {}
    }
    try { assignment = JSON.parse(s.assignment); } catch(e) {}
    activeTurn = s.activeTurn;
    if (gamePhase !== 'shooting') {
        if (gamePhase === 'idle') {
            gamePhase = s.gamePhase || 'playing';
        } else {
            gamePhase = s.gamePhase || gamePhase;
        }
    }
    updateUI();
}

function sendShot(angle, power, sTop, sSide) {
    window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
        playerAction: { action: 'shot', angle, power, spinTop: sTop, spinSide: sSide,
                        shooterId: isHost ? 'host' : 'joiner', ts: Date.now() }
    });
}

function sendBallInHand(x, y) {
    window.dbUpdate(window.dbRef(window.db, 'pool_rooms/' + currentRoomId), {
        playerAction: { action: 'ball_in_hand', x, y, ts: Date.now() }
    });
}

// ── UTILS ────────────────────────────────────
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