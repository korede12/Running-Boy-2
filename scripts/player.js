function getCityName(id) {
    return (typeof getCity === 'function' && getCity(id)) ? getCity(id).name : id;
}

// ── The player ────────────────────────────────────────────────────────────
// Who you are, what you own, where you are, and what it costs you to be
// there. Everything the city does to you goes through here.
//
// You start with nothing: no skubu, no home, and whichever city you picked.
// Earning happens at the game house, the club pays a purse for a win, and
// rent comes out on a clock. Lagos pays better and costs more; Abeokuta is
// cheaper and quieter, with less going on.

const ECONOMY = {

    // Multipliers on everything a city charges and everything it pays.
    cities: {
        lagos:    { cost: 1.00, pay: 1.00, note: 'Busy, expensive, and where the money is.',
                    serves: ['walk', 'bus', 'train', 'flight'], demand: 1.35,
                    // Density, commuting, noise and cost of living are what the
                    // research names as the stressors; Lagos has all four.
                    stress: 1.0 },
        abeokuta: { cost: 0.58, pay: 0.62, note: 'Cheaper and slower. Civil service town.',
                    serves: ['walk', 'bus', 'train'], demand: 0.85, stress: 0.42 },
    },

    // Getting between cities is a trade of money against hours. Walking is
    // free and costs most of a day; a flight is an hour and most of a
    // deposit. A mode only runs if both ends are served by it, which is why
    // you cannot fly into Abeokuta.
    transport: [
        { id: 'walk',   name: 'Walk it',  fare: 0,   hours: 14,
          note: 'Free. Gone by nightfall.' },
        { id: 'bus',    name: 'Danfo',    fare: 40,  hours: 4,
          note: 'Cheapest thing with wheels.' },
        { id: 'train',  name: 'Train',    fare: 95,  hours: 2, every: 6,
          note: 'Quick, when one is due.' },
        { id: 'flight', name: 'Flight',   fare: 280, hours: 1,
          note: 'An hour, and you will feel it.' },
    ],

    // What a run is worth. Deliberately small — a house is a lot of runs.
    PAY_PER_POINT: 0.9,
    FIGHT_PURSE:   120,
    FIGHT_LOSS:    0,

    // Somewhere to sleep. Rent is charged per in-game week.
    // The rungs, in the names they actually go by. A face-me-I-face-you is a
    // row of single rooms whose doors face each other across a corridor,
    // sharing a toilet; a self-contain is one room with its own. That is the
    // real bottom of the rented ladder, so it is the bottom of this one.
    housing: [
        { id: 'none', name: 'No roof',             rent: 0,  buy: 0,    sleeps: false },
        { id: 'room', name: 'Face-me-I-face-you',  rent: 28, buy: 0,    sleeps: true  },
        { id: 'self', name: 'Self-contain',        rent: 52, buy: 0,    sleeps: true  },
        { id: 'flat', name: 'Two-bedroom flat',    rent: 85, buy: 0,    sleeps: true  },
        { id: 'own',  name: 'Your own place',      rent: 0,  buy: 2400, sleeps: true, letsFor: 60 },
    ],

    // ── Where you started ─────────────────────────────────────────────────
    // Nobody picks this; it is rolled, because nobody picks it in life
    // either. Each class is a different starting position and a different
    // set of strengths, so the roll is not simply a money dial — the one who
    // starts with the most is the worst at going without.
    //
    //   grit — hardened by it. Carries the body and the mind through a bad
    //          week. "Ajepako" is literally the one raised rough.
    //   pull — who you know. Shows up in what work pays you.
    classes: [
        { id: 'lapo', name: 'LAPO baby', weight: 34,
          skubu: 0, housing: 'none', grit: 1.10, pull: 0.95,
          loan: { owed: 140, perWeek: 20 },
          blurb: 'Your mama still dey pay back LAPO every week, and now ' +
                 'part of it is yours. You have no room, no bed, nothing. ' +
                 'Whatever you want, you go find am yourself.' },

        { id: 'pako', name: 'Ajepako', weight: 30,
          skubu: 45, housing: 'room', grit: 1.20, pull: 1.00,
          blurb: 'You grew up on the street and it made you strong. One ' +
                 'room, toilet outside, and a body that can take a bad ' +
                 'week without falling down.' },

        { id: 'nepo', name: 'Nepo baby', weight: 22,
          skubu: 280, housing: 'self', grit: 0.95, pull: 1.22,
          blurb: 'Your papa knows people. You get self-contain, small ' +
                 'money, and doors that open for you faster than they open ' +
                 'for anybody else.' },

        { id: 'butter', name: 'Ajebutter', weight: 14,
          skubu: 950, housing: 'flat', grit: 0.78, pull: 1.10,
          blurb: 'You never lacked anything. Two-bedroom flat and serious ' +
                 'money — but if it ever finishes, you will not know what ' +
                 'to do with yourself.' },
    ],

    // What a roofless player is sleeping under. Rolled once and kept, so the
    // place stays the same place.
    SPOTS: ['Under the bridge', 'On the street', 'An uncompleted building',
            'A motor park bench'],

    WEEK_HOURS: 168,

    // Sleep. Adults need seven to nine hours; short sleep weakens the immune
    // system and slows reaction time, which is why resting badly shows up
    // both as illness and as a worse run.
    sleep: {
        NEED:    8,
        HOURS: { none: 3.5, hotel: 8, room: 7, self: 7.5, flat: 8, own: 8.5 },
        SETTLE: 0.55,   // how fast rest moves towards that ceiling
        TIRED:  38,     // below this the body starts giving way
        IMMUNE: 1.6,    // what tiredness multiplies the malaria risk by
    },

    // Wellbeing, modelled as circumstance rather than as something wrong
    // with the person: housing, sleep, money, illness and the city itself
    // are what the research finds predicts it, so they are what moves it.
    mind: {
        BASE:      3,    // the city's own share, scaled by its stress
        NO_HOME:   7,
        POOR_SLEEP: 6,
        BROKE:     4,
        ILL:       5,
        COMMUTE:   0.5,  // per hour spent travelling
        SETTLED:   6,    // recovered when housed, rested and not broke
        LOW:       28,   // below this it starts costing you health
    },

    // ── Getting across town ───────────────────────────────────────────────
    // Lagos is a megacity with layers: danfo and keke everywhere, BRT as the
    // cheapest organised option over distance, okada kept off the big roads,
    // a ferry across the lagoon, and Bolt at roughly four times the bus.
    // Abeokuta has none of that. It runs on okada and keke, it is small
    // enough to walk, and nothing there is stuck in Lagos traffic.
    //
    // fare is the flag-fall, per is per tile crossed, and pace is hours per
    // tile — which is where the traffic lives.
    transit: {
        lagos: [
            { id: 'walk',  name: 'Walk',        fare: 0,    per: 0,    pace: 0.42, tiring: true,
              blurb: 'Free. And it will take you most of the day.' },
            { id: 'danfo', name: 'Danfo',       fare: 1,    per: 0.32, pace: 0.14,
              blurb: 'Yellow bus. No timetable, and go-slow decides when you arrive.' },
            { id: 'keke',  name: 'Keke napep',  fare: 1,    per: 0.42, pace: 0.11, maxDist: 10,
              blurb: 'Tricycle. Only for short distance.' },
            { id: 'brt',   name: 'BRT',         fare: 1.8,  per: 0.20, pace: 0.10, minDist: 6,
              blurb: 'It has its own lane, so no go-slow. Cheapest way to cross far.' },
            { id: 'okada', name: 'Okada',       fare: 1.4,  per: 0.52, pace: 0.07, maxDist: 7, risk: 0.05,
              blurb: 'Fastest thing on two wheels — but they no dey allow am on big road.' },
            { id: 'ferry', name: 'LAGFERRY',    fare: 3.2,  per: 0.18, pace: 0.08, minDist: 9,
              blurb: 'Straight across the water while the bridge is parked.' },
            { id: 'bolt',  name: 'Bolt',        fare: 5,    per: 1.15, pace: 0.08,
              blurb: 'Comes to your door. Also costs about four times the bus.' },
        ],
        abeokuta: [
            { id: 'walk',  name: 'Walk',        fare: 0,    per: 0,    pace: 0.18, tiring: true,
              blurb: 'Free, and this town is small enough that you can actually do it.' },
            { id: 'okada', name: 'Okada',       fare: 0.5,  per: 0.26, pace: 0.05, risk: 0.04,
              blurb: 'This is how Abeokuta moves. Small money, ten minutes, you don reach.' },
            { id: 'keke',  name: 'Keke napep',  fare: 0.5,  per: 0.32, pace: 0.07,
              blurb: 'Tricycle, and there is no real traffic here to delay you.' },
            { id: 'taxi',  name: 'Shared taxi', fare: 1.5,  per: 0.40, pace: 0.06,
              blurb: 'From the motor park. It moves when it fills up, not before.' },
        ],
    },

    HOTEL_NIGHT: 46,
    CLINIC_FEE:  58,

    // Land and building. A plot is cheap next to a finished house, and the
    // gap between them is paid in wages and weeks — which is the medium-term
    // goal the game was missing between surviving a week and owning
    // anything. Build where land is cheap, earn where the money is.
    land: {
        PLOT:        620,                               // priced in Lagos terms
        STAGES:      ['Foundation', 'Walls', 'Roof', 'Finishing'],
        WORK_STAGE:  40,                                // labourer-hours each
        MATERIALS:   [130, 190, 160, 100],              // due at the start of each
        WAGE_HOUR:   3,                                 // per labourer, per hour
        MAX_CREW:    6,
    },

    // Getting caught is a court date, not a game over. What you spend on
    // counsel is what your odds are — which is the whole point of the
    // choice, and roughly the point of the system it is about.
    lawyers: [
        { id: 'self', name: 'Defend yourself', fee: 0,   odds: 0.10,
          note: 'The bench has heard it before.' },
        { id: 'duty', name: 'Duty counsel',    fee: 70,  odds: 0.34,
          note: 'Overworked, but present.' },
        { id: 'firm', name: 'A city firm',     fee: 240, odds: 0.62,
          note: 'Knows the registrar by name.' },
        { id: 'san',  name: 'A SAN',           fee: 700, odds: 0.88,
          note: 'Senior Advocate. Walks you out.' },
    ],
    PRISON_HOURS: 72,

    // Health. Sleeping rough is the risk: no roof, no net, and the
    // mosquitoes find you. Being ill drains you and the tablets cost more
    // than the net would have.
    health: {
        RISK_ROUGH:  0.34,     // chance per day with nowhere to sleep
        RISK_HOUSED: 0.04,
        NET_FACTOR:  0.28,     // what a net multiplies the risk by
        DRAIN:       9,        // health lost per day while ill
        RECOVER:     6,        // regained per day when well and housed
        RECOVER_ROUGH: 2,
        HOSPITAL:    170,      // the bill if you collapse
        HOSPITAL_HOURS: 24,
        FOOD_PER_DAY: 14,      // eating, which happens if you can afford it
        HUNGER_DRAIN: 11,      // health lost per day that you cannot
        STEAL_MIN:    25,      // too weak to outrun anyone below this
        GRACE_DAYS:   2,       // you arrived with something in your bag
        WEAK:         40,      // and slower below this
    },

    // What the market sells, priced in Lagos terms. 'wears' means taking it
    // changes what you have on, which is the point of stealing a shirt.
    goods: [
        { id: 'bread',  name: 'Bread and akara', price: 12, wears: null },
        { id: 'tee',    name: 'T-shirt',         price: 26, wears: 'top' },
        { id: 'jeans',  name: 'Jeans',           price: 38, wears: 'legs' },
        { id: 'kicks',  name: 'Trainers',        price: 52, wears: 'shoes' },
        { id: 'phone',  name: 'Phone',           price: 90, wears: null },
        { id: 'net',    name: 'Mosquito net',    price: 34, wears: null, keeps: true },
        { id: 'meds',   name: 'Malaria tablets', price: 48, wears: null, cures: true },

        // Capital, and papers. These are not things you use — they are the
        // things that let you do better work, which is the only ladder out
        // of a gig that pays by the shift.
        { id: 'bike',   name: 'Second-hand bike', price: 320, wears: null, keeps: true,
          note: 'Okada and dispatch work.' },
        { id: 'pos',    name: 'POS machine',      price: 240, wears: null, keeps: true,
          note: 'Run a POS stand.' },
        { id: 'cert',   name: 'School certificate', price: 420, wears: null, keeps: true,
          note: 'What an office asks for.' },
    ],

    // ── Work ──────────────────────────────────────────────────────────────
    // Ninety-three per cent of the workforce is informal, and the research
    // calls it survivalist. So the game is mostly hustle, and a salary is
    // the thing you climb towards rather than the thing you start with.
    //
    // The tension is the real one: at the top a hustle out-earns a salary,
    // but it pays nothing on a week you are ill, locked up, or short of a
    // bike. A job pays whether or not the week went well — provided you
    // turned up.
    work: {
        SHIFTS_DUE: 4,          // turning up, per week, to keep a job
        EXP_PER_GIG: 1,

        // Paid at the end of the shift. pay is a range because informal
        // earnings are not stable, which is the whole point of them.
        gigs: [
            { id: 'hawk', name: 'Hawking in traffic', hours: 4, pay: [7, 16],
              needs: {}, hurt: 2,
              blurb: 'Selling between cars in go-slow. Anybody can do it, so it pays the least.' },

            { id: 'labour', name: 'Site labourer', hours: 8, pay: [22, 34],
              needs: {}, hurt: 5,
              blurb: 'Carrying block and cement from morning. The money is good but your body will feel it.' },

            { id: 'conduct', name: 'Danfo conductor', hours: 7, pay: [16, 30],
              needs: { exp: 2 }, hurt: 3,
              blurb: 'Hanging on the door shouting the route. You must know the roads first.' },

            { id: 'dispatch', name: 'Dispatch rider', hours: 6, pay: [24, 44],
              needs: { exp: 5, item: 'bike' }, hurt: 3,
              blurb: 'Carrying parcels across town. Your bike, your fuel, your own risk.' },

            { id: 'okada', name: 'Okada', hours: 8, pay: [28, 58],
              needs: { item: 'bike' }, hurt: 4, risk: 0.07,
              blurb: 'Carrying passengers all day. Best money on the street, and the worst odds.' },

            { id: 'pos', name: 'POS stand', hours: 6, pay: [18, 72],
              needs: { item: 'pos' }, hurt: 1, risk: 0.04,
              blurb: 'Table, umbrella, and everybody cash passing through your hand. Some days are very sweet.' },
        ],

        // A wage, weekly, paid whether or not the week went well — so long
        // as you turned up. week is what it pays; hours is one shift.
        jobs: [
            { id: 'attend', name: 'Shop attendant', week: 130, hours: 6, needs: {},
              blurb: 'Small pay, but it enters every week without fail.' },

            { id: 'teach', name: 'Teacher', week: 168, hours: 7,
              needs: { item: 'cert', exp: 4 },
              blurb: 'They will ask for your papers. Salary comes late sometimes, but it comes.' },

            { id: 'civil', name: 'Civil servant', week: 196, hours: 7,
              needs: { item: 'cert', exp: 6 }, where: 'abeokuta',
              blurb: 'Grade level, desk, pension talk. This is what Abeokuta runs on.' },

            { id: 'teller', name: 'Bank teller', week: 242, hours: 9,
              needs: { item: 'cert', exp: 12 },
              blurb: 'Long hours behind the counter, and the best salary anybody will give you.' },
        ],
    },
};

