-- t11-backfill-verify.sql
-- Uso: psql "$DIRECT_URL" -X -v ON_ERROR_STOP=1 -f footstock-next/prisma/scripts/t11-backfill-verify.sql
-- Rastreabilidade: loop 08-18-foot-stock-motor-noticias-analise, item 012 (T-11).
-- POR QUE ESTE ARQUIVO EXISTE: e o pre-flight (antes) e o aceite (depois) do backfill.
-- O QUE ELE NAO REVERTE: nao escreve nada; e estritamente leitura.
--
-- DIVERGENCIA DECLARADA em relacao ao SQL literal da task (item 012, ST004):
--   os dois ultimos blocos referenciam news_content_backfill_t11, que so existe
--   DEPOIS do backfill. Rodar o arquivo como pre-flight com ON_ERROR_STOP=1
--   abortaria em "relation does not exist" e o proprio ST001 nao teria pre-flight.
--   Guarda-se os dois blocos atras de to_regclass para que o arquivo sirva mesmo
--   aos dois momentos, como a task exige. Nenhuma assercao foi afrouxada: a
--   asercao primaria (degenerados_absoluto) roda sempre.

\echo '== pre-flight / estado por classe e fonte =='
SELECT CASE WHEN content = 'null'      THEN 'literal-null'
            WHEN content = 'undefined' THEN 'literal-undefined'
            WHEN content = ''          THEN 'vazio' END               AS classe,
       source,
       count(*)                                                        AS total,
       max(created_at)                                                 AS ultima_insercao,
       count(*) FILTER (WHERE created_at > now()::timestamp - interval '3 hours') AS ins_3h
  FROM news
 WHERE content IN ('null','undefined','')
 GROUP BY 1, 2
 ORDER BY total DESC;

\echo '== ASERCAO PRIMARIA: deve retornar exatamente 0 =='
SELECT count(*) AS degenerados_absoluto
  FROM news
 WHERE content IN ('null','undefined','');

SELECT (to_regclass('public.news_content_backfill_t11') IS NOT NULL) AS snap_exists \gset

\if :snap_exists

\echo '== diagnostico: linhas degeneradas criadas apos o backfill (atribuicao de causa) =='
SELECT count(*) AS degenerados_novos
  FROM news
 WHERE content IN ('null','undefined','')
   AND created_at > (SELECT max(backfilled_at) FROM news_content_backfill_t11);

\echo '== amostra de 10 linhas backfilladas (conferencia manual) =='
SELECT n.id,
       n.source,
       n.is_published,
       n.created_at,
       left(b.content, 20) AS content_antes,
       left(n.content, 80) AS content_depois,
       left(n.title,   80) AS title
  FROM news n
  JOIN news_content_backfill_t11 b ON b.id = n.id
 ORDER BY n.created_at DESC
 LIMIT 10;

\else

\echo '== modo PRE-FLIGHT: news_content_backfill_t11 ainda nao existe =='
\echo '== (diagnostico temporal e amostra so fazem sentido depois do backfill) =='
\echo '== ATENCAO: neste modo a asercao primaria acima NAO distingue "backfill funcionou" =='
\echo '== de "nao havia passivo". Rodar este arquivo de novo apos ST003 para o veredito. =='

\endif
