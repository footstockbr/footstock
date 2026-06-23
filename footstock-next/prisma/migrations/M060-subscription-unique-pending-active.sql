-- M060 — Índice único parcial de assinatura PENDING/ACTIVE por (user_id, plan_type)
-- Rastreabilidade: FIX-13 (loop 06-22-footstock-financeiro-planos, Task 17) | companion Task 18
--
-- PROBLEMA (anti dupla-cobranca)
-- O checkout cria uma Subscription PENDING e so depois chama o gateway. A guarda de
-- idempotencia em PlanService.subscribe (findFirst PENDING dos ultimos 5min) NAO e
-- atomica: dois POST concorrentes do mesmo (userId, planType, period) passam ambos pelo
-- findFirst antes de qualquer INSERT e criam DUAS linhas PENDING. Cada uma gera um
-- checkout/cobranca no gateway -> o usuario pode pagar as duas -> dupla-cobranca, e a
-- ativacao via webhook fica ambigua (qual PENDING ativar). A invariante de produto ja e
-- "no maximo uma assinatura PENDING ou ACTIVE por (userId, planType)": PlanService.subscribe
-- bloqueia checkout quando ja existe ACTIVE do mesmo plano (ORDER_081/409) e reaproveita o
-- PENDING recente. Falta apenas o enforcement no nivel do banco para fechar a corrida.
--
-- SOLUCAO
-- Indice UNICO PARCIAL em (user_id, plan_type) WHERE status IN ('PENDING','ACTIVE').
-- - Bloqueia a 2a PENDING concorrente do mesmo (userId, planType): o 2o INSERT falha com
--   violacao de unique (a app traduz para erro de checkout, nunca uma cobranca-fantasma).
-- - NAO bloqueia upgrade/downgrade entre planos diferentes (plan_type distinto = chave
--   distinta), nem renovacao do MESMO plano: a renovacao estende expires_at da propria
--   linha ACTIVE (subscription-expiry / webhook), nao cria nova PENDING enquanto a ACTIVE
--   do mesmo plano existe — PlanService.subscribe ja recusa esse caminho (ORDER_081).
--
-- PRE-REQUISITO: DEDUPE
-- O indice unico falha se ja existirem duplicatas no conjunto do predicado. O STEP 1 faz o
-- dedupe deterministico ANTES do STEP 2. Sobrevivente por (user_id, plan_type):
--   1) ACTIVE tem precedencia sobre PENDING (a linha paga vence a de checkout pendente);
--   2) maior expires_at (cobertura mais longa);
--   3) created_at mais recente; 4) id (desempate estavel).
-- Perdedores saem do predicado: PENDING -> CANCELLED (checkout abandonado, nunca ativado),
-- ACTIVE -> EXPIRED (anomalia rara; preserva-se a ACTIVE de maior cobertura). NENHUMA linha
-- e deletada — o rastro financeiro/auditoria e preservado.
--
-- IMPORTANTE — CONCURRENTLY FORA DE TRANSACAO
-- CREATE INDEX CONCURRENTLY NAO pode rodar dentro de um bloco de transacao. NAO envolva este
-- arquivo em BEGIN/COMMIT. Aplique via `psql -f` (autocommit por statement); o STEP 1 e um
-- UNICO UPDATE (atomico por si) e o STEP 2 roda em autocommit proprio. Aplicacao em PROD =
-- acao do operador (fora do loop), validada antes em staging/local.

-- ─── STEP 1 — DEDUPE (atomico; um unico UPDATE) ──────────────────────────────
WITH ranked AS (
  SELECT
    id,
    status,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, plan_type
      ORDER BY
        CASE status WHEN 'ACTIVE' THEN 0 ELSE 1 END,  -- ACTIVE vence PENDING
        expires_at DESC,                              -- maior cobertura
        created_at DESC,                              -- mais recente
        id DESC                                       -- desempate estavel
    ) AS rn
  FROM subscriptions
  WHERE status IN ('PENDING', 'ACTIVE')
)
UPDATE subscriptions AS s
SET
  status = CASE
    WHEN s.status = 'PENDING' THEN 'CANCELLED'::"SubscriptionStatus"
    ELSE 'EXPIRED'::"SubscriptionStatus"
  END,
  updated_at = now()
FROM ranked AS r
WHERE s.id = r.id
  AND r.rn > 1;

-- ─── STEP 2 — INDICE UNICO PARCIAL (CONCURRENTLY, autocommit) ────────────────
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS subscriptions_user_plan_pending_active_uq
  ON subscriptions (user_id, plan_type)
  WHERE status IN ('PENDING', 'ACTIVE');

-- ─── DOWN (rollback manual, autocommit) ──────────────────────────────────────
-- DROP INDEX CONCURRENTLY tambem NAO pode rodar em transacao. Executar isolado:
--
-- DROP INDEX CONCURRENTLY IF EXISTS subscriptions_user_plan_pending_active_uq;
--
-- O dedupe do STEP 1 NAO e revertido automaticamente: as linhas demovidas
-- (PENDING->CANCELLED, ACTIVE->EXPIRED) representam estado correto pos-saneamento e nao
-- devem ser "re-duplicadas". Reverter so se a remocao do indice for definitiva e houver
-- decisao operacional explicita sobre cada linha afetada (NUNCA recriar dupla-cobranca).
