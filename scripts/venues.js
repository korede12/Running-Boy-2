// ── Cities and venues ─────────────────────────────────────────────────────
// The map is the home screen, and where you go decides what you play. That
// splits two things that used to be one: the character says who you are, the
// venue says what happens there.
//
// There is more than one city now, and you travel between them by road — each
// has an expressway running off the edge of its grid toward the other, with
// the slip road as a venue you can go to. Venue ids are unique across every
// city, so the game page can look up where it was sent without needing to
// know which city sent it.
//
// gx/gy are tiles on that city's grid; gw/gd the footprint in tiles.
//
// A venue starts a run (`mode`), opens a panel (`modal`), or leaves town
// (`to`). `characters` lists who the place will take — a street will run with
// anyone, but a chase and a fight need art only Portable has, so picking
// those skips a chooser that would have had one option.

const RUNNERS = ['skeleton', 'kolu', 'kenney_green', 'kenney_purple', 'stick'];

const CITIES = [
    {
        id: 'lagos', name: 'Lagos', tag: 'the mainland',
        grid: 24,
        roadsGX: [4, 10, 16], roadsGY: [4, 11, 18],
        // The lagoon takes everything past this column; one road crosses it.
        water: { from: 19, bridgeGY: 11 },
        // The expressway, carried off the top of the grid toward Abeokuta.
        exit: { axis: 'gx', at: 10, from: -5, to: -1 },
        venues: [
            { id: 'home', name: 'Your Place', kind: 'open', modal: 'name-modal',
              gx: 1,  gy: 1,  gw: 2, gd: 2, icon: 'home',
              blurb: 'Set the name you run under.' },

            { id: 'hall', name: 'Hall of Fame', kind: 'open', modal: 'hs-modal',
              gx: 5,  gy: 1,  gw: 2, gd: 2, icon: 'cup',
              blurb: 'Who has run the furthest.' },

            { id: 'exit_abk', name: 'Abeokuta Expressway', kind: 'travel', to: 'abeokuta',
              gx: 11, gy: 0,  gw: 2, gd: 1, vh: 70, icon: 'road', roof: '#1f7a4d',
              blurb: 'Out of town, north.', tag: 'TRAVEL' },

            { id: 'studio', name: 'Naijabeats', kind: 'open', modal: 'about-modal',
              gx: 12, gy: 6,  gw: 2, gd: 2, icon: 'music', roof: '#6a4d93',
              blurb: 'Where the story got told. And who is telling it.' },

            { id: 'street', name: 'Oshodi Street', kind: 'play', mode: 'run',
              gx: 6,  gy: 6,  gw: 2, gd: 2, icon: 'run', characters: RUNNERS,
              blurb: 'Keep running. Jump what gets in the way.', tag: 'RUN' },

            { id: 'bridge', name: 'Third Mainland', kind: 'play', mode: 'chase',
              gx: 17, gy: 12, gw: 2, gd: 2, vh: 92, icon: 'chase',
              characters: ['portable'],
              blurb: 'Three lanes, and someone on your heels.', tag: 'CHASE' },

            { id: 'club', name: 'Club Zazuu', kind: 'play', mode: 'fight',
              gx: 6,  gy: 13, gw: 2, gd: 2, icon: 'fist', characters: ['portable'],
              blurb: 'One on one, best of three.', tag: 'FIGHT' },

            { id: 'market', name: 'Balogun Market', kind: 'open', modal: 'market-modal',
              gx: 1,  gy: 13, gw: 2, gd: 2, icon: 'cart',
              blurb: 'Skubu, and what it buys.' },
        ],
    },

    {
        id: 'abeokuta', name: 'Abeokuta', tag: 'under the rock',
        grid: 21,
        roadsGX: [6, 13], roadsGY: [6, 14],
        // The Ogun runs as a diagonal band. Wherever a road meets it there is
        // a bridge, which falls out of the geometry rather than being placed.
        river: { lo: 4, hi: 6 },
        // Olumo, and the outcrops the town is built around.
        rocks: [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [2, 3], [3, 3],
                [17, 18], [18, 18], [18, 19], [10, 10], [11, 10]],
        exit: { axis: 'gy', at: 14, from: 21, to: 25 },
        venues: [
            { id: 'palace', name: 'Ake Palace', kind: 'open', modal: 'name-modal',
              gx: 15, gy: 1, gw: 2, gd: 2, icon: 'home', roof: '#c8912e',
              blurb: 'Set the name you run under.' },

            { id: 'centenary', name: 'Centenary Hall', kind: 'open', modal: 'hs-modal',
              gx: 9,  gy: 1, gw: 2, gd: 2, icon: 'cup',
              blurb: 'Who has run the furthest.' },

            { id: 'olumo', name: 'Olumo Rock', kind: 'play', mode: 'run',
              gx: 1,  gy: 8, gw: 2, gd: 2, vh: 132, icon: 'run',
              characters: RUNNERS, roof: '#7d6f5c',
              blurb: 'Down off the rock, and keep going.', tag: 'RUN' },

            { id: 'lafenwa', name: 'Lafenwa Bridge', kind: 'play', mode: 'chase',
              gx: 15, gy: 9, gw: 2, gd: 2, vh: 92, icon: 'chase',
              characters: ['portable'],
              blurb: 'Over the Ogun, with someone behind you.', tag: 'CHASE' },

            { id: 'kuto', name: 'Kuto Arena', kind: 'play', mode: 'fight',
              gx: 9,  gy: 16, gw: 2, gd: 2, icon: 'fist', characters: ['portable'],
              blurb: 'One on one, best of three.', tag: 'FIGHT' },

            { id: 'itoku', name: 'Itoku Market', kind: 'open', modal: 'market-modal',
              gx: 2,  gy: 16, gw: 2, gd: 2, icon: 'cart', roof: '#2874a6',
              blurb: 'Adire, skubu, and what it buys.' },

            { id: 'exit_lag', name: 'Lagos Expressway', kind: 'travel', to: 'lagos',
              gx: 19, gy: 15, gw: 2, gd: 1, vh: 70, icon: 'road', roof: '#1f7a4d',
              blurb: 'Back down to the coast.', tag: 'TRAVEL' },
        ],
    },
];

const CITY_BY_ID  = CITIES.reduce((m, c) => (m[c.id] = c, m), {});
const VENUE_BY_ID = {};
const VENUE_CITY  = {};
for (const c of CITIES) {
    for (const v of c.venues) { VENUE_BY_ID[v.id] = v; VENUE_CITY[v.id] = c.id; }
}

function getVenue(id) { return VENUE_BY_ID[id] || null; }
function getCity(id)  { return CITY_BY_ID[id] || CITIES[0]; }

/// The city the player is looking at. Falls back to the city holding the
/// venue they last played, so coming back from a run lands where they left.
function currentCityId() {
    try {
        const c = localStorage.getItem('runningboy_city');
        if (c && CITY_BY_ID[c]) return c;
        const v = localStorage.getItem('runningboy_venue');
        if (v && VENUE_CITY[v]) return VENUE_CITY[v];
    } catch (_) {}
    return CITIES[0].id;
}

/// Which scene a venue wants. Falls back to the character's own mode so a
/// save from before the map still starts the right thing.
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
    if (v && v.characters) return v.characters.slice();
    return Object.keys(typeof THEMES !== 'undefined' ? THEMES : {});
}
