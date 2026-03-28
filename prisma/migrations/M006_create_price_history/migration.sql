-- M006_create_price_history

CREATE TABLE "price_history" (
  "id"           TEXT NOT NULL,
  "asset_id"     TEXT NOT NULL,
  "timestamp"    TIMESTAMP(3) NOT NULL,
  "open"         DECIMAL(18,8) NOT NULL,
  "high"         DECIMAL(18,8) NOT NULL,
  "low"          DECIMAL(18,8) NOT NULL,
  "close"        DECIMAL(18,8) NOT NULL,
  "volume"       BIGINT NOT NULL DEFAULT 0,
  "session_type" "SessionType" NOT NULL,
  CONSTRAINT "price_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "price_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "price_history_asset_id_idx" ON "price_history"("asset_id");
CREATE INDEX "price_history_asset_id_timestamp_idx" ON "price_history"("asset_id", "timestamp");

-- down: DROP TABLE "price_history";
