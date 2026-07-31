# M067 D8 draft — not authorized for production

Status: **draft only / blocked by G8**. This directory is deliberately outside both Prisma migration trees, so `prisma migrate deploy` cannot discover or apply it.

The SQL draft makes `news.group_id` and `news.group_rank` required only after the real 24-hour window has completed with G12/G13 green. It is not evidence that G8 or G9 passed.

## Preconditions before promoting this draft

- G3: 32 real provider HTTP responses recorded and H8 sustained; agent simulation does not count.
- G4: six E2E scenarios, including 44/45, green twice.
- G5: 13 checkpoints reviewed without technical blocker.
- G6: exact candidate SHA deployed, workflows green, flag off before D7.
- G7: controlled D7 approved, real multi-team groups observed, kill switch and rollback proved.
- G8: auditable `started_at`, `not_before = started_at + 24h`, `observed_at >= not_before`, and G12/G13 green at both boundaries.
- Read-only preflight returns no rows/anomalies and the disposable PostgreSQL rehearsal succeeds.
- The exact DDL, maintenance window, rollback owner and application rollout are approved.

Any non-zero/ambiguous preflight result blocks before mutation. Do not repair production data manually as part of D8.

## Dual Prisma schema change

The repository currently has two schema sources and both remain nullable until G8:

- `prisma/schema.prisma`
- `footstock-next/prisma/schema.prisma`

In the future D8 candidate, change both together:

```diff
-  groupId   String? @map("group_id")
-  groupRank Int?    @map("group_rank")
+  groupId   String  @map("group_id")
+  groupRank Int     @map("group_rank")
```

Do not make that change in the current blocked state. Validate and regenerate each client in the D8 branch only after the SQL has passed on a production-like clone.

## Promotion sequence after G8 approval

1. Freeze the observed SHA and save the final G12/G13 outputs.
2. Restore a recent production snapshot into an isolated disposable PostgreSQL instance.
3. Run every query in the D7 runbook and this SQL draft against the clone.
4. Copy the reviewed SQL into one new timestamped Prisma migration; never execute this draft path directly.
5. Apply the migration on the clone twice through the actual deployment procedure (the second deploy must be a no-op).
6. Change both Prisma schemas to required, validate/generate both clients, and run motor/web tests.
7. Deploy database and applications through the authorized path while the M067 default trigger still protects old writers.
8. Re-run catalog, G12/G13, health and application checks before declaring G9.

## Rollback draft

If application verification fails after the DDL but data is structurally valid, the technical schema rollback is:

```sql
BEGIN;
SET LOCAL lock_timeout = '15s';
ALTER TABLE "news" ALTER COLUMN "group_id" DROP NOT NULL;
ALTER TABLE "news" ALTER COLUMN "group_rank" DROP NOT NULL;
COMMIT;
```

Coordinate that with reverting both Prisma schemas. Dropping `NOT NULL` does not restore or normalize groups; D7 rollback remains the separate, partially reversible procedure in the D7 runbook.
