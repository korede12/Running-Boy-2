// ── Lagos street: a pseudo-3D world ───────────────────────────────────────
// The other modes look at the runner from the side. This one looks over his
// shoulder, so the road has to be built rather than scrolled: every point is
// a world coordinate divided by its distance from the camera.
//
// World units are arbitrary and chosen for how the road reads on screen:
// +z runs away from the camera, +y is up, +x is right of the centre line.
//
// The road is not stored. Its curve and its hills are smooth noise read from
// the segment index, so the street is endless and never repeats, and any
// segment can be asked about without walking there first.

const ROAD = {
    SEG_LEN:   200,
    CAM_DEPTH: 0.84,          // 1 / tan(fov/2); fov = 100°
    CAM_BACK:  900,           // how far the camera trails the runner
    DRAW_SEGS: 110,           // far enough to read a hazard before it matters
    PERSON_H:  500,
    MAX_CURVE: 2.4,
    HILL_AMP:  170,
    // Solved below from FRAME: HALF, LANE_W, CAM_H.
};

// How the view is framed, as fractions of the canvas. The world constants are
// solved from these rather than written down, so the road reads correctly
// whichever shape the canvas is: portrait is a narrower, closer view from a
// higher camera, which is what leaves room for the road ahead on a phone held
// upright. The landscape numbers are the ones the mode was tuned at.
const FRAME = (GAME_H > GAME_W)
    ? { runner: 0.130, road: 0.78, horizon: 0.30, camH: 1800 }
    : { runner: 0.233, road: 0.76, horizon: 0.40, camH:  900 };

// Pixels per world unit at scale 1. One factor for both axes, so nothing is
// stretched: a square post stays square.
const _SCALE_AT_RUNNER = ROAD.CAM_DEPTH / ROAD.CAM_BACK;
const PX_PER_UNIT = FRAME.runner * GAME_H / (ROAD.PERSON_H * _SCALE_AT_RUNNER);
const HORIZON_Y   = Math.round(GAME_H * FRAME.horizon);

ROAD.CAM_H  = FRAME.camH;
ROAD.HALF   = FRAME.road * GAME_W / (2 * _SCALE_AT_RUNNER * PX_PER_UNIT);
ROAD.LANE_W = 2 * ROAD.HALF / 3;

// ── Deterministic terrain ─────────────────────────────────────────────────

function _h1(n, seed) {
    const s = Math.sin(n * 127.1 + seed * 311.7 + 7.13) * 43758.5453;
    return s - Math.floor(s);
}

/// Smooth 1-D value noise in 0..1.
function _vnoise(t, seed) {
    const i = Math.floor(t), f = t - i;
    const u = f * f * (3 - 2 * f);
    const a = _h1(i, seed), b = _h1(i + 1, seed);
    return a + (b - a) * u;
}

function segCurve(i) { return (_vnoise(i / 46, 3) * 2 - 1) * ROAD.MAX_CURVE; }
function segElev(i)  { return (_vnoise(i / 71, 9) * 2 - 1) * ROAD.HILL_AMP; }

// ── Palette ───────────────────────────────────────────────────────────────
// Dry-season Lagos: hazy sky, red laterite either side of worn tarmac.

const LG = {
    skyTop:   0x9ab4cc,
    skyHaze:  0xe3d7b4,
    sun:      0xfff2cc,
    far:      0x8d94a0,       // distant skyline through the haze
    tarmacA:  0x3c3c3f,
    tarmacB:  0x353538,
    patch:    0x2a2a2c,
    edgeA:    0xb39a74,
    edgeB:    0xa38a66,
    dirtA:    0x8d5c35,
    dirtB:    0x8a5934,
    line:     0xc9bfa2,
    zinc:     0x9aa0a4,
    zincDark: 0x6f767b,
    wood:     0x8a6336,
    woodDark: 0x5b4023,
    danfo:    0xf2c021,
    danfoDk:  0x1c1c20,
    leaf:     0x3f6b34,
    leafDk:   0x2b4a24,
    ink:      0x22223a,
};

// ── Roadside props ────────────────────────────────────────────────────────
// Each is drawn in world units multiplied by `s`, the pixels-per-unit at that
// depth, with its base at (x, y). Simple shapes on purpose: at this distance
// a silhouette is all that survives, so the silhouettes have to differ.

