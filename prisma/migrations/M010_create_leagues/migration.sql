-- M010_create_leagues

CREATE TABLE "leagues" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "owner_id"    TEXT NOT NULL,
  "type"        "LeagueType" NOT NULL,
  "season"      INTEGER NOT NULL,
  "max_members" INTEGER NOT NULL DEFAULT 20,
  "prize_pool"  DECIMAL(18,2) NOT NULL DEFAULT 0,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "invite_code" TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leagues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leagues_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "leagues_invite_code_key" ON "leagues"("invite_code");
CREATE INDEX "leagues_owner_id_idx" ON "leagues"("owner_id");

-- down: DROP TABLE "leagues";
