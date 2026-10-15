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
        // Cropped to the room itself, walls and labels included, so it fills
        // the screen instead of floating in a fixed canvas.
        const left = this._iso(0, pl.rows)[0], right = this._iso(pl.cols, 0)[0];
        const top = this._iso(0, 0, 76)[1] - 34, bottom = this._iso(pl.cols, pl.rows)[1] + 18;
        const vb = [left - 16, top, right - left + 32, bottom - top];
        s.push(`<svg id="pl-svg" viewBox="${vb.map(n => n.toFixed(1)).join(' ')}" ` +
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
        s.push(this._decor(pl));

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

    /// A box from z0 up to z0 + h, with its two visible sides and a lid.
    _box(gx, gy, w, d, z0, h, top, side, side2, edge) {
        const A = this._iso(gx, gy, z0 + h),         B = this._iso(gx + w, gy, z0 + h);
        const C = this._iso(gx + w, gy + d, z0 + h), D = this._iso(gx, gy + d, z0 + h);
        const B0 = this._iso(gx + w, gy, z0),        C0 = this._iso(gx + w, gy + d, z0);
        const D0 = this._iso(gx, gy + d, z0);
        return `<polygon points="${D} ${C} ${C0} ${D0}" fill="${side || '#2f2f3b'}"/>` +
               `<polygon points="${B} ${C} ${C0} ${B0}" fill="${side2 || '#3a3a48'}"/>` +
               `<polygon points="${A} ${B} ${C} ${D}" fill="${top || '#4a4a58'}"/>` +
               (edge === false ? '' :
               `<polyline points="${D} ${C} ${B}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="1.2"/>`);
    },

    _shade(c, k) {
        const n = parseInt(c.slice(1), 16);
        const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
        return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
    },

    /// One piece of furniture. A plain prop is a box; a prop with a `kind`
    /// is drawn as that thing, inside the same footprint.
    _prop(p, pl) {
        const h = p.h || 30, w = p.w || 1, d = p.d || 1;
        const top = p.top || '#4a4a58', side = p.side || this._shade(top, 0.62), side2 = p.side2 || this._shade(top, 0.78);
        const sh = [this._iso(p.gx + 0.15, p.gy + d + 0.2, 0), this._iso(p.gx + w + 0.2, p.gy + d + 0.2, 0),
                    this._iso(p.gx + w + 0.2, p.gy + 0.15, 0)];
        let g = `<polygon points="${this._iso(p.gx, p.gy + d, 0)} ${sh[0]} ${sh[1]} ${sh[2]} ${this._iso(p.gx + w, p.gy, 0)} ` +
                `${this._iso(p.gx + w, p.gy + d, 0)}" fill="#000" opacity="0.28"/>`;
        const x = p.gx, y = p.gy;

        switch (p.kind) {
            case 'table': case 'desk': {
                // Four legs and a slab, inset so the floor shows under it.
                const t = 5, legs = [[0.1, 0.1], [w - 0.22, 0.1], [0.1, d - 0.22], [w - 0.22, d - 0.22]];
                for (const [lx, ly] of legs) g += this._box(x + lx, y + ly, 0.12, 0.12, 0, h - t, '#2a2a33', '#1e1e26', '#26262f', false);
                g += this._box(x, y, w, d, h - t, t, top, side, side2);
                if (p.kind === 'desk') g += this._box(x + w * 0.55, y + 0.2, 0.35, 0.3, h, 12, '#1c2430', '#10161e', '#141b24', false) +
                                            this._box(x + 0.2, y + 0.35, 0.5, 0.3, h, 1.5, '#e8edf6', '#b4bccc', '#c9ccd4', false);
                else g += this._box(x + w * 0.3, y + d * 0.35, 0.18, 0.18, h, 7, '#c0563a', '#7e3420', '#9a4028', false) +
                          this._box(x + w * 0.62, y + d * 0.3, 0.14, 0.14, h, 9, '#8ab04a', '#55702c', '#6a8a36', false);
                break;
            }
            case 'stool': {
                g += this._box(x + 0.38, y + 0.38, 0.24, 0.24, 0, h - 4, '#2a2a33', '#1e1e26', '#26262f', false) +
                     this._box(x + 0.2, y + 0.2, 0.6, 0.6, h - 4, 4, top, side, side2);
                break;
            }
            case 'bed': {
                g += this._box(x, y, w, d, 0, 10, '#3a2a20', '#22180f', '#2c2016', false) +
                     this._box(x + 0.04, y + 0.04, w - 0.08, d - 0.08, 10, h - 10, top, side, side2) +
                     this._box(x + 0.12, y + 0.15, 0.45, d - 0.3, h, 5, '#eef1f7', '#b4bccc', '#c9ccd4', false) +
                     this._box(x + 0.7, y + 0.04, w - 0.74, d - 0.08, h, 1.5, this._shade(top, 1.25), side, side2, false);
                break;
            }
            case 'cabinet': {
                // An arcade cabinet: body, a lit screen on the front, buttons.
                g += this._box(x + 0.1, y + 0.1, w - 0.2, d - 0.2, 0, h, '#24242f', '#16161e', '#1d1d26');
                const a = this._iso(x + 0.25, y + d - 0.1, h * 0.55), b = this._iso(x + w - 0.25, y + d - 0.1, h * 0.55);
                const c = this._iso(x + w - 0.25, y + d - 0.1, h * 0.9), e = this._iso(x + 0.25, y + d - 0.1, h * 0.9);
                g += `<polygon points="${a} ${b} ${c} ${e}" fill="${p.glow || '#4fd1ff'}" opacity="0.9"/>`;
                const k1 = this._iso(x + 0.4, y + d - 0.1, h * 0.42), k2 = this._iso(x + 0.65, y + d - 0.1, h * 0.42);
                g += `<circle cx="${k1[0].toFixed(1)}" cy="${k1[1].toFixed(1)}" r="2.6" fill="#e8c23a"/>` +
                     `<circle cx="${k2[0].toFixed(1)}" cy="${k2[1].toFixed(1)}" r="2.6" fill="#c0392b"/>`;
                break;
            }
            case 'stall': case 'counter': {
                g += this._box(x, y, w, d, 0, h, top, side, side2);
                // Goods along the top.
                const goods = ['#d8a33a', '#8ab04a', '#c0563a', '#e8edf6', '#4fd1ff'];
                const n = Math.max(2, Math.round(w * 2));
                for (let i = 0; i < n; i++) {
                    const gc = goods[(i + x) % goods.length];
                    g += this._box(x + 0.12 + i * (w - 0.24) / n, y + d * 0.3, (w - 0.24) / n - 0.08, d * 0.4, h, 5 + (i % 2) * 3,
                                   gc, this._shade(gc, 0.6), this._shade(gc, 0.78), false);
                }
                break;
            }
            case 'shelf': {
                g += this._box(x, y, w, d, 0, h, top, side, side2);
                const rows = Math.max(2, Math.floor(h / 16));
                for (let r = 1; r <= rows; r++) {
                    const z = h * r / (rows + 1);
                    const a = this._iso(x + 0.05, y + d, z), b = this._iso(x + w - 0.05, y + d, z);
                    g += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#000" stroke-opacity="0.35" stroke-width="1.5"/>`;
                    for (let i = 0; i < 3; i++) {
                        const q = this._iso(x + 0.2 + i * (w - 0.3) / 3, y + d, z + 5);
                        g += `<rect x="${(q[0] - 3).toFixed(1)}" y="${(q[1] - 5).toFixed(1)}" width="6" height="8" rx="1" fill="${['#d8a33a', '#4fd1ff', '#c0563a'][(i + r) % 3]}"/>`;
                    }
                }
                break;
            }
            case 'speaker': {
                g += this._box(x, y, w, d, 0, h, '#1d1d26', '#121218', '#18181f');
                for (const z of [h * 0.3, h * 0.68]) {
                    const c = this._iso(x + w / 2, y + d, z);
                    g += `<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="9" ry="7" fill="#33333f"/>` +
                         `<ellipse cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" rx="3.5" ry="2.8" fill="#55555f"/>`;
                }
                break;
            }
            case 'board': {
                g += this._box(x, y, w, d, 0, h, top, side, side2);
                for (let i = 0; i < 4; i++) {
                    const c = this._iso(x + 0.2 + (i % 2) * (w / 2), y + d, h * (i < 2 ? 0.75 : 0.42));
                    g += `<rect x="${(c[0] - 7).toFixed(1)}" y="${(c[1] - 6).toFixed(1)}" width="14" height="10" fill="#f2ead2" transform="rotate(${i % 2 ? 4 : -5} ${c[0].toFixed(1)} ${c[1].toFixed(1)})"/>`;
                }
                break;
            }
            case 'plant': {
                g += this._box(x + 0.28, y + 0.28, 0.44, 0.44, 0, 14, '#8a5a34', '#5a3a22', '#6e4628', false);
                const c = this._iso(x + 0.5, y + 0.5, 14 + h * 0.5);
                g += `<circle cx="${c[0].toFixed(1)}" cy="${(c[1] + 4).toFixed(1)}" r="13" fill="#1f6b3a"/>` +
                     `<circle cx="${(c[0] - 6).toFixed(1)}" cy="${(c[1] - 4).toFixed(1)}" r="9" fill="#2a8a4a"/>` +
                     `<circle cx="${(c[0] + 6).toFixed(1)}" cy="${(c[1] - 7).toFixed(1)}" r="8" fill="#37a35a"/>`;
                break;
            }
            case 'crate': {
                g += this._box(x + 0.1, y + 0.1, w - 0.2, d - 0.2, 0, h, '#a8763c', '#6e4a22', '#8a5e2c');
                const a = this._iso(x + 0.1, y + d - 0.1, h / 2), b = this._iso(x + w - 0.1, y + d - 0.1, h / 2);
                g += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="#4a3018" stroke-width="1.5"/>`;
                break;
            }
            default:
                g += this._box(x, y, w, d, 0, h, top, side, side2);
        }

        if (p.glow && p.kind !== 'cabinet') {
            const m = this._iso(x + w / 2, y + d / 2, h + 10);
            g += `<ellipse cx="${m[0].toFixed(1)}" cy="${m[1].toFixed(1)}" rx="${18 * w}" ry="${9 * d}" ` +
                 `fill="${p.glow}" opacity="0.3"/>`;
        }
        if (p.kind === 'cabinet') {
            const m = this._iso(x + w / 2, y + d + 0.6, 0);
            g += `<ellipse cx="${m[0].toFixed(1)}" cy="${m[1].toFixed(1)}" rx="26" ry="10" fill="${p.glow || '#4fd1ff'}" opacity="0.14"/>`;
        }
        if (p.label) {
            const m = this._iso(x + w / 2, y + d / 2, h + 26);
            g += `<text class="pl-lab" x="${m[0].toFixed(1)}" y="${m[1].toFixed(1)}" ` +
                 `text-anchor="middle">${p.label}</text>`;
        }
        return g;
    },

    /// What makes a room a room: a rug, windows in the back wall, a picture,
    /// and the pool of light from the ceiling.
    _decor(pl) {
        let g = '';
        const rug = pl.rug || '#3a2f4a';
        const r = [this._iso(2.5, 3, 0), this._iso(6.5, 3, 0), this._iso(6.5, 5.6, 0), this._iso(2.5, 5.6, 0)];
        g += `<polygon points="${r.join(' ')}" fill="${rug}" opacity="0.55"/>`;
        const ri = [this._iso(2.8, 3.25, 0), this._iso(6.2, 3.25, 0), this._iso(6.2, 5.35, 0), this._iso(2.8, 5.35, 0)];
        g += `<polygon points="${ri.join(' ')}" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="1.5"/>`;
        // Windows on the wall along x.
        for (const i of [2.2, 5.8]) {
            const a = this._iso(i, 0, 26), b = this._iso(i + 1.3, 0, 26), c = this._iso(i + 1.3, 0, 60), d = this._iso(i, 0, 60);
            const m1 = this._iso(i + 0.65, 0, 26), m2 = this._iso(i + 0.65, 0, 60);
            g += `<polygon points="${a} ${b} ${c} ${d}" fill="${pl.window || '#2a3a55'}"/>` +
                 `<polygon points="${a} ${b} ${c} ${d}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>` +
                 `<line x1="${m1[0]}" y1="${m1[1]}" x2="${m2[0]}" y2="${m2[1]}" stroke="#000" stroke-opacity="0.35" stroke-width="1.5"/>`;
        }
        // A picture on the wall along y.
        const a = this._iso(0, 2.2, 32), b = this._iso(0, 3.6, 32), c = this._iso(0, 3.6, 58), d = this._iso(0, 2.2, 58);
        g += `<polygon points="${a} ${b} ${c} ${d}" fill="${pl.picture || '#c8912e'}" opacity="0.85"/>` +
             `<polygon points="${a} ${b} ${c} ${d}" fill="none" stroke="#1a1208" stroke-width="2"/>`;
        // Light from above.
        const m = this._iso(pl.cols / 2, pl.rows / 2, 0);
        g += `<ellipse cx="${m[0]}" cy="${m[1]}" rx="${pl.cols * 13}" ry="${pl.rows * 9}" fill="${pl.light || '#ffd98a'}" opacity="0.07"/>`;
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
            // Through the SVG's own transform, so the crop and the letterbox
            // that keeps its aspect ratio are both accounted for.
            const m = svg.getScreenCTM();
            if (!m) return;
            const pt = svg.createSVGPoint();
            pt.x = e.clientX; pt.y = e.clientY;
            const p = pt.matrixTransform(m.inverse());
            const [gx, gy] = this._unIso(p.x, p.y);
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
        // Quibbles opens over the room, so you are still standing at the
        // table when you close it.
        if (this._venue.kind === 'hangout' && typeof Quibbles !== 'undefined') {
            Quibbles.open(spot.id);
            return;
        }
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
                    { kind: 'stall', gx: 1, gy: 1, w: 2, d: 1, h: 26, top: '#8a5a34', side: '#5a3a22', label: 'Stall' },
                    { kind: 'stall', gx: 5, gy: 1, w: 2, d: 1, h: 26, top: '#8a5a34', side: '#5a3a22' },
                    { kind: 'crate', gx: 1, gy: 3, w: 1, d: 2, h: 22 },
                    { kind: 'shelf', gx: 7, gy: 3, w: 1, d: 2, h: 40, top: '#c0392b', side: '#7e241a' },
                    { kind: 'counter', gx: 3, gy: 2, w: 3, d: 1, h: 30, top: '#c8912e', side: '#8a5f17', label: 'Counter' },
                ],
                spots: [{ id: 'buy', gx: 4, gy: 3, label: 'Buy something' }],
            }),
            play: () => ({
                floorA: '#232336', floorB: '#1f1f30', floorLine: '#191926',
                props: [
                    { kind: 'cabinet', gx: 1, gy: 1, w: 1, d: 1, h: 48, glow: '#4fd1ff' },
                    { kind: 'cabinet', gx: 3, gy: 1, w: 1, d: 1, h: 48, glow: '#ff5fa2' },
                    { kind: 'cabinet', gx: 5, gy: 1, w: 1, d: 1, h: 48, glow: '#7ad85a', label: 'Cabinets' },
                    { kind: 'cabinet', gx: 7, gy: 1, w: 1, d: 1, h: 48, glow: '#ffc83d' },
                    { kind: 'table', gx: 1, gy: 4, w: 2, d: 1, h: 20, top: '#3a3a48' },
                ],
                spots: [{ id: 'play', gx: 4, gy: 2, label: 'Play' }],
            }),
            club: () => ({
                floorA: '#2a1f30', floorB: '#251b2a', floorLine: '#1d1522',
                wallA: '#241a2c', wallB: '#1d1424',
                props: [
                    { kind: 'speaker', gx: 0, gy: 1, w: 1, d: 2, h: 56 },
                    { kind: 'speaker', gx: 8, gy: 1, w: 1, d: 2, h: 56 },
                    { gx: 3, gy: 0, w: 3, d: 1, h: 18, top: '#8e44ad', side: '#5b2d72', glow: '#c0392b', label: 'Ring' },
                    { kind: 'counter', gx: 1, gy: 4, w: 2, d: 1, h: 26, top: '#c8912e', side: '#8a5f17' },
                ],
                spots: [{ id: 'fight', gx: 4, gy: 2, label: 'Fight' }],
            }),
            hotel: () => ({
                floorA: '#2b2b38', floorB: '#262632', floorLine: '#1f1f29',
                props: [
                    { kind: 'bed', gx: 1, gy: 1, w: 2, d: 1, h: 20, top: '#584a66', label: 'Beds' },
                    { kind: 'bed', gx: 1, gy: 3, w: 2, d: 1, h: 20, top: '#584a66' },
                    { kind: 'counter', gx: 6, gy: 1, w: 2, d: 1, h: 32, top: '#2f3a4a', side: '#223040', label: 'Reception' },
                ],
                spots: [{ id: 'sleep', gx: 6, gy: 2, label: 'Take a room for the night' }],
            }),
            clinic: () => ({
                floorA: '#2e3238', floorB: '#292d33', floorLine: '#22262b',
                wallA: '#e8e3d6', wallB: '#cfc9bb',
                props: [
                    { kind: 'bed', gx: 1, gy: 1, w: 2, d: 1, h: 18, top: '#9ec9e8', label: 'Beds' },
                    { kind: 'bed', gx: 1, gy: 3, w: 2, d: 1, h: 18, top: '#9ec9e8' },
                    { kind: 'desk', gx: 6, gy: 2, w: 2, d: 1, h: 28, top: '#4a5a6a', label: 'Doctor' },
                ],
                spots: [{ id: 'see', gx: 6, gy: 3, label: 'See the doctor' }],
            }),
            work: () => ({
                floorA: '#32322c', floorB: '#2d2d28', floorLine: '#262621',
                props: [
                    { kind: 'desk', gx: 1, gy: 1, w: 2, d: 1, h: 26, top: '#5b6b7a', label: 'Desks' },
                    { kind: 'desk', gx: 5, gy: 1, w: 2, d: 1, h: 26, top: '#5b6b7a' },
                    { kind: 'board', gx: 3, gy: 4, w: 2, d: 1, h: 40, top: '#8b7a5a', side: '#5d523c', label: 'The board' },
                ],
                spots: [{ id: 'work', gx: 3, gy: 3, label: 'Look for work' }],
            }),
            travel: () => ({
                floorA: '#33333b', floorB: '#2e2e36', floorLine: '#26262d',
                props: [
                    { gx: 1, gy: 1, w: 4, d: 2, h: 40, top: '#e8b31c', side: '#9a7512', label: 'Danfo' },
                    { kind: 'crate', gx: 7, gy: 2, w: 1, d: 2, h: 24 },
                ],
                spots: [{ id: 'go', gx: 4, gy: 4, label: 'Travel out of town' }],
            }),
            // Quibbles: three tables along the back wall, one for each
            // thing you can do here.
            hangout: () => ({
                floorA: '#3a2a22', floorB: '#35261f', floorLine: '#2a1e18',
                wallA: '#2e2018', wallB: '#271b14',
                props: [
                    { kind: 'table', gx: 1, gy: 1, w: 2, d: 1, h: 22, top: '#d35400', label: 'Communities' },
                    { kind: 'table', gx: 4, gy: 1, w: 2, d: 1, h: 22, top: '#2874a6', label: 'My profile' },
                    { kind: 'table', gx: 7, gy: 1, w: 2, d: 1, h: 22, top: '#1f7a4d', label: 'New post' },
                    { kind: 'plant', gx: 0, gy: 5, h: 24 },
                    { kind: 'plant', gx: 8, gy: 5, h: 24 },
                ],
                spots: [
                    { id: 'explore', gx: 2, gy: 2, label: 'Explore communities' },
                    { id: 'profile', gx: 5, gy: 2, label: 'My profile' },
                    { id: 'post',    gx: 8, gy: 2, label: 'Create a post' },
                ],
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
                { kind: 'desk', gx: 6, gy: 1, w: 2, d: 1, h: 28, top: '#4a4a58', label: 'Desk' },
                { kind: 'shelf', gx: 1, gy: 1, w: 1, d: 2, h: 44, top: '#3a3a48' },
            ],
            spots: [{ id: 'open', gx: 6, gy: 2, label: 'Ask at the desk' }],
        })))();

        const plan = Object.assign({}, base, set);
        plan.spots = (plan.spots || []).concat(door);
        return plan;
    },
};
