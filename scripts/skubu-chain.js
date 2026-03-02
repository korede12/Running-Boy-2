// ── On-Chain Skubu (ERC-20 on Base Sepolia) ───────────────────────────────
// Exposes window.SkubuChain for global scripts to use.

import { createThirdwebClient, getContract, readContract, sendTransaction } from "https://esm.sh/thirdweb@5";
import { baseSepolia }  from "https://esm.sh/thirdweb@5/chains";
import { transfer }     from "https://esm.sh/thirdweb@5/extensions/erc20";

// ── Wait for config ─────────────────────────────────────────────────────────
function waitForConfig() {
    return new Promise(resolve => {
        if (window.THIRDWEB_CLIENT_ID && window.SKUBU_CONTRACT_ADDRESS) { resolve(); return; }
        const check = setInterval(() => {
            if (window.THIRDWEB_CLIENT_ID && window.SKUBU_CONTRACT_ADDRESS) {
                clearInterval(check); resolve();
            }
        }, 50);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
    });
}

await waitForConfig();

const client = window.THIRDWEB_CLIENT_ID
    ? createThirdwebClient({ clientId: window.THIRDWEB_CLIENT_ID })
    : null;

function _getContract() {
    if (!client || !window.SKUBU_CONTRACT_ADDRESS) return null;
    return getContract({
        client,
        chain: baseSepolia,
        address: window.SKUBU_CONTRACT_ADDRESS,
    });
}

// Simple in-memory cache (per page-load)
let _cachedBalance    = null;
let _cachedAddress    = null;
let _cacheTimestamp   = 0;
const CACHE_TTL_MS    = 15_000;   // 15 s

// ── ERC-20 balanceOf ABI fragment ──────────────────────────────────────────
const balanceOfABI = [{
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
}];

const SkubuChain = {

    /**
     * Get on-chain SKBU balance for an address.
     * Returns a whole-number display value (floor of tokens, 18 decimals).
     */
    async getBalance(address) {
        if (!client || !window.SKUBU_CONTRACT_ADDRESS) return 0;

        // Cache hit
        if (
            address === _cachedAddress &&
            _cachedBalance !== null &&
            Date.now() - _cacheTimestamp < CACHE_TTL_MS
        ) {
            return _cachedBalance;
        }

        try {
            const contract = _getContract();
            const raw = await readContract({
                contract,
                method: balanceOfABI[0],
                params: [address],
            });
            // raw is bigint, 18 decimals
            const display = Number(raw / BigInt(10 ** 18));
            _cachedBalance  = display;
            _cachedAddress  = address;
            _cacheTimestamp = Date.now();
            return display;
        } catch (err) {
            console.warn('[SkubuChain] getBalance failed:', err);
            return 0;
        }
    },

    /**
     * Transfer SKUBU to another address on-chain.
     * Requires the user to be connected via SkubuAuth.
     *
     * @param {string} toAddress - Recipient 0x address
     * @param {number} amount    - Whole token count to send
     * @returns {{ txHash: string }}
     */
    async transferSkubu(toAddress, amount) {
        const auth = window.SkubuAuth;
        if (!auth || !auth.isConnected()) {
            throw new Error('Wallet not connected');
        }
        const account  = auth.getAccount();
        const contract = _getContract();
        if (!contract) throw new Error('Contract not configured');

        const tx      = transfer({ contract, to: toAddress, amount: amount.toString() });
        const receipt = await sendTransaction({ transaction: tx, account });
        this.invalidateCache();
        return { txHash: receipt.transactionHash };
    },

    /** Invalidate the balance cache (e.g. after a mint). */
    invalidateCache() {
        _cachedBalance = null;
        _cachedAddress = null;
    },

    /**
     * Request the server to mint `amount` SKBU to the connected wallet.
     * Falls back silently if not authenticated or Supabase not configured.
     *
     * @param {number} amount    - whole token count to mint
     * @param {string} sessionId - UUID generated per game session
     */
    async mintSkubu(amount, sessionId) {
        const auth = window.SkubuAuth;
        if (!auth || !auth.isConnected()) {
            console.log('[SkubuChain] Not connected — skipping on-chain mint');
            return;
        }
        if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
            console.warn('[SkubuChain] Supabase not configured — skipping mint');
            return;
        }
        if (amount <= 0) return;

        const account = auth.getAccount();
        const address = account.address;
        const ts      = Date.now();
        const message = `Mint ${amount} Skubu. Session: ${sessionId}. Timestamp: ${ts}`;

        let signature;
        try {
            signature = await auth.signMessage(message);
        } catch (err) {
            console.warn('[SkubuChain] Sign failed:', err);
            return;
        }

        console.log(`[SkubuChain] Minting ${amount} SKBU for session ${sessionId}...`);
        try {
            const res = await fetch(`${window.SUPABASE_URL}/functions/v1/mint-skubu`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({ address, amount, sessionId, signature, message }),
            });
            const data = await res.json();
            if (data.success) {
                console.log(`[SkubuChain] Mint OK — tx: ${data.txHash}`);
                this.invalidateCache();
            } else {
                console.warn('[SkubuChain] Mint rejected:', data.error);
            }
        } catch (err) {
            console.warn('[SkubuChain] Mint request failed:', err);
        }
    },
};

window.SkubuChain = SkubuChain;
