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

// ── UI audio ───────────────────────────────────────────────────────────────
function _playUiSound(file, vol = 0.4) {
    try {
        const a = new Audio('sounds/' + file);
        a.volume = vol;
        a.play().catch(() => {});
    } catch (_) {}
}

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
    if (id === 'market-modal') { renderMarket(); refreshChainBalance(); }
    document.getElementById(id).classList.add('open');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// ── Click sounds on all interactive elements ───────────────────────────────
document.addEventListener('click', e => {
    if (e.target.closest('.menu-btn, .modal-close, #name-save-btn, .market-buy-btn, .wallet-btn, .wallet-copy-btn, .wallet-share-btn, .amt-pill, .wrp-send-btn, .wrp-decline-btn, #send-onchain-btn')) {
        _playUiSound('single-click.mp3');
    }
});

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
function _todayUTC() {
    return new Date().toISOString().slice(0, 10);
}

async function _fetchPeriodLeaderboard(period) {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    try {
        const res = await fetch(window.SUPABASE_URL + '/rest/v1/rpc/get_leaderboard', {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'apikey':        window.SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ p_period: period, p_limit: 10 }),
        });
        if (res.ok) return await res.json();
    } catch (_) {}
    return null;
}

async function _fetchPlayerRank(wallet, period) {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !wallet) return null;
    try {
        const res = await fetch(window.SUPABASE_URL + '/rest/v1/rpc/get_player_rank', {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'apikey':        window.SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ p_wallet: wallet, p_period: period }),
        });
        if (res.ok) { const d = await res.json(); return d[0] || null; }
    } catch (_) {}
    return null;
}

async function renderHighScores() {
    const list   = document.getElementById('hs-list');
    list.innerHTML = '<div class="hs-empty">Loading…</div>';

    const period = _todayUTC();
    const wallet = window.SkubuAuth?.isConnected() ? window.SkubuAuth.getAccount().address.toLowerCase() : null;

    const [rows, myRank] = await Promise.all([
        _fetchPeriodLeaderboard(period),
        _fetchPlayerRank(wallet, period),
    ]);

    // Fall back to localStorage if Supabase unavailable
    let scores = rows
        ? rows.map(r => ({ name: r.player_name, score: r.score, wallet: r.wallet_address?.toLowerCase() }))
        : getScores().map(s => ({ name: s.name, score: s.score }));

    if (scores.length === 0) {
        list.innerHTML = '<div class="hs-empty">No scores today.<br>Start a game to set the record!</div>';
        return;
    }

    const medals = ['&#127947;', '&#129352;', '&#129353;'];
    const inTop  = wallet && scores.some(s => s.wallet === wallet);

    list.innerHTML = scores.slice(0, 10).map((entry, i) => {
        const isMe = wallet && entry.wallet === wallet;
        return `<div class="hs-row${isMe ? ' hs-me' : ''}">
            <div class="hs-rank">${medals[i] || '#' + (i + 1)}</div>
            <div class="hs-name">${escHtml(entry.name || 'ANON')}${isMe ? ' ◀' : ''}</div>
            <div class="hs-score">${entry.score}</div>
        </div>`;
    }).join('');

    // Show player's rank below top 10 if they're not already visible
    if (myRank && !inTop) {
        list.innerHTML += `<div class="hs-row hs-me hs-my-rank">
            <div class="hs-rank">#${myRank.rank}</div>
            <div class="hs-name">YOU</div>
            <div class="hs-score">${myRank.score}</div>
        </div>`;
    }
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

// ── Global Leaderboard ────────────────────────────────────────────────────
async function fetchLeaderboard() {
    const list = document.getElementById('global-lb-list');
    const myEl = document.getElementById('global-lb-my-rank');
    const btn  = document.getElementById('lb-refresh-btn');
    if (btn) btn.classList.add('spinning');

    const period = _todayUTC();
    const wallet = window.SkubuAuth?.isConnected() ? window.SkubuAuth.getAccount().address.toLowerCase() : null;

    const [rows, myRank] = await Promise.all([
        _fetchPeriodLeaderboard(period),
        _fetchPlayerRank(wallet, period),
    ]);

    if (btn) btn.classList.remove('spinning');

    if (!rows || !rows.length) {
        list.innerHTML = '<div class="lb-empty">No scores today — be the first!</div>';
        if (myEl) myEl.style.display = 'none';
        return;
    }

    const medals = ['&#127947;', '&#129352;', '&#129353;'];
    const inTop  = wallet && rows.some(r => r.wallet_address?.toLowerCase() === wallet);

    list.innerHTML = rows.map((s, i) => {
        const isMe = wallet && s.wallet_address?.toLowerCase() === wallet;
        return `<div class="lb-row ${i < 3 ? 'lb-top' : ''}${isMe ? ' lb-me' : ''}">
            <span class="lb-rank">${medals[i] || '#' + (i + 1)}</span>
            <span class="lb-name">${escHtml(s.player_name || 'ANON')}${isMe ? ' ◀' : ''}</span>
            <span class="lb-score">${s.score}</span>
        </div>`;
    }).join('');

    // Show player's rank below the list if outside top 10
    if (myEl) {
        if (myRank && !inTop) {
            myEl.innerHTML = `<div class="lb-row lb-me lb-my-rank">
                <span class="lb-rank">#${myRank.rank}</span>
                <span class="lb-name">YOUR BEST TODAY</span>
                <span class="lb-score">${myRank.score}</span>
            </div>`;
            myEl.style.display = 'block';
        } else {
            myEl.style.display = 'none';
        }
    }
}

// Fetch on page load + auto-refresh when tab becomes visible (e.g. returning from game)
(function () {
    fetchLeaderboard();
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) fetchLeaderboard();
    });
})();

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

