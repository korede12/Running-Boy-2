// ── Living in the city ────────────────────────────────────────────────────
// The panels that are not games: making a person, finding somewhere to
// sleep, and getting from one city to the other. They all read and write
// Player; none of them know anything about Phaser.

// ── Making a person ───────────────────────────────────────────────────────

let _draft = null;

function openCreate() {
    _draft = Object.assign({}, Avatar.DEFAULT, Avatar.random());
    renderCreate();
    document.getElementById('create-modal').classList.add('open');
}

function setAvatar(key, value) {
    _draft[key] = value;
    renderCreate();
}

function rollAvatar() { _draft = Avatar.random(); renderCreate(); }

function renderCreate() {
    const prev = document.getElementById('create-preview');
    if (prev) prev.innerHTML = Avatar.svg(_draft, 140, 220);

    const swatches = (key, list) => list.map(c =>
        `<button class="sw${_draft[key] === c ? ' on' : ''}" style="background:${c}" ` +
        `onclick="setAvatar('${key}','${c}')" aria-label="${c}"></button>`).join('');
    const chips = (key, list) => list.map(o =>
        `<button class="chip${_draft[key] === o.id ? ' on' : ''}" ` +
        `onclick="setAvatar('${key}','${o.id}')">${o.label}</button>`).join('');

    const set = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
    set('opt-build',   chips('build', Avatar.OPTIONS.build));
    set('opt-hair',    chips('hair', Avatar.OPTIONS.hair));
    set('opt-skin',    swatches('skin', Avatar.OPTIONS.skin));
    set('opt-haircol', swatches('hairCol', Avatar.OPTIONS.hairCol));
    set('opt-top',     swatches('top', Avatar.OPTIONS.top));
    set('opt-legs',    swatches('legs', Avatar.OPTIONS.legs));
    set('opt-shoes',   swatches('shoes', Avatar.OPTIONS.shoes));

    // Where to start. The two cities are not the same offer and the card
    // should say so rather than letting someone find out in an hour.
    set('opt-city', CITIES.map(c => {
        const e = ECONOMY.cities[c.id];
        return `<button class="citycard${_draft.city === c.id ? ' on' : ''}" onclick="setAvatar('city','${c.id}')">` +
               `<span class="cc-name">${c.name}</span>` +
               `<span class="cc-note">${e.note}</span>` +
               `<span class="cc-nums">rent &times;${e.cost.toFixed(2)} &nbsp;·&nbsp; pay &times;${e.pay.toFixed(2)}</span></button>`;
    }).join(''));
}

function confirmCreate() {
    const nameEl = document.getElementById('create-name');
    const name = (nameEl && nameEl.value || '').trim() || 'ANON';
    if (!_draft.city) _draft.city = CITIES[0].id;
    const { build, skin, hair, hairCol, top, legs, shoes, city } = _draft;
    Player.create({ name, city, avatar: { build, skin, hair, hairCol, top, legs, shoes } });
    closeModal('create-modal');
    if (typeof CityMap !== 'undefined') { CityMap.build(); CityMap.centre(); }
    refreshLifeHud();
    refreshGoal();
}

// ── Somewhere to sleep ────────────────────────────────────────────────────

function openEstate() {
    renderEstate();
    document.getElementById('estate-modal').classList.add('open');
}

