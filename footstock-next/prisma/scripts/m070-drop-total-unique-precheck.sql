-- ============================================================================
-- Precheck READ-ONLY de M070. Nao altera nada; aborta com erro se o banco nao
-- estiver em estado seguro para derrubar positions_user_id_asset_id_key.
--
-- Uso:
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 \
--     -f prisma/scripts/m070-drop-total-unique-precheck.sql
--
-- ON_ERROR_STOP=1 e OBRIGATORIO: sem ele o psql imprime o RAISE EXCEPTION e sai
-- com codigo 0, e um precheck que reprova em silencio e pior que precheck nenhum.
-- ============================================================================

\echo '--- indices de positions antes de M070 ---'
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'positions'
  AND indexname IN ('positions_user_id_asset_id_key', 'positions_user_asset_side_key')
ORDER BY indexname;

DO $$
DECLARE
  pares_dup   bigint;
  trios_dup   bigint;
  tem_parcial boolean;
BEGIN
  -- 1. Duplicatas no TRIO (user_id, asset_id, side) entre posicoes OPEN.
  --    Este e o guard que importa: e o predicado exato do indice parcial. Se
  --    houver trio repetido, o CREATE UNIQUE INDEX da migration falha e o deploy
  --    inteiro para. Contar apenas o PAR daria falso negativo — dois lados
  --    diferentes do mesmo ativo sao um par repetido e um trio legitimo.
  SELECT count(*) INTO trios_dup FROM (
    SELECT user_id, asset_id, side
    FROM positions
    WHERE status = 'OPEN'
    GROUP BY user_id, asset_id, side
    HAVING count(*) > 1
  ) d;

  -- 2. Duplicatas no PAR, informativas. Depois do DROP elas passam a ser
  --    permitidas de proposito (LONG e SHORT no mesmo ativo).
  SELECT count(*) INTO pares_dup FROM (
    SELECT user_id, asset_id
    FROM positions
    WHERE status = 'OPEN'
    GROUP BY user_id, asset_id
    HAVING count(*) > 1
  ) d;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'positions' AND indexname = 'positions_user_asset_side_key'
  ) INTO tem_parcial;

  RAISE NOTICE 'trios (user,asset,side) duplicados entre OPEN: %', trios_dup;
  RAISE NOTICE 'pares (user,asset) duplicados entre OPEN: %', pares_dup;
  RAISE NOTICE 'indice parcial positions_user_asset_side_key presente: %', tem_parcial;

  IF trios_dup > 0 THEN
    RAISE EXCEPTION
      'M070 BLOQUEADA: % trio(s) (user_id, asset_id, side) duplicado(s) entre positions OPEN. '
      'Consolidar as posicoes duplicadas antes de aplicar a migration.', trios_dup;
  END IF;

  RAISE NOTICE 'M070 LIBERADA: seguro derrubar positions_user_id_asset_id_key.';
END
$$;

-- ============================================================================
-- Contexto para quem for consolidar duplicatas na mao: TRES lugares escrevem em
-- positions e todos precisam continuar valendo depois do DROP.
--   - motor/src/engine/settlement.ts:146        (liquidacao de ordem)
--   - footstock-next/.../TransactionService.ts:136
--   - footstock-next/.../ShortService.ts:103    (abertura de posicao vendida)
-- O parcial que sobra ja cobre os tres: um deles so pode ter uma posicao ABERTA
-- por (usuario, ativo, lado); posicoes CLOSED sao livres, que e exatamente o que
-- o indice total impedia.
-- ============================================================================
