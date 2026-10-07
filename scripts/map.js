// ── City map ──────────────────────────────────────────────────────────────
// The home screen: a district from above, big enough to read as a place
// rather than a diagram. Lagoon, bridge, a road grid with traffic and
// billboards along it, blocks broken into individual buildings, and a
// landmark for every venue.
//
// All of it is generated from data so a pin cannot drift from the place it
// names, and the scatter is hashed off position rather than random, so the
// city looks the same every time it is opened.

const MAP_W = 1440, MAP_H = 1000;

const MAP_C = {
    land:     '#15151d',
    block:    '#20202c', blockLit: '#262635', roof: '#2b2b3a', roofLit: '#333344',
    shadow:   '#0c0c12',
    road:     '#32323e', roadEdge: '#3f3f4d', kerb: '#4a4a58', lane: '#7a7a5e',
    bridge:   '#3c3c4a',
    leaf:     '#2f5f33', leafDk: '#20451f',
    danfo:    '#e8b31c', danfoDk: '#1b1b20',
    lamp:     '#55556a', lampLit: '#ffd98a',
    pin:      '#ccaa44', pinDim: '#6c6c82',
};

// Billboard faces — the one thing on a Lagos road you cannot miss.
const AD_COLOURS = ['#c0392b', '#1f7a4d', '#2874a6', '#c8912e', '#6a4d93', '#b03a6e'];

const MAP_ROADS = [
    { w: 46, pts: [[0, 300], [920, 300]] },
    { w: 56, pts: [[0, 500], [1440, 500]] },          // the main street
    { w: 46, pts: [[0, 730], [1440, 730]] },
    { w: 38, pts: [[0, 900], [1020, 900]] },
    { w: 44, pts: [[240, 0], [240, 1000]] },
    { w: 40, pts: [[560, 300], [560, 1000]] },
    { w: 44, pts: [[900, 200], [900, 1000]] },
    { w: 38, pts: [[1230, 500], [1230, 1000]] },
];

// [x, y, w, h] — each is subdivided into buildings when drawn.
const MAP_BLOCKS = [
    [30, 40, 180, 230], [280, 40, 240, 230], [600, 40, 260, 200],
    [30, 340, 180, 120], [280, 340, 240, 120], [600, 340, 260, 120],
    [950, 330, 240, 130], [1260, 330, 150, 130],
    [30, 540, 180, 155], [280, 540, 240, 155], [600, 540, 260, 155],
    [950, 540, 240, 155], [1270, 540, 140, 155],
    [30, 770, 180, 95], [280, 770, 240, 95], [600, 770, 260, 95],
    [950, 770, 240, 190], [1270, 770, 140, 190],
    [30, 940, 180, 50], [280, 940, 240, 50], [600, 940, 260, 50],
];

// Billboards: [x, y, facing] where facing is the angle of the board's face.
const MAP_ADS = [
    [150, 455, 0], [430, 455, 0], [760, 455, 0], [1090, 455, 0], [1340, 455, 0],
    [360, 553, 180], [700, 553, 180], [1080, 553, 180],
    [196, 180, 90], [196, 640, 90], [516, 840, 90],
    [620, 262, 0], [1010, 690, 0],
];

