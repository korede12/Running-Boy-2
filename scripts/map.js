// ── The city ──────────────────────────────────────────────────────────────
// The home screen: Lagos in isometric, seen from above and to the side.
//
// Everything lives on one tile grid and is projected the same way, so a
// building, a billboard and a tree all agree about where the ground is. The
// camera looks down the grid's diagonal, which means the two faces of a box
// that face you are its high-gx and high-gy sides, and that anything nearer
// the camera has a larger (gx + gy) — which is the entire sort order.

const ISO = { TW: 62, TH: 31, OX: 770, OY: 312 };   // tile width, height, origin
let CITY = null, GRID = 24, VENUES = [];
// Cropped to what the city actually occupies, so it fills the window
// instead of floating in dead canvas.
const MAP_W = 1540, MAP_H = 1072;

// Night, as the city has always been. Only the shapes changed.
const MAP_C = {
    grass:  ['#1b2420', '#192118', '#1d261c'],
    water:  ['#13344c', '#0f2a3e'],
    sand:   '#2f2a1c',
    road:   '#2f2f3b', roadDk: '#24242e', line: '#6e6e52',
    wallA:  '#2b2b3a', wallB: '#20202c', wallC: '#16161e',
    roofs:  ['#3a2520', '#1f3348', '#1d3a2b', '#3a2e18', '#2a2038', '#36202e'],
    lit:    '#ffcc55', dark: '#2a2a3c',
    trunk:  '#2b2118', leaf: '#204d26', leafDk: '#17371c',
    pin:    '#ffc83d', pinDim: '#8a93a6',
};

const AD_FACES = [
    ['#ff3fa4', '#7b2ff7'], ['#00c6ff', '#0072ff'], ['#f7971e', '#ffd200'],
    ['#11998e', '#38ef7d'], ['#fc466b', '#3f5efb'], ['#ee0979', '#ff6a00'],
];

let ROAD_GX = [], ROAD_GY = [];

const MAP_ICONS = {
    home:  'M-8 2 L0 -7 L8 2 L8 8 L-8 8 Z',
    cup:   'M-6 -7 L6 -7 L5 0 Q0 5 -5 0 Z M-1 1 L1 1 L1 6 L-1 6 Z M-5 7 L5 7 L5 9 L-5 9 Z',
    chase: 'M-8 5 L-2 -6 L2 -6 L-3 2 L3 2 L0 9 L8 -2 L2 -2 L7 -9 L-1 -9 Z',
    run:   'M1 -8 a2.4 2.4 0 1 0 0.1 0 Z M-6 9 L-1 2 L-4 -2 L1 -4 L6 0 L4 2 L0 0 L3 4 L1 9 Z',
    music: 'M0 -9 L9 -11 L9 -4 L3 -2.6 L3 5 A3.6 3.6 0 1 1 0 1.6 Z',
    fist:  'M-6 -2 L-6 4 Q-6 8 -1 8 L3 8 Q7 8 7 4 L7 -3 Q7 -5 5 -5 Q3 -5 3 -3 L3 -5 Q3 -7 1 -7 Q-1 -7 -1 -5 L-1 -4 Q-1 -6 -3 -6 Q-5 -6 -5 -4 L-5 -2 Z',
    road:  'M-7 -8 L7 -8 L7 -2 L-7 -2 Z M-1.6 -2 L1.6 -2 L1.6 9 L-1.6 9 Z',
    cart:  'M-8 -5 L-5 -5 L-3 3 L5 3 L7 -2 L-4 -2 M-2 7 a1.6 1.6 0 1 0 0.1 0 M4 7 a1.6 1.6 0 1 0 0.1 0',
};

function mrand(a, b) {
    const s = Math.sin(a * 127.1 + b * 311.7 + 7.13) * 43758.5453;
    return s - Math.floor(s);
}

/// Grid to screen. gz is height in pixels, straight up the screen.
function iso(gx, gy, gz) {
    return [
        ISO.OX + (gx - gy) * (ISO.TW / 2),
        ISO.OY + (gx + gy) * (ISO.TH / 2) - (gz || 0),
    ];
}
const pt = p => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
const poly = (pts, fill, extra) =>
    `<polygon points="${pts.map(pt).join(' ')}" fill="${fill}"${extra || ''}/>`;

