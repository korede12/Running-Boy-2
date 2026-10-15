// ── Juice ─────────────────────────────────────────────────────────────────
// Small motion that says something happened. When your skubu changes, every
// place that shows it counts from the old number to the new one and gives a
// little pop, and a "+40" or "-12" floats up so you see what it was.
//
// It listens to Player.onChange after the HUD has already written the new
// number, so all it does is replay the change; if anything else writes the
// number in the middle, the last frame puts the right value back.

const Juice = {

    _last: null,
    _raf: null,

    init() {
        if (typeof Player === 'undefined') return;
        this._last = Player.exists() ? Player.skubu() : null;
        Player.onChange(() => this._money());
    },

    _calm() {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
    },

    _money() {
        const now = Player.exists() ? Player.skubu() : null;
        const was = this._last;
        this._last = now;
        // A new life, or no life, is not a payment.
        if (was === null || now === null || now === was) return;
        this._chip(now - was);
        if (!this._calm()) this._count(was, now);
    },

    /// Every element that shows the balance, and how to write a number into it.
    _targets() {
        const out = [];
        for (const id of ['life-skubu', 'skubu-count']) {
            const e = document.getElementById(id);
            if (e) out.push({ e, put: n => { e.textContent = String(n); } });
        }
        document.querySelectorAll('.nv-purse').forEach(e =>
            out.push({ e, put: n => { e.innerHTML = '&#10022; ' + n; } }));
        return out;
    },

    _count(from, to) {
        if (this._raf) cancelAnimationFrame(this._raf);
        const els = this._targets();
        els.forEach(t => { t.e.classList.remove('juice-bump'); void t.e.offsetWidth; t.e.classList.add('juice-bump'); });
        const t0 = performance.now(), dur = 650;
        const step = now => {
            const k = Math.min(1, (now - t0) / dur);
            const ease = 1 - Math.pow(1 - k, 3);
            const n = Math.round(from + (to - from) * ease);
            // Re-read the targets each frame: a panel may have redrawn.
            this._targets().forEach(t => t.put(k < 1 ? n : to));
            this._raf = k < 1 ? requestAnimationFrame(step) : null;
        };
        this._raf = requestAnimationFrame(step);
    },

    /// The amount, floating up from the top of the screen.
    _chip(delta) {
        const el = document.createElement('div');
        el.className = 'juice-chip ' + (delta > 0 ? 'up' : 'down');
        el.textContent = (delta > 0 ? '+' : '−') + Math.abs(delta) + ' ✦';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    },
};

Juice.init();
