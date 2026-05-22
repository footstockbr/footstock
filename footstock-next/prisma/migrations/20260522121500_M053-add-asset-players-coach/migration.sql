-- ============================================================================
-- M053 (timestamped): Add coach_name and players columns to assets table
--
-- ORIGINAL: prisma/migrations/M053-add-asset-players-coach.sql (flat file —
-- nunca aplicado via `prisma migrate deploy` porque flat .sql nao sao
-- descobertos pelo migrator do Prisma 7). Convertido em pasta timestamped em
-- 2026-05-22 para garantir aplicacao em producao.
--
-- ESCOPO
--   coach_name e players alimentam o "second-pass" do news-matching fallback
--   em resolveTickerFromText (quando first-pass com realName+aliases+searchText
--   nao identifica o clube).
--
-- SEGURANCA (LGPD)
--   coach_name e players sao SUPER_ADMIN only. NUNCA expor em endpoints
--   publicos — mesma politica de real_name e search_text.
--
-- IDEMPOTENCIA
--   ADD COLUMN IF NOT EXISTS garante que ambientes onde M053 ja foi aplicado
--   manualmente (e.g. via psql direto antes desta conversao) nao quebram.
--   Sem-op se as duas colunas ja existem.
-- ============================================================================

ALTER TABLE "assets"
  ADD COLUMN IF NOT EXISTS "coach_name" TEXT,
  ADD COLUMN IF NOT EXISTS "players" TEXT NOT NULL DEFAULT '';
