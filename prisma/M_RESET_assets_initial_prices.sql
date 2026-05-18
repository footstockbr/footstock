-- ============================================================
-- RESET: Preços e contadores dos 40 ativos para valores de IPO
-- Foot Stock — Colar no Supabase SQL Editor
-- Gerado em: 2026-05-16
-- ============================================================
-- O que faz:
--   1. Restaura current_price, open_price, close_price e fair_value
--      para os valores de IPO (calculados pela fórmula de seed)
--   2. Recalcula market_cap = price × 1.000.000 (total_shares)
--   3. Zera volume (BigInt)
--   4. Libera todos os halts (is_halted = false, halt_reason = null)
--   5. Reseta is_active = true e sentiment = 'NEUTRAL'
--   6. Atualiza financials.ipoPrice no JSONB
--   7. Deleta price_history de todos os 40 ativos (recomeço limpo)
--
-- Preços IPO derivados da fórmula de seed (prisma/seed/assets.ts)
-- com ordem canônica do INTAKE (_lib_legacy_backup/constants/clubs.ts):
--   Série A: fan=max(2, 18-i×0.6), titles=max(0, 6-⌊i/4⌋), perf=max(4, 8.5-(i%6)×0.5)
--   Série B: fan=max(0.8, 6-i×0.2), titles=max(0, 2-⌊i/7⌋), perf=max(3, 6.5-(i%6)×0.4)
--   price = round(fan×0.5 + titles×2 + perf×0.3, 2)
-- ============================================================

BEGIN;

-- ── 1. Reset preços e status dos 40 ativos ─────────────────────────────────

