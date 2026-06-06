-- M056 — PriceHistory causal attribution
-- Stores the motor's tick-time causal trace so value analysis can explain
-- movements from authored engine data instead of reconstructing after the fact.

ALTER TABLE "price_history"
  ADD COLUMN IF NOT EXISTS "attribution" JSONB;

CREATE INDEX IF NOT EXISTS "price_history_attribution_primary_cause_idx"
  ON "price_history" ((attribution->>'primaryCause'));
