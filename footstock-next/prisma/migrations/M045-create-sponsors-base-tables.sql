-- ============================================================================
-- M045 — Create sponsors base tables
-- Objetivo: recriar a base ausente das tabelas de patrocinio para que M027+
-- possam rodar sem assumir tabelas inexistentes.
-- Regras:
-- - Todas as DDLs com IF NOT EXISTS
-- - Compativel com schema Prisma atual
-- - Seguro para reexecucao
-- ============================================================================

CREATE TABLE IF NOT EXISTS "sponsors" (
  "id"                 TEXT NOT NULL,
  "asset_id"           TEXT,
  "name"               TEXT NOT NULL,
  "logo_url"           TEXT,
  "contract_start"     TIMESTAMP(3) NOT NULL,
  "contract_end"       TIMESTAMP(3) NOT NULL,
  "sponsorship_value"  DECIMAL(18,2) NOT NULL,
  "is_active"          BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by"         TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- FK asset_id -> assets (adicionada separadamente para tolerar ordem de execucao)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sponsors_asset_id_fkey'
  ) THEN
    ALTER TABLE "sponsors"
      ADD CONSTRAINT "sponsors_asset_id_fkey"
      FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "sponsor_banners" (
  "id"           TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "company"      TEXT NOT NULL,
  "position"     TEXT NOT NULL DEFAULT 'home_top',
  "image_url"    TEXT,
  "link_url"     TEXT,
  "width"        INTEGER,
  "height"       INTEGER,
  "is_active"    BOOLEAN NOT NULL DEFAULT TRUE,
  "clicks"       INTEGER NOT NULL DEFAULT 0,
  "impressions"  INTEGER NOT NULL DEFAULT 0,
  "color"        TEXT NOT NULL DEFAULT '#00B1EA',
  "cta_text"     TEXT NOT NULL DEFAULT 'Saiba mais',
  "cta_color"    TEXT NOT NULL DEFAULT '#00B1EA',
  "sponsor_id"   TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sponsor_banners_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sponsor_banners_sponsor_id_fkey"
    FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "sponsored_leagues" (
  "id"                TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "company"           TEXT NOT NULL,
  "prize"             TEXT NOT NULL DEFAULT 'FS$0',
  "prizes"            JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sponsor_url"       TEXT,
  "participants"      INTEGER NOT NULL DEFAULT 0,
  "max_participants"  INTEGER NOT NULL DEFAULT 50,
  "min_plan"          TEXT NOT NULL DEFAULT 'JOGADOR',
  "status"            TEXT NOT NULL DEFAULT 'AGENDADA',
  "border_color"      TEXT NOT NULL DEFAULT '#f59e0b',
  "start_date"        TIMESTAMP(3) NOT NULL,
  "end_date"          TIMESTAMP(3) NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sponsored_leagues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sponsored_league_members" (
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

-- Indices
CREATE INDEX IF NOT EXISTS "sponsor_banners_is_active_idx"
  ON "sponsor_banners" ("is_active");

CREATE INDEX IF NOT EXISTS "sponsor_banners_position_is_active_idx"
  ON "sponsor_banners" ("position", "is_active");

CREATE INDEX IF NOT EXISTS "sponsor_banners_sponsor_id_idx"
  ON "sponsor_banners" ("sponsor_id");

CREATE INDEX IF NOT EXISTS "sponsored_leagues_status_idx"
  ON "sponsored_leagues" ("status");

CREATE INDEX IF NOT EXISTS "sponsored_leagues_start_date_idx"
  ON "sponsored_leagues" ("start_date");

CREATE INDEX IF NOT EXISTS "sponsored_league_members_sponsored_league_id_score_idx"
  ON "sponsored_league_members" ("sponsored_league_id", "score" DESC);

CREATE INDEX IF NOT EXISTS "sponsored_league_members_user_id_idx"
  ON "sponsored_league_members" ("user_id");
