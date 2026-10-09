// ── Naijabeats ────────────────────────────────────────────────────────────
// The music studio. Inside it you make a beat on Vibe — the J2ME step
// sequencer from 2010, ported — and you can sell what you make.
//
// Two screens, because that is Vibe's whole idea. A riff is one bar you can
// see all of at once; the ARRANGE screen lays riffs out along tracks. You
// never scroll a long timeline, which is how this fitted on a phone with a
// keypad and is why it still fits on a phone with a thumb.
//
// The arrange screen carries Vibe's own vocabulary: copy, cut, paste as a
// repeat (the same riff, so edits show everywhere) or paste as new (a copy
// that goes its own way), plus the loop markers.
//
// It pays like the rest of the game: a session costs hours, the fee follows
// what is actually in the beat, and a beat sells once.

const Studio = {

    SESSION_HOURS: 3,
    MIN_TRACKS: 2,
    MIN_NOTES: 10,
    BARS: 8,                 // how far the arrangement runs

    song: null,
    synth: null,
    view: 'arrange',         // 'arrange' or 'edit'
    track: 0,                // selected track
    bar: 0,                  // selected bar, on the arrange screen
    editing: null,           // the riff open in the note editor
    clip: null,              // { riff } held by copy or cut
    _timer: null,
    _step: -1,
    _playBar: -1,
    _sold: null,

    PITCHES: [72, 71, 69, 67, 65, 64, 62, 60],
    DRUM_ROWS: [49, 46, 42, 39, 38, 37, 36, 35],
    DRUM_NAMES: { 35: 'Kick', 36: 'Kick2', 37: 'Rim', 38: 'Snare',
                  39: 'Clap', 42: 'HiHat', 46: 'Open', 49: 'Crash' },

    // ── Opening and closing ───────────────────────────────────────────────

    open() {
        if (typeof Player !== 'undefined' && Player.exists && !Player.exists()) {
            if (typeof openCreate === 'function') openCreate();
            return;
        }
        const host = document.getElementById('studio');
        if (!host) return;

        if (!this.song) this.restore() || this.fresh();
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
        this.keep();                 // never lose what is on the bench
        window.removeEventListener('resize', this._resize);
        const host = document.getElementById('studio');
        if (host) { host.classList.remove('on'); host.innerHTML = ''; }
        document.body.classList.remove('in-place');
        if (typeof refreshLifeHud === 'function') refreshLifeHud();
        if (typeof CityMap !== 'undefined') CityMap.build();
    },

    /// A new beat: two tracks, one riff each, placed at the first bar.
    fresh() {
        this.song = new Song('Beat');
        this.song.bars = 1;
        this.song.loopStart = 0;
        this.song.loopEnd = 1;
        this.track = 0; this.bar = 0;
        this.view = 'arrange';
        this.editing = null;
        this.clip = null;
        const lead = this.newTrackOn(0, 'Lead');
        const drums = this.newTrackOn(9, 'Drums');
        this.place(lead, 0, this.song.addRiff(new Riff('Lead 1', 1)));
        this.place(drums, 0, this.song.addRiff(new Riff('Beat 1', 1)));
    },

    newTrackOn(channel, name) {
        const t = this.song.addTrack(new Track(name, channel));
        t.program = 0;
        return t;
    },

    place(track, bar, riff) {
        const had = track.placements.find(p => p.at === bar);
        if (had) had.riff = riff;
        else track.add(new Placement(riff, bar));
        return riff;
    },

    riffAt(track, bar) {
        const p = track.placements.find(x => x.at === bar);
        return p ? p.riff : null;
    },

    // ── Chrome ────────────────────────────────────────────────────────────

    chrome() {
        return '<div class="st-top">' +
                '<span class="st-name">&#9835; Naijabeats</span>' +
                '<button class="pl-out" onclick="Studio.close()">&#10005; Leave</button>' +
            '</div>' +
            '<div class="st-bar" id="st-bar"></div>' +
            '<canvas id="st-grid"></canvas>' +
            '<div class="st-act" id="st-act"></div>';
    },

    bind() {
        const cv = document.getElementById('st-grid');
        cv.addEventListener('pointerdown', e => this.tap(e));
        this._resize = () => this.layout();
        window.addEventListener('resize', this._resize);
        this.toolbar();
        this.refreshAct();
    },

    /// The toolbar changes with the screen, because the two screens do
    /// genuinely different jobs.
    toolbar() {
        const bar = document.getElementById('st-bar');
        if (!bar) return;
        const b = (label, fn, title, cls) =>
            `<button class="${cls || ''}" title="${title || label}" onclick="Studio.${fn}">${label}</button>`;

        if (this.view === 'arrange') {
            const here = this.riffAt(this.song.tracks[this.track], this.bar);
            bar.innerHTML =
                b(this._timer ? 'Stop' : 'Play', 'toggle()', 'Play', 'st-go' + (this._timer ? ' on' : '')) +
                b('Edit', 'edit()', 'Open this riff', here ? 'st-hot' : '') +
                b('New', 'newRiff()', 'New riff here') +
                b('Copy', 'copy()', 'Copy this riff') +
                b('Cut', 'cut()', 'Cut this riff') +
                b('Repeat', 'paste(false)', 'Paste the same riff — edits show everywhere') +
                b('As new', 'paste(true)', 'Paste an independent copy') +
                b('Clear', 'clear()', 'Remove the riff here') +
                b('&#9679;&rarr;', 'loopFrom()', 'Loop starts here') +
                b('&rarr;&#9679;', 'loopTo()', 'Loop ends here') +
                b('+ Track', 'newTrack()', 'Add a track') +
                b('&minus;', 'dropTrack()', 'Remove this track') +
                b('Save', 'saveSong()', 'Save this beat') +
                b('Beats', 'beats()', 'Your saved beats');
        } else {
            const t = this.song.tracks[this.track];
            let inst = '<select onchange="Studio.setInst(+this.value)"' +
                (t.channel === 9 ? ' disabled' : '') + '>';
            GM.forEach((n, i) =>
                inst += `<option value="${i}"${i === t.program ? ' selected' : ''}>${n}</option>`);
            inst += '</select>';
            bar.innerHTML =
                b(this._timer ? 'Stop' : 'Play', 'toggle()', 'Play', 'st-go' + (this._timer ? ' on' : '')) +
                b('&lsaquo; Arrange', 'back()', 'Back to the arrangement', 'st-hot') +
                inst +
                b('Clear', 'clearRiff()', 'Empty this riff');
        }
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
        if (!w || !h) return;
        cv.width = w * dpr; cv.height = h * dpr;
        cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);

        if (this.view === 'arrange') {
            const rows = Math.max(this.song.tracks.length, 1);
            this.cell = { x0: 58, y0: 18,
                          w: (w - 64) / this.BARS,
                          h: Math.min(54, (h - 26) / rows) };
        } else {
            this.cell = { x0: 52, y0: 4,
                          w: (w - 58) / this.song.stepsPerRiff,
                          h: (h - 8) / 8 };
        }
        this.draw();
    },

    draw() {
        if (this.view === 'beats') return;          // that screen is HTML
        this.view === 'arrange' ? this.drawArrange() : this.drawEdit();
    },

    // ── The arrangement ───────────────────────────────────────────────────

    drawArrange() {
        const cv = document.getElementById('st-grid');
        if (!cv || !this.cell) return;
        const cx = cv.getContext('2d'), c = this.cell;
        cx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
        cx.textBaseline = 'middle';

        // Bar numbers, and the loop span across the top.
        cx.font = '9px monospace';
        for (let bar = 0; bar < this.BARS; bar++) {
            const x = c.x0 + bar * c.w;
            const inLoop = bar >= this.song.loopStart && bar <= this.song.loopEnd;
            cx.fillStyle = inLoop ? '#ffc83d' : '#4a5160';
            cx.fillText(String(bar + 1), x + 3, 8);
            if (inLoop) cx.fillRect(x + 1, 13, c.w - 2, 2);
        }

        this.song.tracks.forEach((t, ti) => {
            const y = c.y0 + ti * c.h;
            cx.font = '10px monospace';
            cx.fillStyle = ti === this.track ? '#e8edf6' : '#6a7183';
            cx.fillText(t.name.slice(0, 7), 5, y + c.h / 2 - 5);
            cx.fillStyle = '#4a5160';
            cx.font = '8px monospace';
            cx.fillText('ch' + (t.channel + 1), 5, y + c.h / 2 + 7);

            for (let bar = 0; bar < this.BARS; bar++) {
                const x = c.x0 + bar * c.w;
                const riff = this.riffAt(t, bar);
                const sel = ti === this.track && bar === this.bar;

                cx.fillStyle = bar === this._playBar ? '#2e2e40' : '#14141c';
                cx.fillRect(x + 1, y + 1, c.w - 2, c.h - 2);

                if (riff) {
                    const notes = riff.events.filter(e => e.isNote);
                    cx.fillStyle = t.channel === 9 ? '#6a5316' : '#1f5c2c';
                    cx.fillRect(x + 1, y + 1, c.w - 2, c.h - 2);
                    // A little picture of what is in the riff.
                    const rows = this.rows(t);
                    for (const e of notes) {
                        const r = rows.indexOf(e.data[0]);
                        if (r < 0) continue;
                        const nx = x + 3 + (e.tick / riff.steps) * (c.w - 6);
                        const ny = y + 4 + (r / 8) * (c.h - 8);
                        cx.fillStyle = t.channel === 9 ? '#ffc83d' : '#4cd964';
                        cx.fillRect(nx, ny, Math.max(1.5, (c.w - 6) / riff.steps - 0.5), 2);
                    }
                    cx.fillStyle = '#9fb0a2';
                    cx.font = '8px monospace';
                    cx.fillText(riff.name.slice(0, 8), x + 4, y + c.h - 7);
                }

                if (sel) {
                    cx.strokeStyle = '#ff7a45'; cx.lineWidth = 2;
                    cx.strokeRect(x + 2, y + 2, c.w - 4, c.h - 4);
                }
            }
        });
    },

    // ── Inside a riff ─────────────────────────────────────────────────────

    drawEdit() {
        const cv = document.getElementById('st-grid');
        if (!cv || !this.cell || !this.editing) return;
        const cx = cv.getContext('2d'), c = this.cell;
        const t = this.song.tracks[this.track];
        const rows = this.rows(t), steps = this.editing.steps;
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
        for (const e of this.editing.events) {
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

    // ── Touch ─────────────────────────────────────────────────────────────

    tap(ev) {
        const cv = document.getElementById('st-grid');
        const r = cv.getBoundingClientRect(), c = this.cell;
        const px = ev.clientX - r.left, py = ev.clientY - r.top;

        if (this.view === 'arrange') {
            const bar = Math.floor((px - c.x0) / c.w);
            const ti = Math.floor((py - c.y0) / c.h);
            if (bar < 0 || bar >= this.BARS || ti < 0 || ti >= this.song.tracks.length) return;
            // A second tap on the same cell opens it, which saves a trip to
            // the toolbar for the thing you most often want.
            const again = ti === this.track && bar === this.bar;
            this.track = ti; this.bar = bar;
            if (again && this.riffAt(this.song.tracks[ti], bar)) { this.edit(); return; }
            this.toolbar(); this.draw(); this.refreshAct();
            return;
        }

        const s = Math.floor((px - c.x0) / c.w);
        const row = Math.floor((py - c.y0) / c.h);
        if (s < 0 || s >= this.editing.steps || row < 0 || row > 7) return;
        const t = this.song.tracks[this.track];
        const pitch = this.rows(t)[row];
        const found = this.editing.events.find(e => e.isNote && e.tick === s && e.data[0] === pitch);
        if (found) this.editing.remove(found);
        else {
            this.editing.add(Event.note(pitch, 100, t.channel === 9 ? 1 : 2, s));
            this.preview(t.channel, pitch);
        }
        this.draw();
        this.refreshAct();
        this.keep();
    },

    preview(channel, pitch) {
        if (!this.synth) return;
        if (this.synth.ctx) this.synth.hit(channel, pitch, 100, 0.25);
        else this.synth.start().then(() => this.synth.hit(channel, pitch, 100, 0.25));
    },

    // ── Arrangement commands, in Vibe's own words ─────────────────────────

    edit() {
        const riff = this.riffAt(this.song.tracks[this.track], this.bar);
        if (!riff) { this.newRiff(); return; }
        this.editing = riff;
        this.view = 'edit';
        this.toolbar(); this.layout(); this.refreshAct();
    },

    back() {
        this.view = 'arrange';
        this.editing = null;
        const grid = document.getElementById('st-grid');
        if (grid) grid.style.display = '';
        this.toolbar(); this.layout(); this.refreshAct();
    },

    newRiff() {
        const t = this.song.tracks[this.track];
        const riff = this.song.addRiff(new Riff(
            (t.channel === 9 ? 'Beat ' : 'Riff ') + (this.song.riffs.length + 1), 1));
        this.place(t, this.bar, riff);
        this.editing = riff;
        this.view = 'edit';
        this.toolbar(); this.layout(); this.refreshAct();
    },

    copy() {
        const riff = this.riffAt(this.song.tracks[this.track], this.bar);
        if (!riff) return;
        this.clip = riff;
        this.say('Copied ' + riff.name);
    },

    cut() {
        const t = this.song.tracks[this.track];
        const riff = this.riffAt(t, this.bar);
        if (!riff) return;
        this.clip = riff;
        this.clear(true);
        this.say('Cut ' + riff.name);
    },

    /// Repeat places the same riff, so editing it changes every repeat. As
    /// new places an independent copy. That distinction is the whole reason
    /// Vibe's paste has two commands.
    paste(asNew) {
        if (!this.clip) { this.say('Nothing copied yet'); return; }
        const t = this.song.tracks[this.track];
        const riff = asNew ? this.song.addRiff(Riff.copy(this.clip)) : this.clip;
        this.place(t, this.bar, riff);
        this.toolbar(); this.draw(); this.refreshAct();
        this.say(asNew ? 'Pasted a copy' : 'Repeated ' + riff.name);
    },

    clear(quiet) {
        const t = this.song.tracks[this.track];
        const i = t.placements.findIndex(p => p.at === this.bar);
        if (i === -1) return;
        t.placements.splice(i, 1);
        this.tidy();
        this.toolbar(); this.draw(); this.refreshAct();
        if (!quiet) this.say('Cleared bar ' + (this.bar + 1));
    },

    clearRiff() {
        if (!this.editing) return;
        this.editing.events = this.editing.events.filter(e => !e.isNote);
        this.draw(); this.refreshAct();
    },

    /// A riff nothing points at any more is dead weight in the file. The
    /// clipboard counts as pointing at it.
    tidy() {
        const live = new Set();
        for (const t of this.song.tracks) for (const p of t.placements) live.add(p.riff);
        if (this.clip) live.add(this.clip);
        this.song.riffs = this.song.riffs.filter(r => live.has(r));
    },

    loopFrom() {
        this.song.loopStart = this.bar;
        if (this.song.loopEnd < this.bar) this.song.loopEnd = this.bar;
        this.draw(); this.say('Loop starts at bar ' + (this.bar + 1));
    },

    loopTo() {
        this.song.loopEnd = this.bar;
        if (this.song.loopStart > this.bar) this.song.loopStart = this.bar;
        this.draw(); this.say('Loop ends at bar ' + (this.bar + 1));
    },

    newTrack() {
        const wantDrums = this.song.tracks.every(t => t.channel !== 9);
        let ch = this.song.freeChannel(wantDrums);
        if (ch === -1) ch = this.song.freeChannel(false);
        if (ch === -1) { this.say('No channels left'); return; }
        const t = this.newTrackOn(ch, ch === 9 ? 'Drums' : 'Track ' + (this.song.tracks.length + 1));
        this.synth.setProgram(t.channel, t.program);
        this.track = this.song.tracks.length - 1;
        this.toolbar(); this.layout(); this.refreshAct();
    },

    dropTrack() {
        if (this.song.tracks.length <= 1) return;
        this.song.tracks.splice(this.track, 1);
        this.tidy();
        if (this.track >= this.song.tracks.length) this.track = this.song.tracks.length - 1;
        this.toolbar(); this.layout(); this.refreshAct();
    },

    setInst(p) {
        const t = this.song.tracks[this.track];
        t.program = p;
        this.synth.setProgram(t.channel, p);
    },

    // ── Playing ───────────────────────────────────────────────────────────

    toggle() { this._timer ? this.stop() : this.play(); },

    /// On the arrange screen this plays the loop across bars; inside a riff
    /// it loops that one bar, which is what you want while editing it.
    async play() {
        await this.synth.start();
        const editing = this.view === 'edit' && this.editing;
        const from = editing ? 0 : this.song.loopStart;
        const to = editing ? 0 : this.song.loopEnd;
        const steps = this.song.stepsPerRiff;
        let bar = from, step = 0;

        const beat = () => {
            this._step = step;
            this._playBar = editing ? -1 : bar;
            if (editing) {
                const t = this.song.tracks[this.track];
                for (const e of this.editing.events)
                    if (e.isNote && e.tick === step)
                        this.synth.hit(t.channel, e.data[0], e.data[1],
                                       Math.max(1, e.dur) * (15 / this.song.tempo));
            } else {
                for (const t of this.song.tracks) {
                    const riff = this.riffAt(t, bar);
                    if (!riff) continue;
                    for (const e of riff.events)
                        if (e.isNote && e.tick === step)
                            this.synth.hit(t.channel, e.data[0], e.data[1],
                                           Math.max(1, e.dur) * (15 / this.song.tempo));
                }
            }
            this.draw();
            step++;
            if (step >= steps) { step = 0; if (!editing) bar = bar >= to ? from : bar + 1; }
        };
        beat();
        this._timer = setInterval(beat, 15000 / this.song.tempo);
        this.toolbar();
    },

    stop() {
        if (this._timer) clearInterval(this._timer);
        this._timer = null;
        this._step = -1; this._playBar = -1;
        if (this.synth) this.synth.allOff();
        this.toolbar(); this.draw();
    },

    // ── Keeping beats ─────────────────────────────────────────────────────
    // A song is stored as its own .vbm bytes, base64'd — the same format the
    // 2010 app used, so anything saved here can be exported and opened by it.

    KEY: 'runningboy_vibe_songs',
    BENCH: 'runningboy_vibe_bench',

    _b64(bytes) {
        let s = '';
        // A chunk at a time: spreading a whole array into fromCharCode blows
        // the argument limit on anything but a tiny song.
        for (let i = 0; i < bytes.length; i += 0x8000)
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    },

    _bytes(b64) {
        const raw = atob(b64), out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    },

    songs() {
        try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
        catch (_) { return []; }
    },

    _writeSongs(list) {
        try { localStorage.setItem(this.KEY, JSON.stringify(list)); return true; }
        catch (_) { this.say('No room left to save'); return false; }
    },

    /// Stash whatever is on the bench, so leaving and coming back — or a
    /// reload — does not lose it.
    keep() {
        if (!this.song) return;
        try { localStorage.setItem(this.BENCH, this._b64(writeVbm(this.song))); } catch (_) {}
    },

    restore() {
        try {
            const b = localStorage.getItem(this.BENCH);
            if (!b) return false;
            this.song = readVbm(this._bytes(b));
            this.track = 0; this.bar = 0;
            this.view = 'arrange'; this.editing = null; this.clip = null;
            return true;
        } catch (_) { return false; }
    },

    saveSong() {
        const now = this.song;
        const name = (prompt('Name this beat', now.name === 'Beat' ? '' : now.name) || '').trim();
        if (!name) return;
        now.name = name.slice(0, 20);
        const list = this.songs();
        const at = list.findIndex(x => x.name === now.name);
        const row = { name: now.name, data: this._b64(writeVbm(now)), at: Date.now() };
        if (at !== -1) list[at] = row; else list.push(row);
        if (list.length > 24) list.shift();
        if (this._writeSongs(list)) { this.keep(); this.say('Saved "' + now.name + '"'); }
    },

    loadSong(i) {
        const row = this.songs()[i];
        if (!row) return;
        try {
            this.stop();
            this.song = readVbm(this._bytes(row.data));
            this.track = 0; this.bar = 0;
            this.editing = null; this.clip = null;
            for (const t of this.song.tracks) this.synth.setProgram(t.channel, t.program);
            this.keep();
            this.view = 'arrange';
            this.toolbar(); this.layout(); this.refreshAct();
            this.say('Opened "' + row.name + '"');
        } catch (_) { this.say('That beat will not open'); }
    },

    deleteSong(i) {
        const list = this.songs();
        if (!list[i]) return;
        const name = list[i].name;
        list.splice(i, 1);
        this._writeSongs(list);
        this.beats();
        this.say('Deleted "' + name + '"');
    },

    /// A beat you made is a real MIDI file, and you should be able to take it
    /// out of the game.
    exportMid() {
        const s = this.song;
        const from = s.loopStart * s.stepsPerRiff;
        const to = (s.loopEnd + 1) * s.stepsPerRiff - 1;
        const bytes = writeMid(s, from, to);
        try {
            const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = (s.name || 'beat').replace(/[^\w -]/g, '') + '.mid';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this.say('Exported ' + a.download);
        } catch (_) { this.say('Could not export'); }
    },

    /// The saved-beats screen. HTML rather than canvas, because it is a list.
    beats() {
        this.stop();
        this.view = 'beats';
        const list = this.songs();
        const bar = document.getElementById('st-bar');
        if (bar) bar.innerHTML =
            '<button class="st-hot" onclick="Studio.back()">&lsaquo; Back</button>' +
            '<button onclick="Studio.exportMid()">Export .mid</button>' +
            '<button onclick="Studio.newBeat()">New beat</button>';

        const act = document.getElementById('st-act');
        const grid = document.getElementById('st-grid');
        if (grid) grid.style.display = 'none';

        let html = '<div class="st-list">';
        if (!list.length) {
            html += '<div class="st-note">Nothing saved yet. Make something, ' +
                    'then press Save.</div>';
        } else {
            list.slice().reverse().forEach((row, k) => {
                const i = list.length - 1 - k;
                let note = '';
                try {
                    const sng = readVbm(this._bytes(row.data));
                    const bars = new Set();
                    let notes = 0;
                    for (const t of sng.tracks) for (const p of t.placements) {
                        bars.add(p.at);
                        notes += p.riff.events.filter(e => e.isNote).length;
                    }
                    note = sng.tracks.length + ' tracks · ' + bars.size + ' bars · ' +
                           notes + ' notes · ' + sng.tempo + ' bpm';
                } catch (_) { note = 'unreadable'; }
                html += '<div class="st-row">' +
                    '<div class="st-row-t"><b>' + row.name + '</b><span>' + note + '</span></div>' +
                    '<button onclick="Studio.loadSong(' + i + ')">Open</button>' +
                    '<button onclick="Studio.deleteSong(' + i + ')">&#10005;</button>' +
                    '</div>';
            });
        }
        html += '</div><div class="st-say"></div>';
        if (act) act.innerHTML = html;
    },

    newBeat() {
        this.stop();
        this.fresh();
        this.keep();
        const grid = document.getElementById('st-grid');
        if (grid) grid.style.display = '';
        this.toolbar(); this.layout(); this.refreshAct();
    },

    // ── Selling it ────────────────────────────────────────────────────────
    // The fee follows what is in the beat: layers, how much of the bar is
    // used, variety of sounds, and now how long the arrangement runs. One
    // note hammered sixteen times is not a song and does not pay like one.

    worth() {
        const s = this.song;
        let notes = 0, live = 0;
        const steps = new Set(), pitches = new Set(), bars = new Set();
        for (const t of s.tracks) {
            let any = false;
            for (const p of t.placements) {
                const ns = p.riff.events.filter(e => e.isNote);
                if (!ns.length) continue;
                any = true;
                bars.add(p.at);
                notes += ns.length;
                for (const e of ns) { steps.add(e.tick); pitches.add(t.channel + ':' + e.data[0]); }
            }
            if (any) live++;
        }
        return { notes, live, spread: steps.size, variety: pitches.size, bars: bars.size,
                 ok: live >= this.MIN_TRACKS && notes >= this.MIN_NOTES };
    },

    fee() {
        const w = this.worth();
        if (!w.ok) return 0;
        const base = 16
            + Math.min(w.live, 4) * 6
            + Math.min(w.spread, 16) * 1.3
            + Math.min(w.variety, 12) * 1.5
            + Math.min(w.bars, 8) * 2.2;        // a longer arrangement is worth more
        return Math.round(Math.min(base, 92));
    },

    fingerprint() {
        return this.song.tracks.map(t =>
            t.channel + '|' + t.placements.map(p =>
                p.at + ':' + p.riff.events.filter(e => e.isNote)
                    .map(e => e.tick + ',' + e.data[0]).sort().join(' ')
            ).sort().join(';')
        ).sort().join('//');
    },

    sold() {
        if (this._sold) return this._sold;
        try { this._sold = JSON.parse(localStorage.getItem('runningboy_beats')) || []; }
        catch (_) { this._sold = []; }
        return this._sold;
    },

    say(msg) {
        const act = document.getElementById('st-act');
        if (!act) return;
        const n = act.querySelector('.st-say');
        if (n) n.textContent = msg;
    },

    refreshAct() {
        const act = document.getElementById('st-act');
        if (!act) return;
        const w = this.worth();
        const hasPlayer = typeof Player !== 'undefined' && Player.exists && Player.exists();
        const paid = hasPlayer ? Player.wage(this.fee(), Player.cityId()) : this.fee();
        const already = this.sold().includes(this.fingerprint());

        let body;
        if (!w.ok) {
            const need = [];
            if (w.live < this.MIN_TRACKS) need.push(this.MIN_TRACKS + ' tracks with something on them');
            if (w.notes < this.MIN_NOTES) need.push(this.MIN_NOTES + ' notes');
            body = '<div class="st-note">Nobody is buying that yet. You need ' +
                need.join(' and ') + '. You have ' + w.live + ' and ' + w.notes + '.</div>';
        } else if (already) {
            body = '<div class="st-note">You already sold this one. Change it and ' +
                'they will listen again.</div>';
        } else {
            body = '<div class="st-note">' + w.live + ' tracks, ' + w.notes + ' notes, ' +
                w.bars + ' bars. Takes ' + this.SESSION_HOURS + ' hours to lay down.</div>' +
                '<button class="est-btn" onclick="Studio.sell()">Sell the beat ' +
                '&nbsp;·&nbsp; &#10022; ' + paid + '</button>';
        }
        act.innerHTML = body + '<div class="st-say"></div>';
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
        if (typeof flash === 'function') flash('They took the beat · +' + paid);
        this.refreshAct();
    },
};
