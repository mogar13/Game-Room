// =============================================
// PONG — pong_app.js
// The Game Shack | Casino OS (V2 Engine)
// =============================================
'use strict';

// ── CONSTANTS ────────────────────────────────
const WIN_SCORE     = 7;
const PADDLE_W      = 12;
const PADDLE_H_BASE = 80;
const BALL_R        = 8;
const BALL_SPEED_BASE = 420;     // px/s
const BALL_SPEED_MAX  = 820;
const BALL_SPEED_INC  = 18;      // added each paddle hit
const AI_REACT_EASY   = 0.045;
const AI_REACT_NORMAL = 0.082;
const AI_REACT_HARD   = 0.145;
const PUSH_INTERVAL   = 50;      // ms between host gameState pushes

// Power-up types
const PU_TYPES = ['big', 'shrink', 'speed', 'slow'];
const PU_LABELS = { big: '⬆️', shrink: '⬇️', speed: '⚡', slow: '🐢' };
const PU_COLORS = { big: '#2ecc71', shrink: '#e74c3c', speed: '#f1c40f', slow: '#9b59b6' };
const PU_DURATION = 5000;   // ms
const PU_SPAWN_INTERVAL = 8000; // ms between spawns

// ── GAME STATE ────────────────────────────────
let gameMode     = 'ai';
let aiDifficulty = localStorage.getItem('pong_diff') || 'normal';
let myId         = 1;
let isHost       = true;
let currentRoomId   = null;
let roomListener    = null;
let chatStarted     = false;
let sessionScore    = [0, 0];
let playerNames     = ['', ''];

// Canvas
let canvas, ctx;
let W = 0, H = 0;

// Game objects
let ball = { x: 0, y: 0, vx: 0, vy: 0, trail: [] };
let paddles = [
    { y: 0, vy: 0, h: PADDLE_H_BASE, score: 0, activePU: null, puTimer: 0 },
    { y: 0, vy: 0, h: PADDLE_H_BASE, score: 0, activePU: null, puTimer: 0 }
];
let powerUps    = [];  // { id, type, x, y, collected }
let puSpawnTimer = 0;
let puIdCounter  = 0;
let gamePhase    = 'idle';  // idle | countdown | playing | scored | ended
let countdownVal = 3;
let countdownTimer = 0;
let lastTime     = 0;
let rallyHits    = 0;

// Input
let myPaddleY    = 0;   // mouse/touch controlled paddle Y (center)
let keysDown     = {};
let lastPushedPaddleY = 0;
let lastPushTime  = 0;   // paddle-move throttle
let lastStatePush = 0;   // host ball-state push throttle (must stay separate)

// Online
let ballTarget   = { x: 0, y: 0, vx: 0, vy: 0 }; // interpolation target for joiner
let lastSyncTime = 0;

// ── SYSTEM UI ────────────────────────────────
SystemUI.init({
    gameName: 'PONG',
    rules: 'First to 7 points wins. Mouse/touch or W/S and ↑/↓ keys to move your paddle. Grab power-ups to boost your paddle or mess with your opponent.',
    hudDropdowns: [
        { id: 'pong-mode', options: [{ value: 'ai', label: '🤖 vs AI' }, { value: 'online', label: '🌐 Online' }] },
        { id: 'pong-diff', label: 'AI', options: [{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }] }
    ]
});

const checkDB = setInterval(() => {
    if (window.pongFirebaseReady || window.db) { clearInterval(checkDB); initPong(); }
}, 50);

