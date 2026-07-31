# M067 D7 controlled activation runbook

Current readiness (2026-07-31): **BLOCKED — do not activate**. G3 is red because the available golden set is agent-sim, not 32 real provider HTTP responses. This runbook prepares the future authorized operation; it does not mark G3/G7/G8/G9 green.

## Control path

- Runtime flag: `NEWS_MULTI_TEAM_ENABLED`.
- Decision point: `motor/src/news/NewsPublisher.ts`, exported as `NEWS_MULTI_TEAM_FLAG` and read by `isMultiTeamFanOutEnabled()` on every publish.
- Configuration documentation: `motor/.env.example`.
- Default/fail-closed state: absent, empty or anything other than case-insensitive `true` means off.
- Production control plane: Railway service `motor`; activation and deactivation require the authorized operator.
- Structural rollback script: `footstock-next/prisma/scripts/m067-normalize-groups.sql`.

Never add `NEWS_MULTI_TEAM_ENABLED=true` to a committed env file.

## Hard preconditions

Stop unless every item has literal evidence attached to the D7 execution:

- [ ] G3 green: 32 `real-http` responses, real provider/model/timestamps, TAXA A >= 85%, formal review approved.
- [ ] G4 green: six E2E scenarios including 44/45 green twice.
- [ ] G5 green: all 13 checkpoint reviews have no technical blocker.
- [ ] G6 green: exact candidate SHA is live in web and motor, workflows/health green, M067 present, flag off, no old instance.
- [ ] Waiver revoked/replaced and HTTP 422 `NEWS-004` contract decided.
- [ ] Authenticated observation is available for G13(e).
- [ ] Baseline for all seven G13 signals is captured.
- [ ] Database, Railway and workflow access are confirmed.
- [ ] Kill switch was rehearsed on a disposable clone; normalization script and evidence storage are ready.
- [ ] Rollback owner is present and ambiguity is agreed to mean abort.

The current state fails the first checkbox. Do not run the activation command now.

## Authorized activation (future D7 only)

After all preconditions are approved, record UTC time, SHA, service/deploy IDs and baseline outputs. Confirm no old motor instance is active. Then the authorized operator may set the motor service variable to true and wait for the new deployment to finish.

Immediately prove real groups of two and three lines, ranks 0..2, opposite sentiments where expected, matching group correlation, complete cron cycle and no flattening. Preserve row IDs and literal outputs. A control-plane value alone is not runtime proof.

## G12 checklist

Run at D7 baseline, observation start and observation end. Expected result is zero unless stated otherwise.

```sql
SELECT count(*)
FROM news
WHERE group_id IS NULL OR group_rank IS NULL;

SELECT count(*)
FROM news
WHERE group_id = '' OR group_rank NOT BETWEEN 0 AND 2;

SELECT group_id, group_rank, count(*)
FROM news
GROUP BY group_id, group_rank
HAVING count(*) > 1;

SELECT count(*)
FROM news AS member
WHERE NOT EXISTS (
  SELECT 1
  FROM news AS anchor
  WHERE anchor.group_id = member.group_id
    AND anchor.id = member.group_id
    AND anchor.group_rank = 0
);

SELECT count(*)
FROM news
WHERE impact_dispatched_at IS NULL
  AND ticker IS NOT NULL
  AND created_at < now() - interval '24 hours';
```

A zero-null snapshot without an authorized 24-hour window is not G8.

## G13 — seven abort signals

Any positive or indeterminate signal means: stop mutation, execute the kill switch and return the decision to the operator.

- [ ] (a) Motor logs contain zero `news_publish_db_failed`.
- [ ] (b) Motor and web logs contain zero `PrismaClientValidationError`.
- [ ] (c) Structural queries return: zero null/out-of-range rows, no duplicate ranks, zero groups without canonical anchor.
- [ ] (d) This query returns zero:

```sql
SELECT count(*)
FROM news
WHERE group_rank > 0
  AND impact_dispatched_at IS NULL
  AND created_at < now() - interval '30 minutes';
```

- [ ] (e) `GET /api/v1/news?limit=20` has no duplicated `groupId`, and authenticated `/noticias` visual inspection has no duplicated card/error state.
- [ ] (f) Motor logs contain zero `correlation_applied_same_group`.
- [ ] (g) Web `api/v1/news` 5xx count does not exceed the item-006 baseline.

Also run the flattening detector; expected zero:

```sql
SELECT count(*)
FROM news AS sibling
JOIN news AS anchor
  ON anchor.group_id = sibling.group_id
 AND anchor.group_rank = 0
WHERE sibling.group_rank > 0
  AND sibling.asset_ids = anchor.asset_ids;
```

Capture query text, UTC timestamp, output and SHA. Do not summarize an unavailable/ambiguous metric as zero.

## Kill switch and rollback

The flag is a **brake**, not a full undo. It stops new multi-team groups after the replacement process is live; it does not restore existing groups, undo flattened `asset_ids`, or remove impacts already applied to L7.

Required order:

1. Authorized operator sets `NEWS_MULTI_TEAM_ENABLED=false` on motor.
2. Confirm the replacement deploy completed and no old instance remains. Reading the configured variable is insufficient.
3. Corroborate with two five-minute-window reads; any new rank > 0 aborts. Zero is traffic-dependent and does not replace step 2:

```sql
SELECT count(*)
FROM news
WHERE group_rank > 0
  AND created_at > now() - interval '5 minutes';
```

4. Only after the brake is confirmed, export a pre-image of `id, group_id, group_rank, impact_dispatched_at` for every rank > 0 and store it outside the runtime/container.
5. Run `footstock-next/prisma/scripts/m067-normalize-groups.sql` through the authorized database path. It takes a write-conflicting lock on `news`.
6. Run the same normalization a second time; it must report `UPDATE 0` and equal internal before/after checksums.
7. Re-run G12/G13, save literal output and return control to the operator. Do not restart D7 automatically.

If normalization refuses an invariant, do not improvise an UPDATE. Preserve the error and escalate for census/recovery.

## Evidence record

The D7 packet must include the gate matrix, operator, SHA/deploy IDs, flag transitions, timestamps, baseline/final G12 and all seven G13 signals, real group IDs/ranks/sentiments/dispatches, cron/flattening checks, kill-switch proof, pre-image location, normalization outputs and final decision.