UPDATE assets
SET
  current_price  = CASE
    WHEN ticker = 'URU3' THEN 23.55
    WHEN ticker = 'POR4' THEN 23.10
    WHEN ticker = 'TIM3' THEN 22.65
    WHEN ticker = 'TRI4' THEN 22.20
    WHEN ticker = 'GAL3' THEN 19.75
    WHEN ticker = 'FOG3' THEN 19.30
    WHEN ticker = 'COL3' THEN 19.75
    WHEN ticker = 'IMO3' THEN 19.30
    WHEN ticker = 'RAP3' THEN 16.85
    WHEN ticker = 'MAL4' THEN 16.40
    WHEN ticker = 'TRI3' THEN 15.95
    WHEN ticker = 'GUE4' THEN 15.50
    WHEN ticker = 'TOR3' THEN 13.95
    WHEN ticker = 'LEM3' THEN 13.50
    WHEN ticker = 'BAL4' THEN 13.05
    WHEN ticker = 'FUR3' THEN 12.60
    WHEN ticker = 'VOA4' THEN 10.15
    WHEN ticker = 'CON3' THEN  9.70
    WHEN ticker = 'LEA3' THEN 10.15
    WHEN ticker = 'LEB3' THEN  9.70
    WHEN ticker = 'COE3' THEN  8.95
    WHEN ticker = 'CAV4' THEN  8.73
    WHEN ticker = 'DRA3' THEN  8.51
    WHEN ticker = 'LEI4' THEN  8.29
    WHEN ticker = 'PAN3' THEN  8.07
    WHEN ticker = 'VOZ3' THEN  7.85
    WHEN ticker = 'GAP3' THEN  8.35
    WHEN ticker = 'TIG4' THEN  6.13
    WHEN ticker = 'DOU4' THEN  5.91
    WHEN ticker = 'LEP4' THEN  5.69
    WHEN ticker = 'PER3' THEN  5.47
    WHEN ticker = 'IND4' THEN  5.25
    WHEN ticker = 'TUB3' THEN  5.75
    WHEN ticker = 'NAF3' THEN  5.53
    WHEN ticker = 'TIV3' THEN  3.31
    WHEN ticker = 'FAS3' THEN  3.09
    WHEN ticker = 'MAC4' THEN  2.87
    WHEN ticker = 'ABT4' THEN  2.65
    WHEN ticker = 'LEI3' THEN  3.15
    WHEN ticker = 'TIS3' THEN  2.93
  END,
  open_price     = CASE
    WHEN ticker = 'URU3' THEN 23.55
    WHEN ticker = 'POR4' THEN 23.10
    WHEN ticker = 'TIM3' THEN 22.65
    WHEN ticker = 'TRI4' THEN 22.20
    WHEN ticker = 'GAL3' THEN 19.75
    WHEN ticker = 'FOG3' THEN 19.30
    WHEN ticker = 'COL3' THEN 19.75
    WHEN ticker = 'IMO3' THEN 19.30
    WHEN ticker = 'RAP3' THEN 16.85
    WHEN ticker = 'MAL4' THEN 16.40
    WHEN ticker = 'TRI3' THEN 15.95
    WHEN ticker = 'GUE4' THEN 15.50
    WHEN ticker = 'TOR3' THEN 13.95
    WHEN ticker = 'LEM3' THEN 13.50
    WHEN ticker = 'BAL4' THEN 13.05
    WHEN ticker = 'FUR3' THEN 12.60
    WHEN ticker = 'VOA4' THEN 10.15
    WHEN ticker = 'CON3' THEN  9.70
    WHEN ticker = 'LEA3' THEN 10.15
    WHEN ticker = 'LEB3' THEN  9.70
    WHEN ticker = 'COE3' THEN  8.95
    WHEN ticker = 'CAV4' THEN  8.73
    WHEN ticker = 'DRA3' THEN  8.51
    WHEN ticker = 'LEI4' THEN  8.29
    WHEN ticker = 'PAN3' THEN  8.07
    WHEN ticker = 'VOZ3' THEN  7.85
    WHEN ticker = 'GAP3' THEN  8.35
    WHEN ticker = 'TIG4' THEN  6.13
    WHEN ticker = 'DOU4' THEN  5.91
    WHEN ticker = 'LEP4' THEN  5.69
    WHEN ticker = 'PER3' THEN  5.47
    WHEN ticker = 'IND4' THEN  5.25
    WHEN ticker = 'TUB3' THEN  5.75
    WHEN ticker = 'NAF3' THEN  5.53
    WHEN ticker = 'TIV3' THEN  3.31
    WHEN ticker = 'FAS3' THEN  3.09
    WHEN ticker = 'MAC4' THEN  2.87
    WHEN ticker = 'ABT4' THEN  2.65
    WHEN ticker = 'LEI3' THEN  3.15
    WHEN ticker = 'TIS3' THEN  2.93
  END,
  close_price    = CASE
    WHEN ticker = 'URU3' THEN 23.55
    WHEN ticker = 'POR4' THEN 23.10
    WHEN ticker = 'TIM3' THEN 22.65
    WHEN ticker = 'TRI4' THEN 22.20
    WHEN ticker = 'GAL3' THEN 19.75
    WHEN ticker = 'FOG3' THEN 19.30
    WHEN ticker = 'COL3' THEN 19.75
    WHEN ticker = 'IMO3' THEN 19.30
    WHEN ticker = 'RAP3' THEN 16.85
    WHEN ticker = 'MAL4' THEN 16.40
    WHEN ticker = 'TRI3' THEN 15.95
    WHEN ticker = 'GUE4' THEN 15.50
    WHEN ticker = 'TOR3' THEN 13.95
    WHEN ticker = 'LEM3' THEN 13.50
    WHEN ticker = 'BAL4' THEN 13.05
    WHEN ticker = 'FUR3' THEN 12.60
    WHEN ticker = 'VOA4' THEN 10.15
    WHEN ticker = 'CON3' THEN  9.70
    WHEN ticker = 'LEA3' THEN 10.15
    WHEN ticker = 'LEB3' THEN  9.70
    WHEN ticker = 'COE3' THEN  8.95
    WHEN ticker = 'CAV4' THEN  8.73
    WHEN ticker = 'DRA3' THEN  8.51
    WHEN ticker = 'LEI4' THEN  8.29
    WHEN ticker = 'PAN3' THEN  8.07
    WHEN ticker = 'VOZ3' THEN  7.85
    WHEN ticker = 'GAP3' THEN  8.35
    WHEN ticker = 'TIG4' THEN  6.13
    WHEN ticker = 'DOU4' THEN  5.91
    WHEN ticker = 'LEP4' THEN  5.69
    WHEN ticker = 'PER3' THEN  5.47
    WHEN ticker = 'IND4' THEN  5.25
    WHEN ticker = 'TUB3' THEN  5.75
    WHEN ticker = 'NAF3' THEN  5.53
    WHEN ticker = 'TIV3' THEN  3.31
    WHEN ticker = 'FAS3' THEN  3.09
    WHEN ticker = 'MAC4' THEN  2.87
    WHEN ticker = 'ABT4' THEN  2.65
    WHEN ticker = 'LEI3' THEN  3.15
    WHEN ticker = 'TIS3' THEN  2.93
  END,
  fair_value     = CASE
    WHEN ticker = 'URU3' THEN 23.55
    WHEN ticker = 'POR4' THEN 23.10
    WHEN ticker = 'TIM3' THEN 22.65
    WHEN ticker = 'TRI4' THEN 22.20
    WHEN ticker = 'GAL3' THEN 19.75
    WHEN ticker = 'FOG3' THEN 19.30
    WHEN ticker = 'COL3' THEN 19.75
    WHEN ticker = 'IMO3' THEN 19.30
    WHEN ticker = 'RAP3' THEN 16.85
    WHEN ticker = 'MAL4' THEN 16.40
    WHEN ticker = 'TRI3' THEN 15.95
    WHEN ticker = 'GUE4' THEN 15.50
    WHEN ticker = 'TOR3' THEN 13.95
    WHEN ticker = 'LEM3' THEN 13.50
    WHEN ticker = 'BAL4' THEN 13.05
    WHEN ticker = 'FUR3' THEN 12.60
    WHEN ticker = 'VOA4' THEN 10.15
    WHEN ticker = 'CON3' THEN  9.70
    WHEN ticker = 'LEA3' THEN 10.15
    WHEN ticker = 'LEB3' THEN  9.70
    WHEN ticker = 'COE3' THEN  8.95
    WHEN ticker = 'CAV4' THEN  8.73
    WHEN ticker = 'DRA3' THEN  8.51
    WHEN ticker = 'LEI4' THEN  8.29
    WHEN ticker = 'PAN3' THEN  8.07
    WHEN ticker = 'VOZ3' THEN  7.85
    WHEN ticker = 'GAP3' THEN  8.35
    WHEN ticker = 'TIG4' THEN  6.13
    WHEN ticker = 'DOU4' THEN  5.91
    WHEN ticker = 'LEP4' THEN  5.69
    WHEN ticker = 'PER3' THEN  5.47
    WHEN ticker = 'IND4' THEN  5.25
    WHEN ticker = 'TUB3' THEN  5.75
    WHEN ticker = 'NAF3' THEN  5.53
    WHEN ticker = 'TIV3' THEN  3.31
    WHEN ticker = 'FAS3' THEN  3.09
    WHEN ticker = 'MAC4' THEN  2.87
    WHEN ticker = 'ABT4' THEN  2.65
    WHEN ticker = 'LEI3' THEN  3.15
    WHEN ticker = 'TIS3' THEN  2.93
  END,
  market_cap     = CASE
    WHEN ticker = 'URU3' THEN  23550000.00
    WHEN ticker = 'POR4' THEN  23100000.00
    WHEN ticker = 'TIM3' THEN  22650000.00
    WHEN ticker = 'TRI4' THEN  22200000.00
    WHEN ticker = 'GAL3' THEN  19750000.00
    WHEN ticker = 'FOG3' THEN  19300000.00
    WHEN ticker = 'COL3' THEN  19750000.00
    WHEN ticker = 'IMO3' THEN  19300000.00
    WHEN ticker = 'RAP3' THEN  16850000.00
    WHEN ticker = 'MAL4' THEN  16400000.00
    WHEN ticker = 'TRI3' THEN  15950000.00
    WHEN ticker = 'GUE4' THEN  15500000.00
    WHEN ticker = 'TOR3' THEN  13950000.00
    WHEN ticker = 'LEM3' THEN  13500000.00
    WHEN ticker = 'BAL4' THEN  13050000.00
    WHEN ticker = 'FUR3' THEN  12600000.00
    WHEN ticker = 'VOA4' THEN  10150000.00
    WHEN ticker = 'CON3' THEN   9700000.00
    WHEN ticker = 'LEA3' THEN  10150000.00
    WHEN ticker = 'LEB3' THEN   9700000.00
    WHEN ticker = 'COE3' THEN   8950000.00
    WHEN ticker = 'CAV4' THEN   8730000.00
    WHEN ticker = 'DRA3' THEN   8510000.00
    WHEN ticker = 'LEI4' THEN   8290000.00
    WHEN ticker = 'PAN3' THEN   8070000.00
    WHEN ticker = 'VOZ3' THEN   7850000.00
    WHEN ticker = 'GAP3' THEN   8350000.00
    WHEN ticker = 'TIG4' THEN   6130000.00
    WHEN ticker = 'DOU4' THEN   5910000.00
    WHEN ticker = 'LEP4' THEN   5690000.00
    WHEN ticker = 'PER3' THEN   5470000.00
    WHEN ticker = 'IND4' THEN   5250000.00
    WHEN ticker = 'TUB3' THEN   5750000.00
    WHEN ticker = 'NAF3' THEN   5530000.00
    WHEN ticker = 'TIV3' THEN   3310000.00
    WHEN ticker = 'FAS3' THEN   3090000.00
    WHEN ticker = 'MAC4' THEN   2870000.00
    WHEN ticker = 'ABT4' THEN   2650000.00
    WHEN ticker = 'LEI3' THEN   3150000.00
    WHEN ticker = 'TIS3' THEN   2930000.00
  END,
  volume         = 0,
  is_active      = true,
  is_halted      = false,
  halt_reason    = NULL,
  sentiment      = 'NEUTRAL',
  financials     = jsonb_set(
    COALESCE(financials, '{}'),
    '{ipoPrice}',
    to_jsonb(CASE
      WHEN ticker = 'URU3' THEN 23.55 WHEN ticker = 'POR4' THEN 23.10
      WHEN ticker = 'TIM3' THEN 22.65 WHEN ticker = 'TRI4' THEN 22.20
      WHEN ticker = 'GAL3' THEN 19.75 WHEN ticker = 'FOG3' THEN 19.30
      WHEN ticker = 'COL3' THEN 19.75 WHEN ticker = 'IMO3' THEN 19.30
      WHEN ticker = 'RAP3' THEN 16.85 WHEN ticker = 'MAL4' THEN 16.40
      WHEN ticker = 'TRI3' THEN 15.95 WHEN ticker = 'GUE4' THEN 15.50
      WHEN ticker = 'TOR3' THEN 13.95 WHEN ticker = 'LEM3' THEN 13.50
      WHEN ticker = 'BAL4' THEN 13.05 WHEN ticker = 'FUR3' THEN 12.60
      WHEN ticker = 'VOA4' THEN 10.15 WHEN ticker = 'CON3' THEN  9.70
      WHEN ticker = 'LEA3' THEN 10.15 WHEN ticker = 'LEB3' THEN  9.70
      WHEN ticker = 'COE3' THEN  8.95 WHEN ticker = 'CAV4' THEN  8.73
      WHEN ticker = 'DRA3' THEN  8.51 WHEN ticker = 'LEI4' THEN  8.29
      WHEN ticker = 'PAN3' THEN  8.07 WHEN ticker = 'VOZ3' THEN  7.85
      WHEN ticker = 'GAP3' THEN  8.35 WHEN ticker = 'TIG4' THEN  6.13
      WHEN ticker = 'DOU4' THEN  5.91 WHEN ticker = 'LEP4' THEN  5.69
      WHEN ticker = 'PER3' THEN  5.47 WHEN ticker = 'IND4' THEN  5.25
      WHEN ticker = 'TUB3' THEN  5.75 WHEN ticker = 'NAF3' THEN  5.53
      WHEN ticker = 'TIV3' THEN  3.31 WHEN ticker = 'FAS3' THEN  3.09
      WHEN ticker = 'MAC4' THEN  2.87 WHEN ticker = 'ABT4' THEN  2.65
      WHEN ticker = 'LEI3' THEN  3.15 WHEN ticker = 'TIS3' THEN  2.93
    END)
  )
