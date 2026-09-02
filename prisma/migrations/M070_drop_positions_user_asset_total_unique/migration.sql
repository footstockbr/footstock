-- ============================================================================
-- M070 (espelho de paridade de dev) — DROP do indice unico total em positions.
--
-- A migration CANONICA, que o CI aplica em producao, e
-- footstock-next/prisma/migrations/20260902120000_M070-drop-positions-user-asset-total-unique/.
-- Este diretorio existe apenas para que um banco de desenvolvimento criado a
-- partir do schema RAIZ (o do motor) chegue ao mesmo estado.
--
-- DELIBERADAMENTE SO O DROP. O CREATE do parcial vive na migration canonica; ter
-- duas fontes criando o mesmo indice e como M021 acumulou drift. Se este espelho
-- rodar sozinho num banco sem o parcial, a regra "uma posicao aberta por
-- (usuario, ativo, lado)" fica sem indice — condicao aceitavel em dev, nunca em
-- producao, onde a canonica sempre roda.
--
-- Nome de pasta sem prefixo de timestamp, seguindo a convencao das demais
-- migrations desta arvore (M045..M054), para ordenar depois de M021.
-- ============================================================================

DROP INDEX IF EXISTS "positions_user_id_asset_id_key";
