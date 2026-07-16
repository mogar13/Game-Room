// =============================================
// BOWMAN — bowman_app.js
// The Game Shack | Casino OS (V2 Engine)
// =============================================


// ── AUDIO ─────────────────────────────────────
const sfxBowLoad    = new Audio('../../system/audio/bow-load.mp3');
const sfxBowRelease = new Audio('../../system/audio/bow-release.mp3');
const sfxThud       = new Audio('../../system/audio/thud-impact.mp3');
const sfxPlayerHit  = new Audio('../../system/audio/player-hit.mp3');
const sfxSmallBoom  = new Audio('../../system/audio/small-boom.mp3');
const sfxWetHit     = new Audio('../../system/audio/wet-hit.mp3');
const sfxBounce     = new Audio('../../system/audio/bounce.mp3');

function playBowSound(snd) {
    if (window.SystemAudio && window.SystemAudio.isMuted) return;
    snd.pause(); snd.currentTime = 0; snd.play().catch(() => {});
}

// ── MODE & ONLINE STATE ──────────────────────
let gameMode = 'ai';
localStorage.setItem('bowman_mode', 'ai');
let aiDifficulty = localStorage.getItem('bowman_diff') || 'normal';

let myId = 1;
let isHost = true;
let currentRoomId = null;
let roomListener = null;
let chatStarted = false;
let lastActionTs = 0;
let lastSyncTime = 0;

// ── CONSTANTS ────────────────────────────────
const GRAVITY = 380;
const MAX_POWER = 880;
const MAX_DRAG = 130;
const PU_ICONS = { shield: '🛡️', explosive: '💣', bouncy: '↩️', medkit: '❤️' };
const PU_TYPES = ['shield', 'explosive', 'bouncy', 'medkit'];
const DAMAGE = {
    head:     { normal: 44, explosive: 60, bouncy: 35 },
    body:     { normal: 24, explosive: 36, bouncy: 19 },
    leftArm:  { normal: 13, explosive: 20, bouncy: 10 },
    rightArm: { normal: 13, explosive: 20, bouncy: 10 },
    leftLeg:  { normal: 11, explosive: 17, bouncy:  9 },
    rightLeg: { normal: 11, explosive: 17, bouncy:  9 }
};

// ── CANVAS / VIRTUAL COORDINATES ─────────────
// ALL game logic runs in a fixed virtual space so that two players with
// different window sizes simulate the exact same battlefield. (Previously
// physics ran in raw canvas pixels: the wall, player positions and arrow
// trajectories differed per client, so hits/misses desynced constantly.)
const VW = 1280, VH = 720;
let canvas, ctx;
let W = VW, H = VH, groundY = VH * 0.78;
let viewScale = 1, viewOffX = 0, viewOffY = 0, viewDpr = 1;

// ── GAME STATE ───────────────────────────────
let gameActive = false;
let isAnimating = false;
let activeTurn = 0;
let roundNum = 0;
let wind = 0;
let lastTime = 0;

let players = [
    { hp: 100, name: 'You',      x: VW * 0.20, shield: false, arrows: { normal: 99, explosive: 2, bouncy: 2 } },
    { hp: 100, name: 'Opponent', x: VW * 0.80, shield: false, arrows: { normal: 99, explosive: 2, bouncy: 2 } }
];

let selectedArrow = 'normal';
let arrow = null;
let arrowTrail = [];
let powerUps = [];
let explosion = null;
let msgText = '';
let msgTimer = 0;

// ── MOVEMENT & WALL STATE ────────────────────
const playerBaseX = [VW * 0.20, VW * 0.80];  // home positions (virtual units)
let sessionScore = [0, 0];  // [myWins, opponentWins] for this session
let stuckArrow = null;      // { x, y, angle } shown briefly after a miss
let onlineSettings = { wind: 'on_medium', move: 'off', wall: 'off' }; // host-authoritative settings for online
let moveTime = 0;           // accumulates dt for oscillation
let gameEnded = false;      // true once a winner has been announced this round
let pendingBowState = null; // gameState deferred while a local arrow is in flight
let wallEnabled = false;
let wallX = VW / 2;
const WALL_W = 14;
const WALL_H_RATIO = 1.45;  // taller than the player (~100px player height)

// ── AIMING ───────────────────────────────────
let aiming = false;
let aimOrigin = null;   // fixed archer bow position (where arrow fires from)
let aimStart = null;    // where the drag started (for direction calc)
let aimCurrent = null;  // current mouse/touch position

// ── SYSTEM UI INIT ───────────────────────────
SystemUI.init({
    gameName: 'BOWMAN',
    rules: 'Drag back on YOUR side of the screen to aim and release to fire. Hit the opponent to reduce their HP. Collect power-ups mid-flight! Wind affects your arrows — watch the indicator.',
    hudDropdowns: [
        { id: 'bw-mode',  options: [{ value: 'ai', label: '🤖 vs AI' }, { value: 'online', label: '🌐 Online' }] },
        { id: 'bw-diff',  label: 'AI', options: [{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Hard' }] },
        { id: 'bw-wind',  label: 'Wind', options: [{ value: 'off', label: '🌬️ Off' }, { value: 'on_light', label: '💨 Light' }, { value: 'on_medium', label: '💨💨 Medium' }, { value: 'on_strong', label: '💨💨💨 Strong' }] },
        { id: 'bw-move',  label: 'Move', options: [{ value: 'off', label: '🧍 Still' }, { value: 'slow', label: '🚶 Slow' }, { value: 'fast', label: '🏃 Fast' }] },
        { id: 'bw-wall',  label: 'Wall', options: [{ value: 'off', label: '🚫 No Wall' }, { value: 'on', label: '🧱 Wall' }] }
    ]
});

const checkDBReady = setInterval(() => {
    if (window.db) { clearInterval(checkDBReady); initBowman(); }
}, 50);

// ── INIT ─────────────────────────────────────
function initBowman() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    // roundRect polyfill for older browsers
    if (!ctx.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
            this.beginPath();
            this.moveTo(x + r, y);
            this.lineTo(x + w - r, y);
            this.quadraticCurveTo(x + w, y, x + w, y + r);
            this.lineTo(x + w, y + h - r);
            this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            this.lineTo(x + r, y + h);
            this.quadraticCurveTo(x, y + h, x, y + h - r);
            this.lineTo(x, y + r);
            this.quadraticCurveTo(x, y, x + r, y);
            this.closePath();
        };
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mode dropdown
    const modeEl = document.getElementById('bw-mode');
    if (modeEl) {
        modeEl.value = gameMode;
        modeEl.addEventListener('change', (e) => {
            gameMode = e.target.value;
            localStorage.setItem('bowman_mode', gameMode);
            if (gameMode === 'online') {
                resetGame();
                document.getElementById('action-zone').classList.add('hidden');
                SystemUI.v2Lobby.show();
            } else {
                document.getElementById('action-zone').classList.remove('hidden');
                SystemUI.v2Lobby.hide();
                SystemUI.stopChat();
                chatStarted = false;
                myId = 1; isHost = true;
                if (roomListener) { roomListener(); roomListener = null; }
                // Tear down hosted room / joined seat so it can't ghost in Firebase
                if (window.SystemMatch) SystemMatch.cleanup();
                resetGame();
            }
        });
    }

    // Wind dropdown
    const windEl = document.getElementById('bw-wind');
    if (windEl) {
        windEl.value = localStorage.getItem('bowman_wind') || 'on_medium';
        windEl.addEventListener('change', (e) => {
            localStorage.setItem('bowman_wind', e.target.value);
        });
    }

    // Move dropdown
    const moveEl = document.getElementById('bw-move');
    if (moveEl) {
        moveEl.value = localStorage.getItem('bowman_move') || 'off';
        moveEl.addEventListener('change', (e) => {
            localStorage.setItem('bowman_move', e.target.value);
        });
    }

    // Wall dropdown
    const wallEl = document.getElementById('bw-wall');
    if (wallEl) {
        wallEl.value = localStorage.getItem('bowman_wall') || 'off';
        wallEl.addEventListener('change', (e) => {
            localStorage.setItem('bowman_wall', e.target.value);
            wallEnabled = e.target.value === 'on';
            wallX = W / 2;
        });
    }

    // Difficulty dropdown
    const diffEl = document.getElementById('bw-diff');
    if (diffEl) {
        diffEl.value = aiDifficulty;
        diffEl.addEventListener('change', (e) => {
            aiDifficulty = e.target.value;
            localStorage.setItem('bowman_diff', aiDifficulty);
        });
    }

    // Arrow type buttons
    document.querySelectorAll('.arrow-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const me = players[myId - 1];
            if (!gameActive || isAnimating || activeTurn !== myId - 1) return;
            if (me.arrows[type] > 0) {
                selectedArrow = type;
                document.querySelectorAll('.arrow-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
        });
    });

    // Canvas input events
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', () => { aiming = false; });
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });

    // Start / play again buttons
    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('play-again-btn').addEventListener('click', () => {
        document.getElementById('result-modal').classList.add('hidden');
        if (gameMode === 'online' && !isHost) {
            // Host owns the rematch; the fresh state push revives us.
            showMsg('⏳ Waiting for host to start the rematch…', 4);
            return;
        }
        if (gameMode === 'online' && isHost && currentRoomId) {
            window.dbUpdate(window.dbRef(window.db, 'bowman_rooms/' + currentRoomId), { status: 'playing', ts: Date.now() });
        }
        resetGame();
        if (gameMode === 'online' && isHost) setTimeout(startGame, 200);
    });

    resetGame();
}

function resizeCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    const cssW = wrapper.clientWidth;
    const cssH = wrapper.clientHeight;

    // High-DPI backing store; game space stays the fixed VW×VH virtual world,
    // letterbox-scaled to fit. Window size no longer affects the simulation.
    viewDpr = window.devicePixelRatio || 1;
    canvas.width  = cssW * viewDpr;
    canvas.height = cssH * viewDpr;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    viewScale = Math.min(cssW / VW, cssH / VH);
    viewOffX  = (cssW - VW * viewScale) / 2;
    viewOffY  = (cssH - VH * viewScale) / 2;
    render();
}

// ── GAME FLOW ─────────────────────────────────
function resetGame() {
    gameActive = false;
    gameEnded = false;
    pendingBowState = null;
    physAccum = 0;
    isAnimating = false;
    activeTurn = 0;
    roundNum = 0;
    wind = 0;
    arrow = null;
    arrowTrail = [];
    powerUps = [];
    explosion = null;
    aiming = false;
    msgText = '';
    msgTimer = 0;
    lastTime = 0;

    players[0].hp = 100; players[0].shield = false; players[0].arrows = { normal: 99, explosive: 2, bouncy: 2 };
    players[1].hp = 100; players[1].shield = false; players[1].arrows = { normal: 99, explosive: 2, bouncy: 2 };
    players[0].x = playerBaseX[0]; players[1].x = playerBaseX[1];
    moveTime = 0;
    wallEnabled = getEffectiveSetting('wall') === 'on';
    wallX = W / 2;

    selectedArrow = 'normal';
    document.querySelectorAll('.arrow-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'normal'));

    updateHPBars();
    updateArrowCounts();
    updateWindDisplay();

    if (gameMode !== 'online' || isHost) {
        document.getElementById('pre-game-btns').classList.remove('hidden');
    } else {
        document.getElementById('pre-game-btns').classList.add('hidden');
    }
    document.getElementById('in-game-controls').classList.add('hidden');

    render();
}

function startGame() {
    if (typeof SystemStats !== 'undefined') SystemStats.recordGameStart('bowman');

    document.getElementById('pre-game-btns').classList.add('hidden');
    document.getElementById('in-game-controls').classList.remove('hidden');

    gameActive = true;
    activeTurn = 0;
    roundNum = 1;
    wallEnabled = getEffectiveSetting('wall') === 'on';
    wallX = W / 2;
    wind = genWind();
    spawnPowerUps(2);

    updateWindDisplay();
    updateHPBars();
    updateArrowCounts();
    setTurnLabel();

    if (gameMode === 'online' && isHost) pushGameState();

    lastTime = 0;
    requestAnimationFrame(gameLoop);
}

function getEffectiveSetting(key) {
    if (gameMode === 'online') return onlineSettings[key] || 'off';
    return localStorage.getItem('bowman_' + key) || (key === 'wind' ? 'on_medium' : 'off');
}

function genWind() {
    const setting = getEffectiveSetting('wind');
    if (setting === 'off') return 0;
    const maxes = { on_light: 120, on_medium: 260, on_strong: 420 };
    const max = maxes[setting] || 260;
    return Math.round((Math.random() - 0.5) * 2 * max);
}

function spawnPowerUps(count) {
    const minX = Math.min(players[0].x, players[1].x) + 50;
    const maxX = Math.max(players[0].x, players[1].x) - 50;
    const wallLeft  = wallEnabled ? wallX - WALL_W / 2 - 20 : -1;
    const wallRight = wallEnabled ? wallX + WALL_W / 2 + 20 : -1;
    let attempts = 0;
    let spawned = 0;
    while (spawned < count && attempts < 30) {
        attempts++;
        if (maxX <= minX) break;
        const x = minX + Math.random() * (maxX - minX);
        // Skip positions inside the wall exclusion zone
        if (wallEnabled && x >= wallLeft && x <= wallRight) continue;
        const type = PU_TYPES[Math.floor(Math.random() * PU_TYPES.length)];
        powerUps.push({ x, y: groundY - 2, type, collected: false });
        spawned++;
    }
}

// ── GAME LOOP ─────────────────────────────────
function gameLoop(ts) {
    const dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = ts;

    update(dt);
    render();

    if (gameActive) requestAnimationFrame(gameLoop);
}

// Fixed-timestep physics so every client integrates the exact same
// trajectory regardless of monitor refresh rate / frame hitches.
const PHYS_STEP = 1 / 120;
let physAccum = 0;

function applyMovement(moveSetting) {
    const speed   = moveSetting === 'fast' ? 2.8 : 1.2;
    const maxDist = moveSetting === 'fast' ? 55  : 35;
    // Player 0 oscillates toward/away from center, player 1 mirrors
    players[0].x = playerBaseX[0] + Math.sin(moveTime * speed) * maxDist;
    players[1].x = playerBaseX[1] - Math.sin(moveTime * speed) * maxDist;
    // Keep away from wall if active
    if (wallEnabled) {
        const wallLeft = wallX - WALL_W / 2;
        const wallRight = wallX + WALL_W / 2;
        if (players[0].x > wallLeft - 30) players[0].x = wallLeft - 30;
        if (players[1].x < wallRight + 30) players[1].x = wallRight + 30;
    }
}

function update(dt) {
    if (msgTimer > 0) msgTimer -= dt;
    if (stuckArrow) { stuckArrow.timer -= dt; if (stuckArrow.timer <= 0) stuckArrow = null; }

    const moveSetting = getEffectiveSetting('move');
    const moving = gameActive && moveSetting !== 'off';

    if (arrow) {
        // While an arrow flies, advance movement + physics together in fixed
        // steps: target position during flight is then identical on both
        // clients (moveTime is synced at fire time via the shot action).
        physAccum += dt;
        while (physAccum >= PHYS_STEP && arrow) {
            physAccum -= PHYS_STEP;
            if (moving) { moveTime += PHYS_STEP; applyMovement(moveSetting); }
            updateArrow(PHYS_STEP);
        }
    } else {
        physAccum = 0;
        if (moving) { moveTime += dt; applyMovement(moveSetting); }
    }

    if (explosion) {
        explosion.radius += dt * 220;
        explosion.alpha -= dt * 2.2;
        if (explosion.alpha <= 0) explosion = null;
    }
}

// ── ARROW PHYSICS ─────────────────────────────
function fireArrow(shooterIdx, angle, power, type) {
    if (!gameActive) return;
    isAnimating = true;

    const facing = shooterIdx === 0 ? 1 : -1;
    const bx = players[shooterIdx].x + facing * 22;
    const by = groundY - 63;

    arrow = {
        x: bx, y: by,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        type,
        shooterIdx,
        bounced: false,
        active: true
    };
    arrowTrail = [];

    if (type !== 'normal') {
        players[shooterIdx].arrows[type] = Math.max(0, players[shooterIdx].arrows[type] - 1);
        updateArrowCounts();
    }
}

function updateArrow(dt) {
    if (!arrow || !arrow.active) return;

    arrowTrail.push({ x: arrow.x, y: arrow.y });
    if (arrowTrail.length > 28) arrowTrail.shift();

    const prevX = arrow.x;
    arrow.vx += wind * dt;
    arrow.vy += GRAVITY * dt;
    arrow.x += arrow.vx * dt;
    arrow.y += arrow.vy * dt;

    checkPowerUpCollision();

    const targetIdx = 1 - arrow.shooterIdx;
    const hit = checkHit(targetIdx);
    if (hit) { handleHit(hit, targetIdx); return; }

    // Wall collision — sweep check using previous position to catch fast arrows
    if (wallEnabled) {
        const wallLeft  = wallX - WALL_W / 2;
        const wallRight = wallX + WALL_W / 2;
        const wallTop   = groundY - 100 * WALL_H_RATIO;
        const crossedWall = (prevX < wallLeft && arrow.x >= wallLeft) ||
                            (prevX > wallRight && arrow.x <= wallRight) ||
                            (arrow.x >= wallLeft && arrow.x <= wallRight);
        if (crossedWall && arrow.y >= wallTop) {
            if (arrow.type === 'explosive') { triggerExplosion(arrow.x, arrow.y, -1, 0); playBowSound(sfxSmallBoom); }
            else { playBowSound(sfxThud); }
            arrowMissed();
            return;
        }
    }

    if (arrow.y >= groundY) {
        if (arrow.type === 'bouncy' && !arrow.bounced) {
            arrow.vy *= -0.55;
            arrow.y = groundY;
            arrow.bounced = true;
            playBowSound(sfxBounce);
        } else {
            if (arrow.type === 'explosive') { triggerExplosion(arrow.x, arrow.y, -1, 0); playBowSound(sfxSmallBoom); }
            else { playBowSound(sfxThud); }
            arrowMissed();
        }
        return;
    }

    if (arrow.x < -150 || arrow.x > W + 150 || arrow.y < -400) {
        arrowMissed();
    }
}

function getHitboxes(px, gy) {
    return {
        head:     { cx: px,       cy: gy - 87, r: 13 },
        body:     { x: px - 8,   y: gy - 73,  w: 16, h: 38 },
        leftArm:  { x: px - 33,  y: gy - 73,  w: 27, h: 9  },
        rightArm: { x: px + 6,   y: gy - 73,  w: 27, h: 9  },
        leftLeg:  { x: px - 22,  y: gy - 34,  w: 11, h: 34 },
        rightLeg: { x: px + 11,  y: gy - 34,  w: 11, h: 34 }
    };
}

function checkHit(targetIdx) {
    if (!arrow) return null;
    const p = players[targetIdx];
    const b = getHitboxes(p.x, groundY);

    const hx = arrow.x - b.head.cx, hy = arrow.y - b.head.cy;
    if (Math.sqrt(hx * hx + hy * hy) < b.head.r + 5) return { part: 'head' };

    for (const part of ['body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
        const bx = b[part];
        if (arrow.x >= bx.x && arrow.x <= bx.x + bx.w && arrow.y >= bx.y && arrow.y <= bx.y + bx.h) {
            return { part };
        }
    }
    return null;
}

function handleHit(hit, targetIdx) {
    const target = players[targetIdx];
    let dmg = (DAMAGE[hit.part] || DAMAGE.body)[arrow.type] || 20;

    if (arrow.type === 'explosive') { triggerExplosion(arrow.x, arrow.y, targetIdx, dmg); playBowSound(sfxWetHit); }
    else { playBowSound(sfxPlayerHit); }

    if (target.shield) {
        target.shield = false;
        updateShieldIcon(targetIdx);
        showMsg('🛡️ Shield blocked the hit!', 2.2);
        dmg = 0;
    } else {
        target.hp = Math.max(0, target.hp - dmg);
        const pn = { head: 'HEAD', body: 'BODY', leftArm: 'ARM', rightArm: 'ARM', leftLeg: 'LEG', rightLeg: 'LEG' };
        showMsg(`💥 Hit ${pn[hit.part]}! −${dmg} HP`, 2);
    }

    arrow = null;
    arrowTrail = [];
    updateHPBars();
    setTimeout(() => {
        if (gameMode !== 'online' || isHost) {
            if (!checkWin()) endTurn();
        } else {
            isAnimating = false;
            setTurnLabel();
            flushPendingBowState();
        }
    }, 1600);
}

function arrowMissed() {
    // Leave a briefly-stuck arrow in the ground
    if (arrow && arrow.y >= groundY - 10) {
        const angle = Math.atan2(arrow.vy, arrow.vx);
        stuckArrow = { x: arrow.x, y: groundY, angle, timer: 1.4 };
    }
    arrow = null;
    arrowTrail = [];
    showMsg('Miss!', 1.4);
    setTimeout(() => {
        if (gameMode !== 'online' || isHost) {
            endTurn();
        } else {
            isAnimating = false;
            setTurnLabel();
            flushPendingBowState();
        }
    }, 1000);
}

function triggerExplosion(x, y, directIdx, directDmg) {
    explosion = { x, y, radius: 12, alpha: 1 };
    // Splash to opposite player
    for (let i = 0; i < 2; i++) {
        if (i === directIdx) continue;
        const dist = Math.abs(players[i].x - x);
        if (dist < 85) {
            const splash = Math.floor(18 * (1 - dist / 85));
            if (splash > 0 && !players[i].shield) {
                players[i].hp = Math.max(0, players[i].hp - splash);
            }
        }
    }
}

function checkPowerUpCollision() {
    for (const pu of powerUps) {
        if (pu.collected) continue;
        const dx = arrow.x - pu.x, dy = arrow.y - pu.y;
        if (Math.sqrt(dx * dx + dy * dy) < 22) {
            pu.collected = true;
            applyPowerUp(pu.type, arrow.shooterIdx);
        }
    }
}

function applyPowerUp(type, pidx) {
    const p = players[pidx];
    switch (type) {
        case 'shield':    p.shield = true; updateShieldIcon(pidx); showMsg('🛡️ Shield activated!', 2); break;
        case 'explosive': p.arrows.explosive += 2; showMsg('💣 +2 Explosive arrows!', 2); break;
        case 'bouncy':    p.arrows.bouncy += 2;    showMsg('↩️ +2 Bouncy arrows!', 2);    break;
        case 'medkit':    p.hp = Math.min(100, p.hp + 25); showMsg('❤️ +25 HP!', 2); break;
    }
    updateHPBars();
    updateArrowCounts();
}

// ── TURN MANAGEMENT ──────────────────────────
function endTurn() {
    isAnimating = false;
    if (checkWin()) return;

    activeTurn = 1 - activeTurn;
    roundNum++;
    wind = genWind();

    if (roundNum % 3 === 0) spawnPowerUps(1);

    updateWindDisplay();
    setTurnLabel();

    if (gameMode === 'online' && isHost) pushGameState();
    if (gameMode === 'ai' && activeTurn === 1) setTimeout(doAITurn, 1100);
}

function checkWin() {
    if (players[0].hp > 0 && players[1].hp > 0) return false;
    // Host must broadcast the final HP state — without this push the joiner
    // never learned the game ended and sat frozen at the end of every match.
    if (gameMode === 'online' && isHost) pushGameState();
    finishGame(players[0].hp > 0 ? 0 : 1);
    return true;
}

function finishGame(winnerIdx) {
    if (gameEnded) return;
    gameEnded = true;
    gameActive = false;
    arrow = null; arrowTrail = []; isAnimating = false; aiming = false;

    const isMyWin = (gameMode === 'ai' && winnerIdx === 0) ||
                    (gameMode === 'online' && winnerIdx === myId - 1);

    const title = isMyWin ? '🏆 YOU WIN!' : '💀 YOU LOSE!';
    const msg = `${players[winnerIdx].name} wins with ${players[winnerIdx].hp} HP remaining!`;

    if (isMyWin) sessionScore[0]++; else sessionScore[1]++;

    if (typeof SystemStats !== 'undefined') {
        if (isMyWin) SystemStats.recordWin('bowman', 0);
        else SystemStats.recordLoss('bowman');
    }

    setTimeout(() => {
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-msg').innerText = msg + `\n\nSession: ${sessionScore[0]} – ${sessionScore[1]}`;
        document.getElementById('result-modal').classList.remove('hidden');
    }, 900);
}

function setTurnLabel() {
    const isMyTurn = (gameMode === 'ai' && activeTurn === 0) ||
                     (gameMode === 'online' && activeTurn === myId - 1);
    const lbl = document.getElementById('turn-label');
    if (lbl) {
        lbl.innerText = isMyTurn ? '🏹 YOUR TURN' : `${players[activeTurn].name}'s turn...`;
        lbl.style.color = isMyTurn ? '#f1c40f' : 'rgba(255,255,255,0.4)';
    }
}

// ── AIMING ───────────────────────────────────
function isMyActiveTurn() {
    if (!gameActive || isAnimating) return false;
    if (gameMode === 'ai')     return activeTurn === 0;
    return activeTurn === myId - 1;
}

function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const src = (e.touches && e.touches.length > 0) ? e.touches[0] : e;
    // Map CSS pixels back into the virtual game space
    return {
        x: (src.clientX - rect.left - viewOffX) / viewScale,
        y: (src.clientY - rect.top  - viewOffY) / viewScale
    };
}

function getAimOrigin() {
    const facing = activeTurn === 0 ? 1 : -1;
    return { x: players[activeTurn].x + facing * 22, y: groundY - 63 };
}

function startAim(pos) {
    if (!isMyActiveTurn()) return;

    aiming = true;
    playBowSound(sfxBowLoad);
    aimOrigin = getAimOrigin();
    aimStart = { ...pos };
    aimCurrent = { ...pos };
}

function updateAim(pos) {
    if (!aiming) return;
    aimCurrent = { ...pos };
}

function releaseAim(pos) {
    if (!aiming) return;
    aiming = false;

    const dx = pos.x - aimStart.x;
    const dy = pos.y - aimStart.y;
    const dragDist = Math.min(Math.hypot(dx, dy), MAX_DRAG);
    if (dragDist < 8) return;

    // Auto-fallback to normal if selected type is out
    if (selectedArrow !== 'normal' && players[activeTurn].arrows[selectedArrow] <= 0) {
        selectedArrow = 'normal';
        document.querySelectorAll('.arrow-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'normal'));
    }

    playBowSound(sfxBowRelease);

    // Slingshot: arrow fires OPPOSITE to drag direction
    const angle = Math.atan2(-dy, -dx);
    const power = (dragDist / MAX_DRAG) * MAX_POWER;

    if (gameMode === 'online') {
        sendShot(activeTurn, angle, power, selectedArrow);
    } else {
        fireArrow(activeTurn, angle, power, selectedArrow);
    }
}

function onMouseDown(e) { startAim(getCanvasPos(e)); }
function onMouseMove(e) { updateAim(getCanvasPos(e)); }
function onMouseUp(e)   { releaseAim(getCanvasPos(e)); }

function onTouchStart(e) { e.preventDefault(); startAim(getCanvasPos(e)); }
function onTouchMove(e)  { e.preventDefault(); updateAim(getCanvasPos(e)); }
function onTouchEnd(e)   { e.preventDefault(); if (aimCurrent) releaseAim(aimCurrent); aiming = false; }

// ── AI ───────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function doAITurn() {
    if (!gameActive || activeTurn !== 1) return;
    isAnimating = true;
    showMsg('🤖 AI is aiming...', 0);
    await sleep(900);
    const { angle, power } = calcAIShot(1, 0);
    isAnimating = false;
    fireArrow(1, angle, power, pickAIArrowType());
}

function pickAIArrowType() {
    const p = players[1];
    if (p.arrows.explosive > 0 && Math.random() < 0.28) return 'explosive';
    if (p.arrows.bouncy > 0 && Math.random() < 0.18) return 'bouncy';
    return 'normal';
}

function calcAIShot(shooterIdx, targetIdx) {
    const shooter = players[shooterIdx];
    const target  = players[targetIdx];
    const facing  = shooterIdx === 0 ? 1 : -1;

    const sx = shooter.x + facing * 22;
    const sy = groundY - 63;

    // Predict target position: on hard, lead a moving target
    const moveSetting = getEffectiveSetting('move');
    const isMoving = moveSetting !== 'off';
    const speed = moveSetting === 'fast' ? 2.8 : 1.2;
    const maxDist = moveSetting === 'fast' ? 55 : 35;
    // Estimate where target will be in ~0.6s (flight time approx)
    const predictedX = isMoving && aiDifficulty !== 'easy'
        ? playerBaseX[targetIdx] - Math.sin((moveTime + 0.6) * speed) * maxDist * (targetIdx === 1 ? 1 : -1)
        : target.x;

    // Aim zones: head = higher priority on hard, body = default
    const headY  = groundY - 87;
    const bodyY  = groundY - 55;
    const aimY   = aiDifficulty === 'hard' && Math.random() < 0.55 ? headY : bodyY;
    const tx = predictedX;
    const ty = aimY;

    let bestAngle = 0, bestPower = MAX_POWER * 0.6, bestErr = Infinity;

    // Finer sweep: 60 angles over the valid firing arc
    const N = 60;
    for (let i = 0; i < N; i++) {
        let angle;
        if (facing === 1) {
            angle = (-5 - 80 * (i / (N - 1))) * Math.PI / 180;
        } else {
            angle = (-175 + 80 * (i / (N - 1))) * Math.PI / 180;
        }

        // Binary search on power to minimise 2D distance to target (not just X)
        // Two passes: coarse then fine
        let lo = 100, hi = MAX_POWER;
        for (let k = 0; k < 20; k++) {
            const mid = (lo + hi) / 2;
            const { lx } = simShot(sx, sy, angle, mid);
            if (facing === 1 ? lx < tx : lx > tx) lo = mid; else hi = mid;
        }
        const power = (lo + hi) / 2;
        const { lx, ly } = simShot(sx, sy, angle, power);

        // 2D error: weight Y more so arc height matters
        const err = Math.abs(lx - tx) + Math.abs(ly - ty) * 1.8;

        if (err < bestErr) {
            bestErr = err;
            bestAngle = angle;
            bestPower = power;
        }
    }

    // Difficulty noise — easy misses a lot, hard is nearly perfect
    const ns = aiDifficulty === 'easy' ? 0.28 : aiDifficulty === 'normal' ? 0.07 : 0.018;
    bestAngle += (Math.random() - 0.5) * ns * 2;
    bestPower *= (1 + (Math.random() - 0.5) * ns * 1.2);
    bestPower  = Math.max(140, Math.min(MAX_POWER, bestPower));

    return { angle: bestAngle, power: bestPower };
}

function simShot(sx, sy, angle, power) {
    let x = sx, y = sy;
    let vx = Math.cos(angle) * power;
    let vy = Math.sin(angle) * power;
    const dt = 1 / 60;
    let prevSimX = x;
    for (let i = 0; i < 600; i++) {
        prevSimX = x;
        vx += wind * dt; vy += GRAVITY * dt;
        x += vx * dt;   y += vy * dt;
        if (y >= groundY || x < -200 || x > W + 200) break;
        // Wall hit in sim → treat as miss (large error will exclude this angle)
        if (wallEnabled) {
            const wl = wallX - WALL_W / 2, wr = wallX + WALL_W / 2;
            const wt = groundY - 100 * WALL_H_RATIO;
            const crossed = (prevSimX < wl && x >= wl) || (prevSimX > wr && x <= wr) || (x >= wl && x <= wr);
            if (crossed && y >= wt) { x = wallX; y = groundY; break; }
        }
    }
    return { lx: x, ly: y };
}

// ── RENDERING ─────────────────────────────────
function render() {
    if (!ctx || !W || !H) return;
    // Paint the full backing store (letterbox bars included), then draw the
    // fixed virtual world through the view transform.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05010f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(viewDpr * viewScale, 0, 0, viewDpr * viewScale, viewDpr * viewOffX, viewDpr * viewOffY);

    drawBG();
    drawGround();
    drawPowerUps();
    if (wallEnabled) drawWall();
    drawStickFigure(0);
    drawStickFigure(1);

    // Arrow trail
    if (arrowTrail.length > 1) {
        ctx.save();
        ctx.setLineDash([3, 5]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255,200,80,0.35)';
        ctx.beginPath();
        ctx.moveTo(arrowTrail[0].x, arrowTrail[0].y);
        for (let i = 1; i < arrowTrail.length; i++) ctx.lineTo(arrowTrail[i].x, arrowTrail[i].y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    if (arrow && arrow.active) drawArrowProjectile(arrow);

    // Explosion effect
    if (explosion) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,110,0,${explosion.alpha * 0.45})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,220,0,${explosion.alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    if (stuckArrow && stuckArrow.timer > 0) drawStuckArrow();
    if (aiming && aimOrigin && aimCurrent) drawAimGuide();

    if (msgText && msgTimer > 0) drawMsg();
}

function drawBG() {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#080118');
    sky.addColorStop(1, '#1a0a30');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Stars (deterministic from canvas size)
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 50; i++) {
        const sx = ((i * 173 + 37) % (W - 10)) + 5;
        const sy = ((i * 113 + 11) % (groundY * 0.88));
        ctx.beginPath();
        ctx.arc(sx, sy, i % 4 === 0 ? 1.4 : 0.7, 0, Math.PI * 2);
        ctx.fill();
    }

    // Moon
    const mx = W * 0.88, my = H * 0.12;
    ctx.save();
    ctx.shadowColor = 'rgba(200,220,255,0.5)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#d4e8ff';
    ctx.beginPath();
    ctx.arc(mx, my, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0a30';
    ctx.beginPath();
    ctx.arc(mx + 8, my - 3, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawGround() {
    const gg = ctx.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, '#1e4010');
    gg.addColorStop(0.4, '#102608');
    gg.addColorStop(1, '#080f04');
    ctx.fillStyle = gg;
    ctx.fillRect(0, groundY, W, H - groundY);

    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.strokeStyle = '#3a6e20';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Grass tufts
    ctx.strokeStyle = '#4a8a28';
    ctx.lineWidth = 1.5;
    for (let gx = 8; gx < W; gx += 18) {
        ctx.beginPath();
        ctx.moveTo(gx, groundY);
        ctx.lineTo(gx - 3, groundY - 7);
        ctx.moveTo(gx, groundY);
        ctx.lineTo(gx + 4, groundY - 9);
        ctx.stroke();
    }
}


// Returns the current aim angle for a player's bow arm.
// During aiming it tracks the drag; otherwise defaults to horizontal.
function getAimAngleForPlayer(idx) {
    if (aiming && activeTurn === idx && aimStart && aimCurrent) {
        const ddx = aimCurrent.x - aimStart.x;
        const ddy = aimCurrent.y - aimStart.y;
        if (Math.hypot(ddx, ddy) > 5) {
            return Math.atan2(-ddy, -ddx);
        }
    }
    // Default: flat toward opponent
    return idx === 0 ? 0 : Math.PI;
}

function getAimPowerForPlayer(idx) {
    if (aiming && activeTurn === idx && aimStart && aimCurrent) {
        const ddx = aimCurrent.x - aimStart.x;
        const ddy = aimCurrent.y - aimStart.y;
        return Math.min(Math.hypot(ddx, ddy), MAX_DRAG) / MAX_DRAG;
    }
    return 0;
}


function drawWall() {
    const wallTop  = groundY - 100 * WALL_H_RATIO;
    const wallH    = groundY - wallTop;
    const wx       = wallX - WALL_W / 2;

    ctx.save();

    // Stone gradient
    const grad = ctx.createLinearGradient(wx, 0, wx + WALL_W, 0);
    grad.addColorStop(0,   '#555');
    grad.addColorStop(0.3, '#888');
    grad.addColorStop(0.7, '#777');
    grad.addColorStop(1,   '#444');
    ctx.fillStyle = grad;
    ctx.fillRect(wx, wallTop, WALL_W, wallH);

    // Brick lines horizontal
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    const brickH = 14;
    for (let by = wallTop + brickH; by < groundY; by += brickH) {
        ctx.beginPath();
        ctx.moveTo(wx, by);
        ctx.lineTo(wx + WALL_W, by);
        ctx.stroke();
    }

    // Alternating vertical brick lines
    let rowIdx = 0;
    for (let by = wallTop; by < groundY; by += brickH) {
        const offset = (rowIdx % 2 === 0) ? WALL_W * 0.5 : 0;
        ctx.beginPath();
        ctx.moveTo(wx + offset, by);
        ctx.lineTo(wx + offset, Math.min(by + brickH, groundY));
        ctx.stroke();
        rowIdx++;
    }

    // Top cap highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(wx, wallTop, WALL_W, 4);

    // Glow outline
    ctx.strokeStyle = 'rgba(200,180,120,0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx, wallTop, WALL_W, wallH);

    ctx.restore();
}

function drawStickFigure(idx) {
    const p = players[idx];
    const px = p.x;
    const gy = groundY;
    const facing = idx === 0 ? 1 : -1;
    const alive = p.hp > 0;
    const isActive = gameActive && activeTurn === idx && !isAnimating;
    const clr = idx === 0 ? '#00d2ff' : '#ff5e5e';
    const deadClr = '#444';

    ctx.save();
    ctx.strokeStyle = alive ? clr : deadClr;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isActive) { ctx.shadowColor = clr; ctx.shadowBlur = 14; }

    // Head
    ctx.beginPath();
    ctx.arc(px, gy - 87, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Eye dot (facing direction)
    ctx.fillStyle = alive ? clr : deadClr;
    ctx.beginPath();
    ctx.arc(px + facing * 5, gy - 89, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.moveTo(px, gy - 75);
    ctx.lineTo(px, gy - 35);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(px, gy - 35);
    ctx.lineTo(px - 19, gy);
    ctx.moveTo(px, gy - 35);
    ctx.lineTo(px + 19, gy);
    ctx.stroke();

    if (alive) {
        const aimAngle = getAimAngleForPlayer(idx);
        const aimPower = getAimPowerForPlayer(idx);

        // Shoulder joint (where arms attach)
        const sx = px, sy = gy - 65;

        // Bow arm: extends 28px in aim direction
        const bowArmLen = 28;
        const bax = sx + Math.cos(aimAngle) * bowArmLen;
        const bay = sy + Math.sin(aimAngle) * bowArmLen;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(bax, bay);
        ctx.strokeStyle = alive ? clr : deadClr;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Bow arc at tip of bow arm
        const bowR = 11;
        const perpAngle = aimAngle + Math.PI / 2;
        const bowArcStart = aimAngle - Math.PI * 0.52;
        const bowArcEnd   = aimAngle + Math.PI * 0.52;
        ctx.beginPath();
        ctx.arc(bax, bay, bowR, bowArcStart, bowArcEnd);
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Bow string top and bottom points
        const bsx = bax + Math.cos(aimAngle - Math.PI * 0.52) * bowR;
        const bsy = bay + Math.sin(aimAngle - Math.PI * 0.52) * bowR;
        const bex = bax + Math.cos(aimAngle + Math.PI * 0.52) * bowR;
        const bey = bay + Math.sin(aimAngle + Math.PI * 0.52) * bowR;

        // Draw arm: pulls BACK opposite to aim, more pullback = more power
        const drawArmAngle = aimAngle + Math.PI;
        const pullBack = 4 + aimPower * 14; // 4px rest, up to 18px full draw
        const dax = sx + Math.cos(drawArmAngle) * 14;
        const day = sy + Math.sin(drawArmAngle) * 14;
        // Elbow bends perpendicular, wrist grabs string
        const stringMidX = (bsx + bex) / 2 + Math.cos(aimAngle + Math.PI) * pullBack;
        const stringMidY = (bsy + bey) / 2 + Math.sin(aimAngle + Math.PI) * pullBack;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(dax, day, stringMidX, stringMidY);
        ctx.strokeStyle = alive ? clr : deadClr;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Bowstring: two lines from top/bottom of bow to pulled string point
        ctx.beginPath();
        ctx.moveTo(bsx, bsy);
        ctx.lineTo(stringMidX, stringMidY);
        ctx.lineTo(bex, bey);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        // Dead pose
        ctx.strokeStyle = deadClr;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(px, gy - 65);
        ctx.lineTo(px - 22, gy - 48);
        ctx.moveTo(px, gy - 65);
        ctx.lineTo(px + 22, gy - 48);
        ctx.stroke();

        // X eyes
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 1.5;
        [[-4, -4, -1, -1], [-1, -4, -4, -1]].forEach(([ox1, oy1, ox2, oy2]) => {
            ctx.beginPath();
            ctx.moveTo(px + ox1 + facing * 2, gy - 87 + oy1);
            ctx.lineTo(px + ox2 + facing * 2, gy - 87 + oy2);
            ctx.stroke();
        });
    }

    // Shield circle
    if (p.shield) {
        ctx.beginPath();
        ctx.arc(px, gy - 50, 36, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(100,200,255,0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Name label
    ctx.font = 'bold 10px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    const nw = ctx.measureText(p.name).width + 14;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.roundRect(px - nw / 2, gy - 116, nw, 18, 5);
    ctx.fill();
    ctx.fillStyle = alive ? clr : deadClr;
    ctx.fillText(p.name, px, gy - 103);

    ctx.restore();
}

function drawArrowProjectile(a) {
    const angle = Math.atan2(a.vy, a.vx);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(angle);

    if (a.type === 'explosive') {
        ctx.shadowColor = '#ff5500'; ctx.shadowBlur = 10;
        ctx.strokeStyle = '#ff7700'; ctx.fillStyle = '#ff7700';
    } else if (a.type === 'bouncy') {
        ctx.shadowColor = '#00ff99'; ctx.shadowBlur = 8;
        ctx.strokeStyle = '#00ff99'; ctx.fillStyle = '#00ff99';
    } else {
        ctx.strokeStyle = '#f1c40f'; ctx.fillStyle = '#f1c40f';
    }

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    // Shaft
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(7, 0);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(1, -4);
    ctx.lineTo(1, 4);
    ctx.closePath();
    ctx.fill();

    // Fletching
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-11, -4);
    ctx.moveTo(-16, 0);
    ctx.lineTo(-11, 4);
    ctx.stroke();

    ctx.restore();
}

function drawAimGuide() {
    const dx = aimCurrent.x - aimStart.x;
    const dy = aimCurrent.y - aimStart.y;
    const drag = Math.min(Math.hypot(dx, dy), MAX_DRAG);
    if (drag < 5) return;

    // Recalculate aimOrigin live so it follows moving players
    const liveOrigin = getAimOrigin();
    const pct = drag / MAX_DRAG;

    // ── Drag anchor marker + line to bow ──────────
    ctx.save();
    // Line from drag start to cursor
    ctx.beginPath();
    ctx.moveTo(aimStart.x, aimStart.y);
    ctx.lineTo(aimCurrent.x, aimCurrent.y);
    ctx.strokeStyle = 'rgba(255,200,80,0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Anchor circle at drag start
    ctx.beginPath();
    ctx.arc(aimStart.x, aimStart.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,200,80,${0.3 + pct * 0.5})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,200,80,${0.6 + pct * 0.4})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Crosshair lines on anchor
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(aimStart.x - 10, aimStart.y); ctx.lineTo(aimStart.x - 8, aimStart.y);
    ctx.moveTo(aimStart.x + 8, aimStart.y);  ctx.lineTo(aimStart.x + 10, aimStart.y);
    ctx.moveTo(aimStart.x, aimStart.y - 10); ctx.lineTo(aimStart.x, aimStart.y - 8);
    ctx.moveTo(aimStart.x, aimStart.y + 8);  ctx.lineTo(aimStart.x, aimStart.y + 10);
    ctx.stroke();
    ctx.restore();

    // ── Power bar ────────────────────────────────
    const barW = 80, barH = 8;
    const barX = liveOrigin.x - barW / 2;
    const barY = liveOrigin.y - 36;
    const bclr = pct < 0.4 ? '#2ecc71' : pct < 0.72 ? '#f1c40f' : '#e74c3c';

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = bclr;
    ctx.fillRect(barX, barY, barW * pct, barH);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(pct * 100) + '%', liveOrigin.x, barY - 4);

    ctx.restore();
}


function drawStuckArrow() {
    if (!stuckArrow) return;
    const alpha = Math.min(1, stuckArrow.timer / 0.5); // fade out last 0.5s
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(stuckArrow.x, stuckArrow.y - 8);
    ctx.rotate(stuckArrow.angle);
    ctx.strokeStyle = '#f1c40f';
    ctx.fillStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    // Shaft
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
    // Head
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(0, -3);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();
    // Fletching
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-8, -3);
    ctx.moveTo(-12, 0);
    ctx.lineTo(-8, 3);
    ctx.stroke();
    ctx.restore();
}

function drawPowerUps() {
    for (const pu of powerUps) {
        if (pu.collected) continue;
        ctx.save();
        ctx.shadowColor = '#f1c40f';
        ctx.shadowBlur = 12;
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(PU_ICONS[pu.type] || '⭐', pu.x, pu.y - 4);
        ctx.restore();
    }
}

function drawMsg() {
    ctx.save();
    ctx.font = 'bold 16px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(msgText).width + 24;
    const mx = W / 2, my = H * 0.38;

    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.roundRect(mx - tw / 2, my - 20, tw, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(msgText, mx, my + 4);
    ctx.restore();
}

// ── UI HELPERS ────────────────────────────────
function updateHPBars() {
    for (let i = 0; i < 2; i++) {
        const fill = document.getElementById(`hp-fill-${i}`);
        const txt  = document.getElementById(`hp-text-${i}`);
        const nm   = document.getElementById(`hp-name-${i}`);
        if (fill) {
            fill.style.width = `${players[i].hp}%`;
            fill.style.background = players[i].hp > 50 ? '#2ecc71' : players[i].hp > 25 ? '#f1c40f' : '#e74c3c';
        }
        if (txt) txt.innerText = `${players[i].hp} HP`;
        if (nm)  nm.innerText = players[i].name;
    }
}

function updateArrowCounts() {
    const me = players[myId - 1];
    ['normal', 'explosive', 'bouncy'].forEach(type => {
        const el  = document.getElementById(`count-${type}`);
        const btn = document.querySelector(`.arrow-type-btn[data-type="${type}"]`);
        if (el)  el.innerText = type === 'normal' ? '∞' : me.arrows[type];
        if (btn) btn.disabled = me.arrows[type] <= 0 && type !== 'normal';
    });
}

function updateWindDisplay() {
    const el = document.getElementById('wind-value');
    if (!el) return;
    if (wind === 0) { el.innerText = '— calm'; el.style.color = '#aaa'; return; }
    const dir = wind > 0 ? '→' : '←';
    const abs = Math.abs(Math.round(wind));
    el.innerText = `${dir} ${abs}`;
    el.style.color = Math.abs(wind) < 80 ? '#00d2ff' : '#f1c40f';
}

function updateShieldIcon(idx) {
    const el = document.getElementById(`shield-${idx}`);
    if (el) el.classList.toggle('hidden', !players[idx].shield);
}

function showMsg(text, dur) {
    msgText = text;
    msgTimer = dur > 0 ? dur : 999;
}

// ── ONLINE MULTIPLAYER ────────────────────────
SystemMatch.setup({
    gameId:   "bowman",
    roomPath: "bowman_rooms",
    autoShow: false,
    settingsConfig: [
        {
            id: 'wind', label: 'WIND',
            default: 'on_medium',
            options: [
                { value: 'off',       label: 'Off' },
                { value: 'on_light',  label: '💨 Light' },
                { value: 'on_medium', label: '💨💨 Medium' },
                { value: 'on_strong', label: '💨💨💨 Strong' }
            ]
        },
        {
            id: 'move', label: 'MOVEMENT',
            default: 'off',
            options: [
                { value: 'off',  label: '🧍 Still' },
                { value: 'slow', label: '🚶 Slow' },
                { value: 'fast', label: '🏃 Fast' }
            ]
        },
        {
            id: 'wall', label: 'WALL',
            default: 'off',
            options: [
                { value: 'off', label: '🚫 No Wall' },
                { value: 'on',  label: '🧱 Wall' }
            ]
        }
    ],
    onSettingChange: (key, val) => {
        onlineSettings[key] = val;
        if (currentRoomId && window.db && window.dbUpdate) {
            window.dbUpdate(window.dbRef(window.db, 'bowman_rooms/' + currentRoomId), {
                lobbySettings: JSON.stringify(onlineSettings), ts: Date.now()
            });
        }
    },
    extraRoomFields: () => ({ ts: Date.now() }),
    onHost: (roomId) => {
        currentRoomId = roomId;
        isHost = true; myId = 1;
        gameMode = 'online';
        const modeEl = document.getElementById('bw-mode');
        if (modeEl) modeEl.value = 'online';
        lastActionTs = 0; lastSyncTime = 0;
        players[0].name = SystemUI.getPlayerName();
        players[1].name = 'Opponent';
        listenToRoom();
    },
    onJoin: (roomId) => {
        currentRoomId = roomId;
        isHost = false; myId = 2;
        gameMode = 'online';
        const modeEl2 = document.getElementById('bw-mode');
        if (modeEl2) modeEl2.value = 'online';
        lastActionTs = 0; lastSyncTime = 0;
        const seats = SystemMatch.getSeats();
        players[0].name = (seats[0] && seats[0].name) || 'Player 1';
        players[1].name = SystemUI.getPlayerName();
        listenToRoom();
    },
    onLeave: () => {
        if (roomListener) { roomListener(); roomListener = null; }
        chatStarted = false;
        myId = 1; isHost = true;
        document.getElementById('action-zone').classList.remove('hidden');
        resetGame();
    },
    onStart: () => {
        if (currentRoomId && window.db) {
            window.dbUpdate(window.dbRef(window.db, 'bowman_rooms/' + currentRoomId), {
                status: 'playing',
                lobbySettings: JSON.stringify(onlineSettings),
                ts: Date.now()
            });
        }
    }
});

function listenToRoom() {
    roomListener = window.dbOnValue(window.dbRef(window.db, 'bowman_rooms/' + currentRoomId), snap => {
        const data = snap.val();
        if (!data) {
            // Room deleted = host left. Tell the joiner instead of freezing.
            if (!isHost && currentRoomId) opponentLeft('HOST LEFT THE GAME');
            return;
        }

        // A departing joiner flags the room so the host isn't stranded.
        if (data.status === 'abandoned' && isHost) {
            opponentLeft('OPPONENT LEFT');
            return;
        }

        // Sync lobby settings to joiner before game starts
        if (data.lobbySettings && !isHost) {
            try { onlineSettings = JSON.parse(data.lobbySettings); } catch(e) {}
        }

        if (data.seats) {
            SystemUI.v2Lobby.renderSeats(data.seats);
            if (data.seats[0]) players[0].name = data.seats[0].name || 'Player 1';
            if (data.seats[1] && data.seats[1].type === 'human') players[1].name = data.seats[1].name || 'Player 2';
        }

        if (data.status === 'playing') {
            SystemUI.v2Lobby.hide();
            document.getElementById('action-zone').classList.remove('hidden');
            if (!chatStarted) { chatStarted = true; SystemUI.startChat(currentRoomId, SystemUI.getPlayerName()); }
            if (isHost && !gameActive && !gameEnded) {
                startGame();
            } else if (!isHost && data.gameState) {
                applyGameState(data.gameState);
            }
        }

        if (data.playerAction && data.playerAction.ts !== lastActionTs) {
            lastActionTs = data.playerAction.ts;
            if (data.playerAction.action === 'shot' && !gameEnded) {
                const { shooterIdx, angle, power, arrowType } = data.playerAction;
                if (typeof data.playerAction.moveTime === 'number') moveTime = data.playerAction.moveTime;
                fireArrow(shooterIdx, angle, power, arrowType);
            }
        }
    });
}

// Shared "the other player is gone" recovery. The host turns the room back
// into a joinable lobby; the joiner exits to the lobby setup screen.
function opponentLeft(msg) {
    showMsg('🚪 ' + msg, 4);
    pendingBowState = null;
    if (isHost && currentRoomId && window.db) {
        resetGame();
        const seats = [{ type: 'human', name: SystemUI.getPlayerName() }, { type: 'open', name: 'Open' }];
        window.dbUpdate(window.dbRef(window.db, 'bowman_rooms/' + currentRoomId), {
            status: 'waiting', seats, playerAction: null, gameState: null, ts: Date.now()
        });
        if (window.SystemMatch) SystemMatch.setSeats(seats);
        document.getElementById('result-modal').classList.add('hidden');
        SystemUI.v2Lobby.renderSeats(seats);
        document.getElementById('v2-lobby-overlay').classList.remove('sys-hidden');
        SystemUI.v2Lobby.showRoomPhase(currentRoomId, true);
    } else {
        if (roomListener) { roomListener(); roomListener = null; }
        SystemUI.stopChat(); chatStarted = false;
        currentRoomId = null; myId = 1; isHost = true;
        lastActionTs = 0; lastSyncTime = 0;
        gameMode = 'ai';
        const modeEl = document.getElementById('bw-mode');
        if (modeEl) modeEl.value = 'ai';
        document.getElementById('result-modal').classList.add('hidden');
        document.getElementById('action-zone').classList.remove('hidden');
        resetGame();
        SystemUI.v2Lobby.show();
    }
}

function pushGameState() {
    if (!isHost || gameMode !== 'online' || !currentRoomId) return;
    window.dbUpdate(window.dbRef(window.db, 'bowman_rooms/' + currentRoomId), {
        gameState: {
            p0hp: players[0].hp,   p1hp: players[1].hp,
            p0sh: players[0].shield, p1sh: players[1].shield,
            p0ar: JSON.stringify(players[0].arrows), p1ar: JSON.stringify(players[1].arrows),
            p0nm: players[0].name, p1nm: players[1].name,
            activeTurn, wind, roundNum,
            powerUps: JSON.stringify(powerUps.filter(p => !p.collected)),
            settings: JSON.stringify(onlineSettings),
            ts: Date.now()
        }
    });
}

function sendShot(shooterIdx, angle, power, arrowType) {
    if (!currentRoomId || !window.db) { fireArrow(shooterIdx, angle, power, arrowType); return; }
    window.dbUpdate(window.dbRef(window.db, 'bowman_rooms/' + currentRoomId), {
        // moveTime rides along so both clients place moving targets
        // identically while the arrow is in flight.
        playerAction: { action: 'shot', shooterIdx, angle, power, arrowType, moveTime, ts: Date.now() }
    });
}

function flushPendingBowState() {
    const s = pendingBowState;
    pendingBowState = null;
    if (s) applyGameState(s);
}

// A joiner closing the tab mid-game flags the room so the host isn't
// silently stranded waiting for a shot that will never come.
window.addEventListener('beforeunload', () => {
    if (gameMode === 'online' && !isHost && currentRoomId && window.db && gameActive) {
        try {
            window.dbUpdate(window.dbRef(window.db, 'bowman_rooms/' + currentRoomId), { status: 'abandoned' });
        } catch (e) {}
    }
});

function applyGameState(s) {
    if (!s || s.ts <= lastSyncTime) return;

    // Don't snap state while our local arrow is mid-flight — that's what made
    // arrows visibly vanish. Defer and apply once the animation resolves
    // (with a timeout fallback in case a throttled tab never resolves it).
    if (arrow || isAnimating) {
        pendingBowState = s;
        setTimeout(flushPendingBowState, 4000);
        return;
    }
    lastSyncTime = s.ts;

    // Rematch arriving after a finished round: clear the old result.
    if (gameEnded && s.p0hp > 0 && s.p1hp > 0) {
        gameEnded = false;
        document.getElementById('result-modal').classList.add('hidden');
        arrow = null; arrowTrail = []; explosion = null; isAnimating = false;
    }

    players[0].hp = s.p0hp; players[1].hp = s.p1hp;
    players[0].shield = s.p0sh; players[1].shield = s.p1sh;
    try { players[0].arrows = JSON.parse(s.p0ar); players[1].arrows = JSON.parse(s.p1ar); } catch(e) {}
    if (s.p0nm) players[0].name = s.p0nm;
    if (s.p1nm) players[1].name = s.p1nm;
    activeTurn = s.activeTurn;
    wind = s.wind;
    roundNum = s.roundNum;
    try { powerUps = JSON.parse(s.powerUps); } catch(e) {}
    try {
        if (s.settings) {
            onlineSettings = JSON.parse(s.settings);
            wallEnabled = onlineSettings.wall === 'on';
            wallX = W / 2;
        }
    } catch(e) {}

    updateHPBars();
    updateArrowCounts();
    updateWindDisplay();
    updateShieldIcon(0);
    updateShieldIcon(1);
    setTurnLabel();

    // Joiner-side end-of-game: the host's final push carries someone at 0 HP.
    if (players[0].hp <= 0 || players[1].hp <= 0) {
        finishGame(players[0].hp > 0 ? 0 : 1);
        return;
    }

    if (!gameActive && !gameEnded) {
        gameActive = true;
        document.getElementById('pre-game-btns').classList.add('hidden');
        document.getElementById('in-game-controls').classList.remove('hidden');
        lastTime = 0;
        requestAnimationFrame(gameLoop);
    }
}