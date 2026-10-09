// ── The tape: audio alongside the notes ───────────────────────────────────
// Vibe was MIDI and only MIDI — it named notes and the phone's chip made the
// sound. There is no room in a .vbm for a recording and there never was, so
// this does not try to put one there. Audio rides alongside the song: same
// clock, same bars, saved with it, its own file.
//
// A mic take and a dropped drum loop are the same thing once they are in:
// a lump of audio that starts on a bar. So there is one idea here — a CLIP —
// and the microphone is simply one of the two ways to fill one. That is why
// this is a tape and not a mic channel.
//
// LANES are rows. Clips in a lane may not overlap, so dropping a sample onto
// a busy bar opens another lane rather than quietly layering two things in
// the same row where you cannot see or grab either of them.
//
// Two honest limits, stated here because both will be met:
//
//   Timing. A sample made at some other tempo does not fit this one. There
//   is no stretching here, so FIT changes the playback rate, which moves the
//   pitch with it. For drums that is the normal trick; for a guitar line it
//   is a transpose, and the control says so.
//
//   Size. Audio is the only big thing in this app and localStorage is a few
//   megabytes. Clips over the cap play now and are dropped from the save,
//   which the panel says out loud rather than failing later.

const Tape = {

    BUCKETS: 150,                 // waveform resolution: 150 numbers, not a file
    MAX_CLIP: 1400000,            // per clip, base64 characters
    MAX_ALL: 3600000,             // all clips in one beat
    MAX_LANES: 4,
    KINDS: { mic: 'Mic', file: 'Sample' },

    clips: [],
    ctx: null,
    error: '',
    tooBig: 0,                    // clips left out of the last save, for size

    _playing: [],
    _json: undefined,             // cached serialisation; undefined means "work it out"
    _id: 1,

    // ── Shape ─────────────────────────────────────────────────────────────

    /// How many rows the arrangement needs for audio.
    lanes() {
        let n = 0;
        for (const c of this.clips) if (c.lane + 1 > n) n = c.lane + 1;
        return n;
    },

    inLane(lane) { return this.clips.filter(c => c.lane === lane); },

    at(lane, bar) {
        return this.clips.find(c => c.lane === lane && bar >= c.at && bar < c.at + c.bars) || null;
    },

    /// The lowest lane with room for `bars` bars starting at `at`. A new lane
    /// if every existing one is busy there, and -1 when we are out of rows.
    room(at, bars, except) {
        const clash = (lane) => this.clips.some(c =>
            c !== except && c.lane === lane && at < c.at + c.bars && c.at < at + bars);
        for (let lane = 0; lane < this.MAX_LANES; lane++) if (!clash(lane)) return lane;
        return -1;
    },

    has() { return this.clips.length > 0; },
    live() { return this.clips.some(c => c.on); },

    // ── Making clips ──────────────────────────────────────────────────────

    /// The one constructor. `lead` is how far into the buffer the clip's
    /// first beat sits — the mic uses it to skip its count-in; a file has
    /// none.
    clip(fields) {
        return Object.assign({
            id: this._id++,
            name: 'Clip',
            kind: 'file',
            type: 'audio/webm',
            bytes: null,
            buffer: null,
            peaks: [],
            at: 0,
            bars: 1,
            lane: 0,
            lead: 0,
            nudge: 0,
            gain: 1,
            on: true,
            loop: false,
            fit: false,
            seconds: 0,          // the clip's own length, in seconds
        }, fields);
    },

    /// Put a clip on the tape. Returns it, or null when there is no room.
    add(clip, at, bars) {
        clip.at = Math.max(0, at || 0);
        if (bars) clip.bars = Math.max(1, bars);
        const lane = this.room(clip.at, clip.bars);
        if (lane === -1) { this.error = 'All ' + this.MAX_LANES + ' audio lanes are busy there.'; return null; }
        clip.lane = lane;
        this.clips.push(clip);
        this._json = undefined;
        return clip;
    },

    /// A copy that shares its audio. Two placements of one recording are not
    /// two recordings; the bytes and the decoded buffer are the same objects,
    /// so a paste costs one small object and no decoding.
    twin(clip) {
        const out = Object.assign({}, clip);
        out.id = this._id++;
        return out;
    },

    /// The lowest free lane, but try the one asked for first — so pasting a
    /// two-lane selection keeps its two lanes instead of collapsing them.
    roomNear(at, bars, prefer, except) {
        const free = lane => lane >= 0 && lane < this.MAX_LANES && !this.clips.some(c =>
            c !== except && c.lane === lane && at < c.at + c.bars && c.at < at + bars);
        if (prefer != null && free(prefer)) return prefer;
        return this.room(at, bars, except);
    },

    /// Lift a selection into a clipboard, keeping its shape: where each clip
    /// sits relative to the earliest bar and the topmost lane of the group.
    lift(clips) {
        if (!clips || !clips.length) return null;
        const at = Math.min.apply(null, clips.map(c => c.at));
        const lane = Math.min.apply(null, clips.map(c => c.lane));
        return {
            count: clips.length,
            bars: Math.max.apply(null, clips.map(c => c.at + c.bars)) - at,
            items: clips.map(c => ({ clip: c, dAt: c.at - at, dLane: c.lane - lane })),
        };
    },

    /// Drop a clipboard at a bar. Every clip keeps its offset and tries for
    /// its own lane. Returns what landed — which may be less than was on the
    /// clipboard, if the tape ran out of room.
    drop(board, at) {
        if (!board) return [];
        const made = [];
        for (const it of board.items) {
            const want = Math.max(0, (at || 0) + it.dAt);
            const clip = this.twin(it.clip);
            clip.at = want;
            const lane = this.roomNear(want, clip.bars, it.dLane);
            if (lane === -1) { this.error = 'The tape ran out of free lanes.'; break; }
            clip.lane = lane;
            this.clips.push(clip);
            made.push(clip);
        }
        if (made.length) { this.error = made.length === board.items.length ? '' : this.error; }
        this._json = undefined;
        return made;
    },

    removeMany(clips) {
        for (const c of (clips || []).slice()) this.remove(c);
    },

    /// Move a whole selection together. The rightmost goes first when moving
    /// right, or a clip bumps into its own neighbour on the way; and clips in
    /// the selection are not obstacles to each other.
    shift(clips, by) {
        if (!clips || !clips.length || !by) return false;
        const mine = new Set(clips);
        const order = clips.slice().sort((a, b) => by > 0 ? b.at - a.at : a.at - b.at);
        if (order.some(c => c.at + by < 0)) return false;
        const blocked = (c, want) => this.clips.some(o =>
            !mine.has(o) && o.lane === c.lane && want < o.at + o.bars && o.at < want + c.bars);
        if (order.some(c => blocked(c, c.at + by))) {
            this.error = 'Something is in the way.';
            return false;
        }
        for (const c of order) { c.at += by; this.stopOne(c); }
        this.error = '';
        this._json = undefined;
        return true;
    },

    /// Grow or shrink a selection. Same rule about not blocking itself.
    stretch(clips, by, maxBars) {
        if (!clips || !clips.length || !by) return false;
        const mine = new Set(clips);
        const blocked = (c, span) => this.clips.some(o =>
            !mine.has(o) && o.lane === c.lane && c.at < o.at + o.bars && o.at < c.at + span);
        const wants = clips.map(c => Math.max(1, Math.min((maxBars || 99) - c.at, c.bars + by)));
        if (clips.some((c, i) => blocked(c, wants[i]))) {
            this.error = 'Something is in the way.';
            return false;
        }
        clips.forEach((c, i) => { c.bars = wants[i]; this.stopOne(c); });
        this.error = '';
        this._json = undefined;
        return true;
    },

    /// A copy that shares its audio. Two placements of one recording are not
    /// two recordings; the bytes and the decoded buffer are the same objects,
    /// so a paste costs one small object and no decoding.
    twin(clip) {
        const out = Object.assign({}, clip);
        out.id = this._id++;
        return out;
    },

    /// The lowest free lane, but try the one asked for first — so pasting a
    /// two-lane selection keeps its two lanes instead of collapsing them.
    roomNear(at, bars, prefer, except) {
        const free = lane => lane >= 0 && lane < this.MAX_LANES && !this.clips.some(c =>
            c !== except && c.lane === lane && at < c.at + c.bars && c.at < at + bars);
        if (prefer != null && free(prefer)) return prefer;
        return this.room(at, bars, except);
    },

    /// Lift a selection into a clipboard, keeping its shape: where each clip
    /// sits relative to the earliest bar and the topmost lane of the group.
    lift(clips) {
        if (!clips || !clips.length) return null;
        const at = Math.min.apply(null, clips.map(c => c.at));
        const lane = Math.min.apply(null, clips.map(c => c.lane));
        return {
            count: clips.length,
            bars: Math.max.apply(null, clips.map(c => c.at + c.bars)) - at,
            items: clips.map(c => ({ clip: c, dAt: c.at - at, dLane: c.lane - lane })),
        };
    },

    /// Drop a clipboard at a bar. Every clip keeps its offset and tries for
    /// its own lane. Returns what landed — which may be less than was on the
    /// clipboard, if the tape ran out of room.
    drop(board, at) {
        if (!board) return [];
        const made = [];
        for (const it of board.items) {
            const want = Math.max(0, (at || 0) + it.dAt);
            const clip = this.twin(it.clip);
            clip.at = want;
            const lane = this.roomNear(want, clip.bars, it.dLane);
            if (lane === -1) { this.error = 'The tape ran out of free lanes.'; break; }
            clip.lane = lane;
            this.clips.push(clip);
            made.push(clip);
        }
        if (made.length) { this.error = made.length === board.items.length ? '' : this.error; }
        this._json = undefined;
        return made;
    },

    removeMany(clips) {
        for (const c of (clips || []).slice()) this.remove(c);
    },

    /// Move a whole selection together. The rightmost goes first when moving
    /// right, or a clip bumps into its own neighbour on the way; and clips in
    /// the selection are not obstacles to each other.
    shift(clips, by) {
        if (!clips || !clips.length || !by) return false;
        const mine = new Set(clips);
        const order = clips.slice().sort((a, b) => by > 0 ? b.at - a.at : a.at - b.at);
        if (order.some(c => c.at + by < 0)) return false;
        const blocked = (c, want) => this.clips.some(o =>
            !mine.has(o) && o.lane === c.lane && want < o.at + o.bars && o.at < want + c.bars);
        if (order.some(c => blocked(c, c.at + by))) {
            this.error = 'Something is in the way.';
            return false;
        }
        for (const c of order) { c.at += by; this.stopOne(c); }
        this.error = '';
        this._json = undefined;
        return true;
    },

    /// Grow or shrink a selection. Same rule about not blocking itself.
    stretch(clips, by, maxBars) {
        if (!clips || !clips.length || !by) return false;
        const mine = new Set(clips);
        const blocked = (c, span) => this.clips.some(o =>
            !mine.has(o) && o.lane === c.lane && c.at < o.at + o.bars && o.at < c.at + span);
        const wants = clips.map(c => Math.max(1, Math.min((maxBars || 99) - c.at, c.bars + by)));
        if (clips.some((c, i) => blocked(c, wants[i]))) {
            this.error = 'Something is in the way.';
            return false;
        }
        clips.forEach((c, i) => { c.bars = wants[i]; this.stopOne(c); });
        this.error = '';
        this._json = undefined;
        return true;
    },

    remove(clip) {
        const i = this.clips.indexOf(clip);
        if (i === -1) return;
        this.stopOne(clip);
        this.clips.splice(i, 1);
        this.tidy();
        this._json = undefined;
    },

    clear() {
        this.hush();
        this.clips = [];
        this._json = undefined;
    },

    /// Shuffle clips down so there are no empty rows in the middle.
    tidy() {
        const used = [...new Set(this.clips.map(c => c.lane))].sort((a, b) => a - b);
        const to = new Map(used.map((l, i) => [l, i]));
        for (const c of this.clips) c.lane = to.get(c.lane);
    },

    /// Put back a snapshot's clips. The audio itself is shared between
    /// snapshots, so this is cheap and never re-decodes.
    restore(clips) {
        this.hush();
        this.clips = (clips || []).map(c => Object.assign({}, c));
        this._json = undefined;
    },

    set(clip, field, value) {
        if (!clip) return;
        clip[field] = value;
        this._json = undefined;
        // These change what you would hear, so stop the old version rather
        // than letting the two overlap until the next pass.
        if (field !== 'name') this.stopOne(clip);
    },

    /// Move a clip, or change how many bars it covers, keeping lanes legal.
    place(clip, at, bars) {
        const want = Math.max(0, at == null ? clip.at : at);
        const span = Math.max(1, bars == null ? clip.bars : bars);
        const lane = this.room(want, span, clip);
        if (lane === -1) { this.error = 'No lane is free there.'; return false; }
        clip.at = want; clip.bars = span; clip.lane = lane;
        this.stopOne(clip);
        this._json = undefined;
        this.error = '';
        return true;
    },

    // ── Audio ─────────────────────────────────────────────────────────────

    async decode(clip) {
        if (!this.ctx || !clip.bytes) return;
        // decodeAudioData takes the ArrayBuffer away from you, so it gets a
        // copy and the bytes stay behind to be saved.
        clip.buffer = await this.ctx.decodeAudioData(clip.bytes.slice().buffer);
        if (!clip.seconds) clip.seconds = Math.max(0, clip.buffer.duration - clip.lead);
        clip.peaks = this.peaks(clip);
    },

    /// Decode everything that came out of storage. Audio needs a context and
    /// loading a beat happens long before anything has played, so this runs
    /// on the first play instead.
    async ready(ctx) {
        if (ctx) this.ctx = ctx;
        if (!this.ctx) return;
        for (const c of this.clips) {
            if (c.buffer || !c.bytes) continue;
            try { await this.decode(c); }
            catch (_) { this.error = 'One clip will not decode on this browser.'; }
        }
    },

    /// Peaks across the part that is actually heard, so the drawing and the
    /// sound agree about where the clip starts.
    peaks(clip) {
        const buf = clip.buffer;
        if (!buf) return [];
        const rate = buf.sampleRate;
        const from = Math.floor(Math.max(0, clip.lead) * rate);
        const len = Math.min(buf.length - from, Math.ceil((clip.seconds || buf.duration) * rate));
        if (len <= 0) return [];
        const d = buf.getChannelData(0);
        const out = new Array(this.BUCKETS).fill(0);
        const per = len / this.BUCKETS;
        for (let b = 0; b < this.BUCKETS; b++) {
            const s = from + Math.floor(b * per);
            const e = Math.min(from + Math.floor((b + 1) * per), from + len);
            // Every sample of a long clip is wasted work for a drawing this
            // small; a stride reads enough of it.
            const step = Math.max(1, Math.floor((e - s) / 48));
            let pk = 0;
            for (let i = s; i < e; i += step) {
                const a = d[i] < 0 ? -d[i] : d[i];
                if (a > pk) pk = a;
            }
            out[b] = Math.round(Math.min(1, pk) * 100) / 100;
        }
        return out;
    },

    /// The rate a clip plays at. FIT squeezes the clip into the bars it
    /// covers, which moves its pitch — right for drums, a transpose for
    /// anything tuned, and the panel says so.
    rate(clip, barSeconds) {
        if (!clip.fit || !clip.seconds || clip.loop) return 1;
        const want = clip.bars * barSeconds;
        if (want <= 0) return 1;
        const r = clip.seconds / want;
        return Math.max(0.25, Math.min(4, r));
    },

    /// Start every clip that begins on this bar. `when` is the audio clock
    /// reading for the bar line, which is the only timing the tape gets and
    /// all it needs.
    barStart(bar, when, barSeconds) {
        if (!this.ctx) return;
        for (const c of this.clips) if (c.at === bar && c.on) this.fire(c, when, barSeconds);
    },

    /// Build one clip's audio graph against ANY context, at a given time.
    /// Live playback and the offline bounce both come through here, so what
    /// gets exported is what was heard. `buffer` overrides the clip's own,
    /// which a bounce uses because it decodes at its own sample rate.
    voice(ctx, clip, when, barSeconds, buffer, dest) {
        const buf = buffer || clip.buffer;
        if (!ctx || !buf) return null;
        const rate = this.rate(clip, barSeconds);
        const off = Math.max(0, clip.lead + (clip.nudge || 0) / 1000);
        const span = clip.bars * barSeconds;
        const own = Math.max(0, buf.duration - off);
        if (own <= 0.01) return null;

        const g = ctx.createGain();
        g.gain.value = clip.gain == null ? 1 : clip.gain;
        g.connect(dest || ctx.destination);

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate;
        if (clip.loop) {
            // A one-bar loop across four bars: repeat the clip rather than
            // leaving three bars of silence.
            src.loop = true;
            src.loopStart = off;
            src.loopEnd = Math.min(buf.duration, off + (clip.seconds || own));
            if (src.loopEnd - src.loopStart < 0.02) src.loop = false;
        }
        src.connect(g);

        // Never run past the bars the clip claims — that is what its span
        // means, and a clip bleeding into the next one is a bug, not a vibe.
        const len = clip.loop ? span : Math.min(span, own / rate);
        try { src.start(Math.max(when, ctx.currentTime), off, len); }
        catch (_) { return null; }
        return { src, g };
    },

    fire(clip, when, barSeconds) {
        if (!this.ctx || !clip.buffer) return;
        this.stopOne(clip);
        const v = this.voice(this.ctx, clip, when, barSeconds);
        if (!v) return;
        v.src.onended = () => { this._drop(v.src); };
        this._playing.push({ clip, src: v.src, g: v.g });
    },

    _drop(src) {
        const i = this._playing.findIndex(p => p.src === src);
        if (i === -1) return;
        const p = this._playing[i];
        try { p.src.disconnect(); } catch (_) {}
        try { p.g.disconnect(); } catch (_) {}
        this._playing.splice(i, 1);
    },

    stopOne(clip) {
        for (const p of this._playing.slice()) {
            if (p.clip !== clip) continue;
            try { p.src.stop(); } catch (_) {}
            this._drop(p.src);
        }
    },

    /// Everything off. Called whenever the transport stops.
    hush() {
        for (const p of this._playing.slice()) {
            try { p.src.stop(); } catch (_) {}
            this._drop(p.src);
        }
        this._playing = [];
    },

    /// One clip on its own, for auditioning in the panel.
    audition(clip, barSeconds) {
        if (!this.ctx || !clip) return;
        this.fire(clip, this.ctx.currentTime + 0.02, barSeconds);
    },

    // ── Bringing samples in ───────────────────────────────────────────────

    OK_TYPE: /^audio\/|\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm|aif|aiff)$/i,

    looksAudio(file) {
        return !!file && (this.OK_TYPE.test(file.type || '') || this.OK_TYPE.test(file.name || ''));
    },

    /// Take a dropped or chosen file and make a clip of it. `barSeconds`
    /// decides the default span: a sample covers whole bars, rounded up, so
    /// it never ends mid-bar by accident.
    async take(file, at, barSeconds) {
        this.error = '';
        if (!this.looksAudio(file)) { this.error = '"' + (file && file.name || 'that') + '" is not audio.'; return null; }
        if (!this.ctx) { this.error = 'The studio has to be making sound first.'; return null; }

        let bytes, buffer;
        try {
            bytes = new Uint8Array(await file.arrayBuffer());
            buffer = await this.ctx.decodeAudioData(bytes.slice().buffer);
        } catch (_) {
            this.error = 'This browser cannot read "' + (file.name || 'that file') + '".';
            return null;
        }

        const clip = this.clip({
            name: (file.name || 'Sample').replace(/\.[^.]+$/, '').slice(0, 18),
            kind: 'file',
            type: file.type || 'audio/*',
            bytes, buffer,
            seconds: buffer.duration,
        });
        clip.peaks = this.peaks(clip);

        const bars = Math.max(1, Math.round(buffer.duration / barSeconds * 10) / 10);
        const span = Math.max(1, Math.ceil(bars - 0.08));   // 1.03 bars is a one-bar loop
        if (!this.add(clip, at, span)) return null;
        // A clip that very nearly fills its bars was made to loop, so say so
        // by default; anything else is a one-shot until told otherwise.
        clip.loop = Math.abs(bars - span) < 0.12 && span <= 2;
        this._json = undefined;
        return clip;
    },

    // ── Saving ────────────────────────────────────────────────────────────
    // The studio saves after every edited note, so re-encoding megabytes of
    // audio each time would make typing in a hi-hat feel broken. The result
    // is cached and only rebuilt when a clip actually changes.

    _b64(bytes) {
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    },

    _bytes(b64) {
        const raw = atob(b64), out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    },

    toJSON() {
        if (this._json !== undefined) return this._json;
        const out = [];
        let total = 0, skipped = 0;
        for (const c of this.clips) {
            if (!c.bytes) continue;
            let data;
            try { data = this._b64(c.bytes); } catch (_) { skipped++; continue; }
            if (data.length > this.MAX_CLIP || total + data.length > this.MAX_ALL) { skipped++; continue; }
            total += data.length;
            out.push({ data, type: c.type, name: c.name, kind: c.kind,
                       at: c.at, bars: c.bars, lane: c.lane, lead: c.lead,
                       nudge: c.nudge || 0, gain: c.gain == null ? 1 : c.gain,
                       on: c.on !== false, loop: !!c.loop, fit: !!c.fit,
                       seconds: c.seconds || 0, peaks: c.peaks || [] });
        }
        this.tooBig = skipped;
        this._json = out.length ? out : null;
        return this._json;
    },

    /// Bytes now, sound later. Decoding needs an audio context and loading a
    /// beat happens before anything has played.
    fromJSON(rows) {
        this.clear();
        if (!Array.isArray(rows)) return;
        for (const o of rows) {
            if (!o || !o.data) continue;
            try {
                this.clips.push(this.clip({
                    name: o.name || 'Clip', kind: o.kind || 'file',
                    type: o.type || 'audio/webm', bytes: this._bytes(o.data),
                    at: o.at || 0, bars: Math.max(1, o.bars || 1), lane: o.lane || 0,
                    lead: o.lead || 0, nudge: o.nudge || 0,
                    gain: o.gain == null ? 1 : o.gain, on: o.on !== false,
                    loop: !!o.loop, fit: !!o.fit,
                    seconds: o.seconds || 0, peaks: o.peaks || [],
                }));
            } catch (_) {}
        }
        this.tidy();
        this._json = undefined;
    },

    /// For the fee and the sold-already check: different audio has to read as
    /// a different beat.
    print() {
        const on = this.clips.filter(c => c.on);
        if (!on.length) return '';
        return '~' + on.map(c =>
            'a' + c.at + '.' + c.bars + '.' + (c.bytes ? c.bytes.length : 0)
        ).sort().join(',');
    },

    label(clip) {
        if (!clip) return '';
        const bars = clip.bars + (clip.bars === 1 ? ' bar' : ' bars');
        const secs = clip.seconds ? ' · ' + clip.seconds.toFixed(1) + 's' : '';
        return bars + secs + (clip.loop ? ' · looped' : '') + (clip.fit ? ' · fitted' : '');
    },
};
