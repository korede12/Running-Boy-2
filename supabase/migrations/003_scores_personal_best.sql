-- ── Running Boy — Personal-best leaderboard ──────────────────────────────
-- Keep only one row per wallet (highest score).

-- 1. Deduplicate existing rows — keep max score per wallet; on tie keep oldest row.
DELETE FROM scores s
WHERE id NOT IN (
    SELECT DISTINCT ON (wallet_address) id
    FROM scores
    ORDER BY wallet_address, score DESC, created_at ASC
);

-- 2. Add unique constraint so future upserts conflict on wallet_address.
ALTER TABLE scores ADD CONSTRAINT scores_wallet_unique UNIQUE (wallet_address);

-- 3. RPC function: insert or update only when the new score beats the stored one.
CREATE OR REPLACE FUNCTION upsert_score(
    p_wallet_address text,
    p_player_name    text,
    p_score          int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO scores (wallet_address, player_name, score)
    VALUES (p_wallet_address, p_player_name, p_score)
    ON CONFLICT (wallet_address)
    DO UPDATE SET
        score       = GREATEST(excluded.score, scores.score),
        player_name = CASE
                          WHEN excluded.score > scores.score THEN excluded.player_name
                          ELSE scores.player_name
                      END
    WHERE excluded.score > scores.score;
END;
$$;