// ── On-chain balance refresh ───────────────────────────────────────────────
async function refreshChainBalance() {
    const auth  = window.SkubuAuth;
    const chain = window.SkubuChain;
    if (!auth || !chain || !auth.isConnected()) return;

    const account = auth.getAccount();
    const balance = await chain.getBalance(account.address);

    // Update on-chain display
    const chainEl = document.getElementById('skubu-chain-count');
    if (chainEl) chainEl.textContent = balance;

    // Sync localStorage cache so game-scene reads a plausible number
    localStorage.setItem(LS_SKUBU, balance);
    const localEl = document.getElementById('skubu-count');
    if (localEl) localEl.textContent = balance;
}

// ── Wallet display update ──────────────────────────────────────────────────
function _updateWalletDisplay(account) {
    const connectBtn    = document.getElementById('auth-connect-btn');
    const disconnectBtn = document.getElementById('auth-disconnect-btn');
    const badgeLocal    = document.getElementById('skubu-badge-local');
    const badgeChain    = document.getElementById('skubu-badge-chain');
    const addrShort     = document.getElementById('wallet-addr-short');

    if (account) {
        const addr = account.address;
        if (addrShort)  addrShort.textContent = addr.slice(0, 6) + '…' + addr.slice(-4);
        if (badgeLocal) badgeLocal.style.display = 'none';
        if (badgeChain) badgeChain.style.display = 'inline';
        if (connectBtn)    connectBtn.style.display    = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
        refreshChainBalance();
    } else {
        if (badgeLocal) badgeLocal.style.display = 'inline';
        if (badgeChain) badgeChain.style.display = 'none';
        if (connectBtn)    connectBtn.style.display    = 'inline-block';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
    }
}

// Wire up auth state changes once SkubuAuth is ready
(function pollForAuth() {
    if (window.SkubuAuth) {
        window.SkubuAuth.onAuthChange(_updateWalletDisplay);
    } else {
        setTimeout(pollForAuth, 100);
    }
})();

