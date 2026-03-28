-- M016_create_sponsors

CREATE TABLE "sponsors" (
  "id"                TEXT NOT NULL,
  "asset_id"          TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "logo_url"          TEXT,
  "contract_start"    TIMESTAMP(3) NOT NULL,
  "contract_end"      TIMESTAMP(3) NOT NULL,
  "sponsorship_value" DECIMAL(18,2) NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sponsors_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sponsors_asset_id_key" ON "sponsors"("asset_id");

-- down: DROP TABLE "sponsors";
