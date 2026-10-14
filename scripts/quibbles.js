// ── Quibbles ──────────────────────────────────────────────────────────────
// The hangout, and what the tables in it are for: communities you can look
// through and join, a profile that is the person you made, and a table where
// you write a post.
//
// This is a front-end demo. The communities and the posts already in them
// are written here; what you join and what you post is kept in this browser
// and nowhere else, so nobody else sees it yet. When there is a backend, the
// three things to swap are _load, _save and the seed list.

const QUIBBLES_KEY = 'runningboy_quibbles';
const QUIBBLES_MAX = 280;

const QUIBBLES_COMMUNITIES = [
    { id: 'beats', name: 'Beatmakers', color: '#8e44ad',
      blurb: 'Loops, drums, and who sold what at Naijabeats.',
      posts: [
          { by: 'Tunde B', ago: '2h', text: 'Sold my first beat today. 40 skubu. Small, but it is a start.' },
          { by: 'Ada K',   ago: '5h', text: 'Who has a good log drum preset? Mine sounds like a door.' },
          { by: 'Femi',    ago: '1d', text: 'Amapiano at 112 or 115? Fight me.' },
      ] },
    { id: 'runners', name: 'Game House Runners', color: '#c8912e',
      blurb: 'High scores, cabinets, and the one jump everybody misses.',
      posts: [
          { by: 'Kolu',    ago: '1h', text: 'Oshodi cabinet three is faster than the others. I am sure of it.' },
          { by: 'Sade',    ago: '9h', text: 'Got past 2,000 for the first time. Hands still shaking.' },
      ] },
    { id: 'portable', name: 'Portable Watch', color: '#b03a6e',
      blurb: 'Where he is tonight, and who lasted how long.',
      posts: [
          { by: 'Mide',    ago: '3h', text: 'He is at Ake Club tonight. Somebody go and represent.' },
          { by: 'Jide O',  ago: '1d', text: 'Third Mainland chase: do not look back, just run.' },
      ] },
    { id: 'hustle', name: 'Hustle & Work', color: '#5b6b7a',
      blurb: 'Who is hiring, what it pays, and what it costs you.',
      posts: [
          { by: 'Bisi',    ago: '4h', text: 'Labour junction had nothing after ten. Go early or do not go.' },
          { by: 'Chinedu', ago: '2d', text: 'Secretariat pays slow but it pays every week. Peace of mind.' },
      ] },
    { id: 'lagos', name: 'Lagos Mainland', color: '#2874a6',
      blurb: 'Traffic, rent, and everything in between.',
      posts: [
          { by: 'Yemi',    ago: '30m', text: 'BRT from Ikeja this morning was actually on time. Write it down.' },
          { by: 'Ngozi',   ago: '6h', text: 'Rent went up again. Thinking about Abeokuta honestly.' },
      ] },
    { id: 'abeokuta', name: 'Under the Rock', color: '#1f7a4d',
      blurb: 'Abeokuta people. Olumo, adire, and quiet nights.',
      posts: [
          { by: 'Lanre',   ago: '2h', text: 'Itoku market has new adire in. Blue ones are the best.' },
          { by: 'Funke',   ago: '1d', text: 'Slept a full night at Gateway Lodge. Lagos could never.' },
      ] },
];

