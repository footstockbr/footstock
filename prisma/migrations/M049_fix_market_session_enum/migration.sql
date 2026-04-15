-- M049: Corrigir nomes do enum SessionType e adicionar CLOSING_CALL + tabela market_session_log
-- Ref: T-008 (Sessoes de Mercado — nomes e horarios canonicos)

-- 1. Renomear valores legados para os nomes canonicos
ALTER TYPE "SessionType" RENAME VALUE 'PRE_MARKET' TO 'PRE_OPENING';
ALTER TYPE "SessionType" RENAME VALUE 'REGULAR' TO 'TRADING';

-- 2. Adicionar valor ausente
ALTER TYPE "SessionType" ADD VALUE IF NOT EXISTS 'CLOSING_CALL';

-- 3. Criar tabela de log de transicoes de sessao (auditoria)
CREATE TABLE "market_session_log" (
  "id"             TEXT NOT NULL,
  "from_session"   "SessionType" NOT NULL,
  "to_session"     "SessionType" NOT NULL,
  "transition_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "market_session_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_session_log_transition_at_idx" ON "market_session_log"("transition_at");