function renderEstate() {
    const host = document.getElementById('estate-body');
    if (!host) return;
    const p = Player.get();
    if (!p) { host.innerHTML = '<div class="est-none">Make a person first.</div>'; return; }

    const city = getCity(p.city);
    const now  = Player.housing();
    const rows = ECONOMY.housing.filter(h => h.id !== 'none').map(h => {
        const price = Player.price(h.buy || h.rent, p.city);
        const owned = h.id === 'own' && p.owns.some(o => o.city === p.city);
        const here  = now.id === h.id;
        const can   = p.skubu >= price;
        const action = h.id === 'own'
            ? (owned ? 'OWNED' : `BUY · ${price}`)
            : (here ? 'CURRENT' : `RENT · ${price}/wk`);
        const dis = here || owned || !can;
        const fn = h.id === 'own' ? `buyHome()` : `rentHome('${h.id}')`;
        return `<div class="est-row${here ? ' on' : ''}">` +
               `<span class="est-name">${h.name}</span>` +
               `<span class="est-sub">${h.id === 'own' ? 'Yours. Can be let out.' : 'Weekly, in advance.'}</span>` +
               `<button class="est-btn" ${dis ? 'disabled' : ''} onclick="${fn}">${action}</button></div>`;
    }).join('');

    const mine = p.owns.length ? p.owns.map((o, i) =>
        `<div class="est-row"><span class="est-name">House in ${getCity(o.city).name}</span>` +
        `<span class="est-sub">${o.tenant ? 'Let out · ' + Player.rentIncome(o.city) + '/wk' : 'Empty'}</span>` +
        `<button class="est-btn" ${o.tenant ? 'disabled' : ''} onclick="letHome(${i})">` +
        `${o.tenant ? 'LET' : 'LET IT OUT'}</button></div>`).join('') : '';

    host.innerHTML = renderLand(p) +
        `<div class="est-head">${city.name} &nbsp;·&nbsp; prices &times;${ECONOMY.cities[p.city].cost.toFixed(2)}` +
        `<span class="est-bal">&#10022; ${p.skubu}</span></div>` +
        `<div class="est-now">Living: <b>${now.name}</b></div>` + rows +
        (mine ? `<div class="est-head">What you own</div>${mine}` : '');
}

function rentHome(id) {
    if (Player.rent(id)) { renderEstate(); refreshLifeHud(); }
    else flash('Not enough skubu for the first week.');
}
function buyHome() {
    if (Player.buyHouse()) { renderEstate(); refreshLifeHud(); }
    else flash('Not enough skubu.');
}
function letHome(i) { Player.letOut(i); renderEstate(); refreshLifeHud(); }

// ── Getting there ─────────────────────────────────────────────────────────

function openTravel(toCity) {
    const p = Player.get();
    if (!p) { openCreate(); return; }
    const to = getCity(toCity);
    const host = document.getElementById('travel-body');

    if (host) {
        const runs = Player.routes(p.city, toCity);
        const rows = runs.map(t => {
            const fare = Player.fareFor(t, p.city);
            const wait = Player.waitFor(t);
            const can  = p.skubu >= fare;
            const when = wait ? `${t.hours}h, after ${wait}h waiting` : `${t.hours}h`;
            return `<div class="est-row">` +
                `<span class="est-name">${t.name}</span>` +
                `<span class="est-sub">${when} &nbsp;·&nbsp; ${t.note}</span>` +
                `<button class="est-btn" ${can ? '' : 'disabled'} ` +
                `onclick="doTravel('${toCity}','${t.id}')">` +
                `${fare ? '&#10022; ' + fare : 'FREE'}</button></div>`;
        }).join('');

        // Say what does not run from here, rather than leaving a gap where a
        // service the player expected ought to have been.
        const missing = ECONOMY.transport
            .filter(t => !runs.some(r => r.id === t.id))
            .map(t => t.name.toLowerCase());

        host.innerHTML =
            `<div class="trv-to">${getCity(p.city).name} &rarr; ${to.name}</div>` + rows +
            (missing.length
                ? `<div class="shop-note">No ${missing.join(' or ')} on this route.</div>`
                : '');
    }
    document.getElementById('travel-modal').classList.add('open');
}

function doTravel(toCity, modeId) {
    const from = getCity(Player.cityId()).name;
    const startHour = Player.get().hours % 24;

    const r = Player.travel(toCity, modeId);
    closeModal('travel-modal');
    if (!r) { flash('You cannot afford that.'); return; }
    try { localStorage.setItem('runningboy_city', toCity); } catch (_) {}

    // The map is rebuilt behind the journey, so the city is already the new
    // one by the time the screen lifts.
    const arrive = () => {
        if (typeof CityMap !== 'undefined') { CityMap.build(); CityMap.centre(); }
        refreshLifeHud();
    refreshGoal();
    };

    if (typeof Journey === 'undefined') { arrive(); return; }
    Journey.play({
        mode: modeId, modeName: r.mode,
        fromName: from, toName: getCity(toCity).name,
        hours: r.hours, wait: r.wait, fare: r.fare, startHour,
    }, arrive);
}

// ── The strip along the top ───────────────────────────────────────────────

