// ── Naijabeats ────────────────────────────────────────────────────────────
// The music studio. Inside it you make a beat on Vibe — the real sequencer
// from 2010, ported — and you can sell what you make.
//
// It earns its place in the game by paying like the other work does: a
// session costs hours, the fee depends on what is actually in the track, and
// a beat can only be sold once. Hammering one note sixteen times is not a
// song and does not pay like one.

const Studio = {

    SESSION_HOURS: 3,
    MIN_TRACKS: 2,
    MIN_NOTES: 10,

    song: null,
    synth: null,
    current: 0,
    _timer: null,
    _step: -1,
    _sold: null,          // fingerprints of beats already sold

    PITCHES: [72, 71, 69, 67, 65, 64, 62, 60],
    DRUM_ROWS: [49, 46, 42, 39, 38, 37, 36, 35],
    DRUM_NAMES: { 35: 'Kick', 36: 'Kick2', 37: 'Rim', 38: 'Snare',
                  39: 'Clap', 42: 'HiHat', 46: 'Open', 49: 'Crash' },

    // ── Opening and closing ───────────────────────────────────────────────

    open() {
        if (!Player.exists()) { openCreate(); return; }
        const host = document.getElementById('studio');
        if (!host) return;

        if (!this.song) this.fresh();
        if (!this.synth) this.synth = new Synth();
        for (const t of this.song.tracks) this.synth.setProgram(t.channel, t.program);

        host.innerHTML = this.chrome();
        host.classList.add('on');
        document.body.classList.add('in-place');
        this.bind();
        this.layout();
    },

    close() {
        this.stop();
        const host = document.getElementById('studio');
        if (host) { host.classList.remove('on'); host.innerHTML = ''; }
        document.body.classList.remove('in-place');
        if (typeof refreshLifeHud === 'function') refreshLifeHud();
        if (typeof CityMap !== 'undefined') CityMap.build();
    },

    /// A new beat: one riff per track, which is how Vibe kept the grid small.
    fresh() {
        this.song = new Song('Beat');
        this.song.bars = 1;
        this.song.loopStart = 0;
        this.song.loopEnd = 0;
        this.current = 0;
        this.addTrack('Lead', 0, 0);
        this.addTrack('Drums', 9, 0);
    },

    addTrack(name, channel, program) {
        const riff = this.song.addRiff(new Riff(name, 1));
        const t = this.song.addTrack(new Track(name, channel));
        t.program = program;
        t.add(new Placement(riff, 0));
        t.riff = riff;
        return t;
    },

    // ── What it looks like ────────────────────────────────────────────────

    chrome() {
        return '<div class="st-top">' +
                '<span class="st-name">&#9835; Naijabeats</span>' +
                '<button class="pl-out" onclick="Studio.close()">&#10005; Leave</button>' +
            '</div>' +
            '<div class="st-bar">' +
                '<button class="st-go" id="st-play" onclick="Studio.toggle()">Play</button>' +
                '<select id="st-track" onchange="Studio.pickTrack(+this.value)"></select>' +
                '<button onclick="Studio.newTrack()" title="New track">+</button>' +
                '<button onclick="Studio.dropTrack()" title="Remove track">&minus;</button>' +
                '<select id="st-inst" onchange="Studio.setInst(+this.value)"></select>' +
            '</div>' +
            '<canvas id="st-grid"></canvas>' +
            '<div class="st-act" id="st-act"></div>';
    },

    bind() {
        const sel = document.getElementById('st-track');
        this.syncTracks();
        const inst = document.getElementById('st-inst');
        inst.innerHTML = '';
        GM.forEach((n, i) => inst.add(new Option(n, String(i))));
        this.syncInst();

        const cv = document.getElementById('st-grid');
        cv.addEventListener('pointerdown', e => this.tap(e));
        this._resize = () => this.layout();
        window.addEventListener('resize', this._resize);
        this.refreshAct();
    },

    syncTracks() {
        const sel = document.getElementById('st-track');
        if (!sel) return;
        sel.innerHTML = '';
        this.song.tracks.forEach((t, i) =>
            sel.add(new Option(t.name + ' · ch' + (t.channel + 1), String(i))));
        sel.value = String(this.current);
    },

    syncInst() {
        const inst = document.getElementById('st-inst');
        if (!inst) return;
        const t = this.song.tracks[this.current];
        inst.disabled = t.channel === 9;
        inst.value = String(t.program);
    },

    rows(t) { return t.channel === 9 ? this.DRUM_ROWS : this.PITCHES; },

    label(t, row) {
        const n = this.rows(t)[row];
        if (t.channel === 9) return this.DRUM_NAMES[n] || String(n);
        return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n % 12]
             + (Math.floor(n / 12) - 1);
    },

    layout() {
        const cv = document.getElementById('st-grid');
        if (!cv) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cv.clientWidth, h = cv.clientHeight;
        cv.width = w * dpr; cv.height = h * dpr;
        cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
        this.cell = {
            x0: 52, y0: 4,
            w: (w - 58) / this.song.stepsPerRiff,
            h: (h - 8) / 8,
        };
        this.draw();
    },

    draw() {
        const cv = document.getElementById('st-grid');
        if (!cv || !this.cell) return;
        const cx = cv.getContext('2d');
        const t = this.song.tracks[this.current];
        const rows = this.rows(t), steps = this.song.stepsPerRiff;
        const c = this.cell;
        cx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);

        cx.font = '10px monospace';
        cx.textBaseline = 'middle';
        for (let r = 0; r < 8; r++) {
            const y = c.y0 + r * c.h;
            cx.fillStyle = '#6a7183';
            cx.fillText(this.label(t, r), 5, y + c.h / 2);
            for (let s = 0; s < steps; s++) {
                cx.fillStyle = s === this._step ? '#2e2e40'
                             : (s % 4 === 0 ? '#191922' : '#14141c');
                cx.fillRect(c.x0 + s * c.w + 1, y + 1, c.w - 2, c.h - 2);
            }
        }
        for (const e of t.riff.events) {
            if (!e.isNote) continue;
            const r = rows.indexOf(e.data[0]);
            if (r < 0) continue;
            cx.globalAlpha = 0.35 + 0.65 * (e.data[1] / 127);
            cx.fillStyle = t.channel === 9 ? '#ffc83d' : '#4cd964';
            cx.fillRect(c.x0 + e.tick * c.w + 1, c.y0 + r * c.h + 2,
                        Math.max(1, e.dur) * c.w - 2, c.h - 4);
            cx.globalAlpha = 1;
        }
    },

    // ── Editing ───────────────────────────────────────────────────────────

    tap(ev) {
        const cv = document.getElementById('st-grid');
        const r = cv.getBoundingClientRect(), c = this.cell;
        const s = Math.floor((ev.clientX - r.left - c.x0) / c.w);
        const row = Math.floor((ev.clientY - r.top - c.y0) / c.h);
        if (s < 0 || s >= this.song.stepsPerRiff || row < 0 || row > 7) return;

        const t = this.song.tracks[this.current];
        const pitch = this.rows(t)[row];
        const found = t.riff.events.find(e => e.isNote && e.tick === s && e.data[0] === pitch);
        if (found) t.riff.remove(found);
        else {
            t.riff.add(Event.note(pitch, 100, t.channel === 9 ? 1 : 2, s));
            if (this.synth.ctx) this.synth.hit(t.channel, pitch, 100, 0.25);
            else this.synth.start().then(() => this.synth.hit(t.channel, pitch, 100, 0.25));
        }
        this.draw();
        this.refreshAct();
    },

    pickTrack(i) { this.current = i; this.syncInst(); this.draw(); },

    setInst(p) {
        const t = this.song.tracks[this.current];
        t.program = p;
        this.synth.setProgram(t.channel, p);
    },

    newTrack() {
        const wantDrums = this.song.tracks.every(t => t.channel !== 9);
        let ch = this.song.freeChannel(wantDrums);
        if (ch === -1) ch = this.song.freeChannel(false);
        if (ch === -1) { flash('No channels left.'); return; }
        const t = this.addTrack(ch === 9 ? 'Drums' : 'Track ' + (this.song.tracks.length + 1), ch, 0);
        this.synth.setProgram(t.channel, t.program);
        this.current = this.song.tracks.length - 1;
        this.syncTracks(); this.syncInst(); this.draw(); this.refreshAct();
    },

    dropTrack() {
        if (this.song.tracks.length <= 1) return;
        const t = this.song.tracks[this.current];
        this.song.tracks.splice(this.current, 1);
        const i = this.song.riffs.indexOf(t.riff);
        if (i !== -1) this.song.riffs.splice(i, 1);
        if (this.current >= this.song.tracks.length) this.current = this.song.tracks.length - 1;
        this.syncTracks(); this.syncInst(); this.draw(); this.refreshAct();
    },

    // ── Playing ───────────────────────────────────────────────────────────

    toggle() { this._timer ? this.stop() : this.play(); },

    async play() {
        await this.synth.start();
        const btn = document.getElementById('st-play');
        if (btn) { btn.textContent = 'Stop'; btn.classList.add('on'); }
        let step = 0;
        const beat = () => {
            this._step = step;
            for (const t of this.song.tracks)
                for (const e of t.riff.events)
                    if (e.isNote && e.tick === step)
                        this.synth.hit(t.channel, e.data[0], e.data[1],
                                       Math.max(1, e.dur) * (15 / this.song.tempo));
            this.draw();
            step = (step + 1) % this.song.stepsPerRiff;
        };
        beat();
        this._timer = setInterval(beat, 15000 / this.song.tempo);
    },

    stop() {
        if (this._timer) clearInterval(this._timer);
        this._timer = null;
        this._step = -1;
        if (this.synth) this.synth.allOff();
        const btn = document.getElementById('st-play');
        if (btn) { btn.textContent = 'Play'; btn.classList.remove('on'); }
        this.draw();
    },

    // ── Selling it ────────────────────────────────────────────────────────
    // The fee follows what is actually in the beat: how many tracks carry
    // something, how much of the bar is used, and how much variety there is.
    // Repeating one note is not a song, and the shape of this says so.

    worth() {
        const s = this.song;
        let notes = 0, steps = new Set(), pitches = new Set(), live = 0;
        for (const t of s.tracks) {
            const ns = t.riff.events.filter(e => e.isNote);
            if (ns.length) live++;
            notes += ns.length;
            for (const e of ns) { steps.add(e.tick); pitches.add(t.channel + ':' + e.data[0]); }
        }
        return {
            notes, live,
            spread: steps.size,            // how much of the bar is used
            variety: pitches.size,         // how many distinct sounds
            ok: live >= this.MIN_TRACKS && notes >= this.MIN_NOTES,
        };
    },

    /// What a buyer would pay, in Lagos terms, before the city multiplier.
    fee() {
        const w = this.worth();
        if (!w.ok) return 0;
        const base = 18
            + Math.min(w.live, 4) * 6             // layers, up to four
            + Math.min(w.spread, 16) * 1.4        // use of the bar
            + Math.min(w.variety, 12) * 1.6;      // variety of sounds
        return Math.round(Math.min(base, 78));
    },

    /// Two beats that are the same beat should not both pay.
    fingerprint() {
        return this.song.tracks.map(t =>
            t.channel + '|' + t.riff.events.filter(e => e.isNote)
                .map(e => e.tick + ',' + e.data[0]).sort().join(' ')
        ).sort().join('//');
    },

    sold() {
        if (this._sold) return this._sold;
        try { this._sold = JSON.parse(localStorage.getItem('runningboy_beats')) || []; }
        catch (_) { this._sold = []; }
        return this._sold;
    },

    refreshAct() {
        const act = document.getElementById('st-act');
        if (!act) return;
        const w = this.worth();
        const paid = Player.wage(this.fee(), Player.cityId());
        const already = this.sold().includes(this.fingerprint());

        if (!w.ok) {
            const need = [];
            if (w.live < this.MIN_TRACKS) need.push(this.MIN_TRACKS + ' tracks with something on them');
            if (w.notes < this.MIN_NOTES) need.push(this.MIN_NOTES + ' notes');
            act.innerHTML = '<div class="st-note">Nobody is buying that yet. ' +
                'You need ' + need.join(' and ') + '. You have ' +
                w.live + ' and ' + w.notes + '.</div>';
            return;
        }
        if (already) {
            act.innerHTML = '<div class="st-note">You already sold this one. ' +
                'Change it and they will listen again.</div>' +
                '<button class="est-btn" onclick="Studio.fresh();Studio.syncTracks();' +
                'Studio.syncInst();Studio.draw();Studio.refreshAct()">Start a new beat</button>';
            return;
        }
        act.innerHTML =
            '<div class="st-note">' + w.live + ' tracks, ' + w.notes + ' notes. ' +
            'Takes ' + this.SESSION_HOURS + ' hours to lay down.</div>' +
            '<button class="est-btn" onclick="Studio.sell()">Sell the beat &nbsp;·&nbsp; &#10022; ' +
            paid + '</button>';
    },

    sell() {
        const fee = this.fee();
        if (!fee) return;
        const print = this.fingerprint();
        if (this.sold().includes(print)) return;

        const paid = Player.wage(fee, Player.cityId());
        Player.adjust(paid, 'Sold a beat at Naijabeats');
        Player.passTime(this.SESSION_HOURS);

        this._sold.push(print);
        if (this._sold.length > 60) this._sold = this._sold.slice(-60);
        try { localStorage.setItem('runningboy_beats', JSON.stringify(this._sold)); } catch (_) {}

        this.stop();
        if (typeof refreshLifeHud === 'function') refreshLifeHud();
        flash('They took the beat · +' + paid);
        this.refreshAct();
    },
};
