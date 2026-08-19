-- t11-backfill-degenerate-content.sql
-- Uso: cd output/workspace/foot-stock && set -a && . ./.env.deploy && set +a \
--      && psql "$DIRECT_URL" -X -v ON_ERROR_STOP=1 -f footstock-next/prisma/scripts/t11-backfill-degenerate-content.sql
-- Rastreabilidade: loop 08-18-foot-stock-motor-noticias-analise, item 012 (T-11).
-- POR QUE ESTE ARQUIVO EXISTE: o passivo de noticias gravadas com content em
--   ('null','undefined','') e anterior a contencao de T-10. Este script troca content
--   pelo title nessas linhas, uma unica vez, sob snapshot reversivel.
-- O QUE ELE NAO REVERTE: nao restaura o content original (nao existe - o produtor
--   nunca gravou texto util nessas linhas); nao altera is_published, is_archived,
--   status, group_id, group_rank nem updated_at; nao impede reincidencia (isso e T-10).

BEGIN;

SET LOCAL TimeZone = 'UTC';
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE "news" IN SHARE ROW EXCLUSIVE MODE;

-- G1: produtor quieto, verificado DENTRO do lock (fecha a corrida do pre-flight)
DO $$
DECLARE v_ins_3h bigint;
BEGIN
  SELECT count(*) INTO v_ins_3h
    FROM news
   WHERE content IN ('null','undefined','')
     AND created_at > now()::timestamp - interval '3 hours';
  IF v_ins_3h > 0 THEN
    RAISE EXCEPTION 'G1 ABORT: % linha(s) degenerada(s) nas ultimas 3h; produtor ativo (T-10 nao contendo em producao)', v_ins_3h;
  END IF;
END $$;

-- G2: todo alvo tem titulo saudavel (content := title nao pode gerar lixo novo)
DO $$
DECLARE v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
    FROM news
   WHERE content IN ('null','undefined','')
     AND (title IS NULL OR btrim(title) = '' OR title IN ('null','undefined'));
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'G2 ABORT: % linha(s) alvo com titulo degenerado', v_bad;
  END IF;
END $$;

-- Snapshot de undo: linha inteira, no padrao de news_seed_backup_20260803
CREATE TABLE news_content_backfill_t11 AS
SELECT n.*,
       now()::timestamp                        AS backfilled_at,
       'backfill_content_from_title_t11'::text AS backfill_marker
  FROM news n
 WHERE n.content IN ('null','undefined','');

CREATE UNIQUE INDEX news_content_backfill_t11_id_key ON news_content_backfill_t11 (id);

-- UPDATE + invariantes pre-COMMIT
DO $$
DECLARE v_snap bigint; v_upd bigint; v_left bigint; v_mismatch bigint;
BEGIN
  SELECT count(*) INTO v_snap FROM news_content_backfill_t11;
  IF v_snap = 0 THEN
    RAISE EXCEPTION 'INV-0 ABORT: snapshot vazio, nada a backfillar';
  END IF;

  UPDATE news n
     SET content = n.title
    FROM news_content_backfill_t11 b
   WHERE n.id = b.id
     AND n.content IN ('null','undefined','');
  GET DIAGNOSTICS v_upd = ROW_COUNT;

  IF v_upd <> v_snap THEN
    RAISE EXCEPTION 'INV-1 ABORT: atualizadas % linhas, snapshot tem %', v_upd, v_snap;
  END IF;

  SELECT count(*) INTO v_left FROM news WHERE content IN ('null','undefined','');
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'INV-2 ABORT: restaram % linha(s) degenerada(s) apos o UPDATE', v_left;
  END IF;

  SELECT count(*) INTO v_mismatch
    FROM news n
    JOIN news_content_backfill_t11 b ON b.id = n.id
   WHERE n.content IS DISTINCT FROM n.title OR btrim(n.content) = '';
  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'INV-3 ABORT: % linha(s) com content <> title apos o UPDATE', v_mismatch;
  END IF;

  RAISE NOTICE 'OK: % linhas backfilled; snapshot news_content_backfill_t11 com % linhas', v_upd, v_snap;
END $$;

COMMIT;

-- backfill_start da pos-condicao da trava = max(backfilled_at) do snapshot
SELECT max(backfilled_at) AS backfill_start,
       count(*)           AS linhas_snapshot
  FROM news_content_backfill_t11;
