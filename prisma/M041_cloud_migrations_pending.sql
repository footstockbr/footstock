-- ============================================================================
-- Foot Stock — Migrations pendentes para Supabase Cloud (M026 → M040)
-- Gerado em: 2026-04-01
-- Estado do cloud antes deste script: M025 aplicado, M026-M040 ausentes.
-- Exceções já aplicadas no cloud: M036 (bio), colunas suspended_at/suspension_reason.
--
-- INSTRUÇÕES:
-- 1. Acesse Supabase Dashboard → SQL Editor
-- 2. Cole este script inteiro e execute
-- 3. Em seguida execute o bloco UPDATE ao final para fixar clube-parceiro
-- ============================================================================

-- ─── M026: Tabela moderation_rules ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "moderation_rules" (
  "id"          INTEGER NOT NULL,
  "name"        VARCHAR(100) NOT NULL,
  "description" TEXT NOT NULL,
  "enabled"     BOOLEAN NOT NULL DEFAULT false,
  "config"      JSONB,
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "moderation_rules_pkey" PRIMARY KEY ("id")
);

INSERT INTO "moderation_rules" ("id", "name", "description", "enabled", "config") VALUES
  (1, 'Auto-Delete 3 Flags', 'Deletar posts que recebam 3 ou mais denúncias', false, NULL),
  (2, 'IP Burst Ban', 'Banir IP após 5 posts em 1 minuto', false, NULL),
  (3, 'Hide Suspended', 'Ocultar posts de usuários suspensos (visível apenas para admin)', false, NULL),
  (4, 'New User Ticker Restrict', 'Proibir posts sobre tickers específicos para contas com menos de 7 dias', false, '{"restrictedTickers": [], "minAccountAgeDays": 7}'),
  (5, 'Hourly Post Limit', 'Limite de 5 posts por hora por usuário (configurável pelo SuperAdmin)', false, '{"limit": 5}')
ON CONFLICT ("id") DO NOTHING;

-- ─── M027: Tabela ad_sponsors ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ad_sponsors" (
  "id"             TEXT NOT NULL,
  "name"           VARCHAR(100) NOT NULL,
  "logo"           TEXT,
  "banners"        JSONB NOT NULL DEFAULT '{}',
  "active_liga_id" TEXT,
  "starts_at"      TIMESTAMPTZ NOT NULL,
  "ends_at"        TIMESTAMPTZ NOT NULL,
  "active"         BOOLEAN NOT NULL DEFAULT false,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ad_sponsors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ad_sponsors_active_idx" ON "ad_sponsors" ("active", "ends_at");

