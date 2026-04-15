-- ============================================================================
-- M048 — Seed de ligas demo para renderizar page-ligas
-- Objetivo: popular tabela leagues com dados realistas para as abas
-- Publicas, PRO e Amigos aparecerem com conteudo no frontend.
-- Regras:
-- - DO block que obtem o id de um admin existente (falha silenciosa se nao houver)
-- - INSERT INTO ... ON CONFLICT (id) DO NOTHING (idempotente)
-- - Cobre os 3 tipos: PUBLICA, AMIGOS, PRO
-- - Cobre todas as divisoes: BRONZE, PRATA, OURO, ABERTA
-- ============================================================================

DO $$
DECLARE
  v_admin_id TEXT;
BEGIN
  -- Obter id de admin disponivel (SUPER_ADMIN primeiro, depois qualquer admin)
  SELECT id INTO v_admin_id
  FROM users
  WHERE admin_role = 'SUPER_ADMIN'
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id
    FROM users
    WHERE admin_role IS NOT NULL
    LIMIT 1;
  END IF;

  -- Se nenhum admin encontrado, usar qualquer usuario existente
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id
    FROM users
    LIMIT 1;
  END IF;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'M048: nenhum usuario encontrado — seed de ligas pulado';
    RETURN;
  END IF;

  RAISE NOTICE 'M048: usando admin_id = %', v_admin_id;

  -- =========================================================================
  -- LIGAS PUBLICAS
  -- =========================================================================

  INSERT INTO "leagues" (id, name, slug, type, division, duration, status, max_members, prize_pool, starts_at, ends_at, created_by, permite_alavancagem, created_at, updated_at)
  VALUES
    (
      'seed-pub-ouro-abril26',
      'Liga Pública Ouro — Abril 2026',
      'liga-publica-ouro-abril-2026',
      'PUBLICA', 'OURO', '1M', 'ACTIVE',
      200, 0.00,
      '2026-04-01 00:00:00', '2026-04-30 23:59:59',
      v_admin_id, FALSE, NOW(), NOW()
    ),
    (
      'seed-pub-bronze-semana',
      'Liga Bronze da Semana',
      'liga-bronze-semana-abr26',
      'PUBLICA', 'BRONZE', '1S', 'ACTIVE',
      200, 0.00,
      '2026-04-14 00:00:00', '2026-04-21 23:59:59',
      v_admin_id, FALSE, NOW(), NOW()
    ),
    (
      'seed-pub-aberta-temp',
      'Temporada Aberta 2025/26',
      'temporada-aberta-2025-26',
      'PUBLICA', 'ABERTA', 'TEMPORADA', 'ACTIVE',
      200, 0.00,
      '2026-01-01 00:00:00', '2026-07-31 23:59:59',
      v_admin_id, FALSE, NOW(), NOW()
    ),
    (
      'seed-pub-prata-abril26',
      'Liga Prata Abril',
      'liga-prata-abril-2026',
      'PUBLICA', 'PRATA', '1M', 'ACTIVE',
      200, 0.00,
      '2026-04-01 00:00:00', '2026-04-30 23:59:59',
      v_admin_id, FALSE, NOW(), NOW()
    ),
    (
      'seed-pub-bronze-enc',
      'Liga Bronze Março (Encerrada)',
      'liga-bronze-marco-2026-enc',
      'PUBLICA', 'BRONZE', '1M', 'FINISHED',
      200, 0.00,
      '2026-03-01 00:00:00', '2026-03-31 23:59:59',
      v_admin_id, FALSE, NOW(), NOW()
    )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- LIGAS AMIGOS
  -- =========================================================================

  INSERT INTO "leagues" (id, name, slug, type, division, duration, status, max_members, prize_pool, starts_at, ends_at, created_by, permite_alavancagem, created_at, updated_at)
  VALUES
    (
      'seed-ami-galera',
      'Galera do Brasileirão',
      'galera-do-brasileirao-2026',
      'AMIGOS', 'BRONZE', 'TEMPORADA', 'ACTIVE',
      20, 0.00,
      '2026-04-01 00:00:00', '2026-07-31 23:59:59',
      v_admin_id, FALSE, NOW(), NOW()
    ),
    (
      'seed-ami-fanaticos',
      'Fanáticos do Futebol',
      'fanaticos-do-futebol-2026',
      'AMIGOS', 'PRATA', '1M', 'ACTIVE',
      20, 0.00,
      '2026-04-01 00:00:00', '2026-04-30 23:59:59',
      v_admin_id, FALSE, NOW(), NOW()
    ),
    (
      'seed-ami-traders',
      'Traders FC',
      'traders-fc-abril-2026',
      'AMIGOS', 'OURO', '1M', 'ACTIVE',
      20, 0.00,
      '2026-04-10 00:00:00', '2026-05-10 23:59:59',
      v_admin_id, FALSE, NOW(), NOW()
    )
  ON CONFLICT (id) DO NOTHING;

  -- =========================================================================
  -- LIGAS PRO
  -- =========================================================================

  INSERT INTO "leagues" (id, name, slug, type, division, duration, status, max_members, prize_pool, starts_at, ends_at, created_by, permite_alavancagem, created_at, updated_at)
  VALUES
    (
      'seed-pro-craque-abr',
      'Liga PRO Craque — Abril',
      'liga-pro-craque-abril-2026',
      'PRO', 'OURO', '1M', 'ACTIVE',
      500, 0.00,
      '2026-04-01 00:00:00', '2026-04-30 23:59:59',
      v_admin_id, TRUE, NOW(), NOW()
    ),
    (
      'seed-pro-elite-temp',
      'PRO Elite Temporada 2026',
      'pro-elite-temporada-2026',
      'PRO', 'ABERTA', 'TEMPORADA', 'ACTIVE',
      500, 0.00,
      '2026-01-01 00:00:00', '2026-12-31 23:59:59',
      v_admin_id, TRUE, NOW(), NOW()
    ),
    (
      'seed-pro-lenda-abr',
      'Liga PRO Lenda — Sprint',
      'liga-pro-lenda-sprint-abr26',
      'PRO', 'OURO', '1S', 'ACTIVE',
      500, 0.00,
      '2026-04-14 00:00:00', '2026-04-21 23:59:59',
      v_admin_id, TRUE, NOW(), NOW()
    )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'M048: ligas demo inseridas com sucesso';
END $$;
