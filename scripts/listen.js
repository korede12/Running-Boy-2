// ── Listening to what was imported ────────────────────────────────────────
// A file arrives and the app has to decide what it is before it can do
// anything sensible with it. A two-bar drum loop, a four-minute song, a
// sung phrase and a held pad all want different treatment, and asking the
// person to say which is asking them to do the app's job.
//
// None of this is a model. They are measurements, and each one is a thing
// you could hear for yourself:
//
//   VOICED      how much of it has a findable pitch. Singing and keys do;
//               a kit does not.
//   GLIDE       whether that pitch slides or sits, in cents away from the
//               note's own centre. A voice wanders about ten; a struck key
//               wanders zero. This is the measurement that separates the
//               two and nothing else comes close.
//   ONSETS      how often something starts, and how regularly.
//   LOW / HIGH  where the energy is. A kick is almost all bottom; a hat is
//               almost all top; a voice is neither.
//   LENGTH      a song is minutes and a loop is seconds.
//
// And then the part that matters most for making it fit: WHERE IS ONE. A
// loop usually starts on the downbeat and a song usually does not, so the
// first beat has to be found rather than assumed, by looking for where the
// low end lands hardest and at what spacing.

const Listen = {

    SONG_SECONDS: 45,        // past this it is not a loop, it is a record
    ONESHOT_SECONDS: 1.6,

    /// Everything, in one pass. `ctx` is the musical context, used to say
    /// how the file relates to the song it is arriving in.
    read(buffer, ctx) {
        if (!buffer) return null;
        const rate = buffer.sampleRate;
        const d = buffer.getChannelData(0);
        const seconds = buffer.duration;

        const band = this.bands(d, rate);
        const pitch = this.pitchiness(d, rate);
        const beat = this.beat(d, rate);
        const onsets = typeof Flex !== 'undefined' ? Flex.onsets(d, rate) : [];
        const density = seconds > 0 ? onsets.length / seconds : 0;

        const f = {
            seconds, density,
            voiced: pitch.voiced, glide: pitch.glide, median: pitch.median,
            low: band.low, high: band.high, mid: band.mid,
            attack: this.attack(d, rate, onsets),
            tempo: beat.tempo, downbeat: beat.downbeat, pulse: beat.pulse,
        };

        const kind = this.decide(f);
        return Object.assign(f, {
            kind,
            name: this.KINDS[kind],
            // How it sits against the song it is landing in.
            bars: ctx && ctx.barSeconds ? seconds / ctx.barSeconds : 0,
            offTempo: !!(ctx && f.tempo && Math.abs(f.tempo - ctx.tempo) > 1.5),
        });
    },

    KINDS: {
        drums: 'Drum loop', bass: 'Bass', keys: 'Keys', vocal: 'Vocal',
        song: 'Full song', oneshot: 'One-shot', sound: 'Sample',
    },

    // ── What is it ────────────────────────────────────────────────────────

    /// Transparent rules in a readable order, because a classifier nobody
    /// can argue with is a classifier nobody can fix. Each clause says what
    /// it is keying on.
    decide(f) {
        // Short and one hit: a kick, a clap, a stab.
        if (f.seconds < this.ONESHOT_SECONDS && f.density < 3) return 'oneshot';

        // Long, with a steady pulse and things happening all through it: a
        // record. The last clause is what keeps a four-minute pad out.
        if (f.seconds > this.SONG_SECONDS && f.pulse > 0.12 && f.low > 0.08 && f.density > 1.5)
            return 'song';

        // A pitch that will not sit still. A voice wanders around ten cents
        // inside a held note; a struck string does not wander at all.
        if (f.voiced > 0.4 && f.glide > 4 && f.density < 6) return 'vocal';

        // A pitch that sits still, in the bottom two octaves.
        if (f.voiced > 0.35 && f.median > 0 && f.median < 130 && f.low > 0.3) return 'bass';

        // A pitch that sits still, anywhere else.
        if (f.voiced > 0.4 && f.glide <= 4) return 'keys';

        // Little pitch, plenty of starts, sharp ones, with a top end.
        if (f.voiced < 0.3 && f.density > 2 && f.attack > 0.35) return 'drums';

        // A long thing that is mostly pitched but not clearly either.
        if (f.seconds > this.SONG_SECONDS) return 'song';
        return 'sound';
    },

    // ── The measurements ──────────────────────────────────────────────────

    /// Where the energy is, as three fractions of the whole. One-pole
    /// filters rather than a Fourier transform: this needs to know roughly
    /// whether something is bassy, not what note it is.
    bands(d, rate) {
        if (!d.length) return { low: 0, mid: 0, high: 0 };

        // A contiguous slice, not every Nth sample. These are one-pole
        // filters and their coefficients assume consecutive samples —
        // decimating without filtering first does not make the measurement
        // rougher, it makes it answer a different question.
        const take = Math.min(d.length, Math.round(rate * 12));
        const from = Math.max(0, Math.floor((d.length - take) / 2));
        const n = take;

        // Coefficients for about 200Hz and about 4kHz at this rate.
        const aLow = Math.exp(-2 * Math.PI * 200 / rate);
        const aHigh = Math.exp(-2 * Math.PI * 4000 / rate);
        let lp = 0, hp = 0, prev = 0;
        let low = 0, high = 0, all = 0, count = 0;

        for (let i = from; i < from + n; i++) {
            const x = d[i];
            lp = lp * aLow + x * (1 - aLow);
            hp = aHigh * (hp + x - prev);
            prev = x;
            low += lp * lp;
            high += hp * hp;
            all += x * x;
            count++;
        }
        if (!count || all <= 0) return { low: 0, mid: 0, high: 0 };
        const l = low / all, h = high / all;
        return { low: Math.min(1, l), high: Math.min(1, h),
                 mid: Math.max(0, 1 - Math.min(1, l) - Math.min(1, h)) };
    },

    /// How much of it has a pitch, and whether that pitch holds still.
    ///
    /// Glide is the useful one and it is simple: between one frame and the
    /// next, did the pitch move by a fraction of a semitone, or not at all?
    /// A sung note is never exactly where it was a hundredth of a second
    /// ago. A struck key is.
    pitchiness(d, rate) {
        if (typeof Voice === 'undefined') return { voiced: 0, glide: 0, median: 0 };
        // A slice is enough, and a four-minute song is not worth tracking
        // in full to answer "is this singing".
        const take = Math.min(d.length, Math.round(rate * 12));
        const from = Math.max(0, Math.floor((d.length - take) / 2));
        const slice = d.subarray(from, from + take);

        const t = Voice.track(slice, rate);
        const hz = t.hz;
        if (!hz.length) return { voiced: 0, glide: 0, median: 0 };

        const sung = hz.filter(h => h > 0);
        const voiced = sung.length / hz.length;
        if (sung.length < 8) return { voiced, glide: 0, median: 0 };

        const sorted = sung.slice().sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];

        // How far the pitch sits from the centre of its OWN note, in cents.
        //
        // Per note, not over the whole take, or moving from one note to the
        // next would read as wobble. And against the note's median rather
        // than against the previous frame, because the tracker already
        // median-filters neighbouring frames and would have removed exactly
        // the signal being looked for.
        const devs = [];
        let run = [];
        const endRun = () => {
            if (run.length >= 6) {
                const sorted = run.slice().sort((a, b) => a - b);
                const mid = sorted[Math.floor(sorted.length / 2)];
                for (const h of run) devs.push(Math.abs(1200 * Math.log2(h / mid)));
            }
            run = [];
        };
        for (const h of hz) { if (h > 0) run.push(h); else endRun(); }
        endRun();

        let glide = 0;
        if (devs.length) {
            devs.sort((a, b) => a - b);
            glide = devs[Math.floor(devs.length / 2)];
        }
        return { voiced, median, glide };
    },

    /// How sharply things start. Drums are a step; a bowed or blown note is
    /// a ramp.
    attack(d, rate, onsets) {
        if (!onsets || !onsets.length) return 0;
        let total = 0, count = 0;
        const win = Math.round(rate * 0.012);
        for (const t of onsets.slice(0, 40)) {
            const at = Math.round(t * rate);
            const before = this.rms(d, at - win * 2, win);
            const after = this.rms(d, at, win);
            if (after <= 0) continue;
            total += (after - before) / after;      // 1 is silence to full
            count++;
        }
        return count ? Math.max(0, total / count) : 0;
    },

    rms(d, from, len) {
        let s = 0, n = 0;
        for (let i = Math.max(0, from); i < Math.min(d.length, from + len); i++) { s += d[i] * d[i]; n++; }
        return n ? Math.sqrt(s / n) : 0;
    },

    // ── Where is one ──────────────────────────────────────────────────────

    /// The kick track: the signal with everything above the bottom removed,
    /// as an envelope. A four-on-the-floor shows up here as four even
    /// mountains and nothing else does.
    thump(d, rate) {
        const hop = Math.max(1, Math.round(rate * 0.005));
        const n = Math.floor(d.length / hop);
        const out = new Float32Array(n);
        const a = Math.exp(-2 * Math.PI * 150 / rate);
        let lp = 0, at = 0;
        for (let f = 0; f < n; f++) {
            let sum = 0;
            for (let i = 0; i < hop; i++, at++) {
                lp = lp * a + (d[at] || 0) * (1 - a);
                sum += lp * lp;
            }
            out[f] = Math.sqrt(sum / hop);
        }
        return { env: out, seconds: hop / rate };
    },

    /// The tempo, and where the first beat is.
    ///
    /// Tempo comes from the spacing of the low end. The downbeat is then a
    /// question of phase: slide a comb of beat-spaced spikes across the
    /// track and see which offset collects the most weight. That offset is
    /// where one is.
    beat(d, rate) {
        const k = this.thump(d, rate);
        const env = k.env;
        if (env.length < 40) return { tempo: 0, downbeat: 0, pulse: 0 };

        // Rising edges of the low end — the kicks. Before the first frame
        // there is silence, so that frame is a rise from nothing: without
        // saying so, a loop that starts on a kick has no kick at the start,
        // and the anchor goes to the second one.
        const fn = new Float32Array(env.length);
        fn[0] = env[0];
        for (let i = 1; i < env.length; i++) fn[i] = Math.max(0, env[i] - env[i - 1]);

        let peak = 0;
        for (let i = 0; i < fn.length; i++) if (fn[i] > peak) peak = fn[i];
        if (peak <= 0) return { tempo: 0, downbeat: 0, pulse: 0 };
        for (let i = 0; i < fn.length; i++) fn[i] /= peak;

        // Beat period, by autocorrelation over plausible tempos.
        let bestLag = 0, bestScore = 0, total = 0;
        const from = Math.round((60 / 180) / k.seconds);
        const to = Math.round((60 / 60) / k.seconds);
        for (let lag = from; lag <= to && lag < fn.length / 2; lag++) {
            let sum = 0;
            for (let i = 0; i + lag < fn.length; i++) sum += fn[i] * fn[i + lag];
            sum /= (fn.length - lag);
            total += sum;
            if (sum > bestScore) { bestScore = sum; bestLag = lag; }
        }
        if (!bestLag) return { tempo: 0, downbeat: 0, pulse: 0 };

        let tempo = 60 / (bestLag * k.seconds);
        while (tempo < 70) tempo *= 2;
        while (tempo > 180) tempo /= 2;
        const lag = Math.round((60 / tempo) / k.seconds);

        // How much better the best spacing is than the average one — a
        // steady pulse scores high, a free-time vocal scores near nothing.
        const pulse = total > 0 ? Math.max(0, (bestScore - total / (to - from + 1)) / bestScore) : 0;

        // Phase. Try every offset within a beat and keep the one where the
        // kicks land hardest; then try the four places a bar could start,
        // because landing on beat 3 is the classic way to be exactly wrong.
        // A beat at 104bpm is 115.4 frames and the step is a whole 115, so
        // a comb walks off the beat a fraction at a time until it is
        // missing them. Each position takes the best of itself and its
        // neighbours: a beat is an event with width, not a sample index.
        const near = (i) => Math.max(fn[i - 1] || 0, fn[i] || 0, fn[i + 1] || 0);
        let bestPhase = 0, phaseScore = -1;
        for (let p = 0; p < lag; p++) {
            let sum = 0;
            for (let i = p; i < fn.length; i += lag) sum += near(i);
            // Ties go to the earlier phase, which is the one a loop means.
            if (sum > phaseScore + 1e-9) { phaseScore = sum; bestPhase = p; }
        }

        // The grid repeats every beat, so the phase on its own has a
        // beat's worth of ambiguity in it — and resolved the wrong way it
        // means starting a loop one kick late, or putting a song's first
        // kick on beat three. The anchor is therefore the FIRST REAL HIT,
        // snapped to the grid that the phase search found. Which is what
        // anybody placing a grid marker by hand does: find the first kick,
        // put the marker on it.
        //
        // Which of the four beats in the bar that hit is remains
        // unanswerable from the low end — with a kick on every beat they
        // are identical — so it is not guessed at. Moving the grid a beat
        // is one press, which is where DJ software landed after twenty
        // years of trying to decide it automatically.
        let first = 0;
        for (let i = 0; i < fn.length; i++) if (fn[i] >= 0.35) { first = i; break; }
        const steps = Math.round((first - bestPhase) / lag);
        let anchor = bestPhase + Math.max(0, steps) * lag;
        if (anchor > first + lag * 0.5) anchor -= lag;      // never past the hit
        if (anchor < 0) anchor = 0;
        const downbeat = anchor * k.seconds;
        return { tempo, downbeat: downbeat < d.length / rate ? downbeat : 0, pulse, lag: lag * k.seconds };
    },

    // ── What to do about it ───────────────────────────────────────────────

    /// A plan, in words the panel can show and the studio can act on. The
    /// point of separating this from read() is that the decision is
    /// arguable and the measurements are not.
    plan(info, ctx) {
        if (!info) return null;

        // A whole record is not something to stretch into eight bars. Offer
        // the tempo instead, and let the person say.
        if (info.kind === 'song') {
            return {
                action: 'ask',
                tempo: Math.round(info.tempo || 0),
                why: 'That is ' + this.clock(info.seconds) + ' at about ' +
                     Math.round(info.tempo || 0) + ' bpm. Your song is ' + ctx.tempo + '.',
            };
        }

        if (info.kind === 'oneshot') return { action: 'place', why: 'A one-shot — placed as it is.' };

        // A loop. Fit it, and start it from its own first beat rather than
        // from whatever silence is in front of it.
        return {
            action: 'fit',
            lead: info.downbeat > 0.012 ? info.downbeat : 0,
            why: info.name + (info.tempo ? ' at about ' + Math.round(info.tempo) + ' bpm' : ''),
        };
    },

    clock(seconds) {
        const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
        return m ? m + ':' + String(s).padStart(2, '0') : s + 's';
    },
};
