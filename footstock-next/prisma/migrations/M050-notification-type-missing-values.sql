-- M050 — Adicionar valores ausentes ao enum NotificationType
-- Rastreabilidade: análise pós-entrega milestone-7
--
-- Estes 6 valores estão no schema.prisma e em uso no código TypeScript
-- mas nunca foram adicionados ao enum PostgreSQL via migration.
-- Sem esta migration, qualquer INSERT com esses tipos retorna:
--   ERROR: invalid input value for enum "NotificationType"
--
-- Afetados:
--   AGE_VERIFICATION_PENDING    — auth/register/route.ts:335 (T-023)
--   AGE_VERIFICATION_COMPLETED  — verify-age/route.ts:65, retry-age-verification.ts:46 (T-023)
--   BALANCE_ZERO                — TransactionService.ts:256 (T-019)
--   BALANCE_RESET               — reset-balance/route.ts:73 (T-019)
--   POST_FLAGGED                — forum/route.ts:73 (T-028)
--   POST_REJECTED               — moderation/[id]/route.ts:181 (T-028)

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AGE_VERIFICATION_PENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AGE_VERIFICATION_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BALANCE_ZERO';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BALANCE_RESET';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POST_FLAGGED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POST_REJECTED';
