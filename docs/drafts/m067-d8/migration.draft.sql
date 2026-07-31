-- DRAFT D8 ONLY — DO NOT RUN OR MOVE INTO prisma/migrations BEFORE G8.
-- M067 final tightening: group_id/group_rank required after a real 24h window.
-- This file is intentionally outside every Prisma migration directory.
--
-- Required external gates:
--   G3, G4, G5, G6, G7 and G8 approved;
--   G12/G13 green at window start and end;
--   both Prisma schemas prepared in the same release;
--   clone/disposable-PostgreSQL rehearsal approved.

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

-- Fail closed before the first DDL statement. Any row aborts the transaction.
DO $d8_preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'news'
       AND column_name = 'group_id'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'news'
       AND column_name = 'group_rank'
  ) THEN
    RAISE EXCEPTION 'D8 blocked: M067 columns are missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "news"
     WHERE "group_id" IS NULL
        OR "group_id" = ''
        OR "group_rank" IS NULL
        OR "group_rank" NOT BETWEEN 0 AND 2
  ) THEN
    RAISE EXCEPTION 'D8 blocked: null/blank/invalid group fields exist';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "news"
     GROUP BY "group_id", "group_rank"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'D8 blocked: duplicate rank exists inside a group';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "news" AS member
     WHERE NOT EXISTS (
       SELECT 1
         FROM "news" AS anchor
        WHERE anchor."group_id" = member."group_id"
          AND anchor."id" = member."group_id"
          AND anchor."group_rank" = 0
     )
  ) THEN
    RAISE EXCEPTION 'D8 blocked: group without canonical anchor exists';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "news"
     WHERE "impact_dispatched_at" IS NULL
       AND "ticker" IS NOT NULL
       AND "created_at" < now() - interval '24 hours'
  ) THEN
    RAISE EXCEPTION 'D8 blocked: old impact dispatch is still pending';
  END IF;
END
$d8_preflight$;

-- Validate proof constraints first. PostgreSQL can then use the validated
-- constraints while applying SET NOT NULL, reducing the final lock duration.
ALTER TABLE "news"
  ADD CONSTRAINT "news_group_id_d8_nn"
  CHECK ("group_id" IS NOT NULL) NOT VALID;

ALTER TABLE "news"
  ADD CONSTRAINT "news_group_rank_d8_nn"
  CHECK ("group_rank" IS NOT NULL) NOT VALID;

ALTER TABLE "news" VALIDATE CONSTRAINT "news_group_id_d8_nn";
ALTER TABLE "news" VALIDATE CONSTRAINT "news_group_rank_d8_nn";

ALTER TABLE "news" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "news" ALTER COLUMN "group_rank" SET NOT NULL;

ALTER TABLE "news" DROP CONSTRAINT "news_group_id_d8_nn";
ALTER TABLE "news" DROP CONSTRAINT "news_group_rank_d8_nn";

COMMIT;
