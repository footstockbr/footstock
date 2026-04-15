-- M028: Adiciona prizes (JSON), sponsor_url ao sponsored_leagues
--       e cria tabela sponsored_league_members para participação de usuários

-- Novos campos na tabela sponsored_leagues
ALTER TABLE "sponsored_leagues"
  ADD COLUMN "prizes" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "sponsor_url" TEXT;

-- Migrar prize existente para prizes array (backfill)
UPDATE "sponsored_leagues"
SET "prizes" = jsonb_build_array(
  jsonb_build_object('position', 1, 'label', '1o Lugar', 'description', prize)
)
WHERE prize IS NOT NULL AND prize != 'FS$0' AND "prizes" = '[]'::jsonb;

-- Tabela de membros de ligas patrocinadas
CREATE TABLE "sponsored_league_members" (
  "id"                   TEXT NOT NULL,
  "sponsored_league_id"  TEXT NOT NULL,
  "user_id"              TEXT NOT NULL,
  "joined_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "score"                DECIMAL(18,2) NOT NULL DEFAULT 0,
  "rank"                 INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "sponsored_league_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sponsored_league_members_sponsored_league_id_fkey"
    FOREIGN KEY ("sponsored_league_id") REFERENCES "sponsored_leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sponsored_league_members_sponsored_league_id_user_id_key"
    UNIQUE ("sponsored_league_id", "user_id")
);

CREATE INDEX "sponsored_league_members_sponsored_league_id_score_idx"
  ON "sponsored_league_members"("sponsored_league_id", "score" DESC);

CREATE INDEX "sponsored_league_members_user_id_idx"
  ON "sponsored_league_members"("user_id");
