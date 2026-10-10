// ── The preset library ────────────────────────────────────────────────────
// Patterns worth starting from, as data.
//
// Two decisions shape everything here.
//
// The first is what a preset IS. These are not audio loops and not finished
// parts: they are MIDI, written into an ordinary riff, so the moment one
// lands you can pull it apart. A preset that cannot be edited is a sample
// with extra steps.
//
// The second is how a pitched preset knows what key it is in. It does not
// carry notes — it carries SEMITONES FROM THE TONIC, and the studio already
// knows the key because it is the thing that made the song. So the same
// progression lands in F minor or in C minor without being written twice,
// and a bass line dropped under an existing beat is in tune before anyone
// touches a tuner. It is the same trick Ctx.STYLE already uses for its
// progressions, applied to the whole library.
//
// On the patterns themselves: a rhythm is not anybody's property, and these
// are the common ones — the tresillo, four-on-the-floor, the dembow, the
// shaker running sixteenths. Where sources disagree (and for the dembow
// snare they do) the most widely cited placement is used. What is NOT here
// is any actual tune: the melodic presets are idiomatic shapes — the way a
// highlife guitar line moves, the lift of an amapiano log drum figure — not
// quotations of songs anybody wrote.

const Presets = {

    // ── The drum kit, by name ─────────────────────────────────────────────
    // General MIDI percussion numbers. Named because [36] means nothing and
    // KICK means something.
    KICK: 36, KICK2: 35, SNARE: 38, SNARE2: 40, RIM: 37, CLAP: 39,
    HAT: 42, PEDAL: 44, OPEN: 46, RIDE: 51, CRASH: 49,

    /// The styles, in the order they are offered. Each carries the tempo it
    /// wants, because a dembow at 104 is not a dembow.
    STYLES: [
        { id: 'afrobeats', name: 'Afrobeats', tempo: 104, swing: 0.14 },
        { id: 'amapiano',  name: 'Amapiano',  tempo: 112, swing: 0.10 },
        { id: 'afrohouse', name: 'Afro house', tempo: 122, swing: 0.04 },
        { id: 'highlife',  name: 'Highlife',  tempo: 132, swing: 0.08 },
        { id: 'dancehall', name: 'Dancehall', tempo: 100, swing: 0.06 },
        { id: 'dembow',    name: 'Dembow',    tempo: 95,  swing: 0 },
        { id: 'hiphop',    name: 'Hip hop',   tempo: 90,  swing: 0.12 },
        { id: 'trap',      name: 'Trap',      tempo: 140, swing: 0 },
        { id: 'house',     name: 'House',     tempo: 124, swing: 0 },
        { id: 'gospel',    name: 'Gospel',    tempo: 76,  swing: 0.16 },
    ],

    KINDS: [
        { id: 'drums',  name: 'Drums' },
        { id: 'chords', name: 'Chords' },
        { id: 'bass',   name: 'Bass' },
        { id: 'melody', name: 'Melody' },
        { id: 'guitar', name: 'Guitar' },
    ],

    // ── Shorthand ─────────────────────────────────────────────────────────

    /// Every step, for a shaker that never stops.
    every(n = 16, from = 0, by = 1) {
        const out = [];
        for (let i = from; i < n; i += by) out.push(i);
        return out;
    },

    /// The same pattern again a bar later, for two-bar presets.
    twice(steps, bars = 2) {
        const out = [];
        for (let b = 0; b < bars; b++) for (const s of steps) out.push(s + b * 16);
        return out;
    },

    // ── Chord shapes, in semitones above the chord's own root ─────────────
    MIN: [0, 3, 7], MAJ: [0, 4, 7], MIN7: [0, 3, 7, 10], MAJ7: [0, 4, 7, 11],
    DOM7: [0, 4, 7, 10], SUS4: [0, 5, 7], MIN9: [0, 3, 7, 14],

    /// A chord: a root in semitones above the key's tonic, and a shape.
    ch(at, dur, root, shape) { return { at, dur, root, shape }; },

    // ── The library ───────────────────────────────────────────────────────
    // `bars` is how long the preset is. Drums are step lists per kit piece.
    // Pitched presets are notes in semitones above the tonic, where 12 is
    // the octave above; `oct` shifts the whole thing.

    LIST: [

        // ── Afrobeats ─────────────────────────────────────────────────────
        {
            id: 'afro-lagos', kind: 'drums', style: 'afrobeats', bars: 1,
            name: 'Lagos bounce',
            note: 'The common one. Kick off the one more often than on it.',
            hits: { 36: [0, 6, 10], 39: [4, 12], 42: 'every16', 46: [6, 14], 37: [2, 11] },
        },
        {
            id: 'afro-zanku', kind: 'drums', style: 'afrobeats', bars: 1,
            name: 'Zanku',
            note: 'Busier kick, the shaker carrying it.',
            hits: { 36: [0, 3, 6, 10], 39: [4, 12], 42: 'every16', 46: [14], 37: [7, 15] },
        },
        {
            id: 'afro-pop', kind: 'drums', style: 'afrobeats', bars: 2,
            name: 'Afro pop, two bars',
            note: 'A bar that answers itself, so a loop stops sounding like a loop.',
            hits: {
                36: [0, 6, 10, 16, 22, 26, 29],
                39: [4, 12, 20, 28],
                42: 'every16x2',
                46: [6, 14, 22, 30],
            },
        },
        {
            id: 'afro-chords', kind: 'chords', style: 'afrobeats', bars: 2,
            name: 'i VII VI VII',
            note: 'The progression the whole genre leans on.',
            chords: [[0, 8, 0, 'MIN7'], [8, 8, 10, 'MAJ'], [16, 8, 8, 'MAJ7'], [24, 8, 10, 'MAJ']],
        },
        {
            id: 'afro-chords2', kind: 'chords', style: 'afrobeats', bars: 2,
            name: 'i iv VII III',
            note: 'Darker. The fourth pulls it somewhere.',
            chords: [[0, 8, 0, 'MIN9'], [8, 8, 5, 'MIN7'], [16, 8, 10, 'MAJ'], [24, 8, 3, 'MAJ7']],
        },
        {
            id: 'afro-bass', kind: 'bass', style: 'afrobeats', bars: 2,
            name: 'Afrobeats bass',
            note: 'Sits in the holes the kick leaves, which is the whole job.',
            notes: [[0, 3, 0], [6, 2, 0], [10, 2, 10], [13, 2, 10],
                    [16, 3, 8], [22, 2, 8], [26, 2, 10], [29, 2, 12]],
            oct: -2,
        },
        {
            id: 'afro-gtr', kind: 'guitar', style: 'afrobeats', bars: 2,
            name: 'Highlife-ish guitar',
            note: 'Two voices picked apart, the way the style plays triads.',
            notes: [[0, 1, 12], [2, 1, 15], [4, 1, 19], [6, 1, 15],
                    [8, 1, 10], [10, 1, 14], [12, 1, 17], [14, 1, 14],
                    [16, 1, 8], [18, 1, 12], [20, 1, 15], [22, 1, 12],
                    [24, 1, 10], [26, 1, 14], [28, 1, 17], [30, 1, 22]],
        },
        {
            id: 'afro-lead', kind: 'melody', style: 'afrobeats', bars: 2,
            name: 'Pentatonic hook',
            note: 'Five notes, lots of space. Space is the hook.',
            notes: [[0, 3, 12], [4, 2, 15], [7, 1, 17], [8, 4, 15],
                    [16, 3, 19], [20, 2, 17], [23, 1, 15], [24, 6, 12]],
        },

        // ── Amapiano ──────────────────────────────────────────────────────
        {
            id: 'ama-four', kind: 'drums', style: 'amapiano', bars: 1,
            name: 'Piano four',
            note: 'Four on the floor, open hat answering on the off.',
            hits: { 36: [0, 4, 8, 12], 46: [2, 6, 10, 14], 42: 'every16', 37: [3, 7, 11, 15] },
        },
        {
            id: 'ama-shuffle', kind: 'drums', style: 'amapiano', bars: 2,
            name: 'Shuffled piano',
            note: 'Same kick, percussion loosened. Swing it and the log drum with it.',
            hits: {
                36: [0, 4, 8, 12, 16, 20, 24, 28],
                46: [2, 6, 10, 14, 18, 22, 26, 30],
                42: 'every16x2',
                39: [12, 28], 37: [3, 7, 15, 19, 23, 31],
            },
        },
        {
            id: 'ama-log', kind: 'bass', style: 'amapiano', bars: 2,
            name: 'Log drum figure',
            note: 'The lead instrument of the genre, and it is tuned — so it is written in the key.',
            notes: [[2, 2, 0], [5, 1, 0], [6, 2, 7], [10, 2, 10], [14, 1, 7],
                    [18, 2, 0], [21, 1, 0], [22, 2, 8], [26, 2, 10], [30, 2, 12]],
            oct: -1,
        },
        {
            id: 'ama-chords', kind: 'chords', style: 'amapiano', bars: 2,
            name: 'Deep piano',
            note: 'Sevenths and ninths, held. The chords are the pad.',
            chords: [[0, 12, 0, 'MIN9'], [12, 10, 8, 'MAJ7'], [22, 10, 5, 'MIN7']],
        },

        // ── Afro house ────────────────────────────────────────────────────
        {
            id: 'afh-four', kind: 'drums', style: 'afrohouse', bars: 1,
            name: 'Afro house',
            note: 'Four on the floor with the percussion doing the talking.',
            hits: { 36: [0, 4, 8, 12], 39: [4, 12], 46: [2, 6, 10, 14], 42: 'every16', 37: [1, 6, 9, 14] },
        },
        {
            id: 'afh-chords', kind: 'chords', style: 'afrohouse', bars: 2,
            name: 'Rolling minor',
            note: 'Two chords, a long time each. House is patient.',
            chords: [[0, 16, 0, 'MIN7'], [16, 16, 10, 'MAJ7']],
        },

        // ── Highlife ──────────────────────────────────────────────────────
        {
            id: 'high-clave', kind: 'drums', style: 'highlife', bars: 2,
            name: 'Highlife shuffle',
            note: 'The bell carries the pattern; the kit stays out of its way.',
            hits: {
                36: [0, 10, 16, 26], 38: [4, 12, 20, 28],
                51: [0, 3, 6, 10, 12, 16, 19, 22, 26, 28],
                37: [6, 22],
            },
        },
        {
            id: 'high-gtr', kind: 'guitar', style: 'highlife', bars: 2,
            name: 'Palm-wine guitar',
            note: 'Thirds walking down, which is the sound of the style.',
            notes: [[0, 2, 16], [2, 2, 12], [4, 2, 15], [6, 2, 11],
                    [8, 2, 14], [10, 2, 10], [12, 2, 12], [14, 2, 15],
                    [16, 2, 17], [18, 2, 12], [20, 2, 15], [22, 2, 11],
                    [24, 2, 14], [26, 2, 10], [28, 4, 12]],
        },

        // ── Dancehall ─────────────────────────────────────────────────────
        {
            id: 'dh-onedrop', kind: 'drums', style: 'dancehall', bars: 1,
            name: 'One drop',
            note: 'Nothing on the one. That is the point of it.',
            hits: { 36: [8], 38: [8], 42: [0, 2, 4, 6, 8, 10, 12, 14], 37: [4, 12] },
        },
        {
            id: 'dh-steppers', kind: 'drums', style: 'dancehall', bars: 1,
            name: 'Steppers',
            note: 'Kick on every beat, snare answering the half.',
            hits: { 36: [0, 4, 8, 12], 38: [8], 42: 'every16', 46: [14] },
        },

        // ── Dembow / reggaeton ────────────────────────────────────────────
        {
            id: 'dem-classic', kind: 'drums', style: 'dembow', bars: 1,
            name: 'Dembow',
            note: 'Boom-ch-boom-chick. Kick on one and three, snare off the beat.',
            hits: { 36: [0, 8], 38: [3, 6, 11, 14], 42: [0, 2, 4, 6, 8, 10, 12, 14] },
        },
        {
            id: 'dem-tresillo', kind: 'drums', style: 'dembow', bars: 1,
            name: 'Tresillo kick',
            note: 'Three, three, two — the figure underneath half the music on earth.',
            hits: { 36: [0, 6, 12], 38: [4, 12], 42: 'every16', 37: [3, 11] },
        },

        // ── Hip hop ───────────────────────────────────────────────────────
        {
            id: 'hh-boom', kind: 'drums', style: 'hiphop', bars: 1,
            name: 'Boom bap',
            note: 'Kick, snare, and swing on the hats.',
            hits: { 36: [0, 10], 38: [4, 12], 42: [0, 2, 4, 6, 8, 10, 12, 14] },
        },
        {
            id: 'hh-laid', kind: 'drums', style: 'hiphop', bars: 2,
            name: 'Laid back',
            note: 'Two bars so the second can arrive differently.',
            hits: {
                36: [0, 10, 16, 22, 26], 38: [4, 12, 20, 28],
                42: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
                46: [14, 30],
            },
        },
        {
            id: 'hh-chords', kind: 'chords', style: 'hiphop', bars: 2,
            name: 'Dusty minor',
            note: 'Sevenths, close together, low. Let it be muddy.',
            chords: [[0, 12, 0, 'MIN7'], [12, 4, 5, 'MIN7'], [16, 12, 8, 'MAJ7'], [28, 4, 10, 'DOM7']],
        },

        // ── Trap ──────────────────────────────────────────────────────────
        {
            id: 'trap-basic', kind: 'drums', style: 'trap', bars: 1,
            name: 'Trap',
            note: 'Snare on three, hats doing the work.',
            hits: { 36: [0, 6, 11], 38: [8], 42: 'every16', 46: [15] },
        },
        {
            id: 'trap-rolls', kind: 'drums', style: 'trap', bars: 2,
            name: 'Trap with rolls',
            note: 'The triplet roll is the genre, so it is written in rather than left to taste.',
            hits: {
                36: [0, 6, 11, 16, 19, 27], 38: [8, 24],
                42: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 29, 30, 31],
            },
        },

        // ── House ─────────────────────────────────────────────────────────
        {
            id: 'house-four', kind: 'drums', style: 'house', bars: 1,
            name: 'Four to the floor',
            note: 'The oldest one in the book, and still right.',
            hits: { 36: [0, 4, 8, 12], 39: [4, 12], 46: [2, 6, 10, 14], 42: [0, 2, 4, 6, 8, 10, 12, 14] },
        },
        {
            id: 'house-bass', kind: 'bass', style: 'house', bars: 1,
            name: 'Offbeat bass',
            note: 'Between the kicks, never on them.',
            notes: [[2, 2, 0], [6, 2, 0], [10, 2, 10], [14, 2, 8]],
            oct: -2,
        },

        // ── Gospel / soul ─────────────────────────────────────────────────
        {
            id: 'gos-shuffle', kind: 'drums', style: 'gospel', bars: 1,
            name: 'Gospel shuffle',
            note: 'Slow, swung hard, snare laid back.',
            hits: { 36: [0, 7, 10], 38: [4, 12], 51: [0, 3, 4, 7, 8, 11, 12, 15] },
        },
        {
            id: 'gos-chords', kind: 'chords', style: 'gospel', bars: 2,
            name: 'ii V i',
            note: 'The turnaround. Everything resolves and then goes round again.',
            chords: [[0, 8, 2, 'MIN7'], [8, 8, 7, 'DOM7'], [16, 16, 0, 'MIN9']],
        },
        {
            id: 'gos-bass', kind: 'bass', style: 'gospel', bars: 2,
            name: 'Walking up',
            note: 'A bass that moves between the chords instead of sitting on them.',
            notes: [[0, 4, 2], [4, 2, 5], [6, 2, 7], [8, 4, 7], [12, 2, 10], [14, 2, 11],
                    [16, 8, 0], [24, 4, 10], [28, 4, 7]],
            oct: -2,
        },

        // ── More melody ───────────────────────────────────────────────────
        {
            id: 'ama-lead', kind: 'melody', style: 'amapiano', bars: 2,
            name: 'Piano lead',
            note: 'Right hand on top of the chords, answering itself across the bar.',
            notes: [[0, 2, 12], [3, 1, 15], [4, 2, 19], [8, 2, 17], [11, 1, 15], [12, 3, 12],
                    [16, 2, 15], [19, 1, 17], [20, 2, 20], [24, 4, 19], [29, 3, 12]],
        },
        {
            id: 'afro-call', kind: 'melody', style: 'afrobeats', bars: 2,
            name: 'Call and answer',
            note: 'A phrase, then the same phrase lower. Half the hooks in the genre.',
            notes: [[0, 2, 19], [2, 2, 17], [4, 4, 15], [10, 2, 17], [12, 3, 15],
                    [16, 2, 15], [18, 2, 12], [20, 4, 10], [26, 2, 12], [28, 4, 8]],
        },
        {
            id: 'high-horn', kind: 'melody', style: 'highlife', bars: 2,
            name: 'Horn line',
            note: 'Short, bright, on the beat. Written to be doubled.',
            notes: [[0, 2, 12], [2, 2, 16], [4, 2, 19], [6, 4, 16],
                    [12, 2, 14], [14, 2, 12],
                    [16, 2, 17], [18, 2, 19], [20, 4, 24], [26, 2, 19], [28, 4, 16]],
        },
        {
            id: 'gos-lead', kind: 'melody', style: 'gospel', bars: 2,
            name: 'Gospel run',
            note: 'Down the scale and back, the way a hand falls off a chord.',
            notes: [[0, 2, 19], [2, 1, 17], [3, 1, 15], [4, 1, 14], [5, 1, 12], [6, 4, 10],
                    [12, 2, 12], [14, 2, 14],
                    [16, 6, 15], [24, 2, 17], [26, 2, 19], [28, 4, 24]],
        },
        {
            id: 'trap-bell', kind: 'melody', style: 'trap', bars: 2,
            name: 'Bell motif',
            note: 'Three notes, repeated until they mean something.',
            notes: [[0, 2, 12], [4, 2, 15], [6, 2, 12], [10, 2, 19], [14, 2, 15],
                    [16, 2, 12], [20, 2, 15], [22, 2, 12], [26, 2, 20], [30, 2, 19]],
        },

        // ── More guitar ───────────────────────────────────────────────────
        {
            id: 'ama-gtr', kind: 'guitar', style: 'amapiano', bars: 2,
            name: 'Muted stabs',
            note: 'Off the beat, short, never where the log drum is.',
            notes: [[2, 1, 12], [3, 1, 15], [7, 1, 19], [10, 1, 15], [11, 1, 12],
                    [18, 1, 10], [19, 1, 14], [23, 1, 17], [26, 1, 14], [27, 1, 10]],
        },
        {
            id: 'afh-gtr', kind: 'guitar', style: 'afrohouse', bars: 2,
            name: 'Rolling arpeggio',
            note: 'Sixteenths going round a chord. Set it and leave it.',
            notes: [[0, 1, 12], [2, 1, 15], [4, 1, 19], [6, 1, 24], [8, 1, 19], [10, 1, 15],
                    [12, 1, 19], [14, 1, 15],
                    [16, 1, 10], [18, 1, 14], [20, 1, 17], [22, 1, 22], [24, 1, 17],
                    [26, 1, 14], [28, 1, 17], [30, 1, 14]],
        },
        {
            id: 'dh-skank', kind: 'guitar', style: 'dancehall', bars: 1,
            name: 'Skank',
            note: 'The offbeat chop, and nothing else. That is the part.',
            notes: [[2, 1, 12], [2, 1, 15], [2, 1, 19],
                    [6, 1, 12], [6, 1, 15], [6, 1, 19],
                    [10, 1, 12], [10, 1, 15], [10, 1, 19],
                    [14, 1, 12], [14, 1, 15], [14, 1, 19]],
        },
        {
            id: 'hh-keys', kind: 'guitar', style: 'hiphop', bars: 2,
            name: 'Rhodes figure',
            note: 'Loose, behind the beat if you swing it.',
            notes: [[0, 3, 12], [4, 2, 15], [7, 1, 17], [8, 4, 15],
                    [16, 3, 10], [20, 2, 14], [23, 1, 15], [24, 6, 12]],
        },

        // ── More bass ─────────────────────────────────────────────────────
        {
            id: 'dem-bass', kind: 'bass', style: 'dembow', bars: 1,
            name: 'Dembow bass',
            note: 'Under the kick on one and three, and out of the way after.',
            notes: [[0, 4, 0], [8, 3, 0], [12, 2, 10], [14, 2, 8]],
            oct: -2,
        },
        {
            id: 'trap-808', kind: 'bass', style: 'trap', bars: 2,
            name: '808 line',
            note: 'Long notes that slide. Let them ring into each other.',
            notes: [[0, 6, 0], [6, 5, 0], [11, 5, 10], [16, 3, 8], [19, 8, 0], [27, 5, 5]],
            oct: -2,
        },
        {
            id: 'high-bass', kind: 'bass', style: 'highlife', bars: 2,
            name: 'Highlife bass',
            note: 'Walks. Never sits on the root for a whole bar.',
            notes: [[0, 2, 0], [4, 2, 7], [6, 2, 10], [8, 2, 12], [12, 2, 10], [14, 2, 7],
                    [16, 2, 8], [20, 2, 12], [22, 2, 15], [24, 2, 10], [28, 4, 0]],
            oct: -2,
        },
        {
            id: 'afh-bass', kind: 'bass', style: 'afrohouse', bars: 1,
            name: 'Deep house bass',
            note: 'One note, placed well. Most of house is one note placed well.',
            notes: [[2, 2, 0], [6, 2, 0], [10, 2, 0], [13, 1, 10], [14, 2, 12]],
            oct: -2,
        },

        // ── More chords ───────────────────────────────────────────────────
        {
            id: 'high-chords', kind: 'chords', style: 'highlife', bars: 2,
            name: 'Highlife major',
            note: 'Bright, and it keeps moving. The genre does not brood.',
            chords: [[0, 8, 3, 'MAJ'], [8, 8, 8, 'MAJ'], [16, 8, 10, 'MAJ'], [24, 8, 3, 'MAJ7']],
        },
        {
            id: 'dh-chords', kind: 'chords', style: 'dancehall', bars: 2,
            name: 'Minor two-chord',
            note: 'Two chords is plenty when the drums are doing this much.',
            chords: [[0, 16, 0, 'MIN'], [16, 16, 10, 'MAJ']],
        },
        {
            id: 'pop-chords', kind: 'chords', style: 'afrobeats', bars: 2,
            name: 'i VI III VII',
            note: 'The one that sounds like everything and belongs to nobody.',
            chords: [[0, 8, 0, 'MIN'], [8, 8, 8, 'MAJ'], [16, 8, 3, 'MAJ'], [24, 8, 10, 'MAJ']],
        },
        {
            id: 'trap-chords', kind: 'chords', style: 'trap', bars: 2,
            name: 'Dark minor',
            note: 'Two chords a semitone apart at the end, which is the whole trick.',
            chords: [[0, 12, 0, 'MIN'], [12, 4, 1, 'MAJ'], [16, 12, 0, 'MIN'], [28, 4, 11, 'MAJ']],
        },
        {
            id: 'house-chords', kind: 'chords', style: 'house', bars: 2,
            name: 'House stabs',
            note: 'Short and off the beat. The chord is a percussion instrument here.',
            chords: [[2, 2, 0, 'MIN7'], [6, 2, 0, 'MIN7'], [10, 2, 10, 'MAJ7'], [14, 2, 10, 'MAJ7'],
                     [18, 2, 8, 'MAJ7'], [22, 2, 8, 'MAJ7'], [26, 2, 5, 'MIN7'], [30, 2, 5, 'MIN7']],
        },

        // ── A few more kits ───────────────────────────────────────────────
        {
            id: 'high-kit', kind: 'drums', style: 'highlife', bars: 1,
            name: 'Highlife kit',
            note: 'Straighter than the shuffle, for when the guitar is busy.',
            hits: { 36: [0, 8], 38: [4, 12], 42: 'every16', 37: [6, 14] },
        },
        {
            id: 'gos-straight', kind: 'drums', style: 'gospel', bars: 1,
            name: 'Gospel straight',
            note: 'Backbeat, hats on eighths, nothing clever.',
            hits: { 36: [0, 8], 38: [4, 12], 42: [0, 2, 4, 6, 8, 10, 12, 14], 46: [14] },
        },
        {
            id: 'house-perc', kind: 'drums', style: 'house', bars: 2,
            name: 'House with percussion',
            note: 'The kick never changes; everything around it does.',
            hits: {
                36: [0, 4, 8, 12, 16, 20, 24, 28],
                39: [4, 12, 20, 28],
                46: [2, 6, 10, 14, 18, 22, 26, 30],
                42: 'every16x2',
                37: [3, 9, 15, 19, 25, 31],
            },
        },
        {
            id: 'ama-sparse', kind: 'drums', style: 'amapiano', bars: 1,
            name: 'Sparse piano',
            note: 'For when the log drum is the loudest thing, which it should be.',
            hits: { 36: [0, 4, 8, 12], 46: [6, 14], 37: [2, 7, 10, 15] },
        },
        {
            id: 'afro-half', kind: 'drums', style: 'afrobeats', bars: 1,
            name: 'Half-time afro',
            note: 'Clap on three only. Everything feels twice as slow and twice as big.',
            hits: { 36: [0, 6, 10], 39: [8], 42: 'every16', 46: [14] },
        },
    ],

    // ── Reading the library ───────────────────────────────────────────────

    byKind(kind, style) {
        return this.LIST.filter(p => p.kind === kind && (!style || p.style === style));
    },

    styleOf(id) { return this.STYLES.find(s => s.id === id) || null; },

    get(id) { return this.LIST.find(p => p.id === id) || null; },

    /// Which styles actually have something of this kind. A tab that leads
    /// to an empty list is a small lie.
    stylesWith(kind) {
        return this.STYLES.filter(s => this.LIST.some(p => p.kind === kind && p.style === s.id));
    },

    // ── Turning one into notes ────────────────────────────────────────────

    /// A preset becomes a list of {pitch, vel, dur, tick}. Nothing here
    /// knows about riffs or tracks — that is the caller's business — so
    /// this stays testable and the same call serves preview and apply.
    ///
    /// `at` is the MIDI note the pitched material should sit around, and
    /// `tonic` is the key it should be in. Drums ignore both.
    realise(preset, opts) {
        const o = opts || {};
        if (!preset) return [];
        return preset.kind === 'drums'
            ? this.drumNotes(preset)
            : this.tunedNotes(preset, o.tonic | 0, o.at == null ? 60 : o.at);
    },

    drumNotes(preset) {
        const out = [];
        const span = (preset.bars || 1) * 16;
        for (const key of Object.keys(preset.hits || {})) {
            const pitch = +key;
            let steps = preset.hits[key];
            if (steps === 'every16') steps = this.every(16);
            else if (steps === 'every16x2') steps = this.every(32);
            for (const s of steps) {
                if (s < 0 || s >= span) continue;
                out.push({ pitch, vel: this.weight(pitch, s), dur: 1, tick: s });
            }
        }
        return out.sort((a, b) => a.tick - b.tick);
    },

    /// Not everything at 100. A shaker that never varies sounds like a
    /// machine, and the downbeat of a bar is louder than the rest of it
    /// in every style here.
    weight(pitch, step) {
        if (pitch === this.HAT) return step % 4 === 0 ? 92 : (step % 2 === 0 ? 76 : 58);
        if (pitch === this.RIDE) return step % 4 === 0 ? 90 : 68;
        if (pitch === this.RIM) return 70;
        if (pitch === this.OPEN) return 86;
        return step % 16 === 0 ? 110 : 100;
    },

    /// Pitched material, placed in the key and in a sensible octave.
    ///
    /// `at` is where the instrument lives — the same number the piano roll
    /// uses to decide what to show — so a bass preset lands on the bass's
    /// strings rather than three octaves above them.
    tunedNotes(preset, tonic, at) {
        const out = [];
        const span = (preset.bars || 1) * 16;
        // The tonic nearest the instrument's home, so a preset is in the
        // right key AND in the right register.
        let root = ((tonic % 12) + 12) % 12;
        root += Math.round((at - root) / 12) * 12;
        root += (preset.oct || 0) * 12;

        if (preset.chords) {
            for (const [tick, dur, chordRoot, shapeName] of preset.chords) {
                if (tick >= span) continue;
                const shape = this[shapeName] || this.MIN;
                for (const s of shape)
                    out.push({ pitch: root + chordRoot + s, vel: 84,
                               dur: Math.max(1, dur), tick });
            }
        }
        for (const [tick, dur, semis] of (preset.notes || [])) {
            if (tick >= span) continue;
            out.push({ pitch: root + semis, vel: tick % 16 === 0 ? 104 : 94,
                       dur: Math.max(1, dur), tick });
        }
        return out.sort((a, b) => a.tick - b.tick);
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Presets };
