-- M058 — Staff/admin NUNCA tem plano nem assinatura (invariante durável).
--
-- CONTEXTO:
--   Politica do operador (firme): "ADMIN nao deve nem ver opcao de planos, nao
--   deve nem acessar nada disso; se no BD ele tiver a coluna de plano esta
--   errado; se tiver qualquer coisa disso esta errado."
--
--   A M055 ja tornou users.plan_type nullable e zerou plan_type de staff, mas
--   NAO removeu os registros de subscription orfaos nem adicionou guarda
--   durável. Resultado: a conta superadmin@foot-stock.dev acumulou 108
--   subscriptions de teste (32 CRAQUE ACTIVE + 21 LENDA ACTIVE + canceladas/
--   expiradas) entre 2026-03-16 e 2026-04-15, sem nenhum payment real.
--
--   Limpeza de dados (108 subs + 95 dunning_attempts) executada
--   transacionalmente em prod antes desta migration. Esta migration formaliza
--   o invariante para que o estado bugado nao volte a ocorrer — defesa em
--   profundidade junto ao guard de aplicacao (AUTH-009 em
--   PlanService.createCheckout/upgradeUser).
--
-- SINAL DE STAFF: user_type IN ('ADMIN','CLUB_PARTNER') — mesmo criterio da M055.
--
-- MUDANCAS:
--   1) CHECK constraint: staff nunca tem plan_type.
--   2) Trigger BEFORE INSERT/UPDATE em subscriptions: rejeita subscription de
--      usuario staff (cobre escritas diretas e quaisquer caminhos futuros que
--      escapem do guard de aplicacao).
--
-- Idempotente (DROP IF EXISTS antes de criar).

-- ───────────────────────────────────────────────────────────────────────────
-- 1) CHECK: staff (ADMIN/CLUB_PARTNER) nunca tem plan_type.
--    Players (NORMAL, TIME_PARCEIRO, INFLUENCIADOR) mantem plan_type.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_staff_no_plan_type_check";

ALTER TABLE "users"
  ADD CONSTRAINT "users_staff_no_plan_type_check"
  CHECK ("plan_type" IS NULL OR "user_type" NOT IN ('ADMIN', 'CLUB_PARTNER'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Trigger: rejeitar subscription vinculada a usuario staff.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "reject_staff_subscription"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users" u
     WHERE u."id" = NEW."user_id"
       AND u."user_type" IN ('ADMIN', 'CLUB_PARTNER')
  ) THEN
    RAISE EXCEPTION 'Staff/admin nao pode ter subscription (user_id=%)', NEW."user_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_reject_staff_subscription" ON "subscriptions";

CREATE TRIGGER "trg_reject_staff_subscription"
  BEFORE INSERT OR UPDATE OF "user_id" ON "subscriptions"
  FOR EACH ROW
  EXECUTE FUNCTION "reject_staff_subscription"();
