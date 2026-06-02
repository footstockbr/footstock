-- ============================================================================
-- CONSOLIDATED MIGRATION: M027 through M044
-- FootStock — SQL consolidado para Supabase SQL Editor
-- Gerado em: 2026-04-15
--
-- INSTRUCOES:
--   1. Execute este script INTEIRO no Supabase SQL Editor
--   2. Execute ANTES de fazer deploy no Vercel
--   3. Todas as operacoes sao idempotentes (IF NOT EXISTS / IF NOT ALREADY)
--   4. Ordem importa: enum values ANTES de tabelas que os usam
-- ============================================================================

-- ============================================================================
-- SECAO 0: PRE-FLIGHT — Colunas potencialmente faltantes
-- Garante que colunas referenciadas por migrations posteriores existem
-- ============================================================================

-- Subscriptions: colunas que podem ter sido criadas por prisma db push
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancellation_lock_expires_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS previous_plan_type TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS bonus_scheduled_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS bonus_credited_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS refund_requested BOOLEAN NOT NULL DEFAULT FALSE;

-- Users: colunas que podem ter sido criadas por prisma db push
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verification_pending BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_club_display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(300);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_code TEXT;


-- ============================================================================
-- SECAO 1: M027 — Sponsor banner link_url + position default fix
-- ============================================================================

ALTER TABLE "sponsor_banners"
  ADD COLUMN IF NOT EXISTS "link_url" TEXT;

ALTER TABLE "sponsor_banners"
  ALTER COLUMN "position" SET DEFAULT 'home_top';

CREATE INDEX IF NOT EXISTS "sponsor_banners_position_is_active_idx"
  ON "sponsor_banners" ("position", "is_active");


-- ============================================================================
-- SECAO 2: M028 — Sponsored leagues prizes + members table
-- ============================================================================

ALTER TABLE "sponsored_leagues"
  ADD COLUMN IF NOT EXISTS "prizes" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "sponsor_url" TEXT;

