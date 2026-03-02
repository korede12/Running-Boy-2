-- ── Running Boy — Skubu on-chain schema ──────────────────────────────────

-- Tracks every successful on-chain mint (one row per game session)
CREATE TABLE IF NOT EXISTS skubu_mints (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address text        NOT NULL,
    amount         int         NOT NULL,
    session_id     text        NOT NULL UNIQUE,   -- prevents double-mint
    created_at     timestamptz DEFAULT now()
);

-- Global leaderboard (written by Edge Functions with service role)
CREATE TABLE IF NOT EXISTS scores (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address text,
    player_name    text        NOT NULL,
    score          int         NOT NULL,
    created_at     timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE skubu_mints ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores      ENABLE ROW LEVEL SECURITY;

-- skubu_mints: no client access — Edge Function uses service role
-- scores: anyone can read (leaderboard), Edge Function writes
CREATE POLICY "scores_read" ON scores
    FOR SELECT USING (true);
