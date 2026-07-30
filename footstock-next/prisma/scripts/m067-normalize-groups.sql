-- ============================================================================
-- FootStock - M067 / item 022: normalizacao de grupos multi-linha ("kill switch"
-- real), versionada, transacional, idempotente e re-executavel.
--
-- Uso:
--   psql "$DATABASE_URL" -f prisma/scripts/m067-normalize-groups.sql
--   (no RUNBOOK-M067-D0-D8.md a MESMA variavel se chama $PROD_URL e o cwd e o
--    root do repo, entao la o path aparece como footstock-next/prisma/scripts/...;
--    e a mesma connection string, so muda o nome da variavel e o cwd)
--   (rodar DUAS vezes; a segunda tem de reportar "UPDATE 0" e checksum_antes ==
--    checksum_depois DENTRO dela - nao comparar entre rodadas: o acervo segue vivo)
--   ATENCAO OPERACIONAL: enquanto roda, o script BLOQUEIA escritores de "news"
--   (ver "UMA SO TRANSACAO, COM LOCK EXPLICITO" abaixo). Leitura do feed nao para.
--   VIA DE MAO UNICA: o script destroi o mapeamento de grupo original (qual linha
--   era irma de quem, e com que rank). Ele NAO guarda pre-imagem. Se voce pode
--   precisar reconstruir os grupos depois, tire a copia ANTES de rodar - o
--   procedimento esta na secao "Kill switch" do RUNBOOK-M067-D0-D8.md.
--
-- Rastreabilidade: blacksmith/brainstorm-mcp/07-28-noticias-multi-time-linha-por-time.md
--                  (loop 07-28-noticias-multi-time-linha-por-time, item 022, gate G10)
--                  Kill switch: secao 15.2 da fonte ("Desligar o flag multi-time
--                  interrompe a criacao de novos grupos, mas nao normaliza os
--                  existentes. Uma consulta de normalizacao [...] precisa existir
--                  ANTES de D7, nao depois, e ser testada em staging. Sem ela, o
--                  kill switch e um freio, nao um desfazer.").
--
-- POR QUE ESTE ARQUIVO EXISTE
--   Desligar NEWS_MULTI_TEAM_ENABLED (motor/src/news/NewsPublisher.ts:49,65) para a
--   criacao de grupos novos, mas deixa em pe todo grupo multi-linha ja gravado. Este
--   script e o desfazer estrutural desse estado: rebaixa toda linha irma (group_rank
--   > 0) a grupo unitario, devolvendo o acervo as MESMAS invariantes INV-1..INV-4 que
--   o backfill do item 008 estabeleceu (prisma/scripts/m067-backfill-verify.sql).
--   E pre-condicao formal de D7 (gate G10): sem ele, ligar o flag e acao sem desfazer.
--
-- O QUE ELE REVERTE
--   INV-1  nenhuma linha com group_id/group_rank NULL
--   INV-2  group_id = id em toda linha        (todo grupo volta a ser unitario)
--   INV-3  group_rank = 0 em toda linha       (nenhuma linha permanece como irma)
--   INV-4  count(DISTINCT group_id) = count(*) (paridade grupo/linha)
--
-- O QUE ELE NAO REVERTE (limite declarado, nao defeito - matriz de reversibilidade
-- da fonte, secao 15.2, linha de D7 marcada "Parcialmente")
--   a. "asset_ids" achatado. Se um cron ou uma edicao admin reescreveu o array de uma
--      linha irma para o array da ancora, o array original foi DESTRUIDO e nao existe
--      copia recuperavel. A normalizacao devolve a estrutura do grupo, nao a semantica
--      da linha. Depois dela a linha e um grupo unitario com asset_ids errado.
--   b. Despacho de impacto ja aplicado ao L7 do motor. Nao e removivel por SQL: expira
--      por duracao de tick (fonte, secao 15.2).
--
-- ESCOPO TRAVADO (herdado literalmente de m067-backfill-verify.sql, decisao do
-- operador de 2026-07-28): normalizacao APENAS estrutural. NAO reclassifica noticia,
-- NAO cria nem apaga linha, NAO emite news:inject para noticia antiga. As UNICAS
-- colunas escritas sao "group_id" e "group_rank" (ver D-022-01 na secao 3 sobre
-- "impact_dispatched_at"). count(*) de "news" e verificado constante por invariante,
-- com falha ruidosa: perda de noticia nao e normalizacao.
--
-- PRE-REQUISITO: STEP 1 da M067 aplicado (colunas group_id/group_rank existem).
--   Sem elas o script aborta no primeiro SELECT com undefined_column, ANTES do UPDATE
--   e dentro da transacao unica - falha ruidosa, nunca silenciosa, nada escrito
--   (ON_ERROR_STOP + ROLLBACK, ver "VALIDACAO ANTES DO COMMIT").
--
-- UMA SO TRANSACAO, COM LOCK EXPLICITO (endurecimento de 2026-07-30, revisao do 022)
--   Tudo - censo, snapshots, pre-check de colisao, UPDATE, diagnostico e invariantes -
--   roda DENTRO de uma unica transacao, aberta imediatamente antes de
--     LOCK TABLE "news" IN SHARE ROW EXCLUSIVE MODE
--   Motivo: em READ COMMITTED, um pre-check rodado em autocommit vale para o snapshot
--   DELE, nao para o snapshot do UPDATE. Entre os dois, o motor (NewsPublisher) pode
--   inserir linha nova e tornar o pre-check obsoleto: o script diria "0 colisao" e
--   escreveria sobre um acervo diferente do que examinou (TOCTOU). O lock fecha a
--   janela: SHARE ROW EXCLUSIVE conflita com ROW EXCLUSIVE, logo BLOQUEIA
--   INSERT/UPDATE/DELETE em "news" durante a execucao, e NAO conflita com ACCESS SHARE,
--   logo NAO bloqueia SELECT (o feed continua lendo). Sendo auto-conflitante, tambem
--   serializa duas execucoes concorrentes do proprio script.
--   Custo operacional declarado: enquanto o script roda, escritor de "news" espera. E o
--   preco de um kill switch que examina e corrige o MESMO estado. A execucao e curta
--   (um UPDATE por PK sobre as linhas com group_rank > 0).
--   lock_timeout = 15s: se o lock nao vier em 15s (escritor longo em curso), o script
--   FALHA (55P03 lock_not_available), NAO escreve nada e NAO fica pendurado em
--   producao. Reexecutar em janela mais quieta.
--   statement_timeout = 120s: teto POR SENTENCA depois que o lock foi concedido.
--   NAO e teto da janela inteira: a janela e a soma das sentencas, e o pior caso
--   teorico e (numero de sentencas x 120s). O que ele garante e que nenhuma
--   sentenca isolada (os checksums varrem o acervo inteiro) pendura o lock para
--   sempre. Estouro = erro dentro da transacao = ROLLBACK, nada escrito. Se
--   estourar de verdade, o caminho nao e aumentar o numero as cegas: e medir o
--   tamanho de "news" e escolher a janela. Teto DURO da janela nao existe aqui;
--   quem precisar dele mata a sessao por fora (pg_terminate_backend).
--
-- VALIDACAO ANTES DO COMMIT (endurecimento de 2026-07-30, revisao do 022)
--   INV-1..INV-4 e as duas invariantes de ESCOPO rodam ANTES do COMMIT. Qualquer
--   RAISE EXCEPTION aborta a transacao: com ON_ERROR_STOP o psql para sem enviar
--   COMMIT, a conexao fecha e o servidor faz ROLLBACK. O acervo fica exatamente como
--   estava. Nao existe estado intermediario "escrito mas reprovado".
--   Consequencia deliberada (fail-closed): se o acervo tiver linha pre-backfill
--   (group_id/group_rank NULL - INV-1), o kill switch RECUSA normalizar e nada escreve.
--   O reparo e rodar prisma/scripts/m067-backfill-verify.sql primeiro e reexecutar este
--   script. Essa pre-condicao ja e verificada por consulta em D1 e D8 do runbook
--   (output/docs/foot-stock/project/RUNBOOK-M067-D0-D8.md), portanto a recusa aqui e
--   rede de seguranca, nao caminho esperado.
--
-- SEGURANCA CONTRA OS TRES INDICES UNICOS DA M067 (migration.sql:89-100)
--   news_group_id_rank_uidx (group_id, group_rank): cada linha rebaixada recebe
--     group_id = id, e "id" e a PK, logo o par (id, 0) e unico por construcao. Nenhum
--     grupo pos-normalizacao tem mais de uma linha, entao o indice nao restringe.
--   news_group_id_ticker_uidx (group_id, ticker) WHERE ticker IS NOT NULL e
--   news_group_id_null_ticker_uidx (group_id) WHERE ticker IS NULL: deixam de
--     restringir porque cada grupo passa a ter exatamente uma linha.
--   O UNICO caso capaz de colidir e patologico e nao produzivel pelo writer da M067:
--     uma linha que seja simultaneamente irma (group_rank > 0) e pai de grupo (existir
--     outra linha com group_id igual ao id dela). A secao 1b conta esse caso e ABORTA
--     antes de escrever (stop condition 4 do item 022: recensear, nunca contornar). Sob
--     o lock desta transacao, essa contagem nao pode envelhecer entre o check e o UPDATE.
--   O trigger news_group_defaults_trg e BEFORE INSERT (migration.sql:70-72), portanto
--     NAO participa deste UPDATE e nao reescreve group_id durante a normalizacao.
--
-- A ANCORA NAO E TOCADA POR CONSTRUCAO
--   newsGroupWriter.ts:198-199 ja fixa group_id = id da ancora, e o predicado
--   WHERE group_rank > 0 a exclui. Logo a saida "UPDATE n" conta APENAS irmaos - nao
--   confundir com o "UPDATE n" do backfill do item 008, que conta o acervo inteiro.
-- ============================================================================

\set ON_ERROR_STOP on

\echo
\echo === [M067/022] SECAO 0 - ABRE TRANSACAO E BLOQUEIA ESCRITORES DE "news" ===
\echo -- SHARE ROW EXCLUSIVE: bloqueia INSERT/UPDATE/DELETE, nao bloqueia SELECT.
\echo -- lock_timeout 15s: sem o lock em 15s o script falha sem escrever nada.
\echo -- statement_timeout 120s: teto POR SENTENCA (nao da janela inteira - ver cabecalho).
BEGIN;

SET LOCAL lock_timeout = '15s';
-- lock_timeout limita so a ESPERA pelo lock. Sem um segundo teto, qualquer
-- sentenca desta transacao (os checksums varrem o acervo inteiro) poderia
-- segurar o lock indefinidamente e estancar o motor sob volume grande.
--
-- PRECISAO DO QUE ISTO GARANTE: statement_timeout e teto POR SENTENCA, nao da
-- transacao. A janela total de bloqueio e a soma das sentencas, entao o pior
-- caso teorico e (numero de sentencas x 120s), nao 120s. O que este teto
-- garante de fato e que NENHUMA sentenca isolada pendura o lock para sempre --
-- e o corte de cauda infinita, nao um SLA da janela. Quem precisa de teto duro
-- da janela mede o tamanho de "news" e mata a sessao por fora (pg_terminate_backend).
-- Estouro = erro = ROLLBACK, nada escrito (mesma via do INV-1).
SET LOCAL statement_timeout = '120s';
LOCK TABLE "news" IN SHARE ROW EXCLUSIVE MODE;

\echo
\echo === [M067/022] SECAO 1 - ESTADO ANTES DA NORMALIZACAO (sob lock) ===
SELECT
  count(*)                                             AS total_linhas,
  count(*) FILTER (WHERE "group_id" IS NULL)           AS group_id_nulos,
  count(*) FILTER (WHERE "group_rank" IS NULL)         AS group_rank_nulos,
  count(*) FILTER (WHERE "group_rank" > 0)             AS irmaos_a_rebaixar,
  count(*) FILTER (WHERE "group_id" IS NOT NULL
                     AND "group_id" <> "id")           AS group_id_divergente,
  count(DISTINCT "group_id")                           AS grupos_distintos
FROM "news";

\echo -- grupos multi-linha afetados (um por linha; vazio = nada a normalizar):
SELECT
  "group_id",
  count(*)              AS linhas_no_grupo,
  min("group_rank")     AS rank_min,
  max("group_rank")     AS rank_max
FROM "news"
WHERE "group_id" IS NOT NULL
GROUP BY "group_id"
HAVING count(*) > 1
ORDER BY "group_id";

\echo -- checksum do acervo inteiro (todas as colunas, ordem estavel por id):
SELECT md5(string_agg("news"::text, E'\n' ORDER BY "id")) AS checksum_antes FROM "news";

\echo -- checksum das 18 colunas pre-M067 (prova do escopo travado: tem de ser IDENTICO
\echo -- depois da normalizacao, porque nenhuma coluna de conteudo e escrita):
SELECT md5(string_agg(
         ROW("id", "title", "content", "impact", "sentiment", "asset_ids", "source",
             "is_published", "published_at", "created_at", "updated_at", "status",
             "is_archived", "archived_at", "clicks", "author", "ticker",
             "sentiment_classified_at")::text, E'\n' ORDER BY "id")) AS checksum_18_colunas_antes
FROM "news";

-- Snapshot do estado de entrada. ON COMMIT DROP: as temporarias existem apenas dentro
-- desta transacao (que e onde TODOS os seus leitores agora vivem) e desaparecem no
-- COMMIT, sem DROP explicito - por construcao nao ha nome remanescente para uma
-- reexecucao colidir nem para o search_path resolver em objeto errado. Toda leitura e
-- qualificada com pg_temp. Elas alimentam (a) as invariantes de escopo, que comparam
-- count(*) e o checksum das 18 colunas antes/depois, e (b) o diagnostico da secao 3,
-- que precisa saber QUAIS linhas foram rebaixadas - informacao que o UPDATE destroi.
CREATE TEMP TABLE m067_022_antes ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM "news")                                            AS total_antes,
  (SELECT md5(string_agg("news"::text, E'\n' ORDER BY "id")) FROM "news")  AS checksum_antes,
  (SELECT md5(string_agg(
            ROW("id", "title", "content", "impact", "sentiment", "asset_ids", "source",
                "is_published", "published_at", "created_at", "updated_at", "status",
                "is_archived", "archived_at", "clicks", "author", "ticker",
                "sentiment_classified_at")::text, E'\n' ORDER BY "id"))
     FROM "news")                                                          AS checksum18_antes;

