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
        lagos:    { cost: 1.00, pay: 1.00, note: 'Busy, expensive, and where the money is.' },
        abeokuta: { cost: 0.58, pay: 0.62, note: 'Cheaper and slower. Civil service town.' },
    },

    FARE:        40,    // skubu, by road, between cities
    WALK_HOURS:  7,     // or do it on foot and lose the day
    RIDE_HOURS:  1,

    // What a run is worth. Deliberately small — a house is a lot of runs.
    PAY_PER_POINT: 0.9,
    FIGHT_PURSE:   120,
    FIGHT_LOSS:    0,

    // Somewhere to sleep. Rent is charged per in-game week.
    housing: [
        { id: 'none', name: 'No fixed address', rent: 0,  buy: 0,    sleeps: false },
        { id: 'room', name: 'Rented room',      rent: 28, buy: 0,    sleeps: true  },
        { id: 'flat', name: 'Rented flat',      rent: 85, buy: 0,    sleeps: true  },
        { id: 'own',  name: 'Own house',        rent: 0,  buy: 2400, sleeps: true, letsFor: 60 },
    ],

    WEEK_HOURS: 168,
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

    /// A new player: an avatar, a city, and nothing else.
    create({ name, avatar, city }) {
        this._p = {
            name:    (name || 'ANON').toUpperCase().slice(0, 12),
            avatar:  avatar,
            city:    city,
            skubu:   0,
            housing: 'none',
            owns:    [],          // houses owned, each { city, tenant }
            land:    [],          // plots bought, each { city, built, stage }
            hours:   0,           // in-game hours elapsed
            rentDue: ECONOMY.WEEK_HOURS,
            history: [],
        };
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

    /// What a city pays for work priced in Lagos terms.
    wage(base, cityId) {
        const c = ECONOMY.cities[cityId || (this.get() || {}).city] || ECONOMY.cities.lagos;
        return Math.round(base * c.pay);
    },

    // ── Time ──────────────────────────────────────────────────────────────
    // Hours are the other currency. Walking between cities is free and
    // costs a day; the fare costs money and costs an hour.

    passTime(hours, why) {
        const p = this.get();
        if (!p) return;
        p.hours += hours;
        while (p.hours >= p.rentDue) { p.rentDue += ECONOMY.WEEK_HOURS; this._charge_rent(); }
        this.save();
    },

    day()  { const p = this.get(); return p ? Math.floor(p.hours / 24) + 1 : 1; },
    clock() {
        const p = this.get();
        const h = p ? p.hours % 24 : 0;
        return String(h).padStart(2, '0') + ':00';
    },

    _charge_rent() {
        const p = this.get();
        const h = HOUSING_BY_ID[p.housing];
        if (!h || !h.rent) return;
        const due = this.price(h.rent, p.city);
        if (p.skubu >= due) {
            p.skubu -= due;
            p.history.unshift({ amount: -due, why: 'Rent', at: p.hours });
        } else {
            // Cannot pay: you are out, which is the whole point of rent.
            p.housing = 'none';
            p.history.unshift({ amount: 0, why: 'Evicted — rent unpaid', at: p.hours });
        }
        // Anything let out pays its way back.
        for (const house of p.owns) {
            if (!house.tenant) continue;
            const income = this.price(HOUSING_BY_ID.own.letsFor, house.city);
            p.skubu += income;
            p.history.unshift({ amount: income, why: 'Rent from ' + house.city, at: p.hours });
        }
    },

    // ── Where you are ─────────────────────────────────────────────────────

    cityId() { const p = this.get(); return p ? p.city : 'lagos'; },

    /// Returns what it cost, or null if the journey could not be made.
    travel(toCity, byRoad) {
        const p = this.get();
        if (!p || p.city === toCity) return null;
        if (byRoad) {
            const fare = this.price(ECONOMY.FARE, p.city);
            if (!this.adjust(-fare, 'Fare to ' + toCity)) return null;
            this.passTime(ECONOMY.RIDE_HOURS);
            p.city = toCity; this.save();
            return { fare, hours: ECONOMY.RIDE_HOURS };
        }
        this.passTime(ECONOMY.WALK_HOURS);
        p.city = toCity; this.save();
        return { fare: 0, hours: ECONOMY.WALK_HOURS };
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

    // ── Change notices ────────────────────────────────────────────────────

    _watchers: [],
    onChange(fn) { this._watchers.push(fn); },
    _announce() { for (const fn of this._watchers) { try { fn(this._p); } catch (_) {} } },
};
