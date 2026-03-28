-- M005_create_transactions

CREATE TABLE "transactions" (
  "id"           TEXT NOT NULL,
  "user_id"      TEXT NOT NULL,
  "asset_id"     TEXT NOT NULL,
  "order_id"     TEXT,
  "type"         "OrderType" NOT NULL,
  "side"         "OrderSide" NOT NULL,
  "quantity"     INTEGER NOT NULL,
  "price"        DECIMAL(18,8) NOT NULL,
  "fee"          DECIMAL(18,8) NOT NULL,
  "total_amount" DECIMAL(18,2) NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transactions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");
CREATE INDEX "transactions_asset_id_idx" ON "transactions"("asset_id");
CREATE INDEX "transactions_user_id_created_at_idx" ON "transactions"("user_id", "created_at");

-- down: DROP TABLE "transactions";
