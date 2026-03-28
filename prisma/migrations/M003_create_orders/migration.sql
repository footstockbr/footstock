-- M003_create_orders

CREATE TABLE "orders" (
  "id"             TEXT NOT NULL,
  "user_id"        TEXT NOT NULL,
  "asset_id"       TEXT NOT NULL,
  "type"           "OrderType" NOT NULL,
  "side"           "OrderSide" NOT NULL,
  "status"         "OrderStatus" NOT NULL DEFAULT 'OPEN',
  "quantity"       INTEGER NOT NULL,
  "price"          DECIMAL(18,8),
  "executed_price" DECIMAL(18,8),
  "fee"            DECIMAL(18,8) NOT NULL DEFAULT 0,
  "expires_at"     TIMESTAMP(3),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "orders_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");
CREATE INDEX "orders_asset_id_idx" ON "orders"("asset_id");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_user_id_status_idx" ON "orders"("user_id", "status");

-- down: DROP TABLE "orders";
