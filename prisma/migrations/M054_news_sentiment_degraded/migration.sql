-- M054 — News sentiment degraded flag
-- Marca notícia publicada em modo degradado (LLM indisponível, heurística determinística).
-- Usado pela consulta de janela de sentimento para excluir notícias não classificadas pelo LLM.

ALTER TABLE "news"
  ADD COLUMN IF NOT EXISTS "sentiment_degraded" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "news_sentiment_degraded_idx"
  ON "news"("sentiment_degraded");
