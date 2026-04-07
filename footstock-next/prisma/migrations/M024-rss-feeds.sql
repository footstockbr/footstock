-- Migration: M024-rss-feeds
-- Tabela de feeds RSS gerenciados pelo admin (/admin/noticias → whitelist)

CREATE TABLE IF NOT EXISTS rss_feeds (
  id          TEXT        PRIMARY KEY,
  url         TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rss_feeds_url_key UNIQUE (url)
);

-- Seed: feeds iniciais (mesmo array do motor RSSFetcher.ts)
INSERT INTO rss_feeds (id, url, name, is_active)
VALUES
  ('rss_espn',    'https://www.espn.com.br/rss',           'ESPN Brasil',      true),
  ('rss_gazeta',  'https://www.gazetaesportiva.com/feed/', 'Gazeta Esportiva', true),
  ('rss_trivela', 'https://trivela.com.br/feed/',          'Trivela',          true)
ON CONFLICT (url) DO NOTHING;
