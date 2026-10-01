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

    // ── Back view ─────────────────────────────────────────────────────────
    // The chase mode looks over the runner's shoulder, and the side view's
    // joint angles do not survive the change of camera: a limb swinging along
    // the direction of travel is nearly invisible from behind. So this is
    // built from what does read from here — how high a foot lifts, how much
    // a limb is foreshortened, and how the shoulders roll against the hips.
    //
    // Static, and it does not clear: the chase scene draws several figures
    // into one Graphics.

    static drawBack(g, x, y, h, mode, phase, color) {
        const lw   = Math.max(1.2, 0.055 * h);
        const dark = Phaser.Display.Color.IntegerToColor(color).darken(34).color;

        // Sliding keeps the feet on the road but drops everything above them.
        const bodyH = h * (mode === 'slide' ? 0.50 : 1);
        const sw    = mode === 'run' ? Math.sin(phase * Math.PI * 2) : 0;

        const hipY   = y - 0.44  * bodyH;
        const neckY  = y - 0.765 * bodyH;
        const headY  = y - 0.875 * bodyH;
        const headR  = 0.105 * h;
        const shHalf = 0.105 * h;
        const hpHalf = 0.072 * h;
        const roll   = sw * 0.022 * h;        // shoulders counter the legs

        const seg = (x1, y1, x2, y2, col, k) => {
            g.lineStyle(lw * (k || 1), col, 1);
            g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
        };

        // ── Legs ─────────────────────────────────────────────────────────
        for (const side of [-1, 1]) {
            const s   = side * sw;                         // +1 = this leg forward
            const hx  = x + side * hpHalf;
            const col = s > 0 ? color : dark;              // the trailing leg sits behind

            let lift = Math.max(0, s) * 0.17 * h;
            if (mode === 'jump')  lift = 0.15 * h + side * 0.05 * h;
            if (mode === 'slide') lift = 0.04 * h;
            if (mode === 'hurt')  lift = 0.08 * h * side;

            const fx = hx + side * 0.018 * h + s * 0.012 * h;
            const fy = y - lift;
            // A lifted knee comes up and out; a planted one stays under the hip.
            const kx = hx + side * 0.035 * h;
            const ky = hipY + (fy - hipY) * 0.52 - Math.abs(s) * 0.055 * h
                            - (mode === 'jump' ? 0.05 * h : 0);
            seg(hx, hipY, kx, ky, col);
            seg(kx, ky, fx, fy, col);
        }

        // ── Torso ────────────────────────────────────────────────────────
        seg(x - hpHalf, hipY, x + hpHalf, hipY, color, 0.8);
        seg(x, hipY, x, neckY, color);
        seg(x - shHalf, neckY - roll, x + shHalf, neckY + roll, color, 0.9);

        // ── Arms ─────────────────────────────────────────────────────────
        for (const side of [-1, 1]) {
            const a   = -side * sw;                        // opposite the legs
            const col = a > 0 ? dark : color;              // a forward arm is hidden by the body
            const sx  = x + side * shHalf, sy = neckY + side * roll;

            let ex = sx + side * 0.050 * h;
            let ey = sy + 0.150 * bodyH - a * 0.040 * h;
            // A hand swinging forward disappears in front of the torso, so the
            // forearm foreshortens instead of crossing over.
            let hx = ex + side * 0.014 * h;
            let hy = ey + 0.135 * bodyH * (1 - 0.40 * Math.max(0, a));

            if (mode === 'jump') {
                // Raised, not spread: straight out to the sides reads as a
                // goalpost rather than a person in the air.
                ex = sx + side * 0.046 * h; ey = sy - 0.072 * h;
                hx = ex + side * 0.018 * h; hy = ey - 0.112 * h;
            } else if (mode === 'hurt') {
                ex = sx + side * 0.115 * h; ey = sy - 0.010 * h;
                hx = ex + side * 0.080 * h; hy = ey - 0.070 * h;
            } else if (mode === 'slide') {
                ex = sx + side * 0.030 * h; ey = sy + 0.110 * bodyH;
                hx = ex + side * 0.010 * h; hy = ey + 0.100 * bodyH;
            }

            seg(sx, sy, ex, ey, col);
            seg(ex, ey, hx, hy, col);
        }

        // ── Head ─────────────────────────────────────────────────────────
        const tilt = mode === 'hurt' ? 0.045 * h : 0;
        g.lineStyle(lw * 0.85, color, 1);
        g.strokeCircle(x + tilt, headY, headR);
        g.fillStyle(color, 0.22);
        g.fillCircle(x + tilt, headY, headR);
    }
}
