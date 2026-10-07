// ── Avatars ───────────────────────────────────────────────────────────────
// One description of a person, drawn two ways: as SVG for the menus, and —
// through Runner's skin table — as the figure you actually run as. Keeping
// one spec means the character you picked is the character you play.
//
// A spec is { build, skin, hair, hairCol, top, legs, shoes }.

const AVATAR_OPTIONS = {
    build: [
        { id: 'm',  label: 'Male' },
        { id: 'f',  label: 'Female' },
        { id: 'nb', label: 'Other' },
    ],
    skin: ['#6b4423', '#8a5a33', '#a9713f', '#5a3619', '#c58f5e', '#3f2715'],
    hair: [
        { id: 'short',  label: 'Short' },
        { id: 'dreads', label: 'Dreads' },
        { id: 'braids', label: 'Braids' },
        { id: 'afro',   label: 'Afro' },
        { id: 'cap',    label: 'Cap' },
        { id: 'scarf',  label: 'Headscarf' },
    ],
    hairCol: ['#241610', '#3fbf4f', '#f2d021', '#2f86e0', '#e8509c', '#b03a6e', '#e8e3d6'],
    top:     ['#f4f1e8', '#c0392b', '#2874a6', '#1f7a4d', '#f2c021', '#6a4d93', '#17171f'],
    legs:    ['#2b3c5e', '#1c2840', '#3a3a46', '#5b4023', '#17171f', '#6a4d93'],
    shoes:   ['#f4f1e8', '#17171f', '#c0392b', '#2874a6'],
};

const AVATAR_DEFAULT = {
    build: 'm', skin: '#8a5a33', hair: 'short', hairCol: '#241610',
    top: '#f4f1e8', legs: '#2b3c5e', shoes: '#f4f1e8',
};

