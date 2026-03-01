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

function getScores() {
    try { return JSON.parse(localStorage.getItem(LS_SCORES)) || []; }
    catch { return []; }
}

function getName() {
    return localStorage.getItem(LS_NAME) || '';
}

// ── Modal helpers ──────────────────────────────────────────────────────────
function openModal(id) {
    if (id === 'hs-modal')   renderHighScores();
    if (id === 'name-modal') renderNameModal();
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
(function () {
    const skubuEl = document.getElementById('skubu-count');
    if (skubuEl) {
        skubuEl.textContent = parseInt(localStorage.getItem('runningboy_skubu')) || 0;
    }
})();
