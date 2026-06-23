-- M059 — NotificationService real: idempotência + entrega de email rastreável
-- Rastreabilidade: FIX-25 (loop 06-22-footstock-financeiro-planos, Task 11)
--
-- Substitui o NotificationStub (histórico em memória, zero persistência) por um
-- NotificationService real com política persist-first / email-best-effort. Esta
-- migration adiciona ao model Notification:
--   - idempotency_key  : uuid v5 determinístico "{event}:{entityId}:{occurrenceMarker}",
--                        @unique => deduplica os eventos críticos (pagamento_*, assinatura_*,
--                        bonus_creditado, reembolso_processado). NULL para linhas legadas
--                        (sem dedupe — nunca colidem no índice único parcial do Postgres).
--   - email_status     : estado de entrega do email transacional. NÃO nullable; default 'na'
--                        cobre linhas legadas e o canal apenas-persistência (ex: bonus_creditado).
--   - email_provider_id: id retornado pelo Resend em sucesso (preenchido só quando 'sent').
--   - email_error      : mensagem do erro de envio em falha (preenchido só quando 'failed').
--
-- Também adiciona o tipo REFUND_PROCESSED ao enum NotificationType (evento crítico
-- reembolso_processado da tabela "Tipos críticos").
--
-- O índice em email_status habilita o cron `notification-email-retry` a varrer
-- pending/failed sem full scan.
--
-- Aplicação em PROD = ação do operador (fora do loop). ALTER TYPE ... ADD VALUE é
-- auto-commit no PostgreSQL e idempotente via IF NOT EXISTS; os ADD COLUMN abaixo
-- usam IF NOT EXISTS para serem reexecutáveis sem erro.

-- ─── UP ──────────────────────────────────────────────────────────────────────

-- 1. Novo enum de estado de email.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationEmailStatus') THEN
    CREATE TYPE "NotificationEmailStatus" AS ENUM ('pending', 'sent', 'failed', 'na');
  END IF;
END
$$;

-- 2. Novo valor de NotificationType (evento crítico reembolso_processado).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REFUND_PROCESSED';

-- 3. Novas colunas no model Notification.
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "idempotency_key"   TEXT,
  ADD COLUMN IF NOT EXISTS "email_status"      "NotificationEmailStatus" NOT NULL DEFAULT 'na',
  ADD COLUMN IF NOT EXISTS "email_provider_id" TEXT,
  ADD COLUMN IF NOT EXISTS "email_error"       TEXT;

-- 4. Índice único de idempotência. UNIQUE no Postgres ignora NULLs (linhas legadas
--    e não-críticas coexistem sem colidir), mas deduplica todo evento crítico.
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_idempotency_key_key"
  ON "notifications" ("idempotency_key");

-- 5. Índice de varredura do retry de email (cron notification-email-retry).
CREATE INDEX IF NOT EXISTS "notifications_email_status_idx"
  ON "notifications" ("email_status");

-- ─── DOWN (rollback manual) ──────────────────────────────────────────────────
-- Executar manualmente, em transação, SOMENTE se nenhuma rota/job depender mais
-- dos campos. O DROP TYPE do enum exige que nenhuma coluna o referencie.
--
-- BEGIN;
--   DROP INDEX IF EXISTS "notifications_email_status_idx";
--   DROP INDEX IF EXISTS "notifications_idempotency_key_key";
--   ALTER TABLE "notifications"
--     DROP COLUMN IF EXISTS "email_error",
--     DROP COLUMN IF EXISTS "email_provider_id",
--     DROP COLUMN IF EXISTS "email_status",
--     DROP COLUMN IF EXISTS "idempotency_key";
--   DROP TYPE IF EXISTS "NotificationEmailStatus";
--   -- NotificationType.REFUND_PROCESSED: PostgreSQL não suporta DROP VALUE; recriar
--   -- o enum sem o valor só após reclassificar as linhas que o usam (ver M058 para o
--   -- procedimento de RENAME + recriação).
-- COMMIT;
