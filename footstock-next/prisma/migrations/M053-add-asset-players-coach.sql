-- M053: Add coach_name and players columns to assets table.
-- These fields power the "second pass" news-matching fallback used by
-- resolveTickerFromText when the first pass (realName + aliases + searchText)
-- fails to identify a club.
--
-- SECURITY: coach_name and players are SUPER_ADMIN only. They must NEVER
-- be returned from public endpoints — same policy as real_name and search_text.

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "coach_name" TEXT,
  ADD COLUMN IF NOT EXISTS "players" TEXT NOT NULL DEFAULT '';

-- Verification (informational):
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'assets' AND column_name IN ('coach_name', 'players');
