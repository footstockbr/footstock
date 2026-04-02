-- M030: Decouple Sponsor from Asset (1:1 → N:1 optional)
-- Removes @unique constraint on asset_id to allow multiple sponsors per asset
-- Makes asset_id nullable so sponsors can exist independently of a club

-- Drop the unique constraint
ALTER TABLE "sponsors" DROP CONSTRAINT IF EXISTS "sponsors_asset_id_key";

-- Make asset_id nullable
ALTER TABLE "sponsors" ALTER COLUMN "asset_id" DROP NOT NULL;
