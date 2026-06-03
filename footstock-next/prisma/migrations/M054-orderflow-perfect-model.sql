-- ============================================================================
-- M054 — Order flow "perfect model" (debit-on-execute hardening)
-- Aplicar no DB compartilhado (footstock-next + motor). IDEMPOTENTE.
-- Gerado por: refactor fluxo de ordens 2026-06-02
-- ============================================================================

-- 1. Idempotência de juros de alavancagem por posição (cobrança única por dia BRT).
--    LeverageService.accrueInterest faz CAS: só cobra se last_interest_charged_at
--    for NULL ou < início do dia BRT atual.
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS last_interest_charged_at TIMESTAMP(3);

-- 2. Defense-in-depth: no máximo 1 TRADE + 1 FEE por ordem.
--    Índice parcial (WHERE order_id IS NOT NULL) — lançamentos sem ordem
--    (BONUS, SHORT_INTEREST, LEVERAGE_INTEREST, MARGIN_BLOCKED) têm order_id NULL
--    e NÃO são afetados (no Postgres NULLs são distintos em índices únicos, mas o
--    WHERE deixa a intenção explícita). A idempotência primária é em nível de app
--    (CAS de status no settlement), este índice é a última linha de defesa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_order_financial
  ON transactions (order_id, financial_type)
  WHERE order_id IS NOT NULL;
