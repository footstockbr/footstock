-- M004_create_positions

CREATE TABLE "positions" (
  "id"            TEXT NOT NULL,
  "user_id"       TEXT NOT NULL,
  "asset_id"      TEXT NOT NULL,
  "quantity"      INTEGER NOT NULL,
  "avg_price"     DECIMAL(18,8) NOT NULL,
  "total_invested" DECIMAL(18,2) NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "positions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "positions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "positions_user_id_asset_id_key" ON "positions"("user_id", "asset_id");
CREATE INDEX "positions_user_id_idx" ON "positions"("user_id");

-- down: DROP TABLE "positions";
