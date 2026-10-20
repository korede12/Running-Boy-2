// ── The preset library ────────────────────────────────────────────────────
// Patterns worth starting from, as data.
//
// Three decisions shape everything here.
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
// touches a tuner. A preset written in minor dropped into a major song goes
// to the relative minor, which shares every note, rather than clashing.
//
// The third is that the parts of a style belong together. Each style has
// ONE progression (PROG), and its chords, bass, keys and melodies are all
// written over it — so the bass under the chords under the hook agree with
// each other, which is most of what "sounds solid" means. Chords are voiced
// here rather than written out: each one is placed as close as it can sit to
// the one before, the way a player's hand moves, instead of every chord
// jumping to root position.
//
// The roll can now say things a sixteenth grid could not, and these use
// them: each style's swing is written into the notes (the off-sixteenths
// sit late by the style's amount), rolls are written in triplets and
// thirty-seconds, a laid-back snare is actually laid back, and a drum
// drawn long rings — which is what an 808 is.
//
// On the patterns themselves: a rhythm is not anybody's property, and these
// are the common ones — the tresillo, four-on-the-floor, the dembow, the
// shaker running sixteenths. What is NOT here is any actual tune: the
// melodic presets are idiomatic shapes over common progressions, not
// quotations of songs anybody wrote.

