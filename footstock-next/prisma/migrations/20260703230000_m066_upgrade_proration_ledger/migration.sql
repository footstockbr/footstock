-- M066 — upgrade pró-rata: ledger de estornos + estorno parcial + memória de cálculo/consent.
-- Origem: estudo UPGRADE-PRICING-STRATEGY-2026-07-03 (Fases 1+2) + review codex (ledger próprio,
-- consolidação síncrona, webhook como eco idempotente).

-- Novos valores de enum (PG>=12 permite ADD VALUE em transação desde que não usado na mesma tx).
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'UPGRADE_PRORATION_REFUND';

CREATE TYPE "PaymentRefundStatus" AS ENUM ('REQUESTED', 'SUCCEEDED', 'WEBHOOK_CONFIRMED', 'FAILED_RETRYABLE', 'FAILED_UNSUPPORTED');

ALTER TABLE "payments" ADD COLUMN "refunded_amount_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN "upgrade_proration_meta" JSONB;

CREATE TABLE "payment_refunds" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "gateway_payment_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "expected" BOOLEAN NOT NULL DEFAULT true,
    "idempotency_key" TEXT NOT NULL,
    "status" "PaymentRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "gateway_refund_id" TEXT,
    "effects_applied_at" TIMESTAMP(3),
    "effects_policy" TEXT NOT NULL DEFAULT 'NO_ENTITLEMENT_DOWNGRADE_NO_COMMISSION_VOID',
    "metadata" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_refunds_idempotency_key_key" ON "payment_refunds"("idempotency_key");
CREATE INDEX "payment_refunds_status_idx" ON "payment_refunds"("status");
CREATE INDEX "payment_refunds_gateway_payment_id_idx" ON "payment_refunds"("gateway_payment_id");

ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
