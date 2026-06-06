-- M053 — PriceHistory causal attribution

ALTER TABLE "price_history"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'REAL';

ALTER TABLE "price_history"
  ADD COLUMN IF NOT EXISTS "attribution" JSONB;

CREATE INDEX IF NOT EXISTS "price_history_asset_id_source_idx"
  ON "price_history"("asset_id", "source");

CREATE INDEX IF NOT EXISTS "price_history_attribution_primary_cause_idx"
  ON "price_history" ((attribution->>'primaryCause'));
