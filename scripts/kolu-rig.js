// ── Kolu skeletal rig ─────────────────────────────────────────────────────
// Assembles the character from separate limb images and animates them by
// rotating each part about a joint. Same maths as the offline renderer.
//
// Pivots are in source-image pixels; Phaser wants them normalised as origins.

const KOLU_PARTS = {
    body:      { key: 'kolu_body',      w: 326, h: 780, pivot: [165, 745] }, // hip
    arm_upper: { key: 'kolu_arm_upper', w: 240, h: 396, pivot: [130,  42] }, // shoulder
    leg_upper: { key: 'kolu_leg_upper', w: 224, h: 534, pivot: [112,  45] }, // hip
    leg_lower: { key: 'kolu_leg_lower', w: 269, h: 610, pivot: [120,  45] }, // knee
};

// Tunables — every number here is safe to change live.
// Values tuned by eye in rig-test.html.
const KOLU_RIG = {
    scale:      0.058,  // art px -> screen px
    legUpLen:   300,    // hip -> knee, in art px
    shoulderX:  -28,    // shoulder offset from hip, art px
    shoulderY: -270,
    legSwing:     8,    // degrees
    kneeBend:    55,
    kneePhase:    2,    // * PI
    armSwing:    49,
    bob:         10,    // art px (scaled)
    farTint:  0x8c8c8c, // darkening applied to the far limbs
    cycleHz:   0.85,    // run cycle speed
};

// Ground scroll speed these values were tuned against.
const KOLU_GROUND_SPEED = 3.9;

const DEG = Math.PI / 180;

class KoluRig {
    static preload(scene, dir = 'assets/kolu/') {
        Object.values(KOLU_PARTS).forEach(p => scene.load.image(p.key, dir + p.key + '.png'));
    }

    // Distance from hip to sole, in screen px — lets callers position the rig
    // from a ground/feet coordinate instead of the hip.
    static hipToFoot(cfg = KOLU_RIG) {
        const shin = KOLU_PARTS.leg_lower.h - KOLU_PARTS.leg_lower.pivot[1];
        return (cfg.legUpLen + shin) * cfg.scale;
    }

    constructor(scene, x, y, depth = 20) {
        this.scene = scene;
        this.x = x;
        this.y = y;              // y is the HIP position
        this.t = 0;
        this.cfg = Object.assign({}, KOLU_RIG);

        const mk = (part, far) => {
            const p = KOLU_PARTS[part];
            const img = scene.add.image(0, 0, p.key)
                .setOrigin(p.pivot[0] / p.w, p.pivot[1] / p.h)
                .setScrollFactor(0)
                .setDepth(depth + (far ? -2 : 2));
            if (far) img.setTint(this.cfg.farTint);
            return img;
        };

        // draw order: far limbs, body, near limbs
        this.farLegUp  = mk('leg_upper', true);
        this.farLegLo  = mk('leg_lower', true);
        this.farArm    = mk('arm_upper', true);
        this.body      = mk('body',      false);
        this.body.setDepth(depth);
        this.nearLegUp = mk('leg_upper', false);
        this.nearLegLo = mk('leg_lower', false);
        this.nearArm   = mk('arm_upper', false);

        this.parts = [this.farLegUp, this.farLegLo, this.farArm, this.body,
                      this.nearLegUp, this.nearLegLo, this.nearArm];
        this.applyScale();
        this.update(0);
    }

    applyScale() { this.parts.forEach(p => p.setScale(this.cfg.scale)); }

    setPosition(x, y) { this.x = x; this.y = y; return this; }

    setVisible(v) { this.parts.forEach(p => p.setVisible(v)); return this; }

    destroy() { this.parts.forEach(p => p.destroy()); }

    // dt in ms
    update(dt) {
        this.t = (this.t + (dt / 1000) * this.cfg.cycleHz) % 1;
        this.pose(this.t);
    }

    pose(t) {
        const c = this.cfg, s = c.scale, TAU = Math.PI * 2;
        const bob = Math.sin(t * TAU * 2) * c.bob * s;
        const hipX = this.x, hipY = this.y + bob;
        const shX  = hipX + c.shoulderX * s;
        const shY  = hipY + c.shoulderY * s;

        const legSwing = ph => c.legSwing * Math.sin(ph * TAU);
        const kneeBend = ph => Math.max(0, c.kneeBend * Math.sin(ph * TAU + Math.PI * c.kneePhase));
        const armSwing = ph => c.armSwing * Math.sin(ph * TAU);

        const limb = (ph, up, lo, arm) => {
            const thigh = legSwing(ph);
            up.setPosition(hipX, hipY).setRotation(thigh * DEG);
            const a = thigh * DEG, L = c.legUpLen * s;
            lo.setPosition(hipX + Math.sin(a) * L, hipY + Math.cos(a) * L)
              .setRotation((thigh + kneeBend(ph)) * DEG);
            arm.setPosition(shX, shY).setRotation(-armSwing(ph) * DEG);
        };

        limb(t + 0.5, this.farLegUp,  this.farLegLo,  this.farArm);
        limb(t,       this.nearLegUp, this.nearLegLo, this.nearArm);
        this.body.setPosition(hipX, hipY);
    }
}
