-- M012_create_forum_posts

CREATE TABLE "forum_posts" (
  "id"        TEXT NOT NULL,
  "league_id" TEXT NOT NULL,
  "user_id"   TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "forum_posts_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "forum_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "forum_posts_league_id_idx" ON "forum_posts"("league_id");
CREATE INDEX "forum_posts_user_id_idx" ON "forum_posts"("user_id");

-- down: DROP TABLE "forum_posts";
