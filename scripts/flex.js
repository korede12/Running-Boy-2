// ── Flex: making audio agree with the grid ────────────────────────────────
// Two problems that are really one problem.
//
// A loop dragged in was made at somebody else's tempo. A vocal was sung by a
// person, and people are late. Both want the same thing: audio moved in time
// without being moved in pitch, by an amount the song decides.
//
// Changing playback rate is not that. It stretches time and pitch together,
// which is right for a drum break and a transpose for everything else — the
// Fit button already in the studio does exactly this and says so. What is
// here instead is WSOLA: cut the signal into overlapping grains and lay them
// back down closer together or further apart. More grains per second is not
// a higher pitch, it is the same sound taking less time. The "WS" is the
// part that makes it work — before laying each grain down it looks a few
// milliseconds either side for the position that lines up best with what is
// already written, so the waveform stays continuous instead of flanging.
//
// On top of that sit the two things worth having:
//
//   FIT A LOOP. Loops are sold in whole bars — one, two, four, eight. So the
//   bar count is a rounding problem, not a tempo-detection problem, and the
//   stretch follows from it. Onset-based tempo estimation is the fallback
//   for when the rounding is ambiguous, not the first move.
//
//   ALIGN A VOCAL. Find where the words start, decide where they should have
//   started, and stretch the gaps between so every one lands without any of
//   them being cut. That is the whole trick: you do not move the audio, you
//   change the speed of the silence between it.

