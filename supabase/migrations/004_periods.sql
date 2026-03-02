-- ── Running Boy — Daily leaderboard periods ──────────────────────────────
-- Each day (UTC) is a separate leaderboard period.
-- Only one personal-best row per wallet per period.

-- 1. Add period column (YYYY-MM-DD UTC). Backfill from created_at.
ALTER TABLE scores ADD COLUMN IF NOT EXISTS period text;
UPDATE scores SET period = to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') WHERE period IS NULL;
ALTER TABLE scores ALTER COLUMN period SET NOT NULL;
ALTER TABLE scores ALTER COLUMN period SET DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD');

-- 2. Drop the all-time unique constraint (from migration 003).
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_wallet_unique;

-- 3. New unique: one personal best per wallet per period.
ALTER TABLE scores ADD CONSTRAINT scores_wallet_period_unique UNIQUE (wallet_address, period);

-- 4. Update upsert_score to scope to the given period.
CREATE OR REPLACE FUNCTION upsert_score(
    p_wallet_address text,
    p_player_name    text,
    p_score          int,
    p_period         text DEFAULT to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO scores (wallet_address, player_name, score, period)
    VALUES (p_wallet_address, p_player_name, p_score, p_period)
    ON CONFLICT (wallet_address, period)
    DO UPDATE SET
        score       = GREATEST(excluded.score, scores.score),
        player_name = CASE
                          WHEN excluded.score > scores.score THEN excluded.player_name
                          ELSE scores.player_name
                      END
    WHERE excluded.score > scores.score;
END;
$$;

-- 5. RPC: return top N for a period, include wallet_address for rank highlight.
CREATE OR REPLACE FUNCTION get_leaderboard(
    p_period text,
    p_limit  int DEFAULT 10
) RETURNS TABLE(rank bigint, player_name text, score int, wallet_address text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT
        ROW_NUMBER() OVER (ORDER BY s.score DESC) AS rank,
        s.player_name,
        s.score,
        s.wallet_address
    FROM scores s
    WHERE s.period = p_period
    ORDER BY s.score DESC
    LIMIT p_limit;
$$;

-- 6. RPC: get a specific wallet's rank + score for a period.
CREATE OR REPLACE FUNCTION get_player_rank(
    p_wallet text,
    p_period text
) RETURNS TABLE(rank bigint, score int)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT t.rank, t.score FROM (
        SELECT
            wallet_address,
            score,
            ROW_NUMBER() OVER (ORDER BY score DESC) AS rank
        FROM scores
        WHERE period = p_period
    ) t
    WHERE t.wallet_address = p_wallet;
$$;