WHERE ticker IN (
  'URU3','POR4','TIM3','TRI4','GAL3','FOG3','COL3','IMO3','RAP3','MAL4',
  'TRI3','GUE4','TOR3','LEM3','BAL4','FUR3','VOA4','CON3','LEA3','LEB3',
  'COE3','CAV4','DRA3','LEI4','PAN3','VOZ3','GAP3','TIG4','DOU4','LEP4',
  'PER3','IND4','TUB3','NAF3','TIV3','FAS3','MAC4','ABT4','LEI3','TIS3'
);

-- ── 2. Limpar price_history dos 40 ativos (recomeço limpo) ─────────────────

DELETE FROM price_history
WHERE asset_id IN (
  SELECT id FROM assets
  WHERE ticker IN (
    'URU3','POR4','TIM3','TRI4','GAL3','FOG3','COL3','IMO3','RAP3','MAL4',
    'TRI3','GUE4','TOR3','LEM3','BAL4','FUR3','VOA4','CON3','LEA3','LEB3',
    'COE3','CAV4','DRA3','LEI4','PAN3','VOZ3','GAP3','TIG4','DOU4','LEP4',
    'PER3','IND4','TUB3','NAF3','TIV3','FAS3','MAC4','ABT4','LEI3','TIS3'
  )
);

COMMIT;

-- ============================================================
-- VERIFICAÇÃO (rodar separado após o reset)
-- ============================================================
-- SELECT ticker, current_price, open_price, close_price, fair_value,
--        volume, is_active, is_halted, sentiment
-- FROM assets
-- WHERE ticker IN (
--   'URU3','POR4','TIM3','TRI4','GAL3','FOG3','COL3','IMO3','RAP3','MAL4',
--   'TRI3','GUE4','TOR3','LEM3','BAL4','FUR3','VOA4','CON3','LEA3','LEB3',
--   'COE3','CAV4','DRA3','LEI4','PAN3','VOZ3','GAP3','TIG4','DOU4','LEP4',
--   'PER3','IND4','TUB3','NAF3','TIV3','FAS3','MAC4','ABT4','LEI3','TIS3'
-- )
-- ORDER BY division, current_price DESC;
