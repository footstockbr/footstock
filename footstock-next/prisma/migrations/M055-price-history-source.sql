-- ============================================================================
-- M055 — Price history source drift fix
--
-- Production drift observed on 2026-06-05: price_history existed without the
-- source column expected by Prisma schema and value-analysis reporting.
-- ============================================================================

ALTER TABLE "price_history"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'REAL';

CREATE INDEX IF NOT EXISTS "price_history_asset_id_source_idx"
  ON "price_history"("asset_id", "source");
