// ── Run storage ───────────────────────────────────────────────────────────
// Everything a finished run writes down: the score, the leaderboard upsert,
// and the play-limit counter. Both game modes share it, so the rules cannot
// drift apart — a loss costs the same whichever mode you lost in.

const RunStore = {

    LOSS_LIMIT:    5,                      // losses before the gate closes
    COOLDOWN_MS:   5 * 60 * 60 * 1000,     // and how long it stays shut

    /// Where on the map the player last chose to go. The venue decides the
    /// mode; the character only decides who runs it.
    venue() {
        try { return localStorage.getItem('runningboy_venue') || ''; }
        catch (_) { return ''; }
    },

    character() {
        try { return localStorage.getItem('runningboy_character') || 'skeleton'; }
        catch (_) { return 'skeleton'; }
    },

    playerName() {
        try { return (localStorage.getItem('runningboy_name') || 'ANON').toUpperCase(); }
        catch (_) { return 'ANON'; }
    },

    // ── The wallet ────────────────────────────────────────────────────────
    // Every reward in the game lands in skubu, and there is one balance to
    // land in. Once a player exists it is theirs; before that it falls back
    // to the old standalone counter so a page opened without one still
    // works. Nothing writes the balance directly any more — a second place
    // keeping its own total is how two wallets happen.

    skubu() {
        if (typeof Player !== 'undefined' && Player.exists()) return Player.skubu();
        try { return parseInt(localStorage.getItem('runningboy_skubu')) || 0; }
        catch (_) { return 0; }
    },

    /// Earn. Returns what was credited.
    credit(n, why) {
        n = Math.max(0, Math.round(n));
        if (!n) return 0;
        if (typeof Player !== 'undefined' && Player.exists()) {
            Player.adjust(n, why || 'Reward');
            return n;
        }
        try {
            const cur = parseInt(localStorage.getItem('runningboy_skubu')) || 0;
            localStorage.setItem('runningboy_skubu', cur + n);
        } catch (_) {}
        return n;
    },

    /// Spend. Refused, rather than allowed to go negative.
    debit(n, why) {
        n = Math.max(0, Math.round(n));
        if (!n) return true;
        if (typeof Player !== 'undefined' && Player.exists()) {
            return Player.adjust(-n, why || 'Spent');
        }
        try {
            const cur = parseInt(localStorage.getItem('runningboy_skubu')) || 0;
            if (cur < n) return false;
            localStorage.setItem('runningboy_skubu', cur - n);
        } catch (_) { return false; }
        return true;
    },

    /// Kept for callers that think in totals; expressed as a move either way
    /// so the ledger still records what happened.
    setSkubu(n) {
        const cur = this.skubu();
        if (n > cur) this.credit(n - cur, 'Adjustment');
        else if (n < cur) this.debit(cur - n, 'Adjustment');
    },

    // ── Scores ────────────────────────────────────────────────────────────

    saveScore(score) {
        const playerName = this.playerName();
        try {
            const scores = JSON.parse(localStorage.getItem('runningboy_scores')) || [];
            scores.push({ name: playerName, score });
            scores.sort((a, b) => b.score - a.score);
            localStorage.setItem('runningboy_scores', JSON.stringify(scores.slice(0, 20)));
        } catch (_) {}

        // Upsert to the Supabase leaderboard (personal best only) if connected.
        const auth = window.SkubuAuth;
        if (auth && auth.isConnected() && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
            fetch(window.SUPABASE_URL + '/rest/v1/rpc/upsert_score', {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'apikey':        window.SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    p_wallet_address: auth.getAccount().address,
                    p_player_name:    playerName,
                    p_score:          score,
                    p_period:         new Date().toISOString().slice(0, 10),
                }),
            }).catch(() => {});
        }
    },

    // ── Play limit ────────────────────────────────────────────────────────
    // A cooldown that has already expired is cleared wherever it is noticed,
    // so both entry points agree on whether the player is blocked.

    _clearIfExpired() {
        const resetAt = parseInt(localStorage.getItem('runningboy_losses_reset')) || 0;
        if (resetAt > 0 && Date.now() >= resetAt) {
            localStorage.removeItem('runningboy_losses_reset');
            localStorage.setItem('runningboy_losses', 0);
            return 0;
        }
        return resetAt;
    },

    /// Epoch ms the gate reopens, or 0 if the player may start a run.
    checkLaunchCooldown() {
        try {
            const resetAt = this._clearIfExpired();
            const losses  = parseInt(localStorage.getItem('runningboy_losses')) || 0;
            return (losses >= this.LOSS_LIMIT && resetAt > 0) ? resetAt : 0;
        } catch (_) { return 0; }
    },

    /// Count one true game over. Returns the reset time if that was the last one.
    recordLossAndCheck() {
        try {
            this._clearIfExpired();
            const losses = (parseInt(localStorage.getItem('runningboy_losses')) || 0) + 1;
            localStorage.setItem('runningboy_losses', losses);
            if (losses >= this.LOSS_LIMIT) {
                const resetAt = Date.now() + this.COOLDOWN_MS;
                localStorage.setItem('runningboy_losses_reset', resetAt);
                return resetAt;
            }
            return 0;
        } catch (_) { return 0; }
    },

    /// Spending a skubu to keep playing wipes the loss counter, not just the clock.
    clearLosses() {
        try {
            localStorage.setItem('runningboy_losses', 0);
            localStorage.removeItem('runningboy_losses_reset');
        } catch (_) {}
    },
};
