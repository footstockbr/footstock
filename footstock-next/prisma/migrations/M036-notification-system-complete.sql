-- M036 — Sistema de Notificações Completo: 23 tipos, preferências, expiresAt, isArchived
-- Rastreabilidade: T-014 (NOTIFICATION-SPEC.md), TASK-014-notificacoes-23-tipos.md

-- 1. Adicionar tipos faltantes ao enum NotificationType
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MARGIN_CALL_WARNING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LGPD_EXPORT_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BRUTE_FORCE_BLOCKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_MAINTENANCE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REFERRAL_JOINED';

-- 2. Adicionar colunas na tabela notifications
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

-- 3. Preencher expires_at para notificações existentes (TTL = 30 dias a partir de created_at)
UPDATE "notifications"
SET "expires_at" = "created_at" + INTERVAL '30 days'
WHERE "expires_at" IS NULL;

-- 4. Índices adicionais para queries de digest e TTL cleanup
CREATE INDEX IF NOT EXISTS "notifications_user_id_type_idx"
  ON "notifications" ("user_id", "type");

CREATE INDEX IF NOT EXISTS "notifications_expires_at_idx"
  ON "notifications" ("expires_at")
  WHERE "expires_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_created_at_idx"
  ON "notifications" ("user_id", "is_read", "created_at" DESC);

-- 5. Criar enum NotificationChannel
DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 6. Criar tabela notification_preferences
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id"                TEXT NOT NULL,
  "user_id"           TEXT NOT NULL,
  "notification_type" TEXT NOT NULL,
  "in_app_enabled"    BOOLEAN NOT NULL DEFAULT TRUE,
  "push_enabled"      BOOLEAN NOT NULL DEFAULT TRUE,
  "email_enabled"     BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_preferences_user_type_unique" UNIQUE ("user_id", "notification_type"),
  CONSTRAINT "notification_preferences_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "notification_preferences_user_id_idx"
  ON "notification_preferences" ("user_id");
