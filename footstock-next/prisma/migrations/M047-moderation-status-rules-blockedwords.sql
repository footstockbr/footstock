-- M047: Add moderation_status enum, column, blocked_words, moderation_rules, content_moderation_rules
-- Fixes 500 on GET /api/v1/admin/moderation — columns/tables referenced in code but never migrated

-- 1. Create PostModerationStatus enum
DO $$ BEGIN
  CREATE TYPE "PostModerationStatus" AS ENUM ('PUBLISHED', 'FLAGGED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add missing columns to global_forum_posts
ALTER TABLE "global_forum_posts"
  ADD COLUMN IF NOT EXISTS "moderation_status" "PostModerationStatus" NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "global_forum_posts"
  ADD COLUMN IF NOT EXISTS "content_raw" TEXT;
ALTER TABLE "global_forum_posts"
  ADD COLUMN IF NOT EXISTS "flagged_by" JSONB NOT NULL DEFAULT '[]';

-- Backfill: posts already flagged get FLAGGED status
UPDATE "global_forum_posts"
  SET "moderation_status" = 'FLAGGED'
  WHERE "is_flagged" = TRUE AND "is_deleted" = FALSE;

-- Index for status+createdAt (declared in schema)
CREATE INDEX IF NOT EXISTS "global_forum_posts_moderation_status_created_at_idx"
  ON "global_forum_posts"("moderation_status", "created_at");

-- 3. Create blocked_words table
CREATE TABLE IF NOT EXISTS "blocked_words" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "word" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "blocked_words_word_key" ON "blocked_words"("word");

-- 4. Create moderation_rules table (behavioral rules — Redis fallback)
CREATE TABLE IF NOT EXISTS "moderation_rules" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "config" JSONB,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create content_moderation_rules table (regex-based content rules)
CREATE TABLE IF NOT EXISTS "content_moderation_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" VARCHAR(50) NOT NULL,
  "description" TEXT NOT NULL,
  "pattern" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_moderation_rules_name_key" ON "content_moderation_rules"("name");

-- 6. Seed 5 default content moderation rules (all disabled)
INSERT INTO "content_moderation_rules" ("id", "name", "description", "pattern", "is_enabled")
VALUES
  ('cmr-001', 'new_user_with_links', 'Flagga usuarios novos (<7 dias) postando links externos', 'https?://[^\s]+', FALSE),
  ('cmr-002', 'spam_frequency', 'Detecta posts duplicados (3+ vezes em 1 hora)', '.*', FALSE),
  ('cmr-003', 'false_promises', 'Detecta promessas de retorno garantido (regex)', '\b(garant|lucro\s+certo|retorno\s+fixo|rendimento\s+garantido)\b', FALSE),
  ('cmr-004', 'residual_pii', 'Detecta PII residual apos sanitizacao', '\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b', FALSE),
  ('cmr-005', 'foreign_spam', 'Detecta spam em idiomas estrangeiros', '\b(click here|free money|act now|limited offer)\b', FALSE)
ON CONFLICT ("name") DO NOTHING;

-- 7. Seed 5 default behavioral moderation rules (all disabled)
INSERT INTO "moderation_rules" ("id", "name", "description", "enabled", "config")
VALUES
  (1, 'DELETE_3_FLAGS', 'Auto-deletar posts com 3+ flags', FALSE, '{"threshold": 3}'),
  (2, 'BAN_IP_BURST', 'Banir apos 5 posts em 1 minuto', FALSE, '{"postsPerMinute": 5}'),
  (3, 'HIDE_SUSPENDED', 'Ocultar posts de usuarios suspensos', FALSE, NULL),
  (4, 'NEW_USER_RESTRICT', 'Restringir contas novas (<7 dias) em tickers sensiveis', FALSE, '{"daysThreshold": 7}'),
  (5, 'HOURLY_LIMIT', 'Limite de 5 posts por hora por usuario', FALSE, '{"limit": 5}')
ON CONFLICT ("id") DO NOTHING;
