// ── Stick figure ──────────────────────────────────────────────────────────
// Drawn from joint angles rather than sprites. A stick figure is the one
// character that needs no art: it is lines and a circle, so it stays crisp at
// any size, costs no files, and every pose is just numbers.
//
// Poses follow the reference sheet: idle, walk, run, jump, attack, hurt.
//
// Angles are degrees, measured from straight-down, positive = forward (right).
// Lengths are fractions of the figure's total height.

const STICK = {
    color:      0x2222dd,
    lineWidth:  0.055,   // of height
    headR:      0.105,
    neckY:      0.235,   // below the top of the head
    hipY:       0.560,
    upperArm:   0.150,
    lowerArm:   0.150,
    upperLeg:   0.200,
    lowerLeg:   0.205,
    farTint:    0.55,    // brightness of the limbs on the far side
};

const DEG2RAD = Math.PI / 180;

// A pose is the eight limb angles plus a lean. Anything omitted is 0.
const P = (o) => Object.assign({
    shoulderFar: 0, elbowFar: 0, shoulderNear: 0, elbowNear: 0,
    hipFar: 0, kneeFar: 0, hipNear: 0, kneeNear: 0,
    lean: 0, bob: 0,
}, o);

const STICK_POSES = {
    // ── Idle: arms down, gentle breathing handled by the caller ──────────
    idle: [
        P({ shoulderFar: 8, shoulderNear: -8, hipFar: 4, hipNear: -4 }),
        P({ shoulderFar: 10, shoulderNear: -10, hipFar: 5, hipNear: -5, bob: 0.012 }),
    ],

    // ── Run: four keys, mirrored into an eight-step cycle by the caller ──
    run: [
        P({ lean: 12, shoulderFar: -55, elbowFar: -70, shoulderNear: 60, elbowNear: -60,
            hipFar: 45, kneeFar: -15, hipNear: -40, kneeNear: -85 }),
        P({ lean: 12, shoulderFar: -20, elbowFar: -80, shoulderNear: 25, elbowNear: -70,
            hipFar: 10, kneeFar: -10, hipNear: -8,  kneeNear: -35 }),
        P({ lean: 12, shoulderFar: 60, elbowFar: -60, shoulderNear: -55, elbowNear: -70,
            hipFar: -40, kneeFar: -85, hipNear: 45, kneeNear: -15 }),
        P({ lean: 12, shoulderFar: 25, elbowFar: -70, shoulderNear: -20, elbowNear: -80,
            hipFar: -8, kneeFar: -35, hipNear: 10, kneeNear: -10 }),
    ],

    // ── Jump: tucked on the way up, reaching on the way down ─────────────
    jump: [
        P({ lean: 8, shoulderFar: -120, elbowFar: -30, shoulderNear: -110, elbowNear: -40,
            hipFar: 55, kneeFar: -95, hipNear: 30, kneeNear: -70 }),
    ],
    land: [
        P({ lean: 22, shoulderFar: -40, elbowFar: -50, shoulderNear: -30, elbowNear: -60,
            hipFar: 30, kneeFar: -60, hipNear: 20, kneeNear: -55 }),
    ],

    // ── Attack: wind-up, swing, strike, follow-through ───────────────────
    attack: [
        P({ lean: -10, shoulderFar: -60, elbowFar: -110, shoulderNear: 20, elbowNear: -30,
            hipFar: 12, kneeFar: -8, hipNear: -14, kneeNear: -10 }),
        P({ lean: 8,  shoulderFar: 20,  elbowFar: -60,  shoulderNear: 10, elbowNear: -20,
            hipFar: 14, kneeFar: -6, hipNear: -16, kneeNear: -8 }),
        P({ lean: 18, shoulderFar: 92,  elbowFar: -6,   shoulderNear: -30, elbowNear: -40,
            hipFar: 18, kneeFar: -4, hipNear: -20, kneeNear: -6 }),
        P({ lean: 12, shoulderFar: 70,  elbowFar: -35,  shoulderNear: -20, elbowNear: -50,
            hipFar: 15, kneeFar: -6, hipNear: -18, kneeNear: -8 }),
    ],

    hurt: [
        P({ lean: -25, shoulderFar: -80, elbowFar: -40, shoulderNear: -95, elbowNear: -30,
            hipFar: -20, kneeFar: -40, hipNear: 25, kneeNear: -50 }),
    ],
};

