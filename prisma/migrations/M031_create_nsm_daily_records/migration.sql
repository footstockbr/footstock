-- M031: Create NSM (North Star Metric) daily records table
-- Tracks daily filled order counts for the North Star Metric dashboard.

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

CREATE UNIQUE INDEX "nsm_daily_records_date_key" ON "nsm_daily_records"("date");
