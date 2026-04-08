-- ============================================================
-- M046 — SEED RETROATIVO: price_history + opened_at
-- Foot Stock — Colar no Supabase SQL Editor
-- ============================================================
-- O que faz:
--   1. Corrige opened_at das posições de teste para cobrir 30 dias
--   2. Insere 31 candles diários (dia -30 → hoje) para os assets
--      de todas as posições de teste
--   3. Preço determinístico: cresce linearmente de 90% → 100%
--      do current_price (sem Math.random())
--   4. Idempotente: ON CONFLICT (id) DO NOTHING
-- ============================================================

BEGIN;

-- ── 1. Corrigir opened_at para cobrir o período de 30 dias ─────────────────

UPDATE positions SET opened_at = (CURRENT_TIMESTAMP - INTERVAL '28 days') WHERE id = 'pos-001';
UPDATE positions SET opened_at = (CURRENT_TIMESTAMP - INTERVAL '25 days') WHERE id = 'pos-002';
UPDATE positions SET opened_at = (CURRENT_TIMESTAMP - INTERVAL '23 days') WHERE id = 'pos-003';
UPDATE positions SET opened_at = (CURRENT_TIMESTAMP - INTERVAL '20 days') WHERE id = 'pos-004';
UPDATE positions SET opened_at = (CURRENT_TIMESTAMP - INTERVAL '27 days') WHERE id = 'pos-005';

-- ── 2. Inserir price_history retroativo (31 dias, determinístico) ───────────
--
-- ID  : 'retro-{asset_id}-{YYYY-MM-DD}' — determinístico, idempotente
-- open: close × 1.005   (levemente acima do fechamento)
-- high: close × 1.020
-- low : close × 0.980
-- close: current_price × (0.90 + 0.10 × dia/30)
--         → começa 10% abaixo do preço atual e sobe linearmente até ele
-- volume: 50.000 (fixo)
-- session_type: REGULAR

INSERT INTO price_history (
  id, asset_id, "timestamp", "open", high, low, close, volume, session_type
)
SELECT
  concat('retro-', p.asset_id, '-', TO_CHAR(gs.day::date, 'YYYY-MM-DD'))                         AS id,
  p.asset_id,
  gs.day::timestamptz                                                                              AS "timestamp",
  ROUND(CAST(a.current_price AS NUMERIC)
    * (0.90 + 0.10 * (gs.day::date - (CURRENT_DATE - 30))::numeric / 30.0)
    * 1.005, 8)                                                                                   AS "open",
  ROUND(CAST(a.current_price AS NUMERIC)
    * (0.90 + 0.10 * (gs.day::date - (CURRENT_DATE - 30))::numeric / 30.0)
    * 1.020, 8)                                                                                   AS high,
  ROUND(CAST(a.current_price AS NUMERIC)
    * (0.90 + 0.10 * (gs.day::date - (CURRENT_DATE - 30))::numeric / 30.0)
    * 0.980, 8)                                                                                   AS low,
  ROUND(CAST(a.current_price AS NUMERIC)
    * (0.90 + 0.10 * (gs.day::date - (CURRENT_DATE - 30))::numeric / 30.0)
    , 8)                                                                                          AS close,
  50000::bigint                                                                                   AS volume,
  'REGULAR'::"SessionType"                                                                        AS session_type
FROM (
  -- Assets de todas as posições de teste (open + closed)
  SELECT DISTINCT asset_id
  FROM positions
  WHERE id IN ('pos-001', 'pos-002', 'pos-003', 'pos-004', 'pos-005')
) p
JOIN assets a ON a.id = p.asset_id
CROSS JOIN generate_series(
  (CURRENT_DATE - 30)::timestamptz,
   CURRENT_DATE::timestamptz,
   INTERVAL '1 day'
) AS gs(day)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
-- VERIFICAÇÃO (rodar separado para confirmar)
-- ============================================================
-- SELECT asset_id, COUNT(*) as candles, MIN("timestamp")::date as desde, MAX("timestamp")::date as ate
-- FROM price_history
-- WHERE id LIKE 'retro-%'
-- GROUP BY asset_id
-- ORDER BY asset_id;
--
-- SELECT id, opened_at, status FROM positions WHERE id IN ('pos-001','pos-002','pos-003','pos-004','pos-005');