CREATE TEMP TABLE m067_022_rebaixadas ON COMMIT DROP AS
SELECT "id", "group_id" AS group_id_antes, "group_rank" AS group_rank_antes, "impact_dispatched_at"
FROM "news"
WHERE "group_rank" > 0;

\echo
\echo === [M067/022] SECAO 1b - PRE-CHECK DE COLISAO (aborta antes de escrever) ===
-- Stop condition 4 do item 022: se a sentenca de rebaixamento puder colidir com um
-- indice unico, o modelo de grupo tem caso nao previsto no censo. Recensear, nunca
-- contornar. Caso patologico: linha simultaneamente irma e pai de grupo.
-- Roda DENTRO da mesma transacao e sob o mesmo lock do UPDATE: nenhum escritor pode
-- inserir a linha patologica entre este check e a escrita da secao 2.
DO $$
DECLARE
  v_colisao bigint;
BEGIN
  SELECT count(*)
  INTO v_colisao
  FROM "news" AS irma
  WHERE irma."group_rank" > 0
    AND EXISTS (SELECT 1 FROM "news" AS filha WHERE filha."group_id" = irma."id");

  IF v_colisao > 0 THEN
    RAISE EXCEPTION 'M067/022 PRE-CHECK abortado: % linha(s) sao simultaneamente irma (group_rank > 0) e pai de grupo (outra linha aponta group_id para o id dela). Rebaixar colidiria com news_group_id_rank_uidx. Recensear o modelo de grupo antes de normalizar (stop condition 4 do item 022).', v_colisao;
  END IF;

  RAISE NOTICE 'M067/022 PRE-CHECK OK: 0 colisao potencial com os indices unicos da M067.';