// ── Skubu Market ──────────────────────────────────────────────────────────
const MARKET_PACKAGES = [
    {
        id: 'starter', label: 'Starter', gems: '✦',
        amount: 3,  price: '₦1,500',
        accent: '#3366aa',
    },
    {
        id: 'standard', label: 'Standard', gems: '✦✦',
        amount: 10, price: '₦4,000',
        accent: '#336644',
    },
    {
        id: 'mega', label: 'Mega', gems: '✦✦✦',
        amount: 25, price: '₦7,500',
        accent: '#885522', best: 'POPULAR',
    },
    {
        id: 'ultimate', label: 'Ultimate', gems: '✦✦✦✦',
        amount: 60, price: '₦15,000',
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
                onclick="paystackCheckout('${pkg.id}')">BUY</button>
        </div>
    `).join('');
}

// Paystack package prices in kobo (₦)
const PAYSTACK_PRICES = {
    starter:  150_000,   // ₦1,500
    standard: 400_000,   // ₦4,000
    mega:     750_000,   // ₦7,500
    ultimate: 1_500_000, // ₦15,000
};

function paystackCheckout(packageId) {
    const auth = window.SkubuAuth;
    if (!auth || !auth.isConnected()) {
        closeModal('market-modal');
        openModal('auth-modal');
        return;
    }

    if (!window.PaystackPop) {
        showToast('Payment module loading — try again in a moment.');
        return;
    }

    const btn = document.getElementById('buy-' + packageId);
    if (btn) { btn.disabled = true; }

    const walletAddress = auth.getAccount().address;
    const priceKobo     = PAYSTACK_PRICES[packageId];
    if (!priceKobo) {
        showToast('Unknown package');
        if (btn) { btn.disabled = false; }
        return;
    }

    // Paystack requires a valid email format — use wallet address as identifier
    const email = 'wallet.' + walletAddress.toLowerCase().slice(2, 10) + '@skubu.app';

    const handler = window.PaystackPop.setup({
        key:       window.PAYSTACK_PUBLIC_KEY,
        email,
        amount:    priceKobo,
        currency:  'NGN',
        ref:       'skubu_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        metadata:  { walletAddress, packageId },

        callback(response) {
            if (btn) { btn.textContent = 'Verifying…'; }
            _verifyPaystackPayment(response.reference, walletAddress, packageId, btn);
        },
        onClose() {
            if (btn) { btn.disabled = false; btn.textContent = 'BUY'; }
        },
    });
    handler.openIframe();
}

async function _verifyPaystackPayment(reference, walletAddress, packageId, btn) {
    try {
        const res = await fetch(`${window.SUPABASE_URL}/functions/v1/verify-paystack`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ reference, walletAddress, packageId }),
        });
        const data = await res.json();
        if (data.success) {
            showSkubuSplash(data.amount, () => {
                closeModal('market-modal');
                refreshChainBalance();
            });
        } else {
            showToast('Mint failed: ' + (data.error || 'Unknown error'));
            if (btn) { btn.disabled = false; btn.textContent = 'BUY'; }
        }
    } catch (err) {
        showToast('Verification error — contact support with your ref: ' + reference);
        if (btn) { btn.disabled = false; btn.textContent = 'BUY'; }
    }
}

function showSkubuSplash(amount, onDone, fromName) {
    const splash  = document.getElementById('skubu-splash');
    const coinsEl = document.getElementById('splash-coins');

    document.getElementById('splash-amount').textContent = '+' + amount + ' ✦';
    document.getElementById('splash-sub').textContent = fromName
        ? 'from ' + fromName
        : 'added to your balance';

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


// ── Market tab switching ───────────────────────────────────────────────────
function switchMarketTab(name) {
    _playUiSound('category-selection-sound.mp3', 0.3);
    document.getElementById('tab-shop').classList.toggle('active', name === 'shop');
    document.getElementById('tab-wallet').classList.toggle('active', name === 'wallet');
    document.getElementById('mkt-shop-panel').style.display  = name === 'shop'   ? '' : 'none';
    document.getElementById('mkt-wallet-panel').style.display = name === 'wallet' ? '' : 'none';
    if (name === 'wallet') { refreshWalletBalance(); refreshChainBalance(); }
    _updateWalletTabInfo();
}

// ── URL helpers (request links only — no embedded funds) ──────────────────
function encodeSkb(p) { return btoa(JSON.stringify(p)); }
function decodeSkb(s) { try { return JSON.parse(atob(s)); } catch { return null; } }
function buildSkbUrl(payload) {
    return location.origin + location.pathname + '?skb=' + encodeSkb(payload);
}

// ── Wallet UI helpers ──────────────────────────────────────────────────────
function refreshWalletBalance() {
    const el = document.getElementById('wallet-balance');
    if (el) el.textContent = getSkubu();
}

function _updateWalletTabInfo() {
    const auth    = window.SkubuAuth;
    const addrEl  = document.getElementById('wallet-tab-address');
    const recvBox = document.getElementById('receive-addr-box');
    const recvIn  = document.getElementById('receive-addr-input');
    const recvHint= document.getElementById('receive-connect-hint');
    if (addrEl) {
        if (auth && auth.isConnected()) {
            const addr = auth.getAccount().address;
            addrEl.textContent = addr.slice(0, 10) + '…' + addr.slice(-8);
            addrEl.style.display = 'block';
            if (recvIn)  recvIn.value = addr;
            if (recvBox) recvBox.style.display = 'block';
            if (recvHint) recvHint.style.display = 'none';
        } else {
            addrEl.style.display = 'none';
            if (recvBox)  recvBox.style.display  = 'none';
            if (recvHint) recvHint.style.display = 'block';
        }
    }
}

function selectPill(el, prefix) {
    document.querySelectorAll('#' + prefix + '-pills .amt-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
}

function getSelectedAmt(prefix) {
    const active = document.querySelector('#' + prefix + '-pills .amt-pill.active');
    return active ? parseInt(active.dataset.amt) : 0;
}

function copyLink(url, btn) {
    navigator.clipboard?.writeText(url).catch(() => {
        const t = Object.assign(document.createElement('textarea'), { value: url });
        document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    });
    const orig = btn.textContent;
    btn.textContent = '✓ COPIED';
    setTimeout(() => { btn.textContent = orig; }, 1600);
}

function shareLink(url, title) {
    if (navigator.share) navigator.share({ title, url }).catch(() => {});
    else copyLink(url, { textContent: '' });
}

function copyLinkFromBox(boxId, btn) {
    copyLink(document.querySelector('#' + boxId + ' input').value, btn);
}

function shareLinkFromBox(boxId, title) {
    shareLink(document.querySelector('#' + boxId + ' input').value, title);
}

function populateLinkBox(boxId, url, msg) {
    const box = document.getElementById(boxId);
    box.querySelector('.link-msg').textContent = msg;
    box.querySelector('input').value = url;
    box.style.display = 'block';
}

function showToast(msg) {
    let t = document.getElementById('_toast');
    if (!t) {
        t = document.createElement('div');
        t.id = '_toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => { t.classList.remove('visible'); }, 2200);
}

// ── On-chain Send ──────────────────────────────────────────────────────────
async function sendOnChain() {
    const errEl = document.getElementById('send-error');
    errEl.style.display = 'none';

    const auth = window.SkubuAuth;
    if (!auth || !auth.isConnected()) {
        errEl.textContent = 'Connect wallet first.';
        errEl.style.display = 'block';
        return;
    }

    const addrInput = document.getElementById('send-addr-input');
    const toAddress = addrInput ? addrInput.value.trim() : '';
    if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress)) {
        errEl.textContent = 'Enter a valid 0x wallet address.';
        errEl.style.display = 'block';
        return;
    }

    const amt = getSelectedAmt('send');
    if (!amt) {
        errEl.textContent = 'Select an amount first.';
        errEl.style.display = 'block';
        return;
    }

    const chain   = window.SkubuChain;
    const balance = await chain.getBalance(auth.getAccount().address);
    if (balance < amt) {
        errEl.textContent = 'Insufficient balance (' + balance + ' SKUBU).';
        errEl.style.display = 'block';
        return;
    }

    const sendBtn = document.getElementById('send-onchain-btn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }

    try {
        const { txHash } = await chain.transferSkubu(toAddress, amt);
        const scanUrl = `https://sepolia.basescan.org/tx/${txHash}`;
        populateLinkBox('send-link-box', scanUrl,
            '✓ Sent ' + amt + ' SKUBU on-chain!');
        document.querySelector('#send-link-box input').readOnly = false;
        // Replace with a clickable link approach via the msg
        document.querySelector('#send-link-box .link-msg').innerHTML =
            '✓ Sent ' + amt + ' SKUBU — <a href="' + escHtml(scanUrl) + '" target="_blank" rel="noopener">view tx ↗</a>';
        document.getElementById('send-link-box').style.display = 'block';
        refreshChainBalance();
    } catch (err) {
        errEl.textContent = 'Transfer failed: ' + (err.message || err);
        errEl.style.display = 'block';
    } finally {
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '✦ SEND ON-CHAIN'; }
    }
}

