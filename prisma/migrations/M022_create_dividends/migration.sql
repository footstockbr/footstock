-- Migration: M022_create_dividends
-- module-16-dividendos: tabela dividends com suporte a ESPORTIVO/FINANCEIRO,
-- status CREDITED/PENDING/EXPIRADO, idempotência mensal e índices otimizados.
-- Rastreabilidade: INT-072, INT-073, INT-074

CREATE TABLE "dividends" (
  "id"              TEXT NOT NULL,
  "user_id"         TEXT NOT NULL,
  "ticker"          TEXT NOT NULL,
  "club_name"       TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "amount"          DOUBLE PRECISION NOT NULL,
  "yield_percent"   DOUBLE PRECISION NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'PENDING',
  "processed_month" TEXT,
  "scheduled_for"   TIMESTAMP(3),
  "trigger_event"   TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dividends_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dividends_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Índice por usuário (consultas de histórico)
CREATE INDEX "dividends_user_id_idx" ON "dividends"("user_id");

-- Índice por ticker (consultas do cálculo esportivo)
CREATE INDEX "dividends_ticker_idx" ON "dividends"("ticker");

-- Índice por mês processado (verificação de idempotência do job mensal)
CREATE INDEX "dividends_processed_month_idx" ON "dividends"("processed_month");

-- Índice composto (status, scheduled_for) — job de crédito diário
CREATE INDEX "dividends_status_scheduled_for_idx" ON "dividends"("status", "scheduled_for");

-- Índice composto (status, created_at) — job de expiração diária
CREATE INDEX "dividends_status_created_at_idx" ON "dividends"("status", "created_at");