function refreshLifeHud() {
    const p = Player.get();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    if (!p) { set('life-skubu', '0'); set('life-where', ''); return; }
    set('life-skubu', String(p.skubu));
    set('life-day', `Day ${Player.day()} · ${Player.clock()}`);
    set('life-home', Player.housing().name);
    const hp = document.getElementById('life-health');
    if (hp) {
        const h = Player.health();
        hp.style.width = h + '%';
        hp.className = 'lh-fill' + (Player.illness() ? ' ill' : h < 40 ? ' low' : '');
    }
    const rb = document.getElementById('life-rest');
    if (rb) { rb.style.width = Player.rest() + '%'; rb.className = 'lh-fill rest' + (Player.rest() < ECONOMY.sleep.TIRED ? ' low' : ''); }
    const mb = document.getElementById('life-mind');
    if (mb) { mb.style.width = Player.mind() + '%'; mb.className = 'lh-fill mind' + (Player.mind() < ECONOMY.mind.LOW ? ' low' : ''); }
    const hl = document.getElementById('life-ill');
    if (hl) hl.textContent = Player.illness() ? 'malaria' : (Player.get().fed ? '' : 'hungry');
    const av = document.getElementById('life-avatar');
    if (av) av.innerHTML = Avatar.svg(p.avatar, 44, 60);
}

function flash(msg) {
    if (typeof CityMap !== 'undefined' && CityMap.banner) CityMap.banner(msg);
}

/// A player with no record gets the one screen that matters first.
// Anything that moves the wallet redraws every place it is shown, so the
// strip and the old badge can never disagree about the balance.
if (typeof Player !== 'undefined') {
    Player.onChange(() => {
        refreshLifeHud();
    refreshGoal();
        const badge = document.getElementById('skubu-count');
        if (badge) badge.textContent = String(Player.skubu());
    });
}

document.addEventListener('DOMContentLoaded', () => {
    refreshLifeHud();
    refreshGoal();
    // A chase that ended in handcuffs is picked up here, because the court
    // is a panel on this page rather than a screen inside the run.
    if (typeof Player !== 'undefined' && Player.exists()) {
        if (!Player.alive())        setTimeout(openDeath, 200);
        else if (Player.arrested()) setTimeout(openCourt, 250);
        else if (Player.inPrison()) setTimeout(openPrison, 250);
    }
    const badge = document.getElementById('skubu-count');
    if (badge && typeof Player !== 'undefined' && Player.exists()) badge.textContent = String(Player.skubu());
    if (typeof Player !== 'undefined' && !Player.exists()) setTimeout(openCreate, 150);
});

// ── The market ────────────────────────────────────────────────────────────
// Where the chase comes from. You can pay for a thing, or you can take it,
// and taking it is not a free option — it starts a run you have to finish.

function openShop() {
    renderShop();
    document.getElementById('shop-modal').classList.add('open');
}

function renderShop() {
    const host = document.getElementById('shop-body');
    if (!host) return;
    const p = Player.get();
    if (!p) { host.innerHTML = '<div class="est-none">Make a person first.</div>'; return; }

    if (p.theft) {
        host.innerHTML =
            `<div class="est-head">Unfinished business</div>` +
            `<div class="est-row"><span class="est-name">You are carrying a ${p.theft.name}</span>` +
            `<span class="est-sub">${p.theft.owed} skubu not paid. Finish the run.</span>` +
            `<button class="est-btn" onclick="runFromMarket()">RUN</button></div>`;
        return;
    }

    const ill   = Player.illness();
    const rough = Player.sleepsRough();

    const rows = Player.goods().map(g => {
        const cost = Player.priceOf(g.id, p.city);
        const can  = p.skubu >= cost;
        const owned = Player.has(g.id);
        const why =
            g.id === 'net'  ? ' · cuts the mosquitoes right down' :
            g.id === 'meds' ? (ill ? ' · you have it now' : ' · for when you do') :
            g.wears ? ' · you would wear it' : '';
        return `<div class="est-row">` +
            `<span class="est-name">${g.name}${owned ? ' <small>· owned</small>' : ''}</span>` +
            `<span class="est-sub">${cost} skubu${why}</span>` +
            (can
                ? `<button class="est-btn" onclick="buyGood('${g.id}')">BUY · ${cost}</button>`
                : Player.canSteal()
                    ? `<button class="est-btn take" onclick="stealGood('${g.id}')">TAKE IT</button>`
                    : `<button class="est-btn" disabled>TOO WEAK</button>`) +
            `</div>`;
    }).join('');

    host.innerHTML =
        `<div class="est-head">${getCity(p.city).name} market<span class="est-bal">&#10022; ${p.skubu}</span></div>` +
        rows +
        `<div class="shop-note">Nothing you cannot afford is locked. It is just not paid for, ` +
        `and the market will come after you for it.</div>`;
}