// ── Request link generator (request-only, no embedded funds) ──────────────
function generateRequestLink() {
    const amt = getSelectedAmt('req');
    if (!amt) return;
    const auth = window.SkubuAuth;
    const addr = (auth && auth.isConnected()) ? auth.getAccount().address : '';
    const url = buildSkbUrl({ t: 'request', from: getName() || 'FRIEND', amt, addr, v: 2 });
    populateLinkBox('req-link-box', url, 'Share this with your friend:');
}

// ── Incoming ?skb= request handler ────────────────────────────────────────
(function handleIncomingSkb() {
    const params = new URLSearchParams(location.search);
    const raw    = params.get('skb');
    if (!raw) return;
    history.replaceState(null, '', location.pathname);
    const data = decodeSkb(raw);
    if (!data || !data.t || !data.amt) return;
    if (data.t === 'request') _handleIncomingRequest(data);
})();

function _handleIncomingRequest(data) {
    openModal('market-modal');
    switchMarketTab('wallet');

    const titleEl = document.getElementById('wrp-title');
    const balEl   = document.getElementById('wrp-balance');
    const sendBtn = document.getElementById('wrp-send-btn');

    if (titleEl) titleEl.textContent = '✦ ' + data.from + ' wants ' + data.amt + ' SKUBU';
    if (balEl)   balEl.textContent   = 'This will send ' + data.amt + ' SKUBU on-chain to ' + (data.addr || 'unknown address');

    if (sendBtn) {
        sendBtn.textContent = 'SEND ' + data.amt + ' SKUBU';
        sendBtn.onclick = () => {
            if (data.addr) _fulfillRequestOnChain(data.addr, data.amt);
        };
    }

    document.getElementById('wallet-request-prompt').style.display = 'block';
}

