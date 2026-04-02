-- module-18 auditoria: GlossaryInteraction + ForumLike User relation
-- Fonte: module-18/TASK-6/ST002, TASK-7/ST004

-- ─── glossary_interactions ──────────────────────────────────────────────────
CREATE TABLE "glossary_interactions" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "term_slug"  TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "glossary_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "glossary_interactions_user_id_created_at_idx"
  ON "glossary_interactions"("user_id", "created_at");

CREATE INDEX "glossary_interactions_term_slug_idx"
  ON "glossary_interactions"("term_slug");

ALTER TABLE "glossary_interactions"
  ADD CONSTRAINT "glossary_interactions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── forum_likes: adicionar FK para users ───────────────────────────────────
ALTER TABLE "forum_likes"
  ADD CONSTRAINT "forum_likes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
