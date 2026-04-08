-- ============================================================
-- M047 — SEED DIVIDENDOS a partir das posições existentes
-- Foot Stock — Colar no Supabase SQL Editor
-- ============================================================
-- O que faz:
--   Gera dividendos para cada posição OPEN dos usuários de teste
--   (craque, lenda, jogador), cobrindo todos os tipos e status:
--
--   Por posição:
--     1. FINANCEIRO CREDITED  — dividendo mensal já pago (mês anterior)
--     2. FINANCEIRO PENDING   — dividendo do mês atual (aguardando 7 dias)
--     3. ESPORTIVO CREDITED   — vitória recente (VITORIA)
--     4. ESPORTIVO PENDING    — título recente (TITULO), craque/lenda
--
--   Adicionalmente:
--     5. FINANCEIRO EXPIRADO  — para jogador (expirou sem crédito)
--
--   Yield calculado sobre: quantidade × preço_médio
--     FINANCEIRO: 1.8% (credited), 1.2% (pending)
--     ESPORTIVO:  2.5% vitória (credited), 4.0% título (pending)
--
--   IDs determinísticos: 'sdiv-{tipo}-{status}-{pos_id}'
--   Idempotente: ON CONFLICT (id) DO NOTHING
-- ============================================================

BEGIN;

-- ── CTE: usuários de teste ──────────────────────────────────────────────────

WITH test_users AS (
  SELECT id, email,
    CASE
      WHEN email = 'craque@foot-stock.test'  THEN 'craque'
      WHEN email = 'lenda@foot-stock.test'   THEN 'lenda'
      WHEN email = 'jogador@foot-stock.test' THEN 'jogador'
    END AS role
  FROM users
  WHERE email IN (
    'craque@foot-stock.test',
    'lenda@foot-stock.test',
    'jogador@foot-stock.test'
  )
),

-- ── CTE: posições ativas dos usuários de teste ──────────────────────────────

open_positions AS (
  SELECT
    p.id           AS pos_id,
    p.user_id,
    tu.role,
    a.ticker,
    a.name         AS club_name,
    CAST(p.quantity  AS NUMERIC)    AS qty,
    CAST(p.avg_price AS NUMERIC)    AS avg_price,
    CAST(p.quantity  AS NUMERIC) * CAST(p.avg_price AS NUMERIC) AS base_value
  FROM positions p
  JOIN assets    a  ON a.id   = p.asset_id
  JOIN test_users tu ON tu.id = p.user_id
  WHERE p.status = 'OPEN'
),

-- ── CTE: todos os dividendos a inserir ─────────────────────────────────────

dividends_to_insert AS (

  -- 1. FINANCEIRO CREDITED — mês anterior, já pago
  SELECT
    'sdiv-fin-cred-' || pos_id                               AS id,
    user_id,
    ticker, club_name,
    'FINANCEIRO'                                             AS type,
    ROUND(base_value * 0.018, 8)                             AS amount,
    1.8                                                      AS yield_percent,
    'CREDITED'                                               AS status,
    TO_CHAR(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM')    AS processed_month,
    (CURRENT_TIMESTAMP - INTERVAL '25 days')                 AS scheduled_for,
    NULL::TEXT                                               AS trigger_event,
    (CURRENT_TIMESTAMP - INTERVAL '25 days')                 AS created_at
  FROM open_positions

  UNION ALL

  -- 2. FINANCEIRO PENDING — mês atual, aguardando crédito (5 dias restantes)
  SELECT
    'sdiv-fin-pend-' || pos_id,
    user_id,
    ticker, club_name,
    'FINANCEIRO',
    ROUND(base_value * 0.012, 8),
    1.2,
    'PENDING',
    TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
    CURRENT_TIMESTAMP + INTERVAL '5 days',
    NULL::TEXT,
    (CURRENT_TIMESTAMP - INTERVAL '2 days')
  FROM open_positions

  UNION ALL

  -- 3. ESPORTIVO CREDITED — vitória recente (todos os usuários)
  SELECT
    'sdiv-esp-cred-vit-' || pos_id,
    user_id,
    ticker, club_name,
    'ESPORTIVO',
    ROUND(base_value * 0.025, 8),
    2.5,
    'CREDITED',
    TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
    (CURRENT_TIMESTAMP - INTERVAL '7 days'),
    'VITORIA',
    (CURRENT_TIMESTAMP - INTERVAL '10 days')
  FROM open_positions

  UNION ALL

  -- 4. ESPORTIVO PENDING — título (apenas craque e lenda, dentro do prazo)
  SELECT
    'sdiv-esp-pend-tit-' || pos_id,
    user_id,
    ticker, club_name,
    'ESPORTIVO',
    ROUND(base_value * 0.040, 8),
    4.0,
    'PENDING',
    TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
    CURRENT_TIMESTAMP + INTERVAL '3 days',
    'TITULO',
    (CURRENT_TIMESTAMP - INTERVAL '4 days')
  FROM open_positions
  WHERE role IN ('craque', 'lenda')

  UNION ALL

  -- 5. FINANCEIRO EXPIRADO — jogador, mês passado (não creditado a tempo)
  SELECT
    'sdiv-fin-exp-' || pos_id,
    user_id,
    ticker, club_name,
    'FINANCEIRO',
    ROUND(base_value * 0.009, 8),
    0.9,
    'EXPIRADO',
    TO_CHAR(CURRENT_DATE - INTERVAL '2 months', 'YYYY-MM'),
    (CURRENT_TIMESTAMP - INTERVAL '40 days'),
    NULL::TEXT,
    (CURRENT_TIMESTAMP - INTERVAL '40 days')
  FROM open_positions
  WHERE role = 'jogador'

)

-- ── INSERT idempotente ───────────────────────────────────────────────────────

INSERT INTO dividends (
  id, user_id, ticker, club_name, type,
  amount, yield_percent, status,
  processed_month, scheduled_for, trigger_event, created_at
)
SELECT
  id, user_id, ticker, club_name, type,
  amount, yield_percent, status,
  processed_month, scheduled_for, trigger_event, created_at
FROM dividends_to_insert
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICAÇÃO (rodar separado)
-- ============================================================
-- SELECT
--   u.email,
--   d.ticker,
--   d.type,
--   d.status,
--   d.amount,
--   d.yield_percent,
--   d.trigger_event,
--   d.created_at::date
-- FROM dividends d
-- JOIN users u ON u.id = d.user_id
-- WHERE d.id LIKE 'sdiv-%'
-- ORDER BY u.email, d.type, d.status;
