// ── Work ──────────────────────────────────────────────────────────────────
// Where you earn a living, which is no longer the same place you go to play
// a game. Two ways up, and the choice between them is the real one:
//
//   A gig pays today, varies wildly, and pays nothing at all on a week you
//   are ill, locked up, or short of a bike.
//   A job pays every week whether or not the week went well — provided you
//   turned up at least four times.
//
// At the top a hustle out-earns a wage, which is true and is why anybody
// does it. The floor is what makes it frightening.

function openWork(v) {
    const p = Player.get();
    if (!p) { openCreate(); return; }
    renderWork(v);
    document.getElementById('work-modal').classList.add('open');
}

function renderWork(v) {
    const host = document.getElementById('work-body');
    if (!host) return;
    const p = Player.get();
    if (!p) { host.innerHTML = '<div class="est-none">Make a person first.</div>'; return; }

    const job = Player.job();
    const where = v || Player.atVenue();

    host.innerHTML =
        (where ? `<div class="trv-to">${where.name}</div>` : '') +
        `<div class="wk-exp">You have worked ${Player.exp()} shifts. The better jobs ask for experience.</div>` +
        renderPost(job, p) +
        '<div class="est-head">Work going today</div>' +
        Player.gigs().map(g => gigRow(g, p)).join('') +
        '<div class="est-head">Jobs</div>' +
        Player.jobsList().map(j => jobRow(j, p, job)).join('');
}

/// Your current position, if anyone has hired you.
function renderPost(job, p) {
    if (!job) return '';
    const due = ECONOMY.work.SHIFTS_DUE;
    const did = Player.shifts();
    const pay = Player.wage(job.week, p.city);
    return `<div class="wk-post">` +
        `<div class="wk-post-top"><b>${job.name}</b>` +
        `<span>&#10022; ${pay} a week</span></div>` +
        `<div class="wk-shifts">` +
        Array.from({ length: due }, (_, i) =>
            `<span class="wk-pip${i < did ? ' on' : ''}"></span>`).join('') +
        `<em>${did}/${due} shifts this week</em></div>` +
        `<div class="wk-note">${did >= due
            ? 'You have done the full week. Your salary is safe.'
            : 'You have not done the full week yet. Short week, short pay.'}</div>` +
        `<button class="est-btn" onclick="clockIn()">Clock in &nbsp;·&nbsp; ${job.hours}h of your day</button>` +
        `<button class="ghost small" onclick="leaveJob()">Resign</button>` +
    `</div>`;
}

function gigRow(g, p) {
    const why = Player.blockedFrom(g);
    const [lo, hi] = g.pay;
    return `<div class="est-row${why ? ' off' : ''}">` +
        `<span class="est-name">${g.name}</span>` +
        `<span class="est-sub">${g.blurb}</span>` +
        `<span class="wk-meta">${g.hours}h &nbsp;·&nbsp; ` +
        `&#10022; ${Player.wage(lo, p.city)}&ndash;${Player.wage(hi, p.city)}` +
        (g.risk ? ' &nbsp;·&nbsp; <i>risky</i>' : '') + `</span>` +
        (why ? `<span class="wk-why">${why}</span>`
             : `<button class="est-btn" onclick="takeGig('${g.id}')">Do this shift</button>`) +
    `</div>`;
}

function jobRow(j, p, current) {
    const mine = current && current.id === j.id;
    const why = mine ? null : Player.blockedFrom(j);
    return `<div class="est-row${mine ? ' on' : why ? ' off' : ''}">` +
        `<span class="est-name">${j.name}</span>` +
        `<span class="est-sub">${j.blurb}</span>` +
        `<span class="wk-meta">${j.hours}h a shift &nbsp;·&nbsp; ` +
        `&#10022; ${Player.wage(j.week, p.city)} a week</span>` +
        (mine ? `<button class="est-btn" disabled>You work here</button>`
              : why ? `<span class="wk-why">${why}</span>`
                    : `<button class="est-btn" onclick="applyJob('${j.id}')">Ask for the job</button>`) +
    `</div>`;
}

// ── Doing it ──────────────────────────────────────────────────────────────

