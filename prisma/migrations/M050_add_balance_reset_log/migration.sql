-- T-019: Regra de Saldo Zero
-- Adiciona BALANCE_RESET ao enum FinancialType
-- Adiciona BALANCE_ZERO e BALANCE_RESET ao enum NotificationType
-- Cria tabela balance_reset_logs para auditoria de resets pelo admin

-- PostgreSQL: ADD VALUE não pode ocorrer dentro de transação explícita
ALTER TYPE "FinancialType" ADD VALUE IF NOT EXISTS 'BALANCE_RESET';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BALANCE_ZERO';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BALANCE_RESET';

-- Tabela de log de resets de saldo
CREATE TABLE IF NOT EXISTS "balance_reset_logs" (
  "id"               TEXT        NOT NULL,
  "user_id"          TEXT        NOT NULL,
  "admin_id"         TEXT        NOT NULL,
  "previous_balance" DECIMAL(18, 2) NOT NULL,
  "new_balance"      DECIMAL(18, 2) NOT NULL,
  "plan_type"        "PlanType"  NOT NULL,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "balance_reset_logs_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX IF NOT EXISTS "balance_reset_logs_user_id_idx"  ON "balance_reset_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "balance_reset_logs_admin_id_idx" ON "balance_reset_logs" ("admin_id");

-- Foreign keys
ALTER TABLE "balance_reset_logs"
  ADD CONSTRAINT "balance_reset_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "balance_reset_logs"
  ADD CONSTRAINT "balance_reset_logs_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
