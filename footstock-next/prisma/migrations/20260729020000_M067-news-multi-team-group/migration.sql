-- M067 - News multi-time: grupo (group_id, group_rank) e marcador de despacho durável
-- Rastreabilidade: blacksmith/brainstorm-mcp/07-28-noticias-multi-time-linha-por-time.md
--                  (loop 07-28-noticias-multi-time-linha-por-time, item 007, fase F1)
--                  SQL de referencia: secao 15.4 do apendice. Decisoes: DB-04, DB-12, DB-16.
--                  Achados enderecados: F12 (numeracao), F13 (ticker nullable), F14/F21 (indices de leitura).
--
-- O QUE ESTA MIGRATION FAZ (aditiva e idempotente - nao remove nem reescreve dado existente)
--  1. Adiciona "group_id", "group_rank" e "impact_dispatched_at" em "news", TODAS NULLABLE (D1).
--  2. Backfill estrutural: todo o acervo vira grupo unitario (group_id = id, group_rank = 0).
--     Backfill APENAS estrutural: nao reclassifica noticia historica, nao cria linha irma
--     retroativa, nao emite news:inject para noticia antiga (escopo travado do item 008).
--  3. Trigger BEFORE INSERT que preenche o default de grupo enquanto o motor antigo ainda
--     escreve sem semantica de grupo (janela D1 ate D3).
--  4. CHECK de cap de 3 times por noticia (group_rank entre 0 e 2) + unicidade de rank no grupo.
--  5. Idempotencia por time via indice unico PARCIAL (ticker e nullable - F13), mais o indice
--     parcial que impede dois tickers nulos no mesmo grupo.
--  6. Indices parciais de leitura: ancora do feed, hidratacao de irmaos e despacho pendente.
--
-- O QUE ESTA MIGRATION NAO FAZ
--  - NAO aplica NOT NULL em "group_id"/"group_rank". O aperto e a fase D8 (item 027), em
--    migration separada, depois das 24h de verificacao.
--  - NAO altera os schemas Prisma (item 009 sincroniza os DOIS: prisma/schema.prisma da raiz
--    e footstock-next/prisma/schema.prisma). Ate la o client nao enxerga as colunas novas.
--  - NAO ativa nenhum codigo agrupado. As colunas ficam inertes ate o flag de runtime.
--
-- DIVERGENCIAS JUSTIFICADAS FRENTE AO SQL DE REFERENCIA (secao 15.4)
--  D-a. "impact_dispatched_at" e TIMESTAMP(3), nao TIMESTAMPTZ. Todas as demais colunas de
--       data de "news" (published_at, archived_at, sentiment_classified_at, created_at,
--       updated_at) sao TIMESTAMP(3), que e o mapeamento default do Prisma para DateTime.
--       Criar a coluna como TIMESTAMPTZ produziria drift permanente contra o schema do item
--       009 (que declara `impactDispatchedAt DateTime?` sem @db.Timestamptz). A semantica de
--       A8 (marcador temporal simples, sem estado enumerado) e preservada.
--  D-b. O CHECK e criado dentro de um bloco DO guardado por pg_constraint. Postgres nao tem
--       `ADD CONSTRAINT IF NOT EXISTS`; sem a guarda, reaplicar o arquivo falharia com
--       duplicate_object e quebraria a idempotencia que o resto da migration mantem.
--  D-c. Os CREATE INDEX sao NAO concorrentes, como na referencia. `prisma migrate deploy`
--       roda a migration dentro de uma transacao e CREATE INDEX CONCURRENTLY e proibido em
--       bloco transacional. Consequencia aceita: lock de escrita em "news" durante o build
--       dos indices (tabela de noticias, volume baixo frente a tabelas transacionais).

-- ─── STEP 1 - Colunas aditivas, todas NULLABLE nesta etapa (D1) ──────────────
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "group_id" TEXT;
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "group_rank" INTEGER;
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "impact_dispatched_at" TIMESTAMP(3);

