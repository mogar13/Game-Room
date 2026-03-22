// =============================================
// POOL PHYSICS ENGINE — pool_physics.js
// The Game Shack
// =============================================
'use strict';

const PoolPhysics = (() => {

    // ── CONSTANTS ────────────────────────────
    const BALL_R        = 12;
    const FRICTION      = 0.979;    // velocity multiplier per frame (60fps)
    const SPIN_DECAY    = 0.87;
    const MIN_SPEED     = 0.4;      // px/frame threshold to stop
    const BOUNCE_LOSS   = 0.82;     // velocity kept after rail bounce
    const SUBSTEPS      = 8;
    const RESTITUTION   = 0.98;     // energy kept after ball-to-ball collision

    // ── BALL FACTORY ─────────────────────────
    function makeBall(id, x, y) {
        return {
            id, x, y,
            vx: 0, vy: 0,
            r: BALL_R,
            scale: 1,      // For 3D pocket fall animation
            pocketed: false,
            spinTop:  0,   // [-1 .. 1]  back=-1, top=1
            spinSide: 0    // [-1 .. 1]  left=-1, right=1
        };
    }

    // ── ELASTIC COLLISION ─────────────────────
    function collidePair(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = a.r + b.r;

        if (d2 >= min * min || d2 < 0.0001) return false;

        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const ny = dy / dist;

        // Relative velocity along collision normal
        const dvx = a.vx - b.vx;
        const dvy = a.vy - b.vy;
        const dot = dvx * nx + dvy * ny;
        if (dot <= 0) return false; // already separating

        // Equal mass: swap normal velocity components with realistic restitution
        a.vx -= dot * nx * RESTITUTION;
        a.vy -= dot * ny * RESTITUTION;
        b.vx += dot * nx * RESTITUTION;
        b.vy += dot * ny * RESTITUTION;

        // Positional correction — separate overlapping balls
        const overlap = (min - dist) * 0.5 + 0.05;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        return true;
    }

    // ── RAIL BOUNCE ───────────────────────────
    function bounceRails(b, table, pockets) {
        const { x: tx, y: ty, w: tw, h: th } = table;
        const r = b.r;
        // Don't bounce if inside a pocket zone — let pocket detection handle it
        const CLEAR = r + 8;
        if (pockets.some(p => Math.hypot(b.x - p.x, b.y - p.y) < CLEAR)) return;

        if (b.x - r < tx) { b.x = tx + r; b.vx =  Math.abs(b.vx) * BOUNCE_LOSS; }
        if (b.x + r > tx + tw) { b.x = tx + tw - r; b.vx = -Math.abs(b.vx) * BOUNCE_LOSS; }
        if (b.y - r < ty) { b.y = ty + r; b.vy =  Math.abs(b.vy) * BOUNCE_LOSS; }
        if (b.y + r > ty + th) { b.y = ty + th - r; b.vy = -Math.abs(b.vy) * BOUNCE_LOSS; }
    }

    // ── POCKET DETECTION ─────────────────────
    function checkPockets(balls, pockets) {
        const sunk = [];
        for (const b of balls) {
            if (b.pocketed) continue;
            for (const p of pockets) {
                if (Math.hypot(b.x - p.x, b.y - p.y) < p.r + 2) {
                    b.pocketed = true;
                    b.x = p.x; b.y = p.y;
                    b.vx = 0;  b.vy = 0;
                    sunk.push(b.id);
                    break;
                }
            }
        }
        return sunk;
    }

    // ── MAIN STEP (call once per frame) ──────
    function step(balls, table, pockets) {
        const allSunk = [];

        for (let s = 0; s < SUBSTEPS; s++) {
            // Integrate
            for (const b of balls) {
                if (b.pocketed) continue;
                b.x += b.vx / SUBSTEPS;
                b.y += b.vy / SUBSTEPS;
            }
            // Ball–ball collisions (O(n²) fine for 16 balls)
            for (let i = 0; i < balls.length; i++) {
                for (let j = i + 1; j < balls.length; j++) {
                    if (!balls[i].pocketed && !balls[j].pocketed) {
                        collidePair(balls[i], balls[j]);
                    }
                }
            }
            // Rails
            for (const b of balls) {
                if (!b.pocketed) bounceRails(b, table, pockets);
            }
            // Pockets
            const s_sunk = checkPockets(balls, pockets);
            allSunk.push(...s_sunk);
        }

        // Friction + spin decay (once per frame, after all substeps)
        const LINEAR_DECEL = 0.015; // Smooth natural rolling stop
        for (const b of balls) {
            if (b.pocketed) continue;
            const spd = Math.hypot(b.vx, b.vy);
            if (spd > 0) {
                // Apply drag + linear deceleration to stop smoothly without jerking
                const drop = spd * (1 - FRICTION) + LINEAR_DECEL;
                if (spd <= drop) {
                    b.vx = 0; b.vy = 0;
                } else {
                    const mult = (spd - drop) / spd;
                    b.vx *= mult;
                    b.vy *= mult;
                }
            }
            
            b.spinTop  *= SPIN_DECAY;
            b.spinSide *= SPIN_DECAY;
            if (Math.abs(b.spinTop)  < 0.01) b.spinTop  = 0;
            if (Math.abs(b.spinSide) < 0.01) b.spinSide = 0;
        }

        // Deduplicate sunk IDs
        return [...new Set(allSunk)];
    }

    // ── SETTLED CHECK ────────────────────────
    function isSettled(balls) {
        return balls.every(b => b.pocketed || (b.vx === 0 && b.vy === 0));
    }

    // ── FIRE CUE BALL ────────────────────────
    function fireCueBall(cueBall, angle, power, spinTop, spinSide) {
        cueBall.vx = Math.cos(angle) * power;
        cueBall.vy = Math.sin(angle) * power;
        cueBall.spinTop  = spinTop;
        cueBall.spinSide = spinSide;
    }

    // ── SPIN EFFECT (call right after cue-ball first collision) ──
    function applySpinEffect(cueBall, objectBall) {
        const st = cueBall.spinTop;
        const ss = cueBall.spinSide;
        if (Math.abs(st) < 0.05 && Math.abs(ss) < 0.05) return;

        const cuSpd = Math.hypot(cueBall.vx, cueBall.vy);
        // Topspin / backspin: push cue ball along its post-collision direction
        if (Math.abs(st) > 0.05 && cuSpd > 0.1) {
            const nx = cueBall.vx / cuSpd;
            const ny = cueBall.vy / cuSpd;
            const push = st * 0.35 * cuSpd;
            cueBall.vx += nx * push;
            cueBall.vy += ny * push;
        }
        // Side spin: slight "throw" on object ball perpendicular to its path
        if (Math.abs(ss) > 0.05 && objectBall) {
            const obSpd = Math.hypot(objectBall.vx, objectBall.vy);
            if (obSpd > 0.1) {
                const px = -objectBall.vy / obSpd;
                const py =  objectBall.vx / obSpd;
                const throw_ = ss * 0.07 * obSpd;
                objectBall.vx += px * throw_;
                objectBall.vy += py * throw_;
            }
        }
    }

    // ── RAY CAST ─────────────────────────────
    // Returns the nearest ball the ray from (ox,oy) at `angle` would hit,
    // treating each ball as radius BALL_R*2 (cue ball + target radius).
    // Skips ball with id === excludeId.
    function castRay(balls, ox, oy, angle, excludeId) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let bestT = Infinity;
        let result = null;

        for (const b of balls) {
            if (b.pocketed || b.id === excludeId) continue;

            const ex = b.x - ox;
            const ey = b.y - oy;
            const t  = ex * dx + ey * dy;
            if (t < -BALL_R) continue;

            const perp2 = ex * ex + ey * ey - t * t;
            const R = BALL_R * 2;
            if (perp2 >= R * R) continue;

            const tHit = t - Math.sqrt(R * R - perp2);
            if (tHit < 0 || tHit >= bestT) continue;

            bestT  = tHit;
            result = { ball: b, gx: ox + dx * tHit, gy: oy + dy * tHit, dist: tHit };
        }
        return result;
    }

    // ── RAIL RAY CAST ────────────────────────
    // Returns the distance to the nearest rail from (ox,oy) in direction angle.
    function castRayToRail(ox, oy, angle, table) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const { x: tx, y: ty, w: tw, h: th } = table;
        let tMin = Infinity;

        if (dx > 0.001) tMin = Math.min(tMin, (tx + tw - ox) / dx);
        if (dx < -0.001) tMin = Math.min(tMin, (tx - ox) / dx);
        if (dy > 0.001) tMin = Math.min(tMin, (ty + th - oy) / dy);
        if (dy < -0.001) tMin = Math.min(tMin, (ty - oy) / dy);

        return Math.max(0, tMin);
    }

    return {
        BALL_R,
        makeBall,
        step,
        isSettled,
        fireCueBall,
        applySpinEffect,
        castRay,
        castRayToRail,
        checkPockets
    };
})();