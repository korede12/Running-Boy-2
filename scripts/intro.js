// ── The opening ───────────────────────────────────────────────────────────
// A new player used to land on a map of a city with no idea what any of it
// was for. The game never said what it wanted from them, so the numbers in
// the corner meant nothing and neither did the buildings.
//
// Three cards. Who you are, what you are trying to do, and the one thing to
// do first. Short, second person, and it ends by pointing at an actual
// button rather than explaining one — the research on onboarding is blunt
// about this: teach by doing, and keep the reading to a minimum.
//
// It runs once. Anybody can bring it back from Profile.

const Intro = {

    KEY: 'runningboy_seen_intro',

    seen() {
        try { return localStorage.getItem(this.KEY) === '1'; } catch (_) { return true; }
    },

    mark() {
        try { localStorage.setItem(this.KEY, '1'); } catch (_) {}
    },

    /// Shown after a person is made, and only then — before that there is
    /// nobody for any of it to be about.
    maybe() {
        if (this.seen() || !Player.exists()) return false;
        this.show();
        return true;
    },

    show() {
        const host = document.getElementById('intro');
        if (!host || !Player.exists()) return;
        this._i = 0;
        this._cards = this.cards();
        host.classList.add('on');
        this._paint();
    },

    cards() {
        const p = Player.get();
        const cls = Player.social();
        const city = getCity(p.city);
        const rough = Player.sleepsRough();
        const work = findVenue('work', p.city);

        return [
            {
                art: Avatar.svg(p.avatar, 92, 148),
                tag: 'Who you are',
                head: `${p.name}, ${cls.name.toLowerCase()}`,
                body: cls.blurb,
            },
            {
                art: null,
                tag: 'What you are doing here',
                head: `Staying alive in ${city.name}`,
                body: 'Every day costs you something — food, rent, transport, ' +
                      'medicine when the mosquitoes find you. Nobody is coming ' +
                      'to help. You work, you eat, you find somewhere to sleep, ' +
                      'and if you can get ahead you buy land and build on it.' +
                      '<br><br>That is the whole game: do not just survive the ' +
                      'week — own something by the end of it.',
            },
            {
                art: null,
                tag: 'Start here',
                head: rough ? 'First, find work' : 'First, go and earn',
                body: (rough
                        ? 'You have no room and nothing saved. '
                        : 'You have somewhere to sleep, but it will not pay for itself. ') +
                      `Go to <b>${work ? work.name : 'the labour junction'}</b> and take ` +
                      'any job you can get. Hawking pays little, but anybody can do it ' +
                      'on the first day.' +
                      '<br><br>The bar at the bottom of the screen always tells you the ' +
                      'next thing to do. When you are lost, read it.',
                go: work ? work.id : null,
            },
        ];
    },

    _paint() {
        const host = document.getElementById('intro');
        if (!host) return;
        const c = this._cards[this._i];
        const last = this._i === this._cards.length - 1;

        host.innerHTML =
            '<div class="in-card">' +
                (c.art ? `<div class="in-art">${c.art}</div>` : '') +
                `<div class="in-tag">${c.tag}</div>` +
                `<h2>${c.head}</h2>` +
                `<p>${c.body}</p>` +
                '<div class="in-dots">' +
                    this._cards.map((_, i) =>
                        `<span class="${i === this._i ? 'on' : ''}"></span>`).join('') +
                '</div>' +
                '<div class="in-btns">' +
                    (this._i > 0 ? '<button class="ghost" onclick="Intro.back()">Back</button>' : '') +
                    `<button class="primary" onclick="Intro.next()">` +
                    `${last ? (c.go ? 'Take me there' : 'Start') : 'Next'}</button>` +
                '</div>' +
                (this._i === 0 ? '<button class="in-skip" onclick="Intro.done()">Skip</button>' : '') +
            '</div>';
    },

    next() {
        const c = this._cards[this._i];
        if (this._i < this._cards.length - 1) { this._i++; this._paint(); return; }
        this.done();
        // End on the actual thing to do, not on an explanation of it.
        if (c.go && typeof Nav !== 'undefined') Nav.jump(c.go);
    },

    back() { if (this._i > 0) { this._i--; this._paint(); } },

    done() {
        this.mark();
        const host = document.getElementById('intro');
        if (host) { host.classList.remove('on'); host.innerHTML = ''; }
        if (typeof refreshLifeHud === 'function') refreshLifeHud();
    },

    /// From Profile, for anyone who wants it again.
    replay() { this.show(); },
};