const isRoad = (gx, gy) =>
    ROAD_GX.includes(gx) || ROAD_GY.includes(gy) ||
    (CITY.exit && (CITY.exit.axis === 'gx' ? gx === CITY.exit.at : gy === CITY.exit.at) &&
     (CITY.exit.axis === 'gx' ? gy : gx) >= CITY.exit.from &&
     (CITY.exit.axis === 'gx' ? gy : gx) <= CITY.exit.to);

const isRock = (gx, gy) =>
    !!(CITY.rocks && CITY.rocks.some(r => r[0] === gx && r[1] === gy));

/// Lagoon past a column, or a river running the diagonal. A road crossing
/// either one is a bridge, which falls out of the geometry rather than
/// being placed by hand.
function isWater(gx, gy) {
    if (CITY.water) return gx >= CITY.water.from && gy !== CITY.water.bridgeGY;
    if (CITY.river) {
        const d = gy - gx;
        return d >= CITY.river.lo && d <= CITY.river.hi && !isRoad(gx, gy);
    }
    return false;
}

/// Buildable ground: on the grid, not wet, and not the shore strip a lagoon
/// needs left clear.
function onLand(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return false;
    if (isWater(gx, gy)) return false;
    if (CITY.water && gx >= CITY.water.from - 1) return false;
    return true;
}

/// Where a road runs over water it is carried on a deck.
const isBridge = (gx, gy) => {
    if (!isRoad(gx, gy)) return false;
    if (CITY.water) return gx >= CITY.water.from && gy === CITY.water.bridgeGY;
    if (CITY.river) { const d = gy - gx; return d >= CITY.river.lo && d <= CITY.river.hi; }
    return false;
};