const HOUSING_BY_ID = ECONOMY.housing.reduce((m, h) => (m[h.id] = h, m), {});

const Player = {

    KEY: 'runningboy_player',

    _p: null,

    /// The saved player, or null if nobody has been created yet.
    get() {
        if (this._p) return this._p;
        try {
            const raw = localStorage.getItem(this.KEY);
            if (raw) this._p = JSON.parse(raw);
        } catch (_) {}
        return this._p;
    },

    exists() { return !!this.get(); },

    save() {
        try { localStorage.setItem(this.KEY, JSON.stringify(this._p)); } catch (_) {}
        this._announce();
    },

    // ── Earning a living ──────────────────────────────────────────────────

    gigs()     { return ECONOMY.work.gigs; },
    jobsList() { return ECONOMY.work.jobs; },
    exp()      { const p = this.get(); return p ? (p.exp || 0) : 0; },
    job()      { const p = this.get(); if (!p || !p.job) return null;
                 return ECONOMY.work.jobs.find(j => j.id === p.job.id) || null; },
    shifts()   { const p = this.get(); return (p && p.job) ? p.job.shifts : 0; },

    /// Why you cannot do this one, or null if you can. Returning the reason
    /// rather than a boolean is what lets the panel say what is missing.
    blockedFrom(w) {
        const p = this.get();
        if (!p) return 'No one here.';
        const n = w.needs || {};
        if (w.where && p.city !== w.where)
            return 'Only in ' + getCity(w.where).name + '.';
        if (n.item && !this.has(n.item)) {
            const good = ECONOMY.goods.find(g => g.id === n.item);
            return 'Needs a ' + (good ? good.name.toLowerCase() : n.item) + '.';
        }
        if (n.exp && (p.exp || 0) < n.exp)
            return 'Needs ' + n.exp + ' shifts behind you — you have ' + (p.exp || 0) + '.';
        if (this.fitness() < 0.55) return 'You are in no state to work.';
        return null;
    },

    /// One shift of informal work. Paid on the spot, variable, and it costs
    /// you the hours and some of your condition.
    doGig(id) {
        const p = this.get();
        const g = ECONOMY.work.gigs.find(x => x.id === id);
        if (!p || !g || this.blockedFrom(g)) return null;

        const [lo, hi] = g.pay;
        const span = hi - lo;
        // Condition shows up in the takings: a tired hawker sells less.
        const paid = Math.max(1, Math.round(
            this.wage(lo + Math.random() * span, p.city) * (0.65 + 0.35 * this.fitness())));

        this.adjust(paid, g.name);
        p.exp = (p.exp || 0) + ECONOMY.work.EXP_PER_GIG;
        p.health = Math.max(0, p.health - (g.hurt || 0));

        // Some work can go wrong. It is the price of the better-paying kind.
        let mishap = null;
        if (g.risk && Math.random() < g.risk) {
            const lost = Math.min(p.skubu, Math.round(paid * 1.6));
            p.skubu -= lost;
            p.health = Math.max(0, p.health - 8);
            mishap = g.id === 'pos' ? 'They robbed your stand. You lost ' + lost
                                    : 'You fell off the bike. It cost you ' + lost;
            p.history.unshift({ amount: -lost, why: mishap, at: p.hours });
        }

        this.passTime(g.hours);
        if (p.health <= 0) this._collapse();
        this.save();
        return { paid, hours: g.hours, mishap, exp: p.exp };
    },

    /// Ask for a job. Experience and papers are the whole of the interview.
    applyFor(id) {
        const p = this.get();
        const j = ECONOMY.work.jobs.find(x => x.id === id);
        if (!p || !j || this.blockedFrom(j)) return null;
        p.job = { id: j.id, shifts: 0 };
        p.history.unshift({ amount: 0, why: 'Hired — ' + j.name, at: p.hours });
        this.save();
        return j;
    },

    quitJob() {
        const p = this.get();
        if (!p || !p.job) return false;
        const j = this.job();
        p.job = null;
        p.history.unshift({ amount: 0, why: 'Left the ' + (j ? j.name.toLowerCase() : 'job'), at: p.hours });
        this.save();
        return true;
    },

    /// Turning up. The wage arrives weekly regardless, but only if you did.
    workShift() {
        const p = this.get();
        const j = this.job();
        if (!p || !j) return null;
        if (this.fitness() < 0.5) return { refused: 'You are in no state to work.' };
        p.job.shifts += 1;
        p.exp = (p.exp || 0) + 1;
        this.passTime(j.hours);
        this.save();
        return { shifts: p.job.shifts, hours: j.hours, due: ECONOMY.work.SHIFTS_DUE };
    },

    /// Payday, with the rest of the week's bills. Turn up and it is yours;
    /// turn up sometimes and you get what you worked; do not turn up at all
    /// and somebody else gets the job.
    _payWages() {
        const p = this.get();
        const j = this.job();
        if (!p || !j) return;
        const due = ECONOMY.work.SHIFTS_DUE;
        const did = p.job.shifts;

        if (did === 0) {
            p.job = null;
            p.history.unshift({ amount: 0, why: 'They sacked you — you never showed up', at: p.hours });
            return;
        }
        const full = this.wage(j.week, p.city);
        const paid = did >= due ? full : Math.round(full * did / due);
        p.skubu += paid;
        p.history.unshift({
            amount: paid,
            why: did >= due ? j.name + ' — wages' : j.name + ' — part week (' + did + '/' + due + ')',
            at: p.hours,
        });
        p.job.shifts = 0;
    },

    /// Where you are standing, as a venue id. A position in another city is
    /// no position at all, so it falls back to somewhere in this one —
    /// which also means travel does not have to remember to move you.
    at() {
        const p = this.get();
        if (!p) return null;
        const here = p.at && getVenue(p.at);
        if (here && (here.city || this._cityOf(p.at)) === p.city) return p.at;
        const city = getCity(p.city);
        return (city && city.venues.length) ? city.venues[0].id : null;
    },

    _cityOf(venueId) {
        for (const c of CITIES) if (c.venues.some(v => v.id === venueId)) return c.id;
        return null;
    },

    atVenue() { const id = this.at(); return id ? getVenue(id) : null; },

    // ── Crossing town ─────────────────────────────────────────────────────

    /// Tiles between where you are and where you want to be.
    distanceTo(venueId) {
        const from = this.atVenue(), to = getVenue(venueId);
        if (!from || !to || from.id === to.id) return 0;
        const fx = from.gx + (from.gw || 2) / 2, fy = from.gy + (from.gd || 2) / 2;
        const tx = to.gx + (to.gw || 2) / 2,     ty = to.gy + (to.gd || 2) / 2;
        return Math.round(Math.hypot(tx - fx, ty - fy) * 10) / 10;
    },

    /// Every way of getting there, with what it costs and how long it takes.
    /// A mode that does not serve the trip is left out rather than shown
    /// greyed, because a list of things you cannot do is not a list.
    ridesTo(venueId) {
        const p = this.get();
        if (!p) return [];
        const dist = this.distanceTo(venueId);
        if (!dist) return [];
        const list = ECONOMY.transit[p.city] || ECONOMY.transit.lagos;
        return list.filter(mdl => {
            if (mdl.minDist && dist < mdl.minDist) return false;
            if (mdl.maxDist && dist > mdl.maxDist) return false;
            return true;
        }).map(mdl => ({
            id: mdl.id, name: mdl.name, blurb: mdl.blurb, risk: mdl.risk || 0,
            fare:  Math.round(mdl.fare + mdl.per * dist),
            hours: Math.max(0.25, Math.round((mdl.pace * dist) * 4) / 4),
            tiring: !!mdl.tiring,
        })).sort((a, b) => a.fare - b.fare);
    },

    /// Make the trip. Charges the fare, spends the hours, and puts you there.
    rideTo(venueId, modeId) {
        const p = this.get();
        if (!p) return null;
        const ride = this.ridesTo(venueId).find(r => r.id === modeId);
        if (!ride) return null;
        if (ride.fare > 0 && !this.adjust(-ride.fare, ride.name)) return null;

        let mishap = null;
        if (ride.risk && Math.random() < ride.risk) {
            p.health = Math.max(0, p.health - 9);
            mishap = 'You fell off on the way. That one pained you.';
            p.history.unshift({ amount: 0, why: mishap, at: p.hours });
        }
        // Walking is free in money and expensive in everything else.
        if (ride.tiring) p.rest = Math.max(0, p.rest - Math.round(ride.hours * 4));

        p.commuted = (p.commuted || 0) + ride.hours;
        this.passTime(ride.hours);
        p.at = venueId;
        if (p.health <= 0) this._collapse();
        this.save();
        return { ...ride, mishap };
    },

    moveTo(venueId) {
        const p = this.get();
        if (!p || !venueId) return;
        p.at = venueId;
        this.save();
    },

    /// Pick a class by weight. Passing one in is for tests.
    rollClass(forceId) {
        const list = ECONOMY.classes;
        if (forceId) return list.find(c => c.id === forceId) || list[0];
        const total = list.reduce((a, c) => a + c.weight, 0);
        let r = Math.random() * total;
        for (const c of list) { r -= c.weight; if (r <= 0) return c; }
        return list[list.length - 1];
    },

    social() {
        const p = this.get();
        if (!p) return ECONOMY.classes[0];
        return ECONOMY.classes.find(c => c.id === p.social) || ECONOMY.classes[0];
    },

    grit() { return this.social().grit || 1; },
    pull() { return this.social().pull || 1; },

    /// Where a roofless player sleeps. Named, not generic, because "under
    /// the bridge" is a place and "no fixed address" is a form field.
    spot() {
        const p = this.get();
        if (!p) return ECONOMY.SPOTS[0];
        if (p.housing !== 'none') return (HOUSING_BY_ID[p.housing] || {}).name || '';
        return p.spot || ECONOMY.SPOTS[0];
    },

    /// A new player: an avatar, a city, and whatever they were born into.
    create({ name, avatar, city, social }) {
        const cls = this.rollClass(social);
        this._p = {
            name:    (name || 'ANON').toUpperCase().slice(0, 12),
            avatar:  avatar,
            city:    city,
            social:  cls.id,
            spot:    ECONOMY.SPOTS[Math.floor(Math.random() * ECONOMY.SPOTS.length)],
            skubu:   cls.skubu,
            housing: cls.housing,
            loan:    cls.loan ? { owed: cls.loan.owed, perWeek: cls.loan.perWeek } : null,
            owns:    [],          // houses owned, each { city, tenant }
            land:    [],          // plots: { city, stage, work, crew, paid }
            hours:   0,           // in-game hours elapsed
            items:   [],          // what you own
            theft:   null,        // what you took and have not paid for
            arrest:  null,        // picked up, and due in court
            prison:  0,           // hour you are released
            record:  0,           // previous convictions
            health:  100,
            illness: null,        // { id, since }
            fed:     true,
            rest:    100,
            mind:    100,
            commuted: 0,      // hours travelled since the last night
            at:      null,        // the venue you are standing at
            job:     null,        // { id, shifts } once somebody hires you
            exp:     0,           // shifts worked, which is what gets you hired
            dead:    null,        // { cause, at } once it is over
            rentDue: ECONOMY.WEEK_HOURS,
            history: [],
        };
        this._p.history.push({
            amount: cls.skubu,
            why: 'Born ' + cls.name + (cls.skubu ? '' : ' — with nothing'),
            at: 0,
        });
        try { localStorage.setItem('runningboy_city', city); } catch (_) {}
        try { localStorage.setItem('runningboy_name', this._p.name); } catch (_) {}
        this.save();
        return this._p;
    },

    // ── Money ─────────────────────────────────────────────────────────────

    skubu() { const p = this.get(); return p ? p.skubu : 0; },

    /// Positive to earn, negative to spend. Spending more than you have is
    /// refused rather than allowed to go negative — there is no credit here.
    adjust(amount, why) {
        const p = this.get();
        if (!p) return false;
        if (amount < 0 && p.skubu + amount < 0) return false;
        // Whole numbers: it is a currency, not a score, and half a skubu
        // buys nothing.
        p.skubu = Math.max(0, Math.round(p.skubu + amount));
        p.history.unshift({ amount, why, at: p.hours });
        p.history = p.history.slice(0, 40);
        this.save();
        return true;
    },

    /// What a city charges for something priced in Lagos terms.
    price(base, cityId) {
        const c = ECONOMY.cities[cityId || (this.get() || {}).city] || ECONOMY.cities.lagos;
        return Math.round(base * c.cost);
    },

    /// What a let house brings in. Rent is not simply a share of what
    /// things cost: Lagos is in demand and Abeokuta is not, which is the
    /// reason to graduate from building where it is cheap to building where
    /// it pays. Without this both cities returned the same and the choice
    /// was flat.
    rentIncome(cityId) {
        const id = cityId || this.cityId();
        const c = ECONOMY.cities[id] || ECONOMY.cities.lagos;
        return Math.round(this.price(HOUSING_BY_ID.own.letsFor, id) * (c.demand || 1));
    },

    /// What a city pays for work priced in Lagos terms.
    wage(base, cityId) {
        const c = ECONOMY.cities[cityId || (this.get() || {}).city] || ECONOMY.cities.lagos;
        return Math.round(base * c.pay * this.pull());
    },

    // ── Time ──────────────────────────────────────────────────────────────
    // Hours are the other currency. Walking between cities is free and
    // costs a day; the fare costs money and costs an hour.

    passTime(hours, why) {
        const p = this.get();
        if (!p) return;
        const was = p.hours;
        p.hours += hours;
        while (p.hours >= p.rentDue) { p.rentDue += ECONOMY.WEEK_HOURS; this._charge_rent(); }
        // Days that went by while that happened, each with its own roll.
        this._buildHours(hours);
        const d0 = Math.floor(was / 24), d1 = Math.floor(p.hours / 24);
        for (let d = d0; d < d1; d++) this._aDay();
        this.save();
    },

    // ── Health ────────────────────────────────────────────────────────────

    health()  { const p = this.get(); return p ? p.health : 100; },
    illness() { const p = this.get(); return p ? p.illness : null; },
    sleepsRough() {
        const p = this.get();
        return !!p && !HOUSING_BY_ID[p.housing].sleeps;
    },

    // ── A night ───────────────────────────────────────────────────────────

    /// How long you actually sleep, which is a question about where you are.
    sleepHours() {
        const p = this.get();
        if (!p) return ECONOMY.sleep.NEED;
        if (p.hotelNight) return ECONOMY.sleep.HOURS.hotel;
        return ECONOMY.sleep.HOURS[p.housing] || ECONOMY.sleep.HOURS.none;
    },

    _aNight() {
        const p = this.get(), S = ECONOMY.sleep, M = ECONOMY.mind;
        // Where you sleep sets a ceiling you settle towards, rather than a
        // slope. As a difference it matters: adding (slept - NEED) each night
        // meant a face-me-I-face-you, at seven hours, lost rest every night
        // for ever — the entry rung on the ladder sentenced you to permanent
        // sleep deprivation, and through it to the wellbeing floor. The
        // exponent is what keeps a rough night genuinely bad: three and a
        // half hours settles near 29, a rented room near 82, a flat at 100.
        const slept = this.sleepHours();
        const ceiling = Math.min(100, Math.pow(slept / S.NEED, 1.5) * 100);
        p.rest = Math.max(0, Math.min(100, p.rest + (ceiling - p.rest) * S.SETTLE));
        p.hotelNight = false;

        // Named pressures, each one something the player can act on, rather
        // than a number that falls because the game says so.
        const city  = ECONOMY.cities[p.city] || ECONOMY.cities.lagos;
        const food  = this.price(ECONOMY.health.FOOD_PER_DAY, p.city);
        // The city multiplies the pressure rather than adding a little of
        // its own: density, traffic, noise and the cost of living are what
        // make the same circumstances harder in Lagos than in Abeokuta.
        // Illness is the exception — that is yours wherever you are.
        let drain = M.BASE;
        if (this.sleepsRough())   drain += M.NO_HOME / this.grit();
        if (p.rest < S.TIRED)     drain += M.POOR_SLEEP;
        if (p.skubu < food * 3)   drain += M.BROKE;
        drain += (p.commuted || 0) * M.COMMUTE;
        drain *= (city.stress || 1);
        if (p.illness)            drain += M.ILL;
        p.commuted = 0;

        const settled = !this.sleepsRough() && p.rest >= 60 && p.skubu >= food * 7 && !p.illness;
        p.mind = Math.max(0, Math.min(100, p.mind - drain + (settled ? M.SETTLED : 0)));

        // And a ceiling, because recovery alone pinned everybody at 100 the
        // moment they were housed and fed — which made wellbeing a flat
        // bonus rather than something the city does to you. Lagos never
        // gives all of it back: the density, the traffic and the cost are
        // still there on a good week, which is the finding this is modelling.
        const mindCap = Math.max(10, 100
            - (city.stress || 1) * 22
            - (this.sleepsRough() ? 26 : 0)
            - (p.illness ? 14 : 0)
            - (p.skubu < food * 3 ? 12 : 0));
        // A clamp, not a drift: nightly recovery is +6 and the drift was -2,
        // so wellbeing crept back to 100 anyway and the ceiling did nothing.
        // The ceiling is the best this life can feel, so it is a limit.
        p.mind = Math.min(p.mind, mindCap);
    },

    rest() { const p = this.get(); return p ? p.rest : 100; },
    mind() { const p = this.get(); return p ? p.mind : 100; },

    /// A bed for the night, bought. Costs the fare and the hours.
    sleepAtHotel() {
        const p = this.get();
        if (!p) return null;
        const cost = this.price(ECONOMY.HOTEL_NIGHT, p.city);
        if (!this.adjust(-cost, 'A night at the hotel')) return null;
        p.hotelNight = true;
        this.passTime(ECONOMY.sleep.HOURS.hotel);
        return { cost, hours: ECONOMY.sleep.HOURS.hotel };
    },

    hotelPrice(cityId) { return this.price(ECONOMY.HOTEL_NIGHT, cityId || this.cityId()); },
    clinicFee(cityId)  { return this.price(ECONOMY.CLINIC_FEE, cityId || this.cityId()); },

    // ── What a clinic would tell you ──────────────────────────────────────
    // Findings, then what would actually help. Each line names a cause the
    // player can do something about, because a report that only says you are
    // unwell is not a report.

    checkUp() {
        const p = this.get();
        if (!p) return null;
        const S = ECONOMY.sleep, M = ECONOMY.mind;
        const fee = this.clinicFee(p.city);
        if (!this.adjust(-fee, 'Clinic')) return null;

        const findings = [], advice = [];
        const slept = this.sleepHours();

        if (p.illness) {
            findings.push('You have malaria right now.');
            advice.push('Buy tablets today. It is taking ' + ECONOMY.health.DRAIN + ' health off you every day.');
        }
        if (slept < S.NEED - 1) {
            findings.push('You are sleeping about ' + slept + ' hours a night. You need ' + S.NEED + '.');
            advice.push(this.sleepsRough()
                ? 'Get a bed anywhere — one night in a hotel, or rent a room.'
                : 'A better place would give you the full night.');
        }
        if (p.rest < S.TIRED) {
            findings.push('You are run down. When you do not sleep well, sickness finds you easily.');
            advice.push('Rest properly before you work again.');
        }
        if (p.mind < M.LOW) {
            findings.push('Where and how you are living is wearing you down badly.');
        } else if (p.mind < 55) {
            findings.push('You are starting to show the strain.');
        }
        if (p.mind < 55) {
            const other = p.city === 'lagos' ? 'abeokuta' : 'lagos';
            if ((ECONOMY.cities[other].stress || 1) < (ECONOMY.cities[p.city].stress || 1)) {
                advice.push(getCityName(other) + ' is quieter. The crowd, the go-slow and the cost here are telling on you.');
            }
            if (this.sleepsRough()) advice.push('Getting your own place would help more than anything else.');
        }
        if (!p.fed) { findings.push('You are not eating enough.'); advice.push('Eat first, before you spend on anything else.'); }
        if (!findings.length) findings.push('Nothing is wrong. You are managing yourself well.');
        if (!advice.length)   advice.push('Keep doing what you are doing.');

        return { fee, findings, advice, health: p.health, rest: p.rest, mind: p.mind, slept };
    },

    /// A microfinance repayment, weekly, whether or not it is convenient.
    /// Missing it does not evict you — it grows, which is the trap.
    _serviceLoan() {
        const p = this.get();
        if (!p || !p.loan || p.loan.owed <= 0) return;
        const due = Math.min(p.loan.owed, this.price(p.loan.perWeek, p.city));
        if (p.skubu >= due) {
            p.skubu -= due;
            p.loan.owed -= due;
            p.history.unshift({
                amount: -due,
                why: p.loan.owed > 0 ? 'LAPO repayment' : 'LAPO loan cleared',
                at: p.hours,
            });
            if (p.loan.owed <= 0) p.loan = null;
        } else {
            const interest = Math.max(1, Math.round(p.loan.owed * 0.08));
            p.loan.owed += interest;
            p.history.unshift({ amount: 0, why: 'Missed LAPO — you now owe ' + p.loan.owed, at: p.hours });
        }
    },

    loan() { const p = this.get(); return p ? p.loan : null; },

    /// Clear it early, if you ever have the money.
    repayLoan() {
        const p = this.get();
        if (!p || !p.loan) return false;
        if (!this.adjust(-p.loan.owed, 'LAPO loan cleared')) return false;
        p.loan = null;
        this.save();
        return true;
    },

    /// Risk for a single night, as the market panel should quote it.
    malariaRisk() {
        const h = ECONOMY.health;
        let r = this.sleepsRough() ? h.RISK_ROUGH : h.RISK_HOUSED;
        if (this.has('net')) r *= h.NET_FACTOR;
        const p = this.get();
        if (p && p.rest < ECONOMY.sleep.TIRED) r *= ECONOMY.sleep.IMMUNE;
        return r;
    },

    _aDay() {
        const p = this.get(), h = ECONOMY.health;
        if (p.dead) return;

        // The first couple of days are on whatever you arrived with. A game
        // that can kill you before you have worked out where the game house
        // is does not get a second session.
        if (p.hours < h.GRACE_DAYS * 24) { p.fed = true; return; }

        // You eat if you can afford to. Being too poor to is the thing that
        // kills people here, not any single disaster.
        const food = this.price(h.FOOD_PER_DAY, p.city);
        if (p.skubu >= food) {
            p.skubu -= food;
            p.fed = true;
        } else {
            p.fed = false;
            p.health -= h.HUNGER_DRAIN;
            p.history.unshift({ amount: 0, why: 'Went without food', at: p.hours });
        }

        if (!p.illness && Math.random() < this.malariaRisk()) {
            p.illness = { id: 'malaria', since: p.hours };
            p.history.unshift({ amount: 0, why: 'Came down with malaria', at: p.hours });
        }
        this._aNight();

        if (p.illness) p.health = Math.max(0, p.health - h.DRAIN);
        else p.health = Math.min(100, p.health +
            (this.sleepsRough() ? h.RECOVER_ROUGH : h.RECOVER));

        // Short sleep weakens you directly, and so does being worn down.
        if (p.rest < ECONOMY.sleep.TIRED) p.health -= 4;
        if (p.mind < ECONOMY.mind.LOW)    p.health -= 2;
        p.health = Math.max(0, Math.min(100, p.health));
        if (p.health <= 0) this._collapse();
    },

    /// Collapsing is survivable if you can pay for it. That is the whole
    /// shape of this game: the hospital is there, and it is not free.
    _collapse() {
        const p = this.get(), h = ECONOMY.health;
        const bill = this.price(h.HOSPITAL, p.city);
        if (p.skubu < bill) {
            this._die(p.illness ? 'Malaria, and nothing left for the hospital'
                                : 'Hunger, and nothing left for the hospital');
            return;
        }
        p.skubu -= bill;
        p.illness = null;
        p.health = 45;
        p.hours += h.HOSPITAL_HOURS;
        p.history.unshift({ amount: -bill, why: 'Hospital', at: p.hours });
    },

    _die(cause) {
        const p = this.get();
        p.dead = { cause, at: p.hours, day: Math.floor(p.hours / 24) + 1 };
        p.health = 0;
        p.history.unshift({ amount: 0, why: 'Died — ' + cause, at: p.hours });
    },

    // ── What a body can still do ──────────────────────────────────────────

    alive() { const p = this.get(); return !!p && !p.dead; },
    dead()  { const p = this.get(); return p ? p.dead : null; },

    /// Too weak to outrun anyone, so the market is not worth trying.
    canSteal() {
        const p = this.get();
        return !!p && !p.dead && !p.theft && !this.inPrison() &&
               p.health >= ECONOMY.health.STEAL_MIN;
    },

    /// How well the legs work, as a multiplier the runs apply to speed. Being
    /// ill or hungry shows up in the game rather than only on a bar.
    fitness() {
        const p = this.get();
        if (!p) return 1;
        let f = Math.max(0.5, Math.min(1, p.health / ECONOMY.health.WEAK));
        if (p.illness) f *= 0.88;
        if (!p.fed)    f *= 0.92;
        if (p.rest < ECONOMY.sleep.TIRED) f *= 0.86;   // reaction time
        if (p.mind < ECONOMY.mind.LOW)    f *= 0.90;
        f *= this.grit();                               // or the lack of it

        // Grit is a real edge, not a licence: a hardened runner beats a soft
        // one, but nobody outruns the police by having been born poor.
        return Math.max(0.40, Math.min(1.15, f));
    },

    /// Start over. The city does not remember you.
    startAgain() {
        this._p = null;
        try { localStorage.removeItem(this.KEY); } catch (_) {}
        this._announce();
    },

    /// Tablets clear it and put some of you back. They are consumed.
    treat() {
        const p = this.get();
        if (!p || !p.illness) return false;
        p.illness = null;
        p.health = Math.min(100, p.health + 34);
        p.history.unshift({ amount: 0, why: 'Treated the malaria', at: p.hours });
        this.save();
        return true;
    },

    day()  { const p = this.get(); return p ? Math.floor(p.hours / 24) + 1 : 1; },
    hourOfDay() { const p = this.get(); return p ? p.hours % 24 : 9; },

    /// Wait for something to open. Hours are the only thing it costs, which
    /// is not nothing once rent and hunger are running.
    waitHours(n) { if (n > 0) this.passTime(n); return n; },
    clock() {
        const p = this.get();
        const h = p ? p.hours % 24 : 0;
        return String(h).padStart(2, '0') + ':00';
    },

    /// The week's bill. Rent is only part of it: the loan falls due whether
    /// or not you have a roof, and the roofless player is precisely the one
    /// carrying it, so none of this can sit behind a rent check.
    _charge_rent() {
        const p = this.get();
        const h = HOUSING_BY_ID[p.housing];

        if (h && h.rent) {
            const due = this.price(h.rent, p.city);
            if (p.skubu >= due) {
                p.skubu -= due;
                p.history.unshift({ amount: -due, why: 'Rent', at: p.hours });
            } else {
                // Cannot pay: you are out, which is the whole point of rent.
                p.housing = 'none';
                p.history.unshift({ amount: 0, why: 'Landlord threw you out — rent no pay', at: p.hours });
            }
        }

        this._payWages();
        this._serviceLoan();

        // Anything let out pays its way back.
        for (const house of p.owns) {
            if (!house.tenant) continue;
            const income = this.rentIncome(house.city);
            p.skubu += income;
            p.history.unshift({ amount: income, why: 'Rent from ' + house.city, at: p.hours });
        }
    },

    // ── Where you are ─────────────────────────────────────────────────────

    cityId() { const p = this.get(); return p ? p.city : 'lagos'; },

    /// Which ways of getting there both ends actually serve.
    routes(fromCity, toCity) {
        const a = ECONOMY.cities[fromCity], b = ECONOMY.cities[toCity];
        if (!a || !b) return [];
        return ECONOMY.transport.filter(t =>
            a.serves.includes(t.id) && b.serves.includes(t.id));
    },

    /// A scheduled service may not be due when you turn up, and the wait is
    /// part of what it costs you.
    waitFor(mode) {
        const p = this.get();
        if (!p || !mode.every) return 0;
        return (mode.every - (p.hours % mode.every)) % mode.every;
    },

    fareFor(mode, fromCity) { return this.price(mode.fare, fromCity); },

    /// Returns what the journey cost, or null if it could not be made.
    travel(toCity, modeId) {
        const p = this.get();
        if (!p || p.city === toCity) return null;
        const mode = this.routes(p.city, toCity).find(t => t.id === modeId);
        if (!mode) return null;

        const fare = this.fareFor(mode, p.city);
        if (fare && !this.adjust(-fare, mode.name + ' to ' + toCity)) return null;
        const wait = this.waitFor(mode);
        p.commuted = (p.commuted || 0) + wait + mode.hours;
        this.passTime(wait + mode.hours);
        p.city = toCity;
        this.save();
        return { fare, hours: mode.hours, wait, mode: mode.name };
    },

    // ── Where you live ────────────────────────────────────────────────────

    housing() { return HOUSING_BY_ID[(this.get() || {}).housing] || HOUSING_BY_ID.none; },

    /// Take a tenancy. The first week is due up front, as it would be.
    rent(id) {
        const p = this.get(), h = HOUSING_BY_ID[id];
        if (!p || !h || !h.rent) return false;
        const due = this.price(h.rent, p.city);
        if (!this.adjust(-due, h.name + ' — first week')) return false;
        p.housing = id;
        p.rentDue = p.hours + ECONOMY.WEEK_HOURS;
        this.save();
        return true;
    },

    buyHouse(cityId) {
        const p = this.get();
        if (!p) return false;
        const cost = this.price(HOUSING_BY_ID.own.buy, cityId || p.city);
        if (!this.adjust(-cost, 'Bought a house in ' + (cityId || p.city))) return false;
        p.owns.push({ city: cityId || p.city, tenant: false });
        if (p.housing === 'none' || HOUSING_BY_ID[p.housing].rent) p.housing = 'own';
        this.save();
        return true;
    },

    /// Letting one out turns a cost into an income.
    letOut(index) {
        const p = this.get();
        if (!p || !p.owns[index]) return false;
        p.owns[index].tenant = true;
        this.save();
        return true;
    },

    // ── Earning ───────────────────────────────────────────────────────────

    /// Paid for a run at the game house, scaled by what the city pays.
    payForRun(score, cityId) {
        const paid = this.wage(score * ECONOMY.PAY_PER_POINT, cityId);
        if (paid <= 0) return 0;
        this.adjust(paid, 'Game house');
        return paid;
    },

    payForFight(won, cityId) {
        const paid = won ? this.wage(ECONOMY.FIGHT_PURSE, cityId) : ECONOMY.FIGHT_LOSS;
        if (paid > 0) this.adjust(paid, 'Purse at the club');
        return paid;
    },

    // ── Things ────────────────────────────────────────────────────────────

    goods() { return ECONOMY.goods; },
    priceOf(id, cityId) {
        const g = ECONOMY.goods.find(x => x.id === id);
        return g ? this.price(g.price, cityId) : 0;
    },

    buy(id) {
        const p = this.get(), g = ECONOMY.goods.find(x => x.id === id);
        if (!p || !g) return false;
        if (!this.adjust(-this.priceOf(id, p.city), 'Bought ' + g.name)) return false;
        this._take(g);
        return true;
    },

    /// Walking out with it. Nothing is owned yet — that is settled by the
    /// run, and until it is, the debt is what the chase is about.
    steal(id) {
        const p = this.get(), g = ECONOMY.goods.find(x => x.id === id);
        if (!p || !g || p.theft) return false;
        p.theft = { id: g.id, name: g.name, owed: this.priceOf(id, p.city), city: p.city };
        this.save();
        return p.theft;
    },

    theft() { const p = this.get(); return p ? p.theft : null; },

    /// Got away with the cost covered: it is yours.
    settleTheft(kept) {
        const p = this.get();
        if (!p || !p.theft) return null;
        const t = p.theft;
        p.theft = null;
        if (kept) {
            const g = ECONOMY.goods.find(x => x.id === t.id);
            if (g) this._take(g);
            p.history.unshift({ amount: 0, why: 'Paid off the ' + t.name, at: p.hours });
        } else {
            p.history.unshift({ amount: 0, why: 'Lost the ' + t.name, at: p.hours });
        }
        this.save();
        return t;
    },

    _take(g) {
        const p = this.get();
        if (g.cures) { this.treat(); return; }      // taken, not kept
        if (g.keeps && this.has(g.id)) return;      // one net is enough
        p.items.push({ id: g.id, name: g.name, at: p.hours });
        // Clothes go straight on, so what you took is what you are wearing.
        if (g.wears && g.colour) { p.avatar[g.wears] = g.colour; }
        this.save();
    },

    has(id) { const p = this.get(); return !!(p && p.items.some(i => i.id === id)); },

    // ── The law ───────────────────────────────────────────────────────────

    /// Caught with it. The thing goes back now; what happens to you is
    /// settled in court.
    arrest(itemName) {
        const p = this.get();
        if (!p) return;
        p.theft  = null;
        p.arrest = { item: itemName, at: p.hours };
        this.save();
    },

    arrested()  { const p = this.get(); return p ? p.arrest : null; },
    inPrison()  { const p = this.get(); return !!(p && p.hours < p.prison); },
    prisonLeft() { const p = this.get(); return p ? Math.max(0, p.prison - p.hours) : 0; },

    lawyers() { return ECONOMY.lawyers; },
    lawyerFee(id, cityId) {
        const l = ECONOMY.lawyers.find(x => x.id === id);
        return l ? this.price(l.fee, cityId) : 0;
    },

    /// Instruct one and take the verdict. Returns { won, lawyer, fee, until }
    /// or null if the fee could not be met.
    standTrial(lawyerId) {
        const p = this.get();
        const l = ECONOMY.lawyers.find(x => x.id === lawyerId);
        if (!p || !p.arrest || !l) return null;

        const fee = this.lawyerFee(l.id, p.city);
        if (fee && !this.adjust(-fee, l.name)) return null;

        // A record counts against you, so the second time costs more than
        // the first in something other than money.
        const odds = Math.max(0.04, l.odds - p.record * 0.08);
        const won  = Math.random() < odds;
        const item = p.arrest.item;
        p.arrest = null;

        if (won) {
            p.history.unshift({ amount: 0, why: 'Bailed — ' + l.name, at: p.hours });
        } else {
            p.record += 1;
            p.prison = p.hours + ECONOMY.PRISON_HOURS;
            p.history.unshift({ amount: 0, why: 'Convicted over the ' + item, at: p.hours });
        }
        this.save();
        return { won, lawyer: l, fee, until: p.prison, odds };
    },

    /// Sit it out. Nothing else happens in prison, which is the cost.
    serveTime() {
        {
            const q = this.get();
            if (q && q.job) {
                q.job = null;
                q.history.unshift({ amount: 0, why: 'Lost the job while you were inside', at: q.hours });
            }
        }
        const left = this.prisonLeft();
        if (left > 0) this.passTime(left);
        return left;
    },

    // ── Land, and what it takes to build on it ────────────────────────────

    landCfg() { return ECONOMY.land; },
    plots()   { const p = this.get(); return p ? p.land : []; },

    plotPrice(cityId) { return this.price(ECONOMY.land.PLOT, cityId || this.cityId()); },

    buyLand(cityId) {
        const p = this.get();
        if (!p) return false;
        const city = cityId || p.city;
        if (!this.adjust(-this.plotPrice(city), 'Bought land in ' + city)) return false;
        p.land.push({ city, stage: 0, work: 0, crew: 0, paid: false });
        this.save();
        return true;
    },

    /// Materials for the stage about to start. Nothing moves until they are
    /// on site, which is why a crew with no materials is just a wage bill.
    materialsDue(i) {
        const p = this.get(), L = ECONOMY.land;
        const plot = p && p.land[i];
        if (!plot || plot.stage >= L.STAGES.length) return 0;
        return this.price(L.MATERIALS[plot.stage], plot.city);
    },

    buyMaterials(i) {
        const p = this.get(), plot = p && p.land[i];
        if (!plot || plot.paid) return false;
        const due = this.materialsDue(i);
        if (!this.adjust(-due, ECONOMY.land.STAGES[plot.stage] + ' materials')) return false;
        plot.paid = true;
        this.save();
        return true;
    },

    /// Crew size is the only lever on speed, and it is charged by the hour
    /// whether or not there is anything for them to do.
    setCrew(i, n) {
        const p = this.get(), plot = p && p.land[i];
        if (!plot) return false;
        plot.crew = Math.max(0, Math.min(ECONOMY.land.MAX_CREW, Math.round(n)));
        this.save();
        return true;
    },

    crewCostPerHour() {
        const p = this.get();
        if (!p) return 0;
        return p.land.reduce((a, pl) => a + this.price(ECONOMY.land.WAGE_HOUR, pl.city) * pl.crew, 0);
    },

    /// Called as hours go by. Wages come out first; work only happens on a
    /// site that has been paid for and still has stages left.
    _buildHours(hours) {
        const p = this.get(), L = ECONOMY.land;
        for (const plot of p.land) {
            if (!plot.crew) continue;
            const wage = this.price(L.WAGE_HOUR, plot.city) * plot.crew * hours;
            if (p.skubu < wage) {
                // Cannot make payroll: they walk, which is its own lesson.
                plot.crew = 0;
                p.history.unshift({ amount: 0, why: 'Crew left — you no pay them', at: p.hours });
                continue;
            }
            p.skubu -= wage;
            if (plot.stage >= L.STAGES.length || !plot.paid) continue;

            plot.work += plot.crew * hours;
            while (plot.paid && plot.work >= L.WORK_STAGE && plot.stage < L.STAGES.length) {
                plot.work -= L.WORK_STAGE;
                plot.stage += 1;
                plot.paid = false;
                p.history.unshift({
                    amount: 0,
                    why: plot.stage >= L.STAGES.length
                        ? 'Finished building in ' + plot.city
                        : L.STAGES[plot.stage - 1] + ' done in ' + plot.city,
                    at: p.hours,
                });
            }
            if (plot.stage >= L.STAGES.length) {
                // A finished build is a house like any other, and can be let.
                p.owns.push({ city: plot.city, tenant: false, built: true });
                plot.done = true;
                if (p.housing === 'none') p.housing = 'own';
            }
        }
        p.land = p.land.filter(pl => !pl.done);
    },

    plotProgress(i) {
        const p = this.get(), L = ECONOMY.land, plot = p && p.land[i];
        if (!plot) return 0;
        return Math.min(1, (plot.stage * L.WORK_STAGE + plot.work) / (L.STAGES.length * L.WORK_STAGE));
    },

    // ── What to do next ───────────────────────────────────────────────────
    // A player should never have to ask what they are supposed to be doing.
    // One line, always true, always the most pressing thing — and it names a
    // place, so it is somewhere to go rather than advice.

    nextGoal() {
        const p = this.get();
        if (!p) return null;
        const h = ECONOMY.health;

        if (p.dead)        return { text: 'You did not make it. Start again.',            act: 'death' };
        if (p.arrest)      return { text: 'You are due in court. Go and answer am.',             act: 'court' };
        if (this.inPrison()) return { text: 'You are inside. ' + this.prisonLeft() + ' hours to go.', act: 'prison' };
        if (p.theft)        return { text: 'Keep running. You still owe ' + p.theft.owed + ' for what you took.', act: 'run' };

        const meds = this.priceOf('meds', p.city);
        if (p.illness && p.skubu >= meds)
            return { text: 'You have malaria. Go and buy tablets — they cost ' + meds + '.', find: 'shop' };
        if (p.illness)
            return { text: 'You have malaria and cannot afford the ' + meds + ' for tablets. Go and work.', find: 'work' };

        if (p.rest < ECONOMY.sleep.TIRED && p.skubu >= this.hotelPrice(p.city))
            return { text: 'You are only sleeping ' + this.sleepHours() + ' hours. Go and find a proper bed.', find: 'hotel' };
        if (p.mind < ECONOMY.mind.LOW)
            return { text: 'You are worn out. Go to a clinic and find out why.', find: 'clinic' };

        if (p.health < 35)
            return { text: 'You are too weak to work. Eat first, then find a room.', find: 'agent' };

        const net = this.priceOf('net', p.city);
        if (this.sleepsRough() && !this.has('net') && p.skubu >= net)
            return { text: 'You are sleeping outside. Buy a mosquito net for ' + net + ' before malaria catches you.', find: 'shop' };

        const room = this.price(HOUSING_BY_ID.room.rent, p.city);
        if (this.sleepsRough() && p.skubu >= room)
            return { text: 'You can afford a room now — ' + room + ' a week. Go and rent one.', find: 'agent' };
        if (this.sleepsRough())
            return { text: 'You have nowhere to sleep. A room costs ' + room + ' a week, so go and earn it.', find: 'work' };

        // A site with nobody on it, or nothing for them to do, is the most
        // wasteful thing you can own — so it outranks buying anything else.
        for (let i = 0; i < p.land.length; i++) {
            const plot = p.land[i];
            const mats = this.materialsDue(i);
            if (!plot.paid && p.skubu >= mats)
                return { text: 'Your site needs ' + mats + ' of materials for the ' + ECONOMY.land.STAGES[plot.stage].toLowerCase() + '.', find: 'agent' };
            if (!plot.paid)
                return { text: 'Your building has stopped. You need ' + mats + ' for materials.', find: 'work' };
            if (!plot.crew)
                return { text: 'Materials are on site but nobody is working. Hire a crew.', find: 'agent' };
        }

        if (p.loan && p.loan.owed > 0 && p.skubu >= p.loan.owed)
            return { text: 'Pay off LAPO. It is ' + p.loan.owed + ', and it only grows from here.', find: 'agent' };

        const plot = this.plotPrice(p.city);
        if (!p.land.length && !p.owns.length && p.skubu >= plot)
            return { text: 'Land here costs ' + plot + '. Buy a plot, build on it, then rent it out.', find: 'agent' };

        const house = this.price(HOUSING_BY_ID.own.buy, p.city);
        if (!p.owns.length && p.skubu >= house)
            return { text: 'You can buy a place outright now, for ' + house + '.', find: 'agent' };

        const idle = p.owns.filter(o => !o.tenant).length;
        if (idle) return { text: 'You have a house in ' + idle + ' sitting empty. Rent it out and let it pay you.', find: 'agent' };

        return { text: 'Keep working, keep eating. That is the whole game.', find: 'work' };
    },

    // ── Change notices ────────────────────────────────────────────────────

    _watchers: [],
    onChange(fn) { this._watchers.push(fn); },
    _announce() { for (const fn of this._watchers) { try { fn(this._p); } catch (_) {} } },
};