END $$;

\echo
\echo === [M067/022] SECAO 2 - NORMALIZACAO (unica sentenca de escrita) ===
\echo -- a saida "UPDATE n" conta APENAS irmaos rebaixados (a ancora e excluida pelo WHERE):
UPDATE "news" SET "group_id" = "id", "group_rank" = 0 WHERE "group_rank" > 0;

\echo
\echo === [M067/022] SECAO 3 - REPROCESSAMENTO (D-022-01: Opcao A, so-diagnostico) ===
-- D-022-01, arbitrada em 2026-07-30 pela evidencia de codigo (registro completo em
-- blacksmith/loop-archives/07-28-noticias-multi-time-linha-por-time/M067-NORMALIZE-EVIDENCE.md):
-- **Opcao A - NAO mexer em "impact_dispatched_at"**. Esta secao NAO escreve.
--
-- Evidencia que decidiu (nao e preferencia):
--   1. Nenhum consumidor le a coluna hoje. O unico escritor e
--      NewsPublisher.markImpactDispatched (motor/src/news/NewsPublisher.ts:641-651). O
--      dreno citado em NewsPublisher.ts:664 e "o reconciliador do item 029", item que
--      NAO existe neste loop de 27 itens. O reconciliador que existe
--      (reconcileUnappliedNews, footstock-next/src/lib/services/NewsInjectionService.ts:366-526,
--      exposto por api/cron/reconcile-news-impact) foi verificado no ST005 do item 020:
--      nao le nem escreve "impact_dispatched_at". Limpar o marcador hoje nao aciona
--      consumidor algum.
--   2. O unico efeito que a Opcao B (limpar o marcador) poderia produzir - fazer um
--      futuro reconciliador redespachar impacto de noticia antiga - e EXATAMENTE o que o
--      escopo travado do operador proibe ("NAO emite news:inject para noticia antiga"),
--      e o proprio STEP 6 da migration alerta no comentario de linhas 117-120. Ou seja:
--      a Opcao B nao tem efeito legitimo hoje e tem efeito ilegitimo amanha.
--   3. Custo aceito e declarado: "reprocessa", neste item, significa APENAS o
--      rebaixamento estrutural da secao 2. O impacto ja aplicado ao L7 do motor expira
--      por duracao de tick. O runbook (D7 e Kill switch) diz isso com todas as letras.
--
-- Se o operador reverter D-022-01 para a Opcao B, a sentenca a acrescentar aqui e
--   UPDATE "news" SET "impact_dispatched_at" = NULL
--   WHERE "id" IN (SELECT "id" FROM pg_temp.m067_022_rebaixadas);
-- e o criterio de aceite A8 do item 022 passa a admitir a terceira coluna.
\echo -- linhas rebaixadas nesta execucao, por estado do marcador de despacho:
SELECT
  count(*)                                                      AS rebaixadas_total,
  count(*) FILTER (WHERE "impact_dispatched_at" IS NOT NULL)     AS com_marcador_de_despacho,
  count(*) FILTER (WHERE "impact_dispatched_at" IS NULL)         AS sem_marcador_de_despacho