function buyGood(id) {
    if (Player.buy(id)) { renderShop(); refreshLifeHud(); }
    else flash('Not enough skubu.');
}

/// Taking it starts the run immediately — there is no screen between the
/// decision and the consequence.
function stealGood(id) {
    const t = Player.steal(id);
    if (!t) return;
    closeModal('shop-modal');
    runFromMarket();
}

function runFromMarket() {
    try { localStorage.setItem('runningboy_venue', 'theft'); } catch (_) {}
    selectCharacter('portable');
    startGame();
}

// ── Court ─────────────────────────────────────────────────────────────────
// Being caught is a court date. What you can afford in counsel is what your
// odds are, which is the choice the panel is really offering.

function openCourt() {
    renderCourt();
    document.getElementById('court-modal').classList.add('open');
}

function renderCourt() {
    const host = document.getElementById('court-body');
    if (!host) return;
    const p = Player.get();
    const a = p && p.arrest;
    if (!a) { host.innerHTML = '<div class="est-none">Nothing outstanding.</div>'; return; }

    const rows = Player.lawyers().map(l => {
        const fee  = Player.lawyerFee(l.id, p.city);
        const odds = Math.max(0.04, l.odds - p.record * 0.08);
        const can  = p.skubu >= fee;
        return `<div class="est-row">` +
            `<span class="est-name">${l.name}</span>` +
            `<span class="est-sub">${Math.round(odds * 100)}% chance &nbsp;·&nbsp; ${l.note}</span>` +
            `<button class="est-btn" ${can ? '' : 'disabled'} onclick="instruct('${l.id}')">` +
            `${fee ? '&#10022; ' + fee : 'FREE'}</button></div>`;
    }).join('');

    host.innerHTML =
        `<div class="court-charge">Taken in over the ${a.item}.` +
        (p.record ? ` <b>${p.record} previous</b>, which the bench will remember.` : '') +
        `</div>` +
        `<div class="est-head">Counsel<span class="est-bal">&#10022; ${p.skubu}</span></div>` + rows +
        `<div class="shop-note">Lose and it is ${ECONOMY.PRISON_HOURS} hours inside. ` +
        `Nothing earns while you are in there.</div>`;
}

function instruct(lawyerId) {
    const r = Player.standTrial(lawyerId);
    if (!r) { flash('You cannot cover that fee.'); return; }
    const host = document.getElementById('court-body');
    if (host) {
        host.innerHTML = r.won
            ? `<div class="court-verdict won">BAILED</div>` +
              `<div class="court-charge">${r.lawyer.name} got you out. You walk.</div>` +
              `<button class="est-btn" onclick="closeCourt()">LEAVE</button>`
            : `<div class="court-verdict lost">CONVICTED</div>` +
              `<div class="court-charge">${ECONOMY.PRISON_HOURS} hours inside. ` +
              `Your record is now ${Player.get().record}.</div>` +
              `<button class="est-btn" onclick="closeCourt()">TAKEN DOWN</button>`;
    }
    refreshLifeHud();
    refreshGoal();
}

function closeCourt() {
    closeModal('court-modal');
    if (Player.inPrison()) openPrison();
    if (typeof CityMap !== 'undefined') { CityMap.build(); CityMap.centre(); }
}

// ── Prison ────────────────────────────────────────────────────────────────

function openPrison() {
    const host = document.getElementById('prison-body');
    if (host) {
        host.innerHTML =
            `<div class="court-verdict lost">${Player.prisonLeft()}h</div>` +
            `<div class="court-charge">There is nothing to do in here and nothing to earn. ` +
            `The rent still falls due.</div>` +
            `<button class="est-btn" onclick="doTime()">SIT IT OUT</button>`;
    }
    document.getElementById('prison-modal').classList.add('open');
}

function doTime() {
    Player.serveTime();
    closeModal('prison-modal');
    refreshLifeHud();
    refreshGoal();
    if (typeof CityMap !== 'undefined') { CityMap.build(); CityMap.centre(); CityMap.banner('Released'); }
}

// ── The end ───────────────────────────────────────────────────────────────
// Surviving is the game, so not surviving is the only real ending.

