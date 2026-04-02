-- M033: Add affiliate tables (affiliate_codes + affiliate_transactions)
-- Rastreabilidade: INT-084, US-036, TASK-3/ST001

-- Enum AffiliateStatus
CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID');

-- affiliate_codes: código de afiliado por influenciador
CREATE TABLE "affiliate_codes" (
    "id"                    TEXT NOT NULL,
    "user_id"               TEXT NOT NULL,
    "code"                  VARCHAR(50) NOT NULL,
    "affiliate_type"        VARCHAR(30) NOT NULL DEFAULT 'INFLUENCER',
    "commission_percentage" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "bank_data"             JSONB,
    "active"                BOOLEAN NOT NULL DEFAULT true,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "affiliate_codes_user_id_key" ON "affiliate_codes"("user_id");
CREATE UNIQUE INDEX "affiliate_codes_code_key" ON "affiliate_codes"("code");

ALTER TABLE "affiliate_codes"
    ADD CONSTRAINT "affiliate_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- affiliate_transactions: conversões rastreadas por código de afiliado
CREATE TABLE "affiliate_transactions" (
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

CREATE INDEX "affiliate_transactions_affiliate_code_id_idx" ON "affiliate_transactions"("affiliate_code_id");
CREATE INDEX "affiliate_transactions_referred_user_id_idx"  ON "affiliate_transactions"("referred_user_id");

ALTER TABLE "affiliate_transactions"
    ADD CONSTRAINT "affiliate_transactions_affiliate_code_id_fkey"
    FOREIGN KEY ("affiliate_code_id") REFERENCES "affiliate_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_transactions"
    ADD CONSTRAINT "affiliate_transactions_referred_user_id_fkey"
    FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON UPDATE CASCADE;
