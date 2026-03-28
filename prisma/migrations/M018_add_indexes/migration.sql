-- M018_add_indexes
-- Índices composite para queries de alta frequência

-- Carteira: buscar posições ativas por usuário
CREATE INDEX IF NOT EXISTS "idx_positions_user_asset"
  ON "positions"("user_id", "asset_id");

-- Order book: buscar ordens abertas por ativo (motor de mercado)
CREATE INDEX IF NOT EXISTS "idx_orders_asset_status_price"
  ON "orders"("asset_id", "status", "price");

-- Histórico de preços: última janela de 24h por ativo
CREATE INDEX IF NOT EXISTS "idx_price_history_asset_ts"
  ON "price_history"("asset_id", "timestamp" DESC);

-- Transações: extrato por usuário ordenado por data
CREATE INDEX IF NOT EXISTS "idx_transactions_user_created"
  ON "transactions"("user_id", "created_at" DESC);

-- Notificações não lidas
CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread"
  ON "notifications"("user_id", "is_read", "created_at" DESC);

-- News publicadas por data
CREATE INDEX IF NOT EXISTS "idx_news_published_at"
  ON "news"("is_published", "published_at" DESC);

-- League members por ranking
CREATE INDEX IF NOT EXISTS "idx_league_members_rank"
  ON "league_members"("league_id", "rank");

-- down:
-- DROP INDEX IF EXISTS "idx_league_members_rank", "idx_news_published_at",
--   "idx_notifications_user_unread", "idx_transactions_user_created",
--   "idx_price_history_asset_ts", "idx_orders_asset_status_price",
--   "idx_positions_user_asset";
