-- M055: Plan type nullable for staff (FootStock — staff vs player separation).
--
-- CONTEXTO:
--   Brief INTAKE.md §43-65: planType e conceito de player (Jogador/Craque/Lenda).
--   Staff administrativo (ADMIN, CLUB_PARTNER) NAO deve ter planType — eles
--   operam o painel /admin ou /club, nao jogam.
--
--   Estado bugado pre-migration: admins de teste seedados com planType=LENDA
--   (saldo escalado, badge errado no perfil, possivel upgrade CTA).
--
-- MUDANCAS:
--   1) users.plan_type:           DROP NOT NULL + DROP DEFAULT
--   2) balance_reset_logs.plan_type: DROP NOT NULL (admin pode resetar saldo
--      de staff; log carrega NULL na coluna)
--   3) Limpar plan_type de users staff (UPDATE WHERE user_type IN ...)
--   4) Corrigir user_type derivado (bug do seed antigo que setava 'NORMAL'
--      para admins com admin_role nao-nulo)
--
-- ORDEM: relax NOT NULL primeiro, depois UPDATEs (necessario para SET NULL).

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Relaxar restricoes de schema
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE "users"
  ALTER COLUMN "plan_type" DROP NOT NULL,
  ALTER COLUMN "plan_type" DROP DEFAULT;

-- balance_reset_logs pode faltar em ambientes bootstrapped antes do init
-- atual (drift schema vs migration history). Criar idempotentemente.
CREATE TABLE IF NOT EXISTS "balance_reset_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "previous_balance" DECIMAL(18,8) NOT NULL,
    "new_balance" DECIMAL(18,8) NOT NULL,
    "plan_type" "PlanType",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_reset_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "balance_reset_logs_user_id_idx" ON "balance_reset_logs"("user_id");
CREATE INDEX IF NOT EXISTS "balance_reset_logs_admin_id_idx" ON "balance_reset_logs"("admin_id");
CREATE INDEX IF NOT EXISTS "balance_reset_logs_created_at_idx" ON "balance_reset_logs"("created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'balance_reset_logs_user_id_fkey') THEN
    ALTER TABLE "balance_reset_logs"
      ADD CONSTRAINT "balance_reset_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'balance_reset_logs_admin_id_fkey') THEN
    ALTER TABLE "balance_reset_logs"
      ADD CONSTRAINT "balance_reset_logs_admin_id_fkey"
      FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "balance_reset_logs"
  ALTER COLUMN "plan_type" DROP NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Limpar plan_type de staff (ADMIN, CLUB_PARTNER)
--    Players (NORMAL, TIME_PARCEIRO, INFLUENCIADOR) mantem plan_type.
-- ───────────────────────────────────────────────────────────────────────────

UPDATE "users"
   SET "plan_type" = NULL
 WHERE "user_type" IN ('ADMIN', 'CLUB_PARTNER');

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Corrigir user_type derivado (bug seed antigo)
--    Se admin_role != NULL e != 'CLUB_PARTNER' -> user_type = 'ADMIN'
--    Se admin_role = 'CLUB_PARTNER'             -> user_type = 'CLUB_PARTNER'
-- ───────────────────────────────────────────────────────────────────────────

UPDATE "users"
   SET "user_type" = 'ADMIN'
 WHERE "admin_role" IS NOT NULL
   AND "admin_role" != 'CLUB_PARTNER'
   AND "user_type" = 'NORMAL';

UPDATE "users"
   SET "user_type" = 'CLUB_PARTNER'
 WHERE "admin_role" = 'CLUB_PARTNER'
   AND "user_type" != 'CLUB_PARTNER';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Cleanup pos-correcao: rodar (2) novamente para pegar admins que tiveram
--    user_type corrigido em (3) e ainda mantem plan_type residual.
-- ───────────────────────────────────────────────────────────────────────────

UPDATE "users"
   SET "plan_type" = NULL
 WHERE "user_type" IN ('ADMIN', 'CLUB_PARTNER');