const Quibbles = {

    _view: 'explore',
    _community: null,

    // ── What this browser remembers ───────────────────────────────────────

    _load() {
        try {
            const d = JSON.parse(localStorage.getItem(QUIBBLES_KEY) || '{}');
            return { joined: Array.isArray(d.joined) ? d.joined : [],
                     posts:  Array.isArray(d.posts)  ? d.posts  : [] };
        } catch (_) { return { joined: [], posts: [] }; }
    },

    _save(d) {
        try { localStorage.setItem(QUIBBLES_KEY, JSON.stringify(d)); } catch (_) {}
    },

    _get(id) { return QUIBBLES_COMMUNITIES.find(c => c.id === id) || null; },

    _me() {
        const p = (typeof Player !== 'undefined' && Player.exists()) ? Player.get() : null;
        return p ? p.name : 'You';
    },

    // ── Opening ───────────────────────────────────────────────────────────

    /// Each table opens the same panel on a different page.
    open(view, communityId) {
        this._view = view || 'explore';
        this._community = communityId || null;
        this._render();
        const m = document.getElementById('qb-modal');
        if (m) m.classList.add('open');
    },

    close() {
        const m = document.getElementById('qb-modal');
        if (m) m.classList.remove('open');
    },

    _render() {
        const body = document.getElementById('qb-body');
        const title = document.getElementById('qb-title');
        if (!body) return;
        const page = {
            explore:   () => this._explore(),
            community: () => this._feed(this._community),
            profile:   () => this._profile(),
            post:      () => this._compose(),
        }[this._view] || (() => this._explore());
        const out = page();
        if (title) title.textContent = out.title;
        body.innerHTML = out.html;
    },

    // ── Pages ─────────────────────────────────────────────────────────────

    _explore() {
        const d = this._load();
        const rows = QUIBBLES_COMMUNITIES.map(c => {
            const n = c.posts.length + d.posts.filter(p => p.c === c.id).length;
            const on = d.joined.includes(c.id);
            return `<button class="qb-comm" onclick="Quibbles.open('community','${c.id}')">` +
                `<span class="qb-dot" style="background:${c.color}"></span>` +
                `<span class="qb-comm-txt"><b>${c.name}</b><span>${c.blurb}</span>` +
                `<small>${n} post${n === 1 ? '' : 's'}${on ? ' · joined' : ''}</small></span>` +
                `</button>`;
        }).join('');
        return { title: 'Explore communities', html: `<div class="qb-list">${rows}</div>` };
    },

    _feed(id) {
        const c = this._get(id);
        if (!c) return this._explore();
        const d = this._load();
        const on = d.joined.includes(c.id);
        const mine = d.posts.filter(p => p.c === c.id)
            .sort((a, b) => b.at - a.at)
            .map(p => this._postHtml(this._me(), this._ago(p.at), p.text, p.id));
        const seed = c.posts.map(p => this._postHtml(p.by, p.ago, p.text));
        return {
            title: c.name,
            html:
                `<div class="qb-bar">` +
                    `<button class="qb-link" onclick="Quibbles.open('explore')">&larr; All communities</button>` +
                `</div>` +
                `<div class="qb-about"><span class="qb-dot" style="background:${c.color}"></span>${c.blurb}</div>` +
                `<div class="qb-actions">` +
                    `<button class="est-btn${on ? ' qb-on' : ''}" onclick="Quibbles.toggleJoin('${c.id}')">${on ? 'JOINED' : 'JOIN'}</button>` +
                    `<button class="est-btn" onclick="Quibbles.open('post','${c.id}')">POST HERE</button>` +
                `</div>` +
                `<div class="qb-feed">${mine.concat(seed).join('')}</div>`,
        };
    },

    _profile() {
        const p = (typeof Player !== 'undefined' && Player.exists()) ? Player.get() : null;
        if (!p) return { title: 'My profile', html: '<div class="est-none">You need to make your person first.</div>' };
        const d = this._load();
        const joined = d.joined.map(id => this._get(id)).filter(Boolean);
        const posts = d.posts.slice().sort((a, b) => b.at - a.at);
        const av = (typeof Avatar !== 'undefined') ? Avatar.svg(p.avatar, 64, 100) : '';
        return {
            title: 'My profile',
            html:
                `<div class="qb-me">` +
                    `<div class="qb-av">${av}</div>` +
                    `<div class="qb-me-txt"><b>${this._esc(p.name)}</b>` +
                    `<span>${getCity(p.city).name}</span>` +
                    `<span>${joined.length} communit${joined.length === 1 ? 'y' : 'ies'} · ${posts.length} post${posts.length === 1 ? '' : 's'}</span></div>` +
                `</div>` +
                `<div class="est-head">Communities</div>` +
                (joined.length
                    ? `<div class="qb-chips">` + joined.map(c =>
                        `<button class="qb-chip" onclick="Quibbles.open('community','${c.id}')">` +
                        `<span class="qb-dot" style="background:${c.color}"></span>${c.name}</button>`).join('') + `</div>`
                    : `<div class="est-none">None yet. <button class="qb-link" onclick="Quibbles.open('explore')">Explore communities</button></div>`) +
                `<div class="est-head">My posts</div>` +
                (posts.length
                    ? `<div class="qb-feed">` + posts.map(x => {
                        const c = this._get(x.c);
                        return this._postHtml(c ? c.name : 'Quibbles', this._ago(x.at), x.text, x.id);
                    }).join('') + `</div>`
                    : `<div class="est-none">Nothing posted. <button class="qb-link" onclick="Quibbles.open('post')">Create a post</button></div>`),
        };
    },

    _compose() {
        const d = this._load();
        // Communities you have joined come first, since that is where you
        // are most likely to want to say something.
        const list = QUIBBLES_COMMUNITIES.slice().sort((a, b) =>
            (d.joined.includes(b.id) ? 1 : 0) - (d.joined.includes(a.id) ? 1 : 0));
        const pick = this._community || list[0].id;
        const opts = list.map(c =>
            `<option value="${c.id}"${c.id === pick ? ' selected' : ''}>${c.name}${d.joined.includes(c.id) ? ' · joined' : ''}</option>`).join('');
        return {
            title: 'Create a post',
            html:
                `<label class="qb-lab" for="qb-where">Community</label>` +
                `<select id="qb-where" class="qb-input">${opts}</select>` +
                `<label class="qb-lab" for="qb-text">Post</label>` +
                `<textarea id="qb-text" class="qb-input qb-text" maxlength="${QUIBBLES_MAX}" ` +
                    `placeholder="What are you quibbling about?" oninput="Quibbles._count()"></textarea>` +
                `<div class="qb-foot"><span id="qb-count">0 / ${QUIBBLES_MAX}</span>` +
                `<button class="est-btn" onclick="Quibbles.post()">POST</button></div>` +
                `<div class="qb-note" id="qb-note"></div>`,
        };
    },

    _postHtml(by, when, text, id) {
        return `<div class="qb-post">` +
            `<div class="qb-post-top"><b>${this._esc(by)}</b><span>${when}</span>` +
            (id ? `<button class="qb-del" onclick="Quibbles.remove('${id}')" aria-label="Delete post">Delete</button>` : '') +
            `</div><div class="qb-post-txt">${this._esc(text)}</div></div>`;
    },

    // ── Doing things ──────────────────────────────────────────────────────

    toggleJoin(id) {
        const d = this._load();
        d.joined = d.joined.includes(id) ? d.joined.filter(x => x !== id) : d.joined.concat(id);
        this._save(d);
        this._render();
    },

    post() {
        const where = document.getElementById('qb-where');
        const box = document.getElementById('qb-text');
        const note = document.getElementById('qb-note');
        if (!where || !box) return;
        const text = box.value.trim().slice(0, QUIBBLES_MAX);
        if (!text) { if (note) note.textContent = 'Write something first.'; return; }
        const d = this._load();
        d.posts.push({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                       c: where.value, text, at: Date.now() });
        this._save(d);
        this.open('community', where.value);
    },

    remove(id) {
        const d = this._load();
        d.posts = d.posts.filter(p => p.id !== id);
        this._save(d);
        this._render();
    },

    _count() {
        const box = document.getElementById('qb-text');
        const out = document.getElementById('qb-count');
        if (box && out) out.textContent = box.value.length + ' / ' + QUIBBLES_MAX;
    },

    // ── Small things ──────────────────────────────────────────────────────

    _ago(at) {
        const s = Math.max(0, (Date.now() - at) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm';
        if (s < 86400) return Math.floor(s / 3600) + 'h';
        return Math.floor(s / 86400) + 'd';
    },

    /// Anything a player typed goes through here before it touches the page.
    _esc(s) {
        return String(s).replace(/[&<>"']/g, ch =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    },
};
