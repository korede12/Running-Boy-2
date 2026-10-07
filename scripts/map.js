// ── City map ──────────────────────────────────────────────────────────────
// The home screen. A district seen from above: lagoon, bridge, roads, blocks,
// and a pin for every venue. Built as SVG from the venue data rather than
// written out by hand, so a pin cannot drift from the place it names.

const MAP_W = 900, MAP_H = 600;

const MAP_C = {
    water:   '#132b3e', waterEdge: '#1b3b52',
    land:    '#171720', block: '#1f1f2b', blockAlt: '#242433',
    road:    '#33333f', roadEdge: '#3d3d4b', lane: '#6a6a52',
    bridge:  '#3a3a46',
    pin:     '#ccaa44', pinDim: '#5a5a6e',
};

// Roads as polylines through the district; the bridge is the one that
// crosses the water, and the venue on it is the chase.
const MAP_ROADS = [
    { w: 26, pts: [[0, 250], [900, 250]] },                      // main east-west
    { w: 22, pts: [[0, 400], [760, 400]] },
    { w: 20, pts: [[120, 0], [120, 600]] },
    { w: 20, pts: [[340, 60], [340, 600]] },
    { w: 18, pts: [[560, 132], [560, 600]] },

    { w: 16, pts: [[0, 520], [620, 520]] },
    { w: 14, pts: [[340, 320], [720, 320]] },
];

const MAP_BLOCKS = [
    [20, 40, 86, 190], [140, 40, 180, 190], [360, 60, 180, 170],
    [580, 200, 0, 0],
    [20, 270, 86, 110], [140, 270, 180, 110], [360, 270, 180, 30],
    [360, 340, 180, 46], [580, 200, 150, 100], [750, 200, 130, 100],
    [580, 340, 150, 46], [750, 340, 130, 46],
    [20, 420, 86, 86], [140, 420, 180, 86], [360, 420, 180, 86],
    [580, 420, 300, 86], [20, 540, 580, 50],
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

const CityMap = {

    build() {
        const host = document.getElementById('map');
        if (!host || typeof VENUES === 'undefined') return;

        const s = [];
        s.push(`<svg id="map-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="City map">`);
        s.push(`<defs>
            <linearGradient id="mw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#17374f"/><stop offset="1" stop-color="#101f2e"/>
            </linearGradient>
            <filter id="mglow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>`);

        s.push(`<rect width="${MAP_W}" height="${MAP_H}" fill="${MAP_C.land}"/>`);

        // The lagoon, top right, with the bridge reaching across it.
        s.push(`<path d="M560 0 L900 0 L900 170 L720 170 Q640 150 600 90 Z" fill="url(#mw)"/>`);
        s.push(`<path d="M560 0 L900 0 L900 170 L720 170 Q640 150 600 90 Z" fill="none" stroke="${MAP_C.waterEdge}" stroke-width="2"/>`);
        for (let i = 0; i < 5; i++) {
            const y = 26 + i * 28;
            s.push(`<path d="M${640 + i * 14} ${y} q 22 -7 44 0 t 44 0" fill="none" stroke="#2a5570" stroke-width="2" opacity="0.5"/>`);
        }

        // Blocks first, then roads over them, so the roads read as cut through.
        MAP_BLOCKS.forEach(([x, y, w, h], i) => {
            s.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${i % 2 ? MAP_C.block : MAP_C.blockAlt}"/>`);
        });

        for (const r of MAP_ROADS) {
            const d = 'M' + r.pts.map(p => p.join(' ')).join(' L');
            s.push(`<path d="${d}" fill="none" stroke="${MAP_C.roadEdge}" stroke-width="${r.w + 4}" stroke-linecap="round"/>`);
            s.push(`<path d="${d}" fill="none" stroke="${MAP_C.road}" stroke-width="${r.w}" stroke-linecap="round"/>`);
            s.push(`<path d="${d}" fill="none" stroke="${MAP_C.lane}" stroke-width="1.6" stroke-dasharray="12 16" opacity="0.5"/>`);
        }

        // The bridge, drawn after the water so it sits on top of it.
        s.push(`<path d="M560 132 L900 132" stroke="${MAP_C.bridge}" stroke-width="22" stroke-linecap="butt"/>`);
        s.push(`<path d="M560 132 L900 132" stroke="${MAP_C.lane}" stroke-width="1.6" stroke-dasharray="12 16" opacity="0.6"/>`);
        for (let x = 600; x < 900; x += 46) {
            s.push(`<rect x="${x}" y="120" width="3" height="24" fill="#2a2a34"/>`);
        }

        // ── Pins ─────────────────────────────────────────────────────────
        for (const v of VENUES) {
            const play = v.kind === 'play';
            const col  = play ? MAP_C.pin : MAP_C.pinDim;
            s.push(`<g class="venue${play ? ' venue-play' : ''}" data-venue="${v.id}" tabindex="0" role="button" aria-label="${v.name}">`);
            s.push(`<circle class="v-hit" cx="${v.x}" cy="${v.y}" r="34" fill="transparent"/>`);
            if (play) s.push(`<circle class="v-halo" cx="${v.x}" cy="${v.y}" r="22" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.35"/>`);
            s.push(`<circle class="v-disc" cx="${v.x}" cy="${v.y}" r="17" fill="#0c0c14" stroke="${col}" stroke-width="2"${play ? ' filter="url(#mglow)"' : ''}/>`);
            s.push(`<g class="v-icon" transform="translate(${v.x} ${v.y}) scale(0.92)" fill="${col}" fill-rule="evenodd" stroke="${col}" stroke-width="0.6" stroke-linejoin="round">`);
            s.push(`<path d="${MAP_ICONS[v.icon] || MAP_ICONS.home}"/></g>`);
            s.push(`<text class="v-name" x="${v.x}" y="${v.y + 34}" text-anchor="middle">${v.name}</text>`);
            if (v.tag) s.push(`<text class="v-tag" x="${v.x}" y="${v.y + 46}" text-anchor="middle">${v.tag}</text>`);
            s.push(`</g>`);
        }

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
};

document.addEventListener('DOMContentLoaded', () => CityMap.build());
