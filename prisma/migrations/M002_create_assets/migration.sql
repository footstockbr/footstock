-- M002_create_assets

CREATE TABLE "assets" (
  "id"             TEXT NOT NULL,
  "ticker"         TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "club_slug"      TEXT NOT NULL,
  "division"       "Division" NOT NULL,
  "cluster"        TEXT NOT NULL,
  "current_price"  DECIMAL(18,8) NOT NULL,
  "open_price"     DECIMAL(18,8) NOT NULL,
  "close_price"    DECIMAL(18,8) NOT NULL,
  "volume"         BIGINT NOT NULL DEFAULT 0,
  "market_cap"     DECIMAL(18,2) NOT NULL,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "color_primary"  TEXT NOT NULL,
  "color_secondary" TEXT NOT NULL,
  "logo_url"       TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assets_ticker_key" ON "assets"("ticker");
CREATE UNIQUE INDEX "assets_club_slug_key" ON "assets"("club_slug");

-- down: DROP TABLE "assets";
