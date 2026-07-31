-- G-IA: News LLM providers + singleton config (SUPER_ADMIN)
-- Tokens em repouso (ciphertext). Seed idempotente Kimi + Anthropic.
-- Compatibilidade: seed sem token usa env KIMI_API_KEY / ANTHROPIC_API_KEY no runtime.

CREATE TABLE IF NOT EXISTS "news_llm_providers" (
  "id"                 TEXT NOT NULL,
  "slug"               TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "enabled"            BOOLEAN NOT NULL DEFAULT true,
  "token_ciphertext"   TEXT,
  "token_key_version"  INTEGER NOT NULL DEFAULT 1,
  "deleted_at"         TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"         TEXT,
  CONSTRAINT "news_llm_providers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "news_llm_providers_slug_key"
  ON "news_llm_providers"("slug");

CREATE INDEX IF NOT EXISTS "news_llm_providers_deleted_at_idx"
  ON "news_llm_providers"("deleted_at");

CREATE TABLE IF NOT EXISTS "news_llm_config" (
  "id"                  TEXT NOT NULL DEFAULT 'default',
  "llm_enabled"         BOOLEAN NOT NULL DEFAULT true,
  "active_provider_id"  TEXT,
  "config_version"      INTEGER NOT NULL DEFAULT 1,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"          TEXT,
  CONSTRAINT "news_llm_config_pkey" PRIMARY KEY ("id")
);

-- Seed nativos (sem token; runtime le env se ciphertext NULL)
INSERT INTO "news_llm_providers" (
  "id", "slug", "name", "enabled", "token_ciphertext", "token_key_version", "deleted_at", "created_at", "updated_at", "created_by"
) VALUES
  ('seed-kimi', 'kimi', 'Kimi', true, NULL, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system'),
  ('seed-anthropic', 'anthropic', 'Anthropic', true, NULL, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system')
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "news_llm_config" (
  "id", "llm_enabled", "active_provider_id", "config_version", "updated_at", "updated_by"
) VALUES (
  'default', true, 'seed-kimi', 1, CURRENT_TIMESTAMP, 'system'
)
ON CONFLICT ("id") DO NOTHING;
