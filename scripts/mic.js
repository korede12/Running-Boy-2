// ── The microphone ────────────────────────────────────────────────────────
// One of the two ways to fill a clip on the tape. This module does only the
// input side: which microphone, how loud it is coming in, and when the take
// actually began. What it records it hands to Tape, because once audio is in
// the song it makes no difference whether it was sung or dropped in.
//
// Two things make or break a mic channel, and neither of them is recording.
//
// WHICH INPUT is a real question. A phone with earbuds in has two. A laptop
// with an interface has three. So the input is chosen, remembered, and the
// list refreshes when something is plugged in or pulled out.
//
// WHERE THE TAKE SITS IN TIME is the harder one. A recorder does not begin
// the instant you ask it to, so this does not ask it to begin on the beat.
// It starts rolling first, lets one full pass of the loop go by as a count-in
// — which you need anyway, to know where to come in — and writes down the
// audio clock at the moment the playhead crossed the top. That crossing is
// the take's zero. Playback starts the buffer from there, which is why the
// take lands where it was sung instead of a recorder's worth of lag behind.

const Mic = {

    stream: null,
    deviceId: null,
    devices: [],
    error: '',
    level: 0,
    peak: 0,
    state: 'off',            // off | live | armed | rolling

    // What the studio hooks into: redraw when something changes, and move
    // the meter without a redraw, because the meter moves sixty times a
    // second and the panel does not.
    onstate: null,
    onlevel: null,
    onclip: null,            // a finished take, ready to go on the tape

    _ctx: null, _tap: null, _an: null, _data: null, _raf: null, _watching: false,
    _rec: null, _chunks: null, _type: '',
    _recAt: 0, _passAt: -1, _skip: 0, _stop: null,
    _bars: 1, _spb: 1, _at: 0,

    // ── What the browser will allow ───────────────────────────────────────

    supported() {
        return typeof navigator !== 'undefined'
            && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
            && typeof MediaRecorder !== 'undefined';
    },

    /// A microphone needs a secure page. https is fine and so is localhost; a
    /// file opened straight off the disk is not, and saying so is kinder than
    /// letting the button fail.
    secure() {
        return typeof window === 'undefined' || window.isSecureContext !== false;
    },

    why() {
        if (!this.supported()) return 'This browser will not give a page the microphone.';
        if (!this.secure()) return 'A microphone needs https, or localhost. Opened straight from a file, the page cannot even ask.';
        return '';
    },

    // ── Opening an input ──────────────────────────────────────────────────

    /// Share the studio's AudioContext: a take recorded against one clock and
    /// played against another would never sit still.
    async listen(ctx, deviceId) {
        const no = this.why();
        if (no) { this.error = no; return false; }
        this._ctx = ctx;
        this.hush();

        // Off, every one of them. These exist to make speech intelligible on
        // a call — they duck, gate and flatten, which is the opposite of what
        // a take needs.
        const want = { channelCount: 1, echoCancellation: false,
                       noiseSuppression: false, autoGainControl: false };
        if (deviceId) want.deviceId = { exact: deviceId };

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: want });
        } catch (e) {
            const n = e && e.name;
            this.error =
                n === 'NotAllowedError'   ? 'The microphone was refused. Allow it in the address bar, then try again.'
              : n === 'NotFoundError'     ? 'No microphone on this device.'
              : n === 'NotReadableError'  ? 'Something else is holding that microphone.'
              : n === 'OverconstrainedError' ? 'That input is gone. Pick another.'
              : 'Could not open that input.';
            this.state = 'off';
            return false;
        }

        this.error = '';
        this.deviceId = deviceId || this._idOf();
        this._tap = ctx.createMediaStreamSource(this.stream);
        this._an = ctx.createAnalyser();
        this._an.fftSize = 1024;
        this._an.smoothingTimeConstant = 0.1;
        this._data = new Float32Array(this._an.fftSize);
        // The meter only. Routing a live microphone to the speakers is how
        // you get feedback, and nobody should learn that from their own app.
        this._tap.connect(this._an);
        this.state = 'live';
        await this.scan();
        this._watch();
        this._meter();
        return true;
    },

    _idOf() {
        try {
            const t = this.stream.getAudioTracks()[0];
            const s = t.getSettings ? t.getSettings() : null;
            return (s && s.deviceId) || null;
        } catch (_) { return null; }
    },

    /// Labels are blank until a page has been granted a microphone once, so
    /// this is worth running again after permission rather than before.
    async scan() {
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            this.devices = all.filter(d => d.kind === 'audioinput').map((d, i) => ({
                id: d.deviceId,
                label: d.label || ('Input ' + (i + 1)),
            }));
        } catch (_) { this.devices = []; }
        return this.devices;
    },

    /// Earbuds in, interface unplugged: the list is wrong the moment it is
    /// drawn, so listen for the change.
    _watch() {
        if (this._watching || !navigator.mediaDevices) return;
        this._watching = true;
        try {
            navigator.mediaDevices.addEventListener('devicechange', () => {
                this.scan().then(() => { if (this.onstate) this.onstate(); });
            });
        } catch (_) { this._watching = false; }
    },

    /// Switch input. Anything rolling is finished first — a take that changed
    /// microphone halfway through is not a take.
    async pick(ctx, id) {
        if (this.rolling()) this.finish();
        return this.listen(ctx, id);
    },

    /// Let the microphone go. The browser shows the page as recording for as
    /// long as the stream is open, so this is not optional tidying.
    hush() {
        if (this._raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf);
        this._raf = null;
        if (this._tap) { try { this._tap.disconnect(); } catch (_) {} this._tap = null; }
        this._an = null; this._data = null;
        if (this.stream) {
            for (const t of this.stream.getTracks()) { try { t.stop(); } catch (_) {} }
            this.stream = null;
        }
        this.level = 0; this.peak = 0;
        if (!this.rolling()) this.state = 'off';
    },

    // ── The meter ─────────────────────────────────────────────────────────

    _meter() {
        if (!this._an || typeof requestAnimationFrame !== 'function') return;
        this._an.getFloatTimeDomainData(this._data);
        let sum = 0, pk = 0;
        for (let i = 0; i < this._data.length; i++) {
            const v = this._data[i];
            sum += v * v;
            const a = v < 0 ? -v : v;
            if (a > pk) pk = a;
        }
        // RMS is the honest number but it looks dead on a bar; a little lift
        // puts normal speech around the middle, which is what a meter is read
        // for. The clip light uses the true peak.
        this.level = Math.min(1, Math.sqrt(sum / this._data.length) * 3.6);
        this.peak = Math.min(1, pk);
        if (this.onlevel) this.onlevel(this.level, this.peak);
        this._raf = requestAnimationFrame(() => this._meter());
    },

    // ── Taking ────────────────────────────────────────────────────────────

    _mime() {
        if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
        for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'])
            if (MediaRecorder.isTypeSupported(t)) return t;
        return '';
    },

    rolling() { return this.state === 'armed' || this.state === 'rolling'; },

    /// Start rolling now and align to the loop top AFTER the next one, so
    /// there is always exactly one pass of count-in. `bars` is how much to
    /// keep, `spb` how long one bar lasts, `at` which bar the take begins on.
    arm(bars, spb, at) {
        if (!this.stream) { this.error = 'No input open.'; return false; }
        if (this.rolling()) return false;

        this._bars = Math.max(1, bars);
        this._spb = spb;
        this._at = at || 0;
        this._chunks = [];
        this._passAt = -1;
        this._skip = 1;                      // one pass to find the beat

        const type = this._mime();
        try {
            this._rec = type ? new MediaRecorder(this.stream, { mimeType: type })
                             : new MediaRecorder(this.stream);
        } catch (_) {
            this.error = 'This browser will not record that input.';
            return false;
        }
        this._type = this._rec.mimeType || type || 'audio/webm';
        this._rec.ondataavailable = e => { if (e.data && e.data.size) this._chunks.push(e.data); };
        this._rec.onstop = () => this._finish();
        this._rec.onerror = () => { this.error = 'The recorder stopped.'; this.finish(); };

        // The clock reading is taken before start(), not in onstart: onstart
        // is a callback and arrives whenever the main thread gets round to
        // it, which is the very error being avoided here.
        this._recAt = this._ctx.currentTime;
        try { this._rec.start(250); }
        catch (_) {
            this.error = 'Could not start the recorder.';
            this._rec = null;
            return false;
        }
        this.state = 'armed';
        this.error = '';
        return true;
    },

    /// The studio calls this each time the playhead crosses the top of the
    /// loop. It is the only timing signal the microphone gets, and it does
    /// both jobs: count in, then mark the take's zero.
    passStart(now) {
        if (this.state !== 'armed') return;
        if (this._skip > 0) {
            this._skip--;
            if (this.onstate) this.onstate();
            return;
        }
        this._passAt = now;
        this.state = 'rolling';
        // Stop at the end of the pass. The quarter second of tail is slack
        // for the last syllable, and playback trims to the span anyway.
        this._stop = setTimeout(() => this.finish(), (this._bars * this._spb + 0.25) * 1000);
        if (this.onstate) this.onstate();
    },

    finish() {
        if (this._stop) { clearTimeout(this._stop); this._stop = null; }
        if (this._rec && this._rec.state !== 'inactive') {
            try { this._rec.stop(); return; } catch (_) {}
        }
        this._finish();
    },

    async _finish() {
        const chunks = this._chunks || [];
        const passAt = this._passAt;
        this._rec = null; this._chunks = null; this._stop = null;
        this.state = this.stream ? 'live' : 'off';

        // Stopped during the count-in: nothing was ever aimed at the beat,
        // so there is nothing to keep.
        if (!chunks.length || passAt < 0) {
            if (this.onstate) this.onstate();
            return;
        }

        try {
            const blob = new Blob(chunks, { type: this._type });
            const bytes = new Uint8Array(await blob.arrayBuffer());
            if (this.onclip) await this.onclip({
                bytes, type: this._type,
                at: this._at, bars: this._bars,
                lead: Math.max(0, passAt - this._recAt),
                seconds: this._bars * this._spb,
            });
        } catch (_) {
            this.error = 'That take could not be read back.';
        }
        if (this.onstate) this.onstate();
    },
};
