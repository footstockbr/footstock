-- M031 — Affiliate: commission_percentage_at_time + unique idempotency constraint
-- Rastreabilidade: T-001 (Gap 5), adversarial review: "sem snapshot, histórico muda retroativamente"

-- 1. Adiciona coluna para snapshot da taxa de comissão no momento da transação
ALTER TABLE affiliate_transactions
  ADD COLUMN IF NOT EXISTS commission_percentage_at_time NUMERIC(5,4);

-- Backfill: preenche com a taxa atual do código de afiliado para transações existentes
UPDATE affiliate_transactions at
SET    commission_percentage_at_time = ac.commission_percentage
FROM   affiliate_codes ac
WHERE  at.affiliate_code_id = ac.id
  AND  at.commission_percentage_at_time IS NULL;

-- 2. Unique constraint para idempotência de comissões de renovação
--    Garante: mesma renovação (affiliate_code_id + subscription_id + transaction_type) gera no máximo 1 linha
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_tx_renewal_idempotency
  ON affiliate_transactions (affiliate_code_id, subscription_id, transaction_type)
  WHERE subscription_id IS NOT NULL;

-- Índices de suporte para queries do cron e dashboard
CREATE INDEX IF NOT EXISTS idx_affiliate_tx_status_pending
  ON affiliate_transactions (status)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_affiliate_tx_affiliate_code
  ON affiliate_transactions (affiliate_code_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_tx_referred_user
  ON affiliate_transactions (referred_user_id);