-- ─── STEP 2 - Backfill estrutural idempotente (criterio 35) ──────────────────
-- Todo registro pre-existente vira grupo unitario. Reexecucao nao altera linha alguma:
-- o predicado IS NULL deixa de casar depois da primeira passada (prova do item 008).
UPDATE "news" SET "group_id" = "id" WHERE "group_id" IS NULL;
UPDATE "news" SET "group_rank" = 0 WHERE "group_rank" IS NULL;

-- ─── STEP 3 - Default por trigger (cobre a janela D1 ate D3) ─────────────────
-- Enquanto o publisher antigo ainda inserir sem semantica de grupo, o banco garante o
-- grupo unitario. Sem isso, uma linha nova nasceria com group_id NULL e escaparia dos
-- indices de leitura (predicado group_rank = 0) e do NOT NULL futuro de D8.
CREATE OR REPLACE FUNCTION news_group_defaults()
RETURNS trigger AS $$
BEGIN
  IF NEW.group_id IS NULL OR NEW.group_id = '' THEN
    NEW.group_id := NEW.id;
  END IF;
  IF NEW.group_rank IS NULL THEN
    NEW.group_rank := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS news_group_defaults_trg ON "news";
CREATE TRIGGER news_group_defaults_trg
BEFORE INSERT ON "news"
FOR EACH ROW EXECUTE FUNCTION news_group_defaults();

-- ─── STEP 4 - Cap de 3 times e unicidade de rank no grupo (DB-04) ────────────
-- CHECK guardado por pg_constraint (divergencia D-b): idempotente por construcao.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'news_group_rank_chk'
      AND conrelid = '"news"'::regclass
  ) THEN
    ALTER TABLE "news"
      ADD CONSTRAINT "news_group_rank_chk" CHECK ("group_rank" BETWEEN 0 AND 2);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "news_group_id_rank_uidx"
  ON "news" ("group_id", "group_rank");

-- ─── STEP 5 - Idempotencia por time: indices PARCIAIS (F13) ──────────────────
-- UNIQUE (group_id, ticker) comum NAO restringe linhas com ticker NULL (NULL nunca e igual
-- a NULL no Postgres), entao a idempotencia prometida por DB-04 exige indice parcial.
CREATE UNIQUE INDEX IF NOT EXISTS "news_group_id_ticker_uidx"
  ON "news" ("group_id", "ticker") WHERE "ticker" IS NOT NULL;

-- Impede dois tickers nulos no mesmo grupo (criterio 19).
CREATE UNIQUE INDEX IF NOT EXISTS "news_group_id_null_ticker_uidx"
  ON "news" ("group_id") WHERE "ticker" IS NULL;

-- ─── STEP 6 - Indices parciais de leitura (F14, F21, DB-16) ──────────────────
-- Ancora do feed: uma linha por grupo (group_rank = 0), com chave secundaria estavel.
-- [F21] A rota publica (api/v1/news/route.ts) monta o where apenas com isPublished, assetIds
-- has e impact - NAO filtra isArchived. Um predicado com is_archived nao seria usado pela
-- query real, por isso o indice casa com a query que existe hoje.
CREATE INDEX IF NOT EXISTS "news_feed_anchor_visible_idx"
  ON "news" ("published_at" DESC, "group_id")
  WHERE "is_published" = true AND "group_rank" = 0;

-- Hidratacao de irmaos: dado um group_id ancorado, buscar os ranks 1 e 2 visiveis.
CREATE INDEX IF NOT EXISTS "news_group_siblings_visible_idx"
  ON "news" ("group_id", "group_rank")
  WHERE "is_published" = true;

-- Despacho pendente (DB-12): alimenta o reconciliador de impacto.
-- ATENCAO para o item 013: com o acervo backfillado e impact_dispatched_at NULL em toda
-- linha historica, este predicado casa TODO o acervo com ticker preenchido. O branch novo
-- do reconciliador precisa de recorte proprio (por created_at ou por grupo), senao tentaria
-- redespachar noticia antiga - o que o escopo travado do item 008 proibe explicitamente.
CREATE INDEX IF NOT EXISTS "news_impact_pending_idx"
  ON "news" ("created_at")
  WHERE "impact_dispatched_at" IS NULL AND "ticker" IS NOT NULL;
