-- M052: Remove unused coachName column from Asset table
-- This field was not being used and conflicts with actual database schema

ALTER TABLE "Asset" DROP COLUMN IF EXISTS "coach_name";

-- Verify the column is removed
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'Asset';
