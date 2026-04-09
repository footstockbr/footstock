-- Add moderation history table
CREATE TABLE IF NOT EXISTS "moderation_actions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "post_id" TEXT NOT NULL,
  "moderator_id" TEXT NOT NULL,
  "action" VARCHAR(50) NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_actions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "global_forum_posts" ("id") ON DELETE CASCADE,
  CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users" ("id")
);

CREATE INDEX "moderation_actions_post_id_idx" ON "moderation_actions"("post_id");
CREATE INDEX "moderation_actions_moderator_id_idx" ON "moderation_actions"("moderator_id");
CREATE INDEX "moderation_actions_created_at_idx" ON "moderation_actions"("created_at");