// ── INIT ─────────────────────────────────────
function initPong() {
    canvas = document.getElementById('pong-canvas');
    ctx    = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mode dropdown
    const modeEl = document.getElementById('pong-mode');
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener('change', e => {
            gameMode = e.target.value;
            if (gameMode === 'online') {
                SystemUI.v2Lobby.show();
            } else {
                SystemUI.v2Lobby.hide();
                if (roomListener) { roomListener(); roomListener = null; }
                // Tear down hosted room / joined seat so it can't ghost in Firebase
                if (window.SystemMatch) SystemMatch.cleanup();
                SystemUI.stopChat(); chatStarted = false;
                myId = 1; isHost = true;
                resetGame();
                startCountdown();
            }
        });
    }

    // Difficulty dropdown
    const diffEl = document.getElementById('pong-diff');
    if (diffEl) {
        diffEl.value = aiDifficulty;
        diffEl.addEventListener('change', e => {
            aiDifficulty = e.target.value;
            localStorage.setItem('pong_diff', aiDifficulty);
        });
    }

    // Mouse
    canvas.addEventListener('mousemove', onMouseMove);
    // Touch
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    // Keys
    window.addEventListener('keydown', e => { keysDown[e.key] = true; });
    window.addEventListener('keyup',   e => { keysDown[e.key] = false; });

    // Play again
    document.getElementById('play-again-btn').addEventListener('click', onPlayAgain);

    resetGame();
    startCountdown();
    requestAnimationFrame(gameLoop);
}

// ── RESIZE ───────────────────────────────────
function resizeCanvas() {
    const outer = document.getElementById('game-outer');
    W = outer.clientWidth;
    H = outer.clientHeight;
    canvas.width  = W;
    canvas.height = H;
    // Reposition paddles on resize
    if (paddles[0]) {
        paddles[0].y = H / 2;
        paddles[1].y = H / 2;
    }
    myPaddleY = H / 2;
}

// ── RESET / COUNTDOWN ────────────────────────
function resetGame() {
    paddles[0].y = H / 2;  paddles[0].h = PADDLE_H_BASE;  paddles[0].score = 0;
    paddles[0].activePU = null; paddles[0].puTimer = 0;
    paddles[1].y = H / 2;  paddles[1].h = PADDLE_H_BASE;  paddles[1].score = 0;
    paddles[1].activePU = null; paddles[1].puTimer = 0;
    myPaddleY  = H / 2;
    powerUps   = [];
    puSpawnTimer = PU_SPAWN_INTERVAL;
    puIdCounter = 0;
    rallyHits  = 0;
    gamePhase  = 'idle';
    lastTime   = 0;
}

function startCountdown(lastScorer = 0) {
    gamePhase      = 'countdown';
    countdownVal   = 3;
    countdownTimer = 1.0;
    resetBall(lastScorer);
}

function resetBall(lastScorer) {
    ball.x  = W / 2;
    ball.y  = H / 2;
    ball.trail = [];
    rallyHits  = 0;
    // Direction: toward the player who just got scored on
    const dir = lastScorer === 0 ? 1 : -1;
    const angle = (Math.random() * 0.6 - 0.3);  // slight random angle
    const spd = BALL_SPEED_BASE;
    ball.vx = Math.cos(angle) * spd * dir;
    ball.vy = Math.sin(angle) * spd;
}

// ── INPUT ─────────────────────────────────────
function getMyPaddleIdx() {
    if (gameMode === 'online') return myId - 1;
    return 0; // AI mode: player always left paddle
}

function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const sy   = canvas.height / rect.height;
    myPaddleY = (e.clientY - rect.top) * sy;
}

function onTouchStart(e) {
    e.preventDefault();
    updateTouchY(e);
}
function onTouchMove(e) {
    e.preventDefault();
    updateTouchY(e);
}
function updateTouchY(e) {
    const rect = canvas.getBoundingClientRect();
    const sy   = canvas.height / rect.height;
    // Use the touch on the correct side of the screen
    for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const tx = (t.clientX - rect.left) * (canvas.width / rect.width);
        const myIdx = getMyPaddleIdx();
        // Left player touches left half, right player touches right half
        if (myIdx === 0 && tx < W / 2) {
            myPaddleY = (t.clientY - rect.top) * sy;
        } else if (myIdx === 1 && tx > W / 2) {
            myPaddleY = (t.clientY - rect.top) * sy;
        }
    }
}

