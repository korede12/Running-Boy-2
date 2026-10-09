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
// Four buses, because they want different treatment:
//
//   DRUMS   get the work. Saturation for weight, a slow-attack compressor
//           for punch, and a hard-squashed copy blended underneath — which
//           is the oldest trick in drum mixing and still the one that does
//           the most. You cannot buy this with a louder fader.
//   MUSIC   the tonal synth parts, high-passed to stay out of the kick.
//   AUDIO   the tape: vocals, loops, samples.
//   MASTER  glue, a tilt, and a ceiling nothing gets past.
//
// The ceiling matters more than it sounds. Web Audio will happily hand the
// soundcard samples past 1.0 and they come back as crackle, which people
// hear as "this app sounds bad" rather than "I should turn something down".

const Mixer = {

    // Afrobeats defaults: drums forward and weighty, the low end left alone,
    // vocals bright and present.
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
        audio: { gain: 1 },
    },

    fresh() { return JSON.parse(JSON.stringify(this.DEFAULT)); },

    /// Fill in anything a saved mix is missing, so an old beat opens rather
    /// than throwing on a setting that did not exist when it was saved.
    settle(set) {
        const out = this.fresh();
        if (!set) return out;
        for (const bus of Object.keys(out)) {
            if (!set[bus]) continue;
            for (const k of Object.keys(out[bus])) {
                const v = set[bus][k];
                if (v === undefined) continue;
                out[bus][k] = (v && typeof v === 'object')
                    ? Object.assign(out[bus][k], v) : v;
            }
        }
        return out;
    },

    // ── Building it ───────────────────────────────────────────────────────

    /// Build the whole thing against any context. Live playback and the
    /// offline bounce both call this, so an export is mixed exactly as it
    /// was heard rather than merely similarly.
    build(actx, set, ctx) {
        const s = this.settle(set);
        const master = this.master(actx, s.master);
        return {
            set: s,
            out: master.out,
            master,
            in: {
                drums: this.drums(actx, s.drums, master.in),
                music: this.music(actx, s.music, master.in),
                audio: this.simple(actx, s.audio, master.in),
            },
        };
    },

    master(actx, s) {
        const input = actx.createGain();
        let node = input;
        const link = n => { node.connect(n); node = n; return n; };

        // Glue: slow enough not to grab transients, shallow enough that you
        // notice it only when it is switched off.
        if (s.glue && s.glue.on) {
            const c = actx.createDynamicsCompressor();
            c.threshold.value = s.glue.threshold;
            c.ratio.value = s.glue.ratio;
            c.attack.value = s.glue.attack;
            c.release.value = s.glue.release;
            c.knee.value = s.glue.knee;
            link(c);
        }

        if (s.tilt && (s.tilt.low || s.tilt.high)) {
            if (s.tilt.low) {
                const f = actx.createBiquadFilter();
                f.type = 'lowshelf'; f.frequency.value = 110; f.gain.value = s.tilt.low;
                link(f);
            }
            if (s.tilt.high) {
                const f = actx.createBiquadFilter();
                f.type = 'highshelf'; f.frequency.value = 7500; f.gain.value = s.tilt.high;
                link(f);
            }
        }

        const level = actx.createGain();
        level.gain.value = s.gain == null ? 0.9 : s.gain;
        link(level);

        // The ceiling. A compressor with a near-vertical ratio and an attack
        // as fast as the node allows is not a mastering limiter, but it is
        // the difference between a loud mix and a crackling one.
        const ceiling = actx.createDynamicsCompressor();
        ceiling.threshold.value = s.ceiling == null ? -1.2 : s.ceiling;
        ceiling.ratio.value = 20;
        ceiling.attack.value = 0.0005;
        ceiling.release.value = 0.06;
        ceiling.knee.value = 0;
        link(ceiling);

        node.connect(actx.destination);
        return { in: input, out: node, level };
    },

    /// A bus with nothing but a fader.
    simple(actx, s, dest) {
        const g = actx.createGain();
        g.gain.value = s && s.gain != null ? s.gain : 1;
        g.connect(dest);
        return g;
    },

    music(actx, s, dest) {
        const input = actx.createGain();
        let node = input;
        if (s.hpf) {
            // Out of the way of the kick. Synth bass is the exception, and
            // the cut is gentle enough not to gut it.
            const f = actx.createBiquadFilter();
            f.type = 'highpass'; f.frequency.value = s.hpf; f.Q.value = 0.6;
            node.connect(f); node = f;
        }
        const g = actx.createGain();
        g.gain.value = s.gain == null ? 1 : s.gain;
        node.connect(g);
        g.connect(dest);
        return input;
    },

    /// The one that earns its keep.
    drums(actx, s, dest) {
        const input = actx.createGain();
        let node = input;
        const link = n => { node.connect(n); node = n; return n; };

        if (s.kick) {
            const f = actx.createBiquadFilter();
            f.type = 'lowshelf'; f.frequency.value = 95; f.gain.value = s.kick;
            link(f);
        }
        if (s.snap) {
            // Where the crack of a snare and the edge of a clap live.
            const f = actx.createBiquadFilter();
            f.type = 'peaking'; f.frequency.value = 3600;
            f.gain.value = s.snap; f.Q.value = 1.1;
            link(f);
        }
        if (s.weight) {
            const w = actx.createWaveShaper();
            w.curve = this.curve(s.weight);
            w.oversample = '2x';
            link(w);
        }

        const split = node;
        const sum = actx.createGain();

        // Punch: the attack is deliberately slow, so the stick gets through
        // before the compressor closes. A fast attack would do the opposite
        // and flatten exactly the part that makes a drum sound like a hit.
        if (s.punch) {
            const c = actx.createDynamicsCompressor();
            c.threshold.value = -20 - 6 * s.punch;
            c.ratio.value = 2 + 4 * s.punch;
            c.attack.value = 0.018;
            c.release.value = 0.14;
            c.knee.value = 6;
            const make = actx.createGain();
            make.gain.value = 1 + 0.35 * s.punch;
            split.connect(c); c.connect(make); make.connect(sum);
        } else {
            split.connect(sum);
        }

        // Parallel: a copy squashed into the ground and slid underneath.
        // It does not replace the dry signal, it fills in behind it, which
        // is why the kit gets bigger without getting louder.
        if (s.parallel > 0) {
            const c = actx.createDynamicsCompressor();
            c.threshold.value = -42;
            c.ratio.value = 12;
            c.attack.value = 0.001;
            c.release.value = 0.09;
            c.knee.value = 3;
            const blend = actx.createGain();
            blend.gain.value = s.parallel * 0.55;
            split.connect(c); c.connect(blend); blend.connect(sum);
        }

        const g = actx.createGain();
        g.gain.value = s.gain == null ? 1 : s.gain;
        sum.connect(g);
        g.connect(dest);
        return input;
    },

    curve(amount) {
        const n = 1024, c = new Float32Array(n);
        const k = amount * 28;
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / n - 1;
            c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return c;
    },
};
