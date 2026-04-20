-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('JOGADOR', 'CRAQUE', 'LENDA');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT', 'OCO', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "PositionSide" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FinancialType" AS ENUM ('TRADE', 'BONUS', 'DEPOSIT', 'WITHDRAWAL', 'SHORT_INTEREST', 'MARGIN_BLOCKED', 'SHORT_CLOSE', 'LEVERAGE_INTEREST', 'FEE');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED', 'EXPIRED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR', 'CLUB_PARTNER');

-- CreateEnum
CREATE TYPE "InvestorProfile" AS ENUM ('CONSERVADOR', 'MODERADO', 'ARROJADO', 'ESPECULADOR', 'INICIANTE', 'INTERMEDIARIO', 'AVANCADO', 'FA');

-- CreateEnum
CREATE TYPE "LeagueType" AS ENUM ('PUBLICA', 'AMIGOS', 'PRO');

-- CreateEnum
CREATE TYPE "TrophyType" AS ENUM ('PRO_LEAGUE_WINNER', 'PRO_LEAGUE_RUNNER_UP', 'PRO_LEAGUE_THIRD');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_EXECUTED', 'ORDER_CANCELLED', 'MARGIN_CALL_WARNING', 'MARGIN_CALL_ALERT', 'CIRCUIT_BREAKER', 'NEWS_FAVORITE_CLUB', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'PLAN_CANCEL_ALERT', 'DIVIDEND_CREDITED', 'BONUS_CREDITED', 'BONUS_SCHEDULED', 'BONUS_CANCELLED', 'LEAGUE_RESULT', 'ADMIN_BROADCAST', 'CANCELLATION_LOCK_ACTIVE', 'CANCELLATION_LOCK_LIQUIDATED', 'AFFILIATE_COMMISSION_EARNED', 'AFFILIATE_INVITE_JOINED', 'PASSWORD_RESET', 'LGPD_EXPORT_READY', 'ACCOUNT_DELETED', 'BRUTE_FORCE_BLOCKED', 'SYSTEM_MAINTENANCE', 'REFERRAL_JOINED', 'AGE_VERIFICATION_PENDING', 'AGE_VERIFICATION_COMPLETED', 'BALANCE_ZERO', 'BALANCE_RESET', 'POST_FLAGGED', 'POST_REJECTED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "ImpactCategory" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "Division" AS ENUM ('SERIE_A', 'SERIE_B');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "WebhookAuditStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED', 'CANCELLATION_LOCK', 'CANCELLED', 'PAST_DUE', 'TRIALING');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "SubscriptionGateway" AS ENUM ('MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL');

