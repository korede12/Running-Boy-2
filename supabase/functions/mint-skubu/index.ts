// ── mint-skubu Edge Function ──────────────────────────────────────────────
// POST { address, amount, sessionId, signature, message }
// 1. Validate timestamp in message is within 5 minutes (anti-replay)
// 2. Verify ECDSA signature
// 3. Check session not already minted (UNIQUE constraint)
// 4. Mint ERC-20 via Thirdweb server wallet
// 5. Record mint and return { success: true, txHash }

import { createClient }       from "https://esm.sh/@supabase/supabase-js@2";
import { createThirdwebClient, getContract, sendTransaction } from "https://esm.sh/thirdweb@5";
import { privateKeyToAccount } from "https://esm.sh/thirdweb@5/wallets";
import { mintTo }              from "https://esm.sh/thirdweb@5/extensions/erc20";
import { baseSepolia }         from "https://esm.sh/thirdweb@5/chains";
import { verifyMessage }       from "https://esm.sh/viem@2";

const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { address, amount, sessionId, signature, message } =
            await req.json() as {
                address:   string;
                amount:    number;
                sessionId: string;
                signature: string;
                message:   string;
            };

        // ── 1. Basic validation ────────────────────────────────────────────
        if (!address || !amount || !sessionId || !signature || !message) {
            return jsonError('Missing required fields', 400);
        }
        if (amount > 10) {
            return jsonError('Amount exceeds per-session cap of 10', 400);
        }

        // ── 2. Timestamp check (anti-replay: must be within 5 min) ─────────
        const tsMatch = message.match(/Timestamp:\s*(\d+)/);
        if (!tsMatch) return jsonError('Invalid message format', 400);
        const msgTs = parseInt(tsMatch[1]);
        if (Date.now() - msgTs > 5 * 60 * 1000) {
            return jsonError('Message timestamp expired', 400);
        }

        // ── 3. Verify ECDSA signature ──────────────────────────────────────
        const valid = await verifyMessage({
            address:   address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });
        if (!valid) {
            return jsonError('Invalid signature', 401);
        }

        // ── 4. Check session not already minted ────────────────────────────
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { data: existing } = await supabase
            .from('skubu_mints')
            .select('id')
            .eq('session_id', sessionId)
            .maybeSingle();
        if (existing) {
            return jsonError('Session already minted', 409);
        }

        // ── 5. Mint ERC-20 via Thirdweb server wallet ──────────────────────
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

        // amount is whole tokens; mintTo extension handles 18-decimal conversion
        const tx = mintTo({ contract, to: address, amount: amount.toString() });
        const receipt = await sendTransaction({ transaction: tx, account: minterAccount });

        // ── 6. Record mint ─────────────────────────────────────────────────
        await supabase.from('skubu_mints').insert({
            wallet_address: address,
            amount,
            session_id:     sessionId,
        });

        return new Response(
            JSON.stringify({ success: true, txHash: receipt.transactionHash }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );

    } catch (err) {
        console.error('[mint-skubu]', err);
        return jsonError('Internal server error', 500);
    }
});

function jsonError(msg: string, status: number) {
    return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
}
