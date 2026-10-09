// ── Bouncing: the beat as an audio file ───────────────────────────────────
// A .mid carries the notes and nothing else: no vocal, no sample, and no
// opinion about what a "Lead" sounds like. Anywhere you would actually send
// a beat wants audio, so this renders one.
//
// It renders OFFLINE, not by recording the speakers. An OfflineAudioContext
// runs the same graph as fast as it can — eight bars in well under a second
// — and because both the synth and the tape schedule against a time passed
// in rather than "now", the exporter reuses them instead of reimplementing
// them. That is the point: there is no second synth to drift away from the
// one you were listening to.
//
// Two formats come out. WAV is written here, in about thirty lines, and
// always works. MP3 needs an encoder, which is a 150KB library fetched the
// first time you ask for one — so if there is no network, you get offered
// the WAV rather than a failure.

const Bounce = {

    RATE: 44100,
    TAIL: 1.8,               // room for the last note to ring out
    KBPS: 192,

    // lamejs, the LAME encoder compiled to JavaScript. Fetched on demand and
    // only for MP3; a mirror because one CDN being down should not be the
    // end of it.
    LAME: [
        'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.0/lame.min.js',
        'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js',
    ],

    /// Render the loop to an AudioBuffer. `onsay` gets progress worth
    /// reading, because decoding a few samples is not instant.
    async render(song, onsay) {
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC) throw new Error('This browser cannot render audio offline.');

        const from = song.loopStart;
        const bars = Math.max(1, song.loopEnd - from + 1);
        const stepLen = 15 / song.tempo;                 // seconds per step
        const barLen = song.stepsPerRiff * stepLen;
        const seconds = bars * barLen + this.TAIL;

        const ctx = new OAC(2, Math.ceil(seconds * this.RATE), this.RATE);

        // The clips are decoded again, in this context, so they come back at
        // its sample rate instead of being resampled on the way out.
        const clips = [];
        if (typeof Tape !== 'undefined' && Tape.clips.length) {
            if (onsay) onsay('Reading the audio…');
            for (const c of Tape.clips) {
                if (!c.on || !c.bytes) continue;
                try { clips.push([c, await ctx.decodeAudioData(c.bytes.slice().buffer)]); }
                catch (_) { /* a clip that will not decode is left out, not fatal */ }
            }
        }

        if (onsay) onsay('Rendering ' + bars + (bars === 1 ? ' bar…' : ' bars…'));

        const synth = new Synth();
        synth.adopt(ctx);
        for (const t of song.tracks) synth.setProgram(t.channel, t.program);

        for (let i = 0; i < bars; i++) {
            const bar = from + i;
            const at = i * barLen;

            for (const t of song.tracks) {
                const p = t.placements.find(x => x.at === bar);
                if (!p) continue;
                for (const e of p.riff.events) {
                    if (!e.isNote) continue;
                    synth.hit(t.channel, e.data[0], e.data[1],
                              Math.max(1, e.dur) * stepLen, at + e.tick * stepLen);
                }
            }

            for (const [clip, buf] of clips)
                if (clip.at === bar) Tape.voice(ctx, clip, at, barLen, buf);
        }

        return ctx.startRendering();
    },

    // ── WAV ───────────────────────────────────────────────────────────────
    // 16-bit PCM, the format everything on earth can open. Big — about ten
    // megabytes a minute in stereo — which is the trade for needing nothing.

    wav(buffer) {
        const chans = Math.min(2, buffer.numberOfChannels);
        const frames = buffer.length;
        const rate = buffer.sampleRate;
        const bytes = 44 + frames * chans * 2;
        const out = new ArrayBuffer(bytes);
        const v = new DataView(out);
        const tag = (p, s) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };

        tag(0, 'RIFF');  v.setUint32(4, bytes - 8, true);   tag(8, 'WAVE');
        tag(12, 'fmt '); v.setUint32(16, 16, true);         v.setUint16(20, 1, true);
        v.setUint16(22, chans, true);                       v.setUint32(24, rate, true);
        v.setUint32(28, rate * chans * 2, true);            v.setUint16(32, chans * 2, true);
        v.setUint16(34, 16, true);
        tag(36, 'data'); v.setUint32(40, frames * chans * 2, true);

        const data = [];
        for (let c = 0; c < chans; c++) data.push(buffer.getChannelData(c));
        let p = 44;
        for (let i = 0; i < frames; i++) {
            for (let c = 0; c < chans; c++) {
                const s = Math.max(-1, Math.min(1, data[c][i]));
                v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                p += 2;
            }
        }
        return new Uint8Array(out);
    },

    // ── MP3 ───────────────────────────────────────────────────────────────

    /// Fetch the encoder once. Returns false rather than throwing, because
    /// "no network" is a thing that happens and the answer to it is a WAV.
    async encoder() {
        if (typeof lamejs !== 'undefined') return true;
        for (const url of this.LAME) {
            try {
                await new Promise((ok, no) => {
                    const s = document.createElement('script');
                    s.src = url;
                    s.onload = ok;
                    s.onerror = () => no(new Error(url));
                    document.head.appendChild(s);
                });
                if (typeof lamejs !== 'undefined') return true;
            } catch (_) { /* try the mirror */ }
        }
        return false;
    },

    /// 16-bit samples, a channel at a time, in the 1152-frame blocks the
    /// encoder wants.
    _pcm(buffer, c) {
        const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
        const out = new Int16Array(src.length);
        for (let i = 0; i < src.length; i++) {
            const s = Math.max(-1, Math.min(1, src[i]));
            out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return out;
    },

    async mp3(buffer, kbps, onsay) {
        if (!await this.encoder()) return null;
        const chans = Math.min(2, buffer.numberOfChannels);
        const enc = new lamejs.Mp3Encoder(chans, buffer.sampleRate, kbps || this.KBPS);
        const left = this._pcm(buffer, 0);
        const right = chans > 1 ? this._pcm(buffer, 1) : null;

        const BLOCK = 1152;
        const parts = [];
        let done = 0;
        for (let i = 0; i < left.length; i += BLOCK) {
            const l = left.subarray(i, i + BLOCK);
            const r = right ? right.subarray(i, i + BLOCK) : null;
            const chunk = r ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
            if (chunk.length) parts.push(chunk);
            // Encoding a few seconds blocks the page for a moment; yielding
            // every so often keeps the message on screen readable.
            if (onsay && ++done % 400 === 0) {
                onsay('Encoding ' + Math.round((i / left.length) * 100) + '%…');
                await new Promise(r2 => setTimeout(r2, 0));
            }
        }
        const last = enc.flush();
        if (last.length) parts.push(last);

        let size = 0;
        for (const p of parts) size += p.length;
        const out = new Uint8Array(size);
        let at = 0;
        for (const p of parts) { out.set(p, at); at += p.length; }
        return out;
    },

    // ── Out of the browser ────────────────────────────────────────────────

    save(bytes, name, type) {
        const url = URL.createObjectURL(new Blob([bytes], { type }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    },

    tidy(name) {
        return (name || 'beat').replace(/[^\w -]/g, '').trim().slice(0, 40) || 'beat';
    },

    size(bytes) {
        const kb = bytes.length / 1024;
        return kb < 1024 ? Math.round(kb) + ' KB' : (kb / 1024).toFixed(1) + ' MB';
    },
};
