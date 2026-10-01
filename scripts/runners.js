// ── Runners, seen from behind ─────────────────────────────────────────────
// The chase camera looks over a shoulder, which is the one angle where a
// side-on sprite is no use and where a line figure stops reading as a person.
// These are drawn with volume instead: limbs with thickness, a torso with a
// shirt on it, hair, shoes.
//
// The side view's joint angles do not survive the change of camera — a limb
// swinging along the direction of travel is nearly invisible from here — so
// the pose is built from what does read: how high a foot lifts, how much a
// limb is foreshortened, and how the shoulders roll against the hips.
//
// Everything is a fraction of the figure's height, so one character works at
// any distance down the road.

const RUNNER_SKINS = {

    // Dyed dreads — green, yellow, blue, pink. From behind that is the whole
    // character, so the hair carries it and everything else stays out of its
    // way: a plain shirt rather than another bright colour competing with it.
    portable: {
        skin:     0x8a5a33,
        shirt:    0xf4f1e8,
        shirtDk:  0xd6d1c2,
        print:    0xd93b3b,     // a block of colour across the back
        legs:     0x2b3c5e,
        legsDk:   0x1c2840,
        shoes:    0xf4f1e8,
        hair:     'dreads',
        hairCol:  0x241610,     // roots, under the dye
        hairCols: [0x3fbf4f, 0xf2d021, 0x2f86e0, 0xe8509c],
        printH:   0.22,
    },

    // Nigerian police black, beret, and a baton in the trailing hand so the
    // silhouette differs from the man he is chasing even at a glance.
    police: {
        skin:     0x6b4423,
        shirt:    0x17171f,
        shirtDk:  0x0c0c12,
        print:    0x3a4a66,     // the vest across the back
        legs:     0x14141b,
        legsDk:   0x090910,
        shoes:    0x24242e,     // lighter than the trousers, or the feet vanish
        hair:     'beret',
        hairCol:  0x0e0e16,
        baton:    0x6b4a28,
        printH:   0.52,         // a vest, not a print
    },
};