function applyKeyInput(dt) {
    const spd = 500;
    // Keys drive the local player's paddle via myPaddleY so they compose with
    // mouse/touch instead of being clobbered by it — and never touch the
    // opponent's (AI/remote) paddle.
    if (keysDown['w'] || keysDown['W'] || keysDown['ArrowUp'])   myPaddleY -= spd * dt;
    if (keysDown['s'] || keysDown['S'] || keysDown['ArrowDown']) myPaddleY += spd * dt;
    myPaddleY = Math.max(0, Math.min(H, myPaddleY));
}

// ── GAME LOOP ─────────────────────────────────
function gameLoop(ts) {
    const dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = ts;
    update(dt, ts);
    render();
    requestAnimationFrame(gameLoop);
}

function update(dt, ts) {
    if (gamePhase === 'countdown') {
        updateCountdown(dt);
        return;
    }
    if (gamePhase !== 'playing') return;

    // ── Paddle input ──────────────────────────
    const myIdx = getMyPaddleIdx();
    applyKeyInput(dt);
    paddles[myIdx].y = myPaddleY;

    // Clamp paddles
    for (let i = 0; i < 2; i++) {
        const ph = paddles[i].h;
        paddles[i].y = Math.max(ph / 2, Math.min(H - ph / 2, paddles[i].y));
    }

    // ── Online: send my paddle position ───────
    if (gameMode === 'online') {
        const now = ts;
        if (Math.abs(paddles[myIdx].y - lastPushedPaddleY) > 1 || now - lastPushTime > 100) {
            sendPaddleMove(paddles[myIdx].y);
            lastPushedPaddleY = paddles[myIdx].y;
            lastPushTime = now;
        }
        // Joiner: interpolate ball toward host state
        if (!isHost) {
            ball.x += (ballTarget.x - ball.x) * 0.35;
            ball.y += (ballTarget.y - ball.y) * 0.35;
            return; // joiner doesn't run physics
        }
    }

    // ── Ball physics (host / AI mode only) ────
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 10) ball.trail.shift();

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Top / bottom walls
    if (ball.y - BALL_R < 0) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
    }
    if (ball.y + BALL_R > H) {
        ball.y = H - BALL_R;
        ball.vy = -Math.abs(ball.vy);
    }

    // ── Paddle collisions ─────────────────────
    checkPaddleCollision(0, dt);
    checkPaddleCollision(1, dt);

    // ── Power-up spawn (host only) ────────────
    puSpawnTimer -= dt * 1000;
    if (puSpawnTimer <= 0) {
        spawnPowerUp();
        puSpawnTimer = PU_SPAWN_INTERVAL;
    }

    // ── Power-up collection ───────────────────
    for (const pu of powerUps) {
        if (pu.collected) continue;
        if (Math.hypot(ball.x - pu.x, ball.y - pu.y) < BALL_R + 18) {
            pu.collected = true;
            applyPowerUp(pu.type, pu.owner);
        }
    }

    // ── Power-up timers ───────────────────────
    for (let i = 0; i < 2; i++) {
        if (paddles[i].activePU) {
            paddles[i].puTimer -= dt * 1000;
            if (paddles[i].puTimer <= 0) {
                removePowerUp(i);
            }
        }
    }

    // ── Scoring ───────────────────────────────
    if (ball.x - BALL_R < 0) {
        // Right player scores
        scorePoint(1);
        return;
    }
    if (ball.x + BALL_R > W) {
        // Left player scores
        scorePoint(0);
        return;
    }

    // ── Push state to joiner ──────────────────
    if (gameMode === 'online' && isHost) {
        const now = ts;
        if (now - lastStatePush > PUSH_INTERVAL) {
            lastStatePush = now;
            pushBallState();
        }
    }
}

function updateCountdown(dt) {
    countdownTimer -= dt;
    if (countdownTimer <= 0) {
        countdownVal--;
        if (countdownVal <= 0) {
            gamePhase = 'playing';
        } else {
            countdownTimer = 1.0;
        }
    }
}

