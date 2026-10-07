// ── Navigation ────────────────────────────────────────────────────────────
// Three places to be: Home, Map, Profile.
//
// The map was doing all three jobs at once — it was the dashboard, the world
// and the record, with everything floating on top of the city at once.
// Splitting them lets the map be the map, and gives the numbers somewhere to
// live that is not over the top of it.
//
// Home is where you land: the clock, how you are, and the one thing to do
// next. Map is the city. Profile is the record — what you own, what you are
// building, what you have earned, and where you stand.

const Nav = {

    TABS: [
        { id: 'home',    label: 'Home',    icon: 'M-8 0 L0 -8 L8 0 L8 8 L2 8 L2 2 L-2 2 L-2 8 L-8 8 Z' },
        { id: 'map',     label: 'Map',     icon: 'M-8 -6 L-2 -8 L2 -6 L8 -8 L8 6 L2 8 L-2 6 L-8 8 Z' },
        { id: 'profile', label: 'Profile', icon: 'M0 -8 a4.2 4.2 0 1 1 -0.1 0 Z M-8 8 a8 8 0 0 1 16 0 Z' },
    ],

    view: 'map',

    mount() {
        const bar = document.getElementById('nav');
        if (!bar) return;
        bar.innerHTML = this.TABS.map(t =>
            `<button class="nav-btn" data-view="${t.id}" aria-label="${t.label}">` +
            `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${t.icon}"/></svg>` +
            `<span>${t.label}</span></button>`
        ).join('');
        bar.querySelectorAll('.nav-btn').forEach(b =>
            b.addEventListener('click', () => this.go(b.dataset.view)));

        // Someone who has not made a person yet has nothing to show on the
        // other two tabs, so the map is the only sensible landing place.
        const has = typeof Player !== 'undefined' && Player.exists();
        this.go(has ? 'home' : 'map');
    },

    go(view) {
        this.view = view;
        document.body.setAttribute('data-view', view);
        const bar = document.getElementById('nav');
        if (bar) bar.querySelectorAll('.nav-btn').forEach(b =>
            b.classList.toggle('on', b.dataset.view === view));

        if (view === 'home')    this.renderHome();
        if (view === 'profile') this.renderProfile();
        if (view === 'map' && typeof CityMap !== 'undefined') CityMap.centreOnPlayer();
    },

    _none() {
        return '<div class="nv-empty">No one yet.' +
            '<button class="est-btn" onclick="openCreate()">MAKE A PERSON</button></div>';
    },

    // ── Home ──────────────────────────────────────────────────────────────

    renderHome() {
        const host = document.getElementById('view-home');
        if (!host) return;
        if (!Player.exists()) { host.innerHTML = this._none(); return; }

        const p = Player.get();
        const cls = Player.social();
        const hour = Player.hourOfDay();
        const rough = Player.sleepsRough();
        const g = Player.nextGoal();
        const loan = Player.loan();

        host.innerHTML =
            // The room itself, with where it is and what it costs written on it.
            '<div class="rm-scene' + (rough ? ' rough' : '') + '">' +
                Room.svg(p.housing, p) +
                '<div class="rm-label">' +
                    `<b>${Player.spot()}</b>` +
                    `<span>${getCity(p.city).name} &nbsp;·&nbsp; ` +
                    `${Player.sleepHours()}h a night</span>` +
                    `<span class="nv-at">&#9678; standing at ` +
                    `${(Player.atVenue() || {}).name || 'nowhere in particular'}</span>` +
                '</div>' +
                `<div class="rm-time">${String(hour).padStart(2, '0')}:00 &nbsp;·&nbsp; ` +
                `Day ${Player.day()}</div>` +
            '</div>' +

            // Who you were born as. It is not a score, it is a starting hand.
            `<div class="rm-class ${cls.id}">` +
                `<div class="rm-class-top"><b>${cls.name}</b>` +
                `<span>${this._trait(cls)}</span></div>` +
                `<p>${cls.blurb}</p>` +
            '</div>' +

            (loan ? `<div class="rm-loan">LAPO &mdash; <b>${loan.owed}</b> outstanding, ` +
                `${Player.price(loan.perWeek, p.city)} a week. Misses grow it.` +
                (p.skubu >= loan.owed
                    ? '<button class="est-btn" onclick="clearLoan()">CLEAR IT</button>' : '') +
                '</div>' : '') +

            this._vitals(p) +

            (g ? '<div class="nv-next' + (g.act ? ' urgent' : '') + '" id="nv-next">' +
                '<span class="nv-next-tag">Do this next</span>' +
                `<span class="nv-next-text">${g.text}</span>` +
                '<span class="nv-next-go">&rsaquo;</span></div>' : '') +

            '<div class="nv-sub">Where to go</div>' +
            `<div class="nv-quick">${this._quick(p, hour)}</div>`;

        // Wired rather than inlined: the goal is an object, and stringifying
        // it into an onclick attribute is how a quote in a venue name breaks
        // the whole panel.
        const next = document.getElementById('nv-next');
        if (next && g) next.onclick = () => doGoal(g);
    },

    /// The one line that says what your class is actually good for.
    _trait(cls) {
        const bits = [];
        if (cls.grit > 1.02) bits.push('hardened');
        if (cls.grit < 0.98) bits.push('soft');
        if (cls.pull > 1.02) bits.push('connected');
        if (cls.pull < 0.98) bits.push('no leverage');
        return bits.join(' · ') || 'ordinary';
    },

    /// The handful of places you actually need. Shut ones are shown as shut
    /// rather than hidden — that the clinic opens at eight is exactly the
    /// thing you need to know at three in the morning.
    _quick(p, hour) {
        // Work is how you live; the game house and the club are what you do
        // when you are not. They were the same tile, and that was wrong.
        const jobs = [
            ['work',   'Earn'],    ['run',    'Play'],
            ['hotel',  'Sleep'],   ['clinic', 'Health'],
            ['shop',   'Market'],  ['fight',  'Fight'],
            ['agent',  'Property'],
        ];
        return jobs.map(([job, label]) => {
            const v = findVenue(job, p.city);
            if (!v) return '';
            const shut = !isOpen(v, hour);
            return `<button class="nv-tile${shut ? ' shut' : ''}" onclick="Nav.jump('${v.id}')">` +
                `<b>${label}</b><span>${v.name}</span>` +
                `<em>${shut ? 'opens ' + String(v.open[0]).padStart(2, '0') + ':00' : 'open now'}</em>` +
                '</button>';
        }).join('');
    },

    /// Going somewhere from Home means showing the map, then opening it.
    jump(venueId) {
        this.go('map');
        if (typeof CityMap !== 'undefined') CityMap.pick(venueId);
    },

    _partOfDay(h) {
        if (h < 5)  return 'small hours';
        if (h < 12) return 'morning';
        if (h < 17) return 'afternoon';
        if (h < 21) return 'evening';
        return 'night';
    },

    _vitals(p) {
        const row = (label, v, cls) =>
            `<div class="nv-vital"><span>${label}</span>` +
            '<span class="vital-track">' +
            `<span class="vital-fill ${cls}" style="width:${Math.max(0, v)}%"></span></span>` +
            `<b>${Math.round(v)}</b></div>`;
        return '<div class="nv-vitals">' +
            row('Physical',  p.health, p.health < 40 ? 'low' : '') +
            row('Rested',    p.rest,   p.rest < ECONOMY.sleep.TIRED ? 'low' : '') +
            row('Wellbeing', p.mind,   p.mind < ECONOMY.mind.LOW ? 'low' : '') +
            (p.illness
                ? `<div class="nv-ill">&#9888; Malaria — ${ECONOMY.health.DRAIN} health a day</div>`
                : '') +
            '</div>';
    },

    // ── Profile ───────────────────────────────────────────────────────────

    renderProfile() {
        const host = document.getElementById('view-profile');
        if (!host) return;
        if (!Player.exists()) { host.innerHTML = this._none(); return; }

        const p = Player.get();
        const house = HOUSING_BY_ID[p.housing] || HOUSING_BY_ID.none;

        const owned = p.owns.length
            ? p.owns.map(o =>
                `<div class="nv-row"><span>${getCity(o.city).name}` +
                (o.built ? ' <em>built</em>' : '') + '</span>' +
                `<b>${o.tenant ? '+' + Player.rentIncome(o.city) + '/wk' : 'empty'}</b></div>`).join('')
            : '<div class="nv-none">Nothing yet.</div>';

        const sites = p.land.length
            ? p.land.map((pl, i) => {
                const pct = Math.round(Player.plotProgress(i) * 100);
                const stage = pl.stage < ECONOMY.land.STAGES.length
                    ? ECONOMY.land.STAGES[pl.stage] : 'Done';
                return `<div class="nv-row"><span>${getCity(pl.city).name} &nbsp;·&nbsp; ${stage}` +
                    (pl.crew ? ` &nbsp;·&nbsp; ${pl.crew} working` : '') + '</span>' +
                    `<b>${pct}%</b></div>` +
                    `<div class="site-bar"><span style="width:${pct}%"></span></div>`;
            }).join('')
            : '<div class="nv-none">No land.</div>';

        const ledger = (p.history || []).slice(0, 8).map(h =>
            '<div class="nv-row led">' +
            `<span>${h.why}</span>` +
            `<b class="${h.amount > 0 ? 'up' : h.amount < 0 ? 'dn' : ''}">` +
            `${h.amount > 0 ? '+' : ''}${h.amount || '·'}</b></div>`).join('')
            || '<div class="nv-none">Nothing yet.</div>';

        host.innerHTML =
            '<div class="nv-head">' +
                `<div class="nv-av big">${Avatar.svg(p.avatar, 104, 164)}</div>` +
                '<div class="nv-who">' +
                    `<b>${p.name}</b>` +
                    `<span>${getCity(p.city).name}</span>` +
                    `<span class="nv-clock">Day ${Player.day()} &nbsp;·&nbsp; ${house.name}</span>` +
                    `<span class="nv-clock">${Player.social().name}</span>` +
                '</div>' +
                `<div class="nv-purse">&#10022; ${p.skubu}</div>` +
            '</div>' +

            this._vitals(p) +

            `<div class="nv-sub">Property</div>${owned}` +
            `<div class="nv-sub">Building</div>${sites}` +
            `<div class="nv-sub">Ledger</div>${ledger}` +

            '<div class="nv-sub">World leaderboard</div>' +
            '<div id="global-lb-list"><div class="lb-loading">Loading&#8230;</div></div>' +
            '<div id="global-lb-my-rank" style="display:none"></div>' +

            '<div class="nv-danger">' +
                '<button class="ghost" onclick="Nav.startOver()">Start again from nothing</button>' +
            '</div>';

        if (typeof fetchLeaderboard === 'function') fetchLeaderboard();
    },

    startOver() {
        if (!confirm('Give up this life and start again with nothing?')) return;
        Player.startAgain();
        this.go('map');
        if (typeof CityMap !== 'undefined') CityMap.build();
        if (typeof refreshLifeHud === 'function') refreshLifeHud();
        openCreate();
    },

    /// Called whenever the world changes, so the tab you are on stays current.
    refresh() {
        if (this.view === 'home')    this.renderHome();
        if (this.view === 'profile') this.renderProfile();
    },
};
