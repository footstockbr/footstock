-- M062: tabela forum_comments — comentarios por post no forum global (item 24).
-- Aditiva e idempotente: pode rodar via `prisma migrate deploy` mesmo apos aplicacao manual.

CREATE TABLE IF NOT EXISTS "forum_comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" VARCHAR(280) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "forum_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "forum_comments_post_id_created_at_idx" ON "forum_comments"("post_id", "created_at");
CREATE INDEX IF NOT EXISTS "forum_comments_user_id_idx" ON "forum_comments"("user_id");

DO $$ BEGIN
    ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "global_forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