const MAP_ICONS = {
    home:  'M-8 2 L0 -7 L8 2 L8 8 L-8 8 Z',
    cup:   'M-6 -7 L6 -7 L5 0 Q0 5 -5 0 Z M-1 1 L1 1 L1 6 L-1 6 Z M-5 7 L5 7 L5 9 L-5 9 Z',
    chase: 'M-8 5 L-2 -6 L2 -6 L-3 2 L3 2 L0 9 L8 -2 L2 -2 L7 -9 L-1 -9 Z',
    run:   'M1 -8 a2.4 2.4 0 1 0 0.1 0 Z M-6 9 L-1 2 L-4 -2 L1 -4 L6 0 L4 2 L0 0 L3 4 L1 9 Z',
    film:  'M-8 -6 L8 -6 L8 6 L-8 6 Z M-6 -4 L-3 -4 L-3 -1 L-6 -1 Z M-6 1 L-3 1 L-3 4 L-6 4 Z M3 -4 L6 -4 L6 -1 L3 -1 Z M3 1 L6 1 L6 4 L3 4 Z',
    fist:  'M-6 -2 L-6 4 Q-6 8 -1 8 L3 8 Q7 8 7 4 L7 -3 Q7 -5 5 -5 Q3 -5 3 -3 L3 -5 Q3 -7 1 -7 Q-1 -7 -1 -5 L-1 -4 Q-1 -6 -3 -6 Q-5 -6 -5 -4 L-5 -2 Z',
    cart:  'M-8 -5 L-5 -5 L-3 3 L5 3 L7 -2 L-4 -2 M-2 7 a1.6 1.6 0 1 0 0.1 0 M4 7 a1.6 1.6 0 1 0 0.1 0',
};

/// Stable pseudo-random from a position, so the city never reshuffles.
function mrand(a, b) {
    const s = Math.sin(a * 127.1 + b * 311.7 + 7.13) * 43758.5453;
    return s - Math.floor(s);
}

