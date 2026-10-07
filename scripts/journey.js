// ── The journey ───────────────────────────────────────────────────────────
// What you watch while you travel: the thing you are travelling in, a bar,
// and the clock running forward. Walking is a figure on a road; the flight
// is a plane over cloud. It is the one place the game shows time passing
// rather than just charging you for it.
//
// Game time runs at a minute a second. A fourteen-hour walk is therefore
// fourteen real minutes, which nobody wants to sit through, so the screen
// plays a compressed version: the clock still reads the hours it actually
// costs, and the longer the journey the longer the screen holds — just not
// in proportion. SECONDS_FOR sets that curve.

const Journey = {

    MINUTES_PER_SECOND: 1,          // game time, when it is running honestly
    SECONDS_FOR: hours => 2.6 + hours * 0.62,

    _timer: null,

    /// `opts` is { mode, fromName, toName, hours, wait, fare, startHour }.
    play(opts, done) {
        const host = document.getElementById('journey');
        if (!host) { if (done) done(); return; }

        const total = opts.hours + (opts.wait || 0);
        const secs  = this.SECONDS_FOR(total);
        host.innerHTML = this._scene(opts, total);
        host.classList.add('on');

        const bar   = document.getElementById('jr-fill');
        const clock = document.getElementById('jr-clock');
        const skip  = document.getElementById('jr-skip');
        const t0    = performance.now();

        const finish = () => {
            if (!this._timer) return;
            cancelAnimationFrame(this._timer);
            this._timer = null;
            host.classList.remove('on');
            setTimeout(() => { host.innerHTML = ''; if (done) done(); }, 320);
        };
        if (skip) skip.onclick = finish;

        const step = () => {
            const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
            if (bar) bar.style.width = (k * 100).toFixed(1) + '%';
            if (clock) {
                const h = Math.floor((opts.startHour + total * k) % 24);
                const m = Math.floor((((opts.startHour + total * k) % 1) * 60));
                clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
            }
            if (k >= 1) { finish(); return; }
            this._timer = requestAnimationFrame(step);
        };
        this._timer = requestAnimationFrame(step);
    },

    // ── The scene ─────────────────────────────────────────────────────────

    _scene(o, total) {
        const art = {
            flight: this._sky(), train: this._rails(),
            bus:    this._road(), walk:  this._path(o),
        }[o.mode] || this._road();

        const end = Math.floor((o.startHour + total) % 24);
        return `
            <div class="jr-art jr-${o.mode}">${art}</div>
            <div class="jr-panel">
                <div class="jr-route">${o.fromName} <span>&rarr;</span> ${o.toName}</div>
                <div class="jr-clock" id="jr-clock">--:--</div>
                <div class="jr-track"><div class="jr-fill" id="jr-fill"></div></div>
                <div class="jr-meta">
                    <span>${o.modeName}</span>
                    <span>${total}h &nbsp;·&nbsp; arrives ${String(end).padStart(2, '0')}:00</span>
                    <span>${o.fare ? '&#10022; ' + o.fare : 'no fare'}</span>
                </div>
                <button class="jr-skip" id="jr-skip">Skip &rsaquo;&rsaquo;</button>
            </div>`;
    },

    _sky() {
        let c = '';
        for (let i = 0; i < 7; i++) {
            const y = 14 + (i * 23) % 120, s = 0.5 + (i % 3) * 0.35, d = (i * 1.9) % 9;
            c += `<g class="jr-cloud" style="animation-delay:${-d}s;transform:translate(0,${y}px) scale(${s})">` +
                 `<ellipse cx="0" cy="0" rx="46" ry="15" fill="#ffffff" opacity="0.5"/>` +
                 `<ellipse cx="-22" cy="5" rx="26" ry="11" fill="#ffffff" opacity="0.4"/>` +
                 `<ellipse cx="24" cy="4" rx="30" ry="12" fill="#ffffff" opacity="0.45"/></g>`;
        }
        return `<svg viewBox="0 0 640 200" preserveAspectRatio="xMidYMid slice">
            <defs><linearGradient id="jsky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#1d3f6b"/><stop offset="1" stop-color="#7fb4d8"/></linearGradient></defs>
            <rect width="640" height="200" fill="url(#jsky)"/>${c}
            <g class="jr-plane">
              <path d="M0 0 L52 -6 L70 0 L52 6 Z" fill="#eef2f7"/>
              <path d="M18 -2 L30 -26 L38 -26 L32 -2 Z" fill="#d6dde6"/>
              <path d="M18 2 L30 26 L38 26 L32 2 Z" fill="#c7cfda"/>
              <path d="M2 -1 L10 -14 L16 -14 L12 -1 Z" fill="#b9c2ce"/>
              <circle cx="46" cy="-1" r="2.4" fill="#2b6fa8"/>
              <circle cx="38" cy="-1" r="2.4" fill="#2b6fa8"/>
            </g></svg>`;
    },

    _rails() {
        let s = '';
        for (let i = 0; i < 26; i++) s += `<rect x="${i * 26}" y="150" width="14" height="7" fill="#5b4a33"/>`;
        return `<svg viewBox="0 0 640 200" preserveAspectRatio="xMidYMid slice">
            <rect width="640" height="200" fill="#121a24"/>
            <rect y="120" width="640" height="80" fill="#1d2a1f"/>
            <g class="jr-scroll">${s}${s.replace(/x="(\d+)"/g, (m, x) => `x="${+x + 676}"`)}</g>
            <rect y="146" width="640" height="3" fill="#6a6a78"/>
            <rect y="160" width="640" height="3" fill="#6a6a78"/>
            <g class="jr-train">
              <rect x="0" y="92" width="150" height="52" rx="7" fill="#2b5f8a"/>
              <rect x="150" y="96" width="120" height="48" rx="6" fill="#24506f"/>
              <rect x="10" y="102" width="34" height="20" rx="3" fill="#bfe0f2"/>
              <rect x="56" y="102" width="34" height="20" rx="3" fill="#bfe0f2"/>
              <rect x="104" y="102" width="34" height="20" rx="3" fill="#bfe0f2"/>
              <rect x="162" y="104" width="30" height="18" rx="3" fill="#9fc8e0"/>
              <rect x="204" y="104" width="30" height="18" rx="3" fill="#9fc8e0"/>
              <circle cx="34" cy="150" r="11" fill="#15151d"/><circle cx="110" cy="150" r="11" fill="#15151d"/>
              <circle cx="196" cy="150" r="9" fill="#15151d"/><circle cx="246" cy="150" r="9" fill="#15151d"/>
            </g></svg>`;
    },

    _road() {
        let d = '';
        for (let i = 0; i < 16; i++) d += `<rect x="${i * 44}" y="156" width="26" height="5" fill="#d8d2a8"/>`;
        return `<svg viewBox="0 0 640 200" preserveAspectRatio="xMidYMid slice">
            <rect width="640" height="200" fill="#0f1420"/>
            <rect y="108" width="640" height="92" fill="#32323e"/>
            <rect y="104" width="640" height="5" fill="#8a5a34"/>
            <g class="jr-scroll">${d}${d.replace(/x="(\d+)"/g, (m, x) => `x="${+x + 704}"`)}</g>
            <g class="jr-bus">
              <rect x="0" y="74" width="168" height="58" rx="8" fill="#e8b31c"/>
              <rect x="0" y="100" width="168" height="10" fill="#1b1b20"/>
              <rect x="12" y="82" width="40" height="18" rx="3" fill="#2b3a44"/>
              <rect x="62" y="82" width="40" height="18" rx="3" fill="#2b3a44"/>
              <rect x="112" y="82" width="40" height="18" rx="3" fill="#2b3a44"/>
              <circle cx="38" cy="136" r="13" fill="#15151d"/><circle cx="134" cy="136" r="13" fill="#15151d"/>
            </g></svg>`;
    },

    /// Walking shows you, because it is the one journey you make yourself.
    _path(o) {
        const you = (typeof Player !== 'undefined' && Player.get())
            ? Avatar.svg(Player.get().avatar, 70, 110) : '';
        let t = '';
        for (let i = 0; i < 9; i++) {
            t += `<circle cx="${i * 78 + 20}" cy="${118 - (i % 3) * 6}" r="${16 + (i % 4) * 5}" fill="#1d3a1f"/>`;
        }
        return `<svg viewBox="0 0 640 200" preserveAspectRatio="xMidYMid slice">
            <rect width="640" height="200" fill="#10141c"/>
            <rect y="150" width="640" height="50" fill="#2a2418"/>
            <g class="jr-scroll">${t}${t.replace(/cx="(\d+)"/g, (m, x) => `cx="${+x + 720}"`)}</g>
            <rect y="148" width="640" height="4" fill="#3d3524"/>
          </svg>
          <div class="jr-walker">${you}</div>`;
    },
};