function openDeath() {
    const d = Player.dead();
    if (!d) return;
    const p = Player.get();
    const host = document.getElementById('death-body');
    if (host) {
        const owned = p.owns.length;
        host.innerHTML =
            `<div class="court-verdict lost">YOU DIED</div>` +
            `<div class="court-charge">${d.cause}.</div>` +
            `<div class="est-head">What you managed</div>` +
            `<div class="est-row"><span class="est-name">Days survived</span>` +
            `<span class="est-sub">in ${getCity(p.city).name}</span>` +
            `<button class="est-btn" disabled>${d.day}</button></div>` +
            `<div class="est-row"><span class="est-name">Last address</span>` +
            `<span class="est-sub">${owned ? owned + ' owned' : 'nothing owned'}</span>` +
            `<button class="est-btn" disabled>${Player.housing().name}</button></div>` +
            `<div class="est-row"><span class="est-name">Left behind</span>` +
            `<span class="est-sub">${p.items.length} things</span>` +
            `<button class="est-btn" disabled>&#10022; ${p.skubu}</button></div>` +
            `<div class="shop-note">Nobody here will remember you. Start again.</div>` +
            `<button class="est-btn" onclick="startAgain()">START AGAIN</button>`;
    }
    document.getElementById('death-modal').classList.add('open');
}

function startAgain() {
    Player.startAgain();
    closeModal('death-modal');
    openCreate();
}

// ── What to do next ───────────────────────────────────────────────────────
// One line, always the most pressing thing, and tapping it takes you there.
// The research is blunt about this: a player who has to ask what they are
// supposed to be doing is a player who stops.

function refreshGoal() {
    const el = document.getElementById('goal');
    if (!el) return;
    const g = (typeof Player !== 'undefined' && Player.exists()) ? Player.nextGoal() : null;
    if (!g) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.className = 'goal' + (g.act ? ' urgent' : '');
    el.innerHTML = `<span class="goal-dot"></span><span class="goal-text">${g.text}</span>` +
                   `<span class="goal-go">&rsaquo;</span>`;
    el.onclick = () => doGoal(g);
}

function doGoal(g) {
    if (g.act === 'death')  return openDeath();
    if (g.act === 'court')  return openCourt();
    if (g.act === 'prison') return openPrison();
    if (g.act === 'run')    return runFromMarket();

    const v = findVenue(g.find);
    if (!v) return;
    if (typeof CityMap !== 'undefined') CityMap.pick(v.id);
}

// ── Land and building ─────────────────────────────────────────────────────
// A plot is cheap next to a finished house, and the distance between them is
// paid in wages and weeks. It is the game's medium-term goal: buy where land
// is cheap, earn where the money is, and come back to pay the crew.

function renderLand(p) {
    const L = Player.landCfg();
    const plotCost = Player.plotPrice(p.city);

    const sites = p.land.map((plot, i) => {
        const pct   = Math.round(Player.plotProgress(i) * 100);
        const stage = plot.stage < L.STAGES.length ? L.STAGES[plot.stage] : 'Done';
        const mats  = Player.materialsDue(i);
        const wage  = Player.price(L.WAGE_HOUR, plot.city) * plot.crew;

        const crew = [0, 1, 2, 4, 6].map(n =>
            `<button class="chip${plot.crew === n ? ' on' : ''}" onclick="setCrew(${i},${n})">${n || 'none'}</button>`
        ).join('');

        return `<div class="site">` +
            `<div class="site-top"><b>Plot in ${getCity(plot.city).name}</b>` +
            `<span>${stage} &nbsp;·&nbsp; ${pct}%</span></div>` +
            `<div class="site-bar"><span style="width:${pct}%"></span></div>` +
            (plot.paid
                ? `<div class="site-note">Materials on site. ${plot.crew
                    ? plot.crew + ' working · ' + wage + ' skubu an hour'
                    : 'Nobody working.'}</div>`
                : `<div class="site-note warnish">${stage} needs ${mats} in materials ` +
                  `before anyone can start.</div>` +
                  `<button class="est-btn" ${p.skubu < mats ? 'disabled' : ''} ` +
                  `onclick="buyMaterials(${i})">BUY MATERIALS &#10022; ${mats}</button>`) +
            `<div class="site-crew"><span>Crew</span>${crew}</div>` +
        `</div>`;
    }).join('');

    const payroll = Player.crewCostPerHour();
    return `<div class="est-head">Land` +
        (payroll ? `<span class="est-bal">&#10022; ${payroll}/hr in wages</span>` : '') +
        `</div>` + sites +
        `<div class="est-row"><span class="est-name">A plot in ${getCity(p.city).name}</span>` +
        `<span class="est-sub">Then ${L.STAGES.length} stages, ` +
        `${L.STAGES.length * L.WORK_STAGE} labourer-hours, and materials.</span>` +
        `<button class="est-btn" ${p.skubu < plotCost ? 'disabled' : ''} ` +
        `onclick="buyLand()">BUY &#10022; ${plotCost}</button></div>`;
}