const Avatar = {

    OPTIONS: AVATAR_OPTIONS,
    DEFAULT: AVATAR_DEFAULT,

    random() {
        const pick = a => a[Math.floor(Math.random() * a.length)];
        return {
            build:   pick(AVATAR_OPTIONS.build).id,
            skin:    pick(AVATAR_OPTIONS.skin),
            hair:    pick(AVATAR_OPTIONS.hair).id,
            hairCol: pick(AVATAR_OPTIONS.hairCol),
            top:     pick(AVATAR_OPTIONS.top),
            legs:    pick(AVATAR_OPTIONS.legs),
            shoes:   pick(AVATAR_OPTIONS.shoes),
        };
    },

    /// Front view, for the menus. 120 x 190 by default.
    svg(a, w, h) {
        a = Object.assign({}, AVATAR_DEFAULT, a || {});
        w = w || 120; h = h || 190;
        const cx = w / 2;
        // Builds differ in shoulder and hip width and in what the top is cut
        // like, which is as much as a figure this size can carry.
        const B = { m:  { sh: 0.24, hip: 0.17, dress: false },
                    f:  { sh: 0.19, hip: 0.21, dress: true  },
                    nb: { sh: 0.22, hip: 0.19, dress: false } }[a.build] || { sh: 0.22, hip: 0.19 };

        const sh = w * B.sh, hip = w * B.hip;
        const headR = w * 0.155, headY = h * 0.17;
        const neckY = headY + headR * 0.92;
        const hipY  = h * 0.60, footY = h * 0.955;

        const s = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">`];

        // Legs: trousers, or a skirt that the legs come out of.
        if (B.dress) {
            s.push(`<path d="M${cx - hip} ${hipY - h * 0.06} L${cx + hip} ${hipY - h * 0.06} L${cx + hip * 1.5} ${hipY + h * 0.14} L${cx - hip * 1.5} ${hipY + h * 0.14} Z" fill="${a.top}"/>`);
            s.push(`<rect x="${cx - hip * 0.7}" y="${hipY + h * 0.12}" width="${hip * 0.5}" height="${footY - hipY - h * 0.14}" fill="${a.skin}"/>`);
            s.push(`<rect x="${cx + hip * 0.2}" y="${hipY + h * 0.12}" width="${hip * 0.5}" height="${footY - hipY - h * 0.14}" fill="${a.skin}"/>`);
        } else {
            s.push(`<rect x="${cx - hip}" y="${hipY - h * 0.04}" width="${hip * 0.85}" height="${footY - hipY + h * 0.02}" rx="${w * 0.03}" fill="${a.legs}"/>`);
            s.push(`<rect x="${cx + hip * 0.15}" y="${hipY - h * 0.04}" width="${hip * 0.85}" height="${footY - hipY + h * 0.02}" rx="${w * 0.03}" fill="${a.legs}"/>`);
        }
        s.push(`<ellipse cx="${cx - hip * 0.57}" cy="${footY}" rx="${w * 0.085}" ry="${h * 0.022}" fill="${a.shoes}"/>`);
        s.push(`<ellipse cx="${cx + hip * 0.57}" cy="${footY}" rx="${w * 0.085}" ry="${h * 0.022}" fill="${a.shoes}"/>`);

        // Arms, then the top over the shoulders.
        s.push(`<rect x="${cx - sh - w * 0.07}" y="${neckY + h * 0.03}" width="${w * 0.085}" height="${h * 0.3}" rx="${w * 0.04}" fill="${a.skin}"/>`);
        s.push(`<rect x="${cx + sh - w * 0.015}" y="${neckY + h * 0.03}" width="${w * 0.085}" height="${h * 0.3}" rx="${w * 0.04}" fill="${a.skin}"/>`);
        s.push(`<path d="M${cx - sh} ${neckY} L${cx + sh} ${neckY} L${cx + hip} ${hipY} L${cx - hip} ${hipY} Z" fill="${a.top}"/>`);
        s.push(`<rect x="${cx - sh}" y="${neckY}" width="${sh * 2}" height="${h * 0.07}" fill="${a.top}"/>`);

        // Neck and head.
        s.push(`<rect x="${cx - w * 0.05}" y="${headY}" width="${w * 0.1}" height="${h * 0.09}" fill="${a.skin}"/>`);
        s.push(`<circle cx="${cx}" cy="${headY}" r="${headR}" fill="${a.skin}"/>`);
        s.push(this._hair(a, cx, headY, headR, w, h));

        // A face, because a figure without one is a mannequin.
        s.push(`<circle cx="${cx - headR * 0.36}" cy="${headY + headR * 0.08}" r="${headR * 0.11}" fill="#1b1209"/>`);
        s.push(`<circle cx="${cx + headR * 0.36}" cy="${headY + headR * 0.08}" r="${headR * 0.11}" fill="#1b1209"/>`);
        s.push(`<path d="M${cx - headR * 0.3} ${headY + headR * 0.46} Q${cx} ${headY + headR * 0.72} ${cx + headR * 0.3} ${headY + headR * 0.46}" fill="none" stroke="#4a2c16" stroke-width="${headR * 0.13}" stroke-linecap="round"/>`);

        s.push(`</svg>`);
        return s.join('');
    },

    _hair(a, cx, hy, r, w, h) {
        const c = a.hairCol;
        switch (a.hair) {
            case 'cap':
                return `<path d="M${cx - r * 1.08} ${hy - r * 0.12} A${r * 1.08} ${r * 1.08} 0 0 1 ${cx + r * 1.08} ${hy - r * 0.12} Z" fill="${c}"/>` +
                       `<rect x="${cx - r * 1.35}" y="${hy - r * 0.22}" width="${r * 1.7}" height="${r * 0.22}" rx="${r * 0.1}" fill="${c}"/>`;
            case 'scarf':
                return `<path d="M${cx - r * 1.12} ${hy + r * 0.1} A${r * 1.12} ${r * 1.12} 0 0 1 ${cx + r * 1.12} ${hy + r * 0.1} Z" fill="${c}"/>` +
                       `<path d="M${cx + r * 0.7} ${hy + r * 0.1} L${cx + r * 1.5} ${hy + r * 0.9} L${cx + r * 0.5} ${hy + r * 0.7} Z" fill="${c}"/>`;
            case 'afro':
                return `<circle cx="${cx}" cy="${hy - r * 0.3}" r="${r * 1.22}" fill="${c}"/>` +
                       `<circle cx="${cx}" cy="${hy + r * 0.1}" r="${r * 0.92}" fill="${a.skin}"/>`;
            case 'dreads': {
                let g = `<path d="M${cx - r * 1.05} ${hy - r * 0.05} A${r * 1.05} ${r * 1.05} 0 0 1 ${cx + r * 1.05} ${hy - r * 0.05} Z" fill="${c}"/>`;
                for (let i = 0; i < 7; i++) {
                    const f = (i / 6 - 0.5) * 2;
                    g += `<rect x="${cx + f * r * 0.86 - r * 0.11}" y="${hy - r * 1.3}" width="${r * 0.22}" height="${r * (0.9 + 0.5 * (1 - Math.abs(f)))}" rx="${r * 0.11}" fill="${c}"/>`;
                }
                return g;
            }
            case 'braids': {
                let g = `<path d="M${cx - r * 1.05} ${hy} A${r * 1.05} ${r * 1.05} 0 0 1 ${cx + r * 1.05} ${hy} Z" fill="${c}"/>`;
                for (const side of [-1, 1]) {
                    g += `<rect x="${cx + side * r * 0.95 - r * 0.13}" y="${hy - r * 0.2}" width="${r * 0.26}" height="${r * 1.9}" rx="${r * 0.13}" fill="${c}"/>`;
                }
                return g;
            }
            default:
                return `<path d="M${cx - r * 1.04} ${hy + r * 0.04} A${r * 1.04} ${r * 1.04} 0 0 1 ${cx + r * 1.04} ${hy + r * 0.04} Z" fill="${c}"/>`;
        }
    },

    /// The same spec as a Runner skin, so the figure in the game is the one
    /// that was picked in the menu.
    toRunnerSkin(a) {
        a = Object.assign({}, AVATAR_DEFAULT, a || {});
        const dark = hex => {
            const n = parseInt(hex.slice(1), 16);
            const f = v => Math.max(0, Math.round(v * 0.72));
            return (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255);
        };
        const num = hex => parseInt(hex.slice(1), 16);
        return {
            skin:    num(a.skin),
            shirt:   num(a.top),
            shirtDk: dark(a.top),
            print:   num(a.top) === 0xf4f1e8 ? 0xd93b3b : 0xf4f1e8,
            printH:  0.22,
            legs:    num(a.legs),
            legsDk:  dark(a.legs),
            shoes:   num(a.shoes),
            hair:    a.hair === 'dreads' || a.hair === 'braids' ? 'dreads' : 'beret',
            hairCol: dark(a.hairCol),
            hairCols: [num(a.hairCol)],
        };
    },
};
