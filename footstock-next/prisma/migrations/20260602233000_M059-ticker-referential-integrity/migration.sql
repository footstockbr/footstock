-- M059: Integridade referencial dos tickers denormalizados.
-- ON UPDATE CASCADE => renomear assets.ticker propaga automaticamente para
-- todas as colunas que armazenam ticker como texto (evita o bug do
-- users.favorite_club que ficou orfao no rename 4->3 de 2026-06-02).
-- Idempotente: pode rodar via `prisma migrate deploy` mesmo apos aplicacao manual.

-- Indices para as FKs ainda sem indice (performance de cascade/lookup)
CREATE INDEX IF NOT EXISTS idx_users_favorite_club ON users(favorite_club);
CREATE INDEX IF NOT EXISTS idx_news_ticker ON news(ticker);
CREATE INDEX IF NOT EXISTS idx_admin_market_actions_ticker ON admin_market_actions(ticker);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_favorite_club_fkey') THEN
    ALTER TABLE users ADD CONSTRAINT users_favorite_club_fkey
      FOREIGN KEY (favorite_club) REFERENCES assets(ticker) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='news_ticker_fkey') THEN
    ALTER TABLE news ADD CONSTRAINT news_ticker_fkey
      FOREIGN KEY (ticker) REFERENCES assets(ticker) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dividends_ticker_fkey') THEN
    ALTER TABLE dividends ADD CONSTRAINT dividends_ticker_fkey
      FOREIGN KEY (ticker) REFERENCES assets(ticker) ON UPDATE CASCADE ON DELETE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='admin_market_actions_ticker_fkey') THEN
    ALTER TABLE admin_market_actions ADD CONSTRAINT admin_market_actions_ticker_fkey
      FOREIGN KEY (ticker) REFERENCES assets(ticker) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='global_forum_posts_ticker_fkey') THEN
    ALTER TABLE global_forum_posts ADD CONSTRAINT global_forum_posts_ticker_fkey
      FOREIGN KEY (ticker) REFERENCES assets(ticker) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='yield_differential_pending_ticker_fkey') THEN
    ALTER TABLE yield_differential_pending ADD CONSTRAINT yield_differential_pending_ticker_fkey
      FOREIGN KEY (ticker) REFERENCES assets(ticker) ON UPDATE CASCADE ON DELETE NO ACTION;
  END IF;
END $$;
