// ── Thirdweb In-App Wallet Auth ───────────────────────────────────────────
// Exposes window.SkubuAuth for global scripts to use.
// Loaded as <script type="module"> so it can use ES imports.

import { createThirdwebClient }             from "https://esm.sh/thirdweb@5";
import { inAppWallet, preAuthenticate }     from "https://esm.sh/thirdweb@5/wallets/in-app";
import { baseSepolia }                      from "https://esm.sh/thirdweb@5/chains";
import { signMessage as twSignMessage }     from "https://esm.sh/thirdweb@5/utils";

// ── Wait for config to be available ────────────────────────────────────────
function waitForConfig() {
    return new Promise(resolve => {
        if (window.THIRDWEB_CLIENT_ID) { resolve(); return; }
        const check = setInterval(() => {
            if (window.THIRDWEB_CLIENT_ID) { clearInterval(check); resolve(); }
        }, 50);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
    });
}

let client = null;
let wallet = null;
let _account   = null;
let _callbacks = [];

function _notify() {
    _callbacks.forEach(cb => { try { cb(_account); } catch (_) {} });
}

// ── Public API ─────────────────────────────────────────────────────────────
const SkubuAuth = {

    async sendOtp(email) {
        if (!client) throw new Error('Thirdweb not configured');
        await preAuthenticate({ client, strategy: 'email', email });
    },

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

    async disconnect() {
        if (wallet) {
            try { await wallet.disconnect(); } catch (_) {}
        }
        _account = null;
        _notify();
    },

    getAccount()   { return _account; },
    isConnected()  { return !!_account; },

    async signMessage(msg) {
        if (!_account) throw new Error('No wallet connected');
        return await twSignMessage({ account: _account, message: msg });
    },

    onAuthChange(cb) {
        _callbacks.push(cb);
        try { cb(_account); } catch (_) {}
    },
};

// Export immediately so UI is never blocked
window.SkubuAuth = SkubuAuth;

// ── Initialise ─────────────────────────────────────────────────────────────
try {
    await waitForConfig();

    if (window.THIRDWEB_CLIENT_ID) {
        client = createThirdwebClient({ clientId: window.THIRDWEB_CLIENT_ID });
        wallet = inAppWallet();
        console.log('[SkubuAuth] Initialised');
    } else {
        console.warn('[SkubuAuth] No THIRDWEB_CLIENT_ID — auth disabled');
    }

    // Auto-restore saved session
    if (wallet) {
        try {
            _account = await wallet.autoConnect({ client, chain: baseSepolia });
            console.log('[SkubuAuth] Session restored:', _account.address);
            _notify();
        } catch (_) {
            // No saved session — stay logged out
        }
    }
} catch (err) {
    console.error('[SkubuAuth] Init failed:', err);
}