async function _fulfillRequestOnChain(toAddress, amt) {
    const errEl = document.getElementById('send-error');
    errEl.style.display = 'none';

    const auth = window.SkubuAuth;
    if (!auth || !auth.isConnected()) {
        if (errEl) { errEl.textContent = 'Connect wallet first.'; errEl.style.display = 'block'; }
        return;
    }

    const sendBtn = document.getElementById('wrp-send-btn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }

    try {
        const { txHash } = await window.SkubuChain.transferSkubu(toAddress, amt);
        const scanUrl = `https://sepolia.basescan.org/tx/${txHash}`;
        document.getElementById('wrp-title').innerHTML =
            '✓ Sent ' + amt + ' SKUBU — <a href="' + escHtml(scanUrl) + '" target="_blank" rel="noopener">view tx ↗</a>';
        if (sendBtn) sendBtn.style.display = 'none';
        refreshChainBalance();
    } catch (err) {
        if (errEl) { errEl.textContent = 'Transfer failed: ' + (err.message || err); errEl.style.display = 'block'; }
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'SEND ' + amt + ' SKUBU'; }
    }
}

// ── Auth Modal helpers ─────────────────────────────────────────────────────
let _authPendingEmail = '';

function _authSetSpinner(visible, msg) {
    const spinner = document.getElementById('auth-spinner');
    const step1   = document.getElementById('auth-step-1');
    const step2   = document.getElementById('auth-step-2');
    const msgEl   = document.getElementById('auth-spinner-msg');
    if (!spinner) return;
    spinner.style.display = visible ? 'flex' : 'none';
    if (step1) step1.style.display = visible ? 'none' : '';
    if (step2) step2.style.display = visible ? 'none' : (_authPendingEmail ? '' : 'none');
    if (msg && msgEl) msgEl.textContent = msg;
}

