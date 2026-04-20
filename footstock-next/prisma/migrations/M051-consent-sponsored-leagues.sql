-- M051: Add SPONSORED_LEAGUES to ConsentPurpose enum
-- Migration for WAVE 4 T-12 (LGPD modal para ligas patrocinadas)

-- Add SPONSORED_LEAGUES to the enum
ALTER TYPE "ConsentPurpose" ADD VALUE 'SPONSORED_LEAGUES' AFTER 'AGE_VERIFICATION';

-- Verify the enum was updated
-- SELECT enum_range(NULL::"ConsentPurpose");
