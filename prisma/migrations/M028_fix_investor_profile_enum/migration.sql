-- AlterEnum: InvestorProfile
-- INTAKE canônico: INICIANTE, INTERMEDIARIO, AVANCADO, FA
-- Código anterior (alucinação): CONSERVADOR, MODERADO, ARROJADO, ESPECULADOR

-- Renomear valores do enum
ALTER TYPE "InvestorProfile" RENAME VALUE 'CONSERVADOR' TO 'INICIANTE';
ALTER TYPE "InvestorProfile" RENAME VALUE 'MODERADO' TO 'INTERMEDIARIO';
ALTER TYPE "InvestorProfile" RENAME VALUE 'ARROJADO' TO 'AVANCADO';
ALTER TYPE "InvestorProfile" RENAME VALUE 'ESPECULADOR' TO 'FA';

-- Remover tipos de notificação de afiliados (hallucinated — INTAKE não menciona afiliados)
-- Nota: requer que nenhum registro use estes valores antes de executar
DELETE FROM "notifications" WHERE "type"::text IN ('AFFILIATE_COMMISSION_EARNED', 'AFFILIATE_INVITE_JOINED');

-- Criar novo tipo sem os valores de afiliados
-- PostgreSQL não suporta DROP VALUE diretamente, então recriamos o tipo
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM (
  'ORDER_EXECUTED',
  'ORDER_CANCELLED',
  'MARGIN_CALL_ALERT',
  'CIRCUIT_BREAKER',
  'NEWS_FAVORITE_CLUB',
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'PLAN_CANCEL_ALERT',
  'DIVIDEND_CREDITED',
  'BONUS_CREDITED',
  'LEAGUE_RESULT',
  'ADMIN_BROADCAST',
  'CANCELLATION_LOCK_ACTIVE',
  'CANCELLATION_LOCK_LIQUIDATED'
);
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";
DROP TYPE "NotificationType_old";