// ── PADDLE COLLISION ─────────────────────────
function checkPaddleCollision(idx, dt) {
    const pd  = paddles[idx];
    const px  = idx === 0 ? PADDLE_W : W - PADDLE_W;
    const top = pd.y - pd.h / 2;
    const bot = pd.y + pd.h / 2;

    if (idx === 0) {
        if (ball.x - BALL_R <= px && ball.x - BALL_R >= px - 16 &&
            ball.y >= top && ball.y <= bot && ball.vx < 0) {
            ball.x  = px + BALL_R;
            bouncePaddle(idx);
        }
    } else {
        if (ball.x + BALL_R >= px && ball.x + BALL_R <= px + 16 &&
            ball.y >= top && ball.y <= bot && ball.vx > 0) {
            ball.x  = px - BALL_R;
            bouncePaddle(idx);
        }
    }
}

function bouncePaddle(idx) {
    const pd   = paddles[idx];
    const rel  = (ball.y - pd.y) / (pd.h / 2);  // -1 to 1
    const maxAngle = 65 * Math.PI / 180;
    const angle = rel * maxAngle;
    const spd = Math.min(Math.hypot(ball.vx, ball.vy) + BALL_SPEED_INC, BALL_SPEED_MAX);

    if (idx === 0) {
        ball.vx =  Math.cos(angle) * spd;
    } else {
        ball.vx = -Math.cos(angle) * spd;
    }
    ball.vy = Math.sin(angle) * spd;
    rallyHits++;
}

// ── SCORING ───────────────────────────────────
function scorePoint(scorerIdx) {
    paddles[scorerIdx].score++;
    gamePhase = 'scored';

    if (gameMode === 'online' && isHost) pushFullState();

    // Check win
    if (paddles[scorerIdx].score >= WIN_SCORE) {
        setTimeout(() => endGame(scorerIdx), 800);
        return;
    }

    // Reset and countdown again — serve toward whoever just got scored on
    setTimeout(() => {
        startCountdown(scorerIdx);
        if (gameMode === 'online' && isHost) pushFullState();
    }, 1000);
}

function endGame(winnerIdx) {
    gamePhase = 'ended';
    const isMyWin = (gameMode === 'ai' && winnerIdx === 0) ||
                    (gameMode === 'online' && winnerIdx === myId - 1);

    if (isMyWin) sessionScore[0]++; else sessionScore[1]++;

    if (typeof SystemStats !== 'undefined') {
        if (isMyWin) SystemStats.recordWin('pong', 0);
        else SystemStats.recordLoss('pong');
    }

    if (gameMode === 'online' && isHost) pushFullState();

    const wName = playerNames[winnerIdx] || (winnerIdx === 0 ? 'Player 1' : (gameMode === 'ai' ? '🤖 AI' : 'Player 2'));
    document.getElementById('modal-title').innerText = isMyWin ? '🏆 YOU WIN!' : '💀 YOU LOSE!';
    document.getElementById('modal-msg').innerText   = `${wName} wins ${paddles[0].score} – ${paddles[1].score}`;
    document.getElementById('modal-session').innerText = `Session: ${sessionScore[0]} – ${sessionScore[1]}`;
    document.getElementById('result-modal').classList.remove('hidden');
}

function onPlayAgain() {
    // Joiner can't restart the match — resetting locally would fake a
    // countdown against a dead ball. Wait for the host's status write, which
    // the room listener turns into a real reset on both clients.
    if (gameMode === 'online' && !isHost) {
        document.getElementById('modal-msg').innerText = 'Waiting for host to restart…';
        return;
    }
    document.getElementById('result-modal').classList.add('hidden');
    if (gameMode === 'online' && isHost && currentRoomId) {
        window.dbUpdate(window.dbRef(window.db, 'pong_rooms/' + currentRoomId), {
            status: 'playing', ts: Date.now()
        });
    }
    resetGame();
    startCountdown();
}

// ── POWER-UPS ─────────────────────────────────
function spawnPowerUp() {
    // Bias toward the player who's losing
    const loserIdx = paddles[0].score <= paddles[1].score ? 0 : 1;
    const owner    = loserIdx;
    const type     = PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)];
    const x = W * 0.3 + Math.random() * W * 0.4;
    const y = H * 0.15 + Math.random() * H * 0.7;
    powerUps.push({ id: puIdCounter++, type, x, y, owner, collected: false });
    // Trim old uncollected power-ups
    if (powerUps.filter(p => !p.collected).length > 3) {
        const old = powerUps.find(p => !p.collected);
        if (old) old.collected = true;
    }
}

