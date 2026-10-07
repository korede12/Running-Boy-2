// ── Venues ────────────────────────────────────────────────────────────────
// The map is the home screen, and where you go decides what you play. That
// splits two things that used to be one: the character says who you are, the
// venue says what happens there.
//
// A venue either starts a run (`mode`) or opens one of the existing panels
// (`modal`). `characters` lists who the place will take — the street will run
// with anyone, but the bridge and the club need art only Portable has, so
// picking them skips the chooser rather than offering a character that would
// not draw.

const VENUES = [
    {
        id: 'home', name: 'Your Place', kind: 'open', modal: 'name-modal',
        x: 196, y: 128, icon: 'home',
        blurb: 'Set the name you run under.',
    },
    {
        id: 'hall', name: 'Hall of Fame', kind: 'open', modal: 'hs-modal',
        x: 405, y: 158, icon: 'cup',
        blurb: 'Who has run the furthest.',
    },
    {
        id: 'bridge', name: 'Third Mainland', kind: 'play', mode: 'chase',
        x: 722, y: 132, icon: 'chase', characters: ['portable'],
        blurb: 'Three lanes, and someone on your heels.',
        tag: 'CHASE',
    },
    {
        id: 'street', name: 'Oshodi Street', kind: 'play', mode: 'run',
        x: 258, y: 312, icon: 'run',
        characters: ['skeleton', 'kolu', 'kenney_green', 'kenney_purple', 'stick'],
        blurb: 'Keep running. Jump what gets in the way.',
        tag: 'RUN',
    },
    {
        id: 'cinema', name: 'Silverbird', kind: 'open', modal: 'about-modal',
        x: 648, y: 334, icon: 'film',
        blurb: 'The story so far.',
    },
    {
        id: 'club', name: 'Club Zazuu', kind: 'play', mode: 'fight',
        x: 524, y: 438, icon: 'fist', characters: ['portable'],
        blurb: 'One on one, best of three.',
        tag: 'FIGHT',
    },
    {
        id: 'market', name: 'Balogun Market', kind: 'open', modal: 'market-modal',
        x: 168, y: 472, icon: 'cart',
        blurb: 'Skubu, and what it buys.',
    },
];

const VENUE_BY_ID = VENUES.reduce((m, v) => (m[v.id] = v, m), {});

function getVenue(id) { return VENUE_BY_ID[id] || null; }

/// Which scene a venue wants. Falls back to the character's own mode so a
/// saved game from before the map still starts the right thing.
function resolveMode(venueId, characterId) {
    const v = getVenue(venueId);
    if (v && v.mode) return v.mode;
    const t = (typeof getTheme === 'function') ? getTheme(characterId) : null;
    if (t && t.mode) return t.mode;
    return 'run';
}

/// Characters a venue will take, in the order the picker should show them.
function venueCharacters(venueId) {
    const v = getVenue(venueId);
    if (!v) return Object.keys(typeof THEMES !== 'undefined' ? THEMES : {});
    if (v.characters) return v.characters.slice();
    return Object.keys(typeof THEMES !== 'undefined' ? THEMES : {});
}
