-- ============================================================================
-- M070 — Remove o indice unico TOTAL positions_user_id_asset_id_key
--
-- POR QUE ELE EXISTE. M021 tentou substituir o unico total pelo parcial:
--
--     ALTER TABLE positions DROP CONSTRAINT IF EXISTS "positions_user_id_asset_id_key";
--     CREATE UNIQUE INDEX IF NOT EXISTS "positions_user_asset_side_key" ...
--
-- A primeira linha nunca fez nada. positions_user_id_asset_id_key foi criado por
-- CREATE UNIQUE INDEX, entao vive em pg_class/pg_indexes e NAO em pg_constraint;
-- DROP CONSTRAINT nao alcanca indice que nao seja constraint, e o IF EXISTS
-- transformou o erro de classe em no-op silencioso. Resultado: os DOIS indices
-- convivem em producao desde M021, e quem manda e o mais restritivo.
--
-- O QUE ISSO QUEBRA. O total ignora status. Uma posicao CLOSED (quantity=0) ocupa
-- o par (user_id, asset_id) para sempre, entao a proxima compra do MESMO ativo
-- pelo MESMO usuario falha no position.create do settlement, dentro da transacao
-- Serializable. A ordem MARKET nunca liquida e fica OPEN ate alguem cancelar.
-- Verificado em producao em 2026-09-02: das 9 ordens MARKET de 30/08 a 01/09,
-- as 8 canceladas tinham posicao CLOSED no par; a unica FILLED tinha posicao
-- OPEN (caminho position.update, que nao insere linha e por isso passa).
--
-- O QUE ESTA MIGRATION FAZ. Apenas derruba o total. O parcial correto
-- (positions_user_asset_side_key, com WHERE status = 'OPEN') ja existe em
-- producao desde M021 e continua sendo a regra de negocio: no maximo uma posicao
-- ABERTA por (usuario, ativo, lado), e quantas CLOSED forem necessarias.
--
-- SEGURANCA. Verificado read-only em producao antes de escrever esta migration:
-- 0 pares duplicados e 0 trios duplicados entre positions OPEN, e 0 ordens
-- MARKET nao-terminais pendentes. Derrubar o total nao afrouxa nada que o
-- parcial ja nao garanta, e nao ha backlog de ordens presas para liquidar de
-- uma vez no primeiro tick apos o deploy.
--
-- NAO USAR CONCURRENTLY: prisma migrate deploy envolve cada migration em uma
-- transacao e DROP INDEX CONCURRENTLY e proibido em bloco transacional (25001).
-- DROP INDEX simples pega ACCESS EXCLUSIVE em positions por alguns milissegundos
-- — aceitavel para uma tabela desta ordem de grandeza.
--
-- Precheck manual (opcional, read-only): prisma/scripts/m070-drop-total-unique-precheck.sql
-- ============================================================================

DROP INDEX IF EXISTS "positions_user_id_asset_id_key";

-- Rede de seguranca: recria o parcial correto caso algum ambiente tenha perdido
-- o CREATE de M021. A definicao abaixo e IDENTICA a de M021 (mesmas colunas,
-- mesma ordem, mesmo predicado). Em producao isto e no-op — o indice ja existe.
CREATE UNIQUE INDEX IF NOT EXISTS "positions_user_asset_side_key"
  ON positions (user_id, asset_id, side)
  WHERE status = 'OPEN';
