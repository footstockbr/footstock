-- ============================================================================
-- M043 — Índice reverso em asset_aliases(asset_ticker)
-- Complementa T-031: permite consultas "quais aliases existem para este ticker?"
-- em O(log n) em vez de full scan.
-- ============================================================================

-- Índice para consultas reversas: dado um ticker canônico, listar todos os aliases
CREATE INDEX IF NOT EXISTS "asset_aliases_asset_ticker_idx"
  ON "asset_aliases" ("asset_ticker");
