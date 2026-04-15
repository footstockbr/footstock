-- M048 — Affiliate: normalizar affiliateType para pt-BR + corrigir defaults
-- Rastreabilidade: bug fix admin-afiliados (1 card vs N usuários)
--
-- Contexto:
--   O schema e o seed usavam 'INFLUENCER'/'CLUB_PARTNER' (inglês),
--   enquanto a aplicação (affiliate-auth.ts, register route) usa
--   'INFLUENCIADOR'/'TIME_PARCEIRO'/'USER' (português).
--   Isso causava invisibilidade dos afiliados seeded no portal de afiliados.
--
-- Mudanças:
--   1. DEFAULT affiliate_type: 'INFLUENCER' → 'USER'
--   2. DEFAULT commission_percentage: 0.10 → 0.00
--   3. Backfill: 'INFLUENCER' → 'INFLUENCIADOR', 'CLUB_PARTNER' → 'TIME_PARCEIRO'

-- 1. Corrigir DEFAULT affiliate_type
ALTER TABLE affiliate_codes
  ALTER COLUMN affiliate_type SET DEFAULT 'USER';

-- 2. Corrigir DEFAULT commission_percentage
--    Usuários comuns (USER) não têm comissão; afiliados especiais terão valor explícito
ALTER TABLE affiliate_codes
  ALTER COLUMN commission_percentage SET DEFAULT 0.00;

-- 3. Backfill: normalizar valores em inglês para português (pt-BR)
UPDATE affiliate_codes
SET affiliate_type = 'INFLUENCIADOR'
WHERE affiliate_type = 'INFLUENCER';

UPDATE affiliate_codes
SET affiliate_type = 'TIME_PARCEIRO'
WHERE affiliate_type = 'CLUB_PARTNER';

-- Verificação: nenhuma linha deve ter affiliate_type antigo após backfill
-- (executar manualmente para validar):
-- SELECT COUNT(*) FROM affiliate_codes WHERE affiliate_type IN ('INFLUENCER', 'CLUB_PARTNER');
-- Esperado: 0
