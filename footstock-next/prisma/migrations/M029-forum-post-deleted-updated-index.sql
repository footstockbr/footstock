-- M029: Indice composto para cron de limpeza de posts reprovados
-- Otimiza query: WHERE is_deleted = true AND updated_at < ?

CREATE INDEX "global_forum_posts_is_deleted_updated_at_idx"
  ON "global_forum_posts"("is_deleted", "updated_at");
