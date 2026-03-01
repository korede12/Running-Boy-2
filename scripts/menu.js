// ── Stars ──────────────────────────────────────────────────────────────────
(function () {
    const container = document.getElementById('stars');
    for (let i = 0; i < 80; i++) {
        const s = document.createElement('div');
        s.className = 'star';
        const size = Math.random() * 2.4 + 0.6;
        const a1 = (Math.random() * 0.3 + 0.1).toFixed(2);
        const a2 = (Math.random() * 0.5 + 0.5).toFixed(2);
        s.style.cssText = `
            width:${size}px; height:${size}px;
            left:${Math.random() * 100}%;
            top:${Math.random() * 62}%;
            --a1:${a1}; --a2:${a2};
            --dur:${(Math.random() * 2.5 + 0.8).toFixed(2)}s;
            --delay:${(Math.random() * 2.5).toFixed(2)}s;
        `;
        container.appendChild(s);
    }
})();

// ── Storage helpers ────────────────────────────────────────────────────────
const LS_NAME   = 'runningboy_name';
const LS_SCORES = 'runningboy_scores';
const LS_SKUBU  = 'runningboy_skubu';

function getScores() {
    try { return JSON.parse(localStorage.getItem(LS_SCORES)) || []; }
    catch { return []; }
}

function getName() {
    return localStorage.getItem(LS_NAME) || '';
}

// ── Modal helpers ──────────────────────────────────────────────────────────
function openModal(id) {
    if (id === 'hs-modal')     renderHighScores();
    if (id === 'name-modal')   renderNameModal();
    if (id === 'market-modal') renderMarket();
    document.getElementById(id).classList.add('open');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// Close on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', e => {
        if (e.target === el) closeModal(el.id);
    });
});

// Close on Escape
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(el => {
            closeModal(el.id);
        });
    }
});

// ── High Scores ────────────────────────────────────────────────────────────
function renderHighScores() {
    const scores = getScores();
    const list   = document.getElementById('hs-list');
    if (scores.length === 0) {
        list.innerHTML = '<div class="hs-empty">No scores yet.<br>Start a game to set your record!</div>';
        return;
    }
    const rankClasses = ['gold', 'silver', 'bronze'];
    list.innerHTML = scores.slice(0, 10).map((entry, i) => `
        <div class="hs-row">
            <div class="hs-rank ${rankClasses[i] || ''}">#${i + 1}</div>
            <div class="hs-name">${escHtml(entry.name || 'ANON')}</div>
            <div class="hs-score">${entry.score}</div>
        </div>
    `).join('');
}

function clearScores() {
    if (!confirm('Clear all high scores?')) return;
    localStorage.removeItem(LS_SCORES);
    renderHighScores();
}

function escHtml(str) {
    return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Name ──────────────────────────────────────────────────────────────────
function renderNameModal() {
    const current = getName();
    const display = document.getElementById('current-name-display');
    display.innerHTML = current
        ? `Current name: <span>${escHtml(current.toUpperCase())}</span>`
        : 'No name set yet.';
    document.getElementById('name-input').value = current;
    document.getElementById('name-saved-msg').textContent = '';
}

function saveName() {
    const raw  = document.getElementById('name-input').value.trim();
    const name = raw.toUpperCase().slice(0, 10);
    if (!name) {
        document.getElementById('name-saved-msg').textContent = 'Please enter a name.';
        document.getElementById('name-saved-msg').style.color = '#cc4444';
        return;
    }
    localStorage.setItem(LS_NAME, name);
    document.getElementById('current-name-display').innerHTML = `Current name: <span>${escHtml(name)}</span>`;
    const msg = document.getElementById('name-saved-msg');
    msg.textContent = 'Name saved!';
    msg.style.color = '#44cc88';
    setTimeout(() => { msg.textContent = ''; }, 2000);
}

// Allow Enter key to save name
document.getElementById('name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveName();
});