function _authSetError(stepNum, msg) {
    const el = document.getElementById('auth-step' + stepNum + '-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
}

function authBackToStep1() {
    _authPendingEmail = '';
    const step1 = document.getElementById('auth-step-1');
    const step2 = document.getElementById('auth-step-2');
    if (step1) step1.style.display = '';
    if (step2) step2.style.display = 'none';
    _authSetError(1, '');
}

async function authSendOtp() {
    const emailInput = document.getElementById('auth-email-input');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email) { _authSetError(1, 'Please enter your email.'); return; }
    if (!window.SkubuAuth) { _authSetError(1, 'Auth not ready. Try again in a moment.'); return; }

    _authSetSpinner(true, 'Sending code...');
    try {
        await window.SkubuAuth.sendOtp(email);
        _authPendingEmail = email;
        const spinner = document.getElementById('auth-spinner');
        const step1   = document.getElementById('auth-step-1');
        const step2   = document.getElementById('auth-step-2');
        const hint    = document.getElementById('auth-otp-hint');
        if (spinner) spinner.style.display = 'none';
        if (step1)   step1.style.display   = 'none';
        if (step2)   step2.style.display   = '';
        if (hint)    hint.textContent = 'Code sent to ' + email;
        _authSetError(2, '');
    } catch (err) {
        _authSetSpinner(false, '');
        _authSetError(1, err.message || 'Failed to send code.');
    }
}

async function authVerifyOtp() {
    const otpInput = document.getElementById('auth-otp-input');
    const otp = otpInput ? otpInput.value.trim() : '';
    if (!otp) { _authSetError(2, 'Please enter the verification code.'); return; }
    if (!_authPendingEmail) { _authSetError(2, 'Session lost — go back and try again.'); return; }

    _authSetSpinner(true, 'Verifying...');
    try {
        await window.SkubuAuth.connect('email', _authPendingEmail, otp);
        _authSetSpinner(false, '');
        closeModal('auth-modal');
        _authPendingEmail = '';
    } catch (err) {
        _authSetSpinner(false, '');
        _authSetError(2, err.message || 'Invalid code. Try again.');
    }
}

async function authWithGoogle() {
    if (!window.SkubuAuth) { _authSetError(1, 'Auth not ready. Try again.'); return; }
    _authSetSpinner(true, 'Opening Google...');
    try {
        await window.SkubuAuth.connect('google');
        _authSetSpinner(false, '');
        closeModal('auth-modal');
    } catch (err) {
        _authSetSpinner(false, '');
        _authSetError(1, err.message || 'Google sign-in failed.');
    }
}

// Allow Enter to submit OTP
document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        if (document.getElementById('auth-email-input') === document.activeElement) authSendOtp();
        if (document.getElementById('auth-otp-input')   === document.activeElement) authVerifyOtp();
    }
});
