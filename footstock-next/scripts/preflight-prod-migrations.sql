-- ============================================================================
-- Preflight de producao — rodar ANTES de habilitar preDeployCommand no Railway
--
-- USO:
--   psql "$PROD_DATABASE_URL" -f scripts/preflight-prod-migrations.sql
--
-- O que valida:
--   1. Estado de _prisma_migrations (precisa ter baseline _init aplicado)
--   2. Existencia dos 40 tickers canonicos na tabela assets
--   3. Quantos canonicos estao com real_name NULL (alvo do M056)
--   4. Tickers extras alem dos 40 (legados) e seu estado real_name
--   5. Impacto do M055 (plan_type nullable) — quantos staff/admin tem plan_type NULL
--   6. Coluna `players` existe? (impacto M053)
--
-- Output esperado para SAFE_TO_DEPLOY:
--   - migration_baseline_ok = t
--   - canonical_missing_count = 0
--   - canonical_null_real_name <= 40 (M056 vai popular)
--   - players_column_exists pode ser f (M053 vai criar)
--   - staff_plan_type_null = 0 (caso contrario M055 quebra invariante)
-- ============================================================================

\echo '=== 1. Migration baseline ==='
SELECT
  EXISTS (
    SELECT 1 FROM _prisma_migrations
    WHERE migration_name = '20260420155654_init'
      AND finished_at IS NOT NULL
  ) AS migration_baseline_ok,
  (SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL) AS pending_or_failed_count;

\echo ''
\echo '=== 2. Canonical tickers — quantos existem dos 40 ==='
WITH canonical AS (
  SELECT unnest(ARRAY[
    'URU3','POR3','TIM3','TRI3','GAL3','IMO3','COL3','GUE3','BAL3','MAL3',
    'FOG3','FUR3','FOR3','TFN3','RAP3','RBB3','CUI3','VIT3','JUV3','MIR3',
    'LEI3','NTL3','AVA3','GOI3','CHA3','PON3','GUA3','OPE3','SAM3','TIS3',
    'LON3','FIG3','PAY3','CFC3','AME3','BSA3','CRB3','CSA3','ITA3','TON3'
  ]) AS ticker
)
SELECT
  COUNT(*) FILTER (WHERE a.ticker IS NOT NULL) AS canonical_present,
  COUNT(*) FILTER (WHERE a.ticker IS NULL) AS canonical_missing_count,
  string_agg(c.ticker, ', ') FILTER (WHERE a.ticker IS NULL) AS missing_tickers
FROM canonical c
LEFT JOIN assets a ON a.ticker = c.ticker;

\echo ''
\echo '=== 3. Canonical com real_name NULL (alvo M056) ==='
SELECT
  COUNT(*) AS canonical_null_real_name,
  string_agg(ticker, ', ') AS tickers_with_null_real_name
FROM assets
WHERE ticker IN (
  'URU3','POR3','TIM3','TRI3','GAL3','IMO3','COL3','GUE3','BAL3','MAL3',
  'FOG3','FUR3','FOR3','TFN3','RAP3','RBB3','CUI3','VIT3','JUV3','MIR3',
  'LEI3','NTL3','AVA3','GOI3','CHA3','PON3','GUA3','OPE3','SAM3','TIS3',
  'LON3','FIG3','PAY3','CFC3','AME3','BSA3','CRB3','CSA3','ITA3','TON3'
)
  AND real_name IS NULL;

\echo ''
\echo '=== 4. Tickers extras (legados) — fora dos 40 canonicos ==='
SELECT
  COUNT(*) AS legacy_count,
  COUNT(*) FILTER (WHERE real_name IS NULL) AS legacy_with_null_real_name,
  string_agg(ticker, ', ' ORDER BY ticker) AS legacy_tickers
FROM assets
WHERE ticker NOT IN (
  'URU3','POR3','TIM3','TRI3','GAL3','IMO3','COL3','GUE3','BAL3','MAL3',
  'FOG3','FUR3','FOR3','TFN3','RAP3','RBB3','CUI3','VIT3','JUV3','MIR3',
  'LEI3','NTL3','AVA3','GOI3','CHA3','PON3','GUA3','OPE3','SAM3','TIS3',
  'LON3','FIG3','PAY3','CFC3','AME3','BSA3','CRB3','CSA3','ITA3','TON3'
);

\echo ''
\echo '=== 5. Coluna players (impacto M053) ==='
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='assets' AND column_name='players'
  ) AS players_column_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='assets' AND column_name='coach_name'
  ) AS coach_name_column_exists;

\echo ''
\echo '=== 6. Impacto M055 (plan_type nullable) — usuarios com plan_type ja NULL ==='
SELECT
  COUNT(*) FILTER (WHERE plan_type IS NULL) AS users_with_null_plan_type,
  COUNT(*) FILTER (WHERE plan_type IS NULL AND admin_role IS NOT NULL) AS staff_with_null_plan_type
FROM users;
