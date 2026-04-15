-- ============================================================================
-- M049 — Seed de assinaturas demo para o gráfico MRR do admin dashboard
-- Objetivo: popular subscriptions com datas distribuídas nos últimos 30 dias,
-- criando curva de crescimento com variações equilibradas no gráfico.
-- Regras:
-- - DELETE + INSERT via id prefixado 'seed-rev-' (idempotente: rerun seguro)
-- - Sem FK cascade: deleta apenas rows com id LIKE 'seed-rev-%'
-- - Mix de CRAQUE (R$19,90) e LENDA (R$39,90) para variar amplitude diária
-- - Curva: ~R$20-40 nos dias 30-25 atrás → ~R$120-220 nos últimos 7 dias
-- Distribuição diária de receita projetada:
--   30d: R$19.90 | 29d: R$39.90 | 28d: R$39.80 | 27d: R$59.80 | 26d: R$39.90
--   25d: R$39.80 | 24d: R$59.80 | 23d: R$39.90 | 22d: R$79.70 | 21d: R$39.80
--   20d: R$79.80 | 19d: R$19.90 | 18d: R$79.70 | 17d: R$39.80 | 16d: R$59.70
--   15d: R$99.70 | 14d: R$99.60 | 13d: R$79.70 | 12d: R$119.70 | 11d: R$99.60
--   10d: R$119.60 | 9d: R$119.50 | 8d: R$119.60 | 7d: R$139.50 | 6d: R$139.50
--    5d: R$159.40 |  4d: R$179.40 |  3d: R$179.30 |  2d: R$199.30 |  1d: R$219.20
--    0d: R$179.20
-- ============================================================================

DO $$
DECLARE
  v_admin_id TEXT;
  v_seq      INT := 1;
  v_id       TEXT;
  v_days_ago INT;
  v_amount   INT;
  v_ts       TIMESTAMPTZ;
BEGIN
  -- Obter usuario admin disponivel
  SELECT id INTO v_admin_id FROM users WHERE admin_role = 'SUPER_ADMIN' LIMIT 1;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM users WHERE admin_role IS NOT NULL LIMIT 1;
  END IF;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM users LIMIT 1;
  END IF;
  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'M049: nenhum usuario encontrado — seed pulado';
    RETURN;
  END IF;

  -- Limpar seed anterior (idempotente — sem risco de cascade: payments.subscription_id nullable)
  DELETE FROM "subscriptions" WHERE id LIKE 'seed-rev-%';

  -- Distribuicao: (days_ago, amount_centavos)
  -- amount: 1990 = CRAQUE R$19,90 | 3990 = LENDA R$39,90
  FOR v_days_ago, v_amount IN
    SELECT * FROM (VALUES
      -- dias 30-26: baseline baixo (R$20-60/dia)
      (30, 1990),
      (29, 3990),
      (28, 1990), (28, 1990),
      (27, 1990), (27, 3990),
      (26, 3990),
      -- dias 25-21: ligeira alta com dip no dia 19 (R$20-80/dia)
      (25, 1990), (25, 1990),
      (24, 1990), (24, 3990),
      (23, 3990),
      (22, 1990), (22, 1990), (22, 3990),
      (21, 1990), (21, 1990),
      -- dias 20-16: crescimento moderado com pico dia 20 (R$20-80/dia)
      (20, 3990), (20, 3990),
      (19, 1990),
      (18, 1990), (18, 1990), (18, 3990),
      (17, 1990), (17, 1990),
      (16, 1990), (16, 1990), (16, 1990),
      -- dias 15-11: escalonamento claro (R$100/dia)
      (15, 1990), (15, 3990), (15, 3990),
      (14, 1990), (14, 1990), (14, 1990), (14, 3990),
      (13, 1990), (13, 1990), (13, 3990),
      (12, 3990), (12, 3990), (12, 3990),
      (11, 1990), (11, 1990), (11, 1990), (11, 3990),
      -- dias 10-6: alta consistente (R$120-140/dia)
      (10, 1990), (10, 1990), (10, 3990), (10, 3990),
       (9, 1990),  (9, 1990),  (9, 1990),  (9, 1990),  (9, 3990),
       (8, 1990),  (8, 1990),  (8, 3990),  (8, 3990),
       (7, 1990),  (7, 1990),  (7, 1990),  (7, 3990),  (7, 3990),
       (6, 1990),  (6, 1990),  (6, 1990),  (6, 3990),  (6, 3990),
      -- dias 5-1: aceleracao (R$159-219/dia)
       (5, 1990),  (5, 1990),  (5, 1990),  (5, 1990),  (5, 3990),  (5, 3990),
       (4, 1990),  (4, 1990),  (4, 1990),  (4, 3990),  (4, 3990),  (4, 3990),
       (3, 1990),  (3, 1990),  (3, 1990),  (3, 1990),  (3, 1990),  (3, 3990),  (3, 3990),
       (2, 1990),  (2, 1990),  (2, 1990),  (2, 1990),  (2, 3990),  (2, 3990),  (2, 3990),
       (1, 1990),  (1, 1990),  (1, 1990),  (1, 1990),  (1, 1990),  (1, 3990),  (1, 3990),  (1, 3990),
      -- hoje: leve recuo para grafico nao terminar sempre no pico
       (0, 1990),  (0, 1990),  (0, 1990),  (0, 1990),  (0, 3990),  (0, 3990)
    ) AS t(days_ago, amount_centavos)
  LOOP
    v_id := 'seed-rev-' || lpad(v_seq::TEXT, 3, '0');

    -- Hora aleatoria deterministica dentro do dia (sem random() para ser reproduzivel)
    v_ts := date_trunc('day', NOW()) - (v_days_ago || ' days')::INTERVAL
            + make_interval(hours := (v_seq * 7 % 23), mins := (v_seq * 13 % 60));

    INSERT INTO "subscriptions" (
      id, user_id, plan_type, gateway, period, amount, status,
      starts_at, expires_at, created_at, updated_at
    ) VALUES (
      v_id,
      v_admin_id,
      (CASE WHEN v_amount = 1990 THEN 'CRAQUE' ELSE 'LENDA' END)::"PlanType",
      'MERCADO_PAGO'::"SubscriptionGateway",
      'MONTHLY'::"SubscriptionPeriod",
      v_amount,
      'ACTIVE'::"SubscriptionStatus",
      v_ts,
      v_ts + INTERVAL '30 days',
      v_ts,
      v_ts
    );

    v_seq := v_seq + 1;
  END LOOP;

  RAISE NOTICE 'M049: % assinaturas demo inseridas (admin_id=%)', v_seq - 1, v_admin_id;
END $$;
