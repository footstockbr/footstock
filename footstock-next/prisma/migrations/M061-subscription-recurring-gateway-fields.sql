-- M061 — Subscription: campos de recorrencia real no gateway + enum BillingMode
-- Rastreabilidade: loop 06-24-footstock-recorrencia-real-gateways, Task 002
--
-- CONTEXTO
-- Hoje toda Subscription nasce de um checkout one-time (PIX/cartao avulso): o app cobra
-- uma vez e estende `expires_at` manualmente; cancelAutoRenewal e stub e nenhum gateway
-- faz cobranca recorrente real. As Tasks 003+ deste loop introduzem assinaturas reais no
-- Mercado Pago (preapproval/cartao). Para isso a linha Subscription precisa carregar a
-- identidade da assinatura do lado do gateway e o ciclo de cobranca corrente.
--
-- O conflito de partida: `src/types/models.ts` JA declarava `gatewaySubscriptionId`,
-- `currentPeriodStart/End` e `cancelAtPeriodEnd`, mas o schema NAO os persistia (campos
-- orfaos). Esta migration fecha o gap pelo lado do banco; os tipos sao alinhados na mesma
-- task.
--
-- O QUE ESTA MIGRATION FAZ
-- 1. Cria o enum "BillingMode" (one_time | recurring) — idempotente.
-- 2. Adiciona 8 colunas a "subscriptions" (todas IF NOT EXISTS):
--    - gateway_subscription_id TEXT UNIQUE  (id da assinatura/preapproval no gateway)
--    - gateway_plan_id         TEXT         (id do plano de cobranca)
--    - gateway_product_id      TEXT         (id do produto, quando aplicavel)
--    - gateway_status          TEXT         (status bruto do gateway, auditoria)
--    - current_period_start    TIMESTAMP(3) (inicio do ciclo corrente)
--    - current_period_end      TIMESTAMP(3) (fim do ciclo corrente)
--    - cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false
--    - billing_mode "BillingMode" NOT NULL DEFAULT 'one_time'
-- 3. Backfill idempotente de billing_mode para 'one_time' (linhas pre-existentes).
--
-- GARANTIA DE NAO-NULO (aceite "nenhuma Subscription com billingMode nulo")
-- `billing_mode` entra como NOT NULL DEFAULT 'one_time': linhas existentes recebem o
-- default no momento do ADD COLUMN e inserts pos-migration nunca nascem nulos. O STEP 3
-- (UPDATE) e uma rede de seguranca idempotente — re-rodar nao altera linhas ja preenchidas
-- e, com a coluna NOT NULL, casa zero linhas (nunca quebra).
--
-- UNIQUE EM COLUNA NULAVEL
-- gateway_subscription_id e UNIQUE mas nulavel: o Postgres permite multiplos NULL no indice
-- unico, entao as linhas one-time existentes (todas NULL) nao colidem. So assinaturas reais
-- com id do gateway disputam unicidade — exatamente o desejado (idempotencia de webhook).
--
-- IMPORTANTE — APLICACAO EM PROD = ACAO DO OPERADOR (fora do loop)
-- prod DB = Railway-internal (postgres.railway.internal), acesso via proxy tramway. Revisar
-- este SQL ANTES de aplicar. Migrations sao forward-only (sem DOWN automatico do Prisma); o
-- rollback manual esta documentado ao final. Todos os statements sao idempotentes, entao a
-- migration pode ser reaplicada com seguranca. Sem CREATE INDEX CONCURRENTLY aqui (o UNIQUE
-- inline e criado junto da coluna), logo pode rodar dentro de transacao se desejado.

-- ─── STEP 1 — ENUM BillingMode (idempotente) ─────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "BillingMode" AS ENUM ('one_time', 'recurring');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ─── STEP 2 — COLUNAS NOVAS (todas IF NOT EXISTS) ────────────────────────────
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "gateway_subscription_id" TEXT,
  ADD COLUMN IF NOT EXISTS "gateway_plan_id"         TEXT,
  ADD COLUMN IF NOT EXISTS "gateway_product_id"      TEXT,
  ADD COLUMN IF NOT EXISTS "gateway_status"          TEXT,
  ADD COLUMN IF NOT EXISTS "current_period_start"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "current_period_end"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancel_at_period_end"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "billing_mode"            "BillingMode" NOT NULL DEFAULT 'one_time';

-- Indice unico de gateway_subscription_id (NULLs nao colidem).
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_gateway_subscription_id_key"
  ON "subscriptions" ("gateway_subscription_id");

-- ─── STEP 3 — BACKFILL (idempotente; rede de seguranca) ──────────────────────
-- Com billing_mode NOT NULL DEFAULT 'one_time' o ADD COLUMN ja preencheu as linhas
-- existentes. Este UPDATE casa zero linhas no estado normal e existe so para reaplicacao
-- defensiva caso a coluna tenha sido criada por um caminho que permitisse NULL.
UPDATE "subscriptions" SET "billing_mode" = 'one_time' WHERE "billing_mode" IS NULL;

-- ─── DOWN (rollback manual; forward-only no Prisma) ──────────────────────────
-- Reversao em prod = restore de backup OU `prisma migrate resolve`. Drop manual seguro
-- SOMENTE se nenhuma assinatura recorrente real ainda existir:
--
-- BEGIN;
--   DROP INDEX IF EXISTS "subscriptions_gateway_subscription_id_key";
--   ALTER TABLE "subscriptions"
--     DROP COLUMN IF EXISTS "gateway_subscription_id",
--     DROP COLUMN IF EXISTS "gateway_plan_id",
--     DROP COLUMN IF EXISTS "gateway_product_id",
--     DROP COLUMN IF EXISTS "gateway_status",
--     DROP COLUMN IF EXISTS "current_period_start",
--     DROP COLUMN IF EXISTS "current_period_end",
--     DROP COLUMN IF EXISTS "cancel_at_period_end",
--     DROP COLUMN IF EXISTS "billing_mode";
--   DROP TYPE IF EXISTS "BillingMode";
-- COMMIT;
