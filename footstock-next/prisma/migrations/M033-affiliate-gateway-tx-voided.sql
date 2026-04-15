-- M033 — Affiliate: gatewayTransactionId para idempotência + status VOIDED para refund
-- Rastreabilidade: T-001 adversarial review (fix idempotência por ciclo e status semântico)

-- 1. Adicionar campo gateway_transaction_id (idempotência por evento de pagamento)
--    Permite N renovações da mesma subscription — 1 comissão por evento único do gateway
ALTER TABLE affiliate_transactions
  ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_tx_gateway_tx_id
  ON affiliate_transactions (gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;

-- 2. Adicionar status VOIDED ao enum (comissão anulada por refund/chargeback)
ALTER TYPE "AffiliateStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

-- 3. Remover índice de idempotência anterior (subscriptionId + transactionType)
--    que bloqueava renovações futuras da mesma assinatura
DROP INDEX IF EXISTS uq_affiliate_tx_renewal_idempotency;
