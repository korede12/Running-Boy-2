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
    _audio: false,            // the audio panel is open
    _clip: null,              // the clip the panel is working on
    _rec: false,              // a take is running
    _recMade: null,           // riffs the take created, so empty ones can go
    _recHits: 0,
    _beatAt: 0,               // when the current step started, for quantising
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
        Tape.ctx = this.synth ? this.synth.ctx : null;
        Mic.onstate = () => { this.refreshAct(); this.toolbar(); this.layout(); };
        Mic.onlevel = (lv, pk) => this.micMeter(lv, pk);
        Mic.onclip = take => this.micKeep(take);
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
        this._audio = false;
        Tape.hush();
        Mic.hush();                  // the browser shows a live mic, so let it go
        window.removeEventListener('resize', this._resize);
        window.removeEventListener('keydown', this._keys);
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
        Tape.clear();
        this._clip = null;
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
        this._keys = e => this.key(e);
        window.addEventListener('keydown', this._keys);

        // Drag a sample straight onto the bar you want it on. There is no
        // drag on a phone, so the panel also has a file button.
        const stop = e => { e.preventDefault(); e.stopPropagation(); };
        cv.addEventListener('dragenter', e => { stop(e); this._dragOn(e); });
        cv.addEventListener('dragover', e => { stop(e); this._dragOn(e); });
        cv.addEventListener('dragleave', e => { stop(e); this._drag = null; this.draw(); });
        cv.addEventListener('drop', e => { stop(e); this.dropFiles(e); });
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

        // Vibe's own limit is 260; below about 40 nothing is playable, so the
        // slider covers the useful part of that range.
        const tempo =
            '<span class="st-bpm" title="Beats per minute">' +
                '<input type="range" min="' + this.BPM_MIN + '" max="' + this.BPM_MAX + '" ' +
                    'value="' + this.song.tempo + '" ' +
                    'oninput="Studio.setTempo(+this.value)">' +
                '<b id="st-bpm">' + this.song.tempo + '</b>' +
            '</span>';

        // Undo sits on both screens and in the same place on both, because
        // the one thing worse than no undo is an undo you have to go looking
        // for.
        const history =
            b('&#8630;', 'undo()', 'Undo', this.canUndo() ? '' : 'st-dim') +
            b('&#8631;', 'redo()', 'Redo', this.canRedo() ? '' : 'st-dim');

        if (this.view === 'arrange') {
            const here = this.riffAt(this.song.tracks[this.track], this.bar);
            bar.innerHTML =
                history +
                b(this._timer ? 'Stop' : 'Play', 'toggle()', 'Play', 'st-go' + (this._timer ? ' on' : '')) +
                b(this._rec ? '&#9632; Done' : '&#9679; Rec', 'record()',
                  'Play the pads into the loop', 'st-rec' + (this._rec ? ' on' : '')) +
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
                b('Beats', 'beats()', 'Your saved beats') +
                b(Mic.rolling() ? '&#9632; Audio' : '&#127908; Audio', 'audioPanel()',
                  'Microphone and samples',
                  this._audio ? 'st-hot' : (Mic.rolling() ? 'st-rec on' : '')) +
                tempo;
        } else {
            const t = this.song.tracks[this.track];
            let inst = '<select onchange="Studio.setInst(+this.value)"' +
                (t.channel === 9 ? ' disabled' : '') + '>';
            GM.forEach((n, i) =>
                inst += `<option value="${i}"${i === t.program ? ' selected' : ''}>${n}</option>`);
            inst += '</select>';
            bar.innerHTML =
                b(this._timer ? 'Stop' : 'Play', 'toggle()', 'Play', 'st-go' + (this._timer ? ' on' : '')) +
                b(this._rec ? '&#9632; Done' : '&#9679; Rec', 'record()',
                  'Play the pads into this riff', 'st-rec' + (this._rec ? ' on' : '')) +
                history +
                b('&lsaquo; Arrange', 'back()', 'Back to the arrangement', 'st-hot') +
                inst +
                b('Clear', 'clearRiff()', 'Empty this riff') +
                tempo;
        }
    },

    BPM_MIN: 40,
    BPM_MAX: 260,

    /// Change the tempo. If it is playing, the clock has to be re-timed —
    /// otherwise the slider moves and nothing happens until you stop.
    setTempo(bpm) {
        bpm = Math.max(this.BPM_MIN, Math.min(this.BPM_MAX, Math.round(bpm)));
        if (bpm === this.song.tempo) return;
        this.mark('Tempo', 'tempo');
        this.song.tempo = bpm;
        const read = document.getElementById('st-bpm');
        if (read) read.textContent = String(bpm);
        // Nothing to restart: the clock reads the tempo on every step, so a
        // change lands on the next one and the loop keeps its place.
        this.keep();
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
            const rows = Math.max(this.song.tracks.length + this.audioRows(), 1);
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

    /// Audio gets a row per lane, plus an empty one to drop onto while the
    /// panel is open and you are about to put something there.
    audioRows() {
        const used = Tape.lanes();
        const spare = (this._audio || Mic.rolling()) && used < Tape.MAX_LANES ? 1 : 0;
        return used + spare;
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

        for (let lane = 0; lane < this.audioRows(); lane++) this.drawLane(cx, c, lane);
    },

    /// One audio lane. Clips are drawn as what they are — a block across the
    /// bars they cover, with their own waveform — and they sit in the
    /// arrangement because that is where they play from, even though the
    /// audio itself lives outside the .vbm.
    drawLane(cx, c, lane) {
        const y = c.y0 + (this.song.tracks.length + lane) * c.h;
        const clips = Tape.inLane(lane);
        const arming = Mic.rolling() && lane === Tape.lanes();

        cx.font = '10px monospace';
        cx.fillStyle = arming ? '#e8384f' : (clips.length ? '#e8edf6' : '#6a7183');
        cx.fillText(lane === 0 ? 'Audio' : 'Aud ' + (lane + 1), 5, y + c.h / 2 - 5);
        cx.fillStyle = '#4a5160';
        cx.font = '8px monospace';
        cx.fillText(arming ? 'rec' : (clips.length ? clips.length + ' clip' + (clips.length > 1 ? 's' : '') : 'drop here'),
                    5, y + c.h / 2 + 7);

        for (let bar = 0; bar < this.BARS; bar++) {
            const x = c.x0 + bar * c.w;
            cx.fillStyle = bar === this._playBar ? '#2e2e40' : '#14141c';
            cx.fillRect(x + 1, y + 1, c.w - 2, c.h - 2);
        }

        // Where the microphone is about to put its take.
        if (arming) {
            const from = this.song.loopStart;
            const bars = this.song.loopEnd - from + 1;
            cx.fillStyle = '#3a1620';
            cx.fillRect(c.x0 + from * c.w + 1, y + 1, c.w * bars - 2, c.h - 2);
            const w = (c.w * bars - 4) * Math.min(1, Mic.level);
            cx.fillStyle = '#e8384f';
            cx.fillRect(c.x0 + from * c.w + 2, y + c.h / 2 - 1, Math.max(1, w), 2);
        }

        for (const clip of clips) {
            const x0 = c.x0 + clip.at * c.w;
            const span = c.w * clip.bars;
            const sel = clip === this._clip;
            cx.fillStyle = !clip.on ? '#1c1c24' : (clip.kind === 'mic' ? '#2a1c3c' : '#15303a');
            cx.fillRect(x0 + 1, y + 1, span - 2, c.h - 2);

            const mid = y + c.h / 2;
            const half = (c.h - 12) / 2;
            cx.fillStyle = !clip.on ? '#4a5160' : (clip.kind === 'mic' ? '#c9a6ff' : '#4cc9d9');
            if (clip.peaks && clip.peaks.length) {
                const inner = span - 4;
                for (let i = 0; i < clip.peaks.length; i++) {
                    const h = Math.max(0.6, clip.peaks[i] * half);
                    cx.fillRect(x0 + 2 + (i / clip.peaks.length) * inner, mid - h,
                                Math.max(0.8, inner / clip.peaks.length - 0.4), h * 2);
                }
            } else {
                cx.fillRect(x0 + 2, mid - 1, span - 4, 2);
            }

            cx.font = '8px monospace';
            cx.fillStyle = clip.on ? '#cfe6ea' : '#5b6372';
            cx.fillText(clip.name.slice(0, Math.max(3, Math.floor(span / 5))), x0 + 4, y + c.h - 7);

            if (sel) {
                cx.strokeStyle = '#ff7a45'; cx.lineWidth = 2;
                cx.strokeRect(x0 + 2, y + 2, span - 4, c.h - 4);
            }
        }
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
            if (bar < 0 || bar >= this.BARS || ti < 0) return;
            // Below the tracks are the audio lanes: tapping a clip selects it
            // and opens the panel on it, tapping empty space offers a drop.
            if (ti >= this.song.tracks.length) {
                const lane = ti - this.song.tracks.length;
                if (lane >= this.audioRows()) return;
                this._clip = Tape.at(lane, bar);
                this._audio = true;
                this.refreshAct(); this.toolbar(); this.draw();
                return;
            }
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
        this.mark(found ? 'Note off' : 'Note on');
        if (found) this.editing.remove(found);
        else {
            this.editing.add(Event.note(pitch, 100, t.channel === 9 ? 1 : 2, s));
            this.preview(t.channel, pitch);
        }
        this.draw();
        this.refreshAct();
        this.keep();
    },

    /// Which bar the pointer is over, so a drop lands where it looks like it
    /// will land.
    barAt(ev) {
        const cv = document.getElementById('st-grid');
        if (!cv || !this.cell) return 0;
        const r = cv.getBoundingClientRect();
        const bar = Math.floor((ev.clientX - r.left - this.cell.x0) / this.cell.w);
        return Math.max(0, Math.min(this.BARS - 1, bar));
    },

    _dragOn(ev) {
        if (this.view !== 'arrange') return;
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
        this._drag = this.barAt(ev);
    },

    async dropFiles(ev) {
        this._drag = null;
        const files = ev.dataTransfer && ev.dataTransfer.files;
        if (!files || !files.length) return;
        if (this.view !== 'arrange') { this.back(); }
        await this.addSamples(files, this.barAt(ev));
    },

    /// Bring samples in — dropped, or chosen from the panel. Each one covers
    /// whole bars from where it landed, so nothing ends mid-bar by accident.
    async addSamples(files, at) {
        await this.synth.start();
        Tape.ctx = this.synth.ctx;
        this.mark('Add sample');
        this._audio = true;
        let got = 0, bar = at || 0;
        for (const f of Array.from(files).slice(0, 6)) {
            const spb = this.song.stepsPerRiff * (15 / this.song.tempo);
            const clip = await Tape.take(f, bar, spb);
            if (!clip) continue;
            this._clip = clip;
            bar = Math.min(this.BARS - 1, clip.at + clip.bars);
            got++;
        }
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct();
        this.say(got ? 'Added ' + got + (got === 1 ? ' sample' : ' samples')
                     : (Tape.error || 'Nothing to add'));
    },

    pickSamples() {
        // The input is made on demand and thrown away: a file input that
        // lives in the page remembers its last pick and will not re-fire for
        // the same file twice.
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'audio/*';
        inp.multiple = true;
        inp.onchange = () => {
            if (inp.files && inp.files.length)
                this.addSamples(inp.files, this._clip ? this._clip.at : this.bar);
        };
        inp.click();
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
        this.mark('New riff');
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
        this.mark('Cut');
        this.clip = riff;
        this.clear(true);
        this.say('Cut ' + riff.name);
    },

    /// Repeat places the same riff, so editing it changes every repeat. As
    /// new places an independent copy. That distinction is the whole reason
    /// Vibe's paste has two commands.
    paste(asNew) {
        if (!this.clip) { this.say('Nothing copied yet'); return; }
        this.mark(asNew ? 'Paste a copy' : 'Repeat');
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
        // Cut has already marked — one command, one step of history.
        if (!quiet) this.mark('Clear bar');
        t.placements.splice(i, 1);
        this.tidy();
        this.toolbar(); this.draw(); this.refreshAct();
        if (!quiet) this.say('Cleared bar ' + (this.bar + 1));
    },

    clearRiff() {
        if (!this.editing) return;
        this.mark('Clear riff');
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
        this.mark('Loop start', 'loop');
        this.song.loopStart = this.bar;
        if (this.song.loopEnd < this.bar) this.song.loopEnd = this.bar;
        this.draw(); this.say('Loop starts at bar ' + (this.bar + 1));
    },

    loopTo() {
        this.mark('Loop end', 'loop');
        this.song.loopEnd = this.bar;
        if (this.song.loopStart > this.bar) this.song.loopStart = this.bar;
        this.draw(); this.say('Loop ends at bar ' + (this.bar + 1));
    },

    newTrack() {
        const wantDrums = this.song.tracks.every(t => t.channel !== 9);
        let ch = this.song.freeChannel(wantDrums);
        if (ch === -1) ch = this.song.freeChannel(false);
        if (ch === -1) { this.say('No channels left'); return; }
        this.mark('New track');
        const t = this.newTrackOn(ch, ch === 9 ? 'Drums' : 'Track ' + (this.song.tracks.length + 1));
        this.synth.setProgram(t.channel, t.program);
        this.track = this.song.tracks.length - 1;
        this.toolbar(); this.layout(); this.refreshAct();
    },

    dropTrack() {
        if (this.song.tracks.length <= 1) return;
        this.mark('Remove track');
        this.song.tracks.splice(this.track, 1);
        this.tidy();
        if (this.track >= this.song.tracks.length) this.track = this.song.tracks.length - 1;
        this.toolbar(); this.layout(); this.refreshAct();
    },

    setInst(p) {
        this.mark('Instrument', 'inst');
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
        Tape.ctx = this.synth.ctx;
        await Tape.ready(this.synth.ctx);
        const editing = this.view === 'edit' && this.editing;
        const from = editing ? 0 : this.song.loopStart;
        const to = editing ? 0 : this.song.loopEnd;
        const steps = this.song.stepsPerRiff;
        let bar = from, step = 0;

        const beat = () => {
            this._step = step;
            this._beatAt = this._now();
            // A bar line: start any clip that begins here, and tell the
            // microphone when the loop came round. That is all the timing
            // either of them gets, and all either of them needs.
            if (!editing && step === 0) {
                const now = this.synth.ctx.currentTime;
                const spb = steps * (15 / this.song.tempo);
                if (bar === from) Mic.passStart(now);
                if (!Mic.rolling()) Tape.barStart(bar, now, spb);
            }
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
        // Absolute scheduling: each step aims at a time, not at a delay, so
        // the clock neither drifts nor needs rebuilding when the tempo moves.
        let next = this._now();
        const tick = () => {
            beat();
            next += 15000 / this.song.tempo;
            this._timer = setTimeout(tick, Math.max(0, next - this._now()));
        };
        if (this._timer) clearTimeout(this._timer);     // never two clocks
        tick();
        this.toolbar();
    },

    /// Kill the clock and leave everything else alone. Changing tempo in the
    /// middle of a take has to re-time the loop without throwing the take
    /// away, so that path needs this rather than stop().
    _halt() {
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
        this._step = -1; this._playBar = -1;
        if (this.synth) this.synth.allOff();
        Tape.hush();
        if (Mic.rolling()) Mic.finish();
    },

    stop() {
        const take = this._rec;
        this._rec = false;
        this._halt();
        if (take) this.endTake();
        this.toolbar(); this.draw();
    },

    // ── Recording ─────────────────────────────────────────────────────────
    // The loop runs, you hit the pads, and each hit snaps to the nearest
    // step of the bar that was passing. Hits go into the riff already on
    // that bar, so a take layers onto what is there instead of replacing it
    // — which is how you build a part up over several passes.

    _now() {
        return typeof performance !== 'undefined' ? performance.now() : Date.now();
    },

    async record() {
        if (this._rec) { this.stop(); return; }

        this.mark('Record');
        // Recording writes into whatever is under the playhead, so every bar
        // it will pass over needs a riff waiting there. Ones that stay empty
        // are swept up when the take ends.
        const made = [];
        if (this.view === 'arrange') {
            const t = this.song.tracks[this.track];
            for (let bar = this.song.loopStart; bar <= this.song.loopEnd; bar++) {
                if (this.riffAt(t, bar)) continue;
                const riff = this.song.addRiff(new Riff(
                    (t.channel === 9 ? 'Beat ' : 'Riff ') + (this.song.riffs.length + 1), 1));
                this.place(t, bar, riff);
                made.push(riff);
            }
        } else if (!this.editing) {
            return;
        }

        this._halt();                // a take starts at the top of the loop
        this._rec = true;
        this._recMade = made;
        this._recHits = 0;
        await this.play();
        this.refreshAct();
    },

    /// Keep the hits, drop the bars you never played onto.
    endTake() {
        for (const r of (this._recMade || [])) {
            if (r.events.some(e => e.isNote)) continue;
            for (const t of this.song.tracks)
                t.placements = t.placements.filter(p => p.riff !== r);
        }
        this._recMade = null;
        this.tidy();
        this.keep();
        this.refreshAct();
        this.say(this._recHits
            ? 'Take kept \u00b7 ' + this._recHits + (this._recHits === 1 ? ' hit' : ' hits')
            : 'Nothing played, nothing kept');
    },

    /// Which step a hit belongs to. The step sounding right now is the one
    /// you were aiming at only if you were early; past halfway you meant the
    /// next one, which may be the first step of the next bar.
    _slot() {
        const ms = 15000 / this.song.tempo;
        let step = this._step + (this._now() - this._beatAt > ms / 2 ? 1 : 0);
        let bar = this.view === 'edit' ? -1 : this._playBar;
        if (step >= this.song.stepsPerRiff) {
            step = 0;
            if (bar >= 0) bar = bar >= this.song.loopEnd ? this.song.loopStart : bar + 1;
        }
        return { step, bar };
    },

    /// A pad hit: sound it now, write it where it belongs.
    pad(row) {
        const t = this.song.tracks[this.track];
        const pitch = this.rows(t)[row];
        this.preview(t.channel, pitch);
        if (!this._rec || this._step < 0) return;

        const at = this._slot();
        const riff = at.bar < 0 ? this.editing : this.riffAt(t, at.bar);
        if (!riff) return;
        // Two hits on the same pad in the same step is one note, not two.
        if (riff.events.some(e => e.isNote && e.tick === at.step && e.data[0] === pitch)) return;
        riff.add(Event.note(pitch, 100, t.channel === 9 ? 1 : 2, at.step));
        this._recHits++;
        this.draw();
    },

    /// Ctrl+Z and Ctrl+Shift+Z — or Ctrl+Y, for anyone whose hands learned
    /// it that way. Keys 1–8 are the pads while a take is running.
    key(ev) {
        if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
            const k = (ev.key || '').toLowerCase();
            if (k === 'z') { ev.preventDefault(); ev.shiftKey ? this.redo() : this.undo(); }
            else if (k === 'y') { ev.preventDefault(); this.redo(); }
            return;
        }
        if (!this._rec || ev.metaKey || ev.ctrlKey || ev.altKey) return;
        const n = '12345678'.indexOf(ev.key);
        if (n === -1) return;
        ev.preventDefault();
        this.pad(7 - n);
    },

    /// The pads, in place of the earnings panel while a take is running.
    /// Lowest sound on the left, so it reads like a keyboard and like a
    /// drum kit at the same time.
    recAct() {
        const act = document.getElementById('st-act');
        if (!act) return;
        const t = this.song.tracks[this.track];
        let pads = '';
        for (let r = 7; r >= 0; r--)
            pads += '<button class="st-pad" onpointerdown="Studio.pad(' + r + ')">' +
                this.label(t, r) + '<i>' + (8 - r) + '</i></button>';

        const where = this.view === 'edit'
            ? this.editing.name
            : t.name + ', bars ' + (this.song.loopStart + 1) + '&ndash;' + (this.song.loopEnd + 1);
        act.innerHTML =
            '<div class="st-note">Recording onto ' + where + '. Hit the pads in time, ' +
                'or keys 1&ndash;8 &mdash; each one lands on the nearest step. The loop keeps ' +
                'going, so you can build the part up over a few passes.</div>' +
            '<div class="st-pads">' + pads + '</div>' +
            '<div class="st-say"></div>';
    },

    // ── Audio: the microphone and the samples ─────────────────────────────
    // Which input, which sample, where it sits and how loud. Everything else
    // about a clip is decided by the bars it covers.

    async audioPanel() {
        if (this._audio) { this.audioClose(); return; }
        this._audio = true;
        this.refreshAct(); this.toolbar(); this.layout();
        if (!Mic.stream && !Mic.why()) {
            await this.synth.start();
            Tape.ctx = this.synth.ctx;
            await Mic.listen(this.synth.ctx, Mic.deviceId);
            this.refreshAct();
        }
    },

    audioClose() {
        this._audio = false;
        if (!Mic.rolling()) Mic.hush();
        this.refreshAct(); this.toolbar(); this.layout();
    },

    async micPick(id) {
        await this.synth.start();
        await Mic.pick(this.synth.ctx, id || null);
        this.refreshAct();
    },

    /// Record over the loop. The count-in is one pass, so this starts the
    /// transport if it is not already running and you come in the second
    /// time round.
    async micTake() {
        if (Mic.rolling()) { Mic.finish(); this.refreshAct(); return; }
        if (!Mic.stream) {
            await this.micPick(Mic.deviceId);
            if (!Mic.stream) return;
        }
        await this.synth.start();
        Tape.ctx = this.synth.ctx;
        const bars = Math.max(1, this.song.loopEnd - this.song.loopStart + 1);
        const spb = this.song.stepsPerRiff * (15 / this.song.tempo);
        if (Tape.room(this.song.loopStart, bars) === -1) {
            this.say('Every audio lane is busy over the loop. Clear one first.');
            return;
        }
        if (!Mic.arm(bars, spb, this.song.loopStart)) { this.refreshAct(); return; }
        if (!this._timer) await this.play();
        this.refreshAct(); this.toolbar(); this.layout();
    },

    /// A finished take, handed over by the microphone. From here it is just
    /// another clip.
    async micKeep(take) {
        this.mark('Mic take');
        const clip = Tape.clip({
            name: 'Take ' + (Tape.clips.filter(c => c.kind === 'mic').length + 1),
            kind: 'mic', type: take.type, bytes: take.bytes,
            lead: take.lead, seconds: take.seconds,
        });
        try { await Tape.decode(clip); } catch (_) {}

        // A recorder that was cut short hands back less than the pass it was
        // asked for. Keep what did arrive — a clip whose zero is past the end
        // of its own audio would sit there looking right and never play.
        if (clip.buffer) {
            const left = clip.buffer.duration - clip.lead;
            if (left <= 0.05) { this.say('That take came back empty'); return; }
            if (left < clip.seconds) {
                clip.seconds = left;
                clip.peaks = Tape.peaks(clip);
            }
        }

        if (!Tape.add(clip, take.at, take.bars)) { this.say(Tape.error); return; }
        this._clip = clip;
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct();
        this.say('Take kept');
    },

    clipDrop() {
        if (!this._clip) return;
        this.mark('Delete clip');
        Tape.remove(this._clip);
        this._clip = null;
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct();
        this.say('Clip deleted');
    },

    clipSet(field, value) {
        if (!this._clip) return;
        this.mark(field === 'on' ? (value ? 'Unmute' : 'Mute')
                : field === 'loop' ? 'Loop' : field === 'fit' ? 'Fit' : 'Clip');
        Tape.set(this._clip, field, value);
        this.keep();
        this.refreshAct(); this.draw();
    },

    clipMove(by) {
        if (!this._clip) return;
        this.mark('Move clip', 'move');
        const to = Math.max(0, Math.min(this.BARS - this._clip.bars, this._clip.at + by));
        if (Tape.place(this._clip, to, null)) { this.keep(); this.toolbar(); this.layout(); }
        this.refreshAct(); this.draw();
        if (Tape.error) this.say(Tape.error);
    },

    clipSpan(by) {
        if (!this._clip) return;
        this.mark('Resize clip', 'span');
        const want = Math.max(1, Math.min(this.BARS - this._clip.at, this._clip.bars + by));
        if (Tape.place(this._clip, null, want)) { this.keep(); this.toolbar(); this.layout(); }
        this.refreshAct(); this.draw();
    },

    async clipHear() {
        if (!this._clip) return;
        await this.synth.start();
        Tape.ctx = this.synth.ctx;
        await Tape.ready(this.synth.ctx);
        Tape.audition(this._clip, this.song.stepsPerRiff * (15 / this.song.tempo));
    },

    clipGain(v) {
        this.clipQuiet('gain', Math.max(0, Math.min(2, v)), 'clip-gain-n',
                       Math.round(v * 100) + '%');
    },

    /// Nudge, in milliseconds. Input lag is real and varies by device, and a
    /// sample can have silence at its head, so the only honest fix is a
    /// control that slides the clip until it sits on the beat.
    clipNudge(ms) {
        const v = Math.max(-500, Math.min(500, ms));
        this.clipQuiet('nudge', v, 'clip-nudge-n', (v > 0 ? '+' : '') + v + 'ms');
    },

    /// A slider fires on every pixel of movement, so it updates its own
    /// read-out and the clip, and leaves the panel alone.
    clipQuiet(field, value, id, text) {
        if (!this._clip) return;
        this.mark(field === 'gain' ? 'Clip level' : 'Clip nudge', 'clip-' + field);
        Tape.set(this._clip, field, value);
        const n = document.getElementById(id);
        if (n) n.textContent = text;
        this.keep();
    },

    micMeter(level, peak) {
        const bar = document.getElementById('mic-lv');
        if (bar) bar.style.width = Math.round(level * 100) + '%';
        const hot = document.getElementById('mic-pk');
        if (hot) hot.className = peak > 0.98 ? 'mic-pk on' : 'mic-pk';
    },

    audioAct() {
        const act = document.getElementById('st-act');
        if (!act) return;
        const esc = t => String(t).replace(/[<>&"]/g, ch =>
            ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
        const why = Mic.why();
        const c = this._clip;
        let html = '';

        // The microphone half.
        if (why) {
            html += '<div class="st-note">' + why + ' Samples still work.</div>';
        } else {
            let opts = '';
            if (!Mic.devices.length) opts = '<option value="">Default input</option>';
            for (const d of Mic.devices)
                opts += '<option value="' + esc(d.id) + '"' +
                    (d.id === Mic.deviceId ? ' selected' : '') + '>' +
                    esc(d.label.slice(0, 34)) + '</option>';
            html +=
                '<div class="mic-row">' +
                    '<select class="mic-dev" title="Which input" ' +
                        'onchange="Studio.micPick(this.value)">' + opts + '</select>' +
                    '<span class="mic-meter"><i id="mic-lv"></i></span>' +
                    '<span class="mic-pk" id="mic-pk"></span>' +
                '</div>';
        }

        const state = Mic.state === 'rolling' ? 'Rolling &mdash; this pass is the take'
                    : Mic.state === 'armed'   ? 'Counting in &mdash; come in at the top'
                    : '';

        html +=
            '<div class="mic-row mic-btns">' +
                (why ? '' : '<button class="' + (Mic.rolling() ? 'st-rec on' : 'st-rec') +
                    '" onclick="Studio.micTake()">' +
                    (Mic.rolling() ? '&#9632; Stop' : '&#9679; Record') + '</button>') +
                '<button onclick="Studio.pickSamples()">+ Sample</button>' +
                '<button onclick="Studio.audioClose()">Done</button>' +
            '</div>';

        // The clip half.
        if (c) {
            html +=
                '<div class="clip-head"><b>' + esc(c.name) + '</b>' +
                    '<span>' + (Tape.KINDS[c.kind] || 'Clip') + ' &middot; ' +
                    Tape.label(c) + ' &middot; bar ' + (c.at + 1) + '</span></div>' +
                '<div class="mic-row mic-btns">' +
                    '<button onclick="Studio.clipMove(-1)" title="Earlier">&lsaquo; Bar</button>' +
                    '<button onclick="Studio.clipMove(1)" title="Later">Bar &rsaquo;</button>' +
                    '<button onclick="Studio.clipSpan(-1)" title="Cover fewer bars">&minus;</button>' +
                    '<button onclick="Studio.clipSpan(1)" title="Cover more bars">+</button>' +
                    '<button onclick="Studio.clipHear()">Hear</button>' +
                    '<button class="' + (c.loop ? 'st-hot' : '') +
                        '" onclick="Studio.clipSet(\'loop\', ' + (!c.loop) +
                        ')" title="Repeat it to fill its bars">Loop</button>' +
                    '<button class="' + (c.fit ? 'st-hot' : '') +
                        '" onclick="Studio.clipSet(\'fit\', ' + (!c.fit) +
                        ')" title="Squeeze it into its bars — this moves the pitch">Fit</button>' +
                    '<button onclick="Studio.clipSet(\'on\', ' + (!c.on) + ')">' +
                        (c.on ? 'Mute' : 'Unmute') + '</button>' +
                    '<button onclick="Studio.clipDrop()">&#10005;</button>' +
                '</div>' +
                '<div class="mic-row mic-dials">' +
                    '<label>Level <input type="range" min="0" max="2" step="0.05" value="' +
                        (c.gain == null ? 1 : c.gain) +
                        '" oninput="Studio.clipGain(+this.value)">' +
                        '<b id="clip-gain-n">' + Math.round((c.gain == null ? 1 : c.gain) * 100) +
                        '%</b></label>' +
                    '<label>Nudge <input type="range" min="-250" max="250" step="5" value="' +
                        (c.nudge || 0) + '" oninput="Studio.clipNudge(+this.value)">' +
                        '<b id="clip-nudge-n">' + ((c.nudge || 0) > 0 ? '+' : '') +
                        (c.nudge || 0) + 'ms</b></label>' +
                '</div>';
        }

        const hint = state || (c ? (c.fit ? 'Fit changes the speed, so it moves the pitch too.'
                                          : 'Tap a clip in the arrangement to work on it.')
                                 : 'Drag a loop onto a bar, or record over the loop. ' +
                                   'Tap a clip to move it, stretch it or mute it.');
        html += '<div class="st-note">' + hint +
            (Mic.error ? ' &middot; ' + esc(Mic.error) : '') +
            (Tape.error ? ' &middot; ' + esc(Tape.error) : '') +
            (Tape.tooBig ? ' &middot; ' + Tape.tooBig +
                ' clip(s) are too big to save with the beat — they play now but will not come back.' : '') +
            '</div>';

        act.innerHTML = html + '<div class="st-say"></div>';
    },

    // ── Undo ──────────────────────────────────────────────────────────────
    // Every command that changes the beat calls mark() first. That is the
    // whole contract: mark describes what is ABOUT to happen, and the
    // snapshot it takes is the state before it happened.

    DEPTH: 50,
    _undo: [],
    _redo: [],
    _markAt: 0,
    _markTag: '',

    _snap(label) {
        return {
            label,
            vbm: writeVbm(this.song),
            clips: Tape.clips.map(c => Object.assign({}, c)),
            where: {
                track: this.track, bar: this.bar, view: this.view,
                // Riffs come back from the file as new objects, so the open
                // one is found again by the id the format keeps for exactly
                // this sort of reason.
                riff: this.editing ? String(this.editing.id) : null,
                clip: this._clip ? this._clip.id : null,
            },
        };
    },

    /// Call before changing anything. A tag coalesces: a slider dragged
    /// across thirty pixels is one step of history, not thirty.
    mark(label, tag) {
        const now = this._now();
        if (tag && tag === this._markTag && now - this._markAt < 1200) {
            this._markAt = now;
            return;
        }
        this._undo.push(this._snap(label));
        if (this._undo.length > this.DEPTH) this._undo.shift();
        this._redo.length = 0;
        this._markTag = tag || '';
        this._markAt = now;
    },

    canUndo() { return this._undo.length > 0; },
    canRedo() { return this._redo.length > 0; },

    undo() {
        if (!this._undo.length) { this.say('Nothing to undo'); return; }
        const back = this._undo.pop();
        this._redo.push(this._snap(back.label));
        this._apply(back);
        this.say('Undid: ' + back.label.toLowerCase());
    },

    redo() {
        if (!this._redo.length) { this.say('Nothing to redo'); return; }
        const fwd = this._redo.pop();
        this._undo.push(this._snap(fwd.label));
        this._apply(fwd);
        this.say('Redid: ' + fwd.label.toLowerCase());
    },

    _apply(snap) {
        this.stop();
        this.song = readVbm(snap.vbm);
        Tape.restore(snap.clips);
        this._markTag = '';          // the next edit starts a fresh step

        this.editing = snap.where.riff
            ? this.song.riffs.find(r => String(r.id) === snap.where.riff) || null
            : null;
        this.view = this.editing ? snap.where.view : 'arrange';
        this.track = Math.max(0, Math.min(snap.where.track, this.song.tracks.length - 1));
        this.bar = Math.max(0, Math.min(snap.where.bar, this.BARS - 1));
        this._clip = snap.where.clip
            ? Tape.clips.find(c => c.id === snap.where.clip) || null
            : null;

        for (const t of this.song.tracks) this.synth.setProgram(t.channel, t.program);
        const grid = document.getElementById('st-grid');
        if (grid) grid.style.display = '';
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct();
    },

    // ── Keeping beats ─────────────────────────────────────────────────────
    // A song is stored as its own .vbm bytes, base64'd — the same format the
    // 2010 app used, so anything saved here can be exported and opened by it.

    KEY: 'runningboy_vibe_songs',
    BENCH: 'runningboy_vibe_bench',
    BENCH_AUDIO: 'runningboy_vibe_bench_audio',

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
        // Audio is big, so it is written separately and only when it has
        // actually changed — Tape caches its own serialisation.
        try {
            const aud = Tape.toJSON();
            if (aud) localStorage.setItem(this.BENCH_AUDIO, JSON.stringify(aud));
            else localStorage.removeItem(this.BENCH_AUDIO);
        } catch (_) {}
    },

    restore() {
        try {
            const b = localStorage.getItem(this.BENCH);
            if (!b) return false;
            this.song = readVbm(this._bytes(b));
            this.track = 0; this.bar = 0;
            this.view = 'arrange'; this.editing = null; this.clip = null;
            try { Tape.fromJSON(JSON.parse(localStorage.getItem(this.BENCH_AUDIO))); } catch (_) {}
            this._clip = null;
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
        const row = { name: now.name, data: this._b64(writeVbm(now)), at: Date.now(),
                      audio: Tape.toJSON() };
        if (at !== -1) list[at] = row; else list.push(row);
        if (list.length > 24) list.shift();
        if (this._writeSongs(list)) { this.keep(); this.say('Saved "' + now.name + '"'); }
    },

    loadSong(i) {
        const row = this.songs()[i];
        if (!row) return;
        try {
            this.mark('Open a beat');
            this.stop();
            this.song = readVbm(this._bytes(row.data));
            this.track = 0; this.bar = 0;
            this.editing = null; this.clip = null;
            Tape.fromJSON(row.audio);
            this._clip = null;
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
            this.say('Exported ' + a.download +
                (Tape.has() ? ' — notes only, a .mid cannot carry audio' : ''));
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
                           notes + ' notes · ' + sng.tempo + ' bpm' +
                           (row.audio ? ' · ' + row.audio.length + ' audio' : '');
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
        this.mark('New beat');
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
        // Audio counts as a layer. A drum loop, a bass loop and a vocal is a
        // track, and refusing to buy it because none of it is MIDI would be
        // the sequencer being precious about its own format.
        const audio = Tape.clips.filter(c => c.on).length;
        return { notes, live, audio, layers: live + audio,
                 spread: steps.size, variety: pitches.size, bars: bars.size,
                 ok: live + audio >= this.MIN_TRACKS &&
                     (notes >= this.MIN_NOTES || audio >= 2) };
    },

    fee() {
        const w = this.worth();
        if (!w.ok) return 0;
        const base = 16
            + Math.min(w.layers, 5) * 6
            + Math.min(w.spread, 16) * 1.3
            + Math.min(w.variety, 12) * 1.5
            + Math.min(w.bars, 8) * 2.2         // a longer arrangement is worth more
            + Math.min(w.audio, 3) * 7;         // real audio on it is worth paying for
        return Math.round(Math.min(base, 110));
    },

    fingerprint() {
        return this.song.tracks.map(t =>
            t.channel + '|' + t.placements.map(p =>
                p.at + ':' + p.riff.events.filter(e => e.isNote)
                    .map(e => e.tick + ',' + e.data[0]).sort().join(' ')
            ).sort().join(';')
        ).sort().join('//') + Tape.print();
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
        if (this._audio) { this.audioAct(); return; }
        if (this._rec) { this.recAct(); return; }
        const act = document.getElementById('st-act');
        if (!act) return;
        const w = this.worth();
        const hasPlayer = typeof Player !== 'undefined' && Player.exists && Player.exists();
        const paid = hasPlayer ? Player.wage(this.fee(), Player.cityId()) : this.fee();
        const already = this.sold().includes(this.fingerprint());

        let body;
        if (!w.ok) {
            const need = [];
            if (w.layers < this.MIN_TRACKS)
                need.push(this.MIN_TRACKS + ' layers with something on them');
            if (w.notes < this.MIN_NOTES && w.audio < 2)
                need.push(this.MIN_NOTES + ' notes, or two audio clips');
            body = '<div class="st-note">Nobody is buying that yet. You need ' +
                need.join(' and ') + '. You have ' + w.layers +
                (w.audio ? ' (' + w.audio + ' audio)' : '') + ' and ' + w.notes + '.</div>';
        } else if (already) {
            body = '<div class="st-note">You already sold this one. Change it and ' +
                'they will listen again.</div>';
        } else {
            body = '<div class="st-note">' + w.live + ' tracks, ' + w.notes + ' notes, ' +
                w.bars + ' bars' +
                (w.audio ? ', and ' + w.audio + ' audio clip' + (w.audio > 1 ? 's' : '') : '') +
                '. Takes ' + this.SESSION_HOURS + ' hours to lay down.</div>' +
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
