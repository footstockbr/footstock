-- Add 5 additional RSS news sources (T-10: Cadastrar Fontes de Notícias)
-- Total sources: 3 → 10

INSERT INTO rss_feeds (id, name, url, is_active, created_at, updated_at)
VALUES 
  ('rss_globo', 'GloboEsporte', 'https://globoesporte.globo.com/rss/feed/', true, now(), now()),
  ('rss_lance', 'Jornal Lance', 'https://www.lance.com.br/feed.xml', true, now(), now()),
  ('rss_ogol', 'O Gol', 'https://ogol.com.br/feed', true, now(), now()),
  ('rss_vavel', 'VAVEL Brasil', 'https://www.vavel.com/feeds/index.php?s=br', true, now(), now()),
  ('rss_sofascore', 'SofaScore', 'https://www.sofascore.com/feeds/sport-football', true, now(), now())
ON CONFLICT (url) DO NOTHING;
