-- M063: coluna news.sentiment_classified_at — marca quando o classificador LLM definiu o
-- sentimento (item 15). NULL = ainda nao classificado (alvo do cron + backfill). Evita
-- reprocessar. Aditiva e idempotente: pode rodar via `prisma migrate deploy` mesmo apos
-- aplicacao manual.

ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "sentiment_classified_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "news_sentiment_classified_at_idx" ON "news"("sentiment_classified_at");
