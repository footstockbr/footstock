-- M065 — Webhook idempotency: claim atômico (PA-WH-01)
-- Rastreabilidade: brainstorm blacksmith/brainstorm-mcp/07-02-foot-stock-posicoes-compra-webhook.md
--
-- CONTEXTO
-- A dedup de webhook em `webhook_audit_logs` usava `findFirst(status=ACCEPTED)` — um pré-check
-- NÃO atômico: dois webhooks idênticos simultâneos passam ambos antes do primeiro ACCEPTED ser
-- gravado. Os efeitos financeiros já são idempotentes (Payment.gateway_transaction_id UNIQUE +
-- idempotency_key de upgradeUser), então não há duplicação de dinheiro; esta tabela adiciona a
-- defesa em profundidade: um claim atômico que fecha a janela de concorrência.
--
-- O QUE ESTA MIGRATION FAZ (aditiva, idempotente — não altera dados existentes)
-- 1. Cria a tabela "webhook_idempotency".
-- 2. Índice UNIQUE em (gateway, event_type, transaction_id) — a base do claim atômico.
-- 3. Índice (status, updated_at) — suporte à re-reivindicação por lease e a cleanup futuro.
--
-- HABILITAÇÃO: após aplicar esta migration, ligar o flag de runtime WEBHOOK_ATOMIC_CLAIM=true.
-- Enquanto o flag estiver 'false' (default), o webhook não toca nesta tabela.

CREATE TABLE IF NOT EXISTS "webhook_idempotency" (
  "id"             TEXT NOT NULL,
  "gateway"        "SubscriptionGateway" NOT NULL,
  "event_type"     TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'PROCESSING',
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webhook_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_idempotency_gateway_event_type_transaction_id_key"
  ON "webhook_idempotency" ("gateway", "event_type", "transaction_id");

CREATE INDEX IF NOT EXISTS "webhook_idempotency_status_updated_at_idx"
  ON "webhook_idempotency" ("status", "updated_at");