-- CreateEnum
CREATE TYPE "SubscriptionPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('PRE_MARKET', 'REGULAR', 'CLOSING_CALL', 'AFTER_MARKET', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('ESSENTIAL', 'ANALYTICS', 'MARKETING', 'DATA_TERCEIROS', 'AGE_VERIFICATION', 'SPONSORED_LEAGUES');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('FLAGCHECK', 'AUTODECLARATION', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PostModerationStatus" AS ENUM ('PUBLISHED', 'FLAGGED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'VOIDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "cpf_hash" TEXT NOT NULL,
    "birth_date" DATE,
    "plan_type" "PlanType" NOT NULL DEFAULT 'JOGADOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "admin_role" "AdminRole",
    "investor_profile" "InvestorProfile",
    "tour_completed" BOOLEAN NOT NULL DEFAULT false,
    "tour_skipped_at" TIMESTAMP(3),
    "favorite_club" TEXT,
    "fs_balance" DECIMAL(18,2) NOT NULL DEFAULT 10000,
    "margin_blocked" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "age_verification_pending" BOOLEAN NOT NULL DEFAULT false,
    "referred_by_code" TEXT,
    "favorite_club_display_name" TEXT,
    "bio" VARCHAR(300),
    "suspended_at" TIMESTAMP(3),
    "suspension_reason" VARCHAR(500),
    "user_type" TEXT NOT NULL DEFAULT 'NORMAL',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "real_name" TEXT,
    "club_slug" TEXT NOT NULL,
    "division" "Division" NOT NULL,
    "cluster" TEXT NOT NULL,
    "current_price" DECIMAL(18,8) NOT NULL,
    "open_price" DECIMAL(18,8) NOT NULL,
    "close_price" DECIMAL(18,8) NOT NULL,
    "fair_value" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "market_cap" DECIMAL(18,2) NOT NULL,
    "current_supply" BIGINT NOT NULL DEFAULT 1000000,
    "total_shares" BIGINT NOT NULL DEFAULT 1000000,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_halted" BOOLEAN NOT NULL DEFAULT false,
    "halt_reason" TEXT,
    "sentiment" TEXT NOT NULL DEFAULT 'NEUTRAL',
    "financials" JSONB,
    "color_primary" TEXT NOT NULL,
    "color_secondary" TEXT NOT NULL,
    "logo_url" TEXT,
    "coach_name" TEXT,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_aliases" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "asset_ticker" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "side" "OrderSide" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,8),
    "executed_price" DECIMAL(18,8),
    "fee" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "group_id" TEXT,
    "leverage_multiplier" INTEGER NOT NULL DEFAULT 1,
    "executed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "avg_price" DECIMAL(18,8) NOT NULL,
    "total_invested" DECIMAL(18,2) NOT NULL,
    "side" "PositionSide" NOT NULL DEFAULT 'LONG',
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "margin_blocked" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "leverage_multiplier" INTEGER NOT NULL DEFAULT 1,
    "leverage_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "daily_interest_rate" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "interest_accrued" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "order_id" TEXT,
    "type" "OrderType",
    "financial_type" "FinancialType" NOT NULL DEFAULT 'TRADE',
    "side" "OrderSide",
    "quantity" INTEGER,
    "price" DECIMAL(18,8),
    "fee" DECIMAL(18,8),
    "total_amount" DECIMAL(18,2) NOT NULL,
    "fs_amount" DECIMAL(18,2),
    "balance_before" DECIMAL(18,2),
    "balance_after" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(18,8) NOT NULL,
    "high" DECIMAL(18,8) NOT NULL,
    "low" DECIMAL(18,8) NOT NULL,
    "close" DECIMAL(18,8) NOT NULL,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "session_type" "SessionType" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'REAL',

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_type" "PlanType" NOT NULL,
    "previous_plan_type" "PlanType",
    "gateway" "SubscriptionGateway" NOT NULL,
    "period" "SubscriptionPeriod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_lock_started_at" TIMESTAMP(3),
    "cancellation_lock_expires_at" TIMESTAMP(3),
    "forced_liquidation_at" TIMESTAMP(3),
    "forced_liquidation_executed_at" TIMESTAMP(3),
    "bonus_amount" DECIMAL(18,2),
    "bonus_scheduled_at" TIMESTAMP(3),
    "bonus_credited_at" TIMESTAMP(3),
    "renewal_reminder_sent_at" TIMESTAMP(3),
    "refund_requested" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "gateway" "SubscriptionGateway" NOT NULL,
    "gateway_transaction_id" TEXT NOT NULL,
    "gateway_meta" JSONB,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunning_attempts" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "gateway" "SubscriptionGateway" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dunning_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_audit_logs" (
    "id" TEXT NOT NULL,
    "gateway" "SubscriptionGateway" NOT NULL,
    "event_type" TEXT,
    "transaction_id" TEXT,
    "subscription_id" TEXT,
    "status" "WebhookAuditStatus" NOT NULL,
    "hmac_valid" BOOLEAN NOT NULL,
    "ip_address" TEXT,
    "error_message" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "impact" "ImpactCategory" NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "ticker" TEXT,
    "asset_ids" TEXT[],
    "source" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "author" TEXT NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_source_whitelist" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "added_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_source_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'home_top',
    "image_url" TEXT,
    "link_url" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#00B1EA',
    "cta_text" TEXT NOT NULL DEFAULT 'Saiba mais',
    "cta_color" TEXT NOT NULL DEFAULT '#00B1EA',
    "sponsor_id" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "image_desktop_url" TEXT,
    "image_mobile_url" TEXT,
    "image_vertical_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsor_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_leagues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "prize" TEXT NOT NULL DEFAULT 'FS$0',
    "prizes" JSONB NOT NULL DEFAULT '[]',
    "sponsor_url" TEXT,
    "participants" INTEGER NOT NULL DEFAULT 0,
    "max_participants" INTEGER NOT NULL DEFAULT 50,
    "min_plan" TEXT NOT NULL DEFAULT 'JOGADOR',
    "status" TEXT NOT NULL DEFAULT 'AGENDADA',
    "border_color" TEXT NOT NULL DEFAULT '#f59e0b',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_league_members" (
    "id" TEXT NOT NULL,
    "sponsored_league_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sponsored_league_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rss_feeds" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rss_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leagues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "LeagueType" NOT NULL,
    "division" TEXT NOT NULL DEFAULT 'BRONZE',
    "duration" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "max_members" INTEGER NOT NULL DEFAULT 20,
    "prize_pool" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "sponsor_id" TEXT,
    "emblem_url" TEXT,
    "invite_code" TEXT,
    "permite_alavancagem" BOOLEAN NOT NULL DEFAULT false,
    "banner_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_members" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "score_breakdown" JSONB,
    "last_score_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "league_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_score_events" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "period" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_score_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_daily_ranks" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_daily_ranks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_trophies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "trophy_type" "TrophyType" NOT NULL,
    "position" INTEGER NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_trophies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_posts" (
    "id" TEXT NOT NULL,
    "league_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_access_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "accessed_by" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "reason" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT,
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "contract_start" TIMESTAMP(3) NOT NULL,
    "contract_end" TIMESTAMP(3) NOT NULL,
    "sponsorship_value" DECIMAL(18,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_market_actions" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "ticker" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "previous_price" DECIMAL(18,8),
    "new_price" DECIMAL(18,8),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_market_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "format" TEXT NOT NULL DEFAULT 'json+csv',
    "file_path" TEXT,
    "download_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "error" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affected_users" INTEGER NOT NULL,
    "data_types" TEXT[],
    "detected_at" TIMESTAMP(3) NOT NULL,
    "contained_at" TIMESTAMP(3),
    "estimated_impact" TEXT NOT NULL,
    "report" TEXT NOT NULL,
    "notified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_sent" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividends" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "club_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "yield_percent" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processed_month" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "trigger_event" TEXT,
    "snapshot_date" TIMESTAMP(3),
    "shares_snapshot" DECIMAL(18,8),
    "price_per_share" DECIMAL(18,8),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yield_differential_pending" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_dividend_id" TEXT,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "shares_snapshot" DECIMAL(18,8) NOT NULL,
    "pending_amount" DECIMAL(18,8) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "realized_at" TIMESTAMP(3),
    "realized_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yield_differential_pending_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_forum_posts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" VARCHAR(280) NOT NULL,
    "content_raw" TEXT,
    "ticker" TEXT,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_count" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "moderation_status" "PostModerationStatus" NOT NULL DEFAULT 'PUBLISHED',
    "flagged_by" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_forum_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_likes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forum_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glossary_interactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "term_slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "glossary_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_words" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "moderator_id" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_rules" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_moderation_rules" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_moderation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_sponsors" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "logo" TEXT,
    "banners" JSONB NOT NULL DEFAULT '{}',
    "active_liga_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "affiliate_type" VARCHAR(30) NOT NULL DEFAULT 'USER',
    "commission_percentage" DECIMAL(5,4) NOT NULL DEFAULT 0.00,
    "bank_data" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_transactions" (
    "id" TEXT NOT NULL,
    "affiliate_code_id" TEXT NOT NULL,
    "referred_user_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "gateway_transaction_id" VARCHAR(255),
    "transaction_type" VARCHAR(30) NOT NULL DEFAULT 'SIGNUP',
    "amount" DECIMAL(14,8) NOT NULL DEFAULT 0,
    "commission_percentage_at_time" DECIMAL(5,4),
    "status" "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nsm_daily_records" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "filled_orders" INTEGER NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 500,
    "percentage" DOUBLE PRECISION NOT NULL,
    "alert_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nsm_daily_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_matrix_configs" (
    "id" TEXT NOT NULL,
    "financeira_critica" DECIMAL(5,3) NOT NULL DEFAULT 0.05,
    "esportiva_majoritaria" DECIMAL(5,3) NOT NULL DEFAULT 0.03,
    "mercado_ativos" DECIMAL(5,3) NOT NULL DEFAULT 0.02,
    "integridade_saude" DECIMAL(5,3) NOT NULL DEFAULT 0.015,
    "institucional" DECIMAL(5,3) NOT NULL DEFAULT 0.01,
    "esportiva_menor" DECIMAL(5,3) NOT NULL DEFAULT 0.005,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "impact_matrix_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_session_logs" (
    "id" TEXT NOT NULL,
    "from_session" TEXT NOT NULL,
    "to_session" TEXT NOT NULL,
    "transition_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_users" (
    "id" TEXT NOT NULL,
    "club_ticker" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_access_logs" (
    "id" TEXT NOT NULL,
    "club_user_id" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "age_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cpf_hash" VARCHAR(64) NOT NULL,
    "is_adult" BOOLEAN NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "age_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_reset_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "previous_balance" DECIMAL(18,8) NOT NULL,
    "new_balance" DECIMAL(18,8) NOT NULL,
    "plan_type" "PlanType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_reset_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_hash_key" ON "users"("cpf_hash");

-- CreateIndex
CREATE UNIQUE INDEX "assets_ticker_key" ON "assets"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "assets_club_slug_key" ON "assets"("club_slug");

-- CreateIndex
CREATE UNIQUE INDEX "asset_aliases_alias_key" ON "asset_aliases"("alias");

-- CreateIndex
CREATE INDEX "asset_aliases_alias_is_active_idx" ON "asset_aliases"("alias", "is_active");

-- CreateIndex
CREATE INDEX "asset_aliases_asset_ticker_idx" ON "asset_aliases"("asset_ticker");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_asset_id_idx" ON "orders"("asset_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_user_id_status_idx" ON "orders"("user_id", "status");

-- CreateIndex
CREATE INDEX "orders_group_id_idx" ON "orders"("group_id");

-- CreateIndex
CREATE INDEX "positions_user_id_idx" ON "positions"("user_id");

-- CreateIndex
CREATE INDEX "positions_user_id_status_idx" ON "positions"("user_id", "status");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_asset_id_idx" ON "transactions"("asset_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_created_at_idx" ON "transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "price_history_asset_id_idx" ON "price_history"("asset_id");

-- CreateIndex
CREATE INDEX "price_history_asset_id_timestamp_idx" ON "price_history"("asset_id", "timestamp");

-- CreateIndex
CREATE INDEX "price_history_asset_id_source_idx" ON "price_history"("asset_id", "source");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_expires_at_status_idx" ON "subscriptions"("expires_at", "status");

-- CreateIndex
CREATE INDEX "subscriptions_cancellation_lock_expires_at_status_idx" ON "subscriptions"("cancellation_lock_expires_at", "status");

-- CreateIndex
CREATE INDEX "subscriptions_forced_liquidation_at_status_forced_liquidati_idx" ON "subscriptions"("forced_liquidation_at", "status", "forced_liquidation_executed_at");

-- CreateIndex
CREATE INDEX "subscriptions_renewal_reminder_sent_at_status_idx" ON "subscriptions"("renewal_reminder_sent_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_transaction_id_key" ON "payments"("gateway_transaction_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_gateway_transaction_id_idx" ON "payments"("gateway_transaction_id");

-- CreateIndex
CREATE INDEX "dunning_attempts_scheduled_at_status_idx" ON "dunning_attempts"("scheduled_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dunning_attempts_subscription_id_attempt_number_key" ON "dunning_attempts"("subscription_id", "attempt_number");

-- CreateIndex
CREATE INDEX "webhook_audit_logs_gateway_status_idx" ON "webhook_audit_logs"("gateway", "status");

-- CreateIndex
CREATE INDEX "webhook_audit_logs_processed_at_idx" ON "webhook_audit_logs"("processed_at");

-- CreateIndex
CREATE INDEX "webhook_audit_logs_transaction_id_idx" ON "webhook_audit_logs"("transaction_id");

-- CreateIndex
CREATE INDEX "news_published_at_idx" ON "news"("published_at");

-- CreateIndex
CREATE INDEX "news_is_published_idx" ON "news"("is_published");

-- CreateIndex
CREATE INDEX "news_is_archived_idx" ON "news"("is_archived");

-- CreateIndex
CREATE UNIQUE INDEX "news_source_whitelist_domain_key" ON "news_source_whitelist"("domain");

-- CreateIndex
CREATE INDEX "sponsor_banners_is_active_idx" ON "sponsor_banners"("is_active");

-- CreateIndex
CREATE INDEX "sponsor_banners_position_is_active_idx" ON "sponsor_banners"("position", "is_active");

-- CreateIndex
CREATE INDEX "sponsored_leagues_status_idx" ON "sponsored_leagues"("status");

-- CreateIndex
CREATE INDEX "sponsored_leagues_start_date_idx" ON "sponsored_leagues"("start_date");

-- CreateIndex
CREATE INDEX "sponsored_league_members_sponsored_league_id_score_idx" ON "sponsored_league_members"("sponsored_league_id", "score" DESC);

-- CreateIndex
CREATE INDEX "sponsored_league_members_user_id_idx" ON "sponsored_league_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sponsored_league_members_sponsored_league_id_user_id_key" ON "sponsored_league_members"("sponsored_league_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rss_feeds_url_key" ON "rss_feeds"("url");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_slug_key" ON "leagues"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_invite_code_key" ON "leagues"("invite_code");

-- CreateIndex
CREATE INDEX "leagues_created_by_idx" ON "leagues"("created_by");

-- CreateIndex
CREATE INDEX "leagues_type_status_idx" ON "leagues"("type", "status");

-- CreateIndex
CREATE INDEX "league_members_league_id_score_idx" ON "league_members"("league_id", "score" DESC);

-- CreateIndex
CREATE INDEX "league_members_user_id_idx" ON "league_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_members_league_id_user_id_key" ON "league_members"("league_id", "user_id");

-- CreateIndex
CREATE INDEX "league_score_events_league_id_user_id_idx" ON "league_score_events"("league_id", "user_id");

-- CreateIndex
CREATE INDEX "league_score_events_league_id_period_idx" ON "league_score_events"("league_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "league_score_events_league_id_user_id_event_type_period_key" ON "league_score_events"("league_id", "user_id", "event_type", "period");

-- CreateIndex
CREATE INDEX "league_daily_ranks_league_id_date_idx" ON "league_daily_ranks"("league_id", "date");

-- CreateIndex
CREATE INDEX "league_daily_ranks_user_id_idx" ON "league_daily_ranks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_daily_ranks_league_id_user_id_date_key" ON "league_daily_ranks"("league_id", "user_id", "date");

-- CreateIndex
CREATE INDEX "league_trophies_user_id_awarded_at_idx" ON "league_trophies"("user_id", "awarded_at" DESC);

-- CreateIndex
CREATE INDEX "league_trophies_league_id_idx" ON "league_trophies"("league_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_trophies_user_id_league_id_trophy_type_key" ON "league_trophies"("user_id", "league_id", "trophy_type");

-- CreateIndex
CREATE INDEX "forum_posts_league_id_idx" ON "forum_posts"("league_id");

-- CreateIndex
CREATE INDEX "forum_posts_user_id_idx" ON "forum_posts"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_type_idx" ON "notifications"("user_id", "type");

-- CreateIndex
CREATE INDEX "notifications_expires_at_idx" ON "notifications"("expires_at");

-- CreateIndex
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_notification_type_key" ON "notification_preferences"("user_id", "notification_type");

-- CreateIndex
CREATE INDEX "consents_user_id_idx" ON "consents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "consents_user_id_purpose_key" ON "consents"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "data_access_logs_user_id_created_at_idx" ON "data_access_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "data_access_logs_created_at_idx" ON "data_access_logs"("created_at");

-- CreateIndex
CREATE INDEX "admin_market_actions_admin_id_idx" ON "admin_market_actions"("admin_id");

-- CreateIndex
CREATE INDEX "admin_market_actions_action_idx" ON "admin_market_actions"("action");

-- CreateIndex
CREATE INDEX "admin_market_actions_created_at_idx" ON "admin_market_actions"("created_at");

-- CreateIndex
CREATE INDEX "data_export_jobs_user_id_created_at_idx" ON "data_export_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "dividends_user_id_idx" ON "dividends"("user_id");

-- CreateIndex
CREATE INDEX "dividends_ticker_idx" ON "dividends"("ticker");

-- CreateIndex
CREATE INDEX "dividends_processed_month_idx" ON "dividends"("processed_month");

-- CreateIndex
CREATE INDEX "dividends_status_scheduled_for_idx" ON "dividends"("status", "scheduled_for");

-- CreateIndex
CREATE INDEX "dividends_status_created_at_idx" ON "dividends"("status", "created_at");

-- CreateIndex
CREATE INDEX "dividends_user_id_type_idx" ON "dividends"("user_id", "type");

-- CreateIndex
CREATE INDEX "yield_differential_pending_user_id_status_idx" ON "yield_differential_pending"("user_id", "status");

-- CreateIndex
CREATE INDEX "yield_differential_pending_user_id_ticker_idx" ON "yield_differential_pending"("user_id", "ticker");

-- CreateIndex
CREATE UNIQUE INDEX "yield_differential_pending_user_id_source_dividend_id_key" ON "yield_differential_pending"("user_id", "source_dividend_id");

-- CreateIndex
CREATE INDEX "global_forum_posts_user_id_idx" ON "global_forum_posts"("user_id");

-- CreateIndex
CREATE INDEX "global_forum_posts_ticker_idx" ON "global_forum_posts"("ticker");

-- CreateIndex
CREATE INDEX "global_forum_posts_created_at_idx" ON "global_forum_posts"("created_at");

-- CreateIndex
CREATE INDEX "global_forum_posts_is_deleted_updated_at_idx" ON "global_forum_posts"("is_deleted", "updated_at");

-- CreateIndex
CREATE INDEX "global_forum_posts_moderation_status_created_at_idx" ON "global_forum_posts"("moderation_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "forum_likes_post_id_user_id_key" ON "forum_likes"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "glossary_interactions_user_id_created_at_idx" ON "glossary_interactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "glossary_interactions_term_slug_idx" ON "glossary_interactions"("term_slug");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_words_word_key" ON "blocked_words"("word");

-- CreateIndex
CREATE INDEX "moderation_actions_post_id_idx" ON "moderation_actions"("post_id");

-- CreateIndex
CREATE INDEX "moderation_actions_moderator_id_idx" ON "moderation_actions"("moderator_id");

-- CreateIndex
CREATE INDEX "moderation_actions_created_at_idx" ON "moderation_actions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_moderation_rules_name_key" ON "content_moderation_rules"("name");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_codes_user_id_key" ON "affiliate_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_codes_code_key" ON "affiliate_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_transactions_gateway_transaction_id_key" ON "affiliate_transactions"("gateway_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "nsm_daily_records_date_key" ON "nsm_daily_records"("date");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_active_idx" ON "push_subscriptions"("user_id", "active");

-- CreateIndex
CREATE INDEX "market_session_logs_transition_at_idx" ON "market_session_logs"("transition_at");

-- CreateIndex
CREATE UNIQUE INDEX "club_users_email_key" ON "club_users"("email");

-- CreateIndex
CREATE INDEX "club_users_club_ticker_idx" ON "club_users"("club_ticker");

-- CreateIndex
CREATE INDEX "club_users_email_idx" ON "club_users"("email");

-- CreateIndex
CREATE INDEX "club_access_logs_club_user_id_idx" ON "club_access_logs"("club_user_id");

-- CreateIndex
CREATE INDEX "club_access_logs_created_at_idx" ON "club_access_logs"("created_at");

-- CreateIndex
CREATE INDEX "age_verifications_user_id_idx" ON "age_verifications"("user_id");

-- CreateIndex
CREATE INDEX "age_verifications_cpf_hash_idx" ON "age_verifications"("cpf_hash");

-- CreateIndex
CREATE INDEX "balance_reset_logs_user_id_idx" ON "balance_reset_logs"("user_id");

-- CreateIndex
CREATE INDEX "balance_reset_logs_admin_id_idx" ON "balance_reset_logs"("admin_id");

-- CreateIndex
CREATE INDEX "balance_reset_logs_created_at_idx" ON "balance_reset_logs"("created_at");

-- AddForeignKey
ALTER TABLE "asset_aliases" ADD CONSTRAINT "asset_aliases_asset_ticker_fkey" FOREIGN KEY ("asset_ticker") REFERENCES "assets"("ticker") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_attempts" ADD CONSTRAINT "dunning_attempts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_banners" ADD CONSTRAINT "sponsor_banners_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_league_members" ADD CONSTRAINT "sponsored_league_members_sponsored_league_id_fkey" FOREIGN KEY ("sponsored_league_id") REFERENCES "sponsored_leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "sponsor_banners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_score_events" ADD CONSTRAINT "league_score_events_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_score_events" ADD CONSTRAINT "league_score_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_daily_ranks" ADD CONSTRAINT "league_daily_ranks_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_daily_ranks" ADD CONSTRAINT "league_daily_ranks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_trophies" ADD CONSTRAINT "league_trophies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_trophies" ADD CONSTRAINT "league_trophies_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_access_logs" ADD CONSTRAINT "data_access_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_market_actions" ADD CONSTRAINT "admin_market_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_market_actions" ADD CONSTRAINT "admin_market_actions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_jobs" ADD CONSTRAINT "data_export_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yield_differential_pending" ADD CONSTRAINT "yield_differential_pending_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yield_differential_pending" ADD CONSTRAINT "yield_differential_pending_source_dividend_id_fkey" FOREIGN KEY ("source_dividend_id") REFERENCES "dividends"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_forum_posts" ADD CONSTRAINT "global_forum_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_likes" ADD CONSTRAINT "forum_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "global_forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_likes" ADD CONSTRAINT "forum_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "glossary_interactions" ADD CONSTRAINT "glossary_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "global_forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_codes" ADD CONSTRAINT "affiliate_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_transactions" ADD CONSTRAINT "affiliate_transactions_affiliate_code_id_fkey" FOREIGN KEY ("affiliate_code_id") REFERENCES "affiliate_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_transactions" ADD CONSTRAINT "affiliate_transactions_referred_user_id_fkey" FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_users" ADD CONSTRAINT "club_users_club_ticker_fkey" FOREIGN KEY ("club_ticker") REFERENCES "assets"("ticker") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_users" ADD CONSTRAINT "club_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_access_logs" ADD CONSTRAINT "club_access_logs_club_user_id_fkey" FOREIGN KEY ("club_user_id") REFERENCES "club_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "age_verifications" ADD CONSTRAINT "age_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_reset_logs" ADD CONSTRAINT "balance_reset_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_reset_logs" ADD CONSTRAINT "balance_reset_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
