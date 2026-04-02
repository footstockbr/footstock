-- M035_league_schema_alignment
-- Alinha leagues e league_members com o schema.prisma atual.
-- Fonte: models League e LeagueMember (schema.prisma)
--
-- leagues:  remove owner_id / season / is_active; adiciona slug, division,
--           duration, status, starts_at, ends_at, created_by, emblem_url,
--           sponsor_id; recria FK e índices.
-- league_members: adiciona score_breakdown, last_score_at, updated_at.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. leagues — adicionar colunas ausentes
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "leagues"
  ADD COLUMN IF NOT EXISTS "slug"       TEXT,
  ADD COLUMN IF NOT EXISTS "division"   TEXT NOT NULL DEFAULT 'BRONZE',
  ADD COLUMN IF NOT EXISTS "duration"   TEXT NOT NULL DEFAULT '1M',
  ADD COLUMN IF NOT EXISTS "status"     TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "starts_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "ends_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "created_by" TEXT,
  ADD COLUMN IF NOT EXISTS "emblem_url" TEXT,
  ADD COLUMN IF NOT EXISTS "sponsor_id" TEXT;

-- Preencher created_by a partir de owner_id antes de remover a coluna velha
UPDATE "leagues"
  SET "created_by" = "owner_id"
  WHERE "created_by" IS NULL AND "owner_id" IS NOT NULL;

-- Gerar slug único para linhas existentes sem slug (fallback: id)
UPDATE "leagues"
  SET "slug" = "id"
  WHERE "slug" IS NULL;

-- Tornar slug NOT NULL agora que todas as linhas têm valor
ALTER TABLE "leagues"
  ALTER COLUMN "slug"       SET NOT NULL,
  ALTER COLUMN "created_by" SET NOT NULL,
  ALTER COLUMN "ends_at"    SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. leagues — remover colunas obsoletas e restrições antigas
-- ═══════════════════════════════════════════════════════════════════════════

-- FK antiga referenciando owner_id
ALTER TABLE "leagues"
  DROP CONSTRAINT IF EXISTS "leagues_owner_id_fkey";

-- Índice antigo baseado em owner_id
DROP INDEX IF EXISTS "leagues_owner_id_idx";

-- Colunas obsoletas
ALTER TABLE "leagues"
  DROP COLUMN IF EXISTS "owner_id",
  DROP COLUMN IF EXISTS "season",
  DROP COLUMN IF EXISTS "is_active";

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. leagues — novos índices e constraints
-- ═══════════════════════════════════════════════════════════════════════════

-- Unique constraint para slug
CREATE UNIQUE INDEX IF NOT EXISTS "leagues_slug_key"
  ON "leagues"("slug");

-- FK para created_by → users.id (equivalente a @relation("LeagueCreator"))
ALTER TABLE "leagues"
  ADD CONSTRAINT "leagues_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK opcional para sponsor_id → sponsors.id
ALTER TABLE "leagues"
  ADD CONSTRAINT "leagues_sponsor_id_fkey"
    FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Índices de busca frequente
CREATE INDEX IF NOT EXISTS "leagues_created_by_idx"
  ON "leagues"("created_by");

CREATE INDEX IF NOT EXISTS "leagues_type_status_idx"
  ON "leagues"("type", "status");

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. league_members — adicionar colunas ausentes
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "league_members"
  ADD COLUMN IF NOT EXISTS "score_breakdown" JSONB,
  ADD COLUMN IF NOT EXISTS "last_score_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Índice para ranking por liga (score DESC)
CREATE INDEX IF NOT EXISTS "league_members_league_id_score_idx"
  ON "league_members"("league_id", "score" DESC);

-- down:
-- ALTER TABLE "league_members" DROP COLUMN IF EXISTS "score_breakdown", DROP COLUMN IF EXISTS "last_score_at", DROP COLUMN IF EXISTS "updated_at";
-- DROP INDEX IF EXISTS "league_members_league_id_score_idx";
-- ALTER TABLE "leagues" DROP CONSTRAINT IF EXISTS "leagues_sponsor_id_fkey";
-- ALTER TABLE "leagues" DROP CONSTRAINT IF EXISTS "leagues_created_by_fkey";
-- DROP INDEX IF EXISTS "leagues_type_status_idx";
-- DROP INDEX IF EXISTS "leagues_created_by_idx";
-- DROP INDEX IF EXISTS "leagues_slug_key";
-- ALTER TABLE "leagues" DROP COLUMN IF EXISTS "sponsor_id", DROP COLUMN IF EXISTS "emblem_url", DROP COLUMN IF EXISTS "created_by", DROP COLUMN IF EXISTS "ends_at", DROP COLUMN IF EXISTS "starts_at", DROP COLUMN IF EXISTS "status", DROP COLUMN IF EXISTS "duration", DROP COLUMN IF EXISTS "division", DROP COLUMN IF EXISTS "slug";
-- ALTER TABLE "leagues" ADD COLUMN "owner_id" TEXT, ADD COLUMN "season" INTEGER, ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
