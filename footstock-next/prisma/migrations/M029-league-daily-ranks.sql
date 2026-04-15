-- M029: Adiciona tabela league_daily_ranks para snapshots diários de ranking
--       Alimenta o Pilar P4 (Consistency) do scoring de ligas

CREATE TABLE "league_daily_ranks" (
  "id"         TEXT NOT NULL,
  "league_id"  TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "date"       TIMESTAMP(3) NOT NULL,
  "rank"       INTEGER NOT NULL,
  "score"      DECIMAL(18, 2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "league_daily_ranks_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "league_daily_ranks_league_id_fkey"
    FOREIGN KEY ("league_id") REFERENCES "leagues"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "league_daily_ranks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "league_daily_ranks_league_id_user_id_date_key"
    UNIQUE ("league_id", "user_id", "date")
);

CREATE INDEX "league_daily_ranks_league_id_date_idx"
  ON "league_daily_ranks"("league_id", "date");

CREATE INDEX "league_daily_ranks_user_id_idx"
  ON "league_daily_ranks"("user_id");
