-- M037 — T-013: Add tour_skipped_at field for analytics
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tour_skipped_at" TIMESTAMPTZ;
