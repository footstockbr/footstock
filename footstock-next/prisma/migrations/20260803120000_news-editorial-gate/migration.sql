-- Gate editorial de escopo (motor/src/news/editorial-gate.ts)
--
-- Contexto: ate 2026-08-03 o NewsPublisher gravava `is_published = true` de forma
-- incondicional. Toda noticia que chegasse ao publisher entrava no feed do usuario,
-- inclusive NBA, futebol europeu e materia sem clube nenhum quando o classificador
-- LLM estava indisponivel (circuito de credito aberto). Estas duas colunas tornam a
-- decisao do gate AUDITAVEL: por que a linha nao esta no feed, e desde quando ela
-- passou pelo gate.
--
-- Idempotente. Nao altera nenhuma linha existente: o passivo fica com
-- `editorial_checked_at IS NULL`, que e exatamente o predicado usado pelo backfill
-- para distinguir "nunca avaliado" de "avaliado e aprovado".

ALTER TABLE "news"
  ADD COLUMN IF NOT EXISTS "editorial_block_reason" TEXT;

ALTER TABLE "news"
  ADD COLUMN IF NOT EXISTS "editorial_checked_at" TIMESTAMP(3);

-- Indice PARCIAL: so as linhas barradas interessam para a tela de auditoria do admin
-- e para as contagens de telemetria. As publicadas (a maioria) ficam fora do indice.
--
-- Sem CONCURRENTLY de proposito. No instante desta migration a coluna acabou de ser
-- criada, entao `editorial_block_reason IS NOT NULL` nao casa NENHUMA linha: o build e
-- uma varredura sequencial sem tupla para ordenar, e o ACCESS EXCLUSIVE dura o tempo do
-- scan. CONCURRENTLY, alem de nao poder rodar dentro da transacao que o `prisma migrate
-- deploy` abre, custaria duas varreduras para evitar um lock que aqui e trivial.
CREATE INDEX IF NOT EXISTS "news_editorial_block_reason_idx"
  ON "news"("editorial_block_reason")
  WHERE "editorial_block_reason" IS NOT NULL;

COMMENT ON COLUMN "news"."editorial_block_reason" IS
  'Motivo do bloqueio pelo gate editorial de escopo: out_of_scope_llm | no_local_team | asset_unresolved | out_of_scope_heuristic. NULL = publicada ou anterior ao gate.';

COMMENT ON COLUMN "news"."editorial_checked_at" IS
  'Instante em que o gate editorial avaliou a linha. NULL = passivo anterior a 2026-08-03.';
