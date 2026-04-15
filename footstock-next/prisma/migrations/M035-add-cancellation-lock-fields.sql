-- ============================================================================
-- M035: Adiciona campos de Cancellation Lock na tabela subscriptions
-- T+48h (forced_liquidation_at) e T+7d (cancellation_lock_expires_at)
-- forcedLiquidationExecutedAt garante idempotência do cron T+48h
-- cancellationLockStartedAt é o marco inicial do lock
-- ============================================================================

-- Novos campos
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancellation_lock_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forced_liquidation_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forced_liquidation_executed_at   TIMESTAMPTZ;

-- Backfill para locks abertos com timestamps errados (campo antigo = started + 48h)
-- Corrige: cancellation_lock_expires_at passa a ser started + 7d
-- cancellation_lock_started_at derivado do cancelledAt (marcado ao iniciar o lock)
UPDATE subscriptions
SET
  cancellation_lock_started_at  = COALESCE(cancelled_at, updated_at, created_at),
  forced_liquidation_at          = COALESCE(cancelled_at, updated_at, created_at) + INTERVAL '48 hours',
  -- Recalcula expires para 7d a partir do inicio do lock
  cancellation_lock_expires_at   = COALESCE(cancelled_at, updated_at, created_at) + INTERVAL '7 days'
WHERE status = 'CANCELLATION_LOCK'
  AND cancellation_lock_started_at IS NULL;

-- Indices para os crons
CREATE INDEX IF NOT EXISTS idx_subscriptions_forced_liquidation
  ON subscriptions (forced_liquidation_at, status, forced_liquidation_executed_at)
  WHERE status = 'CANCELLATION_LOCK';

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancellation_lock_expires
  ON subscriptions (cancellation_lock_expires_at, status)
  WHERE status = 'CANCELLATION_LOCK';