function buyLand()        { if (Player.buyLand()) { renderEstate(); refreshLifeHud(); } else flash('Not enough skubu.'); }
function buyMaterials(i)  { if (Player.buyMaterials(i)) { renderEstate(); refreshLifeHud(); } else flash('Not enough skubu.'); }
function setCrew(i, n)    { Player.setCrew(i, n); renderEstate(); refreshLifeHud(); }

// ── A bed, and a check-up ─────────────────────────────────────────────────

function openHotel(v) {
    const p = Player.get();
    if (!p) { openCreate(); return; }
    const cost = Player.hotelPrice(p.city);
    const host = document.getElementById('hotel-body');
    if (host) {
        host.innerHTML =
            `<div class="trv-to">${v.name}</div>` +
            `<div class="est-row"><span class="est-name">A night</span>` +
            `<span class="est-sub">${ECONOMY.sleep.HOURS.hotel} hours, which is a full one. ` +
            `You are getting ${Player.sleepHours()} where you are.</span>` +
            `<button class="est-btn" ${p.skubu < cost ? 'disabled' : ''} ` +
            `onclick="takeRoom()">&#10022; ${cost}</button></div>` +
            `<div class="shop-note">Short sleep weakens the immune system, so the ` +
            `mosquitoes find it easier, and it slows you down when you run.</div>`;
    }
    document.getElementById('hotel-modal').classList.add('open');
}

function takeRoom() {
    const r = Player.sleepAtHotel();
    closeModal('hotel-modal');
    if (!r) { flash('Not enough skubu.'); return; }
    refreshLifeHud();
    if (typeof CityMap !== 'undefined') { CityMap.build(); CityMap.banner('Slept ' + r.hours + 'h · -' + r.cost); }
}

function openClinic(v) {
    const p = Player.get();
    if (!p) { openCreate(); return; }
    const fee = Player.clinicFee(p.city);
    const host = document.getElementById('clinic-body');
    if (host) {
        host.innerHTML =
            `<div class="trv-to">${v.name}</div>` +
            `<div class="est-row"><span class="est-name">Consultation</span>` +
            `<span class="est-sub">A look at everything, and what would help.</span>` +
            `<button class="est-btn" ${p.skubu < fee ? 'disabled' : ''} ` +
            `onclick="seeDoctor()">&#10022; ${fee}</button></div>`;
    }
    document.getElementById('clinic-modal').classList.add('open');
}

function seeDoctor() {
    const r = Player.checkUp();
    if (!r) { flash('Not enough skubu.'); return; }
    const host = document.getElementById('clinic-body');
    const bar = (label, v, cls) =>
        `<div class="vital"><span>${label}</span>` +
        `<span class="vital-track"><span class="vital-fill ${cls}" style="width:${v}%"></span></span>` +
        `<b>${Math.round(v)}</b></div>`;
    if (host) {
        host.innerHTML =
            `<div class="est-head">Vitals</div>` +
            bar('Physical', r.health, r.health < 40 ? 'low' : '') +
            bar('Rested',   r.rest,   r.rest < ECONOMY.sleep.TIRED ? 'low' : '') +
            bar('Wellbeing', r.mind,  r.mind < ECONOMY.mind.LOW ? 'low' : '') +
            `<div class="est-head">Findings</div>` +
            r.findings.map(f => `<div class="rep">${f}</div>`).join('') +
            `<div class="est-head">What would help</div>` +
            r.advice.map(a => `<div class="rep good">${a}</div>`).join('') +
            `<button class="est-btn" onclick="closeModal('clinic-modal')">THANK YOU</button>`;
    }
    refreshLifeHud();
}
