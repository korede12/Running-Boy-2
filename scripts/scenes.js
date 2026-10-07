// ── Where you are ─────────────────────────────────────────────────────────
// The Home tab used to show your bed whatever you were doing, which made it
// a picture of your housing rather than a picture of you. It shows the place
// you are standing now: the market if you are at the market, the arcade if
// you are at the arcade, and your room only when you are in it.
//
// Every scene is the same street: a strip of sky, a building front, a
// pavement, and you standing on it. What changes is the front and the props,
// which is enough to tell them apart at a glance without drawing twenty
// unrelated pictures.

const Scene = {

    W: 320,
    H: 190,

    /// What to draw for the player right now.
    svg(p) {
        const v = (typeof Player !== 'undefined') ? Player.atVenue() : null;
        if (!v) return Room.svg(p.housing, p);
        return this._street(v, p);
    },

    /// A one-line caption for the scene.
    caption(p) {
        const v = (typeof Player !== 'undefined') ? Player.atVenue() : null;
        return v ? v.name : Player.spot();
    },

    // ── The street ────────────────────────────────────────────────────────

    _street(v, p) {
        const hour = Player.hourOfDay();
        const night = hour < 6 || hour >= 19;
        const sky = night
            ? ['#141a2c', '#242c42']
            : (hour < 9 || hour >= 17 ? ['#4a3a52', '#8a5f52'] : ['#3f5b85', '#7fa0c0']);
        const roof = v.roof || '#2874a6';
        const lit = night || hour < 8;

        return `<svg viewBox="0 0 ${this.W} ${this.H}" class="room-svg" ` +
            `preserveAspectRatio="xMidYMax slice" role="img" aria-label="${v.name}">` +
            `<defs><linearGradient id="scSky" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/>` +
            `</linearGradient></defs>` +

            `<rect width="320" height="190" fill="url(#scSky)"/>` +
            this._skyline(night) +
            this._front(v, roof, lit) +
            `<rect y="150" width="320" height="40" fill="${night ? '#2a2a33' : '#3d3d47'}"/>` +
            `<rect y="150" width="320" height="3" fill="${night ? '#35353f' : '#4a4a55'}"/>` +
            this._props(v, p, night) +
            Room._figure(this._standX(v), 168, 1.05, false) +
            this._sign(v, roof, lit) +
            '</svg>';
    },

    /// Where the figure stands, so it never sits on top of the props.
    _standX(v) {
        return ({ shop: 236, market: 236, play: 60, work: 250, travel: 64 }[v.kind]) || 60;
    },

    _skyline(night) {
        let g = '';
        const bars = [[8, 64, 30], [44, 52, 22], [72, 76, 26], [104, 46, 20],
                      [206, 58, 24], [238, 80, 30], [276, 50, 22]];
        for (const [x, h, w] of bars) {
            g += `<rect x="${x}" y="${100 - h}" width="${w}" height="${h}" ` +
                 `fill="${night ? '#1b2134' : '#56657f'}" opacity="0.85"/>`;
            if (night) {
                for (let i = 0; i < 3; i++)
                    g += `<rect x="${x + 4 + (i % 2) * 9}" y="${106 - h + i * 11}" width="4" height="5" fill="#ffd98a" opacity="0.6"/>`;
            }
        }
        return g;
    },

    /// The building you are standing in front of.
    _front(v, roof, lit) {
        const wide = v.kind === 'shop' || v.id === 'market' || v.id === 'itoku';
        const x = wide ? 96 : 118, w = wide ? 208 : 186;
        let g = `<rect x="${x}" y="54" width="${w}" height="98" fill="#2b2b36"/>`;
        g += `<rect x="${x - 6}" y="46" width="${w + 12}" height="12" rx="2" fill="${roof}"/>`;
        // Windows, lit or not.
        for (let r = 0; r < 2; r++)
            for (let c = 0; c < 4; c++) {
                const wx = x + 14 + c * ((w - 28) / 4), wy = 68 + r * 30;
                g += `<rect x="${wx}" y="${wy}" width="22" height="18" rx="2" ` +
                     `fill="${lit ? '#ffd98a' : '#1a2432'}" opacity="${lit ? 0.75 : 0.9}"/>`;
            }
        // The doorway.
        g += `<rect x="${x + w / 2 - 20}" y="112" width="40" height="40" rx="3" fill="#15151d"/>`;
        g += `<rect x="${x + w / 2 - 20}" y="112" width="40" height="5" fill="${roof}" opacity="0.7"/>`;
        return g;
    },

    /// The hanging sign, which is what actually names the place.
    _sign(v, roof, lit) {
        const label = (v.tag || v.name).slice(0, 16).toUpperCase();
        const w = Math.max(74, label.length * 8 + 20);
        return `<g transform="translate(160 36)">` +
            `<rect x="${-w / 2}" y="-13" width="${w}" height="26" rx="5" fill="#10101a" ` +
            `stroke="${roof}" stroke-width="2.5"/>` +
            (lit ? `<rect x="${-w / 2}" y="-13" width="${w}" height="26" rx="5" fill="${roof}" opacity="0.16"/>` : '') +
            `<text x="0" y="5" text-anchor="middle" font-family="monospace" font-size="11" ` +
            `letter-spacing="1.4" fill="${roof}">${label}</text></g>`;
    },

    // ── What is outside each kind of place ────────────────────────────────

    _props(v, p, night) {
        if (v.id === 'market' || v.id === 'itoku') return this._stalls(night);
        if (v.kind === 'play' && v.mode === 'fight')  return this._club(night);
        if (v.mode === 'chase')  return this._span(night);
        if (v.kind === 'play')   return this._arcade(night);
        if (v.kind === 'hotel')  return this._hotel();
        if (v.kind === 'clinic') return this._clinic();
        if (v.kind === 'work')   return this._yard();
        if (v.kind === 'travel') return this._danfo();
        return this._generic(v);
    },

    /// Umbrellas, crates and a trader. A market is people, not a shopfront.
    _stalls(night) {
        let g = '';
        const cols = ['#c0392b', '#2874a6', '#c8912e'];
        for (let i = 0; i < 3; i++) {
            const x = 28 + i * 62;
            g += `<path d="M${x - 26} 118 L${x} 100 L${x + 26} 118 Z" fill="${cols[i]}"/>`;
            g += `<rect x="${x - 2}" y="118" width="4" height="30" fill="#4a3f2e"/>`;
            g += `<rect x="${x - 24}" y="128" width="48" height="20" rx="2" fill="#5a4a34"/>`;
            for (let k = 0; k < 3; k++)
                g += `<circle cx="${x - 14 + k * 14}" cy="${126}" r="4.5" ` +
                     `fill="${['#d8a33a', '#8ab04a', '#c0563a'][k]}"/>`;
        }
        g += Room._figure(150, 152, 0.8, false);
        return g;
    },

    /// Cabinets with their screens on. The arcade is the light.
    _arcade(night) {
        let g = '';
        for (let i = 0; i < 3; i++) {
            const x = 196 + i * 40;
            g += `<rect x="${x}" y="104" width="30" height="46" rx="3" fill="#24242f"/>`;
            g += `<rect x="${x + 4}" y="110" width="22" height="16" rx="2" fill="#4fd1ff" opacity="0.85"/>`;
            g += `<rect x="${x + 7}" y="132" width="6" height="6" rx="1" fill="#e8c23a"/>`;
            g += `<rect x="${x + 17}" y="132" width="6" height="6" rx="1" fill="#c0392b"/>`;
        }
        g += `<ellipse cx="236" cy="150" rx="66" ry="10" fill="#4fd1ff" opacity="0.1"/>`;
        return g;
    },

    /// Speakers, a rope and somebody already queueing.
    _club(night) {
        let g = '';
        for (const x of [196, 272]) {
            g += `<rect x="${x}" y="98" width="26" height="52" rx="3" fill="#1d1d26"/>`;
            g += `<circle cx="${x + 13}" cy="114" r="8" fill="#33333f"/>`;
            g += `<circle cx="${x + 13}" cy="136" r="5" fill="#33333f"/>`;
        }
        g += `<path d="M228 120 L240 92 L252 120 Z" fill="#c0392b" opacity="0.45"/>`;
        g += `<path d="M236 122 L248 94 L260 122 Z" fill="#8e44ad" opacity="0.4"/>`;
        g += `<rect x="228" y="138" width="40" height="4" rx="2" fill="#c8912e"/>`;
        g += Room._figure(252, 152, 0.74, false);
        return g;
    },

    /// A bridge is a road over water, not an arcade. These are the places
    /// the chase starts, and they were being drawn with cabinets outside.
    _span(night) {
        let g = `<rect y="104" width="320" height="46" fill="${night ? '#17202e' : '#2f4a63'}"/>`;
        for (let i = 0; i < 9; i++)
            g += `<rect x="${i * 38}" y="${112 + (i % 3) * 7}" width="22" height="3" rx="1.5" fill="#56708a" opacity="0.5"/>`;
        g += '<rect y="140" width="320" height="12" fill="#3a3a46"/>';
        g += '<rect y="138" width="320" height="4" fill="#4e4e5a"/>';
        for (let i = 0; i < 8; i++)
            g += `<rect x="${8 + i * 42}" y="144" width="20" height="4" fill="#d8d2a8"/>`;
        // The railing you run along.
        for (let i = 0; i < 11; i++)
            g += `<rect x="${i * 31}" y="118" width="4" height="24" fill="#4a4a56"/>`;
        g += '<rect y="116" width="320" height="4" fill="#5a5a66"/>';
        return g;
    },

    _hotel() {
        return `<rect x="206" y="118" width="54" height="32" rx="3" fill="#2f3a4a"/>` +
            `<rect x="212" y="124" width="42" height="6" rx="2" fill="#44546a"/>` +
            `<g opacity="0.9">` +
            `<rect x="214" y="134" width="7" height="10" rx="2" fill="#c8912e"/>` +
            `<rect x="226" y="134" width="7" height="10" rx="2" fill="#c8912e"/>` +
            `<rect x="238" y="134" width="7" height="10" rx="2" fill="#c8912e"/></g>` +
            `<text x="233" y="114" text-anchor="middle" font-family="monospace" font-size="8" ` +
            `fill="#8b93a6" letter-spacing="1">RECEPTION</text>`;
    },

    _clinic() {
        return `<rect x="204" y="126" width="56" height="10" rx="3" fill="#4a4a56"/>` +
            `<rect x="208" y="136" width="5" height="14" fill="#3a3a46"/>` +
            `<rect x="251" y="136" width="5" height="14" fill="#3a3a46"/>` +
            `<g transform="translate(284 122)">` +
            `<rect x="-3" y="-10" width="6" height="20" fill="#e8e3d6"/>` +
            `<rect x="-10" y="-3" width="20" height="6" fill="#e8e3d6"/></g>` +
            `<rect x="276" y="132" width="3" height="18" fill="#55555f"/>` +
            Room._figure(224, 150, 0.68, false);
    },

    /// Men waiting for a day's work, and the truck that takes them.
    _yard() {
        let g = `<rect x="20" y="112" width="86" height="30" rx="4" fill="#5b6b7a"/>` +
            `<rect x="20" y="104" width="52" height="12" rx="3" fill="#44525e"/>` +
            `<circle cx="40" cy="146" r="9" fill="#15151d"/>` +
            `<circle cx="90" cy="146" r="9" fill="#15151d"/>`;
        for (let i = 0; i < 3; i++) g += Room._figure(132 + i * 22, 152, 0.62, false);
        g += `<rect x="178" y="118" width="26" height="32" rx="2" fill="#4a3f2e"/>` +
             `<rect x="181" y="122" width="20" height="3" fill="#8b7a5a"/>` +
             `<rect x="181" y="128" width="20" height="3" fill="#8b7a5a"/>` +
             `<rect x="181" y="134" width="14" height="3" fill="#8b7a5a"/>`;
        return g;
    },

    _danfo() {
        return `<rect x="150" y="106" width="130" height="40" rx="6" fill="#e8b31c"/>` +
            `<rect x="150" y="126" width="130" height="8" fill="#1b1b20"/>` +
            `<rect x="160" y="112" width="28" height="13" rx="2" fill="#2b3a44"/>` +
            `<rect x="196" y="112" width="28" height="13" rx="2" fill="#2b3a44"/>` +
            `<rect x="232" y="112" width="28" height="13" rx="2" fill="#2b3a44"/>` +
            `<circle cx="178" cy="148" r="10" fill="#15151d"/>` +
            `<circle cx="252" cy="148" r="10" fill="#15151d"/>`;
    },

    /// Anything else: a board outside, which is what these places are.
    _generic(v) {
        return `<rect x="206" y="112" width="58" height="38" rx="3" fill="#2f2f3a"/>` +
            `<rect x="212" y="118" width="46" height="4" fill="#5f6a80"/>` +
            `<rect x="212" y="126" width="46" height="4" fill="#5f6a80"/>` +
            `<rect x="212" y="134" width="30" height="4" fill="#5f6a80"/>` +
            `<g transform="translate(235 98) scale(1.1)" fill="#8b93a6" fill-rule="evenodd">` +
            `<path d="${(typeof MAP_ICONS !== 'undefined' && MAP_ICONS[v.icon]) || ''}"/></g>`;
    },
};
