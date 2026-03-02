-- ── Running Boy — Payment records ─────────────────────────────────────────
-- Tracks every completed Paystack payment (prevents duplicate minting)
-- Column named stripe_session_id stores the Paystack payment reference

CREATE TABLE IF NOT EXISTS stripe_payments (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_session_id text        NOT NULL UNIQUE,  -- Paystack payment reference
    wallet_address    text        NOT NULL,
    amount            int         NOT NULL,          -- SKUBU tokens minted
    created_at        timestamptz DEFAULT now()
);

-- Row Level Security — Edge Function uses service role; no client access
ALTER TABLE stripe_payments ENABLE ROW LEVEL SECURITY;
