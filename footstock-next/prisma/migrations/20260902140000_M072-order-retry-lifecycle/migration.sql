-- ============================================================================
-- M072 — ciclo de vida da ordem: contador de tentativa, backoff e motivo.
--
-- Fase 3 do plano de correcao (docs/FASE3-ciclo-de-vida-da-ordem.md).
--
-- attempt_count / last_attempt_at / last_error_code / next_attempt_at sustentam
-- a retentativa com backoff no motor. cancel_reason persiste o motivo terminal
-- que hoje so existia como texto solto em log e em canal Redis sem assinante.
--
-- Toda ordem ja existente fica com attempt_count = 0 e os demais campos NULL.
-- NULL em cancel_reason significa "motivo nao registrado" e a UI trata como
-- ausencia de dado (Zero Assumido): renderiza como antes, sem inventar motivo.
-- NULL em next_attempt_at significa "elegivel agora" — e por isso que o filtro
-- da varredura e `next_attempt_at IS NULL OR next_attempt_at <= now()`, e nao
-- uma comparacao simples que descartaria a base inteira.
-- ============================================================================

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "last_attempt_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "last_error_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;

-- Cobre o WHERE quente da varredura do motor: igualdade em status, igualdade em
-- type, range em next_attempt_at.
CREATE INDEX IF NOT EXISTS "orders_status_type_next_attempt_at_idx"
  ON "orders" ("status", "type", "next_attempt_at");