const Presets = {

    // ── The drum kit, by name ─────────────────────────────────────────────
    // General MIDI percussion numbers. Named because [36] means nothing and
    // KICK means something.
    KICK: 36, KICK2: 35, SNARE: 38, SNARE2: 40, RIM: 37, CLAP: 39,
    HAT: 42, PEDAL: 44, OPEN: 46, RIDE: 51, CRASH: 49,

    // The African Percussion kit (program 64), where General MIDI keeps
    // its hand drums. A preset with `kit: 64` is written for it, and goes
    // on a drum track of its own beside the main kit rather than over it.
    PERC: 64,
    SHAKER: 70, SHEKERE: 69, CLAVE: 75, AGOGO_HI: 67, AGOGO_LO: 68,
    DJ_SLAP: 62, DJ_TONE: 63, DJ_BASS: 64, SAKARA: 65, BATA_HI: 60, BATA_LO: 61,
    DUNDUN: 35, SANGBAN: 36,

    /// The styles, in the order they are offered. Each carries the tempo it
    /// wants, because a dembow at 104 is not a dembow — and the swing, as a
    /// fraction of a step that every off-sixteenth is played late by.
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

    // ── Chord shapes, in semitones above the chord's own root ─────────────
    MIN: [0, 3, 7], MAJ: [0, 4, 7], SUS2: [0, 2, 7], SUS4: [0, 5, 7],
    MIN7: [0, 3, 7, 10], MAJ7: [0, 4, 7, 11], DOM7: [0, 4, 7, 10],
    MIN9: [0, 3, 7, 10, 14], MAJ9: [0, 4, 7, 11, 14], DOM9: [0, 4, 7, 10, 14],
    ADD9: [0, 4, 7, 14], MIN11: [0, 3, 7, 10, 17], HALFDIM: [0, 3, 6, 10],
    DOM7b9: [0, 4, 7, 10, 13],

    // ── Each style's progression ──────────────────────────────────────────
    // [start step, length in steps, root above the tonic, shape]. Two bars
    // each. Minor unless the style's presets say `mode: 'major'`.
    PROG: {
        // i9 – VImaj7 – III(add9) – VII. The loop the genre leans on.
        afro:   [[0, 8, 0, 'MIN9'], [8, 8, 8, 'MAJ7'], [16, 8, 3, 'ADD9'], [24, 8, 10, 'MAJ']],
        // i7 – iv9 – VII – IIImaj7. Darker; the fourth pulls it somewhere.
        afro2:  [[0, 8, 0, 'MIN7'], [8, 8, 5, 'MIN9'], [16, 8, 10, 'MAJ'], [24, 8, 3, 'MAJ7']],
        // i9 for a bar, then iv9 and VImaj9. Amapiano keys sit on one chord.
        ama:    [[0, 16, 0, 'MIN9'], [16, 8, 5, 'MIN9'], [24, 8, 8, 'MAJ9']],
        // i9 – VII(add9) – VImaj7. House is patient.
        afh:    [[0, 16, 0, 'MIN9'], [16, 8, 10, 'ADD9'], [24, 8, 8, 'MAJ7']],
        // I – IV – V7 – I, in major. Highlife does not brood.
        high:   [[0, 8, 0, 'MAJ'], [8, 8, 5, 'MAJ'], [16, 8, 7, 'DOM7'], [24, 8, 0, 'MAJ']],
        // i – VI – VII. Riddims need few chords.
        dh:     [[0, 16, 0, 'MIN'], [16, 8, 8, 'MAJ'], [24, 8, 10, 'MAJ']],
        // i – VI – III – VII. The reggaeton loop.
        dem:    [[0, 8, 0, 'MIN'], [8, 8, 8, 'MAJ'], [16, 8, 3, 'MAJ'], [24, 8, 10, 'MAJ']],
        // i9 – iv7 – VImaj7 – V7. The V is major, so it pulls home.
        hh:     [[0, 12, 0, 'MIN9'], [12, 4, 5, 'MIN7'], [16, 12, 8, 'MAJ7'], [28, 4, 7, 'DOM7']],
        // i – bII – VI – v. The flat second is the menace.
        trap:   [[0, 12, 0, 'MIN'], [12, 4, 1, 'MAJ'], [16, 8, 8, 'MAJ'], [24, 8, 7, 'MIN']],
        // i9 – VII(add9) – VImaj7 – iv7.
        house:  [[0, 8, 0, 'MIN9'], [8, 8, 10, 'ADD9'], [16, 8, 8, 'MAJ7'], [24, 8, 5, 'MIN7']],
        // iiø – V7b9 – i9. The minor turnaround.
        gos:    [[0, 8, 2, 'HALFDIM'], [8, 8, 7, 'DOM7b9'], [16, 16, 0, 'MIN9']],
        // Imaj9 – vi9 – ii9 – V9, in major. The church turnaround.
        gosmaj: [[0, 8, 0, 'MAJ9'], [8, 8, 9, 'MIN9'], [16, 8, 2, 'MIN9'], [24, 8, 7, 'DOM9']],
    },

    // ── The library ───────────────────────────────────────────────────────
    // `bars` is how long the preset is.
    //
    // Drums: `hits` per kit piece, each a list of steps — or of
    // [step, velocity, length] where one needs saying. Steps may be
    // fractions: 12 + 2/3 is the second note of a triplet.
    //
    // Pitched: `notes` are [step, length, semitones above the tonic,
    // velocity?]. `chords` names a progression, which is played as held
    // chords, or in the rhythm `comp` gives ([offset, length, velocity],
    // repeating every `every` steps through each chord), or broken up by
    // `arp`. `follow` writes a bass `line` under a progression: intervals
    // above each chord's root, where 't' and 'f' are that chord's own third
    // and fifth, 'o' the octave, 'n' the next chord's root (anticipating it)
    // and 'a' the note a semitone under it (walking into it). `oct` moves
    // the whole thing; `swing` overrides the style's.

    LIST: [

        // ── Afrobeats ─────────────────────────────────────────────────────
        {
            id: 'afro-lagos', kind: 'drums', style: 'afrobeats', bars: 2,
            name: 'Lagos bounce',
            note: 'The common one, with ghost snares and the open hat ringing on the and.',
            hits: {
                36: [0, 6, 10, 16, 22, 26, 29],
                39: [4, 12, 20, 28],
                38: [[7, 34], [15, 40], [23, 34], [31, 46]],
                42: 'every16x2',
                46: [[6, 84, 2], [14, 80, 2], [22, 84, 2], [30, 80, 2]],
                37: [3, 11, 19, 25, 27],
            },
        },
        {
            id: 'afro-zanku', kind: 'drums', style: 'afrobeats', bars: 1,
            name: 'Zanku',
            note: 'Busier kick, the shaker carrying it.',
            hits: { 36: [0, 3, 6, 10], 39: [4, 12], 42: 'every16', 46: [[14, 84, 2]], 37: [7, 15] },
        },
        {
            id: 'afro-half', kind: 'drums', style: 'afrobeats', bars: 1,
            name: 'Half-time afro',
            note: 'Clap on three only. Everything feels twice as slow and twice as big.',
            hits: { 36: [0, 6, 10], 39: [8], 42: 'every16', 46: [[14, 84, 2]], 37: [3, 13] },
        },
        {
            id: 'afro-fill', kind: 'drums', style: 'afrobeats', bars: 1,
            name: 'Afro fill',
            note: 'For the bar before the change: the snare rolls in thirty-seconds and lifts into the one.',
            hits: {
                36: [0, 6, 10], 39: [4],
                42: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
                38: [[12, 62], [13, 68], [14, 74], [14.5, 80], [15, 88], [15.5, 100]],
            },
        },
        {
            id: 'afro-chords', kind: 'chords', style: 'afrobeats', bars: 2,
            name: 'Lagos keys',
            note: 'i9 VI III VII, played three-three-two. Lands with the bass and the hook.',
            chords: 'afro', every: 8,
            comp: [[0, 2.5, 92], [3, 2.5, 78], [6, 1.5, 84]],
        },
        {
            id: 'afro-pad', kind: 'chords', style: 'afrobeats', bars: 2,
            name: 'Warm pad',
            note: 'i7 iv9 VII III, held. For under a vocal.',
            chords: 'afro2', vel: 76,
        },
        {
            id: 'afro-bass', kind: 'bass', style: 'afrobeats', bars: 2,
            name: 'Afrobeats bass',
            note: 'Under Lagos keys. Sits in the holes the kick leaves and pushes into each chord.',
            follow: 'afro', every: 8,
            line: [[0, 2.5, 0, 106], [3, 1, 'o', 80], [4, 1.5, 0, 90], [6, 1, 'f', 86], [7, 1, 'n', 82]],
        },
        {
            id: 'afro-bass2', kind: 'bass', style: 'afrobeats', bars: 2,
            name: 'Sub and fifth',
            note: 'Under Warm pad. Long root, a fifth to lean on.',
            follow: 'afro2', every: 8,
            line: [[0, 5, 0, 104], [6, 2, 'f', 88]],
        },
        {
            id: 'afro-lead', kind: 'melody', style: 'afrobeats', bars: 2,
            name: 'Pentatonic hook',
            note: 'Over Lagos keys. Every long note is a chord tone, so it sits.',
            notes: [[2, 2, 7], [4, 1, 10], [5, 3, 12],
                    [8, 2, 15], [10, 1, 12], [11, 1, 10], [12, 3, 7],
                    [18, 2, 15], [20, 1, 14], [21, 1, 15], [22, 2, 19],
                    [24, 3, 17], [27, 1, 15], [28, 4, 14]],
        },
        {
            id: 'afro-call', kind: 'melody', style: 'afrobeats', bars: 2,
            name: 'Call and answer',
            note: 'Over Warm pad. A phrase that rises, and one that falls home.',
            notes: [[0, 2, 12], [2, 1, 15], [3, 1, 17], [4, 3, 19],
                    [8, 1, 17], [9, 1, 15], [10, 2, 12], [12, 3, 8],
                    [16, 2, 10], [18, 1, 14], [19, 1, 17], [20, 3, 14],
                    [24, 2, 15], [26, 1, 14], [27, 1, 12], [28, 4, 7]],
        },
        {
            id: 'afro-gtr', kind: 'guitar', style: 'afrobeats', bars: 2,
            name: 'Picked guitar',
            note: 'Over Lagos keys. Sixteenths round each chord, the top note accented.',
            chords: 'afro', oct: 1,
            arp: { order: [2, 0, 1, 2, 3, 1, 2, 0], rate: 1, len: 0.75, accent: [96, 70, 78, 88] },
        },

        // ── Amapiano ──────────────────────────────────────────────────────
        {
            id: 'ama-four', kind: 'drums', style: 'amapiano', bars: 1,
            name: 'Piano four',
            note: 'Four on the floor, the shaker soft and swung, the open hat answering.',
            hits: {
                36: [0, 4, 8, 12], 39: [[12, 88]],
                42: 'every16', 46: [[2, 80, 2], [6, 78, 2], [10, 80, 2], [14, 78, 2]],
                37: [3, 7, 11, 14],
            },
        },
        {
            id: 'ama-shuffle', kind: 'drums', style: 'amapiano', bars: 2,
            name: 'Shuffled piano',
            note: 'The percussion loosened, with a triplet tumble into the next bar.',
            hits: {
                36: [0, 4, 8, 12, 16, 20, 24, 28],
                46: [[2, 80, 2], [6, 78, 2], [10, 80, 2], [14, 78, 2],
                     [18, 80, 2], [22, 78, 2], [26, 80, 2]],
                42: 'every16x2',
                39: [12, 28],
                37: [3, 7, 15, 19, 23, [29 + 1 / 3, 64], [30, 70], [30 + 2 / 3, 76]],
            },
        },
        {
            id: 'ama-sparse', kind: 'drums', style: 'amapiano', bars: 1,
            name: 'Sparse piano',
            note: 'For when the log drum is the loudest thing, which it should be.',
            hits: { 36: [0, 4, 8, 12], 46: [[6, 80, 2], [14, 80, 2]], 37: [2, 7, 10, 15] },
        },
        {
            id: 'ama-chords', kind: 'chords', style: 'amapiano', bars: 2,
            name: 'Deep piano',
            note: 'i9 iv9 VImaj9, both hands: the left on the root, the right off the beat.',
            chords: 'ama', every: 16, root: true,
            comp: [[0, 3, 90], [3, 3, 74], [6, 2, 82], [10, 2, 72], [12, 4, 80]],
        },
        {
            id: 'ama-log', kind: 'bass', style: 'amapiano', bars: 2,
            name: 'Log drum figure',
            note: 'Under Deep piano. Off the beat, jumping the octave — the genre’s lead instrument.',
            notes: [[3, 2, 0, 108], [6, 1, 0, 86], [7, 2, 12, 98], [10, 2, 7, 90],
                    [13, 1, 0, 84], [14, 2, 10, 94],
                    [19, 2, 5, 106], [22, 1, 5, 86], [23, 1, 17, 96],
                    [26, 2, -4, 106], [29, 1, -4, 84], [30, 2, 3, 94]],
        },
        {
            id: 'ama-lead', kind: 'melody', style: 'amapiano', bars: 2,
            name: 'Piano lead',
            note: 'Over Deep piano. Right hand high, landing on the ninths.',
            notes: [[0, 2, 14], [2, 1, 12], [3, 3, 10], [8, 1, 7], [9, 1, 10], [10, 2, 12], [12, 4, 14],
                    [16, 2, 15], [18, 1, 12], [19, 3, 8],
                    [24, 2, 12], [26, 1, 15], [27, 3, 19], [30, 2, 17]],
        },
        {
            id: 'ama-gtr', kind: 'guitar', style: 'amapiano', bars: 2,
            name: 'Muted stabs',
            note: 'Over Deep piano. Short, high, never where the log drum is.',
            chords: 'ama', every: 16, oct: 1,
            comp: [[2, 0.75, 80], [5, 0.5, 68], [8, 0.75, 76], [11, 0.5, 66], [15, 0.75, 74]],
        },

        // ── Afro house ────────────────────────────────────────────────────
        {
            id: 'afh-four', kind: 'drums', style: 'afrohouse', bars: 1,
            name: 'Afro house',
            note: 'Four on the floor with the percussion doing the talking.',
            hits: {
                36: [0, 4, 8, 12], 39: [4, 12],
                46: [[2, 82, 2], [6, 82, 2], [10, 82, 2], [14, 82, 2]],
                42: 'every16', 37: [1, 6, 9, 14],
            },
        },
        {
            id: 'afh-tribal', kind: 'drums', style: 'afrohouse', bars: 2,
            name: 'Tribal groove',
            note: 'The second snare tuned down to a hand drum, playing round the kick.',
            hits: {
                36: [0, 4, 8, 12, 16, 20, 24, 28], 39: [4, 12, 20, 28],
                46: [[2, 80, 2], [6, 80, 2], [10, 80, 2], [14, 80, 2],
                     [18, 80, 2], [22, 80, 2], [26, 80, 2], [30, 80, 2]],
                40: [[3, 54], [7, 48], [10, 58], [11, 46], [19, 54], [23, 48], [26, 58],
                     [29, 50], [30, 56], [31, 62]],
                37: [6, 14, 22, 27],
            },
        },
        {
            id: 'afh-chords', kind: 'chords', style: 'afrohouse', bars: 2,
            name: 'Rolling minor',
            note: 'i9 VII VI, held long. House is patient.',
            chords: 'afh', vel: 78,
        },
        {
            id: 'afh-stabs', kind: 'chords', style: 'afrohouse', bars: 2,
            name: 'Afro house stabs',
            note: 'The same chords as a rhythm.',
            chords: 'afh', every: 16,
            comp: [[0, 1, 92], [3, 1, 78], [6, 1, 86], [10, 1, 78], [12, 1.5, 84]],
        },
        {
            id: 'afh-bass', kind: 'bass', style: 'afrohouse', bars: 2,
            name: 'Deep house bass',
            note: 'Between the kicks, with an octave pop. Under either chord part.',
            follow: 'afh', every: 8,
            line: [[2, 1.5, 0, 102], [6, 1, 0, 92], [7, 0.75, 'o', 78]],
        },
        {
            id: 'afh-gtr', kind: 'guitar', style: 'afrohouse', bars: 2,
            name: 'Rolling arpeggio',
            note: 'Sixteenths going round each chord. Set it and leave it.',
            chords: 'afh', oct: 1,
            arp: { order: [0, 1, 2, 3, 2, 1, 2, 3], rate: 1, len: 0.9, accent: [92, 72, 80, 72] },
        },
        {
            id: 'afh-lead', kind: 'melody', style: 'afrohouse', bars: 2,
            name: 'Marimba motif',
            note: 'Short notes in a pattern that repeats against the bar.',
            notes: [[0, 1, 12], [2, 1, 15], [3, 1, 19], [6, 1, 17], [8, 1, 15], [10, 1, 12],
                    [11, 1, 10], [14, 1, 12],
                    [16, 1, 14], [18, 1, 17], [19, 1, 22], [22, 1, 17], [24, 1, 15],
                    [26, 1, 12], [27, 1, 19], [30, 1, 15]],
        },

        // ── Highlife ──────────────────────────────────────────────────────
        {
            id: 'high-clave', kind: 'drums', style: 'highlife', bars: 2,
            name: 'Highlife shuffle',
            note: 'The bell carries the pattern; the kit stays out of its way.',
            hits: {
                36: [0, 10, 16, 26], 38: [4, 12, 20, 28],
                51: [0, 3, 6, 10, 12, 16, 19, 22, 26, 28],
                37: [6, 22], 42: [2, 8, 14, 18, 24, 30],
            },
        },
        {
            id: 'high-kit', kind: 'drums', style: 'highlife', bars: 1,
            name: 'Highlife kit',
            note: 'Straighter than the shuffle, for when the guitar is busy.',
            hits: { 36: [0, 8], 38: [4, 12], 42: 'every16', 37: [6, 14] },
        },
        {
            id: 'high-chords', kind: 'chords', style: 'highlife', bars: 2, mode: 'major',
            name: 'Offbeat chords',
            note: 'I IV V7 I, on the and of every beat. Bright, and it keeps moving.',
            chords: 'high', every: 4,
            comp: [[2, 1.5, 86]],
        },
        {
            id: 'high-gtr', kind: 'guitar', style: 'highlife', bars: 2, mode: 'major',
            name: 'Palm-wine guitar',
            note: 'Over Offbeat chords. Thirds and sixths walking, the sound of the style.',
            notes: [[0, 1, 16], [0, 1, 19], [2, 1, 14], [2, 1, 17], [4, 2, 12], [4, 2, 16],
                    [8, 1, 17], [8, 1, 21], [10, 1, 16], [10, 1, 19], [12, 2, 12], [12, 2, 17],
                    [16, 1, 14], [16, 1, 17], [18, 1, 11], [18, 1, 14], [20, 2, 17], [20, 2, 23],
                    [24, 2, 12], [24, 2, 16], [26, 1, 14], [26, 1, 19], [28, 4, 12], [28, 4, 16]],
        },
        {
            id: 'high-pick', kind: 'guitar', style: 'highlife', bars: 2, mode: 'major',
            name: 'Picked lead guitar',
            note: 'Over Offbeat chords. Fast and light round each chord.',
            chords: 'high', oct: 1,
            arp: { order: [2, 0, 1, 2, 0, 1, 3, 1], rate: 1, len: 0.8, accent: [92, 70, 80, 74] },
        },
        {
            id: 'high-horn', kind: 'melody', style: 'highlife', bars: 2, mode: 'major',
            name: 'Horn line',
            note: 'Short, bright, on the beat. Written to be doubled.',
            notes: [[0, 2, 12], [2, 2, 16], [4, 2, 19], [6, 3, 16],
                    [10, 1, 17], [11, 1, 19], [12, 2, 21], [14, 2, 17],
                    [16, 2, 19], [18, 1, 17], [19, 1, 14], [20, 3, 11],
                    [24, 2, 12], [26, 2, 7], [28, 4, 4]],
        },
        {
            id: 'high-bass', kind: 'bass', style: 'highlife', bars: 2, mode: 'major',
            name: 'Highlife bass',
            note: 'Walks between the chords. Never sits on the root for long.',
            follow: 'high', every: 8,
            line: [[0, 2, 0, 104], [3, 1, 't', 82], [4, 2, 'f', 94], [6, 2, 'n', 86]],
        },

        // ── Dancehall ─────────────────────────────────────────────────────
        {
            id: 'dh-onedrop', kind: 'drums', style: 'dancehall', bars: 1,
            name: 'One drop',
            note: 'Nothing on the one. That is the point of it.',
            hits: {
                36: [8], 38: [8], 37: [4, 12],
                42: [0, 2, 4, 6, 8, 10, 12, [14, 70], [14 + 2 / 3, 62], [15 + 1 / 3, 72]],
            },
        },
        {
            id: 'dh-steppers', kind: 'drums', style: 'dancehall', bars: 1,
            name: 'Steppers',
            note: 'Kick on every beat, snare answering the half.',
            hits: { 36: [0, 4, 8, 12], 38: [8], 42: 'every16', 46: [[14, 84, 2]] },
        },
        {
            id: 'dh-bounce', kind: 'drums', style: 'dancehall', bars: 1,
            name: 'Dancehall bounce',
            note: 'The modern one: kick three-three-two, clap on the backbeat.',
            hits: { 36: [0, 3, 8, 11], 39: [4, 12], 38: [[7, 40], [15, 46]], 42: [0, 2, 4, 6, 8, 10, 12, 14],
                    46: [[6, 82, 2]] },
        },
        {
            id: 'dh-chords', kind: 'chords', style: 'dancehall', bars: 2,
            name: 'Riddim chords',
            note: 'i VI VII, held. Two or three chords is plenty when the drums are doing this much.',
            chords: 'dh', vel: 80,
        },
        {
            id: 'dh-skank', kind: 'guitar', style: 'dancehall', bars: 2,
            name: 'Skank',
            note: 'The offbeat chop, and nothing else. That is the part.',
            chords: 'dh', every: 4, oct: 1,
            comp: [[2, 0.75, 90]],
        },
        {
            id: 'dh-bass', kind: 'bass', style: 'dancehall', bars: 2,
            name: 'Riddim bass',
            note: 'Root, then up to the fifth and third. Heavy and in no hurry.',
            follow: 'dh', every: 8,
            line: [[0, 3, 0, 106], [3, 1, 0, 80], [4, 2, 'f', 94], [6, 2, 't', 88]],
        },

        // ── Dembow / reggaeton ────────────────────────────────────────────
        {
            id: 'dem-classic', kind: 'drums', style: 'dembow', bars: 1,
            name: 'Dembow',
            note: 'Boom-ch-boom-chick. Kick on one and three, snare off the beat.',
            hits: { 36: [0, 8], 38: [3, 6, 11, 14], 42: [0, 2, 4, 6, 8, 10, 12, 14] },
        },
        {
            id: 'dem-perreo', kind: 'drums', style: 'dembow', bars: 2,
            name: 'Perreo',
            note: 'The dembow over two bars, with a rim roll into the top of the loop.',
            hits: {
                36: [0, 8, 16, 24], 38: [3, 6, 11, 14, 19, 22, 27],
                42: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26],
                37: [[28, 64], [29, 70], [30, 76], [30.5, 82], [31, 90], [31.5, 98]],
            },
        },
        {
            id: 'dem-tresillo', kind: 'drums', style: 'dembow', bars: 1,
            name: 'Tresillo kick',
            note: 'Three, three, two — the figure underneath half the music on earth.',
            hits: { 36: [0, 6, 12], 38: [4, 12], 42: 'every16', 37: [3, 11] },
        },
        {
            id: 'dem-chords', kind: 'chords', style: 'dembow', bars: 2,
            name: 'Reggaeton keys',
            note: 'i VI III VII, in the tresillo.',
            chords: 'dem', every: 8,
            comp: [[0, 2.5, 88], [3, 2.5, 78], [6, 2, 82]],
        },
        {
            id: 'dem-bass', kind: 'bass', style: 'dembow', bars: 2,
            name: 'Dembow bass',
            note: 'Under Reggaeton keys. Three, three, two, with the kick.',
            follow: 'dem', every: 8,
            line: [[0, 3, 0, 106], [3, 2.5, 0, 90], [6, 2, 'f', 90]],
        },
        {
            id: 'dem-lead', kind: 'melody', style: 'dembow', bars: 2,
            name: 'Reggaeton lead',
            note: 'Over Reggaeton keys. The rhythm of the drums, sung.',
            notes: [[0, 2, 12], [3, 2, 12], [6, 2, 15],
                    [8, 2, 15], [11, 2, 12], [14, 2, 8],
                    [16, 2, 7], [19, 2, 10], [22, 2, 15],
                    [24, 2, 14], [27, 2, 10], [30, 2, 14]],
        },

        // ── Hip hop ───────────────────────────────────────────────────────
        {
            id: 'hh-boom', kind: 'drums', style: 'hiphop', bars: 1,
            name: 'Boom bap',
            note: 'Kick, snare, ghost notes swung late. Head-nod.',
            hits: {
                36: [0, 7, 10], 38: [4, 12, [7, 34], [15, 40]],
                42: [0, 2, 4, 6, 8, 10, 12, 14], 44: [[3, 42], [11, 42]],
            },
        },
        {
            id: 'hh-laid', kind: 'drums', style: 'hiphop', bars: 2,
            name: 'Laid back',
            note: 'The snare a hair behind the beat — written in, not left to swing.',
            hits: {
                36: [0, 10, 16, 22, 26],
                38: [4 + 2 / 24, 12 + 2 / 24, 20 + 2 / 24, 28 + 2 / 24, [27, 36]],
                42: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
                46: [[14, 80, 2], [30, 80, 2]],
            },
        },
        {
            id: 'hh-chords', kind: 'chords', style: 'hiphop', bars: 2,
            name: 'Dusty minor',
            note: 'i9 iv7 VImaj7 V7, held and low. Let it be muddy.',
            chords: 'hh', vel: 74, oct: -1,
        },
        {
            id: 'hh-keys', kind: 'guitar', style: 'hiphop', bars: 2,
            name: 'Rhodes figure',
            note: 'The same chords, comped loose. Behind the beat if you swing it.',
            chords: 'hh', every: 16,
            comp: [[0, 3, 82], [6, 1.5, 68], [10, 2, 76]],
        },
        {
            id: 'hh-bass', kind: 'bass', style: 'hiphop', bars: 2,
            name: 'Boom bap bass',
            note: 'Under Dusty minor. With the kick, then out of its way.',
            follow: 'hh', every: 16,
            line: [[0, 4, 0, 104], [7, 1, 0, 80], [10, 3, 'f', 92], [14, 2, 'o', 82]],
        },
        {
            id: 'hh-lead', kind: 'melody', style: 'hiphop', bars: 2,
            name: 'Soul sample',
            note: 'Over Dusty minor. The kind of line you would chop from a record.',
            notes: [[0, 3, 15], [4, 2, 14], [6, 2, 10], [8, 4, 12], [12, 2, 8], [14, 2, 12],
                    [16, 3, 15], [20, 2, 19], [22, 2, 15], [24, 4, 12], [28, 2, 11], [30, 2, 14]],
        },

        // ── Trap ──────────────────────────────────────────────────────────
        {
            id: 'trap-basic', kind: 'drums', style: 'trap', bars: 1,
            name: 'Trap',
            note: 'Clap on three, hats on eighths, a triplet flick at the end.',
            hits: {
                36: [0, 6, 11], 39: [8],
                42: [0, 2, 4, 6, 8, 10, [12, 72], [12 + 2 / 3, 64], [13 + 1 / 3, 70], 14],
                46: [[15, 80, 1]],
            },
        },
        {
            id: 'trap-rolls', kind: 'drums', style: 'trap', bars: 2,
            name: 'Trap with rolls',
            note: 'Triplet rolls and thirty-seconds — the hats are the genre.',
            hits: {
                36: [0, 6, 11, 16, 19, 27], 39: [8, 24],
                42: [0, 2, 4, 6, 8, 10, [12, 70], [12 + 2 / 3, 62], [13 + 1 / 3, 68],
                     [14, 66], [14.5, 70], [15, 76], [15.5, 82],
                     16, 18, 20, 22, 24, 26,
                     [28, 64], [28 + 2 / 3, 68], [29 + 1 / 3, 72], [30, 76], [30 + 2 / 3, 80], [31 + 1 / 3, 86]],
                46: [[23, 80, 1]],
            },
        },
        {
            id: 'trap-808kit', kind: 'drums', style: 'trap', bars: 2,
            name: '808 kick',
            note: 'The low kick drawn long so it rings — stretch or shorten each one to taste.',
            hits: {
                35: [[0, 112, 6], [7, 100, 3], [11, 104, 5], [16, 112, 3], [19, 100, 5], [27, 104, 5]],
                39: [8, 24],
                42: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26,
                     [28, 66], [28.5, 70], [29, 74], [29.5, 78], [30, 82], [31, 86]],
            },
        },
        {
            id: 'trap-chords', kind: 'chords', style: 'trap', bars: 2,
            name: 'Dark minor',
            note: 'i bII VI v. The flat second is the whole trick.',
            chords: 'trap', vel: 78,
        },
        {
            id: 'trap-808', kind: 'bass', style: 'trap', bars: 2,
            name: '808 line',
            note: 'Under Dark minor. Long notes; let them ring into each other.',
            notes: [[0, 6, 0, 110], [6, 4, 0, 100], [10, 2, 12, 90], [12, 4, 1, 104],
                    [16, 6, -4, 108], [22, 2, -4, 96], [24, 6, -5, 106], [30, 2, -2, 94]],
        },
        {
            id: 'trap-bell', kind: 'melody', style: 'trap', bars: 2,
            name: 'Bell motif',
            note: 'Over Dark minor. Three notes, repeated until they mean something, then a triplet.',
            notes: [[0, 1.5, 12], [2, 1.5, 15], [4, 1.5, 19], [6, 1.5, 15],
                    [8, 1.5, 12], [10, 1.5, 15], [12, 2, 13], [14, 2, 17],
                    [16, 1.5, 15], [18, 1.5, 12], [20, 1.5, 8], [22, 1.5, 12],
                    [24, 1.5, 14], [26, 1.5, 10],
                    [28, 2 / 3, 10], [28 + 2 / 3, 2 / 3, 12], [29 + 1 / 3, 2 / 3, 14], [30, 2, 15]],
        },

        // ── House ─────────────────────────────────────────────────────────
        {
            id: 'house-four', kind: 'drums', style: 'house', bars: 1,
            name: 'Four to the floor',
            note: 'The oldest one in the book, and still right.',
            hits: {
                36: [0, 4, 8, 12], 39: [4, 12],
                46: [[2, 84, 2], [6, 84, 2], [10, 84, 2], [14, 84, 2]],
                42: [0, 4, 8, 12],
            },
        },
        {
            id: 'house-perc', kind: 'drums', style: 'house', bars: 2,
            name: 'House with percussion',
            note: 'The kick never changes; everything around it does.',
            hits: {
                36: [0, 4, 8, 12, 16, 20, 24, 28],
                39: [4, 12, 20, 28],
                46: [[2, 82, 2], [6, 82, 2], [10, 82, 2], [14, 82, 2],
                     [18, 82, 2], [22, 82, 2], [26, 82, 2], [30, 82, 2]],
                42: 'every16x2',
                37: [3, 9, 15, 19, 25, 31],
            },
        },
        {
            id: 'house-swing', kind: 'drums', style: 'house', bars: 1, swing: 0.2,
            name: 'Swung house',
            note: 'The same floor with the sixteenths pushed late — the shuffle in garage and deep house.',
            hits: {
                36: [0, 4, 8, 12], 39: [4, 12],
                42: 'every16', 46: [[2, 82, 2], [6, 82, 2], [10, 82, 2], [14, 82, 2]],
                37: [3, 7, 13],
            },
        },
        {
            id: 'house-chords', kind: 'chords', style: 'house', bars: 2,
            name: 'House stabs',
            note: 'i9 VII VI iv7, short and off the beat. The chord is a percussion instrument here.',
            chords: 'house', every: 8,
            comp: [[2, 1.25, 92], [6, 1.25, 84]],
        },
        {
            id: 'house-organ', kind: 'chords', style: 'house', bars: 2,
            name: 'Organ chords',
            note: 'The same chords, held, for a pad or an organ.',
            chords: 'house', vel: 78,
        },
        {
            id: 'house-bass', kind: 'bass', style: 'house', bars: 2,
            name: 'Offbeat bass',
            note: 'Between the kicks, never on them, popping up the octave.',
            follow: 'house', every: 8,
            line: [[2, 1.5, 0, 102], [6, 1, 'o', 86], [7, 0.75, 0, 80]],
        },
        {
            id: 'house-riff', kind: 'melody', style: 'house', bars: 2,
            name: 'House piano riff',
            note: 'Over House stabs. Three notes answering each chord.',
            notes: [[2, 1, 14], [3, 1, 15], [6, 2, 19],
                    [10, 1, 17], [11, 1, 14], [14, 2, 10],
                    [18, 1, 12], [19, 1, 15], [22, 2, 19],
                    [26, 1, 12], [27, 1, 15], [30, 2, 17]],
        },

        // ── Gospel / soul ─────────────────────────────────────────────────
        {
            id: 'gos-shuffle', kind: 'drums', style: 'gospel', bars: 1, swing: 0,
            name: 'Gospel shuffle',
            note: 'A real twelve-eight: the ride on triplets, the snare laid back on two and four.',
            hits: {
                36: [0, 6 + 2 / 3, 8, 14 + 2 / 3],
                38: [4 + 1 / 24, 12 + 1 / 24, [10 + 2 / 3, 34], [14 + 2 / 3, 40]],
                51: [0, 2 + 2 / 3, 4, 6 + 2 / 3, 8, 10 + 2 / 3, 12, 14 + 2 / 3],
                44: [4, 12],
            },
        },
        {
            id: 'gos-straight', kind: 'drums', style: 'gospel', bars: 1,
            name: 'Gospel straight',
            note: 'Backbeat, hats on eighths, nothing clever.',
            hits: { 36: [0, 8, 10], 38: [4, 12], 42: [0, 2, 4, 6, 8, 10, 12, 14], 46: [[14, 82, 2]] },
        },
        {
            id: 'gos-chords', kind: 'chords', style: 'gospel', bars: 2,
            name: 'ii V i',
            note: 'The minor turnaround: half-diminished, a flat-nine dominant, home.',
            chords: 'gos', vel: 80, root: true,
        },
        {
            id: 'gos-church', kind: 'chords', style: 'gospel', bars: 2, mode: 'major', swing: 0,
            name: 'Church keys',
            note: 'I vi ii V in ninths, comped in triplets. The Sunday morning one.',
            chords: 'gosmaj', every: 4, root: true,
            comp: [[0, 2.5, 86], [2 + 2 / 3, 1.25, 68]],
        },
        {
            id: 'gos-bass', kind: 'bass', style: 'gospel', bars: 2,
            name: 'Walking up',
            note: 'Under ii V i. Walks into each chord from a semitone below.',
            follow: 'gos', every: 8,
            line: [[0, 4, 0, 100], [4, 2, 'f', 86], [6, 2, 'a', 84]],
        },
        {
            id: 'gos-lead', kind: 'melody', style: 'gospel', bars: 2,
            name: 'Gospel run',
            note: 'Over ii V i. Down the chord, through the flat nine, a triplet into home.',
            notes: [[0, 2, 17], [2, 1, 15], [3, 1, 14], [4, 1, 12], [5, 1, 8], [6, 2, 5],
                    [8, 1, 11], [9, 1, 14], [10, 1, 17], [11, 1, 20], [12, 4, 19],
                    [16, 3, 15], [19, 1, 14], [20, 2, 12],
                    [22, 2 / 3, 10], [22 + 2 / 3, 2 / 3, 12], [23 + 1 / 3, 2 / 3, 14],
                    [24, 6, 15], [30, 2, 14]],
        },

        // ── Percussion, for the African Percussion kit ───────────────────
        // Written to sit beside a drum track, not to replace it: each lands
        // on a drum track with this kit, and makes one if there is none.
        {
            id: 'perc-afro', kind: 'drums', style: 'afrobeats', bars: 2, kit: 64,
            name: 'Afrobeats percussion',
            note: 'Shaker, bells and djembe for over the kit. Lands on a Percussion track of its own.',
            hits: {
                70: 'every16x2',
                67: [0, 3, 6, 10, 12, 16, 19, 22, 26, 28],
                68: [8, 14, 24, 30],
                62: [7, 15, 23, 27, 31],
                63: [2, 11, 18, 26],
            },
        },
        {
            id: 'perc-bell', kind: 'drums', style: 'highlife', bars: 1, kit: 64, swing: 0,
            name: 'Twelve-eight bell',
            note: 'The West African timeline on the agogo, in triplets, the shekere on every pulse.',
            hits: {
                67: [0, 2.6667, 5.3333, 6.6667, 9.3333, 12, 14.6667],
                69: [0, 1.3333, 2.6667, 4, 5.3333, 6.6667, 8, 9.3333, 10.6667, 12, 13.3333, 14.6667],
                63: [4, 12],
                64: [0, 8],
            },
        },
        {
            id: 'perc-afh', kind: 'drums', style: 'afrohouse', bars: 2, kit: 64,
            name: 'Afro house percussion',
            note: 'Clave, congas on the djembe, the shaker running. Under a four-on-the-floor kit.',
            hits: {
                75: [0, 3, 6, 10, 12, 16, 19, 22, 26, 28],
                70: 'every16x2',
                63: [2, 5, 9, 13, 18, 21, 25, 29],
                62: [7, 15, 23, 30, 31],
                64: [0, 8, 16, 24],
            },
        },
        {
            id: 'perc-ama', kind: 'drums', style: 'amapiano', bars: 1, kit: 64,
            name: 'Amapiano shakers',
            note: 'The soft swung shaker and a woodblock answer, for under the log drum.',
            hits: { 70: 'every16', 69: [[2, 70, 2], [6, 66, 2], [10, 70, 2], [14, 66, 2]], 75: [3, 11], 60: [7, 15] },
        },
        {
            id: 'perc-talking', kind: 'drums', style: 'highlife', bars: 2, kit: 64,
            name: 'Bata and sakara',
            note: 'Talking drums and the frame drum in conversation. Busy — use it in a break.',
            hits: {
                60: [0, 3, 6, 9, 12, 14, 16, 19, 22, 28],
                61: [2, 8, 10, 18, 24, 26, 30],
                65: [4, 12, 20, 27],
                35: [0, 16],
                69: 'every16x2',
            },
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

    /// To the nearest MIDI tick — 24 to a step — so a triplet written as a
    /// third lands on a position the roll and the file can both say.
    fine(x) { return Math.round(x * 24) / 24; },

    /// A preset becomes a list of {pitch, vel, dur, tick}. Nothing here
    /// knows about riffs or tracks — that is the caller's business — so
    /// this stays testable and the same call serves preview and apply.
    ///
    /// `at` is the MIDI note the pitched material should sit around,
    /// `tonic` and `scale` the key it should be in. Drums ignore all three.
    realise(preset, opts) {
        const o = opts || {};
        if (!preset) return [];
        const out = preset.kind === 'drums'
            ? this.drumNotes(preset)
            : this.tunedNotes(preset, this.keyFor(preset, o.tonic | 0, o.scale),
                              o.at == null ? 60 : o.at);
        return this.feel(preset, out);
    },

    /// The tonic to write in. A minor preset in a major song goes to the
    /// relative minor and the other way about: the same seven notes, so
    /// it is in key rather than a third out.
    keyFor(preset, tonic, scale) {
        const mine = preset.mode || 'minor';
        const songMajor = scale === 'major';
        if (mine === 'minor' && songMajor) return tonic + 9;
        if (mine === 'major' && scale && !songMajor) return tonic + 3;
        return tonic;
    },

    /// The style's swing, written into the notes: every off-sixteenth goes
    /// late by the style's fraction of a step. Notes already off the grid
    /// were placed there on purpose and are left alone.
    feel(preset, notes) {
        const style = this.styleOf(preset.style);
        const swing = preset.swing != null ? preset.swing : (style ? style.swing : 0);
        const span = (preset.bars || 1) * 16;
        if (swing > 0) {
            for (const n of notes) {
                const k = Math.round(n.tick);
                if (Math.abs(n.tick - k) > 1e-6 || k % 2 !== 1) continue;
                const to = this.fine(n.tick + swing);
                if (to < span) n.tick = to;
            }
        }
        return notes.sort((a, b) => a.tick - b.tick);
    },

    drumNotes(preset) {
        const out = [];
        const span = (preset.bars || 1) * 16;
        const all = n => Array.from({ length: n }, (_, i) => i);
        for (const key of Object.keys(preset.hits || {})) {
            const pitch = +key;
            if (!Number.isInteger(pitch)) continue;
            let steps = preset.hits[key];
            if (steps === 'every16') steps = all(16);
            else if (steps === 'every16x2') steps = all(32);
            const hits = steps.map(h => (Array.isArray(h) ? h : [h]))
                              .filter(([s]) => s >= 0 && s < span)
                              .sort((a, b) => a[0] - b[0]);
            hits.forEach(([s, vel, dur], i) => {
                // A hit is a step long — or as long as the gap to the next
                // one, so a roll reads as a roll and not as one long smear.
                const gap = i + 1 < hits.length ? hits[i + 1][0] - s : 1;
                out.push({ pitch, vel: vel || this.weight(pitch, s),
                           dur: dur || this.fine(Math.max(1 / 6, Math.min(1, gap))), tick: this.fine(s) });
            });
        }
        return out;
    },

    /// Not everything at 100. A shaker that never varies sounds like a
    /// machine, and the downbeat of a bar is louder than the rest of it
    /// in every style here.
    weight(pitch, step) {
        const on = Math.abs(step - Math.round(step)) < 1e-6 ? Math.round(step) : -1;
        if (pitch === this.HAT) return on % 4 === 0 ? 92 : (on % 2 === 0 ? 76 : 58);
        if (pitch === this.RIDE) return on % 4 === 0 ? 90 : 68;
        if (pitch === this.RIM) return 70;
        if (pitch === this.OPEN) return 86;
        if (pitch === this.PEDAL) return 60;
        if (pitch === this.SHAKER || pitch === this.SHEKERE)
            return on % 4 === 0 ? 88 : (on % 2 === 0 ? 72 : 56);
        if (pitch === this.AGOGO_HI || pitch === this.AGOGO_LO) return on % 4 === 0 ? 92 : 80;
        if (pitch === this.DJ_SLAP) return 96;
        if (pitch === this.DJ_TONE) return 84;
        if (pitch === this.CLAVE) return 86;
        return on % 16 === 0 ? 110 : 100;
    },

    /// Voice a chord near the one before it. Every inversion, in every
    /// octave near home, is scored: how far it sits from where the hand
    /// was (and, more gently, from home, so a progression does not
    /// wander off the keyboard), and how muddy it is — a semitone rub or
    /// a close interval down low.
    ///
    /// A five-note chord leaves its root out, as a pianist would: the
    /// bass, or the left hand, has it, and five notes in one hand is a
    /// cluster rather than a chord.
    voice(root, shape, prev, home) {
        const base = (shape.length >= 5 ? shape.slice(1) : shape.slice()).sort((a, b) => a - b);
        const mean = v => v.reduce((a, b) => a + b, 0) / v.length;
        const target = prev ? mean(prev) * 0.6 + home * 0.4 : home;
        let best = null, bestCost = Infinity;
        for (let inv = 0; inv < base.length; inv++) {
            const v0 = base.map((s, i) => (i < inv ? s + 12 : s)).sort((a, b) => a - b);
            for (const shift of [-24, -12, 0, 12]) {
                const v = v0.map(s => root + s + shift);
                let cost = Math.abs(mean(v) - target);
                if (prev) {
                    let move = 0;
                    for (const p of v) move += Math.min(...prev.map(q => Math.abs(p - q)));
                    cost += move * 0.3;
                }
                for (let i = 1; i < v.length; i++) {
                    const gap = v[i] - v[i - 1];
                    if (gap === 1) cost += 6;
                    if (gap <= 4 && v[i - 1] < 52) cost += 3;
                    if (i > 1 && v[i] - v[i - 2] <= 3) cost += 3;   // three in a fist
                }
                if (cost < bestCost) { bestCost = cost; best = v; }
            }
        }
        return best;
    },

    /// Pitched material, placed in the key and in a sensible octave.
    ///
    /// `at` is where the instrument lives — the same number the piano roll
    /// uses to decide what to show. A bass preset ignores it and sits round
    /// E2 wherever it is put: a bass line on a piano track is still a bass
    /// line, and one written an octave up from wherever it landed is not.
    tunedNotes(preset, tonic, at) {
        if (preset.kind === 'bass') at = 40;
        const out = [];
        const span = (preset.bars || 1) * 16;
        // The tonic nearest the instrument's home, so a preset is in the
        // right key AND in the right register.
        let root = ((tonic % 12) + 12) % 12;
        root += Math.round((at - root) / 12) * 12;
        root += (preset.oct || 0) * 12;

        const push = (tick, dur, pitch, vel) => {
            if (tick < 0 || tick >= span || pitch < 0 || pitch > 127) return;
            out.push({ pitch, vel: Math.max(1, Math.min(127, Math.round(vel))),
                       dur: this.fine(Math.max(0.25, Math.min(dur, span - tick))),
                       tick: this.fine(tick) });
        };
        const accent = tick => (tick % 16 === 0 ? 104 : tick % 4 === 0 ? 96 : 88);

        // Chords: voiced, then held, comped or broken up.
        const prog = typeof preset.chords === 'string' ? this.PROG[preset.chords] : null;
        if (prog) {
            let prev = null;
            for (const [tick, dur, r, shapeName] of prog) {
                if (tick >= span) continue;
                const v = this.voice(root + r, this[shapeName] || this.MIN, prev, root + 7);
                prev = v;
                const low = root + r - (r > 6 ? 24 : 12);   // the left hand
                const end = tick + dur;
                if (preset.arp) {
                    const a = preset.arp, rate = a.rate || 1, acc = a.accent || [90, 76];
                    let k = 0;
                    for (let s = tick; s < end - 1e-6; s += rate, k++) {
                        const i = a.order[k % a.order.length];
                        const pitch = v[i % v.length] + 12 * Math.floor(i / v.length);
                        push(s, Math.min(a.len || rate, end - s), pitch, acc[k % acc.length]);
                    }
                    if (preset.root) push(tick, dur, low, 84);
                } else if (preset.comp) {
                    const every = preset.every || dur;
                    for (let b = tick; b < end - 1e-6; b += every)
                        for (const [off, len, vel] of preset.comp) {
                            const s = b + off;
                            if (s >= end - 1e-6) continue;
                            for (const p of v) push(s, Math.min(len, end - s), p, vel);
                            if (preset.root) push(s, Math.min(len, end - s), low, vel);
                        }
                } else {
                    for (const p of v) push(tick, dur, p, preset.vel || 82);
                    if (preset.root) push(tick, dur, low, (preset.vel || 82) + 6);
                }
            }
        } else if (Array.isArray(preset.chords)) {
            // The old form, a chord list written out: kept for anything
            // saved that still uses it.
            for (const [tick, dur, r, shapeName] of preset.chords)
                for (const s of this[shapeName] || this.MIN) push(tick, dur, root + r + s, 84);
        }

        // A bass line written once and played under every chord, each time
        // from that chord's root — kept within a sixth either side of the
        // key's root, so it does not climb with the progression.
        const follow = preset.follow ? this.PROG[preset.follow] : null;
        if (follow) {
            const near = r => (r > 6 ? r - 12 : r);
            follow.forEach(([tick, dur, r, shapeName], i) => {
                const shape = this[shapeName] || this.MIN;
                const next = near(follow[(i + 1) % follow.length][2]);
                const iv = { t: shape[1], f: shape[2], o: 12 };
                const end = tick + dur, every = preset.every || dur;
                for (let b = tick; b < end - 1e-6; b += every)
                    for (const [off, len, step, vel] of preset.line) {
                        const s = b + off;
                        if (s >= end - 1e-6) continue;
                        const pitch = step === 'n' ? root + next
                                    : step === 'a' ? root + next - 1
                                    : root + near(r) + (iv[step] != null ? iv[step] : step);
                        push(s, Math.min(len, end - s + (step === 'n' || step === 'a' ? 1 : 0)),
                             pitch, vel || accent(s));
                    }
            });
        }

        for (const [tick, dur, semis, vel] of (preset.notes || []))
            push(tick, dur, root + semis, vel || accent(tick));
        return out;
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Presets };
