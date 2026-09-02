-- ============================================================================
-- M072 (paridade de dev) — ciclo de vida da ordem no schema RAIZ (o do motor).
--
-- Espelho de footstock-next/prisma/migrations/20260902140000_M072-order-retry-lifecycle,
-- que e a arvore canonica aplicada em producao pelo CI.
--
-- Aqui a paridade e obrigatoria e nao opcional: quem ESCREVE attempt_count,
-- last_error_code, next_attempt_at e cancel_reason no caminho quente e o motor,
-- e o client dele e gerado a partir DESTE schema. Se as colunas existissem so na
-- arvore canonica, o motor nao as conheceria e os campos ficariam eternamente
-- nulos, sem erro nenhum — o modo de falha silenciosa descrito na secao 8.4 do
-- documento de desenho.
--
-- Em producao e integralmente no-op (todos os IF NOT EXISTS batem em objeto ja
-- criado pela migration canonica).
-- ============================================================================

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "last_attempt_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "last_error_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;

CREATE INDEX IF NOT EXISTS "orders_status_type_next_attempt_at_idx"
  ON "orders" ("status", "type", "next_attempt_at");