const KIOSK_PAINT = [0x2f7f6a, 0xb6453c, 0x3d6ba8, 0xc8912e, 0x6a4d93];

// Props are written against the landscape road. A portrait canvas has to
// narrow the road in world units to fit a runner worth looking at, which
// would otherwise leave a danfo parked beside it wider than the street. They
// are scaled back toward that reference road — but not all the way, because
// they also have to stay taller than the runner they stand over. The exponent
// is that compromise, and it is 1 whenever the road is the one they were
// drawn for.
const PROP_REF_HALF = 1630;
const PROP_SCALE    = Math.pow(ROAD.HALF / PROP_REF_HALF, 0.6);

const SIDE = {

    kiosk(g, x, y, s, seed, dir) {
        const w = 760 * s, h = 640 * s;
        g.fillStyle(LG.woodDark, 1); g.fillRect(x - w / 2, y - h, w, h);
        g.fillStyle(KIOSK_PAINT[Math.floor(_h1(seed, 51) * KIOSK_PAINT.length)], 1);
        g.fillRect(x - w / 2 + w * 0.08, y - h * 0.94, w * 0.84, h * 0.62);
        // Zinc roof, pitched and overhanging — the giveaway shape.
        g.fillStyle(LG.zinc, 1);
        g.beginPath();
        g.moveTo(x - w * 0.62, y - h);
        g.lineTo(x,            y - h - 150 * s);
        g.lineTo(x + w * 0.62, y - h);
        g.closePath(); g.fillPath();
        g.fillStyle(LG.zincDark, 1);
        g.fillRect(x - w * 0.62, y - h, w * 1.24, 16 * s);
        // Serving hatch.
        g.fillStyle(0x1a1a1c, 1);
        g.fillRect(x - w * 0.26, y - h * 0.70, w * 0.52, h * 0.30);
    },

    danfo(g, x, y, s, seed, dir) {
        const w = 1250 * s, h = 980 * s;
        g.fillStyle(LG.danfo, 1);  g.fillRect(x - w / 2, y - h, w, h * 0.86);
        g.fillStyle(LG.danfoDk, 1);
        g.fillRect(x - w / 2, y - h * 0.52, w, h * 0.12);           // the stripe
        g.fillStyle(0x2b3a44, 1);
        g.fillRect(x - w * 0.42, y - h * 0.94, w * 0.84, h * 0.26); // windows
        g.fillStyle(0x17171a, 1);
        g.fillCircle(x - w * 0.30, y - h * 0.08, h * 0.13);
        g.fillCircle(x + w * 0.30, y - h * 0.08, h * 0.13);
    },

    palm(g, x, y, s, seed, dir) {
        const h    = (1700 + _h1(seed, 55) * 700) * s;
        const bend = (_h1(seed, 56) - 0.5) * 180 * s;
        g.lineStyle(Math.max(1, 70 * s), LG.woodDark, 1);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + bend, y - h); g.strokePath();
        const tx = x + bend, ty = y - h, fr = 520 * s;
        for (let a = 0; a < 7; a++) {
            const ang = Math.PI + (a / 6) * Math.PI;
            g.lineStyle(Math.max(1, 34 * s), a % 2 ? LG.leafDk : LG.leaf, 1);
            g.beginPath();
            g.moveTo(tx, ty);
            g.lineTo(tx + Math.cos(ang) * fr * 0.6, ty + Math.sin(ang) * fr * 0.5);
            g.lineTo(tx + Math.cos(ang) * fr, ty + Math.sin(ang) * fr * 0.5 + fr * 0.34);
            g.strokePath();
        }
    },

    /// A NEPA pole, crossarm loaded and wires sagging off both ends.
    pole(g, x, y, s, seed, dir) {
        const h = 2100 * s;
        g.fillStyle(0x6b5a44, 1);
        g.fillRect(x - 42 * s, y - h, 84 * s, h);
        g.fillStyle(0x4f4234, 1);
        g.fillRect(x - 330 * s, y - h * 0.92, 660 * s, 52 * s);
        g.lineStyle(Math.max(0.8, 18 * s), 0x2a2a2e, 0.85);
        for (const o of [-260, -80, 110, 290]) {
            g.beginPath();
            g.moveTo(x + o * s, y - h * 0.90);
            g.lineTo(x + o * s - dir * 900 * s, y - h * 0.74);
            g.strokePath();
        }
    },

    umbrella(g, x, y, s, seed, dir) {
        const h = 900 * s, r = 620 * s;
        g.fillStyle(LG.woodDark, 1);
        g.fillRect(x - 280 * s, y - 320 * s, 560 * s, 40 * s);      // the table
        g.fillRect(x - 250 * s, y - 320 * s, 34 * s, 320 * s);
        g.fillRect(x + 216 * s, y - 320 * s, 34 * s, 320 * s);
        g.fillStyle(0x6b6b70, 1); g.fillRect(x - 16 * s, y - h, 32 * s, h);
        const col = _h1(seed, 61) > 0.5 ? 0xc0392b : 0x2874a6;
        g.fillStyle(col, 1);
        g.beginPath();
        g.moveTo(x - r, y - h);
        g.lineTo(x,     y - h - 260 * s);
        g.lineTo(x + r, y - h);
        g.closePath(); g.fillPath();
        g.fillStyle(0xf4f1e8, 1);
        g.fillRect(x - r, y - h, r * 2, 22 * s);
    },

    crates(g, x, y, s, seed, dir) {
        for (let r = 0; r < 3; r++) {
            const n = 3 - r;
            for (let c = 0; c < n; c++) {
                const w  = 300 * s;
                const cx = x + (c - (n - 1) / 2) * w * 1.06;
                g.fillStyle(r % 2 ? LG.wood : 0xa8793f, 1);
                g.fillRect(cx - w / 2, y - (r + 1) * w, w, w);
                g.lineStyle(Math.max(0.5, 12 * s), LG.woodDark, 1);
                g.strokeRect(cx - w / 2, y - (r + 1) * w, w, w);
            }
        }
    },

    billboard(g, x, y, s, seed, dir) {
        const w = 1500 * s, h = 760 * s, legs = 900 * s;
        g.fillStyle(0x5a5a60, 1);
        g.fillRect(x - w * 0.40, y - legs, 60 * s, legs);
        g.fillRect(x + w * 0.34, y - legs, 60 * s, legs);
        g.fillStyle(0xe8e3d6, 1); g.fillRect(x - w / 2, y - legs - h, w, h);
        g.fillStyle(_h1(seed, 71) > 0.5 ? 0x1f7a4d : 0xb53a2e, 1);
        g.fillRect(x - w / 2, y - legs - h, w, h * 0.30);
        g.fillStyle(0x9b9688, 1);
        g.fillRect(x - w * 0.40, y - legs - h * 0.58, w * 0.52, h * 0.12);
        g.fillRect(x - w * 0.40, y - legs - h * 0.38, w * 0.70, h * 0.10);
    },
};

