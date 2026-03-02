// ── verify-paystack Edge Function ─────────────────────────────────────────
// POST { reference, walletAddress, packageId }
// 1. Call Paystack verify API to confirm payment
// 2. Check stripe_payments table for duplicate reference
// 3. Validate amount matches expected package price
// 4. Mint SKUBU via Thirdweb
// 5. Insert row into stripe_payments (reused table, same schema)

import { createClient }       from 'https://esm.sh/@supabase/supabase-js@2';
import { createThirdwebClient, getContract, sendTransaction } from 'https://esm.sh/thirdweb@5';
import { privateKeyToAccount } from 'https://esm.sh/thirdweb@5/wallets';
import { mintTo }              from 'https://esm.sh/thirdweb@5/extensions/erc20';
import { baseSepolia }         from 'https://esm.sh/thirdweb@5/chains';

const PACKAGES: Record<string, { amount: number; priceKobo: number }> = {
    starter:  { amount: 3,  priceKobo: 150_000  },  // ₦1,500
    standard: { amount: 10, priceKobo: 400_000  },  // ₦4,000
    mega:     { amount: 25, priceKobo: 750_000  },  // ₦7,500
    ultimate: { amount: 60, priceKobo: 1_500_000 }, // ₦15,000
};

const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!paystackSecret) {
        return jsonError('Paystack not configured', 500);
    }

    try {
        const { reference, walletAddress, packageId } = await req.json();

        if (!reference || !walletAddress || !packageId) {
            return jsonError('Missing reference, walletAddress, or packageId', 400);
        }

        const pkg = PACKAGES[packageId];
        if (!pkg) {
            return jsonError('Unknown package', 400);
        }

        // ── 1. Verify with Paystack API ────────────────────────────────────
        const verifyRes = await fetch(
            `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
            { headers: { Authorization: `Bearer ${paystackSecret}` } },
        );
        const verifyJson = await verifyRes.json();

        if (!verifyJson.status || verifyJson.data?.status !== 'success') {
            return jsonError('Payment not confirmed by Paystack', 402);
        }

        const paidKobo = verifyJson.data.amount as number;
        if (paidKobo < pkg.priceKobo) {
            return jsonError(`Underpayment: expected ${pkg.priceKobo} kobo, got ${paidKobo}`, 402);
        }

        // ── 2. Check for duplicate ─────────────────────────────────────────
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        const { data: existing } = await supabase
            .from('stripe_payments')
            .select('id')
            .eq('stripe_session_id', reference)
            .maybeSingle();

        if (existing) {
            return jsonError('Payment already processed', 409);
        }

        // ── 3. Mint SKUBU ──────────────────────────────────────────────────
        const client = createThirdwebClient({
            secretKey: Deno.env.get('THIRDWEB_SECRET_KEY')!,
        });
        const minterAccount = privateKeyToAccount({
            client,
            privateKey: Deno.env.get('MINTER_PRIVATE_KEY')! as `0x${string}`,
        });
        const contract = getContract({
            client,
            chain: baseSepolia,
            address: Deno.env.get('SKUBU_CONTRACT_ADDRESS')! as `0x${string}`,
        });

        const tx      = mintTo({ contract, to: walletAddress, amount: pkg.amount.toString() });
        const receipt = await sendTransaction({ transaction: tx, account: minterAccount });
        const txHash  = receipt.transactionHash;

        console.log(`[verify-paystack] Minted ${pkg.amount} SKUBU to ${walletAddress} — tx: ${txHash}`);

        // ── 4. Record payment ──────────────────────────────────────────────
        await supabase.from('stripe_payments').insert({
            stripe_session_id: reference,   // reuse column for Paystack reference
            wallet_address:    walletAddress,
            amount:            pkg.amount,
        });

        return new Response(
            JSON.stringify({ success: true, txHash, amount: pkg.amount }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );

    } catch (err) {
        console.error('[verify-paystack]', err);
        return jsonError('Internal error', 500);
    }
});

function jsonError(msg: string, status: number) {
    return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