// ── Start Game ────────────────────────────────────────────────────────────
function startGame() {
    window.location.href = 'RunningBoy.html';
}

// ── Skubu badge ───────────────────────────────────────────────────────────
function getSkubu() {
    return parseInt(localStorage.getItem(LS_SKUBU)) || 0;
}
function setSkubu(n) {
    localStorage.setItem(LS_SKUBU, n);
    const el = document.getElementById('skubu-count');
    if (el) el.textContent = n;
}
(function () {
    const el = document.getElementById('skubu-count');
    if (el) el.textContent = getSkubu();
})();

// ── Skubu Market ──────────────────────────────────────────────────────────
const MARKET_PACKAGES = [
    {
        id: 'starter', label: 'Starter', gems: '✦',
        amount: 3,  price: '$0.99',
        accent: '#3366aa',
    },
    {
        id: 'standard', label: 'Standard', gems: '✦✦',
        amount: 10, price: '$2.49',
        accent: '#336644',
    },
    {
        id: 'mega', label: 'Mega', gems: '✦✦✦',
        amount: 25, price: '$4.99',
        accent: '#885522', best: 'POPULAR',
    },
    {
        id: 'ultimate', label: 'Ultimate', gems: '✦✦✦✦',
        amount: 60, price: '$9.99',
        accent: '#664488', best: 'BEST VALUE',
    },
];

function renderMarket() {
    document.getElementById('market-balance').textContent = getSkubu();
    const grid = document.getElementById('market-grid');
    grid.innerHTML = MARKET_PACKAGES.map(pkg => `
        <div class="market-card" style="--card-accent:${pkg.accent}">
            ${pkg.best ? `<div class="market-card-best">${pkg.best}</div>` : ''}
            <div class="market-card-label">${pkg.label}</div>
            <div class="market-card-gems">${pkg.gems}</div>
            <div class="market-card-amount">${pkg.amount}</div>
            <div class="market-card-unit">SKUBU</div>
            <div class="market-card-price">${pkg.price}</div>
            <button class="market-buy-btn" id="buy-${pkg.id}"
                onclick="buyPackage('${pkg.id}', ${pkg.amount})">BUY</button>
        </div>
    `).join('');
}

function buyPackage(id, amount) {
    const btn = document.getElementById('buy-' + id);
    if (!btn || btn.classList.contains('bought')) return;
    btn.classList.add('bought'); // prevent double-tap during splash

    const newTotal = getSkubu() + amount;
    setSkubu(newTotal);

    showSkubuSplash(amount, () => {
        closeModal('market-modal');
    });
}

function showSkubuSplash(amount, onDone) {
    const splash  = document.getElementById('skubu-splash');
    const coinsEl = document.getElementById('splash-coins');

    document.getElementById('splash-amount').textContent = '+' + amount + ' ✦';

    // Generate coin rain
    coinsEl.innerHTML = '';
    for (let i = 0; i < 55; i++) {
        const c = document.createElement('span');
        c.className = 'splash-coin';
        const size = 10 + Math.random() * 22;
        c.textContent = '✦';
        c.style.cssText = [
            `left:${Math.random() * 100}%`,
            `font-size:${size}px`,
            `--dur:${(0.9 + Math.random() * 1.1).toFixed(2)}s`,
            `--delay:${(Math.random() * 0.9).toFixed(2)}s`,
        ].join(';');
        coinsEl.appendChild(c);
    }

    splash.classList.remove('hiding');
    splash.classList.add('active');

    // Start hiding after display window
    setTimeout(() => {
        splash.classList.add('hiding');
        setTimeout(() => {
            splash.classList.remove('active', 'hiding');
            if (onDone) onDone();
        }, 450);
    }, 2100);
}

// ── Auto-open market if navigated with #market hash ───────────────────────
(function () {
    if (window.location.hash === '#market') {
        history.replaceState(null, '', window.location.pathname);
        openModal('market-modal');
    }
})();