function applyPowerUp(type, owner) {
    const pd = paddles[owner];
    // Remove existing PU first
    if (pd.activePU) removePowerUp(owner);
    pd.activePU = type;
    pd.puTimer  = PU_DURATION;

    if (type === 'big')    pd.h = PADDLE_H_BASE * 1.75;
    if (type === 'shrink') {
        // Shrink opponent
        const opp = paddles[1 - owner];
        if (opp.activePU) removePowerUp(1 - owner);
        opp.activePU = 'shrink';
        opp.puTimer  = PU_DURATION;
        opp.h = PADDLE_H_BASE * 0.5;
        pd.activePU = null; pd.puTimer = 0; // shrink applies to opponent
    }
    if (type === 'speed') {
        ball.vx *= 1.35;
        ball.vy *= 1.35;
    }
    if (type === 'slow') {
        ball.vx *= 0.65;
        ball.vy *= 0.65;
    }
}

function removePowerUp(playerIdx) {
    paddles[playerIdx].activePU = null;
    paddles[playerIdx].puTimer  = 0;
    paddles[playerIdx].h = PADDLE_H_BASE;
}

// ── AI ────────────────────────────────────────
function updateAI(dt) {
    if (gameMode !== 'ai') return;
    const react = aiDifficulty === 'easy' ? AI_REACT_EASY :
                  aiDifficulty === 'normal' ? AI_REACT_NORMAL : AI_REACT_HARD;

    // Predict where ball will be at paddle X
    let predictY = ball.y;
    if (ball.vx > 0) {
        // Ball heading toward AI (right paddle)
        const timeToReach = (W - PADDLE_W - BALL_R - ball.x) / ball.vx;
        predictY = ball.y + ball.vy * timeToReach;
        // Bounce off walls
        const bounces = Math.floor(predictY / H);
        if (bounces % 2 === 0) predictY = predictY % H;
        else predictY = H - (predictY % H);
        predictY = Math.max(0, Math.min(H, predictY));

        // Add noise based on difficulty
        const noise = aiDifficulty === 'easy' ? 60 : aiDifficulty === 'normal' ? 25 : 6;
        predictY += (Math.random() - 0.5) * noise;
    } else {
        predictY = H / 2; // ball going away, return to center
    }

    const diff = predictY - paddles[1].y;
    const maxMove = react * H;
    paddles[1].y += Math.sign(diff) * Math.min(Math.abs(diff), maxMove);
    paddles[1].y = Math.max(paddles[1].h / 2, Math.min(H - paddles[1].h / 2, paddles[1].y));
}

// ── RENDERING ─────────────────────────────────
function render() {
    ctx.clearRect(0, 0, W, H);

    drawBG();
    drawCenterLine();
    drawScores();
    drawPowerUps();
    drawPaddles();
    drawBall();
    drawPaddlePUIndicators();

    if (gamePhase === 'countdown') drawCountdown();
    if (gamePhase === 'scored')    drawScoredFlash();
}

function drawBG() {
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, W, H);
}

function drawCenterLine() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function drawScores() {
    ctx.save();
    ctx.font      = `bold ${Math.min(W * 0.08, 64)}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Left score
    const activeLeft = gamePhase === 'playing' && (gameMode === 'ai' ? true : myId === 1);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText(paddles[0].score, W * 0.25, H * 0.04);

    // Right score
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText(paddles[1].score, W * 0.75, H * 0.04);

    // Player name labels
    const nameSize = Math.min(W * 0.022, 14);
    ctx.font = `bold ${nameSize}px Orbitron, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const n0 = playerNames[0] || (gameMode === 'ai' ? (SystemUI.getPlayerName ? SystemUI.getPlayerName() : 'YOU') : 'P1');
    const n1 = playerNames[1] || (gameMode === 'ai' ? '🤖 AI' : 'P2');
    ctx.fillText(n0, W * 0.25, H * 0.04 + Math.min(W * 0.08, 64) + 6);
    ctx.fillText(n1, W * 0.75, H * 0.04 + Math.min(W * 0.08, 64) + 6);

    ctx.restore();
}

