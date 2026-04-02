-- M025: Admin Audit Extension (module-22-admin-dashboard-motor)
-- Extends admin_market_actions for flexible audit trail.
-- Changes: assetId nullable, reason nullable, adds ticker, details, ip_address

-- Make assetId nullable
ALTER TABLE "admin_market_actions" ALTER COLUMN "asset_id" DROP NOT NULL;

-- Make reason nullable
ALTER TABLE "admin_market_actions" ALTER COLUMN "reason" DROP NOT NULL;

-- Add new audit fields
ALTER TABLE "admin_market_actions"
  ADD COLUMN IF NOT EXISTS "ticker" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "details" JSONB,
  ADD COLUMN IF NOT EXISTS "ip_address" TEXT;

-- Update index: replace assetId index with action index (more useful)
DROP INDEX IF EXISTS "admin_market_actions_asset_id_idx";
CREATE INDEX IF NOT EXISTS "admin_market_actions_action_idx" ON "admin_market_actions"("action");
