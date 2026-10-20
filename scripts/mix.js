// ── The mixer ─────────────────────────────────────────────────────────────
// Everything was arriving at the output on its own terms. The synth ran at a
// fixed 0.22 through a compressor it owned; audio clips went straight to the
// speakers at whatever gain the clip said. Nothing summed anywhere, so the
// balance between a programmed part and a recorded one was not a decision
// anybody had made — it was two numbers chosen months apart for unrelated
// reasons. That is what a master channel is for, before any of the nice
// processing: a single place where things are summed, so their levels mean
// something relative to each other.
//
//   TRACKS  every MIDI track has a strip: its level (the track's own volume,
//           the number the .vbm and the .mid already carry), a pan, and two
//           sends. A strip is made the first time its channel sounds, so a
//           track added mid-song has one without anything being rebuilt.
//   DRUMS   get the work. Saturation for weight, a slow-attack compressor
//           for punch, and a hard-squashed copy blended underneath — which
//           is the oldest trick in drum mixing and still the one that does
//           the most. You cannot buy this with a louder fader.
//   MUSIC   the tonal synth parts, high-passed to stay out of the kick.
//   AUDIO   the tape: vocals, loops, samples.
//   SPACE   a reverb, and ECHO a delay timed to the song. Sends, not
//           inserts: one room that everything is in, which is what makes a
//           mix sound like one place rather than several.
//   MASTER  glue, a tilt, and a ceiling nothing gets past.
//
// The graph is built ONCE with every stage in it, and a stage that is off
// is set to do nothing rather than left out. That is what lets a fader move
// while the beat plays: changing a number is a ramp on a parameter, where
// changing the shape of a Web Audio graph means tearing it down — and the
// old mixer did exactly that, stopping and restarting the loop on every
// pixel of a drag.
//
// The ceiling matters more than it sounds. Web Audio will happily hand the
// soundcard samples past 1.0 and they come back as crackle, which people
// hear as "this app sounds bad" rather than "I should turn something down".

