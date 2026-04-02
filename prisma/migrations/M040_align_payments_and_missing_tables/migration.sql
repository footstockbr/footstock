-- M040_align_payments_and_missing_tables
-- Alinha tabela payments com schema.prisma e cria tabelas ausentes:
-- dunning_attempts e webhook_audit_logs

-- ─── WebhookAuditStatus enum (necessário para webhook_audit_logs) ─
DO $$ BEGIN
  CREATE TYPE "WebhookAuditStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'DUPLICATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── LeagueType: recriar enum com valores canônicos do schema.prisma ─
-- M001 criou: PUBLIC, PRIVATE, SPONSORED
-- Schema atual: PUBLICA, AMIGOS, PRO
ALTER TYPE "LeagueType" RENAME TO "LeagueType_old";
CREATE TYPE "LeagueType" AS ENUM ('PUBLICA', 'AMIGOS', 'PRO');
ALTER TABLE "leagues" ALTER COLUMN "type" TYPE "LeagueType" USING (
  CASE "type"::text
    WHEN 'PUBLIC'    THEN 'PUBLICA'
    WHEN 'PRIVATE'   THEN 'AMIGOS'
    WHEN 'SPONSORED' THEN 'PRO'
    ELSE 'PUBLICA'
  END
)::"LeagueType";
DROP TYPE "LeagueType_old";

-- ─── SubscriptionStatus: adicionar valores faltantes do schema.prisma ─
-- M001 criou: ACTIVE, CANCELLED, PAST_DUE, TRIALING
-- Schema atual requer: PENDING, TRIAL, EXPIRED, SUSPENDED, CANCELLATION_LOCK
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CANCELLATION_LOCK';

-- ─── Remover colunas legadas de payments (não estão no schema.prisma) ─
ALTER TABLE "payments"
  DROP COLUMN IF EXISTS "currency",
  DROP COLUMN IF EXISTS "gateway_id",
  DROP COLUMN IF EXISTS "gateway_response",
  DROP COLUMN IF EXISTS "updated_at";

-- ─── Adicionar colunas faltantes em payments ───────────────────────
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "gateway"                "SubscriptionGateway",
  ADD COLUMN IF NOT EXISTS "gateway_transaction_id" TEXT,
  ADD COLUMN IF NOT EXISTS "gateway_meta"           JSONB,
  ADD COLUMN IF NOT EXISTS "processed_at"           TIMESTAMP(3);

-- Índice único para idempotência de webhook
CREATE UNIQUE INDEX IF NOT EXISTS "payments_gateway_transaction_id_key"
  ON "payments"("gateway_transaction_id")
  WHERE "gateway_transaction_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "payments_gateway_transaction_id_idx"
  ON "payments"("gateway_transaction_id");

-- ─── Criar tabela dunning_attempts ────────────────────────────────
CREATE TABLE IF NOT EXISTS "dunning_attempts" (
  "id"              TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "attempt_number"  INTEGER NOT NULL,
  "gateway"         "SubscriptionGateway" NOT NULL,
  "status"          "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "scheduled_at"    TIMESTAMP(3) NOT NULL,
  "processed_at"    TIMESTAMP(3),
  "error_message"   TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dunning_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dunning_attempts_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dunning_attempts_subscription_id_attempt_number_key"
    UNIQUE ("subscription_id", "attempt_number")
);

CREATE INDEX IF NOT EXISTS "dunning_attempts_scheduled_at_status_idx"
  ON "dunning_attempts"("scheduled_at", "status");

-- ─── Criar tabela webhook_audit_logs ──────────────────────────────
CREATE TABLE IF NOT EXISTS "webhook_audit_logs" (
  "id"              TEXT NOT NULL,
  "gateway"         "SubscriptionGateway" NOT NULL,
  "event_type"      TEXT,
  "transaction_id"  TEXT,
  "subscription_id" TEXT,
  "status"          "WebhookAuditStatus" NOT NULL,
  "hmac_valid"      BOOLEAN NOT NULL,
  "ip_address"      TEXT,
  "error_message"   TEXT,
  "processed_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_audit_logs_gateway_status_idx"
  ON "webhook_audit_logs"("gateway", "status");

CREATE INDEX IF NOT EXISTS "webhook_audit_logs_processed_at_idx"
  ON "webhook_audit_logs"("processed_at");

CREATE INDEX IF NOT EXISTS "webhook_audit_logs_transaction_id_idx"
  ON "webhook_audit_logs"("transaction_id");
