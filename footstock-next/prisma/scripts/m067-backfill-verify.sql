-- ============================================================================
-- FootStock - M067 / item 008: backfill estrutural do acervo de "news", versionado
-- e re-executavel, com prova de idempotencia embutida.
--
-- Uso:
--   psql "$DATABASE_URL" -f prisma/scripts/m067-backfill-verify.sql
--   (rodar DUAS vezes; a segunda execucao tem de reportar "UPDATE 0" nas duas
--    linhas de backfill e checksum identico ao da primeira)
--
-- Rastreabilidade: blacksmith/brainstorm-mcp/07-28-noticias-multi-time-linha-por-time.md
--                  (loop 07-28-noticias-multi-time-linha-por-time, item 008, criterio 28)
-- Relacao com a migration: as duas sentencas de UPDATE abaixo sao BYTE-A-BYTE as do
--   STEP 2 de prisma/migrations/20260729020000_M067-news-multi-team-group/migration.sql.
--   Este arquivo nao substitui a migration (o backfill oficial roda dentro dela, no
--   migrate deploy). Ele existe para (a) provar a idempotencia com saida literal e
--   (b) reparar estado parcial caso um deploy seja interrompido no meio do STEP 2.
--
-- ESCOPO TRAVADO (decisao do operador, 2026-07-28): backfill APENAS estrutural.
--   NAO reclassifica noticia historica, NAO cria linha irma retroativa, NAO emite
--   news:inject para noticia antiga. O historico permanece mono-time por decisao.
--   Este script NAO escreve em nenhuma coluna alem de group_id e group_rank, e nao
--   toca linha alguma cujo group_id/group_rank ja esteja preenchido.
--
-- PRE-REQUISITO: STEP 1 da M067 aplicado (colunas group_id/group_rank existem).
--   Sem elas o script aborta no primeiro SELECT com undefined_column - falha ruidosa,
--   nunca silenciosa.
-- ============================================================================

\set ON_ERROR_STOP on

\echo
\echo === [M067/008] ESTADO ANTES DO BACKFILL ===
SELECT
  count(*)                                        AS total_linhas,
  count(*) FILTER (WHERE "group_id" IS NULL)      AS group_id_nulos,
  count(*) FILTER (WHERE "group_rank" IS NULL)    AS group_rank_nulos,
  count(*) FILTER (WHERE "group_id" IS NOT NULL
                     AND "group_id" <> "id")      AS group_id_divergente
FROM "news";

\echo -- checksum do acervo inteiro (todas as colunas, ordem estavel por id):
SELECT md5(string_agg("news"::text, E'\n' ORDER BY "id")) AS checksum_antes FROM "news";

\echo
\echo === [M067/008] BACKFILL ESTRUTURAL (identico ao STEP 2 da migration M067) ===
\echo -- a saida "UPDATE n" de cada sentenca e a evidencia literal do criterio 28:
UPDATE "news" SET "group_id" = "id" WHERE "group_id" IS NULL;
UPDATE "news" SET "group_rank" = 0 WHERE "group_rank" IS NULL;

\echo
\echo === [M067/008] ESTADO DEPOIS DO BACKFILL ===
SELECT
  count(*)                                        AS total_linhas,
  count(*) FILTER (WHERE "group_id" IS NULL)      AS group_id_nulos,
  count(*) FILTER (WHERE "group_rank" IS NULL)    AS group_rank_nulos,
  count(*) FILTER (WHERE "group_id" <> "id")      AS group_id_divergente,
  count(*) FILTER (WHERE "group_rank" <> 0)       AS group_rank_nao_zero,
  count(DISTINCT "group_id")                      AS grupos_distintos
FROM "news";

\echo -- checksum do acervo inteiro (compare com checksum_antes: igual = zero linha alterada):
SELECT md5(string_agg("news"::text, E'\n' ORDER BY "id")) AS checksum_depois FROM "news";

\echo
\echo === [M067/008] INVARIANTES (falha ruidosa se qualquer uma quebrar) ===
DO $$
DECLARE
  v_nulos       bigint;
  v_divergente  bigint;
  v_rank        bigint;
  v_grupos      bigint;
  v_total       bigint;
BEGIN
  SELECT
    count(*) FILTER (WHERE "group_id" IS NULL OR "group_rank" IS NULL),
    count(*) FILTER (WHERE "group_id" <> "id"),
    count(*) FILTER (WHERE "group_rank" <> 0),
    count(DISTINCT "group_id"),
    count(*)
  INTO v_nulos, v_divergente, v_rank, v_grupos, v_total
  FROM "news";

  IF v_nulos > 0 THEN
    RAISE EXCEPTION 'M067/008 INV-1 quebrada: % linha(s) com group_id/group_rank NULL apos o backfill', v_nulos;
  END IF;
  IF v_divergente > 0 THEN
    RAISE EXCEPTION 'M067/008 INV-2 quebrada: % linha(s) com group_id <> id (grupo nao unitario no acervo historico)', v_divergente;
  END IF;
  IF v_rank > 0 THEN
    RAISE EXCEPTION 'M067/008 INV-3 quebrada: % linha(s) com group_rank <> 0 (ancora esperada em todo o acervo)', v_rank;
  END IF;
  IF v_grupos <> v_total THEN
    RAISE EXCEPTION 'M067/008 INV-4 quebrada: % grupo(s) distinto(s) para % linha(s) (grupo unitario exige paridade)', v_grupos, v_total;
  END IF;

  RAISE NOTICE 'M067/008 OK: % linha(s), % grupo(s) unitario(s), 0 nulo, 0 rank fora de zero.', v_total, v_grupos;
END $$;
