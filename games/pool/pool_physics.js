// =============================================
// POOL PHYSICS ENGINE — pool_physics.js
// The Game Shack
// Continuous-collision, equal-mass elastic billiards
// =============================================
'use strict';

const PoolPhysics = (() => {

    // ── CONSTANTS ────────────────────────────
    const BALL_R           = 11;
    const FRICTION         = 0.992;   // air/cloth drag, per frame
    const ROLL_DECEL       = 0.05;    // rolling friction (px/frame²)
    const MIN_SPEED        = 0.05;
    const RAIL_RESTITUTION = 0.78;
    const BALL_RESTITUTION = 0.96;
    const SPIN_DECAY       = 0.94;
    const MAX_TRAVEL_PER_SUBSTEP = 1.4; // tunneling guard

    // ── BALL FACTORY ─────────────────────────
    function makeBall(id, x, y) {
        return {
            id, x, y,
            vx: 0, vy: 0,
            r: BALL_R,
            scale: 1,                  // pocket-fall animation
            pocketed: false,
            spinTop:  0,               // [-1..1] back/top
            spinSide: 0,               // [-1..1] left/right
            roll: 0,                   // accumulated rolling angle (for stripe rotation)
            rollAxis: 0                // direction of rolling, radians
        };
    }

    // ── BALL–BALL ELASTIC COLLISION ──────────
    function collidePair(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = a.r + b.r;
        if (d2 >= min * min || d2 < 1e-6) return false;

        const d  = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;

        // De-overlap
        const overlap = (min - d) * 0.5 + 0.01;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;

        // Relative velocity along normal
        const dvx = b.vx - a.vx;
        const dvy = b.vy - a.vy;
        const vn  = dvx * nx + dvy * ny;
        if (vn > 0) return false;     // separating

        // Equal-mass impulse with restitution: J = -(1+e)·vn / 2
        const j = -(1 + BALL_RESTITUTION) * vn * 0.5;
        a.vx -= j * nx; a.vy -= j * ny;
        b.vx += j * nx; b.vy += j * ny;

        return true;
    }

    // ── RAIL BOUNCE ──────────────────────────
    function bounceRails(b, table, pockets) {
        const { x: tx, y: ty, w: tw, h: th } = table;
        const r = b.r;

        // Skip if inside the pocket throat — let the pocket capture instead
        const CLEAR = r + 10;
        for (const p of pockets) {
            if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < CLEAR * CLEAR) return;
        }

        let bounced = false;
        if (b.x - r < tx)            { b.x = tx + r;            b.vx =  Math.abs(b.vx) * RAIL_RESTITUTION; bounced = 'lr'; }
        else if (b.x + r > tx + tw)  { b.x = tx + tw - r;       b.vx = -Math.abs(b.vx) * RAIL_RESTITUTION; bounced = 'lr'; }
        if (b.y - r < ty)            { b.y = ty + r;            b.vy =  Math.abs(b.vy) * RAIL_RESTITUTION; bounced = bounced || 'tb'; }
        else if (b.y + r > ty + th)  { b.y = ty + th - r;       b.vy = -Math.abs(b.vy) * RAIL_RESTITUTION; bounced = bounced || 'tb'; }

        // Side-spin transfers a small tangential push on the rail
        if (bounced && Math.abs(b.spinSide) > 0.05) {
            const k = b.spinSide * 0.6;
            if (bounced === 'lr') b.vy += k * (b.vx > 0 ? 1 : -1);
            else                  b.vx += k * (b.vy > 0 ? -1 : 1);
            b.spinSide *= 0.5;
        }
    }

    // ── POCKET CAPTURE ───────────────────────
    function checkPockets(balls, pockets) {
        const sunk = [];
        for (const b of balls) {
            if (b.pocketed) continue;
            for (const p of pockets) {
                const d = Math.hypot(b.x - p.x, b.y - p.y);
                if (d < p.r) {
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

    // ── MAIN STEP ────────────────────────────
    function step(balls, table, pockets) {
        // Adaptive substeps based on max ball travel this frame
        let maxSpd = 0;
        for (const b of balls) {
            if (b.pocketed) continue;
            const sp = Math.hypot(b.vx, b.vy);
            if (sp > maxSpd) maxSpd = sp;
        }
        const substeps = Math.max(1, Math.min(20, Math.ceil(maxSpd / MAX_TRAVEL_PER_SUBSTEP)));
        const dtFrac = 1 / substeps;

        const allSunk = [];

        for (let s = 0; s < substeps; s++) {
            // Integrate
            for (const b of balls) {
                if (b.pocketed) continue;
                const dx = b.vx * dtFrac;
                const dy = b.vy * dtFrac;
                b.x += dx;
                b.y += dy;
                // Rolling animation tracking
                const moved = Math.hypot(dx, dy);
                if (moved > 0.05) {
                    b.roll += moved / b.r;
                    b.rollAxis = Math.atan2(dy, dx);
                }
            }
            // Ball–ball
            for (let i = 0; i < balls.length; i++) {
                if (balls[i].pocketed) continue;
                for (let j = i + 1; j < balls.length; j++) {
                    if (balls[j].pocketed) continue;
                    collidePair(balls[i], balls[j]);
                }
            }
            // Rails
            for (const b of balls) {
                if (!b.pocketed) bounceRails(b, table, pockets);
            }
            // Pockets
            const sunk = checkPockets(balls, pockets);
            if (sunk.length) allSunk.push(...sunk);
        }

        // Friction & decay (per frame, not per substep)
        for (const b of balls) {
            if (b.pocketed) continue;
            b.vx *= FRICTION;
            b.vy *= FRICTION;
            const spd = Math.hypot(b.vx, b.vy);
            if (spd > 0) {
                if (spd <= ROLL_DECEL + MIN_SPEED) {
                    b.vx = 0; b.vy = 0;
                } else {
                    const m = (spd - ROLL_DECEL) / spd;
                    b.vx *= m; b.vy *= m;
                }
            }
            b.spinTop  *= SPIN_DECAY;
            b.spinSide *= SPIN_DECAY;
            if (Math.abs(b.spinTop)  < 0.01) b.spinTop  = 0;
            if (Math.abs(b.spinSide) < 0.01) b.spinSide = 0;
        }

        return [...new Set(allSunk)];
    }

    // ── SETTLED ──────────────────────────────
    function isSettled(balls) {
        for (const b of balls) {
            if (b.pocketed) continue;
            if (b.vx !== 0 || b.vy !== 0) return false;
        }
        return true;
    }

    // ── FIRE CUE BALL ────────────────────────
    function fireCueBall(cueBall, angle, power, spinTop, spinSide) {
        cueBall.vx = Math.cos(angle) * power;
        cueBall.vy = Math.sin(angle) * power;
        cueBall.spinTop  = spinTop  || 0;
        cueBall.spinSide = spinSide || 0;
    }

    // ── SPIN EFFECT (call once at first cue→object contact) ──
    // Modifies cue and (lightly) object ball based on english.
    function applySpinEffect(cueBall, objectBall) {
        const st = cueBall.spinTop;
        const ss = cueBall.spinSide;
        if (Math.abs(st) < 0.05 && Math.abs(ss) < 0.05) return;

        const cuSpd = Math.hypot(cueBall.vx, cueBall.vy);
        if (cuSpd > 0.1) {
            // Topspin pushes cue forward, backspin pulls it back along its post-collision velocity
            const fx = cueBall.vx / cuSpd;
            const fy = cueBall.vy / cuSpd;
            const longPush = st * 0.55 * Math.max(2, cuSpd);
            cueBall.vx += fx * longPush;
            cueBall.vy += fy * longPush;

            // Side spin curves the cue ball perpendicular to its motion
            if (Math.abs(ss) > 0.05) {
                const px = -fy;
                const py =  fx;
                const sidePush = ss * 0.35 * Math.max(2, cuSpd);
                cueBall.vx += px * sidePush;
                cueBall.vy += py * sidePush;
            }
        }

        // Side spin "throws" object ball slightly off its natural path
        if (objectBall && Math.abs(ss) > 0.05) {
            const obSpd = Math.hypot(objectBall.vx, objectBall.vy);
            if (obSpd > 0.1) {
                const px = -objectBall.vy / obSpd;
                const py =  objectBall.vx / obSpd;
                objectBall.vx += px * ss * 0.10 * obSpd;
                objectBall.vy += py * ss * 0.10 * obSpd;
            }
        }
    }

    // ── RAY CAST AGAINST BALLS ───────────────
    // Returns the nearest ball the ray from (ox,oy) at `angle` would hit,
    // treating the test as "where a ball of radius BALL_R can first contact another ball."
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
            const R2 = R * R;
            if (perp2 >= R2) continue;

            const tHit = t - Math.sqrt(R2 - perp2);
            if (tHit < 0 || tHit >= bestT) continue;

            bestT  = tHit;
            result = { ball: b, gx: ox + dx * tHit, gy: oy + dy * tHit, dist: tHit };
        }
        return result;
    }

    // ── RAIL RAY CAST ────────────────────────
    function castRayToRail(ox, oy, angle, table) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const { x: tx, y: ty, w: tw, h: th } = table;
        let tMin = Infinity;

        if (dx >  1e-4) tMin = Math.min(tMin, (tx + tw - ox) / dx);
        if (dx < -1e-4) tMin = Math.min(tMin, (tx       - ox) / dx);
        if (dy >  1e-4) tMin = Math.min(tMin, (ty + th - oy) / dy);
        if (dy < -1e-4) tMin = Math.min(tMin, (ty       - oy) / dy);

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
