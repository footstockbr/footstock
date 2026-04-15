-- ============================================================================
-- M040 — Liga PRO: Troféus, Banner ID em League, isActive/createdBy em Sponsor,
--        imageUrl/sponsorId em SponsorBanner
-- Fonte: T-017 — Ligas PRO com Patrocinadores
-- ============================================================================

-- 1. Enum TrophyType
CREATE TYPE "TrophyType" AS ENUM (
  'PRO_LEAGUE_WINNER',
  'PRO_LEAGUE_RUNNER_UP',
  'PRO_LEAGUE_THIRD'
);

-- 2. Adicionar campos a Sponsor
ALTER TABLE "sponsors"
  ADD COLUMN IF NOT EXISTS "is_active"  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "created_by" TEXT;

-- 3. Adicionar campos a SponsorBanner
ALTER TABLE "sponsor_banners"
  ADD COLUMN IF NOT EXISTS "image_url"  TEXT,
  ADD COLUMN IF NOT EXISTS "width"      INTEGER,
  ADD COLUMN IF NOT EXISTS "height"     INTEGER,
  ADD COLUMN IF NOT EXISTS "sponsor_id" TEXT REFERENCES "sponsors"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "sponsor_banners_sponsor_id_idx" ON "sponsor_banners"("sponsor_id");

-- 4. Adicionar bannerId em League
ALTER TABLE "leagues"
  ADD COLUMN IF NOT EXISTS "banner_id" TEXT REFERENCES "sponsor_banners"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "leagues_banner_id_idx" ON "leagues"("banner_id");

-- 5. Criar tabela league_trophies
CREATE TABLE IF NOT EXISTS "league_trophies" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "user_id"     TEXT        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "league_id"   TEXT        NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "trophy_type" "TrophyType" NOT NULL,
  "position"    INTEGER     NOT NULL,
  "awarded_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "league_trophies_user_id_league_id_trophy_type_key"
    UNIQUE("user_id", "league_id", "trophy_type")
);

CREATE INDEX IF NOT EXISTS "league_trophies_user_id_awarded_at_idx"
  ON "league_trophies"("user_id", "awarded_at" DESC);

CREATE INDEX IF NOT EXISTS "league_trophies_league_id_idx"
  ON "league_trophies"("league_id");