const CityMap = {

    build() {
        const host = document.getElementById('map');
        if (!host || typeof VENUES === 'undefined') return;

        const s = [];
        s.push(`<svg id="map-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="City map">`);
        s.push(`<defs>
            <linearGradient id="mw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#1b4260"/><stop offset="1" stop-color="#102334"/>
            </linearGradient>
            <filter id="mglow" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="7" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>`);
        s.push(`<rect width="${MAP_W}" height="${MAP_H}" fill="${MAP_C.land}"/>`);

        this._water(s);
        this._roads(s);
        this._buildings(s);
        this._traffic(s);
        this._greenery(s);
        this._life(s);
        this._billboards(s);
        this._venues(s);

        s.push(`</svg>`);
        host.innerHTML = s.join('');

        host.querySelectorAll('.venue').forEach(g => {
            const id = g.getAttribute('data-venue');
            g.addEventListener('click', () => CityMap.pick(id));
            g.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); CityMap.pick(id); }
            });
        });
    },

    // ── Lagoon ────────────────────────────────────────────────────────────

    _water(s) {
        const shore = 'M900 0 L1440 0 L1440 300 L1180 300 Q1000 270 920 150 Z';
        s.push(`<path d="${shore}" fill="url(#mw)"/>`);
        s.push(`<path d="${shore}" fill="none" stroke="#2a5f82" stroke-width="3" opacity="0.7"/>`);
        for (let i = 0; i < 7; i++) {
            const y = 40 + i * 34, x = 1000 + (i % 3) * 36;
            s.push(`<path d="M${x} ${y} q 34 -10 68 0 t 68 0" fill="none" stroke="#39759b" stroke-width="3" opacity="0.45"/>`);
        }
        // A boat, so the water has something in it.
        s.push(`<g transform="translate(1320 96) rotate(-14)">
            <path d="M-26 0 Q0 13 26 0 L20 -7 L-20 -7 Z" fill="#6b4a28"/>
            <rect x="-2" y="-26" width="3" height="20" fill="#8a6336"/>
            <path d="M1 -26 L16 -8 L1 -8 Z" fill="#d8d3c4"/></g>`);
    },

    // ── Roads ─────────────────────────────────────────────────────────────

    _roads(s) {
        for (const r of MAP_ROADS) {
            const d = 'M' + r.pts.map(p => p.join(' ')).join(' L');
            s.push(`<path d="${d}" fill="none" stroke="${MAP_C.kerb}" stroke-width="${r.w + 10}" stroke-linecap="square"/>`);
            s.push(`<path d="${d}" fill="none" stroke="${MAP_C.roadEdge}" stroke-width="${r.w + 4}" stroke-linecap="square"/>`);
            s.push(`<path d="${d}" fill="none" stroke="${MAP_C.road}" stroke-width="${r.w}" stroke-linecap="square"/>`);
            s.push(`<path d="${d}" fill="none" stroke="${MAP_C.lane}" stroke-width="2.6" stroke-dasharray="26 30" opacity="0.5"/>`);
        }

        // The bridge over the lagoon, with its piers.
        s.push(`<path d="M860 200 L1440 200" stroke="${MAP_C.kerb}" stroke-width="58"/>`);
        s.push(`<path d="M860 200 L1440 200" stroke="${MAP_C.bridge}" stroke-width="48"/>`);
        s.push(`<path d="M860 200 L1440 200" stroke="${MAP_C.lane}" stroke-width="2.6" stroke-dasharray="26 30" opacity="0.6"/>`);
        for (let x = 900; x < 1440; x += 72) {
            s.push(`<rect x="${x}" y="172" width="7" height="56" fill="#272733"/>`);
        }
    },

    // ── Blocks, broken into buildings ─────────────────────────────────────

    /// Buildings stand up rather than lying flat. The camera looks north, so
    /// each one is extruded straight up the screen: the roof is the footprint
    /// moved up by its height and the gap left behind is the facade facing
    /// you. That one shift is what turns a floor plan into a skyline.
    ///
    /// Everything is collected before anything is drawn, because a tall
    /// building leans over whatever is behind it — so they have to go down
    /// far to near, or the back row covers the front one.
    _buildings(s) {
        const put = [];
        for (const [bx, by, bw, bh] of MAP_BLOCKS) {
            const cols = Math.max(1, Math.round(bw / 95));
            const rows = Math.max(1, Math.round(bh / 95));
            const cw = bw / cols, ch = bh / rows;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const n = mrand(bx + c * 37, by + r * 53);
                    const gap = 7 + n * 8;
                    const x = bx + c * cw + gap / 2, y = by + r * ch + gap / 2;
                    const w = cw - gap, h = ch - gap;
                    if (w < 16 || h < 16) continue;
                    put.push({ x, y, w, h, H: 16 + Math.round(n * 62), n });
                }
            }
        }
        put.sort((a, b) => (a.y + a.h) - (b.y + b.h));
        for (const b of put) this._tower(s, b);
    },

    _tower(s, { x, y, w, h, H, n }) {
        const f = v => v.toFixed(1);
        const roofY = y - H;                       // footprint lifted by its height
        const wallY = y + h - H;                   // where the facade starts
        const lit   = n > 0.5;

        // Thrown on the ground behind, away from the one light in the sky.
        s.push(`<rect x="${f(x + 7)}" y="${f(y + 6)}" width="${f(w)}" height="${f(h)}" rx="2" fill="${MAP_C.shadow}" opacity="0.6"/>`);

        // Facade, darkening toward the street.
        s.push(`<rect x="${f(x)}" y="${f(wallY)}" width="${f(w)}" height="${f(H)}" fill="${lit ? '#23232f' : '#1d1d27'}"/>`);
        s.push(`<rect x="${f(x)}" y="${f(wallY + H * 0.62)}" width="${f(w)}" height="${f(H * 0.38)}" fill="#000" opacity="0.22"/>`);

        // Windows down the facade — a few lit, so the city is awake.
        const cols = Math.max(1, Math.floor((w - 8) / 13));
        const rows = Math.max(1, Math.floor((H - 8) / 13));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const wx = x + 5 + c * 13, wy = wallY + 5 + r * 13;
                const k = mrand(wx * 3, wy * 5);
                s.push(`<rect x="${f(wx)}" y="${f(wy)}" width="6" height="7" fill="${k > 0.74 ? '#ffcc55' : '#333349'}" opacity="${k > 0.74 ? 0.72 : 0.9}"/>`);
            }
        }

        // Roof, with a parapet lip so the top edge catches the light.
        s.push(`<rect x="${f(x)}" y="${f(roofY)}" width="${f(w)}" height="${f(h)}" rx="2" fill="${lit ? MAP_C.roofLit : MAP_C.roof}"/>`);
        s.push(`<rect x="${f(x)}" y="${f(roofY)}" width="${f(w)}" height="3" fill="#4a4a60" opacity="0.8"/>`);

        const k = mrand(x, y);
        if (w > 46 && h > 32) {
            s.push(`<circle cx="${f(x + w - 15)}" cy="${f(roofY + 15)}" r="6" fill="#4a4a5c"/>`);
            s.push(`<rect x="${f(x + 10)}" y="${f(roofY + h - 18)}" width="${f(12 + k * 14)}" height="8" fill="#3c3c4c"/>`);
        }
        if (k > 0.72 && H > 46) {   // a mast on the taller ones
            s.push(`<rect x="${f(x + w / 2 - 1.5)}" y="${f(roofY - 16)}" width="3" height="16" fill="#4a4a5c"/>`);
            s.push(`<circle cx="${f(x + w / 2)}" cy="${f(roofY - 17)}" r="2.6" fill="#ff5a5a" opacity="0.85"/>`);
        }
    },

    // ── Traffic ───────────────────────────────────────────────────────────

    _traffic(s) {
        const bus = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})">
            <rect x="-17" y="-9" width="34" height="18" rx="3" fill="${MAP_C.danfoDk}" opacity="0.8" transform="translate(2 3)"/>
            <rect x="-17" y="-9" width="34" height="18" rx="3" fill="${MAP_C.danfo}"/>
            <rect x="-17" y="-2" width="34" height="4" fill="${MAP_C.danfoDk}"/>
            <rect x="11" y="-7" width="5" height="14" rx="1" fill="#2b3a44"/></g>`;
        const car = (x, y, rot, col) => `<g transform="translate(${x} ${y}) rotate(${rot})">
            <rect x="-12" y="-6" width="24" height="12" rx="3" fill="#000" opacity="0.5" transform="translate(2 3)"/>
            <rect x="-12" y="-6" width="24" height="12" rx="3" fill="${col}"/>
            <rect x="-4" y="-4" width="9" height="8" rx="1" fill="#2b3a44"/></g>`;

        const traffic = [
            [120, 486, 0, 'bus'], [470, 514, 180, 'car'], [800, 486, 0, 'bus'],
            [1120, 514, 180, 'car'], [1330, 486, 0, 'bus'],
            [330, 288, 0, 'car'], [700, 312, 180, 'bus'],
            [160, 718, 0, 'car'], [640, 742, 180, 'car'], [1100, 718, 0, 'bus'],
            [226, 170, 90, 'car'], [226, 620, 90, 'bus'], [254, 860, 270, 'car'],
            [546, 420, 90, 'car'], [574, 820, 270, 'bus'],
            [886, 380, 90, 'bus'], [914, 820, 270, 'car'],
            [1010, 200, 0, 'bus'], [1250, 200, 0, 'car'],
        ];
        const cols = ['#b9412f', '#2e6fa8', '#d8d3c4', '#3f8f5a'];
        traffic.forEach(([x, y, rot, kind], i) => {
            s.push(kind === 'bus' ? bus(x, y, rot) : car(x, y, rot, cols[i % cols.length]));
        });

        // Some of it moves. Parked traffic makes a map; traffic going
        // somewhere makes a city, and the lanes already say which way.
        const run = [
            ['e', 486, 0,   'bus', 0],   ['e', 486, 0,  'car', -9],
            ['w', 514, 180, 'car', -4],  ['w', 514, 180, 'bus', -15],
            ['e', 288, 0,   'car', -7],  ['w', 312, 180, 'bus', -18],
            ['e', 718, 0,   'bus', -11], ['w', 742, 180, 'car', -2],
            ['e', 200, 0,   'bus', -6],
        ];
        // The lane goes on the outer group and the motion on the inner one:
        // a CSS transform replaces the SVG transform attribute outright, so
        // sharing one element would animate the vehicle out of its lane.
        run.forEach(([dir, y, rot, kind, delay], i) => {
            const body = kind === 'bus' ? bus(0, 0, rot) : car(0, 0, rot, cols[i % cols.length]);
            s.push(`<g transform="translate(0 ${y})">` +
                   `<g class="drive drive-${dir}" style="animation-delay:${delay}s">${body}</g></g>`);
        });
    },

    // ── Trees and lamps ───────────────────────────────────────────────────

    _greenery(s) {
        const palm = (x, y, r) => {
            let g = `<g transform="translate(${x} ${y})">`;
            g += `<circle cx="3" cy="4" r="${r}" fill="#000" opacity="0.45"/>`;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + 0.4;
                g += `<ellipse cx="${(Math.cos(a) * r * 0.55).toFixed(1)}" cy="${(Math.sin(a) * r * 0.55).toFixed(1)}" rx="${(r * 0.62).toFixed(1)}" ry="${(r * 0.34).toFixed(1)}" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${(Math.cos(a) * r * 0.55).toFixed(1)} ${(Math.sin(a) * r * 0.55).toFixed(1)})" fill="${i % 2 ? MAP_C.leafDk : MAP_C.leaf}"/>`;
            }
            g += `<circle cx="0" cy="0" r="${(r * 0.26).toFixed(1)}" fill="#5b4023"/></g>`;
            return g;
        };
        const spots = [[62, 478], [62, 528], [1400, 478], [1400, 528],
                       [222, 348], [222, 952], [540, 268], [878, 268],
                       [932, 952], [1252, 468], [1252, 952], [600, 478]];
        for (const [x, y] of spots) s.push(palm(x, y, 15 + mrand(x, y) * 7));

        // Street lamps down the main street.
        for (let x = 110; x < 1440; x += 150) {
            s.push(`<g transform="translate(${x} 470)"><rect x="-2" y="-12" width="4" height="12" fill="${MAP_C.lamp}"/>` +
                   `<circle cx="0" cy="-14" r="5" fill="${MAP_C.lampLit}" opacity="0.75"/>` +
                   `<circle cx="0" cy="-14" r="12" fill="${MAP_C.lampLit}" opacity="0.10"/></g>`);
        }
    },

    // ── Street life ───────────────────────────────────────────────────────
    // Stalls and people. A city is busiest where it sells things, so the
    // market gets the crowd and the club gets a queue.

    _life(s) {
        const UMB = ['#c0392b', '#2874a6', '#1f7a4d', '#c8912e', '#b03a6e'];
        const stall = (x, y, i) => `<g transform="translate(${x} ${y})">
            <ellipse cx="3" cy="5" rx="15" ry="9" fill="#000" opacity="0.45"/>
            <circle cx="0" cy="0" r="14" fill="${UMB[i % UMB.length]}"/>
            <circle cx="0" cy="0" r="14" fill="none" stroke="#0e0e14" stroke-width="1.5"/>
            <circle cx="0" cy="0" r="3" fill="#0e0e14"/></g>`;

        // Balogun market spilling onto the pavement.
        const stalls = [[54, 762], [92, 758], [130, 762], [168, 758],
                        [54, 876], [92, 880], [130, 876], [168, 880],
                        [228, 790], [228, 846]];
        stalls.forEach(([x, y], i) => s.push(stall(x, y, i)));

        // People, as the smallest mark that still reads as a person.
        const person = (x, y, c) => `<g transform="translate(${x} ${y})">
            <ellipse cx="1.5" cy="3" rx="4" ry="2.4" fill="#000" opacity="0.45"/>
            <circle cx="0" cy="0" r="3.4" fill="${c}"/>
            <circle cx="0" cy="-3.6" r="2.4" fill="#8a5a33"/></g>`;
        const SKIN = ['#e8e3d6', '#c0392b', '#2874a6', '#f2d021', '#3f8f5a', '#b03a6e'];
        const crowds = [
            [120, 817, 46, 14],   // the market
            [730, 817, 40, 12],   // outside the club
            [400, 615, 34, 8],    // Oshodi street corner
            [1070, 615, 30, 7],   // the cinema
        ];
        crowds.forEach(([cx, cy, r, n]) => {
            for (let i = 0; i < n; i++) {
                const a = mrand(cx + i, cy) * Math.PI * 2;
                const d = 56 + mrand(cy, cx + i) * r;
                s.push(person((cx + Math.cos(a) * d).toFixed(1),
                              (cy + Math.sin(a) * d * 0.62).toFixed(1),
                              SKIN[i % SKIN.length]));
            }
        });
    },

    // ── Billboards ────────────────────────────────────────────────────────
    // Standing off the kerb and angled to the traffic, big enough to read as
    // the thing you see first on a Lagos road.

    _billboards(s) {
        MAP_ADS.forEach(([x, y, facing], i) => {
            const col = AD_COLOURS[i % AD_COLOURS.length];
            const w = 56, h = 26;
            s.push(`<g class="ad" transform="translate(${x} ${y}) rotate(${facing})">`);
            s.push(`<rect x="${-w / 2 + 3}" y="${-h / 2 + 5}" width="${w}" height="${h}" rx="2" fill="#000" opacity="0.55"/>`);
            s.push(`<rect x="${-w / 2 - 2}" y="${-h / 2 - 2}" width="${w + 4}" height="${h + 4}" rx="3" fill="#15151d"/>`);
            s.push(`<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="2" fill="${col}"/>`);
            // A headline bar and two lines of copy, suggested not spelled.
            s.push(`<rect x="${-w / 2 + 5}" y="${-h / 2 + 4}" width="${w - 10}" height="7" rx="1.5" fill="#ffffff" opacity="0.88"/>`);
            s.push(`<rect x="${-w / 2 + 5}" y="${-h / 2 + 14}" width="${w - 22}" height="4" rx="1.5" fill="#ffffff" opacity="0.5"/>`);
            s.push(`<rect x="${-w / 2 + 5}" y="${-h / 2 + 20}" width="${w - 30}" height="3" rx="1.5" fill="#ffffff" opacity="0.35"/>`);
            s.push(`<rect x="${-w / 2 + 6}" y="${h / 2}" width="4" height="9" fill="#2a2a36"/>`);
            s.push(`<rect x="${w / 2 - 10}" y="${h / 2}" width="4" height="9" fill="#2a2a36"/>`);
            s.push(`</g>`);
        });
    },

    // ── Venues ────────────────────────────────────────────────────────────

    _venues(s) {
        for (const v of VENUES) {
            const play = v.kind === 'play';
            const col  = play ? MAP_C.pin : MAP_C.pinDim;

            s.push(`<g class="venue${play ? ' venue-play' : ''}" data-venue="${v.id}" tabindex="0" role="button" aria-label="${v.name}">`);
            s.push(`<rect class="v-hit" x="${v.x - 70}" y="${v.y - 120}" width="140" height="190" fill="transparent"/>`);

            // The landmark stands up like everything else, so a venue is a
            // building in the city rather than a sticker over one. It is the
            // tallest thing on its block, which is how you find it.
            // A toll gate on a bridge is not a tower; anything that tall there also
            // runs off the top of the screen.
            const BW = 108, BH = 62, VH = v.vh || 72;
            const x0 = v.x - BW / 2, y0 = v.y - BH / 2;
            const roofY = y0 - VH, wallY = y0 + BH - VH;

            s.push(`<rect x="${x0 + 8}" y="${y0 + 7}" width="${BW}" height="${BH}" rx="4" fill="#000" opacity="0.6"/>`);
            s.push(`<rect x="${x0}" y="${wallY}" width="${BW}" height="${VH}" fill="#2b2b3b"/>`);
            s.push(`<rect x="${x0}" y="${wallY}" width="${BW}" height="${VH}" fill="none" stroke="${col}" stroke-width="1.5" opacity="${play ? 0.55 : 0.28}"/>`);
            s.push(`<rect x="${x0}" y="${wallY + VH * 0.6}" width="${BW}" height="${VH * 0.4}" fill="#000" opacity="0.22"/>`);
            // A lit sign band across the front, in the venue's own colour.
            s.push(`<rect x="${x0 + 7}" y="${wallY + 12}" width="${BW - 14}" height="15" rx="2" fill="${col}" opacity="${play ? 0.92 : 0.5}"/>`);
            for (let c = 0; c < 7; c++) {
                s.push(`<rect x="${x0 + 9 + c * 14}" y="${wallY + 40}" width="8" height="9" fill="${c % 3 === 1 ? '#ffcc55' : '#333349'}" opacity="0.8"/>`);
            }
            s.push(`<rect x="${x0}" y="${roofY}" width="${BW}" height="${BH}" rx="4" fill="#3a3a4e" stroke="${col}" stroke-width="3"/>`);
            s.push(`<rect x="${x0}" y="${roofY}" width="${BW}" height="3" fill="#4a4a60" opacity="0.8"/>`);

            const cy = roofY + BH / 2;
            if (play) s.push(`<circle class="v-halo" cx="${v.x}" cy="${cy}" r="33" fill="none" stroke="${col}" stroke-width="2" opacity="0.35"/>`);
            s.push(`<circle class="v-disc" cx="${v.x}" cy="${cy}" r="24" fill="#0c0c14" stroke="${col}" stroke-width="3"${play ? ' filter="url(#mglow)"' : ''}/>`);
            s.push(`<g class="v-icon" transform="translate(${v.x} ${cy}) scale(1.35)" fill="${col}" fill-rule="evenodd" stroke="${col}" stroke-width="0.6" stroke-linejoin="round">`);
            s.push(`<path d="${MAP_ICONS[v.icon] || MAP_ICONS.home}"/></g>`);

            s.push(`<text class="v-name" x="${v.x}" y="${y0 + BH + 24}" text-anchor="middle">${v.name}</text>`);
            if (v.tag) s.push(`<text class="v-tag" x="${v.x}" y="${y0 + BH + 42}" text-anchor="middle">${v.tag}</text>`);
            s.push(`</g>`);
        }
    },

    /// Going somewhere either opens a panel or starts a run there.
    pick(id) {
        const v = getVenue(id);
        if (!v) return;
        if (typeof _playUiSound === 'function') _playUiSound('single-click.mp3');

        if (v.kind === 'open') { openModal(v.modal); return; }

        try { localStorage.setItem('runningboy_venue', v.id); } catch (_) {}

        // One eligible character is not a choice, so do not stage one.
        const who = venueCharacters(v.id);
        if (who.length === 1) { selectCharacter(who[0]); startGame(); return; }

        // Arriving from somewhere that took a character this place will not
        // leaves the saved one invalid, so settle it before the picker opens
        // rather than letting a stale name sit there marked as selected.
        if (who.indexOf(getCharacter()) < 0) selectCharacter(who[0]);

        // Name the place in the chooser, so the step reads as part of going
        // there rather than as a menu that appeared.
        const hint = document.getElementById('char-hint');
        if (hint) hint.textContent = v.name + ' — ' + v.blurb;
        openModal('char-modal');
    },

    /// The city is bigger than the window, so open on the middle of it
    /// rather than the top-left corner.
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

    // On a phone the leaderboard is folded to its header; its header opens it.
    const lb = document.getElementById('global-lb');
    const hd = document.getElementById('global-lb-header');
    if (lb && hd) {
        hd.addEventListener('click', e => {
            if (e.target.closest('.lb-refresh-btn')) return;
            lb.classList.toggle('open');
        });
    }
});