-- Backfill prize existente para prizes array
UPDATE "sponsored_leagues"
SET "prizes" = jsonb_build_array(
  jsonb_build_object('position', 1, 'label', '1o Lugar', 'description', prize)
)
WHERE prize IS NOT NULL AND prize != 'FS$0' AND "prizes" = '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "sponsored_league_members" (
  "id"                   TEXT NOT NULL,
  "sponsored_league_id"  TEXT NOT NULL,
  "user_id"              TEXT NOT NULL,
  "joined_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "score"                DECIMAL(18,2) NOT NULL DEFAULT 0,
  "rank"                 INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "sponsored_league_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sponsored_league_members_sponsored_league_id_fkey"
    FOREIGN KEY ("sponsored_league_id") REFERENCES "sponsored_leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sponsored_league_members_sponsored_league_id_user_id_key"
    UNIQUE ("sponsored_league_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "sponsored_league_members_sponsored_league_id_score_idx"
  ON "sponsored_league_members"("sponsored_league_id", "score" DESC);

CREATE INDEX IF NOT EXISTS "sponsored_league_members_user_id_idx"
  ON "sponsored_league_members"("user_id");


-- ============================================================================
-- SECAO 3: M029a — Forum post deleted/updated index
-- ============================================================================

CREATE INDEX IF NOT EXISTS "global_forum_posts_is_deleted_updated_at_idx"
  ON "global_forum_posts"("is_deleted", "updated_at");


-- ============================================================================
-- SECAO 4: M029b — League daily ranks table
-- ============================================================================

CREATE TABLE IF NOT EXISTS "league_daily_ranks" (
  "id"         TEXT NOT NULL,
  "league_id"  TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "date"       TIMESTAMP(3) NOT NULL,
  "rank"       INTEGER NOT NULL,
  "score"      DECIMAL(18, 2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "league_daily_ranks_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "league_daily_ranks_league_id_fkey"
    FOREIGN KEY ("league_id") REFERENCES "leagues"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "league_daily_ranks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "league_daily_ranks_league_id_user_id_date_key"
    UNIQUE ("league_id", "user_id", "date")
);

CREATE INDEX IF NOT EXISTS "league_daily_ranks_league_id_date_idx"
  ON "league_daily_ranks"("league_id", "date");

CREATE INDEX IF NOT EXISTS "league_daily_ranks_user_id_idx"
  ON "league_daily_ranks"("user_id");


-- ============================================================================
-- SECAO 5: M029c — Push subscriptions table (Web Push VAPID)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"         TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "user_id"    TEXT         NOT NULL,
  "endpoint"   TEXT         NOT NULL,
  "p256dh"     TEXT         NOT NULL,
  "auth"       TEXT         NOT NULL,
  "user_agent" TEXT,
  "active"     BOOLEAN      NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint"),
  CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_active_idx"
  ON "push_subscriptions" ("user_id", "active");

CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_push_subscriptions_updated_at ON "push_subscriptions";
CREATE TRIGGER set_push_subscriptions_updated_at
  BEFORE UPDATE ON "push_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION update_push_subscriptions_updated_at();


-- ============================================================================
-- SECAO 6: M030 — SessionType enum: CLOSING_CALL
-- ============================================================================

ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'CLOSING_CALL' AFTER 'REGULAR';


-- ============================================================================
-- SECAO 7: M031 — Affiliate commission snapshot + idempotency
-- ============================================================================

ALTER TABLE affiliate_transactions
  ADD COLUMN IF NOT EXISTS commission_percentage_at_time NUMERIC(5,4);

UPDATE affiliate_transactions at
SET    commission_percentage_at_time = ac.commission_percentage
FROM   affiliate_codes ac
WHERE  at.affiliate_code_id = ac.id
  AND  at.commission_percentage_at_time IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_tx_renewal_idempotency
  ON affiliate_transactions (affiliate_code_id, subscription_id, transaction_type)
  WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_tx_status_pending
  ON affiliate_transactions (status)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_affiliate_tx_affiliate_code
  ON affiliate_transactions (affiliate_code_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_tx_referred_user
  ON affiliate_transactions (referred_user_id);


-- ============================================================================
-- SECAO 8: M032 — NotificationType enum: affiliate types
-- ============================================================================

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AFFILIATE_COMMISSION_EARNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AFFILIATE_INVITE_JOINED';


-- ============================================================================
-- SECAO 9: M033a — Affiliate gateway_transaction_id + status VOIDED
-- ============================================================================

ALTER TABLE affiliate_transactions
  ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_tx_gateway_tx_id
  ON affiliate_transactions (gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;

ALTER TYPE "AffiliateStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

-- Remover indice anterior (substituido pelo gateway_transaction_id)
DROP INDEX IF EXISTS uq_affiliate_tx_renewal_idempotency;


-- ============================================================================
-- SECAO 10: M033b — Leverage fields: permite_alavancagem em leagues
-- ============================================================================

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS permite_alavancagem BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN leagues.permite_alavancagem
  IS 'Liga PRO pode autorizar ordens alavancadas 2x (plano Lenda). Default false.';


-- ============================================================================
-- SECAO 11: M034 — Dividendos 3 Modalidades
-- ============================================================================

ALTER TABLE "dividends"
  ADD COLUMN IF NOT EXISTS "snapshot_date"    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "shares_snapshot"  DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS "price_per_share"  DECIMAL(18,8);

CREATE INDEX IF NOT EXISTS "dividends_user_id_type_idx"
  ON "dividends" ("user_id", "type");

CREATE TABLE IF NOT EXISTS "yield_differential_pending" (
  "id"                       TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "user_id"                  TEXT         NOT NULL,
  "ticker"                   TEXT         NOT NULL,
  "source_type"              TEXT         NOT NULL,
  "source_dividend_id"       TEXT,
  "snapshot_date"            TIMESTAMPTZ  NOT NULL,
  "shares_snapshot"          DECIMAL(18,8) NOT NULL,
  "pending_amount"           DECIMAL(18,8) NOT NULL DEFAULT 0,
  "status"                   TEXT         NOT NULL DEFAULT 'PENDING',
  "realized_at"              TIMESTAMPTZ,
  "realized_transaction_id"  TEXT,
  "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "yield_differential_pending_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "yield_differential_pending_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "yield_differential_pending_dividend_fk"
    FOREIGN KEY ("source_dividend_id") REFERENCES "dividends"("id") ON DELETE SET NULL,
  CONSTRAINT "yield_differential_pending_user_dividend_unique"
    UNIQUE ("user_id", "source_dividend_id")
);

CREATE INDEX IF NOT EXISTS "ydp_user_status_idx"
  ON "yield_differential_pending" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "ydp_user_ticker_idx"
  ON "yield_differential_pending" ("user_id", "ticker");

CREATE OR REPLACE FUNCTION update_ydp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ydp_updated_at_trigger ON "yield_differential_pending";
CREATE TRIGGER ydp_updated_at_trigger
  BEFORE UPDATE ON "yield_differential_pending"
  FOR EACH ROW EXECUTE FUNCTION update_ydp_updated_at();

COMMENT ON TABLE "yield_differential_pending" IS
  'Accrual de yield diferencial para usuarios JOGADOR. Realizado proporcionalmente na venda da posicao.';
COMMENT ON COLUMN "yield_differential_pending"."status" IS
  'PENDING = nao realizado | REALIZED = realizado na venda | UPGRADED = migrado por upgrade de plano';
COMMENT ON COLUMN "dividends"."snapshot_date" IS
  'Data de corte de acionistas. Usuarios com posicao nesta data recebem o dividendo.';


-- ============================================================================
-- SECAO 12: M035 — Cancellation Lock fields (T+48h e T+7d)
-- ============================================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancellation_lock_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forced_liquidation_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forced_liquidation_executed_at   TIMESTAMPTZ;

-- Backfill para locks abertos
UPDATE subscriptions
SET
  cancellation_lock_started_at  = COALESCE(cancelled_at, updated_at, created_at),
  forced_liquidation_at          = COALESCE(cancelled_at, updated_at, created_at) + INTERVAL '48 hours',
  cancellation_lock_expires_at   = COALESCE(cancelled_at, updated_at, created_at) + INTERVAL '7 days'
WHERE status = 'CANCELLATION_LOCK'
  AND cancellation_lock_started_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_forced_liquidation
  ON subscriptions (forced_liquidation_at, status, forced_liquidation_executed_at)
  WHERE status = 'CANCELLATION_LOCK';

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancellation_lock_expires
  ON subscriptions (cancellation_lock_expires_at, status)
  WHERE status = 'CANCELLATION_LOCK';


-- ============================================================================
-- SECAO 13: M036 — Sistema de Notificacoes Completo (23 tipos)
-- ============================================================================

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MARGIN_CALL_WARNING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LGPD_EXPORT_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BRUTE_FORCE_BLOCKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_MAINTENANCE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REFERRAL_JOINED';

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

UPDATE "notifications"
SET "expires_at" = "created_at" + INTERVAL '30 days'
WHERE "expires_at" IS NULL;

CREATE INDEX IF NOT EXISTS "notifications_user_id_type_idx"
  ON "notifications" ("user_id", "type");

CREATE INDEX IF NOT EXISTS "notifications_expires_at_idx"
  ON "notifications" ("expires_at")
  WHERE "expires_at" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_created_at_idx"
  ON "notifications" ("user_id", "is_read", "created_at" DESC);

DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

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


-- ============================================================================
-- SECAO 14: M037 — tour_skipped_at field
-- ============================================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tour_skipped_at" TIMESTAMPTZ;


-- ============================================================================
-- SECAO 15: M038 — Club Users + Access Logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS "club_users" (
  "id"            TEXT         NOT NULL PRIMARY KEY,
  "club_ticker"   TEXT         NOT NULL,
  "email"         TEXT         NOT NULL,
  "password_hash" TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "role"          VARCHAR(20)  NOT NULL DEFAULT 'VIEWER',
  "is_active"     BOOLEAN      NOT NULL DEFAULT true,
  "last_login_at" TIMESTAMPTZ,
  "created_by"    TEXT         NOT NULL,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "club_users_club_ticker_fkey"
    FOREIGN KEY ("club_ticker") REFERENCES "assets"("ticker")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "club_users_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "club_users_email_key" ON "club_users" ("email");
CREATE INDEX IF NOT EXISTS "club_users_club_ticker_idx" ON "club_users" ("club_ticker");
CREATE INDEX IF NOT EXISTS "club_users_email_idx" ON "club_users" ("email");

CREATE TABLE IF NOT EXISTS "club_access_logs" (
  "id"             TEXT         NOT NULL PRIMARY KEY,
  "club_user_id"   TEXT         NOT NULL,
  "action"         VARCHAR(50)  NOT NULL,
  "ip_address"     VARCHAR(45),
  "user_agent"     VARCHAR(500),
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "club_access_logs_club_user_id_fkey"
    FOREIGN KEY ("club_user_id") REFERENCES "club_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "club_access_logs_club_user_id_idx" ON "club_access_logs" ("club_user_id");
CREATE INDEX IF NOT EXISTS "club_access_logs_created_at_idx" ON "club_access_logs" ("created_at");


-- ============================================================================
-- SECAO 16: M039 — FinancialType enum: FEE
-- ============================================================================

ALTER TYPE "FinancialType" ADD VALUE IF NOT EXISTS 'FEE';


-- ============================================================================
-- SECAO 17: M040 — Liga PRO: Trofeus, Banner ID, Sponsor fields
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "TrophyType" AS ENUM (
    'PRO_LEAGUE_WINNER',
    'PRO_LEAGUE_RUNNER_UP',
    'PRO_LEAGUE_THIRD'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "sponsors"
  ADD COLUMN IF NOT EXISTS "is_active"  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "created_by" TEXT;

ALTER TABLE "sponsor_banners"
  ADD COLUMN IF NOT EXISTS "image_url"  TEXT,
  ADD COLUMN IF NOT EXISTS "width"      INTEGER,
  ADD COLUMN IF NOT EXISTS "height"     INTEGER,
  ADD COLUMN IF NOT EXISTS "sponsor_id" TEXT REFERENCES "sponsors"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "sponsor_banners_sponsor_id_idx" ON "sponsor_banners"("sponsor_id");

ALTER TABLE "leagues"
  ADD COLUMN IF NOT EXISTS "banner_id" TEXT REFERENCES "sponsor_banners"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "leagues_banner_id_idx" ON "leagues"("banner_id");

CREATE TABLE IF NOT EXISTS "league_trophies" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "user_id"     TEXT        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "league_id"   TEXT        NOT NULL REFERENCES "leagues"("id") ON DELETE CASCADE,
  "trophy_type" "TrophyType" NOT NULL,
  "position"    INTEGER     NOT NULL,
  "awarded_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "league_trophies_user_id_league_id_trophy_type_key"
    UNIQUE("user_id", "league_id", "trophy_type")
);

CREATE INDEX IF NOT EXISTS "league_trophies_user_id_awarded_at_idx"
  ON "league_trophies"("user_id", "awarded_at" DESC);

CREATE INDEX IF NOT EXISTS "league_trophies_league_id_idx"
  ON "league_trophies"("league_id");


-- ============================================================================
-- SECAO 18: M041a — Verificacao de Maioridade (CPF)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "VerificationMethod" AS ENUM ('FLAGCHECK', 'AUTODECLARATION', 'ADMIN_OVERRIDE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "age_verifications" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "user_id"     TEXT NOT NULL,
  "cpf_hash"    VARCHAR(64) NOT NULL,
  "is_adult"    BOOLEAN NOT NULL,
  "method"      "VerificationMethod" NOT NULL,
  "verified_at" TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "age_verifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "age_verifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "age_verifications_user_id_idx" ON "age_verifications"("user_id");
CREATE INDEX IF NOT EXISTS "age_verifications_cpf_hash_idx" ON "age_verifications"("cpf_hash");


-- ============================================================================
-- SECAO 19: M041b — Bonus FS$ com Carencia de 7 dias (CDC Art. 49)
-- ============================================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS bonus_amount DECIMAL(18, 2);

-- Campos de trade tornam-se opcionais para suportar lancamentos sem ativo
ALTER TABLE transactions
  ALTER COLUMN asset_id   DROP NOT NULL,
  ALTER COLUMN "type"     DROP NOT NULL,
  ALTER COLUMN side       DROP NOT NULL,
  ALTER COLUMN quantity   DROP NOT NULL,
  ALTER COLUMN price      DROP NOT NULL,
  ALTER COLUMN fee        DROP NOT NULL;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BONUS_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BONUS_CANCELLED';

-- Indice parcial para cron de credito de bonus
CREATE INDEX IF NOT EXISTS idx_subscriptions_bonus_pending
  ON subscriptions (bonus_scheduled_at, status)
  WHERE bonus_scheduled_at IS NOT NULL AND bonus_credited_at IS NULL;


-- ============================================================================
-- SECAO 20: M042 — Asset realName + asset_aliases table
-- ============================================================================

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS real_name VARCHAR(100);

COMMENT ON COLUMN assets.real_name IS 'Nome real do clube (ex: Flamengo). USO SERVER-SIDE E ADMIN APENAS. Nunca retornar em endpoints publicos.';

CREATE TABLE IF NOT EXISTS asset_aliases (
  id           VARCHAR(30)  NOT NULL,
  alias        VARCHAR(10)  NOT NULL,
  asset_ticker VARCHAR(10)  NOT NULL,
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT asset_aliases_pkey         PRIMARY KEY (id),
  CONSTRAINT asset_aliases_alias_unique  UNIQUE (alias),
  CONSTRAINT asset_aliases_asset_fkey    FOREIGN KEY (asset_ticker) REFERENCES assets(ticker) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_asset_aliases_alias_active
  ON asset_aliases (alias, is_active);

COMMENT ON TABLE  asset_aliases IS 'Mapeamento de aliases de ticker do mundo real (FLA3) para tickers ficticios do sistema (URU3).';
COMMENT ON COLUMN asset_aliases.alias IS 'Ticker do mundo real normalizado em maiusculas (ex: FLA3, FLA4, FLM3).';
COMMENT ON COLUMN asset_aliases.asset_ticker IS 'Ticker canonico ficticio do sistema (ex: URU3).';


-- ============================================================================
-- SECAO 21: M043 — Asset aliases reverse index
-- ============================================================================

CREATE INDEX IF NOT EXISTS "asset_aliases_asset_ticker_idx"
  ON "asset_aliases" ("asset_ticker");


-- ============================================================================
-- SECAO 22: M044 — Locking Otimista: campo version
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_id_version    ON users    (id, version);
CREATE INDEX IF NOT EXISTS idx_orders_id_version   ON orders   (id, version);
CREATE INDEX IF NOT EXISTS idx_positions_id_version ON positions (id, version);


-- ============================================================================
-- SECAO 23: RLS — Protecao basica para tabelas sensiveis
-- (PostgREST acessivel via anon key — bloquear acesso direto)
-- ============================================================================

-- club_users: contém password_hash — DEVE ser protegida
ALTER TABLE "club_users" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "club_users_deny_anon" ON "club_users";
CREATE POLICY "club_users_deny_anon" ON "club_users" FOR ALL USING (false);

-- club_access_logs: dados de auditoria LGPD
ALTER TABLE "club_access_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "club_access_logs_deny_anon" ON "club_access_logs";
CREATE POLICY "club_access_logs_deny_anon" ON "club_access_logs" FOR ALL USING (false);

-- age_verifications: contém cpf_hash
ALTER TABLE "age_verifications" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "age_verifications_deny_anon" ON "age_verifications";
CREATE POLICY "age_verifications_deny_anon" ON "age_verifications" FOR ALL USING (false);

-- push_subscriptions: contém VAPID keys
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_subscriptions_deny_anon" ON "push_subscriptions";
CREATE POLICY "push_subscriptions_deny_anon" ON "push_subscriptions" FOR ALL USING (false);

-- notification_preferences: dados pessoais do usuario
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_preferences_deny_anon" ON "notification_preferences";
CREATE POLICY "notification_preferences_deny_anon" ON "notification_preferences" FOR ALL USING (false);


-- ============================================================================
-- SECAO 24: Indices extras para subscriptions (schema Prisma)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal_reminder
  ON subscriptions (renewal_reminder_sent_at, status)
  WHERE renewal_reminder_sent_at IS NULL AND status = 'ACTIVE';


-- ============================================================================
-- VERIFICACAO FINAL
-- Execute estas queries para confirmar que tudo foi aplicado:
-- ============================================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'real_name';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'version';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name = 'bonus_scheduled_at';
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('asset_aliases', 'push_subscriptions', 'club_users', 'age_verifications', 'league_trophies', 'notification_preferences');
-- SELECT typname FROM pg_type WHERE typname IN ('TrophyType', 'VerificationMethod', 'NotificationChannel');