FROM pg_temp.m067_022_rebaixadas;

\echo
\echo === [M067/022] SECAO 4 - ESTADO DEPOIS DA NORMALIZACAO (ainda pre-COMMIT) ===
SELECT
  count(*)                                             AS total_linhas,
  count(*) FILTER (WHERE "group_id" IS NULL)           AS group_id_nulos,
  count(*) FILTER (WHERE "group_rank" IS NULL)         AS group_rank_nulos,
  count(*) FILTER (WHERE "group_id" <> "id")           AS group_id_divergente,
  count(*) FILTER (WHERE "group_rank" <> 0)            AS group_rank_nao_zero,
  count(DISTINCT "group_id")                           AS grupos_distintos
FROM "news";

\echo -- checksum do acervo inteiro (numa reexecucao ele e IDENTICO ao checksum_antes):
SELECT md5(string_agg("news"::text, E'\n' ORDER BY "id")) AS checksum_depois FROM "news";

\echo -- checksum das 18 colunas pre-M067 (SEMPRE identico ao de antes - escopo travado):
SELECT md5(string_agg(
         ROW("id", "title", "content", "impact", "sentiment", "asset_ids", "source",
             "is_published", "published_at", "created_at", "updated_at", "status",
             "is_archived", "archived_at", "clicks", "author", "ticker",
             "sentiment_classified_at")::text, E'\n' ORDER BY "id")) AS checksum_18_colunas_depois
