-- M034_update_subscriptions_module11
-- Alinha tabela subscriptions com Prisma schema atualizado pelo module-11.
-- Adiciona campos de arrependimento, trava de cancelamento, bônus e billing.

-- Enums necessários
DO $$ BEGIN
  CREATE TYPE "SubscriptionGateway" AS ENUM ('MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionPeriod" AS ENUM ('MONTHLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Novos campos
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "previous_plan_type" "PlanType",
  ADD COLUMN IF NOT EXISTS "gateway" "SubscriptionGateway",
  ADD COLUMN IF NOT EXISTS "period" "SubscriptionPeriod",
  ADD COLUMN IF NOT EXISTS "amount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "starts_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellation_lock_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bonus_scheduled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bonus_credited_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "renewal_reminder_sent_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refund_requested" BOOLEAN NOT NULL DEFAULT false;

-- Migrar dados das colunas antigas para as novas (se existirem)
UPDATE "subscriptions"
  SET "starts_at" = "current_period_start",
      "expires_at" = "current_period_end"
  WHERE "starts_at" IS NULL AND "current_period_start" IS NOT NULL;

-- Índices otimizados para queries de jobs (cron)
CREATE INDEX IF NOT EXISTS "subscriptions_expires_at_status_idx"
  ON "subscriptions"("expires_at", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_cancellation_lock_idx"
  ON "subscriptions"("cancellation_lock_expires_at", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_renewal_reminder_idx"
  ON "subscriptions"("renewal_reminder_sent_at", "status");

-- down:
-- ALTER TABLE "subscriptions"
--   DROP COLUMN IF EXISTS "previous_plan_type",
--   DROP COLUMN IF EXISTS "gateway",
--   DROP COLUMN IF EXISTS "period",
--   DROP COLUMN IF EXISTS "amount",
--   DROP COLUMN IF EXISTS "starts_at",
--   DROP COLUMN IF EXISTS "expires_at",
--   DROP COLUMN IF EXISTS "cancelled_at",
--   DROP COLUMN IF EXISTS "cancellation_lock_expires_at",
--   DROP COLUMN IF EXISTS "bonus_scheduled_at",
--   DROP COLUMN IF EXISTS "bonus_credited_at",
--   DROP COLUMN IF EXISTS "renewal_reminder_sent_at",
--   DROP COLUMN IF EXISTS "refund_requested";
