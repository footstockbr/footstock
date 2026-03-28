-- M008_create_payments

CREATE TABLE "payments" (
  "id"              TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "amount"          DECIMAL(18,2) NOT NULL,
  "currency"        TEXT NOT NULL DEFAULT 'BRL',
  "status"          "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "gateway_id"      TEXT,
  "gateway_response" JSONB,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- down: DROP TABLE "payments";
