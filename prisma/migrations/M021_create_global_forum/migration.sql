-- module-18: Forum Global & Glossário
-- Fonte: module-18/TASK-1/ST001

-- ─── global_forum_posts ───────────────────────────────────────────────────────
CREATE TABLE "global_forum_posts" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "content"    VARCHAR(280) NOT NULL,
  "ticker"     TEXT,
  "is_flagged" BOOLEAN NOT NULL DEFAULT false,
  "flag_count" INTEGER NOT NULL DEFAULT 0,
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "global_forum_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "global_forum_posts_user_id_idx"    ON "global_forum_posts"("user_id");
CREATE INDEX "global_forum_posts_ticker_idx"      ON "global_forum_posts"("ticker");
CREATE INDEX "global_forum_posts_created_at_idx"  ON "global_forum_posts"("created_at");

ALTER TABLE "global_forum_posts"
  ADD CONSTRAINT "global_forum_posts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── forum_likes ─────────────────────────────────────────────────────────────
CREATE TABLE "forum_likes" (
  "id"         TEXT NOT NULL,
  "post_id"    TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_likes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "forum_likes"
  ADD CONSTRAINT "forum_likes_post_id_user_id_key"
  UNIQUE ("post_id", "user_id");

ALTER TABLE "forum_likes"
  ADD CONSTRAINT "forum_likes_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "global_forum_posts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── blocked_words ───────────────────────────────────────────────────────────
CREATE TABLE "blocked_words" (
  "id"         TEXT NOT NULL,
  "word"       TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blocked_words_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "blocked_words"
  ADD CONSTRAINT "blocked_words_word_key" UNIQUE ("word");
