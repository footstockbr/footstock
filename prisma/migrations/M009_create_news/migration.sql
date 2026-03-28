-- M009_create_news

CREATE TABLE "news" (
  "id"           TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "content"      TEXT NOT NULL,
  "impact"       "ImpactCategory" NOT NULL,
  "sentiment"    "Sentiment" NOT NULL,
  "asset_ids"    TEXT[] NOT NULL DEFAULT '{}',
  "source"       TEXT,
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "news_published_at_idx" ON "news"("published_at");
CREATE INDEX "news_is_published_idx" ON "news"("is_published");

-- down: DROP TABLE "news";
