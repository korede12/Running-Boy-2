// ── Musical context ───────────────────────────────────────────────────────
// What the song IS, as opposed to what is in it.
//
// This is the thing a plugin cannot know. A tuner bought off the shelf gets
// handed a lump of audio and has to guess; it does not know the song is at
// 103, in F minor, with a shaker on the offbeat and a bass already occupying
// the bottom two octaves. This app knows all of that exactly, because it is
// the thing that made it. Every automatic decision in the studio reads from
// here, which is why it sits on its own rather than inside whatever happened
// to need it first.
//
// Key detection is Krumhansl-Schmuckler: correlate the pitch classes that
// actually sound against profiles derived from listening experiments, once
// for each of the twelve tonics in each mode, and take the best fit. It is
// from 1990, it is not machine learning, and for music that stays in one key
// — which Afrobeats overwhelmingly does — it is hard to beat.

const Ctx = {

    NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

    // The scales worth offering. Afrobeats lives in the first two.
    SCALES: {
        minor:    { name: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
        dorian:   { name: 'Dorian',        steps: [0, 2, 3, 5, 7, 9, 10] },
        major:    { name: 'Major',         steps: [0, 2, 4, 5, 7, 9, 11] },
        harmonic: { name: 'Harmonic minor',steps: [0, 2, 3, 5, 7, 8, 11] },
        penta:    { name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
        chromatic:{ name: 'Chromatic',     steps: [0,1,2,3,4,5,6,7,8,9,10,11] },
    },

    // Krumhansl-Kessler profiles: how strongly each scale degree belongs.
    MAJOR: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
    MINOR: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],

    // ── The style pack ────────────────────────────────────────────────────
    // Afrobeats as data rather than as a prompt. Everything automatic in the
    // studio leans on this, and swapping it is how the app would ever learn
    // another genre.

    STYLE: {
        id: 'afrobeats',
        name: 'Afrobeats',
        tempo: { from: 98, to: 115, typical: 104 },
        // The genre is overwhelmingly minor, and Dorian turns up constantly
        // because of the raised sixth in the guitar lines.
        prefer: ['minor', 'dorian'],
        // Scale degrees, not note names, so they transpose for free.
        progressions: [
            { name: 'i VII VI VII', degrees: [0, 10, 8, 10] },
            { name: 'i iv VII III', degrees: [0, 5, 10, 3] },
            { name: 'i VI III VII', degrees: [0, 8, 3, 10] },
            { name: 'i v VI VII',   degrees: [0, 7, 8, 10] },
        ],
        // 16 steps to the bar. These are the patterns the groove is built
        // from — the shaker running sixteenths, the open hat answering on
        // the "and", the kick leaving the one alone more often than not.
        grooves: {
            shaker: [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1],
            hatOpen:[0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
            kick:   [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
            clap:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
            rim:    [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,1],
        },
        // Sixteenths sit late, but nowhere near a triplet. This is the
        // single number that most makes a programmed beat sound Afrobeats
        // rather than pop.
        swing: 0.14,
    },

    // ── Reading the song ──────────────────────────────────────────────────

    /// Everything automatic in the studio starts here.
    read(song, tape) {
        const tempo = song ? song.tempo : 120;
        const steps = song ? song.stepsPerRiff : 16;
        const stepSeconds = 15 / tempo;
        const weights = this.weigh(song);
        const found = this.key(weights);

        return {
            tempo,
            steps,
            stepSeconds,
            barSeconds: steps * stepSeconds,
            // A dotted eighth, which is the delay time the whole genre uses.
            dottedEighth: (60 / tempo) * 0.75,
            eighth: (60 / tempo) * 0.5,
            tonic: found.tonic,
            scale: found.scale,
            confident: found.confident,
            name: this.NAMES[found.tonic] + ' ' + this.SCALES[found.scale].name.toLowerCase(),
            notes: this.pitches(found.tonic, found.scale),
            style: this.STYLE,
            // What is already playing, so a generated part can leave room
            // and a vocal chain knows what it is competing with.
            busy: this.busy(song, tape),
        };
    },

    /// How much each pitch class sounds, weighted by how long it is held.
    /// Drums are not pitched and would poison the result.
    weigh(song) {
        const w = new Array(12).fill(0);
        if (!song) return w;
        for (const t of song.tracks) {
            if (t.channel === 9) continue;
            for (const p of t.placements)
                for (const e of p.riff.events)
                    if (e.isNote) w[e.data[0] % 12] += Math.max(1, e.dur);
        }
        return w;
    },

    /// Pitch classes from a detected fundamental track — for a song that is
    /// nothing but a vocal, which is how most of them start.
    weighPitches(hz) {
        const w = new Array(12).fill(0);
        for (const f of hz) {
            if (!f || f < 50 || f > 2000) continue;
            w[((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12] += 1;
        }
        return w;
    },

    /// Correlate against both profiles in all twelve rotations. Returns the
    /// best fit, and says when it is not sure — a key guessed off four notes
    /// is a guess, and the studio should offer rather than assume.
    key(weights) {
        const total = weights.reduce((a, b) => a + b, 0);
        if (total < 6) return { tonic: 0, scale: 'minor', confident: false, score: 0 };

        let best = { tonic: 0, scale: 'minor', score: -2 }, second = -2;
        for (let tonic = 0; tonic < 12; tonic++) {
            for (const [mode, profile] of [['major', this.MAJOR], ['minor', this.MINOR]]) {
                const rotated = profile.map((_, i) => profile[(i - tonic + 120) % 12]);
                const score = this.correlate(weights, rotated);
                if (score > best.score) { second = best.score; best = { tonic, scale: mode, score }; }
                else if (score > second) second = score;
            }
        }

        // Dorian is a minor key with a raised sixth. The profiles cannot tell
        // them apart, so ask the notes: if the sixth is there and the flat
        // sixth is not, it is Dorian, and in this genre that matters.
        if (best.scale === 'minor') {
            const flat6 = weights[(best.tonic + 8) % 12];
            const nat6 = weights[(best.tonic + 9) % 12];
            if (nat6 > flat6 * 1.6 && nat6 > total * 0.04) best.scale = 'dorian';
        }

        return {
            tonic: best.tonic,
            scale: best.scale,
            // A clear winner, and enough notes to have meant it.
            confident: best.score - second > 0.04 && total >= 12,
            score: best.score,
        };
    },

    correlate(a, b) {
        const n = a.length;
        const ma = a.reduce((x, y) => x + y, 0) / n;
        const mb = b.reduce((x, y) => x + y, 0) / n;
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < n; i++) {
            const x = a[i] - ma, y = b[i] - mb;
            num += x * y; da += x * x; db += y * y;
        }
        return da && db ? num / Math.sqrt(da * db) : 0;
    },

    // ── Using it ──────────────────────────────────────────────────────────

    /// The pitch classes of a key, as a set for fast membership.
    pitches(tonic, scale) {
        const steps = (this.SCALES[scale] || this.SCALES.minor).steps;
        return steps.map(s => (tonic + s) % 12);
    },

    inKey(midi, ctx) {
        return ctx.notes.indexOf(((midi % 12) + 12) % 12) !== -1;
    },

    /// The nearest note in the key, as a MIDI number — the whole point of
    /// knowing the key. Takes a fractional MIDI number, because that is what
    /// a pitch detector hands you.
    snap(midi, ctx) {
        if (!isFinite(midi)) return midi;
        let best = null, dist = 99;
        const octave = Math.floor(midi / 12) * 12;
        // Look at the octave below, the one it is in, and the one above, so
        // a note just under C does not get dragged up a seventh.
        for (let o = octave - 12; o <= octave + 12; o += 12) {
            for (const pc of ctx.notes) {
                const cand = o + pc;
                const d = Math.abs(cand - midi);
                if (d < dist) { dist = d; best = cand; }
            }
        }
        return best == null ? midi : best;
    },

    /// A harmony a third and a fifth above, in the key rather than in
    /// semitones — which is what makes a stack sound written instead of
    /// transposed.
    above(midi, degrees, ctx) {
        const root = this.snap(midi, ctx);
        const scale = ctx.notes.slice().sort((a, b) => a - b);
        const n = scale.length;
        // Find where the root sits in the scale, then step up by degrees.
        const pc = ((root % 12) + 12) % 12;
        let i = scale.indexOf(pc);
        if (i === -1) return root + degrees * 2;
        const target = i + degrees;
        const octaves = Math.floor(target / n);
        return Math.floor(root / 12) * 12 + scale[((target % n) + n) % n] + octaves * 12;
    },

    hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },
    midi(hz) { return hz > 0 ? 69 + 12 * Math.log2(hz / 440) : 0; },

    /// Which registers are already occupied, so an automatic decision can
    /// stay out of their way.
    busy(song, tape) {
        const out = { low: 0, mid: 0, high: 0, drums: false, audio: 0 };
        if (song) for (const t of song.tracks) {
            if (t.channel === 9) { if (t.placements.length) out.drums = true; continue; }
            for (const p of t.placements) for (const e of p.riff.events) {
                if (!e.isNote) continue;
                if (e.data[0] < 48) out.low++;
                else if (e.data[0] < 72) out.mid++;
                else out.high++;
            }
        }
        if (tape && tape.clips) out.audio = tape.clips.filter(c => c.on).length;
        return out;
    },

    /// How late a sixteenth sits, in seconds — the groove, as a number you
    /// can add to a start time.
    swingAt(step, ctx) {
        // Only the off-sixteenths move, and only by a fraction of a step.
        return (step % 2) ? ctx.stepSeconds * (ctx.style.swing || 0) : 0;
    },
};
