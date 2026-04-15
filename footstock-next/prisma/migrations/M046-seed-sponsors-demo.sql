-- ============================================================================
-- M046 — Seed de dados demo para patrocinadores
-- Objetivo: popular sponsors, sponsor_banners e sponsored_leagues com dados
-- iniciais para que a pagina /admin/patrocinadores renderize em producao.
-- Regras:
-- - INSERT INTO ... ON CONFLICT DO NOTHING (idempotente — reruns sao seguros)
-- - Nao apaga dados existentes
-- - Nao depende de usuarios ou assets existentes
-- ============================================================================

-- Sponsors
INSERT INTO "sponsors" (id, name, logo_url, contract_start, contract_end, sponsorship_value, is_active, created_by, created_at)
VALUES
  ('s001', 'Mercado Pago', NULL, '2026-01-01 00:00:00', '2026-12-31 23:59:59', 250000.00, TRUE, 'seed-admin', NOW()),
  ('s002', 'Red Bull',      NULL, '2026-02-01 00:00:00', '2026-11-30 23:59:59', 180000.00, TRUE, 'seed-admin', NOW()),
  ('s003', 'PagBank',       NULL, '2026-01-15 00:00:00', '2026-10-31 23:59:59', 140000.00, TRUE, 'seed-admin', NOW()),
  ('s004', 'Nike',          NULL, '2026-03-01 00:00:00', '2026-12-15 23:59:59', 320000.00, TRUE, 'seed-admin', NOW()),
  ('s005', 'Spotify',       NULL, '2026-04-01 00:00:00', '2026-09-30 23:59:59',  90000.00, FALSE, 'seed-admin', NOW())
ON CONFLICT (id) DO NOTHING;

-- Banners
INSERT INTO "sponsor_banners" (id, title, company, position, image_url, link_url, width, height, is_active, clicks, impressions, color, cta_text, cta_color, sponsor_id, created_at, updated_at)
VALUES
  ('b001', 'Mercado Pago acelera seus aportes', 'Mercado Pago', 'home_top',      NULL, 'https://www.mercadopago.com.br', 1200, 320, TRUE,  1840, 28600, '#00B1EA', 'Abrir conta',    '#00B1EA', 's001', NOW(), NOW()),
  ('b002', 'Red Bull Matchday Experience',       'Red Bull',     'market_top',    NULL, 'https://www.redbull.com/br-pt',  1200, 320, TRUE,  1290, 17350, '#DB0A40', 'Conheca',        '#DB0A40', 's002', NOW(), NOW()),
  ('b003', 'PagBank Pro Day para traders',       'PagBank',      'portfolio_top', NULL, 'https://pagbank.uol.com.br',     1200, 320, TRUE,   760, 11120, '#F5A623', 'Ver beneficios', '#F5A623', 's003', NOW(), NOW()),
  ('b004', 'Nike Draft Room Edition',            'Nike',         'leagues_top',   NULL, 'https://www.nike.com/br',        1200, 320, TRUE,   980, 14890, '#111111', 'Explorar drop',  '#111111', 's004', NOW(), NOW()),
  ('b005', 'Spotify torcida mix',                'Spotify',      'home_bottom',   NULL, 'https://www.spotify.com/br',     1200, 320, FALSE,  210,  4920, '#1DB954', 'Ouvir agora',    '#1DB954', 's005', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Ligas patrocinadas
INSERT INTO "sponsored_leagues" (id, name, company, prize, prizes, sponsor_url, participants, max_participants, min_plan, status, border_color, start_date, end_date, created_at, updated_at)
VALUES
  (
    'l001',
    'Liga Mercado Pago Turbo Abril',
    'Mercado Pago',
    '1o: R$10.000 | 2o: R$4.000 | 3o: R$2.000',
    '[{"position":1,"label":"1o Lugar","description":"R$10.000 em conta Mercado Pago"},{"position":2,"label":"2o Lugar","description":"R$4.000 em conta Mercado Pago"},{"position":3,"label":"3o Lugar","description":"R$2.000 em conta Mercado Pago"},{"position":4,"label":"Top 10","description":"Cashback de 10% por 30 dias"}]'::jsonb,
    'https://www.mercadopago.com.br',
    47, 50, 'CRAQUE', 'ATIVA', '#00B1EA',
    '2026-04-01 00:00:00', '2026-04-30 23:59:59',
    NOW(), NOW()
  ),
  (
    'l002',
    'Red Bull Sprint Cup',
    'Red Bull',
    '1o: PS5 | 2o: Cadeira gamer | 3o: Kit Red Bull',
    '[{"position":1,"label":"1o Lugar","description":"PlayStation 5 Slim + FC 26"},{"position":2,"label":"2o Lugar","description":"Cadeira gamer ergonomica"},{"position":3,"label":"3o Lugar","description":"Kit Red Bull com 24 latas"}]'::jsonb,
    'https://www.redbull.com/br-pt',
    30, 30, 'JOGADOR', 'ENCERRADA', '#DB0A40',
    '2026-03-01 00:00:00', '2026-03-31 23:59:59',
    NOW(), NOW()
  ),
  (
    'l003',
    'PagBank Portfolio Masters',
    'PagBank',
    '1o: R$15.000 | 2o: iPhone | 3o: R$3.000',
    '[{"position":1,"label":"1o Lugar","description":"R$15.000 em investimento assistido"},{"position":2,"label":"2o Lugar","description":"iPhone 17 Pro 256GB"},{"position":3,"label":"3o Lugar","description":"R$3.000 em saldo PagBank"},{"position":4,"label":"4o Lugar","description":"Smartwatch premium"},{"position":5,"label":"5o Lugar","description":"Voucher de R$750"}]'::jsonb,
    'https://pagbank.uol.com.br',
    12, 40, 'LENDA', 'AGENDADA', '#F5A623',
    '2026-05-10 00:00:00', '2026-06-10 23:59:59',
    NOW(), NOW()
  ),
  (
    'l004',
    'Nike Elite Draft Series',
    'Nike',
    '1o: Viagem + camarote | 2o: Kit Nike | 3o: R$5.000',
    '[{"position":1,"label":"1o Lugar","description":"Viagem para final continental + camarote"},{"position":2,"label":"2o Lugar","description":"Kit Nike elite com chuteira, camisa e mochila"},{"position":3,"label":"3o Lugar","description":"R$5.000 em credito"}]'::jsonb,
    'https://www.nike.com/br',
    18, 24, 'CRAQUE', 'ATIVA', '#111111',
    '2026-04-10 00:00:00', '2026-05-05 23:59:59',
    NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;
