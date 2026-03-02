// ── Thirdweb In-App Wallet Auth ───────────────────────────────────────────
// Exposes window.SkubuAuth for global scripts to use.
// Loaded as <script type="module"> so it can use ES imports.

import { createThirdwebClient }  from "https://esm.sh/thirdweb@5";
import { inAppWallet }            from "https://esm.sh/thirdweb@5/wallets";
import { preAuthenticate }        from "https://esm.sh/thirdweb@5/wallets/in-app";
import { baseSepolia }            from "https://esm.sh/thirdweb@5/chains";
import { signMessage as twSignMessage } from "https://esm.sh/thirdweb@5";

// ── Wait for config to be available ────────────────────────────────────────
function waitForConfig() {
    return new Promise(resolve => {
        if (window.THIRDWEB_CLIENT_ID) { resolve(); return; }
        const check = setInterval(() => {
            if (window.THIRDWEB_CLIENT_ID) { clearInterval(check); resolve(); }
        }, 50);
        // Timeout after 5s — proceed without auth if config missing
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
    });
}

await waitForConfig();

const client = window.THIRDWEB_CLIENT_ID
    ? createThirdwebClient({ clientId: window.THIRDWEB_CLIENT_ID })
    : null;

const wallet = client ? inAppWallet() : null;

let _account     = null;   // active account object from Thirdweb
let _callbacks   = [];     // onAuthChange subscribers

function _notify() {
    _callbacks.forEach(cb => { try { cb(_account); } catch (_) {} });
}

// ── Public API ─────────────────────────────────────────────────────────────
const SkubuAuth = {

    /**
     * Send OTP to email (call before connect with email strategy).
     */
    async sendOtp(email) {
        if (!client) throw new Error('Thirdweb not configured');
        await preAuthenticate({ client, strategy: 'email', email });
    },

    /**
     * Connect the in-app wallet.
     * strategy: 'email' | 'google'
     * email + otp required for email strategy.
     */
    async connect(strategy, email, otp) {
        if (!wallet) throw new Error('Thirdweb not configured');
        if (strategy === 'email') {
            _account = await wallet.connect({
                client,
                chain: baseSepolia,
                strategy: 'email',
                email,
                verificationCode: otp,
            });
        } else if (strategy === 'google') {
            _account = await wallet.connect({
                client,
                chain: baseSepolia,
                strategy: 'google',
            });
        } else {
            throw new Error('Unknown strategy: ' + strategy);
        }
        _notify();
        return _account;
    },

    /** Disconnect and clear session. */
    async disconnect() {
        if (wallet) {
            try { await wallet.disconnect(); } catch (_) {}
        }
        _account = null;
        _notify();
    },

    /** Returns the connected account object (has .address) or null. */
    getAccount() {
        return _account;
    },

    /** Returns true if a wallet is connected. */
    isConnected() {
        return !!_account;
    },

    /**
     * Sign a message with the connected wallet.
     * Returns hex signature string.
     */
    async signMessage(msg) {
        if (!_account) throw new Error('No wallet connected');
        return await twSignMessage({ account: _account, message: msg });
    },

    /**
     * Register a callback fired whenever auth state changes.
     * cb receives the account object (or null on disconnect).
     */
    onAuthChange(cb) {
        _callbacks.push(cb);
        // Fire immediately with current state
        try { cb(_account); } catch (_) {}
    },
};

// ── Auto-restore session on page load ─────────────────────────────────────
if (wallet) {
    try {
        _account = await wallet.autoConnect({ client, chain: baseSepolia });
        _notify();
    } catch (_) {
        // No saved session — stay logged out
    }
}

// Export to global scope
window.SkubuAuth = SkubuAuth;
