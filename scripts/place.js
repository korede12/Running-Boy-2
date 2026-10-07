// ── Inside a place ────────────────────────────────────────────────────────
// Tap the picture on Home and you are standing in it: a room you can walk
// around, with things in it, a counter to walk up to and a door out.
//
// It is the same isometric projection the city map uses, so going inside
// reads as zooming in rather than as changing games. Depth is the painter's
// algorithm — everything sorted by gx+gy and laid down back to front — and
// the player carries a fractional depth so they pass in front of a stall on
// one side of it and behind it on the other.
//
// Movement is tap-to-walk, because this has to work with a thumb. Arrow keys
// and WASD do the same job on a desktop. Walls and the footprints of the
// furniture are a set of blocked tiles; you stop at them rather than sliding
// along, which is enough in a room this size.

const Place = {

    TW: 54, TH: 27,          // tile width and height on screen
    W: 660, H: 430,          // the drawing surface
    SPEED: 3.4,              // tiles a second

    _raf: null,
    _open: false,
    _me: null,               // { gx, gy }
    _to: null,               // where the tap said to go
    _keys: {},
    _blocked: null,
    _spots: [],
    _venue: null,
    _last: 0,

    // ── Opening and closing ───────────────────────────────────────────────

    enter(venueId) {
        const v = getVenue(venueId);
        if (!v || !Player.exists()) return;
        this._venue = v;
        const plan = this.plan(v);
        this._plan = plan;

        this._blocked = new Set(plan.props.flatMap(p =>
            this._tiles(p).map(t => t[0] + ',' + t[1])));
        this._spots = plan.spots;
        this._me = { gx: plan.start[0], gy: plan.start[1] };
        this._to = null;

        const host = document.getElementById('place');
        if (!host) return;
        host.innerHTML = this._chrome(v, plan);
        host.classList.add('on');
        document.body.classList.add('in-place');
        this._open = true;

        this._paint();
        this._bind();
        this._last = performance.now();
        this._raf = requestAnimationFrame(t => this._tick(t));
    },

    leave() {
        if (!this._open) return;
        this._open = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        const host = document.getElementById('place');
        if (host) { host.classList.remove('on'); host.innerHTML = ''; }
        document.body.classList.remove('in-place');
        this._keys = {};
        if (typeof refreshLifeHud === 'function') refreshLifeHud();
    },

    // ── Geometry ──────────────────────────────────────────────────────────

    _iso(gx, gy, gz) {
        return [this.W / 2 + (gx - gy) * this.TW / 2,
                120 + (gx + gy) * this.TH / 2 - (gz || 0)];
    },

    /// Screen point back to a tile, which is what a tap gives you.
    _unIso(sx, sy) {
        const x = sx - this.W / 2, y = sy - 120;
        return [Math.floor((y / this.TH + x / this.TW)),
                Math.floor((y / this.TH - x / this.TW))];
    },

    _tiles(p) {
        const out = [];
        for (let x = p.gx; x < p.gx + (p.w || 1); x++)
            for (let y = p.gy; y < p.gy + (p.d || 1); y++) out.push([x, y]);
        return out;
    },

    _walkable(gx, gy) {
        const pl = this._plan;
        if (gx < 0 || gy < 0 || gx >= pl.cols || gy >= pl.rows) return false;
        return !this._blocked.has(Math.floor(gx) + ',' + Math.floor(gy));
    },

    // ── Drawing ───────────────────────────────────────────────────────────

    _chrome(v, plan) {
        return `<div class="pl-top">` +
                `<span class="pl-name">${v.name}</span>` +
                `<button class="pl-out" onclick="Place.leave()">&#10005; Leave</button>` +
            `</div>` +
            `<div class="pl-stage" id="pl-stage"></div>` +
            `<div class="pl-act" id="pl-act"></div>` +
            `<div class="pl-hint">Tap the floor to walk. Stand close to something to use it.</div>`;
    },

    _paint() {
        const stage = document.getElementById('pl-stage');
        if (!stage) return;
        const pl = this._plan, s = [];
        s.push(`<svg id="pl-svg" viewBox="0 0 ${this.W} ${this.H}" ` +
               `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${this._venue.name}">`);

        // Floor.
        for (let gx = 0; gx < pl.cols; gx++)
            for (let gy = 0; gy < pl.rows; gy++) {
                const a = this._iso(gx, gy), b = this._iso(gx + 1, gy);
                const c = this._iso(gx + 1, gy + 1), d = this._iso(gx, gy + 1);
                const alt = (gx + gy) % 2;
                s.push(`<polygon points="${a} ${b} ${c} ${d}" fill="${alt ? pl.floorA : pl.floorB}" ` +
                       `stroke="${pl.floorLine}" stroke-width="0.6"/>`);
            }

        // Back walls, which give the room its corner.
        s.push(this._wall(pl, 'x'));
        s.push(this._wall(pl, 'y'));

        // Everything that stands up, sorted back to front. The player goes in
        // later, slotted by depth, so this list keeps its own order.
        const items = pl.props.map(p => ({
            d: p.gx + p.gy + (p.w || 1) * 0.5 + (p.d || 1) * 0.5,
            svg: `<g class="pl-prop" data-d="${(p.gx + p.gy + 0.5).toFixed(2)}">` +
                 this._prop(p, pl) + `</g>`,
        })).sort((a, b) => a.d - b.d);
        s.push(`<g id="pl-items">${items.map(i => i.svg).join('')}</g>`);
        s.push(`</svg>`);
        stage.innerHTML = s.join('');

        // The player is a separate node so moving them is one transform.
        const svg = document.getElementById('pl-svg');
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('id', 'pl-me');
        g.innerHTML = this._figure();
        document.getElementById('pl-items').appendChild(g);
        this._place();
    },

    _wall(pl, axis) {
        const H = 76, out = [];
        const n = axis === 'x' ? pl.cols : pl.rows;
        for (let i = 0; i < n; i++) {
            const a = axis === 'x' ? this._iso(i, 0) : this._iso(0, i);
            const b = axis === 'x' ? this._iso(i + 1, 0) : this._iso(0, i + 1);
            out.push(`<polygon points="${a} ${b} ${[b[0], b[1] - H]} ${[a[0], a[1] - H]}" ` +
                     `fill="${axis === 'x' ? pl.wallA : pl.wallB}"/>`);
        }
        return out.join('');
    },

    /// One piece of furniture: a box with a lid, plus whatever marks it out.
    _prop(p, pl) {
        const h = p.h || 30, w = p.w || 1, d = p.d || 1;
        const A = this._iso(p.gx, p.gy, h),         B = this._iso(p.gx + w, p.gy, h);
        const C = this._iso(p.gx + w, p.gy + d, h), D = this._iso(p.gx, p.gy + d, h);
        const B0 = this._iso(p.gx + w, p.gy, 0),    C0 = this._iso(p.gx + w, p.gy + d, 0);
        const D0 = this._iso(p.gx, p.gy + d, 0);
        let g = `<polygon points="${D} ${C} ${C0} ${D0}" fill="${p.side || '#2f2f3b'}"/>` +
                `<polygon points="${B} ${C} ${C0} ${B0}" fill="${p.side2 || '#3a3a48'}"/>` +
                `<polygon points="${A} ${B} ${C} ${D}" fill="${p.top || '#4a4a58'}"/>`;
        if (p.glow) {
            const m = this._iso(p.gx + w / 2, p.gy + d / 2, h + 10);
            g += `<ellipse cx="${m[0].toFixed(1)}" cy="${m[1].toFixed(1)}" rx="${18 * w}" ry="${9 * d}" ` +
                 `fill="${p.glow}" opacity="0.3"/>`;
        }
        if (p.label) {
            const m = this._iso(p.gx + w / 2, p.gy + d / 2, h + 26);
            g += `<text class="pl-lab" x="${m[0].toFixed(1)}" y="${m[1].toFixed(1)}" ` +
                 `text-anchor="middle">${p.label}</text>`;
        }
        return g;
    },

    _figure() {
        const sk = '#9a6440';
        return `<ellipse cx="0" cy="2" rx="13" ry="6" fill="#000" opacity="0.32"/>` +
            `<rect x="-8" y="-34" width="16" height="23" rx="6" fill="#4cd964"/>` +
            `<circle cx="0" cy="-41" r="7.6" fill="${sk}"/>` +
            `<path d="M-7.6 -46 q7.6 -6.4 15.2 0 q-7.6 -2.6 -15.2 0 Z" fill="#17171f"/>` +
            `<rect x="-6.5" y="-11" width="6" height="12" rx="2.4" fill="#24301f"/>` +
            `<rect x="0.5" y="-11" width="6" height="12" rx="2.4" fill="#24301f"/>`;
    },

    /// Put the player where they are, and at the right depth among the props.
    _place() {
        const me = document.getElementById('pl-me');
        if (!me || !this._me) return;
        const [x, y] = this._iso(this._me.gx + 0.5, this._me.gy + 0.5, 0);
        me.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);

        // Re-slot by depth: the one thing that makes it read as a space.
        const mine = this._me.gx + this._me.gy + 1;
        const host = document.getElementById('pl-items');
        if (!host) return;
        let before = null;
        for (const node of host.querySelectorAll('.pl-prop')) {
            if (parseFloat(node.dataset.d) > mine) { before = node; break; }
        }
        if (before) host.insertBefore(me, before);
        else host.appendChild(me);
    },

    // ── Walking ───────────────────────────────────────────────────────────

    _bind() {
        const stage = document.getElementById('pl-stage');
        if (stage) stage.onclick = e => {
            const svg = document.getElementById('pl-svg');
            if (!svg) return;
            const r = svg.getBoundingClientRect();
            const sx = (e.clientX - r.left) / r.width * this.W;
            const sy = (e.clientY - r.top) / r.height * this.H;
            const [gx, gy] = this._unIso(sx, sy);
            if (this._walkable(gx, gy)) this._to = { gx, gy };
        };
        document.onkeydown = e => {
            if (!this._open) return;
            if (e.key === 'Escape') { this.leave(); return; }
            this._keys[e.key.toLowerCase()] = true;
        };
        document.onkeyup = e => { this._keys[e.key.toLowerCase()] = false; };
    },

    _tick(now) {
        if (!this._open) return;
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;

        let dx = 0, dy = 0;
        const k = this._keys;
        if (k.arrowup    || k.w) { dx -= 1; dy -= 1; }
        if (k.arrowdown  || k.s) { dx += 1; dy += 1; }
        if (k.arrowleft  || k.a) { dx -= 1; dy += 1; }
        if (k.arrowright || k.d) { dx += 1; dy -= 1; }

        if (dx || dy) this._to = null;
        else if (this._to) {
            dx = this._to.gx - this._me.gx;
            dy = this._to.gy - this._me.gy;
            if (Math.hypot(dx, dy) < 0.12) { this._to = null; dx = dy = 0; }
        }

        if (dx || dy) {
            const len = Math.hypot(dx, dy) || 1;
            const step = this.SPEED * dt;
            const nx = this._me.gx + dx / len * step;
            const ny = this._me.gy + dy / len * step;
            // Axis at a time, so a corner does not stop you dead.
            if (this._walkable(nx, this._me.gy)) this._me.gx = nx;
            if (this._walkable(this._me.gx, ny)) this._me.gy = ny;
            this._place();
            this._near();
        }
        this._raf = requestAnimationFrame(t => this._tick(t));
    },

    /// What you are standing next to, and the button for it.
    _near() {
        const act = document.getElementById('pl-act');
        if (!act) return;
        let found = null;
        for (const s of this._spots) {
            const d = Math.hypot(s.gx + 0.5 - this._me.gx, s.gy + 0.5 - this._me.gy);
            if (d < 1.5) { found = s; break; }
        }
        if (!found) { act.innerHTML = ''; act.classList.remove('on'); return; }
        if (act.dataset.id === found.id) return;
        act.dataset.id = found.id;
        act.innerHTML = `<button onclick="Place.use('${found.id}')">${found.label}</button>`;
        act.classList.add('on');
    },

    /// Doing the thing. Everything here already exists as a panel — walking
    /// up to the counter is just a nicer way to open it.
    use(id) {
        const spot = this._spots.find(s => s.id === id);
        if (!spot) return;
        if (spot.id === 'door') { this.doorway(); return; }
        this.leave();
        const v = this._venue;
        if (typeof CityMap !== 'undefined') CityMap.pick(v.id);
    },

    /// The door is a way to somewhere, not only a way out. It lists the rest
    /// of the city by how far it is, and going to one of them runs the
    /// ordinary fare-and-hours trip and then puts you inside it.
    doorway() {
        const p = Player.get();
        const here = this._venue;
        const city = getCity(p.city);
        const rest = city.venues
            .filter(v => v.id !== here.id)
            .map(v => ({ v, d: Player.distanceTo(v.id) }))
            .sort((a, b) => a.d - b.d);

        const act = document.getElementById('pl-act');
        const stage = document.getElementById('pl-stage');
        if (!act || !stage) return;
        act.innerHTML = '';
        act.classList.remove('on');
        act.dataset.id = '';

        stage.innerHTML =
            '<div class="pl-where">' +
                '<div class="pl-where-top">Where are you going?</div>' +
                rest.map(({ v, d }) => {
                    const cheapest = Player.ridesTo(v.id)
                        .filter(r => r.fare > 0).sort((a, b) => a.fare - b.fare)[0];
                    return `<button class="pl-dest" onclick="Place.goTo('${v.id}')">` +
                        `<b>${v.name}</b>` +
                        `<span>${d} tiles` +
                        (cheapest ? ` &nbsp;·&nbsp; from &#10022; ${cheapest.fare}` : '') +
                        `</span></button>`;
                }).join('') +
                '<button class="pl-dest back" onclick="Place.enter(\'' + here.id + '\')">' +
                    '<b>Nowhere — stay here</b><span>Go back inside</span></button>' +
            '</div>';
    },

    /// Go somewhere else and arrive inside it.
    goTo(venueId) {
        this.leave();
        this._reenter = venueId;
        if (typeof openRide === 'function') openRide(getVenue(venueId));
    },

    // ── What each place looks like inside ─────────────────────────────────

    plan(v) {
        const base = {
            cols: 9, rows: 7, start: [4, 5],
            floorA: '#2a2a35', floorB: '#262630', floorLine: '#1e1e27',
            wallA: '#20202a', wallB: '#1a1a23',
            props: [], spots: [],
        };
        const door = { id: 'door', gx: 4, gy: 6, label: 'Go outside' };

        const kind = v.id === 'market' || v.id === 'itoku' ? 'market'
                   : v.mode === 'chase' ? 'span'
                   : v.kind === 'play' && v.mode === 'fight' ? 'club'
                   : v.kind;

        const sets = {
            market: () => ({
                floorA: '#3a3024', floorB: '#352c21', floorLine: '#2a2219',
                wallA: '#2b2419', wallB: '#241e15',
                props: [
                    { gx: 1, gy: 1, w: 2, d: 1, h: 26, top: '#8a5a34', side: '#5a3a22', label: 'Stall' },
                    { gx: 5, gy: 1, w: 2, d: 1, h: 26, top: '#8a5a34', side: '#5a3a22' },
                    { gx: 1, gy: 3, w: 1, d: 2, h: 22, top: '#6a5a3a', side: '#44381f' },
                    { gx: 7, gy: 3, w: 1, d: 2, h: 34, top: '#c0392b', side: '#7e241a' },
                    { gx: 3, gy: 2, w: 3, d: 1, h: 30, top: '#c8912e', side: '#8a5f17', label: 'Counter' },
                ],
                spots: [{ id: 'buy', gx: 4, gy: 3, label: 'Buy something' }],
            }),
            play: () => ({
                floorA: '#232336', floorB: '#1f1f30', floorLine: '#191926',
                props: [
                    { gx: 1, gy: 1, w: 1, d: 1, h: 44, top: '#4fd1ff', side: '#24242f', glow: '#4fd1ff' },
                    { gx: 3, gy: 1, w: 1, d: 1, h: 44, top: '#4fd1ff', side: '#24242f', glow: '#4fd1ff' },
                    { gx: 5, gy: 1, w: 1, d: 1, h: 44, top: '#4fd1ff', side: '#24242f', glow: '#4fd1ff', label: 'Cabinets' },
                    { gx: 7, gy: 1, w: 1, d: 1, h: 44, top: '#4fd1ff', side: '#24242f', glow: '#4fd1ff' },
                    { gx: 1, gy: 4, w: 2, d: 1, h: 20, top: '#3a3a48', side: '#2a2a35' },
                ],
                spots: [{ id: 'play', gx: 4, gy: 2, label: 'Play' }],
            }),
            club: () => ({
                floorA: '#2a1f30', floorB: '#251b2a', floorLine: '#1d1522',
                wallA: '#241a2c', wallB: '#1d1424',
                props: [
                    { gx: 0, gy: 1, w: 1, d: 2, h: 56, top: '#33333f', side: '#1d1d26' },
                    { gx: 8, gy: 1, w: 1, d: 2, h: 56, top: '#33333f', side: '#1d1d26' },
                    { gx: 3, gy: 0, w: 3, d: 1, h: 18, top: '#8e44ad', side: '#5b2d72', glow: '#c0392b', label: 'Ring' },
                    { gx: 1, gy: 4, w: 2, d: 1, h: 26, top: '#c8912e', side: '#8a5f17' },
                ],
                spots: [{ id: 'fight', gx: 4, gy: 2, label: 'Fight' }],
            }),
            hotel: () => ({
                floorA: '#2b2b38', floorB: '#262632', floorLine: '#1f1f29',
                props: [
                    { gx: 1, gy: 1, w: 2, d: 1, h: 22, top: '#584a66', side: '#3a3040', label: 'Beds' },
                    { gx: 1, gy: 3, w: 2, d: 1, h: 22, top: '#584a66', side: '#3a3040' },
                    { gx: 6, gy: 1, w: 2, d: 1, h: 32, top: '#2f3a4a', side: '#223040', label: 'Reception' },
                ],
                spots: [{ id: 'sleep', gx: 6, gy: 2, label: 'Take a room for the night' }],
            }),
            clinic: () => ({
                floorA: '#2e3238', floorB: '#292d33', floorLine: '#22262b',
                wallA: '#e8e3d6', wallB: '#cfc9bb',
                props: [
                    { gx: 1, gy: 1, w: 2, d: 1, h: 20, top: '#dfe4ea', side: '#9aa3ad', label: 'Beds' },
                    { gx: 1, gy: 3, w: 2, d: 1, h: 20, top: '#dfe4ea', side: '#9aa3ad' },
                    { gx: 6, gy: 2, w: 2, d: 1, h: 30, top: '#4a5a6a', side: '#334152', label: 'Doctor' },
                ],
                spots: [{ id: 'see', gx: 6, gy: 3, label: 'See the doctor' }],
            }),
            work: () => ({
                floorA: '#32322c', floorB: '#2d2d28', floorLine: '#262621',
                props: [
                    { gx: 1, gy: 1, w: 2, d: 1, h: 28, top: '#5b6b7a', side: '#3f4b56', label: 'Desks' },
                    { gx: 5, gy: 1, w: 2, d: 1, h: 28, top: '#5b6b7a', side: '#3f4b56' },
                    { gx: 3, gy: 4, w: 2, d: 1, h: 36, top: '#8b7a5a', side: '#5d523c', label: 'The board' },
                ],
                spots: [{ id: 'work', gx: 3, gy: 3, label: 'Look for work' }],
            }),
            travel: () => ({
                floorA: '#33333b', floorB: '#2e2e36', floorLine: '#26262d',
                props: [
                    { gx: 1, gy: 1, w: 4, d: 2, h: 40, top: '#e8b31c', side: '#9a7512', label: 'Danfo' },
                    { gx: 7, gy: 2, w: 1, d: 2, h: 30, top: '#4a3f2e', side: '#332b1f' },
                ],
                spots: [{ id: 'go', gx: 4, gy: 4, label: 'Travel out of town' }],
            }),
            span: () => ({
                floorA: '#3a3a46', floorB: '#35353f', floorLine: '#2b2b35',
                wallA: '#1b2a3a', wallB: '#15222e',
                props: [
                    { gx: 0, gy: 0, w: 9, d: 1, h: 16, top: '#4e4e5a', side: '#3a3a46' },
                    { gx: 2, gy: 3, w: 1, d: 1, h: 24, top: '#c0392b', side: '#7e241a' },
                ],
                spots: [{ id: 'run', gx: 5, gy: 3, label: 'Start the run' }],
            }),
        };

        const set = (sets[kind] || (() => ({
            props: [
                { gx: 6, gy: 1, w: 2, d: 1, h: 30, top: '#4a4a58', side: '#2f2f3b', label: 'Desk' },
                { gx: 1, gy: 1, w: 1, d: 2, h: 40, top: '#3a3a48', side: '#2a2a35' },
            ],
            spots: [{ id: 'open', gx: 6, gy: 2, label: 'Ask at the desk' }],
        })))();

        const plan = Object.assign({}, base, set);
        plan.spots = (plan.spots || []).concat(door);
        return plan;
    },
};