const Flex = {

    FRAME: 1024,             // ~23ms at 44.1k: long enough to hold a pitch
    OVERLAP: 4,              // synthesis hop is a quarter of a frame
    SEARCH: 0.5,             // how far WSOLA may look, as a fraction of a hop

    // Loops come in these. Half bars exist; five-bar loops do not.
    LENGTHS: [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16],
    MAX_STRETCH: 1.6,        // past this it stops sounding like the thing

    // ── Time stretch ──────────────────────────────────────────────────────

    /// Stretch by `ratio` without touching the pitch. Above 1 is longer.
    stretch(data, rate, ratio) {
        if (!(ratio > 0) || Math.abs(ratio - 1) < 0.0005) return data.slice();

        const N = this.FRAME;
        // Too short to cut into grains. Resampling moves the pitch, which
        // over a fragment this size is inaudible, and is enormously better
        // than the silence that grain-based stretching returns when there
        // is not enough signal to make a single grain from.
        if (data.length < N * 2) return this.resample(data, ratio);

        const Hs = Math.round(N / this.OVERLAP);        // synthesis hop
        const Ha = Hs / ratio;                          // analysis hop
        const tol = Math.max(1, Math.round(Hs * this.SEARCH));
        const outLen = Math.max(N, Math.round(data.length * ratio) + N);

        const out = new Float32Array(outLen);
        const norm = new Float32Array(outLen);
        const win = this.hann(N);

        // What the previous grain would have run into if nothing had moved.
        // Matching against this is what keeps the waveform continuous.
        let target = data.subarray(0, N);
        let read = 0;          // fractional, so the hop does not drift
        let write = 0;

        while (read + N + tol < data.length && write + N < outLen) {
            const base = Math.round(read);
            const at = this.bestOffset(data, target, base, tol, N);

            for (let i = 0; i < N; i++) {
                const s = at + i;
                if (s < 0 || s >= data.length) continue;
                out[write + i] += data[s] * win[i];
                norm[write + i] += win[i];
            }

            const next = at + Hs;
            target = data.subarray(Math.max(0, next), Math.max(0, next) + N);
            read += Ha;
            write += Hs;
        }

        // Overlapping Hann windows do not sum to one, so divide by what
        // actually landed — otherwise the level pumps at the hop rate.
        if (!write) return this.resample(data, ratio);      // no grains landed
        const end = Math.min(outLen, write + N);
        for (let i = 0; i < end; i++) if (norm[i] > 0.0001) out[i] /= norm[i];
        return out.slice(0, Math.max(1, Math.round(data.length * ratio)));
    },

    /// The offset near `base` where the signal best continues `target`.
    /// Decimated, because a correlation this rough does not need every
    /// sample and doing it properly would cost more than the stretch.
    ///
    /// Named for what it does rather than "align", which is taken by the
    /// public one further down — two methods of the same name in one object
    /// literal is not an error, it is just the second one winning.
    bestOffset(data, target, base, tol, N) {
        let best = base, score = -Infinity;
        const step = 4;
        const len = Math.min(N, target.length);
        for (let d = -tol; d <= tol; d += 2) {
            const at = base + d;
            if (at < 0 || at + len >= data.length) continue;
            let dot = 0, energy = 0;
            for (let i = 0; i < len; i += step) {
                const x = data[at + i];
                dot += x * target[i];
                energy += x * x;
            }
            // Normalised, or the loudest offset always wins regardless of
            // whether it actually lines up.
            const s = energy > 1e-9 ? dot / Math.sqrt(energy) : 0;
            if (s > score) { score = s; best = at; }
        }
        return best;
    },

    /// Linear interpolation. Only for fragments too short to stretch
    /// properly — see the note in stretch().
    resample(data, ratio) {
        const n = Math.max(1, Math.round(data.length * ratio));
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const at = (i / ratio);
            const a = Math.floor(at), f = at - a;
            const x = data[a] || 0, y = data[a + 1] != null ? data[a + 1] : x;
            out[i] = x + (y - x) * f;
        }
        return out;
    },

    hann(n) {
        const w = new Float32Array(n);
        for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
        return w;
    },

    // ── Where things start ────────────────────────────────────────────────
    // No FFT. A transient is a sudden rise in energy, and a one-pole
    // high-pass before the envelope is enough to favour consonants and
    // sticks over the body of a note. Spectral flux would be better and
    // would cost a Fourier transform per frame.

    ENV_HOP: 0.005,          // 5ms
    MIN_GAP: 0.055,          // two onsets closer than this are one onset
    RISE: 1.25,              // how much louder a start has to be than what preceded it
    RISE_OVER: 3,            // frames to look back for it: 15ms

    /// The detection function: how much louder it is getting, frame by
    /// frame, in a form a peak-picker can read.
    flux(data, rate) {
        const hop = Math.max(1, Math.round(rate * this.ENV_HOP));
        const n = Math.floor(data.length / hop);
        const env = new Float32Array(n);

        // One-pole high-pass, then energy per frame.
        let prev = 0, hp = 0;
        let at = 0;
        for (let f = 0; f < n; f++) {
            let sum = 0;
            for (let i = 0; i < hop; i++, at++) {
                const x = data[at] || 0;
                hp = 0.86 * (hp + x - prev);
                prev = x;
                sum += hp * hp;
            }
            env[f] = Math.sqrt(sum / hop);
        }

        // Smooth before differencing. A frame is 5ms and a low note is
        // 4.5ms a cycle, so frame energy wobbles with phase alone; without
        // this, a held note reads as a stream of onsets.
        const smooth = new Float32Array(n);
        for (let f = 0; f < n; f++) {
            const a = env[Math.max(0, f - 1)], b = env[f], c = env[Math.min(n - 1, f + 1)];
            smooth[f] = (a + b + c) / 3;
        }

        // Rising edges only, on a log scale so a quiet passage counts as
        // much as a loud one.
        const out = new Float32Array(n);
        for (let f = 1; f < n; f++) {
            const a = Math.log(1 + smooth[f] * 400);
            const b = Math.log(1 + smooth[f - 1] * 400);
            out[f] = Math.max(0, a - b);
        }
        return { fn: out, env: smooth, hop, rate, seconds: hop / rate };
    },

    /// Onset times in seconds. The threshold follows the signal, so it works
    /// on a quiet verse and a loud chorus without being told which is which.
    onsets(data, rate, sensitivity) {
        const d = this.flux(data, rate);
        const fn = d.fn;
        const n = fn.length;
        if (!n) return [];

        const look = Math.max(3, Math.round(0.12 / d.seconds));
        const k = sensitivity == null ? 1.4 : sensitivity;
        const gap = Math.max(1, Math.round(this.MIN_GAP / d.seconds));

        // Two floors. The first stops near-silence producing onsets out of
        // nothing. The second is the one that matters: a peak has to be a
        // real fraction of the biggest thing in the take, or a steady note
        // with no events in it at all fires on its own noise.
        let mean = 0, peak = 0;
        for (let i = 0; i < n; i++) { mean += fn[i]; if (fn[i] > peak) peak = fn[i]; }
        mean /= Math.max(1, n);
        const floor = Math.max(mean * 0.6, peak * 0.16);

        const env = d.env;
        let loudest = 0;
        for (let i = 0; i < n; i++) if (env[i] > loudest) loudest = env[i];

        const out = [];
        let last = -gap;

        // A loop that starts on the downbeat has an onset at zero, and a
        // difference function has nothing before the start to differ from.
        // This is a question about the envelope, not the flux: did the take
        // begin loud? Silence did not, which is also how silence ends up
        // with no onsets rather than one at the top.
        if (loudest > 1e-5) {
            let head = 0;
            for (let i = 0; i < Math.min(n, 3); i++) head = Math.max(head, env[i]);
            if (head >= loudest * 0.3) { out.push(0); last = 0; }
        }

        for (let i = 1; i < n - 1; i++) {
            if (fn[i] <= fn[i - 1] || fn[i] < fn[i + 1]) continue;   // not a peak
            let local = 0, count = 0;
            for (let j = Math.max(0, i - look); j < Math.min(n, i + look); j++) { local += fn[j]; count++; }
            local = count ? local / count : 0;
            if (fn[i] < local * k || fn[i] < floor) continue;

            // The one that actually separates a note starting from a note
            // continuing. A floor under the comparison keeps a rise out of
            // near-silence from dividing by almost nothing.
            const was = Math.max(env[Math.max(0, i - this.RISE_OVER)], loudest * 0.02);
            if (env[i] < was * this.RISE) continue;

            if (i - last < gap) continue;
            last = i;
            out.push(i * d.seconds);
        }
        return out;
    },

    /// A tempo, from the spacing of the onsets. Autocorrelation over the
    /// lags a song could plausibly have.
    tempoOf(data, rate) {
        const d = this.flux(data, rate);
        const fn = d.fn;
        if (fn.length < 20) return 0;

        let best = 0, score = 0;
        const from = Math.round((60 / 200) / d.seconds);     // 200 bpm
        const to = Math.round((60 / 60) / d.seconds);        // 60 bpm
        for (let lag = from; lag <= to && lag < fn.length; lag++) {
            let sum = 0;
            for (let i = 0; i + lag < fn.length; i++) sum += fn[i] * fn[i + lag];
            sum /= (fn.length - lag);
            if (sum > score) { score = sum; best = lag; }
        }
        if (!best) return 0;
        const bpm = 60 / (best * d.seconds);
        // Fold into the range music is actually in — autocorrelation is as
        // happy with half the tempo as with the tempo.
        let out = bpm;
        while (out < 70) out *= 2;
        while (out > 180) out /= 2;
        return out;
    },

    // ── Fitting a loop ────────────────────────────────────────────────────

    /// How many bars a clip is, and what it would have to be stretched by to
    /// become exactly that. Loops are sold in whole bars, so this is mostly
    /// a rounding problem — the tempo estimate is only there to break ties.
    fit(seconds, ctx, data, rate) {
        const bar = ctx.barSeconds;
        if (!(seconds > 0) || !(bar > 0)) return null;

        const raw = seconds / bar;
        let best = null;
        for (const bars of this.LENGTHS) {
            const ratio = (bars * bar) / seconds;
            if (ratio > this.MAX_STRETCH || ratio < 1 / this.MAX_STRETCH) continue;
            // How far it is from already fitting. Nearest wins.
            const off = Math.abs(Math.log(ratio));
            if (!best || off < best.off) best = { bars, ratio, off };
        }
        if (!best) {
            // Nothing within reach: keep it whole and let it run long rather
            // than mangling it.
            const bars = Math.max(1, Math.round(raw));
            return { bars, ratio: 1, off: 0, reach: false, raw };
        }

        best.raw = raw;
        best.reach = true;
        best.already = best.off < 0.012;         // within about 1%

        // If the rounding was ambiguous — the length sits between two bar
        // counts — ask the audio what tempo it thinks it is.
        const near = Math.abs(raw - Math.round(raw));
        if (data && near > 0.22 && near < 0.78) {
            const bpm = this.tempoOf(data, rate);
            if (bpm > 0) {
                const bars = Math.max(0.5, Math.round((seconds * bpm / 60) / 4 * 2) / 2);
                const ratio = (bars * bar) / seconds;
                if (ratio <= this.MAX_STRETCH && ratio >= 1 / this.MAX_STRETCH) {
                    best = { bars, ratio, off: Math.abs(Math.log(ratio)),
                             raw, reach: true, already: false, bpm };
                }
            }
        }
        return best;
    },

    // ── Aligning a performance ────────────────────────────────────────────

    /// Where each onset should have been. Only moves one that is close
    /// enough to a grid line to have been aiming at it — a note deliberately
    /// pushed half a beat late is a performance, not a mistake.
    anchors(times, ctx, opts) {
        // Divisions per beat: 4 is sixteenths, 2 is eighths. Sixteenths is
        // right for this genre — the vocals sit on them.
        const div = (opts && opts.division) || 4;
        const step = ctx.barSeconds / (4 * div);
        const pull = opts && opts.strength != null ? opts.strength : 0.85;
        const reach = (opts && opts.window != null ? opts.window : 0.45) * step;

        const out = [];
        let lastDst = -Infinity;
        for (const t of times) {
            const want = Math.round(t / step) * step;
            if (Math.abs(want - t) > reach) continue;        // not aiming at it
            const dst = t + (want - t) * pull;
            // Anchors have to stay in order, or the warp folds over itself.
            if (dst <= lastDst + 0.02) continue;
            out.push({ src: t, dst });
            lastDst = dst;
        }
        return out;
    },

    /// Stretch the gaps so every anchor lands where it should. Each segment
    /// between two anchors gets its own ratio, which is why the words move
    /// and the words themselves do not change length much.
    warp(data, rate, anchors, total) {
        if (!anchors || !anchors.length) return data.slice();

        const marks = [{ src: 0, dst: 0 }].concat(anchors);
        const end = total != null ? total : data.length / rate;
        marks.push({ src: end, dst: end });

        const pieces = [];
        let outLen = 0;
        for (let i = 0; i < marks.length - 1; i++) {
            const a = marks[i], b = marks[i + 1];
            const srcLen = Math.max(1, Math.round((b.src - a.src) * rate));
            const dstLen = Math.max(1, Math.round((b.dst - a.dst) * rate));
            const from = Math.max(0, Math.round(a.src * rate));
            const slice = data.subarray(from, Math.min(data.length, from + srcLen));
            if (!slice.length) continue;
            const ratio = dstLen / slice.length;
            // A segment barely changing is not worth the artefacts.
            const piece = Math.abs(1 - ratio) < 0.004
                ? slice.slice()
                : this.stretch(slice, rate, ratio);
            pieces.push(piece);
            outLen += piece.length;
        }

        const out = new Float32Array(Math.max(outLen, 1));
        let at = 0;
        for (const p of pieces) { out.set(p, at); at += p.length; }
        return out;
    },

    /// The whole job: find the words, decide where they belong, move them.
    align(data, rate, ctx, opts) {
        const times = this.onsets(data, rate, opts && opts.sensitivity);
        const marks = this.anchors(times, ctx, opts);
        if (!marks.length) return { data: data.slice(), onsets: times.length, moved: 0 };
        const out = this.warp(data, rate, marks, data.length / rate);
        let moved = 0;
        for (const m of marks) if (Math.abs(m.dst - m.src) > 0.004) moved++;
        return { data: out, onsets: times.length, moved, marks };
    },

    /// Make a buffer exactly `seconds` long by stretching it, not by cutting
    /// it — which is what a clip needs when it has to fill its bars.
    toLength(actx, buffer, seconds) {
        const want = Math.max(1, Math.round(seconds * buffer.sampleRate));
        const ratio = want / buffer.length;
        const out = actx.createBuffer(buffer.numberOfChannels, want, buffer.sampleRate);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const done = this.stretch(buffer.getChannelData(ch), buffer.sampleRate, ratio);
            out.getChannelData(ch).set(done.subarray(0, Math.min(want, done.length)));
        }
        return out;
    },
};