// ── Projection and world drawing ──────────────────────────────────────────

const Lagos = {

    ROAD, PX: PX_PER_UNIT, HORIZON_Y, LG,
    segCurve, segElev,

    /// Project one segment. `cx` is the road centre's world x at that segment.
    project(cam, cx, i) {
        const wz    = i * ROAD.SEG_LEN;
        const dz    = Math.max(60, wz - cam.z);
        const scale = ROAD.CAM_DEPTH / dz;
        return {
            i, wz, scale, cx,
            x: GAME_W / 2 + scale * (cx - cam.x) * PX_PER_UNIT,
            y: HORIZON_Y + cam.pitch + scale * (ROAD.CAM_H - segElev(i)) * PX_PER_UNIT,
            w: scale * ROAD.HALF * PX_PER_UNIT,
        };
    },

    /// Build one frame's worth of road. The curve is an accumulation, so the
    /// whole strip has to be walked in order; everything else reads from the
    /// result rather than recomputing it.
    buildView(cam) {
        const base = Math.floor(cam.z / ROAD.SEG_LEN);
        const n    = ROAD.DRAW_SEGS;

        // The road's centre line drifts as the curve accumulates. Walk it
        // once without the camera, so the camera can be aimed at where the
        // runner actually is, then project.
        const centres = new Array(n + 1);
        let cx = 0, dx = 0;
        for (let k = 0; k <= n; k++) {
            centres[k] = cx;
            cx += dx;
            dx += segCurve(base + k);
        }

        const pts = new Array(n + 1);
        for (let k = 0; k <= n; k++) pts[k] = this.project(cam, centres[k], base + k);
        pts.base = base;
        return pts;
    },

    /// The road's centre at an arbitrary z, before the camera is placed.
    /// Used to aim the camera at the runner on a bend.
    centreAt(base, wz) {
        const f = wz / ROAD.SEG_LEN - base;
        let cx = 0, dx = 0;
        const n = Math.max(0, Math.floor(f));
        for (let k = 0; k < n; k++) { cx += dx; dx += segCurve(base + k); }
        return cx + dx * (f - n);
    },

    /// Read the view between segments, so things moving down the road slide
    /// rather than stepping from one segment to the next.
    at(pts, wz) {
        const f = wz / ROAD.SEG_LEN - pts.base;
        if (f <= 0)              return pts[0];
        if (f >= pts.length - 1) return pts[pts.length - 1];
        const k = Math.floor(f), t = f - k;
        const a = pts[k], b = pts[k + 1];
        return {
            x:     a.x     + (b.x     - a.x)     * t,
            y:     a.y     + (b.y     - a.y)     * t,
            w:     a.w     + (b.w     - a.w)     * t,
            scale: a.scale + (b.scale - a.scale) * t,
            cx:    a.cx    + (b.cx    - a.cx)    * t,
        };
    },

    /// World x for the centre of a lane (0, 1, 2), relative to the road centre.
    laneX(lane) { return (lane - 1) * ROAD.LANE_W; },

    // ── Sky ───────────────────────────────────────────────────────────────

    drawSky(g, cam) {
        g.fillGradientStyle(LG.skyTop, LG.skyTop, LG.skyHaze, LG.skyHaze, 1);
        g.fillRect(0, 0, GAME_W, HORIZON_Y + cam.pitch + 4);

        // Sun burning through the harmattan haze.
        const sx = GAME_W * 0.68, sy = HORIZON_Y + cam.pitch - 54;
        for (let r = 46; r > 0; r -= 8) {
            g.fillStyle(LG.sun, 0.07 + (46 - r) * 0.004);
            g.fillCircle(sx, sy, r);
        }
        g.fillStyle(LG.sun, 0.75);
        g.fillCircle(sx, sy, 13);
    },

    /// A skyline on the far side of the haze. It drifts with the camera rather
    /// than the road, so it reads as distance instead of scenery.
    drawSkyline(g, cam) {
        const tile = 240;
        const off  = -(((cam.z * 0.0012 + cam.x * 0.02) % tile) + tile) % tile;
        const yb   = HORIZON_Y + cam.pitch + 2;
        const blocks = [[0, 34, 22], [30, 26, 14], [52, 40, 30], [96, 22, 18],
                        [122, 48, 24], [174, 30, 34], [208, 28, 16]];
        g.fillStyle(LG.far, 0.42);
        for (let t = -1; t * tile + off < GAME_W + tile; t++) {
            const ox = off + t * tile;
            for (const b of blocks) g.fillRect(ox + b[0], yb - b[2], b[1], b[2]);
            g.fillRect(ox + 186, yb - 52, 3, 20);                 // aerial mast
            g.fillRect(ox + 58,  yb - 38, 12, 8);                 // water tank
            g.fillRect(ox + 62,  yb - 42, 4, 5);
        }
    },

    // ── Road ──────────────────────────────────────────────────────────────

    _quad(g, col, x1, y1, w1, x2, y2, w2) {
        g.fillStyle(col, 1);
        g.beginPath();
        g.moveTo(x1 - w1, y1);
        g.lineTo(x2 - w2, y2);
        g.lineTo(x2 + w2, y2);
        g.lineTo(x1 + w1, y1);
        g.closePath();
        g.fillPath();
    },

    /// Draw near to far, skipping anything a crest already hides. Returns the
    /// index of the last visible segment so the scenery pass can stop there.
    drawRoad(g, pts) {
        let maxY = GAME_H + 40;
        let last = 0;

        for (let k = 0; k < pts.length - 1; k++) {
            const p1 = pts[k], p2 = pts[k + 1];
            if (p2.y >= maxY) continue;        // hidden behind a crest
            if (p1.y < HORIZON_Y - 2) break;     // past the horizon
            maxY = p2.y;
            last = k;

            const i    = p1.i;
            const dark = Math.floor(i / 3) % 2 === 0;
            // The dirt alternates on a slower, fainter cycle than the tarmac:
            // across a plane that wide, matching stripes read as a ploughed field.
            const dirt = Math.floor(i / 7) % 2 === 0;

            // Laterite shoulders, running out well past the tarmac.
            this._quad(g, dirt ? LG.dirtA : LG.dirtB,
                       p1.x, p1.y, p1.w * 2.9, p2.x, p2.y, p2.w * 2.9);
            // Dust where the tarmac has crumbled away at the edges.
            this._quad(g, dark ? LG.edgeA : LG.edgeB,
                       p1.x, p1.y, p1.w * 1.14, p2.x, p2.y, p2.w * 1.14);
            this._quad(g, dark ? LG.tarmacA : LG.tarmacB,
                       p1.x, p1.y, p1.w, p2.x, p2.y, p2.w);

            // Worn patches, always in the same places because the index
            // decides. Kept faint: at full strength they read as holes.
            if (_h1(i, 21) > 0.86) {
                const o = (_h1(i, 22) - 0.5) * 1.3;
                g.fillStyle(LG.patch, 0.5);
                g.beginPath();
                g.moveTo(p1.x + p1.w * (o - 0.26), p1.y);
                g.lineTo(p2.x + p2.w * (o - 0.26), p2.y);
                g.lineTo(p2.x + p2.w * (o + 0.26), p2.y);
                g.lineTo(p1.x + p1.w * (o + 0.26), p1.y);
                g.closePath();
                g.fillPath();
            }

            // Lane dividers: broken, faded, and only worth drawing up close.
            if (p1.w > 10 && Math.floor(i / 5) % 2 === 0) {
                for (const s of [-1, 1]) {
                    const f = s * (ROAD.LANE_W / 2) / ROAD.HALF;
                    this._quad(g, LG.line,
                               p1.x + p1.w * f, p1.y, Math.max(0.6, p1.w * 0.016),
                               p2.x + p2.w * f, p2.y, Math.max(0.5, p2.w * 0.016));
                }
            }
        }
        return last;
    },

    // ── Roadside ──────────────────────────────────────────────────────────

    /// What stands beside segment `i`, if anything. Deterministic, so an
    /// object does not flicker in and out as the draw distance moves.
    sideAt(i, side) {
        const n = i * 2 + side;
        if (_h1(n, 41) > 0.17) return null;
        const pick = _h1(n, 42);
        const type = pick < 0.20 ? 'kiosk'
                   : pick < 0.34 ? 'danfo'
                   : pick < 0.50 ? 'palm'
                   : pick < 0.64 ? 'pole'
                   : pick < 0.78 ? 'umbrella'
                   : pick < 0.90 ? 'crates'
                   :               'billboard';
        return { type, off: 1.35 + _h1(n, 43) * 1.5, seed: n };
    },

    /// Far to near, so what is close covers what is behind it.
    drawScenery(g, pts, last) {
        for (let k = last; k >= 0; k--) {
            const p = pts[k];
            if (p.w < 2) continue;
            for (let side = 0; side < 2; side++) {
                const o = this.sideAt(p.i, side);
                if (!o) continue;
                const dir = side === 0 ? -1 : 1;
                const sx  = p.x + dir * p.w * o.off;
                const s   = p.scale * PX_PER_UNIT * PROP_SCALE;
                if (s * 700 < 1.5)                  continue;
                if (sx < -280 || sx > GAME_W + 280) continue;
                SIDE[o.type](g, sx, p.y, s, o.seed, dir);
            }
        }
    },

    // ── Hazards ───────────────────────────────────────────────────────────

    /// Screen x for a world x offset from the road's centre, at a given point.
    offX(p, wx) { return p.x + p.w * (wx / ROAD.HALF); },

    drawHazard(g, h, pts) {
        const def = HAZARDS[h.type];
        const pn  = this.at(pts, h.z);
        if (pn.scale * PX_PER_UNIT * 300 < 0.8) return;
        const pf = this.at(pts, h.z + def.depth);
        HAZ_ART[h.type](g, this, pn, pf, this.laneX(h.lane), h);
    },

    drawCoin(g, p, wx, wy, bobT) {
        const s = p.scale * PX_PER_UNIT;
        const x = this.offX(p, wx);
        const y = p.y - (wy + Math.sin(bobT) * 48) * s;
        const r = 92 * s;
        if (r < 0.7) return;
        g.fillStyle(0x7a5a10, 1); g.fillCircle(x, y + r * 0.16, r);
        g.fillStyle(0xffd84a, 1); g.fillCircle(x, y, r);
        g.fillStyle(0xfff4bb, 1); g.fillCircle(x - r * 0.26, y - r * 0.26, r * 0.34);
        if (r > 4) {
            g.lineStyle(Math.max(0.8, r * 0.16), 0x8a6a14, 1);
            g.strokeCircle(x, y, r * 0.62);
        }
    },
};