const Mixer = {

    // Afrobeats defaults: drums forward and weighty, the low end left alone,
    // vocals bright and present, a small room around everything.
    DEFAULT: {
        master: {
            gain: 0.9,
            glue: { on: true, threshold: -15, ratio: 2, attack: 0.025, release: 0.25, knee: 10 },
            tilt: { low: 1.2, high: 1.6 },      // dB, gentle smile
            ceiling: -1.2,                      // dBFS, nothing past this
        },
        drums: {
            gain: 1,
            weight: 0.3,        // saturation
            punch: 0.45,        // slow-attack compression
            parallel: 0.25,     // the squashed copy underneath
            kick: 2.2,          // dB, low shelf
            snap: 1.8,          // dB, around the crack of a snare
        },
        music: { gain: 0.95, hpf: 110 },
        audio: { gain: 1, space: 0.12, echo: 0 },
        space: { gain: 0.8, size: 1.6, tone: 6500 },        // seconds, Hz
        echo:  { gain: 0.7, feedback: 0.32, time: 'dotted', tone: 4200 },
        // Per MIDI channel: pan -1..1, and how much goes to each return.
        strips: {},
        // Per audio lane, the same, plus a level: a lane has no track
        // volume of its own to borrow.
        lanes: {},
    },

    STRIP: { pan: 0, space: 0, echo: 0 },

    /// Where a new track starts: drums dry, everything else in the room.
    stripDefault(channel) {
        return channel === 9 ? { pan: 0, space: 0.04, echo: 0 }
                             : { pan: 0, space: 0.16, echo: 0 };
    },

    laneDefault() { return { gain: 1, pan: 0, space: 0, echo: 0 }; },

    /// Echo times, as fractions of a beat.
    TIMES: { eighth: 0.5, dotted: 0.75, quarter: 1, triplet: 1 / 3 },

    fresh() { return JSON.parse(JSON.stringify(this.DEFAULT)); },

    /// Fill in anything a saved mix is missing, so an old beat opens rather
    /// than throwing on a setting that did not exist when it was saved.
    settle(set) {
        const out = this.fresh();
        if (!set) return out;
        for (const bus of Object.keys(out)) {
            if (!set[bus] || bus === 'strips' || bus === 'lanes') continue;
            for (const k of Object.keys(out[bus])) {
                const v = set[bus][k];
                if (v === undefined) continue;
                out[bus][k] = (v && typeof v === 'object')
                    ? Object.assign(out[bus][k], v) : v;
            }
        }
        if (set.strips && typeof set.strips === 'object')
            for (const ch of Object.keys(set.strips))
                out.strips[ch] = Object.assign(this.stripDefault(+ch), set.strips[ch]);
        if (set.lanes && typeof set.lanes === 'object')
            for (const l of Object.keys(set.lanes))
                out.lanes[l] = Object.assign(this.laneDefault(), set.lanes[l]);
        return out;
    },

    /// A strip's settings, made on first asking.
    strip(set, channel) {
        if (!set.strips) set.strips = {};
        if (!set.strips[channel]) set.strips[channel] = this.stripDefault(channel);
        return set.strips[channel];
    },

    lane(set, lane) {
        if (!set.lanes) set.lanes = {};
        if (!set.lanes[lane]) set.lanes[lane] = this.laneDefault();
        return set.lanes[lane];
    },

    /// A track's volume as a gain. 100 is unity — the original's default —
    /// and the top of MIDI's range is about four decibels over it.
    volGain(v) { const x = (v == null ? 100 : v) / 100; return x * x; },
    volDb(v) { const g = this.volGain(v); return g > 0 ? 20 * Math.log10(g) : -Infinity; },

    // ── Building it ───────────────────────────────────────────────────────

    /// Build the whole thing against any context. Live playback and the
    /// offline bounce both call this, so an export is mixed exactly as it
    /// was heard rather than merely similarly. `song` is where a strip
    /// finds its track's level; `ctx` is the musical context, for the echo.
    build(actx, set, ctx, song) {
        const s = this.settle(set);
        const master = this.master(actx, s.master);
        const space = this.space(actx, s.space, master.in);
        const echo = this.echo(actx, s.echo, master.in, ctx);
        const drums = this.drums(actx, s.drums, master.in);
        const music = this.music(actx, s.music, master.in);
        const audio = this.audio(actx, s.audio, master.in, space.in, echo.in);
        const mix = {
            actx, set: s, song, ctx,
            out: master.out, master, space, echo, drums, music, audio,
            in: { drums: drums.in, music: music.in, audio: audio.in },
            strips: new Map(), lanes: new Map(),
        };
        // The synth asks for a channel's input the first time it plays one,
        // and the tape for a lane's.
        mix.strip = channel => this.stripFor(mix, channel);
        mix.lane = lane => this.laneFor(mix, lane);
        return mix;
    },

    /// A meter's tap. Small, because all it has to answer is "how loud".
    tap(actx, node) {
        const a = actx.createAnalyser();
        a.fftSize = 512;
        a.smoothingTimeConstant = 0;
        node.connect(a);
        return a;
    },

    stripFor(mix, channel) {
        let st = mix.strips.get(channel);
        if (st) return st.in;
        // Sends are post-fader, so turning a track down turns its reverb
        // down with it, which is what everyone expects and few notice.
        this.strip(mix.set, channel);
        st = this.chain(mix, channel === 9 ? mix.drums.in : mix.music.in);
        mix.strips.set(channel, st);
        this.setStrip(mix, channel, true);
        return st.in;
    },

    /// The common shape of a strip: in, level, pan, two post-fader sends.
    chain(mix, dest) {
        const actx = mix.actx;
        const input = actx.createGain(), level = actx.createGain();
        const pan = actx.createStereoPanner ? actx.createStereoPanner() : null;
        input.connect(level);
        let last = level;
        if (pan) { level.connect(pan); last = pan; }
        last.connect(dest);
        const space = actx.createGain(), echo = actx.createGain();
        last.connect(space); space.connect(mix.space.in);
        last.connect(echo); echo.connect(mix.echo.in);
        return { in: input, level, pan, space, echo, meter: this.tap(actx, last) };
    },

    laneFor(mix, lane) {
        let st = mix.lanes.get(lane);
        if (st) return st.in;
        st = this.chain(mix, mix.audio.in);
        mix.lanes.set(lane, st);
        this.setLane(mix, lane, true);
        return st.in;
    },

    setLane(mix, lane, now) {
        const st = mix.lanes.get(lane);
        if (!st) return;
        const s = this.lane(mix.set, lane), to = (p, v) => this.to(p, v, now);
        to(st.level.gain, s.gain == null ? 1 : s.gain);
        if (st.pan) to(st.pan.pan, Math.max(-1, Math.min(1, s.pan || 0)));
        to(st.space.gain, s.space || 0);
        to(st.echo.gain, s.echo || 0);
    },

    master(actx, s) {
        const input = actx.createGain();
        const glue = actx.createDynamicsCompressor();
        const low = actx.createBiquadFilter(), high = actx.createBiquadFilter();
        low.type = 'lowshelf'; low.frequency.value = 110;
        high.type = 'highshelf'; high.frequency.value = 7500;
        const level = actx.createGain();
        // The ceiling. A compressor with a near-vertical ratio and an attack
        // as fast as the node allows is not a mastering limiter, but it is
        // the difference between a loud mix and a crackling one.
        const ceiling = actx.createDynamicsCompressor();
        ceiling.ratio.value = 20;
        ceiling.attack.value = 0.0005;
        ceiling.release.value = 0.06;
        ceiling.knee.value = 0;
        input.connect(glue).connect(low).connect(high).connect(level).connect(ceiling);
        ceiling.connect(actx.destination);
        return { in: input, out: ceiling, glue, low, high, level, ceiling,
                 meter: this.tap(actx, ceiling) };
    },

    music(actx, s, dest) {
        const input = actx.createGain();
        // Out of the way of the kick. Synth bass is the exception, and the
        // cut is gentle enough not to gut it.
        const hpf = actx.createBiquadFilter();
        hpf.type = 'highpass'; hpf.Q.value = 0.6;
        const g = actx.createGain();
        input.connect(hpf).connect(g).connect(dest);
        return { in: input, hpf, gain: g, meter: this.tap(actx, g) };
    },

    audio(actx, s, dest, space, echo) {
        const input = actx.createGain();
        const g = actx.createGain();
        input.connect(g).connect(dest);
        const sp = actx.createGain(), ec = actx.createGain();
        g.connect(sp); sp.connect(space);
        g.connect(ec); ec.connect(echo);
        return { in: input, gain: g, space: sp, echo: ec, meter: this.tap(actx, g) };
    },

    /// The one that earns its keep.
    drums(actx, s, dest) {
        const input = actx.createGain();
        const kick = actx.createBiquadFilter();
        kick.type = 'lowshelf'; kick.frequency.value = 95;
        // Where the crack of a snare and the edge of a clap live.
        const snap = actx.createBiquadFilter();
        snap.type = 'peaking'; snap.frequency.value = 3600; snap.Q.value = 1.1;
        const weight = actx.createWaveShaper();
        weight.oversample = '2x';
        input.connect(kick).connect(snap).connect(weight);

        const sum = actx.createGain();
        // Punch: the attack is deliberately slow, so the stick gets through
        // before the compressor closes. A fast attack would do the opposite
        // and flatten exactly the part that makes a drum sound like a hit.
        const punch = actx.createDynamicsCompressor();
        punch.attack.value = 0.018; punch.release.value = 0.14; punch.knee.value = 6;
        const make = actx.createGain();
        weight.connect(punch).connect(make).connect(sum);

        // Parallel: a copy squashed into the ground and slid underneath. It
        // does not replace the dry signal, it fills in behind it, which is
        // why the kit gets bigger without getting louder.
        const squash = actx.createDynamicsCompressor();
        squash.threshold.value = -42; squash.ratio.value = 12;
        squash.attack.value = 0.001; squash.release.value = 0.09; squash.knee.value = 3;
        const blend = actx.createGain();
        weight.connect(squash).connect(blend).connect(sum);

        const g = actx.createGain();
        sum.connect(g).connect(dest);
        return { in: input, kick, snap, weight, punch, make, blend, gain: g, _weight: null,
                 meter: this.tap(actx, g) };
    },

    /// A room, made rather than recorded: noise in two channels, decaying
    /// exponentially, darkened as it goes the way air darkens a real one.
    space(actx, s, dest) {
        const input = actx.createGain();
        const pre = actx.createDelay(0.1);
        pre.delayTime.value = 0.018;               // a little air before the room
        const verb = actx.createConvolver();
        const tone = actx.createBiquadFilter();
        tone.type = 'lowpass';
        const lo = actx.createBiquadFilter();
        lo.type = 'highpass'; lo.frequency.value = 180;   // no mud in the room
        const g = actx.createGain();
        input.connect(pre).connect(lo).connect(verb).connect(tone).connect(g).connect(dest);
        return { in: input, verb, tone, gain: g, _size: null, meter: this.tap(actx, g) };
    },

    impulse(actx, seconds) {
        const rate = actx.sampleRate, n = Math.max(1, Math.floor(rate * seconds));
        const buf = actx.createBuffer(2, n, rate);
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            let lp = 0;
            for (let i = 0; i < n; i++) {
                const t = i / n;
                // Duller as it decays: a one-pole low-pass whose coefficient
                // falls with time.
                const k = 0.65 - 0.5 * t;
                lp += k * ((Math.random() * 2 - 1) - lp);
                d[i] = lp * Math.pow(1 - t, 2.2) * (i < rate * 0.004 ? i / (rate * 0.004) : 1);
            }
        }
        return buf;
    },

    /// A delay with the repeats fed back through a filter, so each one is
    /// a little darker than the last, and timed to the beat.
    echo(actx, s, dest, ctx) {
        const input = actx.createGain();
        const delay = actx.createDelay(4);
        const fb = actx.createGain();
        const tone = actx.createBiquadFilter();
        tone.type = 'lowpass';
        const lo = actx.createBiquadFilter();
        lo.type = 'highpass'; lo.frequency.value = 220;
        const g = actx.createGain();
        input.connect(lo).connect(delay);
        delay.connect(tone).connect(fb).connect(delay);
        tone.connect(g).connect(dest);
        return { in: input, delay, fb, tone, gain: g, meter: this.tap(actx, g) };
    },

    /// An odd number of points, so silence lands exactly on the middle one
    /// and comes out as silence. With an even number the shaper reads zero
    /// between two points, a hair below it, and the bus carried a DC offset
    /// that the compressors and the kick shelf after it then amplified.
    curve(amount) {
        const n = 1025, c = new Float32Array(n);
        const k = amount * 28;
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / (n - 1) - 1;
            c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return c;
    },

    // ── Moving it ─────────────────────────────────────────────────────────

    /// A parameter to a value. While the context runs it glides — about
    /// fifteen milliseconds — so a fader drag is smooth rather than a
    /// staircase of clicks; before the first render it is simply set.
    to(param, v, now) {
        if (!param || !Number.isFinite(v)) return;
        if (now) { param.cancelScheduledValues(0); param.value = v; return; }
        const t = param.context ? param.context.currentTime : 0;
        try { param.setTargetAtTime(v, t, 0.015); } catch (_) { param.value = v; }
    },

    /// Every setting onto the graph. Cheap enough to call on every fader
    /// event: it is a few dozen parameter ramps and, only when the room's
    /// size or the drive changed, a new impulse or curve.
    apply(mix, set, now) {
        if (!mix) return;
        // The same object the studio edits, not a copy of it: a copy would
        // leave the panel and the graph reading two different mixes.
        if (set) mix.set = set;
        const s = mix.set;
        const actx = mix.actx, to = (p, v) => this.to(p, v, now);
        const db = v => Math.pow(10, v / 20);

        const m = mix.master, ms = s.master;
        // A compressor at ratio 1 does nothing at all, which is "off".
        const glue = ms.glue && ms.glue.on;
        to(m.glue.threshold, glue ? ms.glue.threshold : 0);
        to(m.glue.ratio, glue ? ms.glue.ratio : 1);
        m.glue.attack.value = ms.glue.attack; m.glue.release.value = ms.glue.release;
        m.glue.knee.value = ms.glue.knee;
        to(m.low.gain, (ms.tilt && ms.tilt.low) || 0);
        to(m.high.gain, (ms.tilt && ms.tilt.high) || 0);
        to(m.level.gain, ms.gain == null ? 0.9 : ms.gain);
        to(m.ceiling.threshold, ms.ceiling == null ? -1.2 : ms.ceiling);

        const d = mix.drums, ds = s.drums;
        to(d.kick.gain, ds.kick || 0);
        to(d.snap.gain, ds.snap || 0);
        if (d._weight !== ds.weight) { d.weight.curve = ds.weight ? this.curve(ds.weight) : null; d._weight = ds.weight; }
        const p = ds.punch || 0;
        to(d.punch.threshold, p ? -20 - 6 * p : 0);
        to(d.punch.ratio, p ? 2 + 4 * p : 1);
        to(d.make.gain, 1 + 0.35 * p);
        to(d.blend.gain, (ds.parallel || 0) * 0.55);
        to(d.gain.gain, ds.gain == null ? 1 : ds.gain);

        to(mix.music.hpf.frequency, s.music.hpf || 10);
        to(mix.music.gain.gain, s.music.gain == null ? 1 : s.music.gain);

        to(mix.audio.gain.gain, s.audio.gain == null ? 1 : s.audio.gain);
        to(mix.audio.space.gain, s.audio.space || 0);
        to(mix.audio.echo.gain, s.audio.echo || 0);

        const sp = mix.space, ss = s.space;
        const size = Math.max(0.3, Math.min(6, ss.size || 1.6));
        if (sp._size !== size) { sp.verb.buffer = this.impulse(actx, size); sp._size = size; }
        to(sp.tone.frequency, ss.tone || 6500);
        to(sp.gain.gain, ss.gain == null ? 0.8 : ss.gain);

        const e = mix.echo, es = s.echo;
        const tempo = (mix.song && mix.song.tempo) || (mix.ctx && mix.ctx.tempo) || 120;
        to(e.delay.delayTime, Math.min(3.9, (60 / tempo) * (this.TIMES[es.time] || 0.75)));
        to(e.fb.gain, Math.min(0.9, es.feedback || 0));
        to(e.tone.frequency, es.tone || 4200);
        to(e.gain.gain, es.gain == null ? 0.7 : es.gain);

        for (const ch of mix.strips.keys()) this.setStrip(mix, ch, now);
        for (const l of mix.lanes.keys()) this.setLane(mix, l, now);
    },

    /// One strip onto the graph: its track's level, and the strip's own
    /// pan and sends.
    setStrip(mix, channel, now) {
        const st = mix.strips.get(channel);
        if (!st) return;
        const s = this.strip(mix.set, channel), to = (p, v) => this.to(p, v, now);
        const t = mix.song && mix.song.tracks.find(x => x.channel === channel);
        to(st.level.gain, this.volGain(t ? t.volume : 100));
        if (st.pan) to(st.pan.pan, Math.max(-1, Math.min(1, s.pan || 0)));
        to(st.space.gain, s.space || 0);
        to(st.echo.gain, s.echo || 0);
    },

    // ── Reading it ────────────────────────────────────────────────────────

    _buf: null,

    /// How loud a tap is right now: the peak, in decibels.
    level(an) {
        if (!an) return -Infinity;
        if (!this._buf || this._buf.length !== an.fftSize) this._buf = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(this._buf);
        let pk = 0;
        for (let i = 0; i < this._buf.length; i++) {
            const v = Math.abs(this._buf[i]);
            if (v > pk) pk = v;
        }
        return pk > 0 ? 20 * Math.log10(pk) : -Infinity;
    },

    // ── Starting points ───────────────────────────────────────────────────
    // A few whole mixes, because a page of faders is a poor place to start
    // from. Each only says what it changes; the rest stays as it is.
    LOOKS: {
        standard: { name: 'Standard', set: null },
        punchy: {
            name: 'Punchy',
            set: { drums: { punch: 0.75, weight: 0.45, parallel: 0.45, kick: 3.5, snap: 3, gain: 1.1 },
                   master: { glue: { on: true, threshold: -18, ratio: 2.5 } },
                   space: { size: 1.1 } },
        },
        warm: {
            name: 'Warm',
            set: { drums: { punch: 0.35, weight: 0.5, snap: 0.5, kick: 3 },
                   master: { tilt: { low: 2.5, high: -0.5 } },
                   space: { size: 2.2, tone: 4200 }, echo: { tone: 2800 } },
        },
        airy: {
            name: 'Airy',
            set: { drums: { punch: 0.4, weight: 0.2 },
                   master: { tilt: { low: 0.5, high: 3 } },
                   space: { size: 3.2, gain: 1, tone: 9000 }, echo: { feedback: 0.42 } },
        },
        dry: {
            name: 'Dry',
            set: { space: { gain: 0 }, echo: { gain: 0 }, master: { glue: { on: false } } },
        },
    },

    /// Lay a look over the defaults, keeping the strips — pans and sends
    /// are about the song, not about the look.
    look(set, id) {
        const L = this.LOOKS[id];
        const out = this.fresh();
        out.strips = JSON.parse(JSON.stringify((set && set.strips) || {}));
        out.lanes = JSON.parse(JSON.stringify((set && set.lanes) || {}));
        if (!L || !L.set) return out;
        for (const bus of Object.keys(L.set))
            for (const k of Object.keys(L.set[bus])) {
                const v = L.set[bus][k];
                out[bus][k] = (v && typeof v === 'object') ? Object.assign(out[bus][k], v) : v;
            }
        return out;
    },
};
