-- Índice para snapshot causal de ordens pre-preço.
-- Query-alvo: agregação única por asset_id filtrando status, side, type e created_at.
CREATE INDEX IF NOT EXISTS idx_orders_asset_status_side_type_created_at
  ON orders (asset_id, status, side, type, created_at);
