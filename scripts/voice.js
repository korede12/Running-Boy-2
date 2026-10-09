// ── The voice ─────────────────────────────────────────────────────────────
// Record a vocal, press one button, and it comes back sounding like a record.
//
// Almost none of this is a model, and saying so plainly is the point. Pitch
// correction is from 1997: find the fundamental, decide what it should have
// been, move it. A gate is a threshold. A de-esser is a compressor listening
// to a high band. What makes it feel clever is not the processing, it is that
// the processing knows the song — it tunes to the key the track is actually
// in, and the delay lands on the dotted eighth of the actual tempo. A plugin
// cannot do that because nobody tells it.
//
// The work splits in two, along a line that matters:
//
//   SAMPLE DOMAIN — gate and pitch correction, because no Web Audio node can
//   do either. These render a new buffer, once, offline, and the result is
//   cached. They are derived from the original and the settings, so nothing
//   destructive is ever saved: a take can always go back to how it was sung.
//
//   NODE GRAPH — filters, compression, de-essing, delay, reverb, all of which
//   are nodes and should stay nodes. They are built fresh for every playback,
//   which means they apply to a bounce for free, through the same code.

const Voice = {

    // ── The chain ─────────────────────────────────────────────────────────
    // Numbers chosen for a close, bright, dry-ish lead vocal over a busy low
    // end — which is the Afrobeats problem: the bass and the log drum own
    // everything under 200Hz and the vocal has to sit above them without
    // getting thin.

    PRESETS: {
        lead: {
            name: 'Lead vocal',
            gate: { on: true, open: -44, close: -52, hold: 0.08, fade: 0.02 },
            hpf: 88,
            mud: { hz: 340, db: -2.2, q: 1.1 },      // where it gets boxy
            deess: { on: true, hz: 6400, db: -9, ratio: 4 },
            comp: { threshold: -19, ratio: 3.2, attack: 0.004, release: 0.13, knee: 6 },
            air: { hz: 8200, db: 2.6 },
            delay: { on: true, note: 'dotted8', feedback: 0.26, mix: 0.17, hpf: 700 },
            verb: { on: true, seconds: 1.3, predelay: 0.022, mix: 0.13, hpf: 400 },
            drive: 0,
        },
        adlib: {
            name: 'Ad-lib',
            gate: { on: true, open: -40, close: -48, hold: 0.05, fade: 0.02 },
            hpf: 140,
            mud: { hz: 400, db: -3, q: 1.2 },
            deess: { on: true, hz: 6200, db: -10, ratio: 5 },
            comp: { threshold: -22, ratio: 4, attack: 0.003, release: 0.1, knee: 4 },
            air: { hz: 9000, db: 3.4 },
            delay: { on: true, note: 'eighth', feedback: 0.4, mix: 0.3, hpf: 900 },
            verb: { on: true, seconds: 1.8, predelay: 0.03, mix: 0.24, hpf: 500 },
            drive: 0.12,
        },
        clean: {
            name: 'Clean',
            gate: { on: true, open: -50, close: -58, hold: 0.1, fade: 0.03 },
            hpf: 70,
            mud: { hz: 300, db: -1, q: 1 },
            deess: { on: true, hz: 6800, db: -6, ratio: 3 },
            comp: { threshold: -16, ratio: 2.4, attack: 0.006, release: 0.16, knee: 8 },
            air: { hz: 8000, db: 1.4 },
            delay: { on: false, note: 'dotted8', feedback: 0.2, mix: 0.1, hpf: 700 },
            verb: { on: true, seconds: 1, predelay: 0.015, mix: 0.08, hpf: 400 },
            drive: 0,
        },
    },

    preset(id) {
        const p = this.PRESETS[id] || this.PRESETS.lead;
        return JSON.parse(JSON.stringify(p));
    },

    // ── Finding the pitch ─────────────────────────────────────────────────
    // YIN. The idea is older than the paper: a periodic signal looks like
    // itself one period later, so slide it against itself and find the lag
    // where the difference collapses. The refinements are what make it work
    // on a real voice — normalising so loud and quiet frames use the same
    // threshold, and interpolating the dip so the answer is not quantised to
    // whole samples.

    YIN_THRESHOLD: 0.14,
    MIN_HZ: 65,              // low male speaking voice
    MAX_HZ: 1200,            // well above any sung note

    /// The fundamental of one frame, in Hz, or 0 when there is no pitch in
    /// it — which is most of a vocal, between the words.
    yin(frame, rate) {
        const n = frame.length;
        const maxLag = Math.min(Math.floor(n / 2), Math.floor(rate / this.MIN_HZ));
        const minLag = Math.max(2, Math.floor(rate / this.MAX_HZ));
        if (maxLag <= minLag) return 0;

        // Too quiet to be a note: do not dignify the noise floor with a pitch.
        let power = 0;
        for (let i = 0; i < n; i++) power += frame[i] * frame[i];
        if (Math.sqrt(power / n) < 0.004) return 0;

        const diff = new Float32Array(maxLag + 1);
        for (let lag = minLag; lag <= maxLag; lag++) {
            let sum = 0;
            for (let i = 0; i < n - maxLag; i++) {
                const d = frame[i] - frame[i + lag];
                sum += d * d;
            }
            diff[lag] = sum;
        }

        // Cumulative mean normalisation: makes the threshold mean the same
        // thing at every lag, which raw difference does not.
        const norm = new Float32Array(maxLag + 1);
        norm[minLag] = 1;
        let running = 0;
        for (let lag = minLag; lag <= maxLag; lag++) {
            running += diff[lag];
            norm[lag] = running ? diff[lag] * (lag - minLag + 1) / running : 1;
        }

        // The FIRST dip below the threshold, not the lowest — the lowest is
        // often an octave down, which is the classic way a tuner ruins a
        // take.
        let best = -1;
        for (let lag = minLag; lag < maxLag; lag++) {
            if (norm[lag] < this.YIN_THRESHOLD) {
                while (lag + 1 < maxLag && norm[lag + 1] < norm[lag]) lag++;
                best = lag;
                break;
            }
        }
        if (best === -1) return 0;

        // Parabolic interpolation round the dip, for a fractional lag.
        const a = norm[best - 1], b = norm[best], c = norm[best + 1];
        const shift = (a + c - 2 * b) ? (a - c) / (2 * (a + c - 2 * b)) : 0;
        const period = best + (isFinite(shift) ? Math.max(-1, Math.min(1, shift)) : 0);
        return period > 0 ? rate / period : 0;
    },

    /// The fundamental over a whole buffer, one reading per hop.
    track(data, rate, hop, window) {
        hop = hop || Math.round(rate * 0.01);
        window = window || 2048;
        const out = { hop, rate, hz: [] };
        const frame = new Float32Array(window);
        for (let at = 0; at + window <= data.length; at += hop) {
            frame.set(data.subarray(at, at + window));
            out.hz.push(this.yin(frame, rate));
        }
        // A single frame disagreeing with both its neighbours is a glitch,
        // not a note. Median of three, over the voiced frames only.
        const hz = out.hz;
        for (let i = 1; i < hz.length - 1; i++) {
            if (!hz[i - 1] || !hz[i] || !hz[i + 1]) continue;
            const three = [hz[i - 1], hz[i], hz[i + 1]].sort((a, b) => a - b);
            hz[i] = three[1];
        }
        return out;
    },

    // ── Moving the pitch ──────────────────────────────────────────────────
    // PSOLA: cut the signal into grains one period long, then lay them back
    // down spaced by the period you WANTED. More grains in the same time
    // means a higher pitch; the grains themselves are untouched, so the
    // voice still sounds like the person.
    //
    // This shifts formants along with the pitch, which is audible past a
    // couple of semitones and inaudible below one. Correction is almost
    // always under a semitone, so for tuning it is the right trade. A
    // harmony stack a third up would need formant correction, and that is
    // not this.

    /// Retune a channel so every voiced moment lands on a note in the key.
    /// `strength` is how far towards the note to go: 1 is hard tuning, which
    /// this genre actually wants, and 0.6 keeps the performance.
    retune(data, rate, ctx, opts) {
        const strength = opts && opts.strength != null ? opts.strength : 0.9;
        const hop = Math.round(rate * 0.01);
        const pitch = this.track(data, rate, hop, 2048);
        const out = new Float32Array(data.length);
        const counts = new Float32Array(data.length);

        let at = 0;              // where we are reading
        let outAt = 0;           // where we are writing
        let moved = 0, voiced = 0;

        while (at < data.length) {
            const frame = Math.min(pitch.hz.length - 1, Math.round(at / hop));
            const hz = frame >= 0 ? pitch.hz[frame] : 0;

            if (!hz) {
                // Unvoiced: copy a plain grain through. Breath and
                // consonants have no pitch to correct and sound wrong if
                // you try.
                const grain = Math.round(rate * 0.01);
                this.lay(out, counts, data, at, outAt, grain);
                at += grain; outAt += grain;
                continue;
            }

            voiced++;
            const period = rate / hz;
            const want = Ctx.snap(Ctx.midi(hz), ctx);
            const target = Ctx.hz(want * strength + Ctx.midi(hz) * (1 - strength));
            const ratio = target / hz;
            if (Math.abs(1 - ratio) > 0.001) moved++;

            // One grain, two periods wide, Hann-windowed, centred here.
            const grain = Math.round(period * 2);
            this.lay(out, counts, data, at, outAt, grain);

            // Read on by a period; write on by the period we wanted. That
            // difference IS the pitch shift.
            at += Math.round(period);
            outAt += Math.max(1, Math.round(period / ratio));
            if (outAt >= data.length) break;
        }

        // Overlapping Hann grains do not sum to exactly one, so divide by
        // what actually landed — otherwise the output breathes in and out.
        for (let i = 0; i < out.length; i++)
            if (counts[i] > 0.001) out[i] /= counts[i];

        return { data: out, voiced, moved, pitch };
    },

    /// Window one grain out of the source and add it into the output.
    lay(out, counts, src, from, to, len) {
        const n = Math.max(2, len);
        for (let i = 0; i < n; i++) {
            const s = from - (n >> 1) + i;
            const d = to - (n >> 1) + i;
            if (s < 0 || s >= src.length || d < 0 || d >= out.length) continue;
            const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
            out[d] += src[s] * w;
            counts[d] += w;
        }
    },

    // ── The gate ──────────────────────────────────────────────────────────
    // Web Audio has no gate, and a vocal recorded in a room needs one more
    // than it needs anything else here: without it the reverb and the
    // compressor spend the gaps amplifying the fan, the street and the
    // laptop.

    gate(data, rate, set) {
        const open = Math.pow(10, set.open / 20);
        const close = Math.pow(10, set.close / 20);
        const hold = Math.round(rate * (set.hold || 0.08));
        const fade = Math.max(1, Math.round(rate * (set.fade || 0.02)));
        const win = Math.max(1, Math.round(rate * 0.005));

        // Follow the envelope first, then decide — deciding sample by sample
        // chatters on every zero crossing.
        const out = new Float32Array(data.length);
        let level = 0, isOpen = false, held = 0, gain = 0;
        for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            level += (a - level) / win;
            if (level > open) { isOpen = true; held = hold; }
            else if (level < close) { if (held > 0) held--; else isOpen = false; }
            const want = isOpen ? 1 : 0;
            gain += (want - gain) / fade;
            out[i] = data[i] * gain;
        }
        return out;
    },

    // ── The node graph ────────────────────────────────────────────────────
    // Built fresh for each playback, and returned as a pair so whoever is
    // scheduling can splice it in. Playback and bounce both come through
    // here, so what you export is what you heard.

    build(actx, fx, ctx) {
        const p = fx && fx.set ? fx.set : this.preset('lead');
        const input = actx.createGain();
        let node = input;
        const link = n => { node.connect(n); node = n; return n; };

        if (p.hpf) {
            const f = actx.createBiquadFilter();
            f.type = 'highpass'; f.frequency.value = p.hpf; f.Q.value = 0.7;
            link(f);
        }
        if (p.mud && p.mud.db) {
            const f = actx.createBiquadFilter();
            f.type = 'peaking';
            f.frequency.value = p.mud.hz; f.gain.value = p.mud.db; f.Q.value = p.mud.q;
            link(f);
        }

        // A de-esser is a compressor that only hears the sibilance: split the
        // top off, squash it hard, put it back.
        if (p.deess && p.deess.on) {
            const split = node;
            const low = actx.createBiquadFilter();
            low.type = 'lowpass'; low.frequency.value = p.deess.hz;
            const high = actx.createBiquadFilter();
            high.type = 'highpass'; high.frequency.value = p.deess.hz;
            const squash = actx.createDynamicsCompressor();
            squash.threshold.value = p.deess.db;
            squash.ratio.value = p.deess.ratio;
            squash.attack.value = 0.001;
            squash.release.value = 0.05;
            squash.knee.value = 2;
            const join = actx.createGain();
            split.connect(low); low.connect(join);
            split.connect(high); high.connect(squash); squash.connect(join);
            node = join;
        }

        if (p.comp) {
            const c = actx.createDynamicsCompressor();
            c.threshold.value = p.comp.threshold;
            c.ratio.value = p.comp.ratio;
            c.attack.value = p.comp.attack;
            c.release.value = p.comp.release;
            c.knee.value = p.comp.knee;
            link(c);
            // Compression takes level away; give it back, or the vocal just
            // gets quieter the more you squash it.
            const makeup = actx.createGain();
            makeup.gain.value = Math.pow(10, Math.min(9, -p.comp.threshold * 0.22) / 20);
            link(makeup);
        }

        if (p.air && p.air.db) {
            const f = actx.createBiquadFilter();
            f.type = 'highshelf'; f.frequency.value = p.air.hz; f.gain.value = p.air.db;
            link(f);
        }

        if (p.drive) {
            const s = actx.createWaveShaper();
            s.curve = this.curve(p.drive);
            s.oversample = '2x';
            link(s);
        }

        const dry = node;
        const output = actx.createGain();
        dry.connect(output);

        // The sends. A delay on the dotted eighth of the song's own tempo is
        // the single most Afrobeats thing in here, and it is only possible
        // because the tempo is known exactly rather than tapped.
        if (p.delay && p.delay.on) {
            const time = p.delay.note === 'eighth' ? ctx.eighth : ctx.dottedEighth;
            const d = actx.createDelay(Math.max(1, time + 0.1));
            d.delayTime.value = time;
            const fb = actx.createGain();
            fb.gain.value = Math.min(0.75, p.delay.feedback);
            const cut = actx.createBiquadFilter();
            cut.type = 'highpass'; cut.frequency.value = p.delay.hpf || 600;
            const send = actx.createGain();
            send.gain.value = p.delay.mix;
            dry.connect(cut); cut.connect(d);
            d.connect(fb); fb.connect(d);              // the repeats
            d.connect(send); send.connect(output);
        }

        if (p.verb && p.verb.on) {
            const pre = actx.createDelay(0.2);
            pre.delayTime.value = p.verb.predelay || 0.02;
            const conv = actx.createConvolver();
            conv.buffer = this.impulse(actx, p.verb.seconds);
            const cut = actx.createBiquadFilter();
            cut.type = 'highpass'; cut.frequency.value = p.verb.hpf || 400;
            const send = actx.createGain();
            send.gain.value = p.verb.mix;
            dry.connect(cut); cut.connect(pre); pre.connect(conv);
            conv.connect(send); send.connect(output);
        }

        return { input, output };
    },

    /// A soft saturation curve. Gentle: this is for thickness, not fuzz.
    curve(amount) {
        const n = 1024, c = new Float32Array(n);
        const k = amount * 40;
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / n - 1;
            c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return c;
    },

    /// A plate, near enough: noise with an exponential decay, slightly
    /// different in each ear so it opens up. A real impulse response would
    /// be better and would be a download.
    impulse(actx, seconds) {
        const rate = actx.sampleRate;
        const n = Math.max(1, Math.round(rate * (seconds || 1.3)));
        const buf = actx.createBuffer(2, n, rate);
        for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < n; i++) {
                const t = i / n;
                // A short build before the decay, which is what stops it
                // sounding like a burst of noise.
                const swell = Math.min(1, t * 24);
                d[i] = (Math.random() * 2 - 1) * swell * Math.pow(1 - t, 2.6);
            }
        }
        return buf;
    },

    // ── One button ────────────────────────────────────────────────────────

    /// Everything the sample domain has to do, in one pass: gate, then tune.
    /// Returns a new AudioBuffer, or null when there is nothing to change.
    render(actx, buffer, fx, ctx) {
        if (!buffer) return null;
        const set = fx && fx.set ? fx.set : this.preset('lead');
        const wantGate = !!(set.gate && set.gate.on);
        const wantTune = !!(fx && fx.tune && fx.tune.on);
        if (!wantGate && !wantTune) return null;

        const rate = buffer.sampleRate;
        const chans = buffer.numberOfChannels;
        const out = actx.createBuffer(chans, buffer.length, rate);
        let report = null;

        for (let ch = 0; ch < chans; ch++) {
            let d = buffer.getChannelData(ch);
            if (wantGate) d = this.gate(d, rate, set.gate);
            if (wantTune) {
                const done = this.retune(d, rate, ctx, fx.tune);
                d = done.data;
                if (!report) report = { voiced: done.voiced, moved: done.moved };
            }
            out.getChannelData(ch).set(d.subarray(0, buffer.length));
        }
        out._report = report;
        return out;
    },

    /// What the studio puts on a clip when you press the button.
    fresh(presetId, ctx) {
        return {
            on: true,
            preset: presetId || 'lead',
            set: this.preset(presetId),
            tune: {
                on: true,
                strength: 0.9,
                // Remembered so a change of key can say it is now stale.
                key: ctx ? ctx.tonic + ':' + ctx.scale : null,
            },
        };
    },
};
