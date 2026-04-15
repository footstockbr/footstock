-- M027 — Adicionar link_url ao sponsor_banners + corrigir default de position
-- Execução: psql $DATABASE_URL < prisma/migrations/M027-sponsor-banner-link-url.sql

-- 1. Adicionar coluna link_url (nullable para retrocompatibilidade)
ALTER TABLE "sponsor_banners"
  ADD COLUMN IF NOT EXISTS "link_url" TEXT;

-- 2. Corrigir default de position (era 'home-top', agora 'home_top' alinhado ao enum)
ALTER TABLE "sponsor_banners"
  ALTER COLUMN "position" SET DEFAULT 'home_top';

-- 3. Índice composto position + is_active para leitura por posição
CREATE INDEX IF NOT EXISTS "sponsor_banners_position_is_active_idx"
  ON "sponsor_banners" ("position", "is_active");
