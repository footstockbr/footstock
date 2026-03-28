-- M001_create_users
-- Cria enums globais e tabela users

-- ─── Enums ────────────────────────────────────────────────────────

CREATE TYPE "PlanType" AS ENUM ('JOGADOR', 'CRAQUE', 'LENDA');
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR');
CREATE TYPE "InvestorProfile" AS ENUM ('CONSERVADOR', 'MODERADO', 'ARROJADO', 'ESPECULADOR');
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT');
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED', 'EXPIRED', 'PARTIAL');
CREATE TYPE "LeagueType" AS ENUM ('PUBLIC', 'PRIVATE', 'SPONSORED');
CREATE TYPE "NotificationType" AS ENUM (
  'ORDER_EXECUTED', 'ORDER_CANCELLED', 'MARGIN_CALL_ALERT', 'CIRCUIT_BREAKER',
  'NEWS_FAVORITE_CLUB', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'PLAN_CANCEL_ALERT',
  'DIVIDEND_CREDITED', 'BONUS_CREDITED', 'LEAGUE_RESULT', 'ADMIN_BROADCAST'
);
CREATE TYPE "ImpactCategory" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');
CREATE TYPE "Sentiment" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');
CREATE TYPE "Division" AS ENUM ('SERIE_A', 'SERIE_B');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAST_DUE', 'TRIALING');
CREATE TYPE "SessionType" AS ENUM ('PRE_MARKET', 'REGULAR', 'AFTER_MARKET', 'CLOSED');
CREATE TYPE "ConsentPurpose" AS ENUM ('TERMS', 'MARKETING', 'ANALYTICS', 'THIRD_PARTY');

-- ─── Tabela users ─────────────────────────────────────────────────

CREATE TABLE "users" (
  "id"               TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "phone"            TEXT,
  "cpf_hash"         TEXT NOT NULL,
  "birth_date"       DATE,
  "plan_type"        "PlanType" NOT NULL DEFAULT 'JOGADOR',
  "admin_role"       "AdminRole",
  "investor_profile" "InvestorProfile",
  "tour_completed"   BOOLEAN NOT NULL DEFAULT false,
  "favorite_club"    TEXT,
  "fs_balance"       DECIMAL(18,2) NOT NULL DEFAULT 10000,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_cpf_hash_key" ON "users"("cpf_hash");

-- down:
-- DROP TABLE "users";
-- DROP TYPE "ConsentPurpose", "SessionType", "SubscriptionStatus", "PaymentStatus",
--   "Division", "Sentiment", "ImpactCategory", "NotificationType", "LeagueType",
--   "OrderStatus", "OrderSide", "OrderType", "InvestorProfile", "AdminRole", "PlanType";