const Runner = {

    SKINS: RUNNER_SKINS,

    /// Joint positions for a figure of height `h` with its feet at (x, y).
    /// `mode` is run | jump | slide | hurt, `phase` is 0..1 through the stride.
    _pose(x, y, h, mode, phase) {
        const run   = mode === 'run';
        const sw    = run ? Math.sin(phase * Math.PI * 2) : 0;   // +1 = right leg forward
        const bodyH = h * (mode === 'slide' ? 0.52 : 1);
        const bob   = run ? Math.abs(Math.cos(phase * Math.PI * 2)) * 0.010 * h : 0;

        const hipY   = y - 0.46  * bodyH - bob;
        const neckY  = y - 0.775 * bodyH - bob;
        const headY  = y - 0.880 * bodyH - bob;
        const shHalf = 0.112 * h;
        const hpHalf = 0.082 * h;
        const roll   = sw * 0.020 * h;          // shoulders counter the legs

        const legs = [], arms = [];
        for (const side of [-1, 1]) {
            // ── Leg ──────────────────────────────────────────────────────
            const s  = side * sw;
            const hx = x + side * hpHalf;

            let lift = Math.max(0, s) * 0.165 * h;
            if (mode === 'jump')  lift = 0.14 * h + side * 0.045 * h;
            if (mode === 'slide') lift = 0.03 * h;
            if (mode === 'hurt')  lift = 0.07 * h * side;

            const foot = { x: hx + side * 0.016 * h + s * 0.012 * h, y: y - lift };
            const knee = {
                x: hx + side * 0.032 * h,
                y: hipY + (foot.y - hipY) * 0.52 - Math.abs(s) * 0.050 * h
                        - (mode === 'jump' ? 0.045 * h : 0),
            };
            legs.push({ hip: { x: hx, y: hipY }, knee, foot, swing: s });

            // ── Arm ──────────────────────────────────────────────────────
            const a  = -side * sw;              // opposite the legs
            const sx = x + side * shHalf, sy = neckY + side * roll;

            let elbow = { x: sx + side * 0.048 * h,
                          y: sy + 0.150 * bodyH - a * 0.038 * h };
            // A hand swinging forward disappears in front of the torso, so the
            // forearm foreshortens rather than crossing over the body.
            let hand  = { x: elbow.x + side * 0.013 * h,
                          y: elbow.y + 0.130 * bodyH * (1 - 0.40 * Math.max(0, a)) };

            if (mode === 'jump') {
                elbow = { x: sx + side * 0.044 * h, y: sy - 0.070 * h };
                hand  = { x: elbow.x + side * 0.018 * h, y: elbow.y - 0.110 * h };
            } else if (mode === 'hurt') {
                // Flung out and up, not straight out: level arms read as a
                // T-pose rather than someone losing their footing.
                elbow = { x: sx + side * 0.092 * h, y: sy + 0.055 * h };
                hand  = { x: elbow.x + side * 0.050 * h, y: elbow.y - 0.105 * h };
            } else if (mode === 'slide') {
                elbow = { x: sx + side * 0.028 * h, y: sy + 0.105 * bodyH };
                hand  = { x: elbow.x + side * 0.010 * h, y: elbow.y + 0.095 * bodyH };
            }
            arms.push({ shoulder: { x: sx, y: sy }, elbow, hand, swing: a });
        }

        return {
            h, bodyH, roll, sw, mode,
            hipY, neckY, headY, shHalf, hpHalf,
            head: { x, y: headY, rx: 0.076 * h, ry: 0.090 * h },
            legs, arms,
        };
    },

    _bone(g, a, b, w, col) {
        g.lineStyle(Math.max(1, w), col, 1);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.strokePath();
    },

    _leg(g, L, h, sk) {
        this._bone(g, L.hip,  L.knee, 0.105 * h, sk.legs);
        this._bone(g, L.knee, L.foot, 0.082 * h, sk.legsDk);
        g.fillStyle(sk.shoes, 1);
        g.fillEllipse(L.foot.x, L.foot.y - 0.012 * h, 0.088 * h, 0.046 * h);
    },

    /// Bare arm with a short sleeve over the top of it. A full sleeve in the
    /// shirt's own colour disappears into the torso and leaves the arm looking
    /// like a stump.
    _arm(g, A, h, sk) {
        this._bone(g, A.shoulder, A.elbow, 0.070 * h, sk.skin);
        this._bone(g, A.elbow,    A.hand,  0.056 * h, sk.skin);
        const cuff = { x: A.shoulder.x + (A.elbow.x - A.shoulder.x) * 0.42,
                       y: A.shoulder.y + (A.elbow.y - A.shoulder.y) * 0.42 };
        this._bone(g, A.shoulder, cuff, 0.082 * h, sk.shirtDk);
        if (sk.baton && A.swing < 0) {
            // Carried in whichever hand is trailing, so it stays in view.
            g.lineStyle(Math.max(1, 0.030 * h), sk.baton, 1);
            g.beginPath();
            g.moveTo(A.hand.x, A.hand.y - 0.02 * h);
            g.lineTo(A.hand.x + (A.hand.x > A.shoulder.x ? 1 : -1) * 0.055 * h,
                     A.hand.y + 0.135 * h);
            g.strokePath();
        }
    },

    _torso(g, p, sk) {
        const h = p.h, x = p.head.x;
        const sl = { x: x - p.shHalf, y: p.neckY - p.roll + 0.012 * h };
        const sr = { x: x + p.shHalf, y: p.neckY + p.roll + 0.012 * h };
        const hl = { x: x - p.hpHalf, y: p.hipY + 0.020 * h };
        const hr = { x: x + p.hpHalf, y: p.hipY + 0.020 * h };

        g.fillStyle(sk.shirt, 1);
        g.beginPath();
        g.moveTo(sl.x, sl.y); g.lineTo(sr.x, sr.y);
        g.lineTo(hr.x, hr.y); g.lineTo(hl.x, hl.y);
        g.closePath(); g.fillPath();

        // Shoulder line, and a block across the back — a print on one, a vest
        // on the other. At this size it is what separates the two of them.
        g.fillStyle(sk.shirtDk, 1);
        g.fillEllipse(x, (sl.y + sr.y) / 2, p.shHalf * 2, 0.055 * h);

        const span = p.hipY - p.neckY;
        const ph   = sk.printH || 0.24;
        g.fillStyle(sk.print, 1);
        g.fillRect(x - p.shHalf * 0.60, p.neckY + span * (0.62 - ph / 2),
                   p.shHalf * 1.20, span * ph);
    },

    _head(g, p, sk) {
        const h = p.h, hd = p.head;
        g.fillStyle(sk.skin, 1);
        g.fillEllipse(hd.x, hd.y, hd.rx * 2, hd.ry * 2);
        // Neck, so the head does not float off the shoulders.
        g.fillStyle(sk.skin, 1);
        g.fillRect(hd.x - 0.030 * h, hd.y, 0.060 * h, p.neckY - hd.y + 0.02 * h);

        if (sk.hair === 'beret') {
            g.fillStyle(sk.hairCol, 1);
            g.fillEllipse(hd.x, hd.y - hd.ry * 0.62, hd.rx * 2.35, hd.ry * 1.0);
            g.fillEllipse(hd.x + hd.rx * 0.9, hd.y - hd.ry * 0.95, hd.rx * 0.5, hd.ry * 0.38);
        } else if (sk.hair === 'dreads') {
            const cols = sk.hairCols || [sk.hairCol];
            const N    = 6;
            const sway = p.sw * 0.014 * h;        // the hair lags the stride

            // Kept inside the head's own outline and stopping short of the
            // nape: covering the whole skull turns him into a mop with no
            // head under it. The mass is overlapping coloured lobes rather
            // than one block, so the dye still reads at the far end of the
            // road, where a single lock is under a pixel wide.
            g.fillStyle(sk.hairCol, 1);
            g.fillEllipse(hd.x, hd.y - hd.ry * 0.44, hd.rx * 2.02, hd.ry * 1.26);
            for (let i = 0; i < N; i++) {
                const f = (i / (N - 1) - 0.5) * 2;             // -1..1 across the head
                g.fillStyle(cols[i % cols.length], 1);
                g.fillEllipse(hd.x + f * hd.rx * 0.60, hd.y - hd.ry * 0.48,
                              hd.rx * 0.76, hd.ry * 1.10);
            }

            // Short locks past the hairline, each picking up its lobe.
            for (let i = 0; i < N; i++) {
                const f   = (i / (N - 1) - 0.5) * 2;
                const tx  = hd.x + f * hd.rx * 0.68;
                const len = hd.ry * (0.26 + 0.24 * (1 - Math.abs(f)));
                g.lineStyle(Math.max(1, 0.030 * h), cols[i % cols.length], 1);
                g.beginPath();
                g.moveTo(tx, hd.y - hd.ry * 0.30);
                g.lineTo(tx + f * 0.026 * h + sway, hd.y + len);
                g.strokePath();
            }
        }
    },

    /// Draw a runner of height `h` with its feet at (x, y). Does not clear:
    /// the chase scene draws several figures into one Graphics.
    draw(g, x, y, h, mode, phase, skinName) {
        const sk = RUNNER_SKINS[skinName] || RUNNER_SKINS.portable;
        const p  = this._pose(x, y, h, mode, phase);

        // A limb swung forward is in front of the torso and so hidden by it;
        // one swung back is nearer the camera. That ordering is the only
        // depth cue a back view has.
        for (const L of p.legs) if (L.swing > 0) this._leg(g, L, h, sk);
        for (const A of p.arms) if (A.swing > 0) this._arm(g, A, h, sk);

        this._torso(g, p, sk);
        this._head(g, p, sk);

        for (const L of p.legs) if (L.swing <= 0) this._leg(g, L, h, sk);
        for (const A of p.arms) if (A.swing <= 0) this._arm(g, A, h, sk);
    },
};
