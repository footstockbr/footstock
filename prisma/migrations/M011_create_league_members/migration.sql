-- M011_create_league_members

CREATE TABLE "league_members" (
  "id"        TEXT NOT NULL,
  "league_id" TEXT NOT NULL,
  "user_id"   TEXT NOT NULL,
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "score"     DECIMAL(18,2) NOT NULL DEFAULT 0,
  "rank"      INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "league_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "league_members_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "league_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "league_members_league_id_user_id_key" ON "league_members"("league_id", "user_id");
CREATE INDEX "league_members_league_id_idx" ON "league_members"("league_id");
CREATE INDEX "league_members_user_id_idx" ON "league_members"("user_id");

-- down: DROP TABLE "league_members";
