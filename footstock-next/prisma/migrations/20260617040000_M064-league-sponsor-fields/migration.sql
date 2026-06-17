-- M064: campos de patrocinio absorvidos por leagues na fusao Pro/Patrocinadas (item 22).
-- Aditiva e idempotente: pode rodar via `prisma migrate deploy` mesmo apos aplicacao manual.

ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "company" TEXT;
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "sponsor_url" TEXT;
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "min_plan" TEXT;
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "border_color" TEXT;
ALTER TABLE "leagues" ADD COLUMN IF NOT EXISTS "sponsor_prizes" JSONB;