function drawPaddle(idx) {
    const pd = paddles[idx];
    const x  = idx === 0 ? PADDLE_W / 2 : W - PADDLE_W / 2;
    const pu = pd.activePU;
    const color = pu ? PU_COLORS[pu] : (idx === 0 ? '#00d2ff' : '#ff6b6b');
    const glowColor = pu ? PU_COLORS[pu] : (idx === 0 ? '#00d2ff' : '#ff6b6b');

    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = pu ? 22 : 14;

    const grad = ctx.createLinearGradient(x - PADDLE_W / 2, 0, x + PADDLE_W / 2, 0);
    grad.addColorStop(0,   idx === 0 ? color : 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1,   idx === 0 ? 'rgba(255,255,255,0.05)' : color);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x - PADDLE_W / 2, pd.y - pd.h / 2, PADDLE_W, pd.h, 5);
    ctx.fill();
    ctx.restore();
}

function drawPaddles() {
    drawPaddle(0);
    drawPaddle(1);
}

function drawPaddlePUIndicators() {
    for (let i = 0; i < 2; i++) {
        const pd = paddles[i];
        if (!pd.activePU) continue;
        const x = i === 0 ? PADDLE_W + 10 : W - PADDLE_W - 10;
        const pct = pd.puTimer / PU_DURATION;
        const barH = pd.h * pct;
        ctx.save();
        ctx.fillStyle = PU_COLORS[pd.activePU] + '55';
        ctx.fillRect(i === 0 ? PADDLE_W : W - PADDLE_W * 2, pd.y - pd.h / 2, PADDLE_W, pd.h);
        ctx.fillStyle = PU_COLORS[pd.activePU];
        ctx.fillRect(i === 0 ? PADDLE_W : W - PADDLE_W * 2, pd.y + pd.h / 2 - barH, PADDLE_W, barH);
        ctx.restore();
    }
}