// ── What is in the road ───────────────────────────────────────────────────
// Every hazard answers exactly one of three questions: jump it, slide under
// it, or get out of its lane. `clear` is that answer, and it is the only
// thing the collision check looks at — the art never decides whether a thing
// is survivable.
//
// `top` is how high the obstruction reaches (jump), or how low it hangs
// (slide). `depth` is how much road it occupies, used for the perspective.

const HAZARDS = {
    gutter:  { clear: 'jump',  top:  60, depth: 420, w: 0.98, weight: 4 },
    barrow:  { clear: 'jump',  top: 280, depth: 280, w: 0.70, weight: 3 },
    cones:   { clear: 'jump',  top: 240, depth: 240, w: 0.80, weight: 3 },
    danfo:   { clear: 'dodge', top: 980, depth: 900, w: 0.92, weight: 3 },
    banner:  { clear: 'slide', top: 300, depth: 120, w: 1.00, weight: 2 },
    pipe:    { clear: 'slide', top: 300, depth: 140, w: 1.00, weight: 2 },
};

// How wide each thing sits in its lane. Widths are road-relative because a
// lane is what they have to fit; heights come from the hazard's own `top`,
// because height is what the runner has to clear and the art must not promise
// something different from what the collision check reads.
const HAZ_ART = {

    /// An open drain cut across the lane. Flat things vanish in perspective,
    /// so it gets a raised lip and a broken plank to catch the eye.
    gutter(g, L, pn, pf, wx) {
        const hw = HAZARDS.gutter.w * ROAD.LANE_W / 2 / ROAD.HALF;
        const x1 = L.offX(pn, wx), w1 = pn.w * hw;
        const x2 = L.offX(pf, wx), w2 = pf.w * hw;
        const s  = pn.scale * PX_PER_UNIT;

        // The concrete lip first, then the hole inside it. A trench drawn
        // flat reads as a painted stripe, so the lip is what gives it depth.
        L._quad(g, 0x6b614c, x1, pn.y, w1, x2, pf.y, w2);
        L._quad(g, 0x0f0d09, x1, pn.y - 6 * s, w1 * 0.90, x2, pf.y + 2 * s, w2 * 0.90);
        g.fillStyle(0x8a6336, 1);                               // a loose plank
        g.fillRect(x1 - w1 * 0.92, pn.y - 64 * s, w1 * 0.76, 44 * s);
    },

    barrow(g, L, pn, pf, wx) {
        const s = pn.scale * PX_PER_UNIT, x = L.offX(pn, wx), y = pn.y;
        const w = 0.48 * ROAD.LANE_W * s, h = HAZARDS.barrow.top * s;
        g.fillStyle(0x7a7f85, 1);
        g.beginPath();
        g.moveTo(x - w * 0.5, y - h); g.lineTo(x + w * 0.5, y - h);
        g.lineTo(x + w * 0.34, y - h * 0.34); g.lineTo(x - w * 0.34, y - h * 0.34);
        g.closePath(); g.fillPath();
        g.fillStyle(0x4a4e53, 1); g.fillRect(x - w * 0.5, y - h, w, 26 * s);
        g.fillStyle(0x2b2b2e, 1); g.fillCircle(x, y - h * 0.16, h * 0.30);
        g.lineStyle(Math.max(1, 26 * s), 0x8a6336, 1);
        g.beginPath();
        g.moveTo(x - w * 0.34, y - h * 0.5); g.lineTo(x - w * 0.78, y - h * 0.92);
        g.moveTo(x + w * 0.34, y - h * 0.5); g.lineTo(x + w * 0.78, y - h * 0.92);
        g.strokePath();
    },

    cones(g, L, pn, pf, wx) {
        const s = pn.scale * PX_PER_UNIT, y = pn.y;
        for (const f of [-0.22, 0, 0.22]) {
            const x = L.offX(pn, wx + f * ROAD.LANE_W);
            const h = HAZARDS.cones.top * s, w = 0.14 * ROAD.LANE_W * s;
            g.fillStyle(0x3a3a3e, 1); g.fillRect(x - w * 0.8, y - 22 * s, w * 1.6, 22 * s);
            g.fillStyle(0xe2641f, 1);
            g.beginPath();
            g.moveTo(x - w * 0.6, y - 20 * s); g.lineTo(x, y - h);
            g.lineTo(x + w * 0.6, y - 20 * s);
            g.closePath(); g.fillPath();
            g.fillStyle(0xf2f0e6, 1);
            g.fillRect(x - w * 0.36, y - h * 0.62, w * 0.72, h * 0.16);
        }
    },

    /// A danfo parked dead in the lane, seen from behind. Too tall to jump —
    /// the only answer is the next lane over.
    danfo(g, L, pn, pf, wx) {
        const s = pn.scale * PX_PER_UNIT, x = L.offX(pn, wx), y = pn.y;
        const w = 1.08 * ROAD.LANE_W * s, h = HAZARDS.danfo.top * s;
        g.fillStyle(0x1a1a1d, 1);
        g.fillRect(x - w * 0.52, y - h * 0.10, w * 1.04, h * 0.10);   // shadow
        g.fillStyle(LG.danfo, 1); g.fillRect(x - w / 2, y - h, w, h * 0.88);
        g.fillStyle(LG.danfoDk, 1);
        g.fillRect(x - w / 2, y - h * 0.50, w, h * 0.13);
        g.fillStyle(0x24323c, 1);
        g.fillRect(x - w * 0.40, y - h * 0.92, w * 0.80, h * 0.30);   // rear window
        g.fillStyle(0xc0392b, 1);                                     // brake lights
        g.fillRect(x - w * 0.46, y - h * 0.34, w * 0.14, h * 0.10);
        g.fillRect(x + w * 0.32, y - h * 0.34, w * 0.14, h * 0.10);
        g.fillStyle(0x17171a, 1);
        g.fillCircle(x - w * 0.34, y - h * 0.06, h * 0.11);
        g.fillCircle(x + w * 0.34, y - h * 0.06, h * 0.11);
    },

    /// A campaign banner strung across the road at head height.
    banner(g, L, pn, pf, wx) {
        const s = pn.scale * PX_PER_UNIT, y = pn.y;
        const hw = ROAD.LANE_W / 2;
        const xl = L.offX(pn, wx - hw), xr = L.offX(pn, wx + hw);
        const top = y - 560 * s, bot = y - HAZARDS.banner.top * s;
        g.lineStyle(Math.max(0.8, 16 * s), 0x3a3a3e, 1);
        g.beginPath();
        g.moveTo(xl, y); g.lineTo(xl, top); g.moveTo(xr, y); g.lineTo(xr, top);
        g.strokePath();
        g.fillStyle(0x1f7a4d, 1); g.fillRect(xl, top, xr - xl, bot - top);
        g.fillStyle(0xf4f1e8, 1);
        g.fillRect(xl, top + (bot - top) * 0.36, xr - xl, (bot - top) * 0.28);
        g.fillStyle(0x1f7a4d, 1);
        g.fillRect(xl + (xr - xl) * 0.18, top + (bot - top) * 0.44,
                   (xr - xl) * 0.64, (bot - top) * 0.12);
    },

    /// Scaffold pipe across the lane, chest high.
    pipe(g, L, pn, pf, wx) {
        const s = pn.scale * PX_PER_UNIT, y = pn.y;
        const hw = ROAD.LANE_W / 2;
        const xl = L.offX(pn, wx - hw), xr = L.offX(pn, wx + hw);
        const bar = y - HAZARDS.pipe.top * s;
        g.fillStyle(0x6e7378, 1);
        g.fillRect(xl - 18 * s, bar, 36 * s, y - bar);
        g.fillRect(xr - 18 * s, bar, 36 * s, y - bar);
        g.fillRect(xl, bar - 34 * s, xr - xl, 44 * s);
        g.fillStyle(0xe2c21f, 1);
        for (let i = 0; i < 5; i++) {
            g.fillRect(xl + (xr - xl) * (i / 5 + 0.04), bar - 34 * s,
                       (xr - xl) * 0.10, 44 * s);
        }
    },
};
