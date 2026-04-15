-- ============================================================================
-- M041: Bonus FS$ com Carência de 7 dias — T-021 / CDC Art. 49
-- 1. Adiciona bonus_amount em subscriptions (imutabilidade do valor agendado)
-- 2. Torna campos de trade nullable em transactions (suporte a lançamentos sem ativo)
-- 3. Adiciona tipos BONUS_SCHEDULED e BONUS_CANCELLED ao enum NotificationType
-- 4. Índice de performance para o cron diário de crédito de bônus
-- ============================================================================

-- 1. bonus_amount: armazena o valor exato do bônus no momento do agendamento
--    Evita que mudanças futuras na tabela de bônus alterem retroativamente valores pendentes.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS bonus_amount DECIMAL(18, 2);

-- 2. Campos de trade tornam-se opcionais para suportar lançamentos financeiros sem ativo
--    (bônus de upgrade, dividendos, depósitos futuros).
--    Lançamentos TRADE sempre preenchem estes campos — comportamento não muda.
ALTER TABLE transactions
  ALTER COLUMN asset_id   DROP NOT NULL,
  ALTER COLUMN "type"     DROP NOT NULL,
  ALTER COLUMN side       DROP NOT NULL,
  ALTER COLUMN quantity   DROP NOT NULL,
  ALTER COLUMN price      DROP NOT NULL,
  ALTER COLUMN fee        DROP NOT NULL;

-- 3. Novos tipos de notificação para o fluxo de carência de bônus
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BONUS_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BONUS_CANCELLED';

-- 4. Índice parcial: acelera a query principal do cron de crédito de bônus
--    Apenas assinaturas com bônus agendado e não creditado são indexadas.
CREATE INDEX IF NOT EXISTS idx_subscriptions_bonus_pending
  ON subscriptions (bonus_scheduled_at, status)
  WHERE bonus_scheduled_at IS NOT NULL AND bonus_credited_at IS NULL;