const CityMap = {

    build() {
        const host = document.getElementById('map');
        if (!host || typeof CITIES === 'undefined') return;
        CITY = getCity(currentCityId());
        GRID = CITY.grid;
        ROAD_GX = CITY.roadsGX;
        ROAD_GY = CITY.roadsGY;
        VENUES = CITY.venues;

        const s = [];
        s.push(`<svg id="map-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="City map">`);
        s.push(`<defs>`);
        AD_FACES.forEach(([a, b], i) => s.push(
            `<linearGradient id="ad${i}" x1="0" y1="0" x2="1" y2="1">` +
            `<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`));
        s.push(`<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
               `<stop offset="0" stop-color="#0a0a14"/><stop offset="1" stop-color="#141422"/></linearGradient>`);
        s.push(`<filter id="mglow" x="-70%" y="-70%" width="240%" height="240%">` +
               `<feGaussianBlur stdDeviation="8" result="b"/>` +
               `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
        s.push(`</defs>`);
        s.push(`<rect width="${MAP_W}" height="${MAP_H}" fill="url(#sky)"/>`);

        this._ground(s);

        // Everything that stands up is collected, sorted by distance from the
        // camera, and laid down back to front — otherwise a far tower paints
        // over the near one in front of it.
        const props = [];
        this._rocks(props);
        this._exit(props);
        this._blocks(props);
        this._nature(props);
        this._traffic(props);
        this._people(props);
        this._billboards(props);
        this._venueProps(props);
        props.sort((a, b) => a.d - b.d);
        for (const p of props) s.push(p.svg);

        s.push(`</svg>`);
        host.innerHTML = s.join('');

        const where = document.getElementById('hud-where');
        if (where) where.textContent = CITY.name + ' · ' + CITY.tag;

        host.querySelectorAll('.venue').forEach(g => {
            const id = g.getAttribute('data-venue');
            g.addEventListener('click', () => CityMap.pick(id));
            g.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); CityMap.pick(id); }
            });
        });
    },

    // ── Ground ────────────────────────────────────────────────────────────

    _ground(s) {
        const tile = (gx, gy, fill) => poly(
            [iso(gx, gy, 0), iso(gx + 1, gy, 0), iso(gx + 1, gy + 1, 0), iso(gx, gy + 1, 0)], fill);

        for (let gy = 0; gy < GRID; gy++) {
            for (let gx = 0; gx < GRID; gx++) {
                if (isWater(gx, gy)) { s.push(tile(gx, gy, MAP_C.water[(gx + gy) % 2])); continue; }
                if (CITY.water && gx === CITY.water.from - 1) { s.push(tile(gx, gy, MAP_C.sand)); continue; }
                if (isRoad(gx, gy)) {
                    s.push(tile(gx, gy, MAP_C.road));
                    const along = ROAD_GY.includes(gy);
                    const a = along ? iso(gx, gy + 0.5, 0) : iso(gx + 0.5, gy, 0);
                    const b = along ? iso(gx + 1, gy + 0.5, 0) : iso(gx + 0.5, gy + 1, 0);
                    s.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${MAP_C.line}" stroke-width="2.4" stroke-dasharray="11 13" opacity="0.8"/>`);
                    continue;
                }
                s.push(tile(gx, gy, MAP_C.grass[Math.floor(mrand(gx, gy) * 3)]));
            }
        }

        // Decks, wherever a road was found to be crossing water.
        const decks = [];
        for (let gy = 0; gy < GRID; gy++)
            for (let gx = 0; gx < GRID; gx++)
                if (isBridge(gx, gy)) decks.push([gx, gy]);
        for (const [gx, gy] of decks) {
            const H = 18;
            const A = iso(gx, gy, H), B = iso(gx + 1, gy, H);
            const C = iso(gx + 1, gy + 1, H), D = iso(gx, gy + 1, H);
            s.push(poly([D, C, [C[0], C[1] + H], [D[0], D[1] + H]], MAP_C.roadDk));
            s.push(poly([B, C, [C[0], C[1] + H], [B[0], B[1] + H]], '#50505d'));
            s.push(poly([A, B, C, D], MAP_C.road));
            const a = iso(gx, gy + 0.5, H), b = iso(gx + 1, gy + 0.5, H);
            s.push(`<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${MAP_C.line}" stroke-width="2.4" stroke-dasharray="11 13" opacity="0.8"/>`);
        }
    },

    // ── A box, which is what everything is made of ────────────────────────

    _box(gx, gy, w, d, h, top, right, left) {
        const A = iso(gx, gy, h),         B = iso(gx + w, gy, h);
        const C = iso(gx + w, gy + d, h), D = iso(gx, gy + d, h);
        const Bg = iso(gx + w, gy, 0),    Cg = iso(gx + w, gy + d, 0), Dg = iso(gx, gy + d, 0);
        return poly([D, C, Cg, Dg], left) +
               poly([B, C, Cg, Bg], right) +
               poly([A, B, C, D], top);
    },

    /// Depth key: the corner of the footprint nearest the camera.
    _d(gx, gy, w, d) { return (gx + (w || 1)) + (gy + (d || 1)); },

    _venueTile(gx, gy) {
        return VENUES.some(v => gx >= v.gx - 1 && gx <= v.gx + (v.gw || 2) &&
                                gy >= v.gy - 1 && gy <= v.gy + (v.gd || 2));
    },

    // ── Rock ──────────────────────────────────────────────────────────────
    // Olumo and the outcrops the town is built around: stacked boulders
    // rather than boxes, so they read as landscape and not architecture.

    _rocks(out) {
        for (const [gx, gy] of (CITY.rocks || [])) {
            const n = mrand(gx * 11, gy * 19);
            const h = 54 + Math.round(n * 96);
            let g = this._box(gx, gy, 1, 1, h, '#6f6558', '#5b5245', '#433d33');
            g += this._box(gx + 0.18, gy + 0.2, 0.66, 0.62, h + 26 + n * 22,
                           '#7d7263', '#675e50', '#4b443a');
            if (n > 0.5) g += this._box(gx + 0.42, gy + 0.1, 0.4, 0.38, h + 52 + n * 26,
                                        '#8a7e6d', '#6f6658', '#524a3f');
            out.push({ d: this._d(gx, gy, 1, 1) + 0.1, svg: g });
        }
    },

    // ── The road out of town ──────────────────────────────────────────────
    // It runs off the edge of the grid toward the other city, so travelling
    // is somewhere you drive to rather than a control in a corner.

    _exit(out) {
        const e = CITY.exit;
        if (!e) return;
        const tile = (gx, gy) => poly(
            [iso(gx, gy, 0), iso(gx + 1, gy, 0), iso(gx + 1, gy + 1, 0), iso(gx, gy + 1, 0)],
            MAP_C.road);
        for (let k = e.from; k <= e.to; k++) {
            const gx = e.axis === 'gx' ? e.at : k;
            const gy = e.axis === 'gx' ? k : e.at;
            let g = tile(gx, gy);
            const a = e.axis === 'gx' ? iso(gx + 0.5, gy, 0) : iso(gx, gy + 0.5, 0);
            const b = e.axis === 'gx' ? iso(gx + 0.5, gy + 1, 0) : iso(gx + 1, gy + 0.5, 0);
            g += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${MAP_C.line}" stroke-width="2.4" stroke-dasharray="11 13" opacity="0.8"/>`;
            out.push({ d: this._d(gx, gy, 1, 1) - 0.1, svg: g });
        }
    },

    // ── Blocks of buildings ───────────────────────────────────────────────

    _blocks(out) {
        const taken = (gx, gy) =>
            gx < 0 || gy < 0 || !onLand(gx, gy) || gy >= GRID - 1 ||
            isRoad(gx, gy) || this._venueTile(gx, gy);

        for (let gy = 0; gy < GRID - 1; gy++) {
            for (let gx = 0; gx < GRID - 1; gx++) {
                const n = mrand(gx * 7, gy * 13);
                if (n < 0.52) continue;                                  // room between things
                if (taken(gx, gy)) continue;

                const w = n > 0.9 ? 2 : 1, d = n > 0.86 ? 2 : 1;
                if (taken(gx + w - 1, gy + d - 1) || taken(gx + w - 1, gy) || taken(gx, gy + d - 1)) continue;

                const h = 30 + Math.round(mrand(gy, gx) * 130);
                const roof = MAP_C.roofs[Math.floor(mrand(gx + 3, gy + 5) * MAP_C.roofs.length)];
                const tower = h > 100;                                   // tall ones go flat-topped

                let g = this._box(gx, gy, w, d, h,
                    tower ? MAP_C.wallB : roof, MAP_C.wallA, MAP_C.wallC);

                // Windows down both faces that look at the camera.
                const rows = Math.max(1, Math.floor((h - 18) / 28));
                for (let r = 0; r < rows; r++) {
                    const wy = h - 20 - r * 28;
                    if (wy < 10) break;
                    for (let c = 0; c < w * 2; c++) {
                        const p = iso(gx + w, gy + 0.22 + c * 0.48, wy);
                        if (c >= d * 2) break;
                        g += poly([p, [p[0], p[1] + 12], [p[0] - 11, p[1] + 17.5], [p[0] - 11, p[1] + 5.5]],
                                  mrand(wy, gx + c) > 0.45 ? MAP_C.lit : MAP_C.dark, ' opacity="0.9"');
                    }
                    for (let c = 0; c < d * 2; c++) {
                        const p = iso(gx + 0.22 + c * 0.48, gy + d, wy);
                        if (c >= w * 2) break;
                        g += poly([p, [p[0], p[1] + 12], [p[0] + 11, p[1] + 17.5], [p[0] + 11, p[1] + 5.5]],
                                  mrand(wy + 7, gy + c) > 0.55 ? MAP_C.lit : MAP_C.dark, ' opacity="0.72"');
                    }
                }
                if (tower) {
                    g += this._box(gx + 0.3, gy + 0.3, 0.4, 0.4, h + 16, '#33333f', '#2a2a34', '#1d1d26');
                }
                out.push({ d: this._d(gx, gy, w, d), svg: g });
            }
        }
    },

    // ── Billboards ────────────────────────────────────────────────────────
    // Standing off the kerb on two posts, face turned to the traffic. They
    // are the loudest thing on a Lagos road and they are the loudest thing
    // here — the one object allowed to break the city's palette.

    _billboards(out) {
        const spots = [];
        ROAD_GY.forEach((gy, i) => {
            for (let gx = 2; onLand(gx, gy); gx += 6) spots.push([gx + (i % 2), gy - 0.4, 'x']);
        });
        ROAD_GX.forEach((gx, i) => {
            for (let gy = 3; gy < GRID - 2; gy += 7) spots.push([gx - 0.4, gy + (i % 2), 'y']);
        });

        spots.forEach(([gx, gy, axis], i) => {
            if (gx < 0.5 || gy < 0.5 || gx > GRID - 2 || gy > GRID - 2) return;
            if (this._venueTile(Math.round(gx), Math.round(gy))) return;

            const H = 76, BW = 58, BH = 32;
            const base = iso(gx, gy, 0);
            const top  = iso(gx, gy, H);

            // The panel is skewed along whichever grid axis it fronts, so it
            // sits in the same world as everything else rather than on glass.
            const dx = BW / 2;
            const dy = axis === 'x' ? -BW / 5 : BW / 5;
            const P = [
                [top[0] - dx, top[1] - dy - BH],
                [top[0] + dx, top[1] + dy - BH],
                [top[0] + dx, top[1] + dy],
                [top[0] - dx, top[1] - dy],
            ];
            let g = '';
            g += `<ellipse cx="${base[0].toFixed(1)}" cy="${base[1].toFixed(1)}" rx="${(BW * 0.4).toFixed(1)}" ry="6" fill="#000" opacity="0.16"/>`;
            g += `<line x1="${(base[0] - dx * 0.5).toFixed(1)}" y1="${(base[1] - dy * 0.5).toFixed(1)}" x2="${(P[3][0] + dx * 0.5).toFixed(1)}" y2="${(P[3][1] + dy * 0.5).toFixed(1)}" stroke="#6a6a78" stroke-width="5"/>`;
            g += `<line x1="${(base[0] + dx * 0.5).toFixed(1)}" y1="${(base[1] + dy * 0.5).toFixed(1)}" x2="${(P[2][0] - dx * 0.5).toFixed(1)}" y2="${(P[2][1] - dy * 0.5).toFixed(1)}" stroke="#7a7a88" stroke-width="8"/>`;
            g += poly(P, '#15151d');
            const inset = P.map((p, k) => [
                p[0] + (k === 0 || k === 3 ? 3.5 : -3.5),
                p[1] + (k === 0 || k === 1 ? 2.5 : -2.5),
            ]);
            g += poly(inset, `url(#ad${i % AD_FACES.length})`);

            const mx = (P[0][0] + P[2][0]) / 2, my = (P[0][1] + P[2][1]) / 2;
            g += `<rect x="${(mx - BW * 0.32).toFixed(1)}" y="${(my - 9).toFixed(1)}" width="${(BW * 0.64).toFixed(1)}" height="6" rx="1.5" fill="#fff" opacity="0.94"/>`;
            g += `<rect x="${(mx - BW * 0.32).toFixed(1)}" y="${(my + 0.5).toFixed(1)}" width="${(BW * 0.44).toFixed(1)}" height="3.5" rx="1.5" fill="#fff" opacity="0.62"/>`;
            g += `<rect x="${(mx - BW * 0.32).toFixed(1)}" y="${(my + 6).toFixed(1)}" width="${(BW * 0.3).toFixed(1)}" height="3" rx="1.5" fill="#fff" opacity="0.44"/>`;
            out.push({ d: this._d(gx, gy, 1, 1) + 0.45, svg: g });
        });
    },

    // ── Trees ─────────────────────────────────────────────────────────────

    _nature(out) {
        for (let gy = 1; gy < GRID - 1; gy++) {
            for (let gx = 1; gx < GRID - 1; gx++) {
                if (!onLand(gx, gy)) continue;
                if (isRoad(gx, gy) || this._venueTile(gx, gy)) continue;
                const n = mrand(gx * 31, gy * 17);
                if (n < 0.88) continue;
                const b = iso(gx + 0.5, gy + 0.5, 0);
                const r = 16 + n * 9;
                let g = `<ellipse cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" rx="${(r * 0.9).toFixed(1)}" ry="${(r * 0.45).toFixed(1)}" fill="#000" opacity="0.17"/>`;
                g += `<rect x="${(b[0] - 3.5).toFixed(1)}" y="${(b[1] - 30).toFixed(1)}" width="7" height="30" fill="${MAP_C.trunk}"/>`;
                g += `<circle cx="${b[0].toFixed(1)}" cy="${(b[1] - 38).toFixed(1)}" r="${r.toFixed(1)}" fill="${MAP_C.leafDk}"/>`;
                g += `<circle cx="${(b[0] - 5).toFixed(1)}" cy="${(b[1] - 44).toFixed(1)}" r="${(r * 0.74).toFixed(1)}" fill="${MAP_C.leaf}"/>`;
                out.push({ d: this._d(gx, gy, 1, 1), svg: g });
            }
        }
    },

    // ── Traffic ───────────────────────────────────────────────────────────

    _traffic(out) {
        const veh = (gx, gy, col, long) => {
            const b = iso(gx, gy, 0);
            const L = long ? 34 : 24, W = 15, H = long ? 17 : 12;
            let g = `<ellipse cx="${b[0].toFixed(1)}" cy="${(b[1] + 3).toFixed(1)}" rx="${(L * 0.6).toFixed(1)}" ry="7" fill="#000" opacity="0.17"/>`;
            g += poly([[b[0] - L / 2, b[1] - H], [b[0], b[1] - H - W / 2],
                       [b[0] + L / 2, b[1] - H], [b[0], b[1] - H + W / 2]], col);
            g += poly([[b[0] - L / 2, b[1] - H], [b[0], b[1] - H + W / 2],
                       [b[0], b[1] + W / 2], [b[0] - L / 2, b[1]]], '#00000044');
            g += poly([[b[0] + L / 2, b[1] - H], [b[0], b[1] - H + W / 2],
                       [b[0], b[1] + W / 2], [b[0] + L / 2, b[1]]], '#00000022');
            return g;
        };
        const cols = ['#e8b31c', '#c0392b', '#2874a6', '#f2efe6', '#1f7a4d'];
        let i = 0;

        // Moving along the grid, not across the screen: a tile step is
        // (TW/2, TH/2) one way and (-TW/2, TH/2) the other, so the animation
        // has to be told the road's direction or the cars drift off the
        // tarmac. The lane sits on the outer group and the motion on the
        // inner one, because a CSS transform replaces an SVG one outright.
        const drive = (gx, gy, cls, delay, body, lift) =>
            `<g transform="translate(0 ${-(lift || 0)})">` +
            `<g class="${cls}" style="animation-delay:${delay.toFixed(1)}s">${body}</g></g>`;

        ROAD_GY.forEach((gy, r) => {
            for (let k = 0; k < 4; k++) {
                const gx = 1 + k * 5;
                const n = mrand(gx, gy * 3);
                out.push({ d: this._d(gx, gy, 1, 1) + 0.25,
                    svg: drive(gx, gy, 'rolls-x', -(k * 7 + r * 3),
                        veh(gx + 0.5, gy + 0.2, cols[i % cols.length], n > 0.6)) });
                i++;
                out.push({ d: this._d(gx + 2, gy, 1, 1) + 0.26,
                    svg: drive(gx, gy, 'rolls-xr', -(k * 6 + r * 5),
                        veh(gx + 2.5, gy + 0.72, cols[(i + 2) % cols.length], n > 0.8)) });
                i++;
            }
        });
        ROAD_GX.forEach((gx, c) => {
            for (let k = 0; k < 3; k++) {
                const gy = 1 + k * 6;
                const n = mrand(gx * 5, gy);
                out.push({ d: this._d(gx, gy, 1, 1) + 0.25,
                    svg: drive(gx, gy, 'rolls-y', -(k * 8 + c * 4),
                        veh(gx + 0.25, gy + 0.5, cols[i % cols.length], n > 0.7)) });
                i++;
            }
        });
    },

    // ── People ────────────────────────────────────────────────────────────
    // Walking the pavements. Two pixels of head and body is enough at this
    // scale, and it is the difference between a model and a place.

    _people(out) {
        const SHIRT = ['#e8e3d6', '#c0392b', '#2874a6', '#f2d021', '#3f8f5a', '#b03a6e'];
        const person = (gx, gy, col) => {
            const b = iso(gx, gy, 0);
            return `<ellipse cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" rx="5" ry="2.6" fill="#000" opacity="0.3"/>` +
                   `<rect x="${(b[0] - 3).toFixed(1)}" y="${(b[1] - 13).toFixed(1)}" width="6" height="9" rx="2" fill="${col}"/>` +
                   `<circle cx="${b[0].toFixed(1)}" cy="${(b[1] - 16).toFixed(1)}" r="3.4" fill="#8a5a33"/>`;
        };
        let i = 0;
        ROAD_GY.forEach((gy, r) => {
            for (let k = 0; k < 5; k++) {
                const gx = 1 + k * 4;
                out.push({ d: this._d(gx, gy, 1, 1) + 0.3, svg:
                    `<g><g class="walks-x" style="animation-delay:${-(k * 9 + r * 5)}s">` +
                    person(gx + 0.5, gy - 0.12, SHIRT[i++ % SHIRT.length]) + `</g></g>` });
                out.push({ d: this._d(gx, gy, 1, 1) + 0.31, svg:
                    `<g><g class="walks-xr" style="animation-delay:${-(k * 7 + r * 3)}s">` +
                    person(gx + 2.2, gy + 1.08, SHIRT[i++ % SHIRT.length]) + `</g></g>` });
            }
        });
        ROAD_GX.forEach((gx, c) => {
            for (let k = 0; k < 4; k++) {
                const gy = 1 + k * 5;
                out.push({ d: this._d(gx, gy, 1, 1) + 0.3, svg:
                    `<g><g class="walks-y" style="animation-delay:${-(k * 11 + c * 6)}s">` +
                    person(gx - 0.1, gy + 0.5, SHIRT[i++ % SHIRT.length]) + `</g></g>` });
            }
        });
    },

    // ── Venues ────────────────────────────────────────────────────────────

    _venueProps(out) {
        for (const v of VENUES) {
            const play = v.kind === 'play';
            const col  = play ? MAP_C.pin : MAP_C.pinDim;
            const w = v.gw || 2, d = v.gd || 2, h = v.vh || 112;
            const roof = v.roof || (play ? '#c0392b' : '#2874a6');

            let g = `<g class="venue${play ? ' venue-play' : ''}" data-venue="${v.id}" tabindex="0" role="button" aria-label="${v.name}">`;
            g += this._box(v.gx, v.gy, w, d, h, roof, MAP_C.wallA, MAP_C.wallB);
            for (let r = 0; r < 3; r++) {
                const p = iso(v.gx + w, v.gy + 0.3 + r * 0.5, h - 62);
                g += poly([p, [p[0], p[1] + 12], [p[0] - 11, p[1] + 17.5], [p[0] - 11, p[1] + 5.5]], MAP_C.lit, ' opacity="0.8"');
            }

            // A lit sign band across the face that looks at the camera, so a
            // venue is somewhere you can see rather than a marker on a roof.
            const sA = iso(v.gx + w, v.gy, h - 30), sB = iso(v.gx + w, v.gy + d, h - 30);
            g += poly([sA, sB, [sB[0], sB[1] + 22], [sA[0], sA[1] + 22]], col, ' opacity="0.95"');

            // The disc floats above on a short stalk — it is what you aim at.
            const top = iso(v.gx + w / 2, v.gy + d / 2, h + 80);
            g += `<line x1="${top[0].toFixed(1)}" y1="${(top[1] + 22).toFixed(1)}" x2="${top[0].toFixed(1)}" y2="${(top[1] + 58).toFixed(1)}" stroke="${col}" stroke-width="2.5" opacity="0.5"/>`;
            if (play) g += `<circle class="v-halo" cx="${top[0].toFixed(1)}" cy="${top[1].toFixed(1)}" r="39" fill="none" stroke="${col}" stroke-width="2.5" opacity="0.4"/>`;
            g += `<circle class="v-disc" cx="${top[0].toFixed(1)}" cy="${top[1].toFixed(1)}" r="29" fill="#ffffff" stroke="${col}" stroke-width="4.5"${play ? ' filter="url(#mglow)"' : ''}/>`;
            g += `<g class="v-icon" transform="translate(${top[0].toFixed(1)} ${top[1].toFixed(1)}) scale(1.55)" fill="${play ? '#8a6410' : '#44506a'}" fill-rule="evenodd"><path d="${MAP_ICONS[v.icon] || MAP_ICONS.home}"/></g>`;

            const lab = iso(v.gx + w / 2, v.gy + d / 2, h + 130);
            g += `<text class="v-name" x="${lab[0].toFixed(1)}" y="${lab[1].toFixed(1)}" text-anchor="middle">${v.name}</text>`;
            if (v.tag) g += `<text class="v-tag" x="${lab[0].toFixed(1)}" y="${(lab[1] + 20).toFixed(1)}" text-anchor="middle">${v.tag}</text>`;

            // One hit area over building, disc and label together.
            const gnd = iso(v.gx + w / 2, v.gy + d / 2, 0);
            g += `<rect class="v-hit" x="${(gnd[0] - 92).toFixed(1)}" y="${(lab[1] - 26).toFixed(1)}" width="184" height="${(gnd[1] - lab[1] + 52).toFixed(1)}" fill="transparent"/>`;
            g += `</g>`;

            out.push({ d: this._d(v.gx, v.gy, w, d) + 0.6, svg: g });
        }
    },

    /// Going somewhere either opens a panel or starts a run there.
    pick(id) {
        const v = getVenue(id);
        if (!v) return;
        if (typeof _playUiSound === 'function') _playUiSound('single-click.mp3');

        if (v.kind === 'open') { openModal(v.modal); return; }

        // Travel: the road out is a place you go to, so going there moves
        // the whole map rather than opening a chooser.
        if (v.kind === 'travel') {
            try { localStorage.setItem('runningboy_city', v.to); } catch (_) {}
            CityMap.build();
            CityMap.centre();
            CityMap.banner('Arrived in ' + getCity(v.to).name);
            return;
        }

        try { localStorage.setItem('runningboy_venue', v.id); } catch (_) {}

        const who = venueCharacters(v.id);
        if (who.length === 1) { selectCharacter(who[0]); startGame(); return; }
        if (who.indexOf(getCharacter()) < 0) selectCharacter(who[0]);

        const hint = document.getElementById('char-hint');
        if (hint) hint.textContent = v.name + ' — ' + v.blurb;
        openModal('char-modal');
    },

    /// A word on arrival, so travelling is something that happened rather
    /// than the map silently becoming a different one.
    banner(text) {
        const hud = document.getElementById('hud');
        if (!hud) return;
        const el = document.createElement('div');
        el.id = 'arrive';
        el.textContent = text;
        hud.appendChild(el);
        setTimeout(() => el.classList.add('gone'), 1500);
        setTimeout(() => el.remove(), 2200);
    },

    /// The city is bigger than the window, so open on the middle of it.
    centre() {
        const st = document.getElementById('city-stage');
        if (!st) return;
        st.scrollLeft = (st.scrollWidth  - st.clientWidth)  / 2;
        st.scrollTop  = (st.scrollHeight - st.clientHeight) / 2;
    },
};

document.addEventListener('DOMContentLoaded', () => {
    CityMap.build();
    CityMap.centre();
    window.addEventListener('resize', () => CityMap.centre());

    const lb = document.getElementById('global-lb');
    const hd = document.getElementById('global-lb-header');
    if (lb && hd) {
        hd.addEventListener('click', e => {
            if (e.target.closest('.lb-refresh-btn')) return;
            lb.classList.toggle('open');
        });
    }
});
