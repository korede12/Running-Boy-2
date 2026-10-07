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
        `<span class="est-sub">${o.tenant ? 'Let out · ' + Player.price(60, o.city) + '/wk' : 'Empty'}</span>` +
        `<button class="est-btn" ${o.tenant ? 'disabled' : ''} onclick="letHome(${i})">` +
        `${o.tenant ? 'LET' : 'LET IT OUT'}</button></div>`).join('') : '';

    host.innerHTML =
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
    const fare = Player.price(ECONOMY.FARE, p.city);
    const host = document.getElementById('travel-body');
    if (host) {
        host.innerHTML =
            `<div class="trv-to">${getCity(p.city).name} &rarr; ${to.name}</div>` +
            `<div class="est-row"><span class="est-name">Take a bus</span>` +
            `<span class="est-sub">${ECONOMY.RIDE_HOURS} hour</span>` +
            `<button class="est-btn" ${p.skubu < fare ? 'disabled' : ''} ` +
            `onclick="doTravel('${toCity}',true)">PAY &#10022; ${fare}</button></div>` +
            `<div class="est-row"><span class="est-name">Walk it</span>` +
            `<span class="est-sub">${ECONOMY.WALK_HOURS} hours, and nothing earned</span>` +
            `<button class="est-btn" onclick="doTravel('${toCity}',false)">FREE</button></div>`;
    }
    document.getElementById('travel-modal').classList.add('open');
}

function doTravel(toCity, byRoad) {
    const r = Player.travel(toCity, byRoad);
    closeModal('travel-modal');
    if (!r) { flash('You cannot afford the fare.'); return; }
    try { localStorage.setItem('runningboy_city', toCity); } catch (_) {}
    if (typeof CityMap !== 'undefined') {
        CityMap.build(); CityMap.centre();
        CityMap.banner(`${getCity(toCity).name} · ${r.hours}h` + (r.fare ? ` · -${r.fare}` : ' on foot'));
    }
    refreshLifeHud();
}

// ── The strip along the top ───────────────────────────────────────────────

function refreshLifeHud() {
    const p = Player.get();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    if (!p) { set('life-skubu', '0'); set('life-where', ''); return; }
    set('life-skubu', String(p.skubu));
    set('life-day', `Day ${Player.day()} · ${Player.clock()}`);
    set('life-home', Player.housing().name);
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
        const badge = document.getElementById('skubu-count');
        if (badge) badge.textContent = String(Player.skubu());
    });
}

document.addEventListener('DOMContentLoaded', () => {
    refreshLifeHud();
    const badge = document.getElementById('skubu-count');
    if (badge && typeof Player !== 'undefined' && Player.exists()) badge.textContent = String(Player.skubu());
    if (typeof Player !== 'undefined' && !Player.exists()) setTimeout(openCreate, 150);
});
