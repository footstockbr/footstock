-- M007_create_subscriptions

CREATE TABLE "subscriptions" (
  "id"                   TEXT NOT NULL,
  "user_id"              TEXT NOT NULL,
  "plan_type"            "PlanType" NOT NULL,
  "status"               "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "current_period_start" TIMESTAMP(3) NOT NULL,
  "current_period_end"   TIMESTAMP(3) NOT NULL,
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "gateway_id"           TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- down: DROP TABLE "subscriptions";
