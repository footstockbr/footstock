-- M017_create_admin_market_actions

CREATE TABLE "admin_market_actions" (
  "id"             TEXT NOT NULL,
  "admin_id"       TEXT NOT NULL,
  "asset_id"       TEXT NOT NULL,
  "action"         TEXT NOT NULL,
  "reason"         TEXT NOT NULL,
  "previous_price" DECIMAL(18,8),
  "new_price"      DECIMAL(18,8),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_market_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_market_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_market_actions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "admin_market_actions_admin_id_idx" ON "admin_market_actions"("admin_id");
CREATE INDEX "admin_market_actions_asset_id_idx" ON "admin_market_actions"("asset_id");
CREATE INDEX "admin_market_actions_created_at_idx" ON "admin_market_actions"("created_at");

-- down: DROP TABLE "admin_market_actions";