FROM "news";

\echo
\echo === [M067/022] INVARIANTES (pre-COMMIT; quebra = ROLLBACK, nada escrito) ===
-- As mensagens de INV-1..INV-4 sao as do item 008, prefixadas M067/022: a definicao de
-- "estado consistente" e a MESMA ja versionada em m067-backfill-verify.sql, nao um
-- criterio novo inventado aqui.
--
-- Por que a validacao roda ANTES do COMMIT (endurecimento de 2026-07-30):
-- a transacao so e confirmada se TODA invariante passar. Qualquer RAISE EXCEPTION aqui
-- aborta a transacao, o psql para por ON_ERROR_STOP sem enviar COMMIT e o servidor faz
-- ROLLBACK do UPDATE da secao 2 - o acervo volta ao estado exato de entrada, com exit
-- code != 0 e mensagem ruidosa. Nao existe janela "escrito mas reprovado".
-- Nota de comportamento: uma quebra de INV-1 (group_id/group_rank NULL) indica acervo
-- pre-backfill, estado que a normalizacao nao produz nem conserta. Antes deste
-- endurecimento a normalizacao ficava aplicada e a falha era apenas ruidosa; agora ela
-- e RECUSADA por inteiro. O reparo continua sendo rodar m067-backfill-verify.sql e so
-- depois reexecutar este script - fail-closed proposital.
DO $$
DECLARE
  v_nulos       bigint;
  v_divergente  bigint;
  v_rank        bigint;
  v_grupos      bigint;
  v_total       bigint;
  v_total_antes bigint;
  v_chk18_antes text;
  v_chk18_agora text;
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
    RAISE EXCEPTION 'M067/022 INV-1 quebrada: % linha(s) com group_id/group_rank NULL (acervo pre-backfill: rodar m067-backfill-verify.sql e reexecutar; normalizacao ROLLBACK, nada escrito)', v_nulos;
  END IF;
  IF v_divergente > 0 THEN
    RAISE EXCEPTION 'M067/022 INV-2 quebrada: % linha(s) com group_id <> id (grupo nao unitario remanescente); normalizacao ROLLBACK, nada escrito', v_divergente;
  END IF;
  IF v_rank > 0 THEN
    RAISE EXCEPTION 'M067/022 INV-3 quebrada: % linha(s) com group_rank <> 0 (linha irma remanescente); normalizacao ROLLBACK, nada escrito', v_rank;
  END IF;
  IF v_grupos <> v_total THEN
    RAISE EXCEPTION 'M067/022 INV-4 quebrada: % grupo(s) distinto(s) para % linha(s) (grupo unitario exige paridade); normalizacao ROLLBACK, nada escrito', v_grupos, v_total;
  END IF;

  -- Escopo travado, verificado (nao apenas declarado): nenhuma noticia apagada e
  -- nenhuma das 18 colunas pre-M067 escrita. Aceites A6 e A8 do item 022.
  SELECT total_antes, checksum18_antes INTO v_total_antes, v_chk18_antes FROM pg_temp.m067_022_antes;

  SELECT md5(string_agg(
           ROW("id", "title", "content", "impact", "sentiment", "asset_ids", "source",
               "is_published", "published_at", "created_at", "updated_at", "status",
               "is_archived", "archived_at", "clicks", "author", "ticker",
               "sentiment_classified_at")::text, E'\n' ORDER BY "id"))
  INTO v_chk18_agora
  FROM "news";

  IF v_total <> v_total_antes THEN
    RAISE EXCEPTION 'M067/022 ESCOPO quebrado: count(*) de news mudou de % para % (perda de noticia nao e normalizacao - stop condition 5 do item 022); normalizacao ROLLBACK, nada escrito', v_total_antes, v_total;
  END IF;
  IF v_chk18_agora IS DISTINCT FROM v_chk18_antes THEN
    RAISE EXCEPTION 'M067/022 ESCOPO quebrado: checksum das 18 colunas pre-M067 mudou (% -> %); a normalizacao escreveu fora de group_id/group_rank; ROLLBACK, nada escrito', v_chk18_antes, v_chk18_agora;
  END IF;

  RAISE NOTICE 'M067/022 OK: % linha(s), % grupo(s) unitario(s), 0 nulo, 0 rank fora de zero, count(*) e 18 colunas pre-M067 intactos. Confirmando (COMMIT).', v_total, v_grupos;
END $$;

\echo
\echo === [M067/022] SECAO 5 - COMMIT (so chega aqui com toda invariante verde) ===
COMMIT;