class StickFigure {

    /// gfx: a Phaser Graphics object the caller owns.
    constructor(gfx, height = 50) {
        this.gfx = gfx;
        this.height = height;
        this.cfg = Object.assign({}, STICK);
        this.facing = 1;      // 1 = right
    }

    setHeight(h) { this.height = h; return this; }

    /// Blend between two poses. t is 0..1.
    static lerpPose(a, b, t) {
        const out = {};
        for (const k of Object.keys(a)) out[k] = a[k] + (b[k] - a[k]) * t;
        return out;
    }

    /// Pick a pose from a named cycle at phase 0..1.
    static cycle(name, phase) {
        const list = STICK_POSES[name] || STICK_POSES.idle;
        if (list.length === 1) return list[0];
        const scaled = (phase % 1 + 1) % 1 * list.length;
        const i = Math.floor(scaled);
        return StickFigure.lerpPose(list[i], list[(i + 1) % list.length], scaled - i);
    }

    /// Draw the figure with its feet at (x, y).
    draw(x, y, pose) {
        const g = this.gfx, c = this.cfg, H = this.height, f = this.facing;
        g.clear();

        const lean = (pose.lean || 0) * DEG2RAD * f;
        const bob  = (pose.bob  || 0) * H;

        // Spine: hip up to neck, tilted by the lean.
        const hipX = x, hipY = y - (1 - c.hipY) * H + bob;
        const spineLen = (c.hipY - c.neckY) * H;
        const neckX = hipX + Math.sin(lean) * spineLen;
        const neckY = hipY - Math.cos(lean) * spineLen;

        const headR = c.headR * H;
        const headX = neckX + Math.sin(lean) * headR;
        const headY = neckY - Math.cos(lean) * headR;

        const lw = Math.max(1.4, c.lineWidth * H);

        // A limb is two bones; angles are absolute from straight-down.
        const limb = (ox, oy, a1, a2, l1, l2, color) => {
            const r1 = a1 * DEG2RAD * f, r2 = (a1 + a2) * DEG2RAD * f;
            const jx = ox + Math.sin(r1) * l1 * H;
            const jy = oy + Math.cos(r1) * l1 * H;
            const ex = jx + Math.sin(r2) * l2 * H;
            const ey = jy + Math.cos(r2) * l2 * H;
            g.lineStyle(lw, color, 1);
            g.beginPath();
            g.moveTo(ox, oy); g.lineTo(jx, jy); g.lineTo(ex, ey);
            g.strokePath();
            return { x: ex, y: ey };
        };

        const near = c.color;
        const far  = Phaser.Display.Color.IntegerToColor(c.color).darken(38).color;

        // Far limbs first so the near side reads on top.
        limb(neckX, neckY, pose.shoulderFar, pose.elbowFar, c.upperArm, c.lowerArm, far);
        limb(hipX,  hipY,  pose.hipFar,      pose.kneeFar,  c.upperLeg, c.lowerLeg, far);

        // Spine
        g.lineStyle(lw, near, 1);
        g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(neckX, neckY); g.strokePath();

        // Head
        g.lineStyle(lw * 0.85, near, 1);
        g.strokeCircle(headX, headY, headR);

        // Near limbs
        this.fist = limb(neckX, neckY, pose.shoulderNear, pose.elbowNear,
                         c.upperArm, c.lowerArm, near);
        limb(hipX, hipY, pose.hipNear, pose.kneeNear, c.upperLeg, c.lowerLeg, near);

        return this;
    }
}