function drawBall() {
    if (gamePhase !== 'playing' && gamePhase !== 'scored') return;

    // Trail
    for (let i = 0; i < ball.trail.length; i++) {
        const t = ball.trail[i];
        const alpha = (i / ball.trail.length) * 0.35;
        const r     = BALL_R * (i / ball.trail.length) * 0.8;
        ctx.save();
        ctx.beginPath();
        ctx.arc(t.x, t.y, Math.max(1, r), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
        ctx.restore();
    }

    // Ball
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
}

function drawPowerUps() {
    for (const pu of powerUps) {
        if (pu.collected) continue;
        ctx.save();
        ctx.shadowColor = PU_COLORS[pu.type];
        ctx.shadowBlur  = 16;
        // Pulsing circle
        const pulse = 0.85 + Math.sin(Date.now() / 300) * 0.15;
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, 18 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = PU_COLORS[pu.type] + '33';
        ctx.fill();
        ctx.strokeStyle = PU_COLORS[pu.type];
        ctx.lineWidth = 2;
        ctx.stroke();
        // Emoji
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 0;
        ctx.fillText(PU_LABELS[pu.type], pu.x, pu.y);
        ctx.restore();
    }
}

function drawCountdown() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.font      = `bold ${Math.min(W * 0.22, 140)}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f1c40f';
    ctx.shadowColor = '#f1c40f';
    ctx.shadowBlur  = 40;
    ctx.fillText(countdownVal, W / 2, H / 2);
    ctx.restore();
}

function drawScoredFlash() {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
}

// ── UPDATE (wraps AI + physics call) ─────────
const _origUpdate = update;
// Patch: after ball physics, run AI
const _updateWithAI = function(dt, ts) {
    _origUpdate(dt, ts);
    if (gamePhase === 'playing') updateAI(dt);
};
// Replace the game loop's update reference
Object.defineProperty(window, '_pongUpdate', { value: _updateWithAI, writable: false });

// Re-wire gameLoop to use AI
function gameLoop(ts) {
    const dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = ts;
    update(dt, ts);
    if (gamePhase === 'playing') updateAI(dt);
    render();
    requestAnimationFrame(gameLoop);
}

// ── ONLINE MULTIPLAYER ────────────────────────
SystemMatch.setup({
    gameId:   "pong",
    roomPath: "pong_rooms",
    autoShow: false,
    extraRoomFields: () => ({ ts: Date.now() }),
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1;
        lastSyncTime = 0; lastPushTime = 0; lastStatePush = 0; lastPushedPaddleY = 0; // fresh room — drop stale timestamps
        playerNames[0] = SystemUI.getPlayerName ? SystemUI.getPlayerName() : 'P1';
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; myId = 2;
        lastSyncTime = 0; lastPushTime = 0; lastStatePush = 0; lastPushedPaddleY = 0; // fresh room — drop stale timestamps
        const seats = SystemMatch.getSeats();
        playerNames[0] = (seats[0] && seats[0].name) || 'P1';
        playerNames[1] = SystemUI.getPlayerName ? SystemUI.getPlayerName() : 'P2';
        listenToRoom();
    },
    onLeave: () => {
        if (roomListener) { roomListener(); roomListener = null; }
        chatStarted = false;
        myId = 1; isHost = true; gameMode = 'ai';
        const modeEl = document.getElementById('pong-mode');
        if (modeEl) modeEl.value = 'ai';
        resetGame(); startCountdown();
    },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'pong_rooms/' + currentRoomId), { status: 'playing', ts: Date.now() });
        }
    }
});

function listenToRoom() {
    roomListener = window.dbOnValue(window.dbRef(window.db, 'pong_rooms/' + currentRoomId), snap => {
        const data = snap.val();
        if (!data) {
            // Room node removed — the host quit. Don't freeze the joiner.
            if (currentRoomId && !isHost) exitOnlineMode('HOST LEFT THE GAME');
            return;
        }
        if (data.status === 'abandoned') {
            // Joiner closed their tab mid-game
            if (currentRoomId && isHost) exitOnlineMode('OPPONENT LEFT THE GAME');
            return;
        }

        if (data.seats) {
            SystemUI.v2Lobby.renderSeats(data.seats);
            if (data.seats[0]) playerNames[0] = data.seats[0].name || playerNames[0];
            if (data.seats[1] && data.seats[1].type === 'human') playerNames[1] = data.seats[1].name || playerNames[1];
        }

        if (data.status === 'playing') {
            SystemUI.v2Lobby.hide();
            gameMode = 'online';
            document.getElementById('result-modal').classList.add('hidden');
            if (!chatStarted) { chatStarted = true; SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); }
            if (isHost && (gamePhase === 'idle' || gamePhase === 'ended')) {
                resetGame(); startCountdown();
            } else if (!isHost && (gamePhase === 'idle' || gamePhase === 'ended')) {
                resetGame(); startCountdown();
            }
        }

        // Receive full state (host → joiner)
        if (data.fullState && !isHost) {
            const s = data.fullState;
            if (s.ts > lastSyncTime) {
                lastSyncTime = s.ts;
                // Ball: set interpolation target (wire values are fractions —
                // scale by our own field size)
                ballTarget.x  = s.bx * W;
                ballTarget.y  = s.by * H;
                ballTarget.vx = s.bvx * W;
                ballTarget.vy = s.bvy * H;
                // Sync ball directly if we're not playing yet
                if (gamePhase !== 'playing') {
                    ball.x = s.bx * W; ball.y = s.by * H;
                }
                // Scores, phase, power-ups
                paddles[0].score = s.s0;
                paddles[1].score = s.s1;
                paddles[0].h     = s.h0;
                paddles[1].h     = s.h1;
                if (s.phase !== undefined && gamePhase !== 'playing') {
                    gamePhase = s.phase;
                }
                if (s.phase === 'scored' || s.phase === 'ended') {
                    gamePhase = s.phase;
                }
                if (s.phase === 'countdown') {
                    gamePhase     = 'countdown';
                    countdownVal  = s.cdv || 3;
                    countdownTimer = s.cdt || 1.0;
                }
                if (s.pus) {
                    try {
                        powerUps = JSON.parse(s.pus).map(p =>
                            Object.assign({}, p, { x: p.x * W, y: p.y * H }));
                    } catch(e) {}
                }
                if (s.phase === 'ended') {
                    const winnerIdx = s.s0 >= WIN_SCORE ? 0 : 1;
                    setTimeout(() => endGame(winnerIdx), 200);
                }
            }
        }

        // Receive opponent paddle move (fraction of sender's field height)
        if (data.paddleMove) {
            const pm = data.paddleMove;
            const oppIdx = isHost ? 1 : 0;
            if (pm.id !== (isHost ? 'joiner' : 'host')) return; // ignore own echoes
            paddles[oppIdx].y = pm.y * H;
        }
    });
}

// The opponent vanished — clean up and drop back to vs-AI mode with a notice.
function exitOnlineMode(message) {
    if (roomListener) { roomListener(); roomListener = null; }
    if (window.SystemMatch) {
        // Room is already gone when the host left — blank the seats first so
        // cleanup() doesn't write a ghost seat-release into a deleted room.
        if (!isHost) SystemMatch.setSeats([]);
        SystemMatch.cleanup(); // host: removes room node; both: stops chat
    }
    currentRoomId = null;
    chatStarted = false;
    SystemUI.v2Lobby.hide();
    gameMode = 'ai';
    const modeEl = document.getElementById('pong-mode');
    if (modeEl) modeEl.value = 'ai';
    myId = 1; isHost = true;
    playerNames = ['', ''];
    resetGame();
    document.getElementById('modal-title').innerText   = message;
    document.getElementById('modal-msg').innerText     = 'Returning to vs AI…';
    document.getElementById('modal-session').innerText = '';
    document.getElementById('result-modal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('result-modal').classList.add('hidden');
        if (gameMode === 'ai' && gamePhase === 'idle') startCountdown();
    }, 2500);
}

// Joiner closing the tab mid-game flags the room abandoned so the host's
// listener can react. (Host tab-close removal is handled by SystemMatch.)
window.addEventListener('beforeunload', () => {
    if (gameMode === 'online' && currentRoomId && !isHost && chatStarted && window.db && window.dbUpdate) {
        try { window.dbUpdate(window.dbRef(window.db, 'pong_rooms/' + currentRoomId), { status: 'abandoned' }); } catch (e) {}
    }
});

function pushBallState() {
    if (!isHost || gameMode !== 'online') return;
    // Everything crossing the wire is normalized to fractions of the sender's
    // field (x/W, y/H) — the receiver scales by its own W/H, so play stays
    // consistent across different window sizes.
    window.dbUpdate(window.dbRef(window.db, 'pong_rooms/' + currentRoomId), {
        fullState: {
            bx: +(ball.x / W).toFixed(4), by: +(ball.y / H).toFixed(4),
            bvx: +(ball.vx / W).toFixed(4), bvy: +(ball.vy / H).toFixed(4),
            s0: paddles[0].score, s1: paddles[1].score,
            h0: paddles[0].h, h1: paddles[1].h,
            phase: gamePhase,
            cdv: countdownVal, cdt: +(countdownTimer.toFixed(2)),
            pus: JSON.stringify(powerUps.filter(p => !p.collected).map(p => ({
                id: p.id, type: p.type, owner: p.owner, collected: false,
                x: +(p.x / W).toFixed(4), y: +(p.y / H).toFixed(4)
            }))),
            ts: Date.now()
        }
    });
}

function pushFullState() {
    if (!isHost || gameMode !== 'online') return;
    pushBallState();
}

function sendPaddleMove(y) {
    if (!currentRoomId) return;
    // Paddle Y is sent as a fraction of the sender's field height
    window.dbUpdate(window.dbRef(window.db, 'pong_rooms/' + currentRoomId), {
        paddleMove: { y: +(y / H).toFixed(4), id: isHost ? 'host' : 'joiner', ts: Date.now() }
    });
}