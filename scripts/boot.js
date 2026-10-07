// ── Boot screen ───────────────────────────────────────────────────────────
// The gap before a run starts has two halves: the browser fetching Phaser and
// the scripts, then the scene fetching its own art and sound. Only the second
// half can report real progress, so the first is shown as a slow creep that
// never reaches the end — it says the game is alive without claiming to know
// how far along it is.
//
// The overlay is markup rather than something Phaser draws, because the first
// half happens before Phaser exists.

const Boot = {

    CREEP_TO: 0.14,        // where the fake progress stalls, waiting for real
    CREEP_MS: 2600,        // how long it takes to get there

    _el: null,
    _done: false,
    _shown: 0,

    init() {
        this._el = {
            wrap:  document.getElementById('boot'),
            fill:  document.getElementById('boot-fill'),
            label: document.getElementById('boot-label'),
            sub:   document.getElementById('boot-sub'),
        };
        if (!this._el.wrap) return;

        // Name the character being loaded, so the wait says something.
        try {
            const t = getTheme(RunStore.character());
            if (t && t.label && this._el.sub) this._el.sub.textContent = t.label;
        } catch (_) {}

        const t0 = performance.now();
        const creep = () => {
            if (this._done) return;
            const k = Math.min(1, (performance.now() - t0) / this.CREEP_MS);
            // Eases out, so it slows as it approaches the stall rather than
            // stopping dead.
            this._paint(this.CREEP_TO * (1 - Math.pow(1 - k, 3)));
            requestAnimationFrame(creep);
        };
        requestAnimationFrame(creep);

        // If something never arrives, say so rather than sitting there.
        setTimeout(() => {
            if (!this._done && this._el.label) {
                this._el.label.textContent = 'Still loading — check your connection';
            }
        }, 14000);
    },

    /// Hook a scene's loader. The remaining share of the bar is its to fill.
    attach(scene) {
        if (this._done || !this._el || !this._el.wrap) return;
        scene.load.on('progress', p => {
            this._paint(this.CREEP_TO + (1 - this.CREEP_TO) * p);
            if (this._el.label) this._el.label.textContent = 'Loading';
        });
        scene.load.once('complete', () => this.done());
        // attach() runs at the top of preload, before anything is queued, so
        // the queue cannot be measured here. The scene coming up is the one
        // signal that is true whether or not the loader had work to do.
        scene.events.once('create', () => this.done());
    },

    /// Never let the bar go backwards; a loader that re-counts mid-run can
    /// otherwise make it jump down, which reads as a fault.
    _paint(frac) {
        const v = Math.max(this._shown, Math.min(1, frac));
        this._shown = v;
        if (this._el && this._el.fill) this._el.fill.style.width = (v * 100).toFixed(1) + '%';
    },

    done() {
        if (this._done) return;
        this._done = true;
        this._paint(1);
        const w = this._el && this._el.wrap;
        if (!w) return;
        w.classList.add('gone');
        setTimeout(() => { w.style.display = 'none'; }, 420);
    },
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Boot.init());
} else {
    Boot.init();
}