-- ─── M031: Tabela nsm_daily_records ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "nsm_daily_records" (
  "id"            TEXT NOT NULL,
  "date"          DATE NOT NULL,
  "filled_orders" INTEGER NOT NULL,
  "target"        INTEGER NOT NULL DEFAULT 500,
  "percentage"    DOUBLE PRECISION NOT NULL,
  "alert_sent"    BOOLEAN NOT NULL DEFAULT false,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nsm_daily_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "nsm_daily_records_date_key" ON "nsm_daily_records"("date");

-- ─── M032: CLUB_PARTNER no enum AdminRole ───────────────────────────────────

ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'CLUB_PARTNER';

-- ─── M033: Tabelas affiliate ─────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "affiliate_codes" (
  "id"                    TEXT NOT NULL,
  "user_id"               TEXT NOT NULL,
  "code"                  VARCHAR(50) NOT NULL,
  "affiliate_type"        VARCHAR(30) NOT NULL DEFAULT 'INFLUENCER',
  "commission_percentage" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
  "bank_data"             JSONB,
  "active"                BOOLEAN NOT NULL DEFAULT true,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_codes_user_id_key" ON "affiliate_codes"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_codes_code_key"    ON "affiliate_codes"("code");

ALTER TABLE "affiliate_codes"
  ADD CONSTRAINT "affiliate_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;
ALTER TABLE "affiliate_codes" VALIDATE CONSTRAINT "affiliate_codes_user_id_fkey";

CREATE TABLE IF NOT EXISTS "affiliate_transactions" (
  "id"                TEXT NOT NULL,
  "affiliate_code_id" TEXT NOT NULL,
  "referred_user_id"  TEXT NOT NULL,
  "subscription_id"   TEXT,
  "transaction_type"  VARCHAR(30) NOT NULL DEFAULT 'SIGNUP',
  "amount"            DECIMAL(14,8) NOT NULL DEFAULT 0,
  "status"            "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
  "paid_at"           TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "affiliate_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "affiliate_transactions_affiliate_code_id_idx" ON "affiliate_transactions"("affiliate_code_id");
CREATE INDEX IF NOT EXISTS "affiliate_transactions_referred_user_id_idx"  ON "affiliate_transactions"("referred_user_id");

ALTER TABLE "affiliate_transactions"
  ADD CONSTRAINT "affiliate_transactions_affiliate_code_id_fkey"
  FOREIGN KEY ("affiliate_code_id") REFERENCES "affiliate_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;
ALTER TABLE "affiliate_transactions" VALIDATE CONSTRAINT "affiliate_transactions_affiliate_code_id_fkey";

ALTER TABLE "affiliate_transactions"
  ADD CONSTRAINT "affiliate_transactions_referred_user_id_fkey"
  FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON UPDATE CASCADE
  NOT VALID;
ALTER TABLE "affiliate_transactions" VALIDATE CONSTRAINT "affiliate_transactions_referred_user_id_fkey";

-- ─── M034: Atualizar tabela subscriptions ────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "SubscriptionGateway" AS ENUM ('MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SubscriptionPeriod" AS ENUM ('MONTHLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "previous_plan_type"           "PlanType",
  ADD COLUMN IF NOT EXISTS "gateway"                      "SubscriptionGateway",
  ADD COLUMN IF NOT EXISTS "period"                       "SubscriptionPeriod",
  ADD COLUMN IF NOT EXISTS "amount"                       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "starts_at"                    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expires_at"                   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at"                 TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellation_lock_expires_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bonus_scheduled_at"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bonus_credited_at"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "renewal_reminder_sent_at"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refund_requested"             BOOLEAN NOT NULL DEFAULT false;

UPDATE "subscriptions"
  SET "starts_at" = "current_period_start",
      "expires_at" = "current_period_end"
  WHERE "starts_at" IS NULL AND "current_period_start" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "subscriptions_expires_at_status_idx"
  ON "subscriptions"("expires_at", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_cancellation_lock_idx"
  ON "subscriptions"("cancellation_lock_expires_at", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_renewal_reminder_idx"
  ON "subscriptions"("renewal_reminder_sent_at", "status");

-- ─── M035: Alinhar schema de leagues ─────────────────────────────────────────

ALTER TABLE "leagues"
  ADD COLUMN IF NOT EXISTS "slug"       TEXT,
  ADD COLUMN IF NOT EXISTS "division"   TEXT NOT NULL DEFAULT 'BRONZE',
  ADD COLUMN IF NOT EXISTS "duration"   TEXT NOT NULL DEFAULT '1M',
  ADD COLUMN IF NOT EXISTS "status"     TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "starts_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "ends_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "created_by" TEXT,
  ADD COLUMN IF NOT EXISTS "emblem_url" TEXT,
  ADD COLUMN IF NOT EXISTS "sponsor_id" TEXT;

UPDATE "leagues" SET "created_by" = "owner_id"
  WHERE "created_by" IS NULL AND "owner_id" IS NOT NULL;

UPDATE "leagues" SET "slug" = "id" WHERE "slug" IS NULL;

-- Tornar NOT NULL apenas se todas as linhas têm valor (seguro com UPDATE acima)
DO $$
BEGIN
  ALTER TABLE "leagues" ALTER COLUMN "slug" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "leagues" ALTER COLUMN "created_by" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "leagues" ALTER COLUMN "ends_at" SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE "leagues" DROP CONSTRAINT IF EXISTS "leagues_owner_id_fkey";
DROP INDEX IF EXISTS "leagues_owner_id_idx";
ALTER TABLE "leagues"
  DROP COLUMN IF EXISTS "owner_id",
  DROP COLUMN IF EXISTS "season",
  DROP COLUMN IF EXISTS "is_active";

CREATE UNIQUE INDEX IF NOT EXISTS "leagues_slug_key" ON "leagues"("slug");

ALTER TABLE "leagues"
  ADD CONSTRAINT "leagues_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
  NOT VALID;
ALTER TABLE "leagues" VALIDATE CONSTRAINT "leagues_created_by_fkey";

ALTER TABLE "leagues"
  ADD CONSTRAINT "leagues_sponsor_id_fkey"
    FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;
ALTER TABLE "leagues" VALIDATE CONSTRAINT "leagues_sponsor_id_fkey";

CREATE INDEX IF NOT EXISTS "leagues_created_by_idx"   ON "leagues"("created_by");
CREATE INDEX IF NOT EXISTS "leagues_type_status_idx"  ON "leagues"("type", "status");

ALTER TABLE "league_members"
  ADD COLUMN IF NOT EXISTS "score_breakdown" JSONB,
  ADD COLUMN IF NOT EXISTS "last_score_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "league_members_league_id_score_idx"
  ON "league_members"("league_id", "score" DESC);

-- ─── M036: bio em users (skip se já existe) ──────────────────────────────────

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" VARCHAR(300);

-- ─── M037: Corrigir tipo da coluna amount em dividends ───────────────────────

ALTER TABLE "dividends" ALTER COLUMN "amount" TYPE DECIMAL(18,8);

-- ─── M038: Enum UserStatus + coluna status em users ─────────────────────────

DO $$ BEGIN
  CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- ─── M039: Remover colunas legadas de subscriptions ──────────────────────────

ALTER TABLE "subscriptions"
  DROP COLUMN IF EXISTS "current_period_start",
  DROP COLUMN IF EXISTS "current_period_end",
  DROP COLUMN IF EXISTS "cancel_at_period_end",
  DROP COLUMN IF EXISTS "gateway_id";

-- ─── M040: Alinhar enums e criar tabelas ausentes ────────────────────────────

DO $$ BEGIN
  CREATE TYPE "WebhookAuditStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'DUPLICATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- LeagueType: renomear valores PUBLIC→PUBLICA, PRIVATE→AMIGOS, SPONSORED→PRO
DO $$
BEGIN
  -- Verificar se os valores novos já existem
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PUBLICA'
                   AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'LeagueType')) THEN
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
  END IF;
END $$;

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CANCELLATION_LOCK';

ALTER TABLE "payments"
  DROP COLUMN IF EXISTS "currency",
  DROP COLUMN IF EXISTS "gateway_id",
  DROP COLUMN IF EXISTS "gateway_response",
  DROP COLUMN IF EXISTS "updated_at";

DO $$ BEGIN
  CREATE TYPE "SubscriptionGateway" AS ENUM ('MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "gateway"                "SubscriptionGateway",
  ADD COLUMN IF NOT EXISTS "gateway_transaction_id" TEXT,
  ADD COLUMN IF NOT EXISTS "gateway_meta"           JSONB,
  ADD COLUMN IF NOT EXISTS "processed_at"           TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_gateway_transaction_id_key"
  ON "payments"("gateway_transaction_id")
  WHERE "gateway_transaction_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "dunning_attempts" (
  "id"              TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "attempt_number"  INTEGER NOT NULL DEFAULT 1,
  "attempted_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "success"         BOOLEAN NOT NULL DEFAULT false,
  "error_message"   TEXT,
  CONSTRAINT "dunning_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dunning_attempts_subscription_id_idx"
  ON "dunning_attempts"("subscription_id");

CREATE TABLE IF NOT EXISTS "webhook_audit_logs" (
  "id"           TEXT NOT NULL,
  "gateway"      "SubscriptionGateway" NOT NULL,
  "event_type"   TEXT NOT NULL,
  "payload"      JSONB NOT NULL,
  "status"       "WebhookAuditStatus" NOT NULL DEFAULT 'PENDING',
  "processed_at" TIMESTAMP(3),
  "error"        TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_audit_logs_gateway_event_idx"
  ON "webhook_audit_logs"("gateway", "event_type");

-- ─── PÓS-MIGRAÇÕES: Fixar clube-parceiro no cloud ───────────────────────────
-- Nota: requer que CLUB_PARTNER já esteja no enum (M032 acima)

UPDATE "users"
  SET "admin_role" = 'CLUB_PARTNER'
  WHERE email = 'clube-parceiro@foot-stock.test'
    AND "admin_role" IS NULL;

-- ============================================================================
-- FIM — Executar seed manual de usuários .test no Supabase Auth separadamente
-- via Dashboard → Authentication → Users → "Invite user" ou via Admin API
-- ============================================================================
