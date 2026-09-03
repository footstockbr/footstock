-- ============================================================================
-- M073 — trilha de auditoria de transicao de sessao de mercado.
--
-- A tabela NUNCA existiu em producao. Os dois schemas Prisma a declaravam ha
-- meses, cada um de um jeito (market_session_log com colunas SessionType na
-- arvore raiz, market_session_logs com colunas String na arvore canonica) e
-- nenhuma migration a criava — o unico escritor era uma rota Next
-- (/api/v1/cron/session-transition) que nada agendava, ja que este repo nao tem
-- vercel.json. Resultado: zero linha, zero erro, zero sinal.
--
-- Nome escolhido: PLURAL. E a convencao da casa e o nome declarado na arvore que
-- o CI de fato aplica (deploy.yml roda `prisma migrate deploy` com
-- working-directory: footstock-next).
--
-- Tipo escolhido: o pg enum "SessionType", que ja existe em producao com 7
-- labels (PRE_MARKET, REGULAR, CLOSING_CALL, AFTER_MARKET, CLOSED, PRE_OPENING,
-- TRADING). Os valores que o motor grava sao labels desse mesmo enum — a nota
-- antiga de que viriam de "um enum distinto" estava errada. A migration NAO cria
-- nem altera o enum.
--
-- transition_day (dia-calendario BRT, YYYY-MM-DD) e a CHAVE NATURAL da linha.
-- Cada transicao do pregao acontece no maximo uma vez por dia, entao a unique
-- (transition_day, from_session, to_session) transforma "best effort" em
-- invariante: um blip de Redis nao duplica a linha e um retry de escrita e
-- seguro. Sem ela, a unica protecao contra duplicata seria o cache em memoria do
-- processo — que morre em todo restart, exatamente o modo de falha que a
-- correcao A5 do mesmo dia trata no MarketEngine.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "market_session_logs" (
  "id"             TEXT NOT NULL,
  "from_session"   "SessionType" NOT NULL,
  "to_session"     "SessionType" NOT NULL,
  "transition_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transition_day" VARCHAR(10) NOT NULL,

  CONSTRAINT "market_session_logs_pkey" PRIMARY KEY ("id")
);

-- Consulta quente da auditoria: "o que aconteceu no pregao de tal dia", em ordem.
CREATE INDEX IF NOT EXISTS "market_session_logs_transition_at_idx"
  ON "market_session_logs" ("transition_at");

-- Chave natural: idempotencia da escrita do job.
CREATE UNIQUE INDEX IF NOT EXISTS "market_session_logs_transition_day_from_session_to_session_key"
  ON "market_session_logs" ("transition_day", "from_session", "to_session");
