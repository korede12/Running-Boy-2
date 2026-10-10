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
    BARS: 32,                // how far the arrangement runs
    BAR_MIN: 38,             // a bar narrower than this cannot show a name
    BAR_MAX: 76,
    ROW_H: 54,               // what a row would like to be
    ROW_FLOOR: 30,           // and the least it may be before scrolling starts
    GUTTER: 9,               // where the scrollbars live

    bar0: 0,                 // leftmost bar on screen
    row0: 0,                 // topmost row on screen
    zoom: 1,                 // how big a cell is
    ZOOM_MIN: 0.6,
    ZOOM_MAX: 2.4,
    solo: null,              // rows being soloed, or null for none
    _follow: true,           // keep the playhead in view until told otherwise

    song: null,
    synth: null,
    view: 'arrange',         // 'arrange' or 'edit'
    track: 0,                // selected track
    bar: 0,                  // selected bar, on the arrange screen
    editing: null,           // the riff open in the note editor
    clip: null,              // { riff } held by copy or cut
    _timer: null,
    _audio: false,            // the audio panel is open
    _mixOpen: false,          // the mix panel is open
    _sel: [],                 // the selected clips, in the order picked
    _board: null,             // what Copy or Cut is holding
    _rec: false,              // a take is running
    _recMade: null,           // riffs the take created, so empty ones can go
    _recHits: 0,
    _beatAt: 0,               // when the current step started, for quantising
    _step: -1,
    _playBar: -1,
    _sold: null,

    // C1 to C8. Every semitone, highest at the top, the way a piano roll
    // has always been drawn.
    NOTE_LOW: 24,
    NOTE_HIGH: 108,
    BLACK: [1, 3, 6, 8, 10],
    ROW_MIN: 13,             // below this a row cannot be hit reliably
    ROW_BIG: 20,

    // Every sound the synth's kit actually makes, loud-and-high to
    // low-and-fundamental, which is the order a drum machine has always
    // laid them out.
    DRUM_ROWS: [51, 49, 46, 44, 42, 40, 39, 38, 37, 36, 35],

    // What General MIDI calls program 0 on channel 10, and what this one
    // actually is. There is one kit; offering a menu of eight would be a
    // nicer lie rather than a better answer.
    KIT_NAME: 'Standard Kit',

    /// What sort of grid a track wants. `at` is where the window opens, as
    /// a pitch; the full range stays reachable by scrolling, because a grid
    /// that refuses a note on the grounds that a bass should not play it is
    /// a grid that is wrong about your song.
    GRIDS: {
        drums:  { name: 'Kit',    rowH: 26, at: null },
        bass:   { name: 'Bass',   rowH: 21, at: 40,  span: 24 },   // E1 up
        guitar: { name: 'Guitar', rowH: 19, at: 52,  span: 30 },
        keys:   { name: 'Keys',   rowH: 18, at: 60,  span: 38 },   // round C4
        lead:   { name: 'Lead',   rowH: 18, at: 67,  span: 32 },
        pad:    { name: 'Pad',    rowH: 18, at: 60,  span: 38 },
        tuned:  { name: 'Tuned',  rowH: 18, at: 60,  span: 34 },
    },

    /// Which profile a track gets. The GM programs are laid out in families
    /// of eight, which is what makes this a lookup rather than a list.
    gridFor(t) {
        if (!t) return this.GRIDS.tuned;
        if (t.channel === 9) return this.GRIDS.drums;
        const p = t.program | 0;
        if (p < 8)   return this.GRIDS.keys;      // piano
        if (p < 16)  return this.GRIDS.keys;      // tuned percussion
        if (p < 24)  return this.GRIDS.keys;      // organ
        if (p < 32)  return this.GRIDS.guitar;
        if (p < 40)  return this.GRIDS.bass;
        if (p < 56)  return this.GRIDS.pad;       // strings
        if (p < 80)  return this.GRIDS.lead;      // brass and reeds
        if (p < 96)  return this.GRIDS.lead;      // synth lead
        if (p < 104) return this.GRIDS.pad;
        return this.GRIDS.tuned;
    },
    erow0: 0,                // topmost pitch row on screen
    ecol0: 0,                // leftmost step on screen
    head: 0,                 // the playhead, in steps from the start
    RULER: 14,               // height of the ruler along the top
    _keys: null,              // the pitch cache — see keys(); NOT the key handler
    // Every sound the synth's kit makes has a name here. A row labelled 44
    // is a row you cannot act on.
    DRUM_NAMES: { 35: 'Kick', 36: 'Kick2', 37: 'Rim', 38: 'Snare', 39: 'Clap',
                  40: 'Snare2', 42: 'HiHat', 44: 'Pedal', 46: 'Open',
                  49: 'Crash', 51: 'Ride' },

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

        // Belt and braces for the first paint. The observer covers this on
        // anything modern; these two frames cover the rest, and cost
        // nothing when the first layout was already right.
        if (typeof requestAnimationFrame === 'function')
            requestAnimationFrame(() => requestAnimationFrame(() => this.layout()));
    },

    close() {
        this.stop();
        this.keep();                 // never lose what is on the bench
        this._audio = false;
        Tape.hush();
        Mic.hush();                  // the browser shows a live mic, so let it go
        window.removeEventListener('resize', this._resize);
        window.removeEventListener('keydown', this._onKey);
        if (this._watcher) { try { this._watcher.disconnect(); } catch (_) {} this._watcher = null; }
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
        Tape.clear();
        this.solo = null;
        this.mixSet = Mixer.fresh();
        this._mix = null;
        this.selectNone();
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

    /// Put a riff at a bar, clearing whatever it lands on. A riff owns
    /// every bar it covers, so placing a two-bar riff over a one-bar one
    /// takes the bar after it as well.
    place(track, bar, riff) {
        const span = this.spanOf(riff);
        for (let i = track.placements.length - 1; i >= 0; i--) {
            const p = track.placements[i];
            if (p.at < bar + span && bar < p.at + this.spanOf(p.riff))
                track.placements.splice(i, 1);
        }
        track.add(new Placement(riff, bar));
        track.placements.sort((a, b) => a.at - b.at);
        return riff;
    },

    /// How many bars a riff covers. One, for anything that has not said.
    spanOf(riff) { return Math.max(1, (riff && riff.bars) | 0); },

    /// The placement covering a bar — which is not necessarily one that
    /// starts there, now that a riff can be longer than a bar.
    placedAt(track, bar) {
        return track.placements.find(
            p => p.at <= bar && bar < p.at + this.spanOf(p.riff)) || null;
    },

    riffAt(track, bar) {
        const p = this.placedAt(track, bar);
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
        cv.addEventListener('pointerdown', e => this.down(e));
        cv.addEventListener('pointermove', e => this.move(e));
        cv.addEventListener('pointerup', e => this.up(e));
        cv.addEventListener('pointercancel', () => {
            if (this._move) this.moveEnd();
            this._press = null; this._band = null; this._scroll = null; this.draw();
        });

        cv.addEventListener('wheel', e => this.wheel(e), { passive: false });
        this._resize = () => this.layout();
        window.addEventListener('resize', this._resize);

        // The window resizing is not the only way this canvas changes size,
        // and it is not even the common one: the page finishing its layout
        // after the studio opens, a panel growing underneath, a phone
        // keyboard appearing. None of those fire a resize event. This does.
        if (typeof ResizeObserver === 'function') {
            this._watcher = new ResizeObserver(() => this.layout());
            try { this._watcher.observe(cv); } catch (_) { this._watcher = null; }
        }
        this._onKey = e => this.key(e);
        window.addEventListener('keydown', this._onKey);

        // Drag a sample straight onto the bar you want it on. There is no
        // drag on a phone, so the panel also has a file button.
        const stop = e => { e.preventDefault(); e.stopPropagation(); };
        cv.addEventListener('dragenter', e => { stop(e); this._dragOn(e); });
        cv.addEventListener('dragover', e => { stop(e); this._dragOn(e); });
        cv.addEventListener('dragleave', e => { stop(e); this._drag = null; this.draw(); });
        cv.addEventListener('drop', () => { this._drag = null; });
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
                b('Copy', 'copy()', 'Copy what is selected') +
                b('Cut', 'cut()', 'Cut what is selected') +
                b('Paste', 'paste(false)', 'Paste at the cursor — riffs repeat, so edits show everywhere') +
                b('As new', 'paste(true)', 'Paste, with independent copies of the riffs') +
                b('Delete', 'clear()', 'Remove what is selected') +
                b('&#9679;&rarr;', 'loopFrom()', 'Loop starts here') +
                b('&rarr;&#9679;', 'loopTo()', 'Loop ends here') +
                b('+ Track', 'newTrack()', 'Add a track') +
                b('&minus;', 'dropTrack()', 'Remove this track') +
                b('Save', 'saveSong()', 'Save this beat') +
                b('Beats', 'beats()', 'Your saved beats') +
                b('&minus;', 'zoomBy(-1)', 'Zoom out', this.zoom <= this.ZOOM_MIN ? 'st-dim' : '') +
                b('+', 'zoomBy(1)', 'Zoom in', this.zoom >= this.ZOOM_MAX ? 'st-dim' : '') +
                (this.solo ? b('Unsolo', 'clearSolo()', 'Hear everything again', 'st-go on') : '') +
                b('&#9707;', 'mixPanel()', 'The mix', this._mixOpen ? 'st-hot' : '') +
                b('&#8595;', 'exportAs(\'mp3\')', 'Export an mp3 of the loop') +
                b(Mic.rolling() ? '&#9632; Audio' : '&#127908; Audio', 'audioPanel()',
                  'Microphone and samples',
                  this._audio ? 'st-hot' : (Mic.rolling() ? 'st-rec on' : '')) +
                tempo;
        } else {
            const t = this.song.tracks[this.track];
            let inst;
            if (t.channel === 9) {
                // Channel 10 is the kit, and a General MIDI program number
                // means a different thing there — which is why showing the
                // first entry of the melodic list was never right.
                inst = '<span class="st-kit" title="' + this.DRUM_ROWS.length +
                    ' sounds — the only kit this synth has">&#9834; ' +
                    this.KIT_NAME + '</span>';
            } else {
                inst = '<select onchange="Studio.setInst(+this.value)">';
                GM.forEach((n, i) =>
                    inst += `<option value="${i}"${i === t.program ? ' selected' : ''}>${n}</option>`);
                inst += '</select>';
            }
            bar.innerHTML =
                b(this._timer ? 'Stop' : 'Play', 'toggle()', 'Play', 'st-go' + (this._timer ? ' on' : '')) +
                b(this._rec ? '&#9632; Done' : '&#9679; Rec', 'record()',
                  'Play the pads into this riff', 'st-rec' + (this._rec ? ' on' : '')) +
                history +
                b('&minus;', 'zoomBy(-1)', 'Zoom out', this.zoom <= this.ZOOM_MIN ? 'st-dim' : '') +
                b('+', 'zoomBy(1)', 'Zoom in', this.zoom >= this.ZOOM_MAX ? 'st-dim' : '') +
                b('&lsaquo; Arrange', 'back()', 'Back to the arrangement', 'st-hot') +
                inst +
                b('Clear', 'clearRiff()', 'Empty this riff') +
                '<select class="st-len" title="How long this riff is" ' +
                    'onchange="Studio.setRiffBars(+this.value)">' +
                    this.LENGTHS.map(n =>
                        '<option value="' + n + '"' +
                        (n === this.riffBars() ? ' selected' : '') + '>' +
                        n + (n === 1 ? ' bar' : ' bars') + '</option>').join('') +
                '</select>' +
                tempo;
        }
    },

    BPM_MIN: 40,
    BPM_MAX: 260,
    LENGTHS: [1, 2, 4, 8],   // bars a riff may be

    /// How long the riff the control would act on is.
    riffBars() {
        const w = this.lengthTarget();
        return w ? this.spanOf(w.p.riff) : 1;
    },

    /// How long ONE riff is, in bars.
    ///
    /// Growing swallows the bars after it, taking whatever was there into
    /// itself at the right offset — so four bars of drums become one
    /// four-bar riff that still sounds the same. Shrinking hands the tail
    /// back as its own riff in the bars it just gave up, so nothing is
    /// lost either way.
    ///
    /// A riff placed more than once is copied first. There is no honest
    /// alternative: the bars after each repeat hold different music, so
    /// one answer cannot serve them all.
    setRiffBars(bars) {
        const where = this.lengthTarget();
        if (!where) { this.say('Select a riff first'); return; }
        const { track, p } = where;
        const want = Math.max(1, Math.min(this.BARS, bars | 0));
        const had = this.spanOf(p.riff);
        if (want === had) return;

        // Riffs in the way are swallowed, not refused; the arrangement
        // running out is the only thing that can stop it.
        if (p.at + want > this.BARS) {
            this.say('No room for ' + want + ' bars at bar ' + (p.at + 1));
            return;
        }

        this.mark('Riff length');
        let copied = false;
        if (this.timesPlaced(p.riff) > 1) {
            p.riff = this.song.addRiff(Riff.copy(p.riff));
            copied = true;
        }
        if (want > had) this.absorb(track, p, want);
        else this.shedTail(track, p, want);

        this.tidy();
        this.selectNone();
        if (this.view === 'edit') this.editing = p.riff;
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct(); this.draw();
        this.say(p.riff.name + ' is ' + want + (want === 1 ? ' bar' : ' bars') +
                 (copied ? ' — copied, because it was repeated' : ''));
    },

    /// Which riff the length control is talking about: the one open in the
    /// editor, or the single selected block.
    lengthTarget() {
        if (this.view === 'edit' && this.editing) {
            const track = this.song.tracks[this.track];
            const p = track && track.placements.find(x => x.riff === this.editing);
            return p ? { track, p } : null;
        }
        const places = this.selPlaces();
        if (places.length === 1) return { track: places[0].track, p: places[0].p };
        const track = this.song.tracks[this.track];
        const p = track && this.placedAt(track, this.bar);
        return p ? { track, p } : null;
    },

    timesPlaced(riff) {
        let n = 0;
        for (const t of this.song.tracks)
            for (const p of t.placements) if (p.riff === riff) n++;
        return n;
    },

    /// Grow a riff over the bars after it, taking their music with it.
    absorb(track, p, want) {
        const from = p.at + this.spanOf(p.riff);
        const taken = [];
        for (let b = from; b < p.at + want; b++) {
            const other = track.placements.find(x => x !== p && x.at === b);
            if (!other) continue;
            const off = (other.at - p.at) * 16;
            for (const e of other.riff.events) {
                if (!e.isNote) continue;
                p.riff.add(Event.note(e.data[0], e.data[1], e.dur, e.tick + off));
            }
            taken.push(other);
        }
        for (const other of taken)
            track.placements.splice(track.placements.indexOf(other), 1);
        p.riff.bars = want;
    },

    /// Shrink a riff, handing back what no longer fits as its own riff in
    /// the bars just freed. Those bars were this riff's, so there is
    /// always somewhere for the tail to go.
    shedTail(track, p, want) {
        const keep = want * 16;
        const tail = p.riff.events.filter(e => e.isNote && e.tick >= keep);
        p.riff.events = p.riff.events.filter(e => !(e.isNote && e.tick >= keep));
        p.riff.bars = want;

        // Each freed bar that holds something becomes a riff of its own,
        // rather than one long riff of mostly silence.
        const had = tail.length ? Math.max(...tail.map(e => e.tick)) : -1;
        for (let b = want; b * 16 <= had; b++) {
            const here = tail.filter(e => e.tick >= b * 16 && e.tick < (b + 1) * 16);
            if (!here.length) continue;
            const riff = this.song.addRiff(new Riff(p.riff.name, 1));
            for (const e of here)
                riff.add(Event.note(e.data[0], e.data[1], e.dur, e.tick - b * 16));
            track.add(new Placement(riff, p.at + b));
        }
        track.placements.sort((a, b) => a.at - b.at);
    },

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

    /// Where a step is, musically and in seconds. Two answers because they
    /// are for two different questions: the first is what you think in
    /// while writing a part, the second is what you need when lining
    /// something up against a recording.
    stamp(step) {
        // Sixteen steps to a bar, whatever a riff happens to be — so the
        // readout says the same thing on both screens and matches what a
        // musician would count.
        const bar = Math.floor(step / 16) + 1;
        const beat = Math.floor((step % 16) / 4) + 1;
        const sub16 = (step % 4) + 1;
        const secs = step * (15 / this.song.tempo);
        return {
            bar, beat, sub: sub16,
            at: bar + '.' + beat + '.' + sub16,
            secs,
            clock: secs.toFixed(2) + 's',
        };
    },

    // ── The playhead ──────────────────────────────────────────────────────

    steps() { return this.song.stepsPerRiff; },
    // The head is in steps from the start of the arrangement. Which BAR
    // that is, and which SLOT, are different questions once a riff is
    // longer than a bar: the arrangement is drawn in bars, placements are
    // indexed by slot.
    headBar() { return Math.floor(this.head / 16); },
    headStep() { return this.head % this.steps(); },

    /// The riff on screen, and where it sits.
    editPlace() {
        const t = this.song.tracks[this.track];
        if (!t) return null;
        if (this.editing) {
            const p = t.placements.find(x => x.riff === this.editing);
            if (p) return p;
        }
        return this.placedAt(t, this.bar);
    },
    /// Is the playhead inside the riff being edited, and how far in? A
    /// riff can be several bars, so this is about a span rather than
    /// about two numbers matching.
    headInRiff() {
        const p = this.editPlace();
        if (!p) return false;
        const b = this.headBar();
        return b >= p.at && b < p.at + this.spanOf(p.riff);
    },
    headTick() {
        const p = this.editPlace();
        return p ? this.head - p.at * 16 : this.head % 16;
    },

    /// Where it is now: following the transport while it runs, and sitting
    /// where you put it when it is not.
    liveHead() {
        if (this._timer && this._step >= 0) {
            const bar = this._playBar >= 0 ? this._playBar : this.headBar();
            return bar * 16 + this._step;
        }
        return this.head;
    },

    setHead(steps, quiet) {
        const max = this.BARS * this.steps() - 1;
        const at = Math.max(0, Math.min(max, Math.round(steps)));
        if (at === this.head) return;
        this.head = at;
        if (this.view === 'arrange') this.reveal(null, this.headBar());
        else this.reveal(null, this.headStep());
        this.draw();
        if (!quiet) {
            const p = this.stamp(at);
            this.say('Playhead at bar ' + (this.headBar() + 1) + ', ' + p.at + ' · ' + p.clock);
        }
    },

    /// Where the riff editor should begin: the head if it falls inside the
    /// riff being edited, and the top of the riff if it does not.
    startStep() {
        return this.headInRiff() ? this.headTick() : 0;
    },

    /// Kept for the riff ruler, which thinks in steps within the riff.
    setStart(step) {
        this.setHead(this.bar * this.steps() + Math.max(0, step | 0));
    },

    /// Every pitch, highest first. Built once — it never changes.
    keys() {
        if (!this._keys) {
            this._keys = [];
            for (let p = this.NOTE_HIGH; p >= this.NOTE_LOW; p--) this._keys.push(p);
        }
        return this._keys;
    },

    rows(t) { return t.channel === 9 ? this.DRUM_ROWS : this.keys(); },

    /// Which row a pitch is on, or -1. The range is contiguous for pitched
    /// tracks, so this does not need a search.
    rowOf(t, pitch) {
        if (t.channel === 9) return this.DRUM_ROWS.indexOf(pitch);
        if (pitch > this.NOTE_HIGH || pitch < this.NOTE_LOW) return -1;
        return this.NOTE_HIGH - pitch;
    },

    isBlack(pitch) { return this.BLACK.indexOf(((pitch % 12) + 12) % 12) !== -1; },

    label(t, row) {
        const n = this.rows(t)[row];
        // A row past the end of the kit is not a row. It used to be
        // labelled String(undefined), which put the word "undefined" down
        // the side of every drum grid taller than the kit.
        if (n == null) return '';
        if (t.channel === 9) return this.DRUM_NAMES[n] || String(n);
        return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n % 12]
             + (Math.floor(n / 12) - 1);
    },

    layout() {
        const cv = document.getElementById('st-grid');
        if (!cv) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cv.clientWidth, h = cv.clientHeight;
        if (!w || !h) {
            // Opened before the stylesheet has been applied. Giving up here
            // leaves whatever cell the last screen had, so ask again once
            // the browser has laid the page out.
            if (typeof requestAnimationFrame === 'function' && !this._waiting) {
                this._waiting = true;
                requestAnimationFrame(() => { this._waiting = false; this.layout(); });
            }
            return;
        }
        cv.width = w * dpr; cv.height = h * dpr;
        cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);

        if (this.view === 'arrange') {
            // Wide enough for a name and the two little buttons after it.
            const x0 = 82, y0 = 18, g = this.GUTTER;
            const total = Math.max(this.rowCount(), 1);

            // Aim for about eight bars across, but never so narrow that a
            // name will not fit and never so wide it looks empty.
            const across = Math.max(40, w - x0 - g);
            // Zoom scales the cell, and the window follows — the arrangement
            // has worked in bars and rows rather than pixels since it learned
            // to scroll, so this is one multiplier and nothing else changes.
            const z = this.zoom;
            const cw = Math.min(this.BAR_MAX * z, Math.max(this.BAR_MIN * z, (across / 8) * z));
            const rh = Math.max(26, this.ROW_H * z);
            const cols = Math.max(1, Math.min(this.BARS, Math.floor(across / cw)));

            // Shrink rows to fit what is there rather than keeping them at
            // a fixed height and pushing the last tracks off the bottom —
            // five tracks and two audio lanes want 378 pixels and the grid
            // usually has about 270. Below the floor it stops shrinking and
            // starts scrolling, which is the point at which a row is too
            // thin to read or to hit.
            const down = Math.max(30, h - y0 - g);
            const fit = Math.max(this.ROW_FLOOR * this.zoom, Math.min(rh, down / total));
            const rows = Math.max(1, Math.min(total, Math.floor(down / fit)));

            this.cell = { x0, y0, w: cw, h: fit, cols, rows, total, forW: w, forH: h };
            this.clampView();
        } else {
            const t = this.song.tracks[this.track];
            const grid = this.gridFor(t);
            const g = this.GUTTER;
            // A kit needs room for a name; everything else gets a keyboard.
            const x0 = t.channel === 9 ? 58 : 40;
            const y0 = this.RULER + 2;

            const total = this.rows(t).length;
            const steps = this.editing ? this.editing.steps : this.song.stepsPerRiff;

            const across = Math.max(40, w - x0 - g);
            const down = Math.max(26, h - y0 - g);

            // Aim to show a useful stretch of the instrument at once, and
            // shrink rows towards the floor to manage it on a short window
            // rather than showing two rows at the height they would like.
            const wants = grid.rowH * this.zoom;
            const aim = t.channel === 9 ? total : Math.min(total, 14);
            const rowH = Math.max(this.ROW_MIN * Math.min(1, this.zoom),
                                  Math.min(wants, down / aim));

            // Aim to show a bar at a time across; a riff that is longer than
            // one scrolls rather than squeezing into illegibility.
            const cw = Math.max(14, Math.min(across / Math.min(steps, 16), 64 * this.zoom));
            const cols = Math.max(1, Math.min(steps, Math.floor(across / cw)));
            const rows = Math.max(1, Math.min(total, Math.floor(down / rowH)));

            this.cell = { x0, y0, w: cw, h: rowH, cols, rows, total, forW: w, forH: h };
            this.clampView();
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

    // ── Scrolling ─────────────────────────────────────────────────────────

    cols() { return this.cell && this.cell.cols ? this.cell.cols : this.BARS; },
    visRows() { return this.cell && this.cell.rows ? this.cell.rows : this.rowCount(); },
    maxBar0() { return Math.max(0, this.BARS - this.cols()); },
    maxRow0() { return Math.max(0, this.rowCount() - this.visRows()); },

    /// What the window is onto, whichever screen is up. Everything that
    /// scrolls asks this instead of knowing about bars or about steps —
    /// which is what stops the two screens drifting apart.
    span() {
        const c = this.cell || {};
        if (this.view === 'edit' && this.editing) {
            const t = this.song.tracks[this.track];
            return {
                edit: true,
                cols: c.cols || 16, rows: c.rows || 8,
                totalCols: this.editing.steps,
                totalRows: this.rows(t).length,
                col0: this.ecol0, row0: this.erow0,
            };
        }
        return {
            edit: false,
            cols: c.cols || this.BARS, rows: c.rows || this.rowCount(),
            totalCols: this.BARS, totalRows: this.rowCount(),
            col0: this.bar0, row0: this.row0,
        };
    },

    /// Write a window position back to whichever screen owns it.
    putSpan(col0, row0) {
        if (this.view === 'edit' && this.editing) {
            if (col0 != null) this.ecol0 = col0;
            if (row0 != null) this.erow0 = row0;
        } else {
            if (col0 != null) this.bar0 = col0;
            if (row0 != null) this.row0 = row0;
        }
        this.clampView();
    },

    clampView() {
        const v = this.span();
        const col = Math.max(0, Math.min(Math.max(0, v.totalCols - v.cols), v.col0 | 0));
        const row = Math.max(0, Math.min(Math.max(0, v.totalRows - v.rows), v.row0 | 0));
        if (v.edit) { this.ecol0 = col; this.erow0 = row; }
        else { this.bar0 = col; this.row0 = row; }
    },

    /// Zoom, keeping whatever is under the cursor roughly where it was —
    /// zooming somewhere you are not looking is disorienting.
    setZoom(z) {
        const was = this.zoom;
        this.zoom = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, Math.round(z * 20) / 20));
        if (this.zoom === was) return false;
        this.layout();
        this._afterZoom();
        this.toolbar();
        return true;
    },

    zoomBy(by) {
        if (this.setZoom(this.zoom * (by > 0 ? 1.25 : 0.8)))
            this.say('Zoom ' + Math.round(this.zoom * 100) + '%');
    },

    /// Zoom has to keep the cursor in view on whichever screen is up.
    _afterZoom() {
        if (this.view === 'edit' && this.editing) this.clampView();
        else this.reveal(this.cursorRow(), this.bar);
    },


    /// Move the window. Anything the user does to it stops the playhead
    /// dragging it around underneath them.
    scrollBy(dCol, dRow, byHand) {
        const v = this.span();
        const was = v.col0 + ':' + v.row0;
        this.putSpan(v.col0 + (dCol || 0), v.row0 + (dRow || 0));
        if (byHand) this._follow = false;
        const now = this.span();
        if (was === now.col0 + ':' + now.row0) return false;
        this.draw();
        return true;
    },

    scrollTo(col0, row0, byHand) {
        this.putSpan(col0, row0);
        if (byHand) this._follow = false;
        this.draw();
    },

    /// Bring a bar and a row into view, moving as little as possible.
    reveal(row, col) {
        const v = this.span();
        let col0 = v.col0, row0 = v.row0, moved = false;
        if (col != null) {
            if (col < col0) { col0 = col; moved = true; }
            else if (col > col0 + v.cols - 1) { col0 = col - v.cols + 1; moved = true; }
        }
        if (row != null) {
            if (row < row0) { row0 = row; moved = true; }
            else if (row > row0 + v.rows - 1) { row0 = row - v.rows + 1; moved = true; }
        }
        if (moved) { this.putSpan(col0, row0); this.draw(); }
        return moved;
    },

    /// Put a row in the middle rather than just on screen — right when
    /// jumping somewhere, where landing at the very edge is disorienting.
    centre(row) {
        const v = this.span();
        this.putSpan(null, Math.round(row - v.rows / 2));
    },

    /// Where a bar and a row land on the glass — or off it.
    colX(bar) { return this.cell.x0 + (bar - this.bar0) * this.cell.w; },
    rowY(row) { return this.cell.y0 + (row - this.row0) * this.cell.h; },
    onScreen(bar) { return bar >= this.bar0 && bar < this.bar0 + this.cols(); },
    rowOn(row) { return row >= this.row0 && row < this.row0 + this.visRows(); },

    // The same, for the piano roll.
    stepX(step) { return this.cell.x0 + (step - this.ecol0) * this.cell.w; },
    keyY(row) { return this.cell.y0 + (row - this.erow0) * this.cell.h; },
    stepOn(step) { return step >= this.ecol0 && step < this.ecol0 + this.cell.cols; },
    keyOn(row) { return row >= this.erow0 && row < this.erow0 + this.cell.rows; },

    /// The scrollbar tracks, in canvas pixels. Null when everything fits —
    /// a scrollbar for something that does not scroll is just clutter.
    scrollbars() {
        const c = this.cell;
        if (!c || !c.cols) return { h: null, v: null };
        const s = this.span();
        const gridW = s.cols * c.w, gridH = s.rows * c.h;
        const h = s.totalCols > s.cols
            ? { x: c.x0, y: c.y0 + gridH + 1, w: gridW, h: this.GUTTER - 2,
                from: c.x0 + (s.col0 / s.totalCols) * gridW,
                len: Math.max(18, (s.cols / s.totalCols) * gridW) }
            : null;
        const v = s.totalRows > s.rows
            ? { x: c.x0 + gridW + 1, y: c.y0, w: this.GUTTER - 2, h: gridH,
                from: c.y0 + (s.row0 / s.totalRows) * gridH,
                len: Math.max(18, (s.rows / s.totalRows) * gridH) }
            : null;
        return { h, v };
    },

    /// Two little letters at the end of the row label. Drawn rather than
    /// made of HTML because the row is drawn, and a button floating over a
    /// canvas never lines up with it for long.
    drawRowState(cx, c, row, y) {
        const muted = this.rowMuted(row);
        const solo = this.rowSolo(row);
        const dim = this.solo && !solo;
        const box = 11, pad = 2;
        const x = c.x0 - box * 2 - pad - 3;
        const mid = y + c.h / 2 - box / 2;

        cx.font = '8px monospace';
        cx.textBaseline = 'middle';

        cx.fillStyle = muted ? '#e8384f' : (dim ? '#1a1a22' : '#1d1d27');
        cx.fillRect(x, mid, box, box);
        cx.fillStyle = muted ? '#fff' : '#6a7183';
        cx.fillText('M', x + 2.5, mid + box / 2);

        cx.fillStyle = solo ? '#ffc83d' : '#1d1d27';
        cx.fillRect(x + box + pad, mid, box, box);
        cx.fillStyle = solo ? '#11111a' : '#6a7183';
        cx.fillText('S', x + box + pad + 3, mid + box / 2);
    },

    /// Which of the two little boxes a point is on, if either.
    rowButton(px, py) {
        const c = this.cell;
        if (!c || this.view !== 'arrange') return null;
        const box = 11, pad = 2;
        const x = c.x0 - box * 2 - pad - 3;
        if (px < x - 2 || px > x + box * 2 + pad + 2) return null;
        const row = this.row0 + Math.floor((py - c.y0) / c.h);
        if (row < 0 || row >= this.rowCount()) return null;
        const mid = this.rowY(row) + c.h / 2 - box / 2;
        if (py < mid - 3 || py > mid + box + 3) return null;
        return { row, which: px < x + box + pad / 2 ? 'mute' : 'solo' };
    },

    draw() {
        if (this.view === 'beats') return;          // that screen is HTML

        // The canvas changes height whenever the panel below it does, and
        // in a browser that happens through CSS with no event to listen
        // for. Drawing against a cell worked out for a different size is
        // how rows end up off the bottom of a grid that has room for them.
        const cv = document.getElementById('st-grid');
        // Only a cell that layout() produced carries the size it was made
        // for. One set by hand is somebody saying "use these numbers", and
        // second-guessing that is not this function's business.
        if (cv && this.cell && this.cell.forW && !this._laying) {
            const w = cv.clientWidth, h = cv.clientHeight;
            if (w && h && (w !== this.cell.forW || h !== this.cell.forH)) {
                this._laying = true;                // layout() draws; do not recurse
                this.layout();
                this._laying = false;
                return;
            }
        }

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
        for (let i = 0; i < c.cols; i++) {
            const bar = this.bar0 + i;
            const x = c.x0 + i * c.w;
            const inLoop = bar >= this.song.loopStart && bar <= this.song.loopEnd;
            cx.fillStyle = inLoop ? '#ffc83d' : '#4a5160';
            // A column is a bar, so the number is simply the bar.
            cx.fillText(String(bar + 1), x + 3, 8);
            if (inLoop) cx.fillRect(x + 1, 13, c.w - 2, 2);
        }

        this.song.tracks.forEach((t, ti) => {
            if (!this.rowOn(ti)) return;
            const y = this.rowY(ti);
            const heard = this.rowHeard(ti);
            this.drawRowState(cx, c, ti, y);
            cx.globalAlpha = heard ? 1 : 0.38;      // off is visibly off
            cx.font = '10px monospace';
            cx.fillStyle = ti === this.track ? '#e8edf6' : '#6a7183';
            cx.fillText(t.name.slice(0, 7), 5, y + c.h / 2 - 5);
            cx.fillStyle = '#4a5160';
            cx.font = '8px monospace';
            cx.fillText(t.channel === 9 ? 'kit' : (GM[t.program] || 'ch' + (t.channel + 1))
                .slice(0, 9).toLowerCase(), 5, y + c.h / 2 + 7);

            // The empty grid first: one cell per bar.
            const playCol = this._playBar >= 0
                ? this._playBar : -1;
            for (let i = 0; i < c.cols; i++) {
                const bar = this.bar0 + i;
                cx.fillStyle = bar === playCol ? '#2e2e40' : '#14141c';
                cx.fillRect(c.x0 + i * c.w + 1, y + 1, c.w - 2, c.h - 2);
            }

            // Then the riffs, each as wide as it is long — which is now a
            // property of the riff rather than of the song.
            for (const p of t.placements) {
                const wide = this.spanOf(p.riff);
                const from = p.at;
                if (from + wide <= this.bar0 || from >= this.bar0 + c.cols) continue;
                const bar = from;
                const x = this.colX(from);
                const riff = p.riff;
                const sel = this.picked({ k: 'riff', t: ti, at: p.at });
                const cursor = false;
                const cw = c.w * wide;

                if (riff) {
                    const notes = riff.events.filter(e => e.isNote);
                    cx.fillStyle = t.channel === 9 ? '#6a5316' : '#1f5c2c';
                    cx.fillRect(x + 1, y + 1, cw - 2, c.h - 2);
                    // A little picture of what is in the riff.
                    //
                    // Mapped by the riff's OWN range rather than by row
                    // index. `r / 8` was right when the grid had eight
                    // rows; it has eighty-five now, so a note near the top
                    // of the range was drawn ten cell-heights below its
                    // cell — a scatter of dots floating under the
                    // arrangement, belonging to nothing.
                    //
                    // Its own range is also the better picture: a
                    // thumbnail this size cannot show seven octaves, but
                    // it can show the shape of what is in this bar.
                    let lo = Infinity, hi = -Infinity;
                    for (const e of notes) {
                        if (e.data[0] < lo) lo = e.data[0];
                        if (e.data[0] > hi) hi = e.data[0];
                    }
                    const span = Math.max(1, hi - lo);
                    cx.fillStyle = t.channel === 9 ? '#ffc83d' : '#4cd964';
                    for (const e of notes) {
                        const nx = x + 3 + (e.tick / riff.steps) * (cw - 6);
                        // High notes up the top, which is the way round
                        // every other grid in the app draws them.
                        const ny = y + 5 + (1 - (e.data[0] - lo) / span) * (c.h - 12);
                        cx.fillRect(nx, ny, Math.max(1.5, (cw - 6) / riff.steps - 0.5), 2);
                    }
                    cx.fillStyle = '#9fb0a2';
                    cx.font = '8px monospace';
                    cx.fillText(riff.name.slice(0, 8), x + 4, y + c.h - 7);
                }

                if (sel) {
                    cx.strokeStyle = '#ff7a45'; cx.lineWidth = 2;
                    cx.strokeRect(x + 2, y + 2, cw - 4, c.h - 4);
                }
            }

            // The cursor is not a selection — it is where the next paste
            // lands — so it is drawn as an insertion point down the left
            // edge rather than as a box round a cell.
            if (ti === this.track && this.onScreen(this.bar)) {
                cx.fillStyle = '#ffc83d';
                cx.fillRect(this.colX(this.bar) + 1, y + 2, 2, c.h - 4);
            }
            cx.globalAlpha = 1;
        });

        for (let lane = 0; lane < this.audioRows(); lane++)
            if (this.rowOn(this.song.tracks.length + lane)) this.drawLane(cx, c, lane);

        this.drawHead(cx, c);
        this.drawScrollbars(cx, c);

        // The bar a dragged file will land on. This was being worked out and
        // then not drawn, which is the same as not working it out.
        if (this._drag != null && this.onScreen(this._drag)) {
            cx.strokeStyle = '#4cc9d9'; cx.lineWidth = 2;
            cx.strokeRect(this.colX(this._drag) + 1, c.y0, c.w - 2, c.rows * c.h);
        }

        if (this._band) {
            const b = this._band;
            cx.fillStyle = 'rgba(255, 122, 69, 0.16)';
            cx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
            cx.strokeStyle = '#ff7a45'; cx.lineWidth = 1;
            cx.strokeRect(b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0 - 1, b.y1 - b.y0 - 1);
        }
    },

    /// One audio lane. Clips are drawn as what they are — a block across the
    /// bars they cover, with their own waveform — and they sit in the
    /// arrangement because that is where they play from, even though the
    /// audio itself lives outside the .vbm.
    drawLane(cx, c, lane) {
        const row = this.song.tracks.length + lane;
        const y = this.rowY(row);
        this.drawRowState(cx, c, row, y);
        cx.globalAlpha = this.rowHeard(row) ? 1 : 0.38;
        const clips = Tape.inLane(lane);
        const arming = Mic.rolling() && lane === Tape.lanes();

        cx.font = '10px monospace';
        cx.fillStyle = arming ? '#e8384f' : (clips.length ? '#e8edf6' : '#6a7183');
        cx.fillText(lane === 0 ? 'Audio' : 'Aud ' + (lane + 1), 5, y + c.h / 2 - 5);
        cx.fillStyle = '#4a5160';
        cx.font = '8px monospace';
        cx.fillText(arming ? 'rec' : (clips.length ? clips.length + ' clip' + (clips.length > 1 ? 's' : '') : 'drop here'),
                    5, y + c.h / 2 + 7);

        for (let i = 0; i < c.cols; i++) {
            const bar = this.bar0 + i;
            const x = c.x0 + i * c.w;
            cx.fillStyle = bar === this._playBar ? '#2e2e40' : '#14141c';
            cx.fillRect(x + 1, y + 1, c.w - 2, c.h - 2);
        }

        // Where the microphone is about to put its take.
        if (arming) {
            const from = this.song.loopStart;
            const bars = this.song.loopEnd - from + 1;
            cx.fillStyle = '#3a1620';
            cx.fillRect(this.colX(from) + 1, y + 1, c.w * bars - 2, c.h - 2);
            const w = (c.w * bars - 4) * Math.min(1, Mic.level);
            cx.fillStyle = '#e8384f';
            cx.fillRect(this.colX(from) + 2, y + c.h / 2 - 1, Math.max(1, w), 2);
        }

        for (const clip of clips) {
            // A clip can start off the left of the window and still be on it.
            if (clip.at + clip.bars <= this.bar0 || clip.at >= this.bar0 + c.cols) continue;
            const x0 = this.colX(clip.at);
            const span = c.w * clip.bars;
            const sel = this.picked({ k: 'clip', id: clip.id });
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
        cx.globalAlpha = 1;
    },

    /// The playhead across the arrangement: a line through every row, and
    /// a handle in the bar numbers to take hold of. Sub-bar position is
    /// kept, so a head set a beat into a bar is drawn a beat into the bar
    /// rather than snapping to the bar line.
    drawHead(cx, c) {
        const at = this.liveHead();
        const bar = Math.floor(at / this.steps());
        if (!this.onScreen(bar)) return;
        const x = this.colX(bar) + ((at % this.steps()) / this.steps()) * c.w;
        const live = !!this._timer;

        cx.globalAlpha = live ? 0.85 : 0.6;
        cx.fillStyle = live ? '#ffc83d' : '#4cd964';
        cx.fillRect(x, c.y0, live ? 2 : 1, c.rows * c.h);
        cx.globalAlpha = 1;

        // The handle. Something to aim at, since the line itself is a
        // pixel wide.
        cx.fillStyle = live ? '#ffc83d' : '#4cd964';
        cx.beginPath();
        cx.moveTo(x - 5, 2); cx.lineTo(x + 5, 2); cx.lineTo(x, 11);
        cx.closePath(); cx.fill();
    },

    /// Drawn on the canvas rather than made of HTML, because the thing they
    /// scroll is a canvas and a real scrollbar would sit outside it and
    /// measure the wrong box. They appear only when there is something past
    /// the edge — a scrollbar for something that does not scroll is clutter.
    drawScrollbars(cx, c) {
        const sb = this.scrollbars();
        for (const b of [sb.h, sb.v]) {
            if (!b) continue;
            cx.fillStyle = '#14141c';
            cx.fillRect(b.x, b.y, b.w, b.h);
            cx.fillStyle = this._scroll ? '#ff7a45' : '#3a3a4a';
            if (b === sb.h) cx.fillRect(b.from, b.y + 1, b.len, b.h - 2);
            else cx.fillRect(b.x + 1, b.from, b.w - 2, b.len);
        }
        // A reminder that there is more song off to the right, for anyone
        // who has not noticed the scrollbar.
        if (sb.h && this.bar0 + c.cols < this.BARS) {
            cx.fillStyle = '#4a5160';
            cx.font = '8px monospace';
            cx.fillText('\u203a', c.x0 + c.cols * c.w - 6, 8);
        }
        if (sb.h && this.bar0 > 0) {
            cx.fillStyle = '#4a5160';
            cx.font = '8px monospace';
            cx.fillText('\u2039', c.x0 - 6, 8);
        }
    },

    // ── Inside a riff ─────────────────────────────────────────────────────

    drawEdit() {
        const cv = document.getElementById('st-grid');
        if (!cv || !this.cell || !this.editing) return;
        const cx = cv.getContext('2d'), c = this.cell;
        const t = this.song.tracks[this.track];
        const drums = t.channel === 9;
        const rows = this.rows(t);
        cx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
        cx.textBaseline = 'middle';

        const bigEnough = c.h >= this.ROW_MIN + 2;
        const roomy = c.h >= this.ROW_BIG;

        // The keyboard is drawn per row below; this is the strip behind it,
        // so a gap between keys reads as a gap rather than as the grid.
        if (!drums) {
            cx.fillStyle = '#0e0e14';
            cx.fillRect(0, c.y0, c.x0 - 1, c.rows * c.h);
        }

        this.drawRuler(cx, c, t);

        for (let i = 0; i < c.rows; i++) {
            const r = this.erow0 + i;
            if (r >= rows.length) break;
            const y = c.y0 + i * c.h;
            const pitch = rows[r];
            const black = !drums && this.isBlack(pitch);
            const isC = !drums && pitch % 12 === 0;

            if (drums) {
                cx.font = '9px monospace';
                cx.fillStyle = '#5a6172';
                cx.fillText(this.label(t, r), 4, y + c.h / 2);
            } else {
                // A key. Black ones are drawn short and dark, like the real
                // thing, so the octave reads at a glance without anything
                // having to be named.
                const kw = black ? c.x0 - 16 : c.x0 - 2;
                cx.fillStyle = black ? '#15151c' : '#c8ccd6';
                cx.fillRect(0, y + 1, kw, c.h - 1);
                cx.fillStyle = '#0e0e14';
                cx.fillRect(0, y + c.h - 1, c.x0 - 2, 1);     // the gap between keys
                if (isC && c.h >= 11) {
                    cx.font = '8px monospace';
                    cx.fillStyle = '#3a3a46';
                    cx.fillText(this.label(t, r), 3, y + c.h / 2);
                }
            }

            for (let j = 0; j < c.cols; j++) {
                const st = this.ecol0 + j;
                const x = c.x0 + j * c.w;
                cx.fillStyle = st === this._step ? '#2e2e40'
                    : black ? '#101016'
                    : (isC ? '#1d1d26' : (st % 4 === 0 ? '#191922' : '#14141c'));
                cx.fillRect(x + 1, y + 1, c.w - 2, c.h - 2);
            }

            // A line under every C, so the octave you are in is readable
            // without counting rows.
            if (isC) {
                cx.fillStyle = '#2a2a38';
                cx.fillRect(c.x0, y + c.h - 1, c.cols * c.w, 1);
            }

            // And down every bar line, so a long riff does not become a
            // field of identical squares.
            if (this.editing && this.spanOf(this.editing) > 1) {
                cx.fillStyle = '#2f2f3e';
                for (let j = 0; j < c.cols; j++)
                    if ((this.ecol0 + j) % 16 === 0 && j > 0)
                        cx.fillRect(c.x0 + j * c.w, y + 1, 1, c.h - 2);
            }
        }

        for (const e of this.editing.events) {
            if (!e.isNote) continue;
            const r = this.rowOf(t, e.data[0]);
            if (r < 0 || !this.keyOn(r)) continue;
            const from = Math.max(e.tick, this.ecol0);
            const to = Math.min(e.tick + Math.max(1, e.dur), this.ecol0 + c.cols);
            if (to <= from) continue;
            cx.globalAlpha = 0.35 + 0.65 * (e.data[1] / 127);
            cx.fillStyle = drums ? '#ffc83d' : '#4cd964';
            cx.fillRect(this.stepX(from) + 1, this.keyY(r) + 2,
                        (to - from) * c.w - 2, c.h - 4);
            cx.globalAlpha = 1;
        }

        // Down the grid as well as in the ruler: a mark at the top of a
        // tall roll is easy to lose.
        {
            const at = this._step >= 0 ? this._step
                     : (this.headInRiff() ? this.headTick() : -1);
            if (at >= 0 && this.stepOn(at)) {
                cx.globalAlpha = this._step >= 0 ? 0.5 : 0.3;
                cx.fillStyle = this._step >= 0 ? '#ffc83d' : '#4cd964';
                cx.fillRect(this.stepX(at), c.y0, this._step >= 0 ? 2 : 1, c.rows * c.h);
                cx.globalAlpha = 1;
            }
        }

        if (!bigEnough) {
            // Zoomed out past the point of being able to hit a row.
            cx.font = '9px monospace';
            cx.fillStyle = '#5a6172';
            cx.fillText('zoom in to edit', c.x0 + 6, c.y0 + 8);
        }

        this.drawScrollbars(cx, c);
    },

    /// The ruler: beats across the top, the start marker, the playhead, and
    /// the readout in the corner where the row labels have no work to do.
    drawRuler(cx, c, t) {
        const steps = this.editing.steps;
        const top = c.y0 - this.RULER - 1;

        cx.fillStyle = '#11111a';
        cx.fillRect(0, 0, c.x0 + c.cols * c.w + this.GUTTER, this.RULER + 1);
        cx.textBaseline = 'middle';
        cx.font = '8.5px monospace';

        for (let j = 0; j < c.cols; j++) {
            const st = this.ecol0 + j;
            if (st >= steps) break;
            const x = c.x0 + j * c.w;
            const onBeat = st % 4 === 0;
            const onBar = st % 16 === 0;
            // A tick for every step, taller on a beat, taller still and
            // named on a bar line — so a four-bar riff reads as four bars
            // rather than as sixteen anonymous beats.
            cx.fillStyle = onBar ? '#8b93a6' : (onBeat ? '#6a7183' : '#2a2a38');
            cx.fillRect(x, this.RULER - (onBar ? 9 : onBeat ? 6 : 3), 1, onBar ? 9 : onBeat ? 6 : 3);
            if (onBeat && c.w > 16) {
                cx.font = onBar ? 'bold 8.5px monospace' : '8.5px monospace';
                cx.fillStyle = onBar ? '#8b93a6' : '#5a6172';
                cx.fillText(onBar ? String(Math.floor(st / 16) + 1)
                                  : String(Math.floor((st % 16) / 4) + 1),
                            x + 3, this.RULER / 2 - 2);
            }
        }

        // The playhead. One marker rather than two: where you are while it
        // runs, where you will start when it does not.
        const here = this._step >= 0 ? this._step
                   : (this.headInRiff() ? this.headTick() : -1);
        if (here >= 0 && this.stepOn(here)) {
            const x = this.stepX(here);
            const live = this._step >= 0;
            cx.fillStyle = live ? '#ffc83d' : '#4cd964';
            cx.beginPath();
            cx.moveTo(x - 4, 1); cx.lineTo(x + 4, 1); cx.lineTo(x, 8);
            cx.closePath(); cx.fill();
            cx.fillRect(x, 1, live ? 2 : 1, this.RULER - 1);
        }

        // The readout, always the head, so the two screens agree.
        const p = this.stamp(this._step >= 0 ? this.liveHead() : this.head);
        cx.fillStyle = this._step >= 0 ? '#ffc83d' : '#5a6172';
        cx.font = '8.5px monospace';
        cx.fillText(p.at + ' ' + p.clock, 3, this.RULER / 2 - 1);
    },

    // ── Touch ─────────────────────────────────────────────────────────────

    DRAG_SLOP: 6,            // pixels before a press counts as a drag

    _press: null,
    _band: null,             // the box being dragged, in canvas pixels
    _scroll: null,           // a scrollbar being dragged

    /// Canvas-relative coordinates.
    point(ev) {
        const cv = document.getElementById('st-grid');
        if (!cv) return { x: 0, y: 0 };
        const r = cv.getBoundingClientRect();
        return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    },

    /// A wheel moves the window: down the rows, or along the bars with shift
    /// held — or with a trackpad that swipes sideways of its own accord.
    wheel(ev) {
        if (this.view === 'beats') return false;
        const dx = ev.deltaX || 0, dy = ev.deltaY || 0;
        if (ev.ctrlKey || ev.metaKey) {
            if (!dy) return false;
            const moved = this.setZoom(this.zoom * (dy < 0 ? 1.12 : 0.89));
            if (moved && ev.preventDefault) ev.preventDefault();
            return moved;
        }
        const sideways = ev.shiftKey || Math.abs(dx) > Math.abs(dy);
        const amount = sideways ? (dx || dy) : dy;
        if (!amount) return false;
        const step = amount > 0 ? 1 : -1;
        const moved = this.scrollBy(sideways ? step : 0, sideways ? 0 : step, true);
        if (moved && ev.preventDefault) ev.preventDefault();
        return moved;
    },

    /// Keep the playhead in view while it runs — but only until the window
    /// is moved by hand, or playing a long arrangement would drag the view
    /// away from whoever is trying to look at bar 2.
    followPlayhead(bar) {
        if (!this._follow) return false;
        return this.reveal(null, bar);
    },

    /// Which scrollbar a point is on, if either.
    onScrollbar(p) {
        const sb = this.scrollbars();
        const hit = (b) => b && p.x >= b.x - 3 && p.x <= b.x + b.w + 3 &&
                           p.y >= b.y - 3 && p.y <= b.y + b.h + 3;
        if (hit(sb.h)) return 'h';
        if (hit(sb.v)) return 'v';
        return null;
    },

    /// Drag the bar, or tap the track to jump a page.
    scrollGrab(which, p) {
        const sb = this.scrollbars();
        const b = which === 'h' ? sb.h : sb.v;
        if (!b) return;
        const along = which === 'h' ? p.x : p.y;
        const start = which === 'h' ? b.x : b.y;
        const length = which === 'h' ? b.w : b.h;
        const s = this.span();
        const total = which === 'h' ? s.totalCols : s.totalRows;

        // Grabbed the bar itself: remember where, so it does not jump.
        if (along >= b.from && along <= b.from + b.len) {
            this._scroll = { which, grip: along - b.from, start, length, total };
            this.draw();
            return;
        }
        // Tapped the track: centre the bar on the tap, which is what a page
        // jump amounts to when the whole thing is this small.
        this._scroll = { which, grip: b.len / 2, start, length, total };
        this.scrollDrag(p);
    },

    scrollDrag(p) {
        const d = this._scroll;
        if (!d) return;
        const along = (d.which === 'h' ? p.x : p.y) - d.grip - d.start;
        const at = Math.round((along / d.length) * d.total);
        if (d.which === 'h') this.scrollTo(at, null, true);
        else this.scrollTo(null, at, true);
    },

    down(ev) {
        const p = this.point(ev);
        const grab = () => {
            const cv0 = document.getElementById('st-grid');
            if (cv0 && cv0.setPointerCapture) { try { cv0.setPointerCapture(ev.pointerId); } catch (_) {} }
        };

        // A scrollbar is a scrollbar on either screen, and has to be caught
        // before anything reads the press as a note or as a box.
        const bar = this.onScrollbar(p);
        if (bar) { this.scrollGrab(bar, p); grab(); return; }

        // Inside a riff a tap is a note and should land immediately; there is
        // nothing to drag there, so there is nothing to wait for.
        if (this.view !== 'arrange') { this.tap(ev); return; }

        // M and S come before the marquee, or it swallows them.
        const btn = this.rowButton(p.x, p.y);
        if (btn) {
            if (btn.which === 'mute') this.muteRow(btn.row); else this.soloRow(btn.row);
            return;
        }

        // The bar-number strip belongs to the playhead, not to the grid.
        if (p.y < this.cell.y0 && p.x >= this.cell.x0) {
            const into = (p.x - this.cell.x0) / this.cell.w;
            this.setHead((this.bar0 + into) * this.steps());
            return;
        }

        // What is under the press decides what a drag will mean: something
        // moves, nothing draws a box.
        const overBar = this.bar0 + Math.floor((p.x - this.cell.x0) / this.cell.w);
        const overRow = this.row0 + Math.floor((p.y - this.cell.y0) / this.cell.h);
        const under = (p.x >= this.cell.x0 && overBar >= 0 && overBar < this.BARS &&
                       overRow >= 0 && overRow < this.rowCount())
            ? this.objAt(overRow, overBar) : null;

        this._press = {
            x: p.x, y: p.y, under,
            add: !!(ev.shiftKey || ev.ctrlKey || ev.metaKey),
            // Kept rather than the event itself: a pointer event is recycled
            // by the browser and will not read the same on release.
            ev: { clientX: ev.clientX, clientY: ev.clientY,
                  shiftKey: ev.shiftKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey },
        };
        this._band = null;
        const cv = document.getElementById('st-grid');
        if (cv && cv.setPointerCapture) { try { cv.setPointerCapture(ev.pointerId); } catch (_) {} }
    },

    move(ev) {
        if (this._scroll) { this.scrollDrag(this.point(ev)); return; }
        if (this._move) { const q = this.point(ev); this.moveDrag(q.x, q.y); return; }
        if (!this._press) return;
        const p = this.point(ev);
        const dx = p.x - this._press.x, dy = p.y - this._press.y;
        if (!this._band && Math.abs(dx) < this.DRAG_SLOP && Math.abs(dy) < this.DRAG_SLOP) return;

        // Travelling from something: move it. Shift is for adding to a
        // selection, so a shift-drag still draws a box.
        if (this._press.under && !this._press.add) {
            const start = this._press;
            this._press = null;
            if (this.moveStart(start.under, start.x, start.y)) {
                this.moveDrag(p.x, p.y);
                return;
            }
            this._press = start;
        }
        this._band = {
            x0: Math.min(this._press.x, p.x), x1: Math.max(this._press.x, p.x),
            y0: Math.min(this._press.y, p.y), y1: Math.max(this._press.y, p.y),
        };
        this.draw();
    },

    up() {
        if (this._move) { this.moveEnd(); return; }
        if (this._scroll) { this._scroll = null; this.draw(); return; }
        const press = this._press;
        this._press = null;
        if (!press) return;
        if (this._band) {
            const box = this._band;
            this._band = null;
            this.bandSelect(box, press.add);
            return;
        }
        this.tap(press.ev);
    },

    /// Everything the box touches, across the whole grid: riffs on the MIDI
    /// rows and clips on the audio lanes, in one gesture. An object counts if
    /// it overlaps at all — having to enclose a four-bar clip to catch it is
    /// a worse rule than it sounds.
    bandSelect(box, add) {
        const c = this.cell;
        if (!c) return;
        const barFrom = Math.max(0, this.bar0 + Math.floor((box.x0 - c.x0) / c.w));
        const barTo = Math.min(this.BARS - 1, this.bar0 + Math.floor((box.x1 - c.x0) / c.w));
        const rowFrom = Math.max(0, this.row0 + Math.floor((box.y0 - c.y0) / c.h));
        const rowTo = Math.min(this.rowCount() - 1,
                              this.row0 + Math.floor((box.y1 - c.y0) / c.h));

        const caught = [];
        for (let row = rowFrom; row <= rowTo; row++) {
            for (let bar = barFrom; bar <= barTo; bar++) {
                const o = this.objAt(row, bar);
                // A wide clip answers for every bar it covers, so skip the
                // ones already in.
                if (o && !caught.some(x => this.same(x, o))) caught.push(o);
            }
        }

        if (!add) this._sel = caught;
        else for (const o of caught) if (!this.picked(o)) this._sel.push(o);

        if (caught.some(o => o.k === 'clip')) this._audio = true;
        this.toolbar(); this.layout(); this.refreshAct(); this.draw();
        const n = this._sel.length;
        this.say(n ? n + (n === 1 ? ' object selected' : ' objects selected') : 'Nothing in there');
    },

    tap(ev) {
        const cv = document.getElementById('st-grid');
        const r = cv.getBoundingClientRect(), c = this.cell;
        const px = ev.clientX - r.left, py = ev.clientY - r.top;

        if (this.view === 'arrange') {
            const bar = this.bar0 + Math.floor((px - c.x0) / c.w);
            const ti = this.row0 + Math.floor((py - c.y0) / c.h);
            if (bar < 0 || bar >= this.BARS || ti < 0 || ti >= this.rowCount()) return;

            // Shift or ctrl adds to the selection; a plain tap replaces it. A
            // phone has neither, which is what All and Row in the panel are
            // for, and what dragging a box is for.
            const add = !!(ev.shiftKey || ev.ctrlKey || ev.metaKey);
            const hit = this.objAt(ti, bar);

            if (ti >= this.song.tracks.length) {
                if (this.laneOf(ti) >= this.audioRows()) return;
                this.select(hit, add);
                this._audio = true;
                this.toolbar(); this.layout(); this.refreshAct(); this.draw();
                return;
            }

            // On a MIDI row the cursor moves as well as the selection: it is
            // where a paste lands and what New and Edit act on. A second tap
            // on the same cell opens the riff, which saves a trip to the
            // toolbar for the thing you most often want.
            const again = ti === this.track && bar === this.bar;
            this.track = ti; this.bar = bar;
            this.select(hit, add);
            if (again && !add && this.riffAt(this.song.tracks[ti], bar)) { this.edit(); return; }
            this.toolbar(); this.draw(); this.refreshAct();
            return;
        }

        const t = this.song.tracks[this.track];
        const s = this.ecol0 + Math.max(0, Math.floor((px - c.x0) / c.w));
        if (s < 0 || s >= this.editing.steps) return;

        // The ruler is for moving the start, not for writing notes.
        if (py < c.y0) { this.setStart(s); return; }

        const row = this.erow0 + Math.floor((py - c.y0) / c.h);
        if (row < 0 || row >= this.rows(t).length) return;

        // The keyboard sounds a note rather than writing one — which is
        // what it is for, and what it does everywhere else.
        if (px < c.x0 - 1) { this.preview(t.channel, this.rows(t)[row]); return; }
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
        const bar = this.bar0 + Math.floor((ev.clientX - r.left - this.cell.x0) / this.cell.w);
        return Math.max(0, Math.min(this.BARS - 1, bar));
    },

    _dragOn(ev) {
        if (this.view !== 'arrange') return;
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
        const bar = this.barAt(ev);
        if (bar === this._drag) return;
        this._drag = bar;
        this.draw();
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
        this._ask = null;            // a question about the last import is stale
        this._audio = true;
        let got = 0, stretched = 0, bar = at || 0, asked = null;
        for (const f of Array.from(files).slice(0, 6)) {
            const spb = this.context().barSeconds;
            const clip = await Tape.take(f, bar, spb);
            if (!clip) continue;

            // Work out what arrived before deciding what to do with it.
            const heard = Listen.read(clip.buffer, this.context());
            if (heard) {
                clip.kind2 = heard.kind;
                if (heard.tempo) clip.grid = { bpm: heard.tempo, downbeat: heard.downbeat || 0,
                                               conf: heard.pulse };
                if (heard.kind === 'vocal' || heard.kind === 'keys' || heard.kind === 'bass')
                    clip.name = clip.name;        // the file name is better than a guess
            }

            const plan = Listen.plan(heard, this.context());
            if (plan && plan.action === 'ask') {
                // A whole record. Stretching it into eight bars would be
                // vandalism, so it is placed as it is and the question of
                // what to do about the tempo is put to the person.
                asked = { clip, heard };
            } else if (plan && plan.action === 'fit') {
                if (await this.syncClip(clip, true)) stretched++;
            }
            this.selectClip(clip, got > 0);    // everything just dropped in
            bar = Math.min(this.BARS - 1, clip.at + clip.bars);
            got++;
        }
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct();
        this._ask = asked;
        this.refreshAct();
        this.say(got
            ? 'Added ' + got + (got === 1 ? ' sample' : ' samples') +
              (stretched ? ' · ' + stretched + ' beat-synced' : '')
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
                this.addSamples(inp.files, this.focus() ? this.focus().at : this.bar);
        };
        inp.click();
    },

    preview(channel, pitch) {
        if (!this.synth) return;
        const go = () => {
            if (!this._mix) this.wire(this.synth.ctx, this.context());
            this.synth.hit(channel, pitch, 100, 0.25);
        };
        if (this.synth.ctx) go();
        else this.synth.start().then(go);
    },

    // ── Arrangement commands, in Vibe's own words ─────────────────────────

    edit() {
        const riff = this.riffAt(this.song.tracks[this.track], this.bar);
        if (!riff) { this.newRiff(); return; }
        this.editing = riff;
        this.view = 'edit';
        this.ecol0 = 0;
        this.toolbar(); this.layout();
        this.lookAtNotes();
        this.refreshAct();
    },

    /// Open the roll where the music is: centred on what is already in the
    /// riff, or on the register the instrument lives in when it is empty.
    /// Landing on C1 every time and scrolling up is not a piano roll, it is
    /// a filing cabinet.
    lookAtNotes() {
        const t = this.song.tracks[this.track];
        if (!t) return;
        const notes = (this.editing ? this.editing.events : []).filter(e => e.isNote);

        if (t.channel === 9) {
            // A kit is short. When it fits, show all of it; when it does
            // not, anchor to the bottom — every drum machine ever made puts
            // the kick at the bottom and nobody has ever wanted the ride
            // instead.
            this.erow0 = this.rows(t).length;      // clamped to the last page
            this.clampView();
            this.draw();
            return;
        }

        let at;
        if (notes.length) {
            let lo = 127, hi = 0;
            for (const e of notes) { lo = Math.min(lo, e.data[0]); hi = Math.max(hi, e.data[0]); }
            at = (lo + hi) / 2;
        } else {
            at = this.gridFor(t).at || 60;
        }
        this.centre(this.rowOf(t, Math.round(at)));
        // Moving the window without redrawing leaves the drawing a step
        // behind where the roll has scrolled to.
        this.draw();
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
            (t.channel === 9 ? 'Beat ' : 'Riff ') + (this.song.riffs.length + 1),
            1));
        this.place(t, this.bar, riff);
        this.editing = riff;
        this.view = 'edit';
        this.toolbar(); this.layout(); this.refreshAct();
    },

    /// Delete whatever is selected — riffs, audio, or both. With nothing
    /// selected it takes the cursor cell, which is what Clear always did.
    clear(quiet) {
        if (!this._orCursor()) return;
        const n = this._sel.length;
        if (!n) return;
        if (!quiet) this.mark(n === 1 ? 'Delete' : 'Delete ' + n);
        this._wipe();
        this.selectNone();
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct();
        if (!quiet) this.say('Deleted ' + n + (n === 1 ? ' object' : ' objects'));
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
        // The clipboard counts as pointing at a riff, or cutting one and
        // pasting it back would paste an empty bar.
        if (this._board) for (const it of this._board.items) if (it.riff) live.add(it.riff);
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
        // A bass and a piccolo do not want the same grid, and the one you
        // just chose is a better guess than the one you had.
        if (this.view === 'edit') {
            this.layout();
            this.lookAtNotes();
            this.draw();
        }
    },

    // ── Playing ───────────────────────────────────────────────────────────

    toggle() { this._timer ? this.stop() : this.play(); },

    /// On the arrange screen this plays the loop across bars; inside a riff
    /// it loops that one bar, which is what you want while editing it.
    async play() {
        this._follow = true;         // a fresh start earns the view back
        await this.synth.start();
        Tape.ctx = this.synth.ctx;
        this.context();              // the tape rebuilds its processing against this
        if (!this._mix) this.wire(this.synth.ctx, Tape.ctxInfo);
        await Tape.ready(this.synth.ctx);
        const editing = this.view === 'edit' && this.editing;
        const from = editing ? 0 : this.song.loopStart;
        const to = editing ? 0 : this.song.loopEnd;
        // Begin at the playhead when it is inside the loop, which is what
        // "start from here" means; otherwise at the top of the loop.
        const headIn = !editing && this.headBar() >= from && this.headBar() <= to;
        // A bar at a time in the arrangement; the whole riff when editing
        // one, which may now be several bars long.
        const steps = editing ? this.editing.steps : 16;
        // Inside a riff it begins wherever the head is within the riff, so
        // you can work on the last two beats without hearing the first two
        // every time round. In the arrangement it begins at the head.
        let bar = headIn ? this.headBar() : from;
        let step = editing ? Math.min(this.startStep(), steps - 1)
                 : (headIn ? this.head % 16 : 0);

        const beat = () => {
            this._step = step;
            this._beatAt = this._now();
            // A bar line: start any clip that begins here, and tell the
            // microphone when the loop came round. That is all the timing
            // either of them gets, and all either of them needs.
            // A bar line, which inside a long riff comes round more than
            // once: clips are placed in bars and have to fire in bars.
            if (!editing && step % 16 === 0) {
                const now = this.synth.ctx.currentTime;
                const spb = 16 * (15 / this.song.tempo);
                const atBar = bar;
                if (step === 0 && bar === (Mic.rolling() ? Mic.takeBar() : from))
                    Mic.passStart(now);
                // A soloed or muted lane is handled here rather than inside
                // the tape, which knows about clips and not about rows.
                if (!Mic.rolling()) {
                    const heard = [];
                    for (let l = 0; l < this.audioRows(); l++)
                        if (this.rowHeard(this.song.tracks.length + l)) heard.push(l);
                    Tape.barStart(atBar, now, spb, heard);
                }
            }
            this._playBar = editing ? -1 : bar;
            if (editing) {
                const t = this.song.tracks[this.track];
                for (const e of this.editing.events)
                    if (e.isNote && e.tick === step)
                        this.synth.hit(t.channel, e.data[0], e.data[1],
                                       Math.max(1, e.dur) * (15 / this.song.tempo));
            } else {
                for (let ti = 0; ti < this.song.tracks.length; ti++) {
                    if (!this.rowHeard(ti)) continue;
                    const t = this.song.tracks[ti];
                    const p = this.placedAt(t, bar);
                    if (!p) continue;
                    // Where this bar falls inside the riff: a riff placed
                    // at bar 6 and three bars long is on its third bar
                    // when the clock reaches bar 8.
                    const riff = p.riff;
                    const into = (bar - p.at) * 16 + step;
                    for (const e of riff.events)
                        if (e.isNote && e.tick === into)
                            this.synth.hit(t.channel, e.data[0], e.data[1],
                                           Math.max(1, e.dur) * (15 / this.song.tempo));
                }
            }
            if (!editing && step === 0) this.followPlayhead(bar);
            this.draw();
            step++;
            if (step >= steps) {
                // Round again from the top of the loop, not from where
                // this pass happened to start.
                step = editing ? Math.min(this.startStep(), steps - 1) : 0;
                if (!editing) bar = bar >= to ? from : bar + 1;
            }
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

    /// Which tracks are off. Not in the .vbm, because the .vbm is the 2010
    /// format and has to stay readable by the app it came from.
    mutes() { return this.song.tracks.map(t => !!t.muted); },

    applyMutes(list) {
        if (!Array.isArray(list)) return;
        this.song.tracks.forEach((t, i) => { t.muted = !!list[i]; });
    },

    // ── Work in progress ──────────────────────────────────────────────────
    // Polish and Align do a second or two of real arithmetic on the main
    // thread. Without this the page freezes and then everything is
    // different, which reads as a hang followed by a surprise rather than
    // as work being done.

    _work: null,             // { label, at } while something is running

    /// Start showing progress. Returns a tick to hand to the DSP: calling
    /// it both updates the bar and, by being awaited, lets the browser
    /// paint — which is the part that actually matters.
    working(label) {
        this._work = { label, at: 0 };
        this.refreshAct();
        let last = 0;
        return async (fraction, what) => {
            if (!this._work) return;
            this._work.at = Math.max(0, Math.min(1, fraction || 0));
            if (what) this._work.label = what;
            const bar = document.getElementById('st-work-bar');
            if (bar) bar.style.width = Math.round(this._work.at * 100) + '%';
            const name = document.getElementById('st-work-name');
            if (name) name.textContent = this._work.label;
            // Yield to the browser, but not on every single call: a frame
            // is about 16ms and there is no point asking for more.
            const now = this._now();
            if (now - last < 16) return;
            last = now;
            await new Promise(r => (typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame(r) : setTimeout(r, 0)));
        };
    },

    finished(msg) {
        this._work = null;
        this.refreshAct();
        if (msg) this.say(msg);
    },

    /// The mix settings. Part of the beat, so they travel with it.
    mixSet: null,
    _mix: null,

    mix() {
        if (!this.mixSet) this.mixSet = Mixer.fresh();
        return this.mixSet;
    },

    /// Build the buses and put everything on them. Called once the context
    /// exists, and again whenever a setting changes — a Web Audio graph is
    /// not adjustable in shape, so changing it means building it.
    wire(actx, ctxInfo) {
        // A mixer is a nicety; undo and playback are not. If this context
        // cannot build one — an old browser missing a node, a stub — the
        // sound goes out the way it did before and nothing else notices.
        try {
            this._mix = Mixer.build(actx, this.mix(), ctxInfo);
        } catch (_) {
            this._mix = null;
            Tape.bus = null;
            if (this.synth && this.synth.route) this.synth.route(null, null);
            return null;
        }
        if (this.synth && this.synth.route)
            this.synth.route(this._mix.in.drums, this._mix.in.music);
        Tape.bus = this._mix.in.audio;
        return this._mix;
    },

    /// A changed fader has to reach the graph, and the cheapest correct way
    /// is to build a new one. Rebuilding mid-note would cut it off, so it
    /// waits for the transport to be stopped — or takes the cut, which at a
    /// fader move is what you would expect anyway.
    remix(quiet) {
        if (!this.synth || !this.synth.ctx) return;
        const playing = !!this._timer;
        if (playing) this._halt();
        this.wire(this.synth.ctx, this.context());
        this.keep();
        if (playing) this.play();
        if (!quiet) { this.refreshAct(); this.draw(); }
    },

    /// What the song is: tempo, key, groove. Everything automatic reads it,
    /// and it is worked out fresh rather than cached, because it is cheap
    /// and a stale key is worse than no key.
    context() {
        const c = Ctx.read(this.song, Tape);
        Tape.ctxInfo = c;
        return c;
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
        // Leave the head where it got to, so pressing play again carries
        // on rather than jumping back.
        if (this._timer && this._step >= 0 && this.view === 'arrange')
            this.head = this.liveHead();
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
            const first = Math.max(this.song.loopStart,
                                   Math.min(this.song.loopEnd, this.headBar()));
            for (let slot = first; slot <= this.song.loopEnd; slot++) {
                if (this.riffAt(t, slot)) continue;
                const riff = this.song.addRiff(new Riff(
                    (t.channel === 9 ? 'Beat ' : 'Riff ') + (this.song.riffs.length + 1), 1));
                this.place(t, slot, riff);
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

    /// What is under your thumbs. Not the grid rows — the grid is seven
    /// octaves and your thumbs are not.
    ///
    /// Low to high, left to right, so pad one is the kick and pad one is
    /// also the tonic. For a tuned track these are the notes of the song's
    /// key, which is why a part played in here lands in tune before the
    /// tuner has done anything.
    padPitches() {
        const t = this.song.tracks[this.track];
        if (!t) return [];
        if (t.channel === 9) return this.DRUM_ROWS.slice().reverse();

        const mus = this.context();
        const home = (this.gridFor(t).at || 60);
        const scale = mus.notes.slice().sort((a, b) => a - b);
        const base = Math.floor(home / 12) * 12;

        // Seven degrees and the octave above, starting at or below home.
        const out = [];
        for (let oct = 0; out.length < 8; oct++) {
            for (const pc of scale) {
                const p = base + pc + oct * 12;
                if (p < this.NOTE_LOW || p > this.NOTE_HIGH) continue;
                if (out.length < 8) out.push(p);
            }
            if (oct > 8) break;
        }
        return out;
    },

    padName(i) {
        const t = this.song.tracks[this.track];
        const p = this.padPitches()[i];
        if (p == null) return '';
        if (t.channel === 9) return this.DRUM_NAMES[p] || String(p);
        return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][p % 12]
             + (Math.floor(p / 12) - 1);
    },

    /// A pad hit: sound it now, write it where it belongs.
    pad(i) {
        const t = this.song.tracks[this.track];
        const pitch = this.padPitches()[i];
        if (pitch == null) return;
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
            // Copy, cut and paste go to the clips when clips are what you are
            // holding, and to the riffs otherwise.
            else if (k === 'a' && this.view === 'arrange') { ev.preventDefault(); this.selectAll(); }
            // Ctrl and the zoom keys, which is what every other app uses.
            else if (k === '=' || ev.key === '+') { ev.preventDefault(); this.zoomBy(1); }
            else if (k === '-') { ev.preventDefault(); this.zoomBy(-1); }
            else if (k === '0') { ev.preventDefault(); this.setZoom(1); this.draw(); }
            else if (k === 'c') { ev.preventDefault(); this._sel.length ? this.clipCopy() : this.copy(); }
            else if (k === 'x') { ev.preventDefault(); this._sel.length ? this.clipCut() : this.cut(); }
            else if (k === 'v') {
                ev.preventDefault();
                if (this._board) this.clipPaste(); else this.paste(ev.shiftKey);
            }
            return;
        }
        // The arrows move the cursor a cell at a time and drag the window
        // along behind it, so you can walk off the edge of the screen and
        // the screen comes with you. Shift extends the selection as it goes.
        const STEP = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (STEP[ev.key] && this.view === 'arrange' && !this._rec) {
            ev.preventDefault();
            const [dx, dy] = STEP[ev.key];
            this.bar = Math.max(0, Math.min(this.BARS - 1, this.bar + dx));
            const rows = this.rowCount();
            let row = Math.max(0, Math.min(rows - 1, this.cursorRow() + dy));
            // The cursor lives on a track; stepping onto an audio lane moves
            // the window there without pretending the cursor went too.
            if (row < this.song.tracks.length) this.track = row;
            this.reveal(row, this.bar);
            const here = this.objAt(row, this.bar);
            if (ev.shiftKey) { if (here) this.select(here, true); }
            else this.select(here, false);
            this.toolbar(); this.draw(); this.refreshAct();
            return;
        }
        if (ev.key === 'Home' && this.view === 'edit' && this.editing) {
            ev.preventDefault();
            this.setHead(this.bar * this.steps());
            this.scrollTo(0, null, true);
            return;
        }
        if (ev.key === 'Home' && this.view === 'arrange') {
            ev.preventDefault();
            this.bar = 0; this.setHead(0, true); this.scrollTo(0, null, true);
            this.toolbar(); this.draw();
            return;
        }
        if (ev.key === 'End' && this.view === 'arrange') {
            ev.preventDefault();
            this.bar = this.BARS - 1; this.scrollTo(this.maxBar0(), null, true);
            this.toolbar(); this.draw();
            return;
        }
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && this._sel.length && !this._rec) {
            ev.preventDefault();
            this.clipDrop();
            return;
        }
        if ((ev.key === 'b' || ev.key === 'B') && this.view === 'arrange' && !this._rec) {
            ev.preventDefault(); this.slice(); return;
        }
        if ((ev.key === 'm' || ev.key === 'M') && this.view === 'arrange' && !this._rec) {
            ev.preventDefault(); this.muteRow(this.cursorRow()); return;
        }
        if ((ev.key === 's' || ev.key === 'S') && this.view === 'arrange' && !this._rec) {
            ev.preventDefault(); this.soloRow(this.cursorRow()); return;
        }
        if (ev.key === 'Escape' && this.solo) { this.clearSolo(); return; }
        if (ev.key === 'Escape' && this._sel.length) {
            this.selectNone(); this.refreshAct(); this.draw();
            return;
        }
        if (!this._rec || ev.metaKey || ev.ctrlKey || ev.altKey) return;
        const n = '12345678'.indexOf(ev.key);
        if (n === -1 || n >= this.padPitches().length) return;
        ev.preventDefault();
        this.pad(n);
    },

    /// The pads, in place of the earnings panel while a take is running.
    /// Lowest sound on the left, so it reads like a keyboard and like a
    /// drum kit at the same time.
    recAct() {
        const act = document.getElementById('st-act');
        if (!act) return;
        const t = this.song.tracks[this.track];
        const pitches = this.padPitches();
        let pads = '';
        pitches.forEach((p, i) => {
            pads += '<button class="st-pad" onpointerdown="Studio.pad(' + i + ')">' +
                this.padName(i) + (i < 8 ? '<i>' + (i + 1) + '</i>' : '') + '</button>';
        });

        const where = this.view === 'edit'
            ? this.editing.name
            : t.name + ', bars ' + (this.song.loopStart + 1) + '&ndash;' + (this.song.loopEnd + 1);
        const inKey = t.channel === 9 ? '' :
            ' The pads are ' + this.context().name + ', so what you play is in key.';
        act.innerHTML =
            '<div class="st-note">Recording onto ' + where + '. Hit the pads in time, ' +
                'or keys 1&ndash;8 &mdash; each one lands on the nearest step. The loop keeps ' +
                'going, so you can build the part up over a few passes.' + inKey + '</div>' +
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
        // From the playhead to the end of the loop, so a take can start
        // anywhere rather than always at the top.
        const at = Math.max(this.song.loopStart,
                            Math.min(this.song.loopEnd, this.headBar()));
        const bars = Math.max(1, this.song.loopEnd + 1 - at);
        const spb = this.context().barSeconds;
        if (Tape.room(at, bars) === -1) {
            this.say('Every audio lane is busy over the loop. Clear one first.');
            return;
        }
        if (!Mic.arm(bars, spb, at)) { this.refreshAct(); return; }
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
        this.selectClip(clip);
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct();
        this.say('Take kept');
    },

    // ── Rows, and the objects on them ─────────────────────────────────────
    // The arrangement is one grid: the MIDI tracks, then the audio lanes. A
    // row index runs through both, which is what lets one selection, one
    // marquee and one clipboard cover the lot.

    // song.bars stays 1: a placement's position is a BAR, and how long a
    // riff is belongs to the riff. The format writes both, so this is the
    // same file either way — the original simply never varied the second.
    rowCount() { return this.song.tracks.length + this.audioRows(); },

    // ── Turning things off ────────────────────────────────────────────────

    /// Is this row muted in its own right?
    rowMuted(row) {
        if (row < this.song.tracks.length) return !!this.song.tracks[row].muted;
        const clips = Tape.inLane(this.laneOf(row));
        return clips.length > 0 && clips.every(c => !c.on);
    },

    rowSolo(row) { return !!(this.solo && this.solo.indexOf(row) !== -1); },

    /// What actually gets heard. A solo anywhere silences everything that is
    /// not in it, which is the whole point of a solo.
    rowHeard(row) {
        if (this.solo && this.solo.length) return this.rowSolo(row);
        return !this.rowMuted(row);
    },

    /// Mute is a property of the song and saves with it. Audio has no
    /// per-lane flag, so a lane is muted by muting what is on it — which is
    /// also what the clip panel's Mute does, so the two agree.
    muteRow(row) {
        if (row < 0 || row >= this.rowCount()) return;
        this.mark('Mute');
        const on = !this.rowMuted(row);
        if (row < this.song.tracks.length) {
            this.song.tracks[row].muted = on;
        } else {
            for (const c of Tape.inLane(this.laneOf(row))) Tape.set(c, 'on', !on);
        }
        this.keep();
        this.toolbar(); this.draw(); this.refreshAct();
        this.say((on ? 'Muted ' : 'Unmuted ') + this.rowName(row));
    },

    /// Solo is not stored. It is something you do while working, and a beat
    /// that opened silent because of a solo left on last week would look
    /// like data loss rather than a setting.
    soloRow(row) {
        if (row < 0 || row >= this.rowCount()) return;
        const list = this.solo ? this.solo.slice() : [];
        const at = list.indexOf(row);
        if (at === -1) list.push(row); else list.splice(at, 1);
        this.solo = list.length ? list : null;
        this.toolbar(); this.draw(); this.refreshAct();
        this.say(this.solo
            ? 'Soloing ' + this.solo.map(r => this.rowName(r)).join(' and ')
            : 'Everything back on');
    },

    clearSolo() {
        if (!this.solo) return;
        this.solo = null;
        this.toolbar(); this.draw(); this.refreshAct();
        this.say('Everything back on');
    },

    rowName(row) {
        if (row < this.song.tracks.length) return this.song.tracks[row].name;
        return this.laneOf(row) === 0 ? 'Audio' : 'Aud ' + (this.laneOf(row) + 1);
    },

    /// The row the cursor is on. It only ever sits on a track, but moving
    /// through the grid has to count rows, not tracks.
    cursorRow() { return Math.min(this.track, this.song.tracks.length - 1); },
    laneOf(row) { return row - this.song.tracks.length; },

    /// The object at a row and bar, as a selection item, or null.
    objAt(row, bar) {
        if (row < 0 || bar < 0) return null;
        if (row < this.song.tracks.length) {
            // A riff covers every bar of its span, so pointing anywhere
            // inside it means that riff.
            const t = this.song.tracks[row];
            const p = t && this.placedAt(t, bar);
            return p ? { k: 'riff', t: row, at: p.at } : null;
        }
        const c = Tape.at(this.laneOf(row), bar);
        return c ? { k: 'clip', id: c.id } : null;
    },

    same(a, b) {
        return !!a && !!b && a.k === b.k &&
            (a.k === 'clip' ? a.id === b.id : a.t === b.t && a.at === b.at);
    },

    picked(o) { return this._sel.some(x => this.same(x, o)); },

    /// The last object picked — what the single-object controls act on.
    focus() { return this._sel[this._sel.length - 1] || null; },

    /// The focused object as an audio clip, or null when it is a riff. The
    /// clip dials need a clip and should not guess.
    focusClip() { return this.clipOf(this.focus()); },

    clipOf(o) {
        return o && o.k === 'clip' ? Tape.clips.find(c => c.id === o.id) || null : null;
    },

    /// An audio clip as a selection item. The selection holds plain data so
    /// that an undo snapshot can store it, which means a clip has to be
    /// turned into one rather than dropped in whole.
    asItem(clip) { return clip ? { k: 'clip', id: clip.id } : null; },
    selectClip(clip, add) { this.select(this.asItem(clip), add); },

    selClips() {
        const out = [];
        for (const o of this._sel) { const c = this.clipOf(o); if (c) out.push(c); }
        return out;
    },

    /// The selected riff placements, resolved. Anything that has gone since
    /// is left out rather than crashing whatever asked for it.
    selPlaces() {
        const out = [];
        for (const o of this._sel) {
            if (o.k !== 'riff') continue;
            const t = this.song.tracks[o.t];
            const p = t && t.placements.find(x => x.at === o.at);
            if (p) out.push({ ti: o.t, track: t, p });
        }
        return out;
    },

    /// Pick an object. `add` toggles it in or out instead of replacing the
    /// selection, which is what shift-tap and shift-drag do.
    select(o, add) {
        if (!o) { if (!add) this.selectNone(); return; }
        if (!add) { this._sel = [o]; return; }
        const i = this._sel.findIndex(x => this.same(x, o));
        if (i === -1) this._sel.push(o); else this._sel.splice(i, 1);
    },

    selectNone() { this._sel = []; },

    /// Everything in the playlist — riffs and audio alike.
    selectAll() {
        const out = [];
        this.song.tracks.forEach((t, ti) =>
            t.placements.forEach(p => out.push({ k: 'riff', t: ti, at: p.at })));
        for (const c of Tape.clips) out.push({ k: 'clip', id: c.id });
        this._sel = out;
        if (Tape.clips.length) this._audio = true;
        this.toolbar(); this.layout(); this.refreshAct(); this.draw();
        this.say(out.length ? out.length + ' selected' : 'The playlist is empty');
    },

    /// Everything in the focused object's row.
    selectRow() {
        const o = this.focus();
        if (!o) return;
        const row = o.k === 'clip'
            ? this.song.tracks.length + (this.clipOf(o) || { lane: 0 }).lane
            : o.t;
        const out = [];
        for (let bar = 0; bar < this.BARS; bar++) {
            const x = this.objAt(row, bar);
            // A four-bar clip answers for all four of them, so skip repeats.
            if (x && !out.some(y => this.same(x, y))) out.push(x);
        }
        this._sel = out;
        this.refreshAct(); this.draw();
        this.say(out.length + (out.length === 1 ? ' object' : ' objects') + ' in this row');
    },

    selectLane() { this.selectRow(); },

    // ── One clipboard ─────────────────────────────────────────────────────
    // It holds the SHAPE of a selection, not its position: every object keeps
    // its row and its distance from the leftmost bar of the group. A paste
    // lands at the cursor bar, so the spacing survives and everything stays on
    // the track or lane it came from — which is what you want when you copy
    // four bars of a song and drop them in again later.

    clipCopy() { this.copy(); },
    clipCut() { this.cut(); },
    clipPaste(asNew) { this.paste(asNew); },

    /// With nothing selected, the cursor cell is the selection: tapping a
    /// cell and pressing Copy should do the obvious thing.
    _orCursor() {
        if (this._sel.length) return true;
        const here = this.objAt(this.track, this.bar);
        if (!here) return false;
        this._sel = [here];
        return true;
    },

    copy() {
        if (!this._orCursor()) { this.say('Nothing selected'); return; }
        const places = this.selPlaces(), clips = this.selClips();
        if (!places.length && !clips.length) { this.say('Nothing selected'); return; }

        // The anchor is a bar, so a riff and a clip copied together
        // keep their spacing on a grid that measures bars.
        let bar0 = Infinity;
        for (const x of places) bar0 = Math.min(bar0, x.p.at);
        for (const c of clips) bar0 = Math.min(bar0, c.at);

        this._board = {
            count: places.length + clips.length,
            riffs: places.length,
            clips: clips.length,
            items: places.map(x => ({ k: 'riff', t: x.ti, dBar: x.p.at - bar0, riff: x.p.riff }))
                .concat(clips.map(c => ({ k: 'clip', lane: c.lane, dBar: c.at - bar0, clip: c }))),
        };
        this.toolbar(); this.refreshAct();
        this.say('Copied ' + this._board.count +
                 (this._board.count === 1 ? ' object' : ' objects'));
    },

    cut() {
        if (!this._orCursor()) { this.say('Nothing selected'); return; }
        this.mark('Cut');
        this.copy();
        const n = this._board ? this._board.count : 0;
        if (!n) { this._undo.pop(); return; }
        this._wipe();
        this.selectNone();
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct();
        this.say('Cut ' + n + (n === 1 ? ' object' : ' objects'));
    },

    /// Take the selection off the arrangement. Riffs stay in the song until
    /// tidy() finds nothing pointing at them — and the clipboard counts as
    /// pointing at them, which is what lets a cut be pasted back.
    _wipe() {
        for (const x of this.selPlaces()) {
            const i = x.track.placements.indexOf(x.p);
            if (i !== -1) x.track.placements.splice(i, 1);
        }
        Tape.removeMany(this.selClips());
        this.tidy();
    },

    /// Paste at the cursor bar. `asNew` is Vibe's distinction: without it a
    /// riff is REPEATED — the same riff object, so editing it changes every
    /// repeat — and with it each one is an independent copy.
    paste(asNew) {
        if (!this._board) { this.say('Nothing copied yet'); return; }
        this.mark(asNew ? 'Paste as new' : 'Paste');

        const made = [];
        let short = 0, adopted = 0;
        for (const it of this._board.items) {
            const at = this.bar + it.dBar;
            if (at < 0 || at >= this.BARS) { short++; continue; }

            if (it.k === 'riff') {
                const t = this.song.tracks[it.t];
                if (!t) { short++; continue; }
                // A riff from another beat has to be adopted, or the
                // placement points at something the file does not contain
                // and the bar comes back empty. Across songs there is no
                // riff to share, so a copy is the only thing Repeat can
                // honestly mean.
                const foreign = this.song.riffs.indexOf(it.riff) === -1;
                const riff = (asNew || foreign)
                    ? this.song.addRiff(Riff.copy(it.riff))
                    : it.riff;
                if (foreign) adopted++;
                this.place(t, at, riff);
                made.push({ k: 'riff', t: it.t, at });
            } else {
                const twin = Tape.twin(it.clip);
                twin.at = at;
                const lane = Tape.roomNear(at, twin.bars, it.lane);
                if (lane === -1) { short++; continue; }
                twin.lane = lane;
                Tape.clips.push(twin);
                Tape._json = undefined;
                made.push({ k: 'clip', id: twin.id });
            }
        }

        if (!made.length) {
            this._undo.pop();                  // nothing happened, no history
            this.say('No room to paste that');
            return;
        }
        this._sel = made;
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct();
        this.say('Pasted ' + made.length + (made.length === 1 ? ' object' : ' objects') +
                 ' at bar ' + (this.bar + 1) +
                 (asNew ? ' as copies' : '') +
                 (adopted && !asNew ? ' — ' + adopted +
                    (adopted === 1 ? ' riff came' : ' riffs came') + ' from another beat, so ' +
                    (adopted === 1 ? 'it is a copy' : 'they are copies') : '') +
                 (short ? ' — ' + short + ' had nowhere to go' : ''));
    },

    /// A clip called "Take 3" tells you nothing a month later.
    /// Riffs have names too, and "Riff 7" is no more use than "Take 3".
    clipRename() {
        const o = this.focus();
        if (!o) return;
        const clip = this.clipOf(o);
        const riff = clip ? null : (this.song.tracks[o.t] || { placements: [] })
            .placements.filter(p => p.at === o.at).map(p => p.riff)[0];
        const thing = clip || riff;
        if (!thing) return;

        const name = (prompt('Name this ' + (clip ? 'clip' : 'riff'), thing.name) || '').trim();
        if (!name) return;
        this.mark('Rename');
        // A riff name over 20 characters writes a file the original cannot
        // read back the same way, which is why Vibe caps it there.
        if (clip) Tape.set(clip, 'name', name.slice(0, 18));
        else riff.name = name.slice(0, 20);
        this.keep();
        this.refreshAct(); this.draw();
    },

    clipDrop() { this.clear(); },

    /// Cut the selected clips at the cursor. Two clips over one recording:
    /// nothing is copied and nothing is thrown away, so the halves can be
    /// put back by deleting one and widening the other.
    slice() {
        const at = this.bar;
        const cut = this.selClips().filter(c => at > c.at && at < c.at + c.bars);
        if (!cut.length) {
            this.say(this.selClips().length
                ? 'Put the cursor inside a clip to slice it'
                : 'Pick some audio first');
            return;
        }

        this.mark(cut.length > 1 ? 'Slice' : 'Slice clip');
        const ctx = this.context();
        const made = [];
        for (const c of cut) {
            const right = Tape.twin(c);
            const before = at - c.at;                    // bars kept on the left

            right.at = at;
            right.bars = c.bars - before;
            right.lane = c.lane;
            // A loop was already restarting; let both halves go on doing
            // it. Anything else advances into the recording by as much
            // time as the left half takes.
            if (!c.loop) {
                right.lead = c.lead + before * ctx.barSeconds * Tape.rate(c, ctx.barSeconds);
                right.seconds = Math.max(0.01, c.seconds - before * ctx.barSeconds);
            }
            right.name = c.name;
            Tape.clips.push(right);

            c.bars = before;
            if (!c.loop) c.seconds = before * ctx.barSeconds;
            c.render = null;
            right.render = null;
            c.peaks = Tape.peaks(c);
            right.peaks = Tape.peaks(right);
            Tape.stopOne(c);
            made.push(right);
        }
        Tape._json = undefined;

        // Keep both halves selected: the usual reason to slice is to do
        // something to one of them next, and hunting for them afterwards
        // is a step nobody wants.
        for (const r of made) this.select(this.asItem(r), true);
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct(); this.draw();
        this.say('Sliced at bar ' + (at + 1));
    },

    // ── Dragging things about ─────────────────────────────────────────────
    // Press on something and you move it; press on nothing and you draw a
    // box. Every arrangement window works this way and it is worth not
    // being original about.

    _move: null,

    /// Start a move. Positions are remembered as they were, so the drag is
    /// always measured from the start rather than accumulated — which is
    /// what stops a slow drag over a blocked bar from creeping.
    moveStart(o, px, py) {
        if (!this.picked(o)) this.select(o, false);
        const items = [];
        for (const x of this._sel) {
            if (x.k === 'clip') {
                const c = this.clipOf(x);
                if (c) items.push({ k: 'clip', c, at: c.at, lane: c.lane });
            } else {
                const t = this.song.tracks[x.t];
                const p = t && t.placements.find(q => q.at === x.at);
                if (p) items.push({ k: 'riff', t: x.t, at: x.at, riff: p.riff });
            }
        }
        if (!items.length) return false;
        this._move = { items, px, py, dBar: 0, dRow: 0, marked: false };
        return true;
    },

    /// Could the selection sit here? Nothing in the selection blocks
    /// anything else in it, which is what lets a run of touching clips
    /// move as one.
    moveFits(dBar, dRow) {
        const mine = new Set(this._move.items.map(i => i.k === 'clip' ? i.c : i.riff));
        for (const i of this._move.items) {
            const at = i.at + dBar;
            if (at < 0 || at >= this.BARS) return false;

            if (i.k === 'clip') {
                const lane = i.lane + dRow;
                if (lane < 0 || lane >= Tape.MAX_LANES) return false;
                if (at + i.c.bars > this.BARS) return false;
                const clash = Tape.clips.some(o => !mine.has(o) && o.lane === lane &&
                    at < o.at + o.bars && o.at < at + i.c.bars);
                if (clash) return false;
            } else {
                const ti = i.t + dRow;
                if (ti < 0 || ti >= this.song.tracks.length) return false;
                const t = this.song.tracks[ti];
                const clash = t.placements.some(p => !mine.has(p.riff) && p.at === at);
                if (clash) return false;
            }
        }
        return true;
    },

    /// Put everything where the drag says. Taken off and put back, rather
    /// than edited in place, so a move across rows is one operation.
    moveTo(dBar, dRow) {
        const m = this._move;
        // Lift everything out first, or a clip can collide with where
        // another one has not left yet.
        for (const i of m.items) {
            if (i.k === 'clip') continue;
            const t = this.song.tracks[i.t];
            const at = t.placements.findIndex(p => p.at === i.at && p.riff === i.riff);
            if (at !== -1) t.placements.splice(at, 1);
        }
        for (const i of m.items) {
            if (i.k === 'clip') {
                i.c.at = i.at + dBar;
                i.c.lane = i.lane + dRow;
                Tape.stopOne(i.c);
            } else {
                const t = this.song.tracks[i.t + dRow];
                this.place(t, i.at + dBar, i.riff);
            }
        }
        Tape._json = undefined;

        // The selection names a riff by where it is, so it moves too.
        this._sel = m.items.map(i => i.k === 'clip'
            ? { k: 'clip', id: i.c.id }
            : { k: 'riff', t: i.t + dRow, at: i.at + dBar });
        m.dBar = dBar; m.dRow = dRow;
    },

    moveDrag(px, py) {
        const m = this._move, c = this.cell;
        if (!m || !c) return;
        let dBar = Math.round((px - m.px) / c.w);
        let dRow = Math.round((py - m.py) / c.h);
        if (dBar === m.dBar && dRow === m.dRow) return;

        // Go as far as it can rather than nowhere at all: a drag into a
        // wall should stop against the wall, not wherever the pointer
        // last happened to be sampled — which makes a fast drag travel
        // less far than a slow one over the same path.
        //
        // The ends of the arrangement are arithmetic, so they are clamped
        // outright; only collisions need walking, and there are never many
        // to walk past.
        let lowBar = Infinity, highEnd = 0, lowRow = Infinity, highRow = 0;
        for (const i of m.items) {
            lowBar = Math.min(lowBar, i.at);
            highEnd = Math.max(highEnd, i.at + (i.k === 'clip' ? i.c.bars : 1));
            const r = i.k === 'clip' ? i.lane : i.t;
            lowRow = Math.min(lowRow, r);
            highRow = Math.max(highRow, r);
        }
        const rowTop = m.items[0].k === 'clip' ? Tape.MAX_LANES : this.song.tracks.length;
        dBar = Math.max(-lowBar, Math.min(this.BARS - highEnd, dBar));
        dRow = Math.max(-lowRow, Math.min(rowTop - 1 - highRow, dRow));

        const step = (want, have) => (want > have ? -1 : want < have ? 1 : 0);
        let guard = this.BARS + rowTop + 4;
        while (guard-- > 0 && !this.moveFits(dBar, dRow)) {
            if (dBar === m.dBar && dRow === m.dRow) return;   // cannot move at all
            // Give up the row first: sideways is nearly always what was
            // meant, and a blocked lane should not stop a bar move.
            if (dRow !== m.dRow) dRow += step(dRow, m.dRow);
            else dBar += step(dBar, m.dBar);
        }
        // The walk can run out before it finds room. Applying the delta
        // anyway is how a clip ends up at bar 90 of a 32-bar song.
        if (!this.moveFits(dBar, dRow)) return;
        if (dBar === m.dBar && dRow === m.dRow) return;

        if (!m.marked) { this.mark('Move'); m.marked = true; }
        this.moveTo(dBar, dRow);
        this.draw();
    },

    moveEnd() {
        const m = this._move;
        this._move = null;
        if (!m) return;
        if (!m.marked) return;                          // never actually moved
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct(); this.draw();
        const n = m.items.length;
        this.say('Moved ' + n + (n === 1 ? ' object' : ' objects') +
            (m.dBar ? ' ' + Math.abs(m.dBar) + (m.dBar > 0 ? ' bars later' : ' bars earlier') : '') +
            (m.dRow ? ', ' + Math.abs(m.dRow) + (m.dRow > 0 ? ' rows down' : ' rows up') : ''));
    },

    // ── Making it fit, and making it sound like a record ──────────────────

    // ── Beat sync ─────────────────────────────────────────────────────────
    // Tempo and phase. Matching only the first is what DJ software calls
    // Tempo Sync, and it leaves two things drifting against each other
    // because nothing has said where one is.

    _ask: null,              // a decision waiting about an imported song

    /// Put a clip in time with the song: stretch it to the project tempo,
    /// and start it from its own first beat rather than from whatever
    /// silence happens to be in front of it.
    async syncClip(clip, quiet) {
        if (!clip || !clip.buffer) return false;
        const ctx = this.context();

        // Phase first, because it costs nothing and the stretch is measured
        // from what is left.
        if (clip.grid && clip.grid.downbeat > 0.012) clip.lead = clip.grid.downbeat;

        const moved = await this.fitClip(clip, true);
        if (!quiet) {
            this.say(moved
                ? 'Synced — ' + clip.bars + (clip.bars === 1 ? ' bar' : ' bars') +
                  (clip.grid ? ', from its own downbeat' : '')
                : 'Already in time');
        }
        return moved;
    },

    /// Nudge the grid a beat either way. This is the one correction that
    /// matters, because the way automatic detection fails is by anchoring
    /// on the snare instead of the kick — confidently, and exactly half a
    /// bar out.
    gridNudge(beats) {
        const clips = this.selClips().filter(c => c.grid);
        if (!clips.length) { this.say('No beatgrid on that'); return; }
        this.mark('Move the beatgrid', 'grid');
        for (const c of clips) {
            const beat = 60 / (c.grid.bpm || this.song.tempo);
            c.grid.downbeat = Math.max(0, c.grid.downbeat + beats * beat);
            c.lead = c.grid.downbeat;
            c.render = null;
            c.peaks = Tape.peaks(c);
        }
        this.keep();
        this.refreshAct(); this.draw();
        this.say((beats > 0 ? 'Grid a beat later' : 'Grid a beat earlier'));
    },

    /// Halve or double the detected tempo. The other way detection fails,
    /// and the other correction, kept separate from phase because fixing
    /// one should not disturb the other.
    gridTempo(by) {
        const clips = this.selClips().filter(c => c.grid);
        if (!clips.length) { this.say('No beatgrid on that'); return; }
        this.mark('Change the beatgrid tempo');
        for (const c of clips) c.grid.bpm = c.grid.bpm * by;
        this.keep();
        this.refreshAct();
        this.say('Beatgrid now ' + Math.round(clips[0].grid.bpm) + ' bpm — sync it again');
    },

    /// Take the project tempo from an imported record rather than the other
    /// way round. For a two-minute song that is almost always the right
    /// answer: stretching a whole record to fit a sketch is vandalism.
    adoptTempo() {
        const a = this._ask;
        if (!a || !a.heard || !a.heard.tempo) return;
        const bpm = Math.round(a.heard.tempo);
        this.mark('Take the tempo from the import');
        this.setTempo(bpm);
        if (a.clip.grid) { a.clip.lead = a.clip.grid.downbeat || 0; a.clip.render = null; }
        // Its bars are now whatever it is, at the song's new tempo.
        const bars = Math.max(1, Math.round(a.clip.buffer.duration / this.context().barSeconds));
        Tape.place(a.clip, null, Math.min(this.BARS, bars));
        this._ask = null;
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct(); this.draw();
        this.say('Song is now ' + bpm + ' bpm, to match the import');
    },

    async stretchImport() {
        const a = this._ask;
        if (!a) return;
        this._ask = null;
        this.mark('Stretch the import');
        await this.syncClip(a.clip, true);
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct(); this.draw();
        this.say('Stretched to ' + this.song.tempo + ' bpm');
    },

    leaveImport() {
        this._ask = null;
        this.refreshAct();
        this.say('Left as it is');
    },

    /// Stretch a clip so it covers whole bars of THIS song, without moving
    /// its pitch. Returns true if it actually needed it.
    async fitClip(clip, quiet) {
        if (!clip || !clip.buffer) return false;
        const ctx = this.context();
        // Measured from the downbeat, since anything before it is not part
        // of the loop.
        const usable = Math.max(0.05, clip.buffer.duration - (clip.lead || 0));
        const plan = Flex.fit(usable, ctx, clip.buffer.getChannelData(0),
                              clip.buffer.sampleRate);
        if (!plan || !plan.reach) {
            if (!quiet) this.say('That is too far from the tempo to stretch musically');
            return false;
        }
        if (plan.already) {
            if (!quiet) this.say('Already in time — ' + plan.bars + ' bars');
            return false;
        }

        // Both are bars now, so there is nothing to convert.
        Tape.place(clip, null, Math.max(1, Math.min(this.BARS, Math.round(plan.bars))));
        clip.buffer = Flex.toLength(this.synth.ctx, clip.buffer, plan.bars * ctx.barSeconds);
        clip.seconds = clip.buffer.duration;
        clip.lead = 0;
        clip.render = null;
        clip.peaks = Tape.peaks(clip);
        // It is in time now, so the pitch-shifting kind of fit is not
        // wanted on top of it.
        clip.fit = false;
        if (!quiet) this.say('Stretched to ' + plan.bars +
                             (plan.bars === 1 ? ' bar' : ' bars') + ' — pitch unchanged');
        return true;
    },

    async fitSelection() {
        const clips = this.selClips();
        if (!clips.length) { this.say('Pick some audio first'); return; }
        this.mark('Beat sync');
        await this.synth.start();
        Tape.ctx = this.synth.ctx;
        this.context();              // the tape rebuilds its processing against this
        await Tape.ready(this.synth.ctx);
        let done = 0;
        for (const c of clips) {
            // Anything without a grid gets listened to now rather than
            // being stretched on the strength of its length alone.
            if (!c.grid && c.buffer) {
                const heard = Listen.read(c.buffer, this.context());
                if (heard && heard.tempo)
                    c.grid = { bpm: heard.tempo, downbeat: heard.downbeat || 0, conf: heard.pulse };
                if (heard) c.kind2 = c.kind2 || heard.kind;
            }
            if (await this.syncClip(c, true)) done++;
        }
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct(); this.draw();
        this.say(done ? done + (done === 1 ? ' clip' : ' clips') + ' beat-synced'
                      : 'Already in time');
    },

    /// Move the words onto the grid. The gaps between them stretch; the
    /// words themselves do not.
    async alignSelection() {
        const clips = this.selClips();
        if (!clips.length) { this.say('Pick some audio first'); return; }
        await this.synth.start();
        Tape.ctx = this.synth.ctx;
        this.context();              // the tape rebuilds its processing against this
        await Tape.ready(this.synth.ctx);
        const ctx = this.context();
        this.mark('Align to the beat');

        const tick = this.working('Finding the words');
        let moved = 0;
        for (let k = 0; k < clips.length; k++) {
            const c = clips[k];
            await tick(k / clips.length, 'Finding the words' +
                (clips.length > 1 ? ' · ' + (k + 1) + ' of ' + clips.length : ''));
            const from = c.render || c.buffer;
            if (!from) continue;
            const out = this.synth.ctx.createBuffer(
                from.numberOfChannels, from.length, from.sampleRate);
            let first = null;
            for (let ch = 0; ch < from.numberOfChannels; ch++) {
                // Every channel has to be warped the same way, or the take
                // comes apart in the middle. The first channel decides.
                const done = first
                    ? { data: Flex.warp(from.getChannelData(ch), from.sampleRate,
                                        first.marks, from.duration) }
                    : Flex.align(from.getChannelData(ch), from.sampleRate, ctx,
                                 { strength: 0.9 });
                if (!first) first = done;
                out.getChannelData(ch).set(done.data.subarray(0, from.length));
            }
            if (first && first.moved) {
                c.render = out;
                c.peaks = Tape.peaks(c);
                moved += first.moved;
            }
            await tick((k + 1) / clips.length, 'Moving them onto the beat');
        }
        this.finished();

        if (!moved) { this._undo.pop(); this.say('Nothing was far enough off to move'); return; }
        this.keep();
        this.refreshAct(); this.draw();
        this.say('Moved ' + moved + (moved === 1 ? ' word' : ' words') + ' onto the beat');
    },

    /// One button. Gate it, tune it to the song's key, and put the chain on.
    async polish(presetId) {
        const clips = this.selClips();
        if (!clips.length) { this.say('Pick a take first'); return; }
        await this.synth.start();
        Tape.ctx = this.synth.ctx;
        this.context();              // the tape rebuilds its processing against this
        await Tape.ready(this.synth.ctx);
        const ctx = this.context();
        this.mark('Polish');

        const tick = this.working('Listening to the take');
        let done = 0, report = null;
        try {
            for (let i = 0; i < clips.length; i++) {
                const c = clips[i];
                if (!c.buffer) continue;
                c.fx = Voice.fresh(presetId || 'lead', ctx);
                const out = await Voice.render(this.synth.ctx, c.buffer, c.fx, ctx,
                    (f, what) => tick((i + f) / clips.length,
                        (what || 'Working') + (clips.length > 1
                            ? ' · ' + (i + 1) + ' of ' + clips.length : '')));
                if (out) {
                    c.render = out;
                    if (!report && out._report) report = out._report;
                    c.peaks = Tape.peaks(c);
                }
                done++;
            }
        } finally {
            this.finished();
        }

        this.keep();
        this.refreshAct(); this.draw();
        this.say(done
            ? 'Tuned to ' + ctx.name + (ctx.confident ? '' : ' (best guess)') +
              (report ? ' · ' + report.moved + ' of ' + report.voiced + ' moved' : '')
            : 'Nothing to work on');
    },

    /// Take the processing off and hear what was actually sung.
    unpolish() {
        const clips = this.selClips();
        if (!clips.length) return;
        this.mark('Remove processing');
        for (const c of clips) { c.fx = null; c.render = null; c.peaks = Tape.peaks(c); }
        this.keep();
        this.refreshAct(); this.draw();
        this.say('Back to the raw take');
    },

    clipSet(field, value) {
        const clips = this.selClips();
        if (!clips.length) return;
        this.mark(field === 'on' ? (value ? 'Unmute' : 'Mute')
                : field === 'loop' ? 'Loop' : field === 'fit' ? 'Fit' : 'Clip');
        for (const c of clips) Tape.set(c, field, value);
        this.keep();
        this.refreshAct(); this.draw();
    },

    /// Move the selection along the bars — riffs and audio together, in one
    /// step of history. Nothing moves unless everything can.
    clipMove(by) {
        if (!this._sel.length || !by) return;
        const places = this.selPlaces(), clips = this.selClips();
        if (!places.length && !clips.length) return;

        // Never off the left end, never past the last bar.
        let near = Infinity, far = 0;
        for (const x of places) { near = Math.min(near, x.p.at); far = Math.max(far, x.p.at + 1); }
        for (const c of clips) { near = Math.min(near, c.at); far = Math.max(far, c.at + c.bars); }
        if ((by < 0 && near + by < 0) || (by > 0 && far + by > this.BARS)) return;

        // A placement in the selection is not an obstacle to another one, and
        // the order matters for the same reason it does on the tape: going
        // right, the rightmost has to move first or it blocks its neighbour.
        const mine = new Set(places.map(x => x.p));
        for (const x of places) {
            const want = x.p.at + by;
            if (x.track.placements.some(p => !mine.has(p) && p.at === want)) {
                this.say('Something is in the way');
                return;
            }
        }
        if (clips.length && !Tape.canShift(clips, by)) { this.say(Tape.error); return; }

        this.mark(this._sel.length > 1 ? 'Move' : 'Move one', 'move');
        const order = places.slice().sort((a, b) => by > 0 ? b.p.at - a.p.at : a.p.at - b.p.at);
        for (const x of order) x.p.at += by;
        if (clips.length) Tape.shift(clips, by);

        // The selection names riffs by where they are, so it moves with them.
        this._sel = this._sel.map(o => o.k === 'riff' ? { k: 'riff', t: o.t, at: o.at + by } : o);
        this.keep();
        this.toolbar(); this.layout(); this.refreshAct(); this.draw();
    },

    /// Only audio has a length to change: a riff is one bar, by definition.
    clipSpan(by) {
        const clips = this.selClips();
        if (!clips.length) { this.say('A riff is one bar — only audio stretches'); return; }
        this.mark(clips.length > 1 ? 'Resize' : 'Resize one', 'span');
        if (Tape.stretch(clips, by, this.BARS)) { this.keep(); this.toolbar(); this.layout(); }
        else this._undo.pop();
        this.refreshAct(); this.draw();
        if (Tape.error) this.say(Tape.error);
    },

    async clipHear() {
        if (!this.focusClip()) return;
        await this.synth.start();
        Tape.ctx = this.synth.ctx;
        this.context();              // the tape rebuilds its processing against this
        await Tape.ready(this.synth.ctx);
        // One at a time would be a mess; the focused clip is the one you
        // just touched, which is the one you meant.
        Tape.audition(this.focusClip(), this.context().barSeconds);
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
        if (!this.selClips().length) return;
        this.mark(field === 'gain' ? 'Clip level' : 'Clip nudge', 'clip-' + field);
        for (const c of this.selClips()) Tape.set(c, field, value);
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

    // ── The mix ───────────────────────────────────────────────────────────

    mixPanel() {
        this._mixOpen = !this._mixOpen;
        if (this._mixOpen) this._audio = false;
        this.refreshAct(); this.toolbar(); this.layout();
    },

    /// A fader moved. Web Audio graphs are not reshapeable, so a change
    /// means rebuilding one — cheap, and the only honest way to make a
    /// setting that adds or removes a node take effect.
    setMix(bus, field, value, id, text) {
        const set = this.mix();
        if (!set[bus]) return;
        // Before the change, not after — a snapshot of the new value is not
        // a snapshot of anything.
        this.mark('Mix', 'mix-' + bus + '-' + field);
        if (field.indexOf('.') !== -1) {
            const [a, b] = field.split('.');
            set[bus][a][b] = value;
        } else {
            set[bus][field] = value;
        }
        const n = document.getElementById(id);
        if (n) n.textContent = text;
        this.remix(true);
    },

    toggleMix(bus, field) {
        const set = this.mix();
        const [a, b] = field.split('.');
        this.mark('Mix');
        set[bus][a][b] = !set[bus][a][b];
        this.remix();
    },

    resetMix() {
        this.mark('Reset the mix');
        this.mixSet = Mixer.fresh();
        this.remix();
        this.say('Back to the standard mix');
    },

    mixAct() {
        const act = document.getElementById('st-act');
        if (!act) return;
        const m = this.mix();
        const pct = v => Math.round(v * 100) + '%';
        const db = v => (v > 0 ? '+' : '') + v.toFixed(1) + 'dB';

        /// A fader. The read-out updates itself so the panel is not rebuilt
        /// on every pixel of a drag.
        const fader = (bus, field, label, min, max, step, value, fmt) => {
            const id = 'mx-' + bus + '-' + field.replace('.', '-');
            return '<label>' + label +
                '<input type="range" min="' + min + '" max="' + max + '" step="' + step +
                '" value="' + value + '" oninput="Studio.setMix(\'' + bus + '\',\'' +
                field + '\',+this.value,\'' + id + '\',' +
                (fmt === 'db' ? 'Studio._db(+this.value)' : 'Studio._pct(+this.value)') + ')">' +
                '<b id="' + id + '">' + (fmt === 'db' ? db(value) : pct(value)) + '</b></label>';
        };

        act.innerHTML =
            '<div class="ai-key">Master &middot; everything is summed here, so these ' +
                'levels mean something against each other</div>' +
            '<div class="mic-row mic-dials">' +
                fader('master', 'gain', 'Master', 0, 1.4, 0.01, m.master.gain) +
                fader('drums', 'gain', 'Drums', 0, 2, 0.01, m.drums.gain) +
            '</div>' +
            '<div class="mic-row mic-dials">' +
                fader('music', 'gain', 'Synths', 0, 2, 0.01, m.music.gain) +
                fader('audio', 'gain', 'Tape', 0, 2, 0.01, m.audio.gain) +
            '</div>' +
            '<div class="ai-key">The kit</div>' +
            '<div class="mic-row mic-dials">' +
                fader('drums', 'punch', 'Punch', 0, 1, 0.01, m.drums.punch) +
                fader('drums', 'weight', 'Weight', 0, 1, 0.01, m.drums.weight) +
            '</div>' +
            '<div class="mic-row mic-dials">' +
                fader('drums', 'parallel', 'Behind', 0, 1, 0.01, m.drums.parallel) +
                fader('drums', 'kick', 'Kick', -6, 8, 0.1, m.drums.kick, 'db') +
            '</div>' +
            '<div class="mic-row mic-btns">' +
                '<button class="' + (m.master.glue.on ? 'st-hot' : '') +
                    '" onclick="Studio.toggleMix(\'master\',\'glue.on\')" ' +
                    'title="Gentle compression over the whole mix">Glue</button>' +
                '<button onclick="Studio.resetMix()">Reset</button>' +
                '<button onclick="Studio.mixPanel()">Done</button>' +
            '</div>' +
            '<div class="st-note">Punch lets the stick through before it clamps. ' +
                'Behind is a squashed copy slid under the kit &mdash; it makes the ' +
                'drums bigger without making them louder. Nothing gets past the ' +
                'ceiling, so it will not crackle.</div>' +
            '<div class="st-say"></div>';
    },

    _pct(v) { return Math.round(v * 100) + '%'; },
    _db(v) { return (v > 0 ? '+' : '') + (+v).toFixed(1) + 'dB'; },

    audioAct() {
        const act = document.getElementById('st-act');
        if (!act) return;
        if (this._work) {
            act.innerHTML =
                '<div class="st-work">' +
                    '<div class="st-work-top">' +
                        '<b id="st-work-name">' + this._work.label + '</b>' +
                        '<span>working&hellip;</span>' +
                    '</div>' +
                    '<div class="st-work-track">' +
                        '<i id="st-work-bar" style="width:' +
                        Math.round(this._work.at * 100) + '%"></i>' +
                    '</div>' +
                '</div><div class="st-say"></div>';
            return;
        }
        const esc = t => String(t).replace(/[<>&"]/g, ch =>
            ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
        const why = Mic.why();
        const c = this.focusClip();
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

        // Say what the song is. Everything automatic below reads this, so
        // it should not be a secret — and if it is wrong, that is worth
        // seeing before pressing Polish rather than after.
        const mus = this.context();
        html += '<div class="ai-key">' + mus.tempo + ' bpm &middot; ' +
            esc(mus.name) + (mus.confident ? '' : ' <i>(best guess)</i>') +
            '</div>';

        html +=
            '<div class="mic-row mic-btns">' +
                (why ? '' : '<button class="' + (Mic.rolling() ? 'st-rec on' : 'st-rec') +
                    '" onclick="Studio.micTake()">' +
                    (Mic.rolling() ? '&#9632; Stop' : '&#9679; Record') + '</button>') +
                '<button onclick="Studio.pickSamples()">+ Sample</button>' +
                (!this._sel.length && this._board
                    ? '<button class="st-hot" onclick="Studio.clipPaste()">Paste ' +
                      this._board.count + ' &rarr; bar ' + (this.bar + 1) + '</button>' : '') +
                (!this._sel.length && Tape.has()
                    ? '<button onclick="Studio.selectAll()">Select all</button>' : '') +
                '<button onclick="Studio.audioClose()">Done</button>' +
            '</div>';

        // A whole record has arrived and stretching it into eight bars
        // would be vandalism. Neither answer is obviously right — it
        // depends whether this is the song or a reference — so it asks.
        if (this._ask && this._ask.heard) {
            const h = this._ask.heard;
            const bpm = Math.round(h.tempo || 0);
            html +=
                '<div class="ai-ask">' +
                    '<b>' + esc(this._ask.clip.name) + '</b> &mdash; ' +
                    Listen.clock(h.seconds) + ', about ' + bpm + ' bpm. ' +
                    'Your song is ' + this.song.tempo + '.' +
                    '<div class="mic-row mic-btns">' +
                        (bpm ? '<button class="ai-go" onclick="Studio.adoptTempo()">' +
                            'Make the song ' + bpm + '</button>' : '') +
                        '<button onclick="Studio.stretchImport()">Stretch it to ' +
                            this.song.tempo + '</button>' +
                        '<button onclick="Studio.leaveImport()">Leave it</button>' +
                    '</div>' +
                '</div>';
        }

        // What is selected. It can be riffs, audio, or a mixture, and the
        // heading should say which rather than calling everything a clip.
        const many = this._sel.length;
        if (many) {
            const nClips = this._sel.filter(o => o.k === 'clip').length;
            const nRiffs = many - nClips;
            const bits = [];
            if (nRiffs) bits.push(nRiffs + (nRiffs === 1 ? ' riff' : ' riffs'));
            if (nClips) bits.push(nClips + (nClips === 1 ? ' clip' : ' clips'));

            const title = (many === 1 && c)
                ? '<b>' + esc(c.name) + '</b><span>' + (Tape.KINDS[c.kind] || 'Clip') +
                  ' &middot; ' + Tape.label(c) + ' &middot; bar ' + (c.at + 1) + '</span>'
                : '<b>' + bits.join(' and ') + '</b><span>' +
                  'copy, move and delete take the lot' +
                  (nClips ? '' : ' &middot; the dials below need audio') + '</span>';

            html +=
                '<div class="clip-head">' + title + '</div>' +
                '<div class="mic-row mic-btns">' +
                    '<button onclick="Studio.selectAll()" title="Everything in the playlist">All</button>' +
                    '<button onclick="Studio.selectRow()" title="Everything in this row">Row</button>' +
                    '<button onclick="Studio.copy()">Copy</button>' +
                    '<button onclick="Studio.cut()">Cut</button>' +
                    (this._board ? '<button class="st-hot" onclick="Studio.paste(false)" ' +
                        'title="Repeat the same riffs at bar ' + (this.bar + 1) + '">Paste &rarr; bar ' +
                        (this.bar + 1) + '</button>' +
                        (this._board.riffs ? '<button onclick="Studio.paste(true)" ' +
                            'title="Paste independent copies of the riffs">As new</button>' : '')
                        : '') +
                    (many === 1 ? '<button onclick="Studio.clipRename()">Rename</button>' : '') +
                    '<button onclick="Studio.selectNone();Studio.refreshAct();Studio.draw()">Deselect</button>' +
                '</div>' +
                '<div class="mic-row mic-btns">' +
                    '<button onclick="Studio.clipMove(-1)" title="Earlier">&lsaquo; Bar</button>' +
                    '<button onclick="Studio.clipMove(1)" title="Later">Bar &rsaquo;</button>' +
                    '<button onclick="Studio.slice()" ' +
                        'title="Cut it in two at the cursor">&#9986; Slice</button>' +
                    '<button onclick="Studio.clipSpan(-1)" title="Cover fewer bars">&minus;</button>' +
                    '<button onclick="Studio.clipSpan(1)" title="Cover more bars">+</button>' +
                    '<button onclick="Studio.clipHear()">Hear</button>' +
                    (c ? '<button class="' + (c.loop ? 'st-hot' : '') +
                        '" onclick="Studio.clipSet(\'loop\', ' + (!c.loop) +
                        ')" title="Repeat it to fill its bars">Loop</button>' +
                    '<button class="' + (c.fit ? 'st-hot' : '') +
                        '" onclick="Studio.clipSet(\'fit\', ' + (!c.fit) +
                        ')" title="Squeeze it into its bars — this moves the pitch">Fit</button>' +
                    '<button onclick="Studio.clipSet(\'on\', ' + (!c.on) + ')">' +
                        (c.on ? 'Mute' : 'Unmute') + '</button>' : '') +
                    '<button onclick="Studio.clear()" title="Delete">&#10005;</button>' +
                '</div>';

            // What it heard, and the grid it put on. Both are guesses and
            // both are wrong sometimes, so both are shown and both can be
            // corrected rather than being quietly relied upon.
            if (c && (c.kind2 || c.grid)) {
                html += '<div class="ai-key">' +
                    (c.kind2 ? esc(Listen.KINDS[c.kind2] || c.kind2) : 'Audio') +
                    (c.grid ? ' &middot; grid ' + Math.round(c.grid.bpm) + ' bpm, one at ' +
                        c.grid.downbeat.toFixed(2) + 's' : ' &middot; no grid') +
                    '</div>';
            }
            if (c && c.grid) {
                html +=
                    '<div class="mic-row mic-btns">' +
                        '<button onclick="Studio.fitSelection()" ' +
                            'title="Match the tempo and land its first beat on a bar">' +
                            'Beat sync</button>' +
                        '<button onclick="Studio.gridNudge(-1)" ' +
                            'title="The grid is a beat late">&lsaquo; Beat</button>' +
                        '<button onclick="Studio.gridNudge(1)" ' +
                            'title="The grid is a beat early">Beat &rsaquo;</button>' +
                        '<button onclick="Studio.gridTempo(0.5)" title="Detected double">&divide;2</button>' +
                        '<button onclick="Studio.gridTempo(2)" title="Detected half">&times;2</button>' +
                    '</div>';
            }

            html +=
                '<div class="mic-row mic-btns ai-row">' +
                    '<button class="ai-go" onclick="Studio.polish()" ' +
                        'title="Gate, tune to the key, and put the vocal chain on">' +
                        '&#10022; Polish vocal</button>' +
                    '<button onclick="Studio.alignSelection()" ' +
                        'title="Move the words onto the beat">Align</button>' +
                    '<button onclick="Studio.fitSelection()" ' +
                        'title="Stretch to whole bars at this tempo, without moving the pitch">' +
                        'Fit tempo</button>' +
                    (this.selClips().some(x => x.fx)
                        ? '<button onclick="Studio.unpolish()" title="Hear the raw take">' +
                          'Raw</button>' : '') +
                '</div>' +
                (c ? '<div class="mic-row mic-dials">' +
                    '<label>Level <input type="range" min="0" max="2" step="0.05" value="' +
                        (c.gain == null ? 1 : c.gain) +
                        '" oninput="Studio.clipGain(+this.value)">' +
                        '<b id="clip-gain-n">' + Math.round((c.gain == null ? 1 : c.gain) * 100) +
                        '%</b></label>' +
                    '<label>Nudge <input type="range" min="-250" max="250" step="5" value="' +
                        (c.nudge || 0) + '" oninput="Studio.clipNudge(+this.value)">' +
                        '<b id="clip-nudge-n">' + ((c.nudge || 0) > 0 ? '+' : '') +
                        (c.nudge || 0) + 'ms</b></label>' +
                '</div>' : '');
        }

        // Only where there is a mouse and a keyboard to use.
        const desk = typeof matchMedia === 'function'
            && matchMedia('(pointer: fine)').matches;
        const keys = desk
            ? ' Drag a box round clips to pick them up &mdash; ctrl+A all, ' +
              'ctrl+C copy, ctrl+X cut, ctrl+V paste at the cursor, ' +
              'delete to remove, ctrl+Z to undo.'
            : '';

        const hint = state
            || ((this._sel.length > 1
                    ? 'Drag to move. Riffs and audio select together — copy, move the cursor, paste.'
              : c ? (c.fit ? 'Fit changes the speed, so it moves the pitch too.'
                           : 'Shift-tap anything else to work on both at once.')
                  : 'Drag a loop onto a bar, or record over the loop. Tap anything to ' +
                    'pick it up, drag it to move it, B to slice it at the cursor.') + keys);
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
            // Cheap: a few dozen numbers, unlike the audio, which is shared.
            mix: JSON.parse(JSON.stringify(this.mix())),
            mutes: this.mutes(),
            where: {
                track: this.track, bar: this.bar, view: this.view,
                // Riffs come back from the file as new objects, so the open
                // one is found again by the id the format keeps for exactly
                // this sort of reason.
                riff: this.editing ? String(this.editing.id) : null,
                sel: this._sel.map(o => Object.assign({}, o)),
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
        this.mixSet = Mixer.settle(snap.mix);
        this.applyMutes(snap.mutes);
        this._markTag = '';          // the next edit starts a fresh step

        // The graph is built from the settings, so putting the settings
        // back means building it again.
        if (this.synth && this.synth.ctx) this.wire(this.synth.ctx, this.context());

        this.editing = snap.where.riff
            ? this.song.riffs.find(r => String(r.id) === snap.where.riff) || null
            : null;
        this.view = this.editing ? snap.where.view : 'arrange';
        this.track = Math.max(0, Math.min(snap.where.track, this.song.tracks.length - 1));
        this.bar = Math.max(0, Math.min(snap.where.bar, this.BARS - 1));
        // Keep only what is still there — a snapshot taken before something
        // was deleted should not bring back a selection pointing at it.
        this._sel = (snap.where.sel || []).filter(o =>
            o.k === 'clip' ? Tape.clips.some(c => c.id === o.id)
                           : !!this.objAt(o.t, o.at));

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
    BENCH_MIX: 'runningboy_vibe_bench_mix',
    BENCH_MUTE: 'runningboy_vibe_bench_mute',

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
            localStorage.setItem(this.BENCH_MIX, JSON.stringify(this.mix()));
            localStorage.setItem(this.BENCH_MUTE, JSON.stringify(this.mutes()));
        } catch (_) {}
    },

    /// Does this look like a song? readVbm will not say — it is a port of
    /// the original reader and its job is to agree with it, not to judge.
    /// Handed rubbish it returns a tidy Song with tempo 0 and no tracks,
    /// and everything downstream then divides by that.
    plausible(song) {
        return !!song
            && song.tracks && song.tracks.length > 0
            && song.bars >= 1 && song.bars <= 64
            && song.tempo >= 20 && song.tempo <= 400
            && song.loopStart >= 0 && song.loopEnd >= song.loopStart;
    },

    restore() {
        try {
            const b = localStorage.getItem(this.BENCH);
            if (!b) return false;
            const song = readVbm(this._bytes(b));
            if (!this.plausible(song)) return false;
            this.song = song;
            this.track = 0; this.bar = 0;
            this.view = 'arrange'; this.editing = null;
            try { Tape.fromJSON(JSON.parse(localStorage.getItem(this.BENCH_AUDIO))); } catch (_) {}
            try { this.mixSet = Mixer.settle(JSON.parse(localStorage.getItem(this.BENCH_MIX))); }
            catch (_) { this.mixSet = Mixer.fresh(); }
            try { this.applyMutes(JSON.parse(localStorage.getItem(this.BENCH_MUTE))); } catch (_) {}
            this._mix = null;            // rebuilt against the new settings
            this.selectNone();
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
                      audio: Tape.toJSON(), mix: this.mix(), mutes: this.mutes() };
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
            const song = readVbm(this._bytes(row.data));
            if (!this.plausible(song)) {
                this._undo.pop();              // nothing happened, no history
                this.say('That beat will not open');
                return;
            }
            this.song = song;
            this.track = 0; this.bar = 0;
            this.editing = null;
            Tape.fromJSON(row.audio);
            this.applyMutes(row.mutes);
            this.mixSet = Mixer.settle(row.mix);
            this._mix = null;
            this.selectNone();
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

    // ── Taking it out of the game ─────────────────────────────────────────
    // Three formats, because they are three different things. A .mid is the
    // notes — tiny, editable in any DAW, and silent about everything the tape
    // holds. A .wav is exactly what you heard. An .mp3 is that, small enough
    // to send someone.

    _busy: false,

    async exportAs(kind) {
        if (this._busy) return;
        if (kind === 'mid') { this.exportMid(); return; }

        const w = this.worth();
        if (!w.notes && !w.audio) { this.say('There is nothing to render yet'); return; }

        this._busy = true;
        this.stop();
        const tick = this.working('Rendering');
        const say = m => { if (this._work) this._work.label = m; this.say(m); };
        try {
            say('Rendering…');
            await this.synth.start();              // a gesture has happened: we are here
            const buffer = await Bounce.render(this.song, say, this.mix());
            const name = Bounce.tidy(this.song.name);

            if (kind === 'mp3') {
                say('Fetching the encoder…');
                const bytes = await Bounce.mp3(buffer, Bounce.KBPS, say);
                if (!bytes) {
                    // No encoder, no network. A WAV is the honest fallback
                    // and it is already rendered.
                    const wav = Bounce.wav(buffer);
                    Bounce.save(wav, name + '.wav', 'audio/wav');
                    say('No MP3 encoder could be fetched — saved ' + name + '.wav (' +
                        Bounce.size(wav) + ') instead');
                } else {
                    Bounce.save(bytes, name + '.mp3', 'audio/mpeg');
                    say('Exported ' + name + '.mp3 · ' + Bounce.size(bytes) +
                        ' · ' + Bounce.KBPS + ' kbps');
                }
            } else {
                const bytes = Bounce.wav(buffer);
                Bounce.save(bytes, name + '.wav', 'audio/wav');
                say('Exported ' + name + '.wav · ' + Bounce.size(bytes));
            }
        } catch (e) {
            this.say('Could not render that: ' + ((e && e.message) || 'unknown'));
        }
        this.finished();
        this._busy = false;
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
            '<button onclick="Studio.exportAs(\'mp3\')" title="The sound, small enough to send">' +
                '&#8595; .mp3</button>' +
            '<button onclick="Studio.exportAs(\'wav\')" title="The sound, uncompressed">' +
                '&#8595; .wav</button>' +
            '<button onclick="Studio.exportAs(\'mid\')" title="The notes only — no audio">' +
                '&#8595; .mid</button>' +
            '<button onclick="Studio.newBeat()">New beat</button>';

        const act = document.getElementById('st-act');
        const grid = document.getElementById('st-grid');
        if (grid) grid.style.display = 'none';

        let html = '<div class="st-list">';
        html += '<div class="st-note">A .mid is the notes — small, editable, and ' +
                'silent about anything on the tape. A .wav or an .mp3 is what you ' +
                'actually hear, the whole loop mixed down.</div>';
        if (!list.length) {
            html += '<div class="st-note">Nothing saved yet. Make something, ' +
                    'then press Save.</div>';
        } else {
            list.slice().reverse().forEach((row, k) => {
                const i = list.length - 1 - k;
                let note = '';
                try {
                    const sng = readVbm(this._bytes(row.data));
                    if (!this.plausible(sng)) throw new Error('not a song');
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
        if (this._mixOpen) { this.mixAct(); return; }
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
