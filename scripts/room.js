// ── Your room ─────────────────────────────────────────────────────────────
// Where you sleep, drawn. There is a world of difference between a form
// field that reads "no fixed address" and a picture of a mat under a flyover
// with the traffic going over your head, and the difference is the whole
// point: the game is about getting off that mat.
//
// Each rung on the housing ladder gets its own scene, and your things show
// up in it — the net over the bed is the net you bought. The room is the one
// screen that is only ever about what you have, so it should look like it.

const Room = {

    W: 320,
    H: 190,

    /// The scene for a housing id. `p` is the player, for their things.
    svg(housingId, p) {
        const body = ({
            none: () => this._bridge(p),
            room: () => this._corridor(p),
            self: () => this._selfContain(p),
            flat: () => this._flat(p),
            own:  () => this._own(p),
        }[housingId] || (() => this._bridge(p)))();

        return `<svg viewBox="0 0 ${this.W} ${this.H}" class="room-svg" ` +
               `preserveAspectRatio="xMidYMax slice" role="img" ` +
               `aria-label="Where you sleep">${body}</svg>`;
    },

    // ── Shared pieces ─────────────────────────────────────────────────────

    /// The player, asleep or sitting, small and in the scene.
    _figure(x, y, s, lying) {
        const skin = '#9a6440';
        if (lying) {
            // Seen from the side, under a blanket: head, shoulder, the long
            // line of the body. Small shapes read as nothing at this size.
            return `<g transform="translate(${x},${y}) scale(${s})">` +
                `<ellipse cx="2" cy="4" rx="40" ry="6" fill="#000" opacity="0.35"/>` +
                `<path d="M-34 2 L-30 -11 Q-14 -17 6 -15 L24 -13 L26 2 Z" fill="#6a5582"/>` +
                `<path d="M-34 2 L-30 -11 Q-20 -15 -8 -14 L-6 2 Z" fill="#5b4870"/>` +
                `<circle cx="30" cy="-14" r="9" fill="${skin}"/>` +
                `<path d="M21 -20 q9 -8 18 -2 q-9 -3 -18 2 Z" fill="#17171f"/>` +
                `<circle cx="34" cy="-13" r="1.1" fill="#17171f"/>` +
                `<path d="M26 -4 q5 2 9 0" stroke="${skin}" stroke-width="3.4" stroke-linecap="round" fill="none"/>` +
                `</g>`;
        }
        return `<g transform="translate(${x},${y}) scale(${s})">` +
            `<ellipse cx="0" cy="2" rx="15" ry="4" fill="#000" opacity="0.3"/>` +
            `<rect x="-9" y="-32" width="18" height="24" rx="6" fill="#6a5582"/>` +
            `<circle cx="0" cy="-39" r="8.4" fill="${skin}"/>` +
            `<path d="M-8.4 -44 q8.4 -7 16.8 0 q-8.4 -3 -16.8 0 Z" fill="#17171f"/>` +
            `<rect x="-7.5" y="-9" width="6.5" height="11" rx="2.6" fill="#33333f"/>` +
            `<rect x="1" y="-9" width="6.5" height="11" rx="2.6" fill="#33333f"/>` +
            `<rect x="-11.5" y="-30" width="4" height="16" rx="2" fill="${skin}"/>` +
            `<rect x="7.5" y="-30" width="4" height="16" rx="2" fill="${skin}"/>` +
            `</g>`;
    },

    /// A mosquito net, if they bought one. The single most visible thing
    /// your money buys at the bottom of the ladder.
    _net(x, y, w, h) {
        return `<g opacity="0.5">` +
            `<path d="M${x} ${y} L${x - w / 2} ${y + h} L${x + w / 2} ${y + h} Z" ` +
            `fill="#cfe8ff" opacity="0.26"/>` +
            `<path d="M${x} ${y} L${x - w / 2} ${y + h} L${x + w / 2} ${y + h} Z" ` +
            `fill="none" stroke="#dff1ff" stroke-width="1.1"/>` +
            `<circle cx="${x}" cy="${y - 3}" r="2.4" fill="#8899aa"/></g>`;
    },

    _mosquitoes(n) {
        let g = '';
        for (let i = 0; i < n; i++) {
            const x = 40 + (i * 61) % 240, y = 42 + (i * 37) % 70;
            g += `<g class="mozzie" style="animation-delay:${-(i * 0.7)}s">` +
                 `<circle cx="${x}" cy="${y}" r="1.7" fill="#2a2218"/>` +
                 `<path d="M${x - 4} ${y - 3} q4 -2 8 0" stroke="#55606a" stroke-width="0.8" fill="none"/>` +
                 `</g>`;
        }
        return g;
    },

    _bulb(x, y, on) {
        return `<g>` +
            `<line x1="${x}" y1="0" x2="${x}" y2="${y - 7}" stroke="#30303c" stroke-width="1.6"/>` +
            `<circle cx="${x}" cy="${y}" r="6" fill="${on ? '#ffe9a8' : '#3a3a46'}"/>` +
            (on ? `<circle cx="${x}" cy="${y}" r="17" fill="#ffd766" opacity="0.14"/>` : '') +
            `</g>`;
    },

    // ── No roof ───────────────────────────────────────────────────────────

    _bridge(p) {
        const net = p && Player.has('net');
        return `
        <defs>
            <linearGradient id="rbNight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#1b2740"/><stop offset="1" stop-color="#2b3550"/>
            </linearGradient>
            <radialGradient id="rbLamp" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stop-color="#ffb347" stop-opacity="0.5"/>
                <stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
            </radialGradient>
        </defs>

        <rect width="320" height="190" fill="url(#rbNight)"/>
        <g opacity="0.5" fill="#39455f">
            <rect x="12"  y="78" width="20" height="46"/><rect x="38" y="88" width="15" height="36"/>
            <rect x="268" y="82" width="18" height="42"/><rect x="292" y="92" width="14" height="32"/>
        </g>
        <g opacity="0.75" fill="#ffd98a">
            <rect x="17" y="86" width="4" height="4"/><rect x="25" y="96" width="4" height="4"/>
            <rect x="273" y="90" width="4" height="4"/><rect x="296" y="100" width="3" height="4"/>
        </g>

        <rect y="0" width="320" height="52" fill="#20232e"/>
        <rect y="50" width="320" height="9" fill="#2e3340"/>
        <rect y="59" width="320" height="4" fill="#191c26"/>
        <g opacity="0.6">
            <rect x="74"  y="14" width="30" height="10" rx="2" fill="#d8b44a"/>
            <rect x="186" y="28" width="26" height="9" rx="2" fill="#a8452f"/>
            <rect x="122" y="34" width="34" height="8" rx="2" fill="#3f7fc0"/>
        </g>

        <g fill="#232735">
            <rect x="18"  y="63" width="40" height="86"/>
            <rect x="248" y="63" width="40" height="86"/>
        </g>
        <g fill="#2c3140">
            <rect x="18"  y="63" width="10" height="86"/>
            <rect x="248" y="63" width="10" height="86"/>
        </g>
        <g opacity="0.45" fill="#c9a23a">
            <rect x="26" y="88" width="24" height="3"/><rect x="26" y="96" width="17" height="3"/>
            <rect x="256" y="92" width="22" height="3"/>
        </g>

        <line x1="214" y1="63" x2="214" y2="78" stroke="#3a4050" stroke-width="2.6"/>
        <circle cx="214" cy="82" r="7" fill="#ffd98a"/>
        <ellipse cx="214" cy="112" rx="80" ry="58" fill="url(#rbLamp)"/>

        <rect y="146" width="320" height="44" fill="#3a3a44"/>
        <rect y="146" width="320" height="4" fill="#4a4a56"/>
        <g opacity="0.35" stroke="#55555f" stroke-width="1.4">
            <line x1="0" y1="162" x2="320" y2="162"/>
        </g>

        <ellipse cx="150" cy="158" rx="62" ry="11" fill="#1d1d26" opacity="0.7"/>
        <rect x="92" y="140" width="118" height="10" rx="4" fill="#8a7550"/>
        <rect x="92" y="140" width="118" height="4" rx="2" fill="#a08a62"/>
        ${this._figure(148, 142, 1.08, true)}
        ${net ? this._net(150, 74, 128, 66) : this._mosquitoes(5)}

        <g>
            <rect x="238" y="128" width="26" height="20" rx="3" fill="#44404e"/>
            <rect x="241" y="124" width="20" height="5" rx="2" fill="#55505f"/>
            <rect x="58" y="132" width="17" height="16" rx="2" fill="#4a3f2e"/>
            <circle cx="80" cy="142" r="6" fill="#3c4450"/>
        </g>

        <g class="room-rain" opacity="0.3" stroke="#aec4de" stroke-width="1.1">
            <line x1="34"  y1="68" x2="30"  y2="86"/>
            <line x1="112" y1="74" x2="108" y2="92"/>
            <line x1="196" y1="66" x2="192" y2="84"/>
            <line x1="286" y1="78" x2="282" y2="96"/>
        </g>
        <text x="160" y="182" text-anchor="middle" font-family="monospace" font-size="8"
              fill="#8a8a98" letter-spacing="1.6">NO RENT. NO DOOR. NO NET BUT THE ONE YOU BUY.</text>`;
    },

    // ── Face-me-I-face-you ────────────────────────────────────────────────

    _corridor(p) {
        const net = p && Player.has('net');
        return `
        <rect width="320" height="190" fill="#241f28"/>
        <rect x="0" y="0" width="320" height="150" fill="#2b2531"/>
        <rect y="150" width="320" height="40" fill="#43372a"/>
        <g opacity="0.3" stroke="#564634" stroke-width="1">
            <line x1="0" y1="160" x2="320" y2="160"/><line x1="0" y1="174" x2="320" y2="174"/>
        </g>

        <rect x="0" y="0" width="320" height="16" fill="#1f1a25"/>
        <g opacity="0.25" fill="#6a5a44">
            <rect x="18" y="26" width="64" height="40"/><rect x="26" y="34" width="48" height="24"/>
        </g>

        <rect x="214" y="30" width="78" height="120" rx="3" fill="#4a3b2c" stroke="#5e4c39" stroke-width="2.4"/>
        <rect x="222" y="40" width="62" height="44" rx="2" fill="#3c3023"/>
        <rect x="222" y="94" width="62" height="46" rx="2" fill="#3c3023"/>
        <circle cx="226" cy="92" r="3.6" fill="#d8b44a"/>
        <rect x="232" y="150" width="46" height="4" fill="#2a2119" opacity="0.7"/>

        <rect x="22" y="96" width="132" height="54" rx="4" fill="#4a3d5e"/>
        <rect x="22" y="86" width="132" height="14" rx="6" fill="#64537e"/>
        <rect x="28" y="76" width="42" height="14" rx="5" fill="#dfe4ee" opacity="0.85"/>
        ${this._figure(88, 92, 0.96, true)}
        ${net ? this._net(88, 44, 136, 54) : this._mosquitoes(3)}

        <g>
            <rect x="168" y="118" width="32" height="32" rx="3" fill="#3a3a46"/>
            <rect x="172" y="112" width="24" height="8" rx="2" fill="#4a4a58"/>
            <circle cx="184" cy="134" r="5" fill="#2b2b36"/>
            <rect x="166" y="60" width="38" height="30" rx="2" fill="#333b2c"/>
            <rect x="170" y="66" width="30" height="4" fill="#44503c"/>
            <rect x="170" y="74" width="30" height="4" fill="#44503c"/>
        </g>
        ${this._bulb(160, 30, true)}

        <text x="160" y="182" text-anchor="middle" font-family="monospace" font-size="8"
              fill="#8a7a62" letter-spacing="1.5">ONE ROOM &#183; SHARED TOILET DOWN THE CORRIDOR</text>`;
    },

    // ── Self-contain ──────────────────────────────────────────────────────

    _selfContain(p) {
        const net = p && Player.has('net');
        const phone = p && Player.has('phone');
        return `
        <rect width="320" height="190" fill="#191721"/>
        <rect y="146" width="320" height="44" fill="#2a2420"/>
        <rect x="0" y="18" width="320" height="128" fill="#201d29"/>
        <rect x="222" y="40" width="70" height="60" rx="3" fill="#121a26" stroke="#3a3446" stroke-width="2"/>
        <g stroke="#3a3446" stroke-width="1.6">
            <line x1="257" y1="40" x2="257" y2="100"/><line x1="222" y1="70" x2="292" y2="70"/>
        </g>
        <circle cx="275" cy="54" r="7" fill="#e8e2c0" opacity="0.5"/>
        <rect x="26" y="98" width="110" height="48" rx="4" fill="#3a3040"/>
        <rect x="26" y="90" width="110" height="12" rx="5" fill="#584a66"/>
        <rect x="30" y="80" width="34" height="14" rx="5" fill="#cfd6e4" opacity="0.8"/>
        <rect x="160" y="110" width="52" height="36" rx="3" fill="#2a2a34"/>
        <rect x="166" y="116" width="40" height="10" rx="2" fill="#3f3f4c"/>
        <circle cx="186" cy="136" r="4" fill="#c9a23a" opacity="0.7"/>
        ${this._bulb(160, 32, true)}
        ${phone ? `<rect x="172" y="100" width="9" height="15" rx="2" fill="#1c2634" stroke="#4a5a6a" stroke-width="1"/>` : ''}
        ${net ? this._net(80, 62, 112, 48) : this._mosquitoes(1)}
        ${this._figure(80, 92, 0.86, true)}
        <text x="252" y="128" text-anchor="middle" font-family="monospace" font-size="8"
              fill="#5f5a52" letter-spacing="1.2">OWN TOILET</text>`;
    },

    // ── Two-bedroom flat ──────────────────────────────────────────────────

    _flat(p) {
        const net = p && Player.has('net');
        return `
        <rect width="320" height="190" fill="#1b1a24"/>
        <rect y="142" width="320" height="48" fill="#30271f"/>
        <rect x="0" y="14" width="320" height="128" fill="#232130"/>
        <rect x="18" y="34" width="86" height="64" rx="3" fill="#101a28" stroke="#3f3a50" stroke-width="2"/>
        <g stroke="#3f3a50" stroke-width="1.6"><line x1="61" y1="34" x2="61" y2="98"/></g>
        <g opacity="0.45" fill="#8aa6c4">
            <rect x="24" y="66" width="12" height="30"/><rect x="42" y="74" width="10" height="22"/>
            <rect x="68" y="60" width="13" height="36"/><rect x="86" y="72" width="11" height="24"/>
        </g>
        <rect x="128" y="96" width="112" height="46" rx="6" fill="#3d3450"/>
        <rect x="128" y="86" width="112" height="14" rx="6" fill="#5c4e78"/>
        <rect x="134" y="76" width="36" height="14" rx="5" fill="#dfe4ee" opacity="0.8"/>
        <rect x="252" y="100" width="52" height="42" rx="4" fill="#2c2c38"/>
        <rect x="258" y="106" width="40" height="12" rx="2" fill="#44444f"/>
        <rect x="258" y="122" width="40" height="12" rx="2" fill="#3b3b46"/>
        <rect x="152" y="40" width="64" height="40" rx="3" fill="#0e0e16" stroke="#3a3a48" stroke-width="2"/>
        <rect x="158" y="46" width="52" height="28" fill="#1b2a3a" opacity="0.8"/>
        ${this._bulb(232, 28, true)}
        ${net ? this._net(184, 68, 108, 46) : ''}
        ${this._figure(184, 96, 0.84, true)}`;
    },

    // ── Your own place ────────────────────────────────────────────────────

    _own(p) {
        return `
        <rect width="320" height="190" fill="#1d1c26"/>
        <rect y="138" width="320" height="52" fill="#382d22"/>
        <rect x="0" y="10" width="320" height="128" fill="#262433"/>
        <rect x="16" y="26" width="104" height="76" rx="3" fill="#0e1826" stroke="#473f5a" stroke-width="2"/>
        <g stroke="#473f5a" stroke-width="1.6">
            <line x1="68" y1="26" x2="68" y2="102"/><line x1="16" y1="64" x2="120" y2="64"/>
        </g>
        <g opacity="0.5" fill="#9ab4d2">
            <rect x="22" y="70" width="14" height="32"/><rect x="44" y="78" width="12" height="24"/>
            <rect x="76" y="68" width="15" height="34"/><rect x="98" y="80" width="13" height="22"/>
        </g>
        <circle cx="96" cy="42" r="9" fill="#f0e8c4" opacity="0.55"/>
        <rect x="142" y="88" width="132" height="50" rx="7" fill="#45395c"/>
        <rect x="142" y="76" width="132" height="16" rx="7" fill="#685789"/>
        <rect x="150" y="64" width="40" height="15" rx="6" fill="#e8ecf4" opacity="0.85"/>
        <rect x="196" y="64" width="40" height="15" rx="6" fill="#dfe4ee" opacity="0.7"/>
        <rect x="150" y="30" width="78" height="46" rx="3" fill="#0d0d14" stroke="#413f4f" stroke-width="2"/>
        <rect x="156" y="36" width="66" height="34" fill="#1d2f42" opacity="0.85"/>
        <rect x="246" y="26" width="58" height="76" rx="4" fill="#2f2a3a"/>
        <g fill="#8a7a5a" opacity="0.8">
            <rect x="252" y="34" width="46" height="5"/><rect x="252" y="46" width="46" height="5"/>
            <rect x="252" y="58" width="46" height="5"/>
        </g>
        ${this._bulb(118, 24, true)}
        <ellipse cx="208" cy="150" rx="70" ry="10" fill="#2b2218" opacity="0.6"/>
        ${this._figure(208, 88, 0.84, true)}`;
    },
};