function takeGig(id) {
    const r = Player.doGig(id);
    if (!r) { flash('Not today — check what it needs.'); return; }
    refreshLifeHud();
    renderWork();
    const g = Player.gigs().find(x => x.id === id);
    if (r.mishap) flash(r.mishap);
    else flash(g.name + ' · +' + r.paid);
    if (typeof CityMap !== 'undefined') CityMap.build();
}

function applyJob(id) {
    const j = Player.applyFor(id);
    if (!j) { flash('They said no. Come back with more experience.'); return; }
    refreshLifeHud();
    renderWork();
    flash('You got the job — ' + j.name);
}

function clockIn() {
    const r = Player.workShift();
    if (!r) return;
    if (r.refused) { flash(r.refused); return; }
    refreshLifeHud();
    renderWork();
    flash('Shift done. ' + r.shifts + '/' + r.due);
    if (typeof CityMap !== 'undefined') CityMap.build();
}

function leaveJob() {
    if (!confirm('Resign? The salary stops immediately.')) return;
    Player.quitJob();
    refreshLifeHud();
    renderWork();
}

// ── Getting there ─────────────────────────────────────────────────────────
// Places are distances apart, so going to one costs a fare and some hours.
// Which fares you are offered depends on the city: Lagos has danfo, keke,
// BRT, a restricted okada, a ferry and Bolt; Abeokuta has okada, keke and a
// shared taxi, and is small enough that walking is a real choice.

let _rideTarget = null;

function openRide(v) {
    const p = Player.get();
    if (!p) { openCreate(); return; }
    _rideTarget = v.id;
    // Closing this panel without choosing should not strand an intention to
    // walk into somewhere you never travelled to.
    const back = document.getElementById('ride-modal');
    if (back) back.onclick = e => {
        if (e.target === back && typeof Place !== 'undefined') Place._reenter = null;
    };

    const dist  = Player.distanceTo(v.id);
    const rides = Player.ridesTo(v.id);
    const host  = document.getElementById('ride-body');
    if (host) {
        host.innerHTML =
            `<div class="trv-to">${v.name}</div>` +
            `<div class="rd-dist">${dist} tiles away, across ${getCity(p.city).name}</div>` +
            rides.map(r => {
                const can = r.fare === 0 || p.skubu >= r.fare;
                return `<div class="est-row${can ? '' : ' off'}">` +
                    `<span class="est-name">${r.name}</span>` +
                    `<span class="est-sub">${r.blurb}</span>` +
                    `<span class="wk-meta">${r.hours}h` +
                    (r.risk ? ' &nbsp;·&nbsp; <i>risky</i>' : '') + `</span>` +
                    `<button class="est-btn" ${can ? '' : 'disabled'} ` +
                    `onclick="takeRide('${r.id}')">` +
                    `${r.fare ? '&#10022; ' + r.fare : 'Walk it'}</button></div>`;
            }).join('') +
            `<div class="shop-note">Time still passes while you travel. Rent, ` +
            `hunger and mosquitoes do not wait for you.</div>`;
    }
    document.getElementById('ride-modal').classList.add('open');
}

function takeRide(modeId) {
    const id = _rideTarget;
    if (!id) return;
    const p = Player.get();
    const from = Player.atVenue();
    const to = getVenue(id);
    const r = Player.rideTo(id, modeId);
    closeModal('ride-modal');
    if (!r) { flash('Your money no reach.'); return; }

    const done = () => {
        refreshLifeHud();
        if (typeof CityMap !== 'undefined') CityMap.build();
        if (r.mishap) flash(r.mishap);
        // If you set out from inside somewhere, you arrive inside this one.
        if (typeof Place !== 'undefined' && Place._reenter === id) {
            Place._reenter = null;
            Place.enter(id);
            return;
        }
        CityMap.pick(id);
    };

    if (typeof Journey !== 'undefined' && r.hours >= 0.5) {
        Journey.play({
            mode: ({ walk: 'walk', ferry: 'water' })[r.id] || 'bus',
            modeName: r.name,
            fromName: from ? from.name : '',
            toName: to ? to.name : '',
            hours: r.hours, wait: 0, fare: r.fare,
            startHour: Player.hourOfDay(),
        }, done);
    } else done();
}
