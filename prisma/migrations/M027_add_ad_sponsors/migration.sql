-- M027: Cria tabela de patrocinadores publicitários (banners por posição)
-- Fonte: module-24/TASK-3
-- Separado de "sponsors" (patrocínio financeiro de ligas)

CREATE TABLE IF NOT EXISTS "ad_sponsors" (
  "id"             TEXT NOT NULL,
  "name"           VARCHAR(100) NOT NULL,
  "logo"           TEXT,
  "banners"        JSONB NOT NULL DEFAULT '{}',
  "active_liga_id" TEXT,
  "starts_at"      TIMESTAMPTZ NOT NULL,
  "ends_at"        TIMESTAMPTZ NOT NULL,
  "active"         BOOLEAN NOT NULL DEFAULT false,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "ad_sponsors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ad_sponsors_active_idx" ON "ad_sponsors" ("active", "ends_at");
