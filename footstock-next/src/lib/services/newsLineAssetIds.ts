// ============================================================================
// FootStock — newsLineAssetIds
// Decisao canonica de escrita de `assetIds` em caminho de ATUALIZACAO de linha
// de noticia (grupo M067).
// Item 019 do loop 07-28-noticias-multi-time-linha-por-time (ST002).
//
// DB-19 (source.md:1101), metade da condicao C9 (source.md:882): todo escritor de
// `assetIds` aprende semantica de grupo ANTES de o flag multi-time ligar. Tres
// clausulas literais:
//   1. nunca substituir `assetIds` por array de um elemento quando a linha
//      pertence a grupo multi-time;
//   2. nunca escrever cruzando `group_id`;
//   3. `assetIds: [x]` so e aceitavel em CRIACAO de linha nova.
//
// No desenho B cada linha e um time (criterio 37), entao o dano que DB-19 evita
// nao e "linha com um asset so" — e ACHATAR o grupo: apagar o vinculo de uma
// linha que tem irmaos vivos, carimbar nela o asset de um irmao, ou escrever com
// `where` de grupo.
//
// Por que modulo proprio e nao helper local: sao 4 rotas + 1 cron aplicando a
// MESMA decisao. O item 017 deixou `logGroupScopeFallback` duplicado em duas
// rotas e isso ja e finding registrado. A funcao e PURA — nao abre Prisma, nao
// loga por si — para a suite testar a decisao sem harness de rota.
//
// CONSOMEM este helper (os 6 escritores de atualizacao do censo 4.4 do
// PREFLIGHT-REPORT, 7 statements):
//   E3a  src/app/api/v1/admin/news/[id]/route.ts               (sync por ticker, par if/else)
//   E3b  src/app/api/v1/admin/news/[id]/route.ts               (fallback de publicacao)
//   E5   src/app/api/v1/admin/news/editorial/[id]/route.ts     (PATCH ticker)
//   E6   src/app/api/v1/admin/news/editorial/[id]/route.ts     (fallback de status; inalcancavel desde 017/ST005)
//   E7   src/app/api/v1/admin/news/batch-resolve/route.ts      (atualizacao em lote)
//   E8   src/app/api/cron/reconcile-null-tickers/route.ts      (atualizacao por cron)
//
// NAO consomem, deliberadamente — sao os 7 statements de CRIACAO que a clausula 3
// de DB-19 autoriza:
//   E1   motor/src/news/NewsPublisher.ts:499                   (rowData do publisher)
//   E2   src/app/api/v1/admin/news/route.ts:188                (criacao de linha unica)
//        src/app/api/v1/admin/news/route.ts:224                (plano da ancora, item 018)
//        src/app/api/v1/admin/news/route.ts:241                (plano dos irmaos, item 018)
//   E4   src/app/api/v1/admin/news/editorial/route.ts:240      (criacao editorial)
//        src/lib/services/newsGroupWriter.ts:112               (pass-through de row.assetIds, item 018)
//        src/lib/services/NewsInjectionService.ts:190          (plano de linha do fan-out, item 018)
//
// Duas invariantes de CHAMADA que este helper nao pode verificar (ele nao ve o
// `where`) e que a suite DB-19 prova:
//   I-linha:  todo `update` que carrega `assetIds` usa `where: { id }`. Nunca
//             `where: { groupId }`, nunca `updateMany` com `assetIds` no `data`.
//   I-leitura-de-grupo: `siblingAssetIds` e `siblingCount` vem de UMA consulta por
//             request (`findMany({ where: { groupId, NOT: { id } }, select: { id, assetIds } })`),
//             so quando `groupId != null`. `groupId` nulo = sem irmaos conhecidos:
//             cai no caminho de linha unica e o chamador registra o fallback.
//
// Correcao de conformidade (recovery do review do item 019): a regra 2 media "irmao
// vivo" por `siblingAssetIds.length > 0`, que e um PROXY mais estreito do que o
// criterio de aceite 4 ("limpar vinculo de linha com irmaos VIVOS e recusado") e do
// que o paragrafo de intencao acima. Grupo cujos irmaos existem com `assetIds: []`
// era invisivel ao `flatMap` de `siblingAssetIdsFrom`, entao limpar a linha passava
// e o grupo ficava com ZERO vinculos — exatamente o achatamento que DB-19 proibe.
// `siblingCount` e a contagem de irmaos vivos e e OBRIGATORIA (nao opcional com
// fallback) para que o compilador force cada chamador a declarar o estado de grupo:
// param opcional silenciaria a regra em quem esquecesse de passa-la (Zero Assumido).
// ============================================================================

/** Estado em disco da linha que o chamador esta a ponto de atualizar. */
export interface NewsLineAssetContext {
  id: string
  groupId: string | null
  groupRank: number | null
  assetIds: string[]
}

export type LineAssetIdsSkipReason =
  | 'unchanged'            // a linha ja aponta exatamente para o asset resolvido
  | 'legacy-multi-asset'   // linha com >1 asset: escrever [x] seria o achatamento que DB-19 proibe
  | 'sibling-owns-asset'   // outro irmao do grupo ja e desse time: duas linhas no mesmo time achatam o grupo
  | 'group-row-clear'      // limpar vinculo de linha que tem irmaos vivos deixa o grupo mutilado

export type LineAssetIdsDecision =
  | { action: 'write'; assetIds: string[] }
  | { action: 'skip'; reason: LineAssetIdsSkipReason }

/**
 * Decide se `assetIds` pode entrar no `data` de um `update` de linha.
 *
 * Regras, na ordem (a primeira que casa decide):
 *   1. `current.assetIds.length > 1` -> skip `legacy-multi-asset` (clausula 1 de DB-19:
 *      linha de acervo pre-M067 com mais de um asset nao pode virar array de um elemento).
 *   2. limpar (`resolvedAssetId === null`) com irmao vivo (`siblingCount > 0`, tenha ele
 *      asset ou nao) -> skip `group-row-clear`.
 *   3. limpar sem irmao nenhum -> `write: []` (comportamento atual da linha unica; criterio 17).
 *   4. asset resolvido ja pertence a um irmao -> skip `sibling-owns-asset`.
 *   5. a linha ja aponta exatamente para ele -> skip `unchanged` (idempotencia; evita
 *      escrita e log de ruido nos crons).
 *   6. senao -> `write: [resolvedAssetId]`.
 */
export function decideLineAssetIds(input: {
  current: NewsLineAssetContext
  /** Asset resolvido pelo chamador; `null` = intencao de limpar o vinculo. */
  resolvedAssetId: string | null
  /** `assetIds` das OUTRAS linhas do mesmo `group_id`. Vazio quando a linha e unica ou `group_id` e nulo. */
  siblingAssetIds: string[]
  /**
   * Quantas linhas IRMAS vivas o mesmo `group_id` tem, com ou sem asset. Zero quando a
   * linha e unica ou `group_id` e nulo. NAO derivavel de `siblingAssetIds`: irmao com
   * `assetIds: []` conta aqui e nao aparece la.
   */
  siblingCount: number
}): LineAssetIdsDecision {
  const { current, resolvedAssetId, siblingAssetIds, siblingCount } = input

  if (current.assetIds.length > 1) {
    return { action: 'skip', reason: 'legacy-multi-asset' }
  }

  if (resolvedAssetId === null) {
    if (siblingCount > 0) {
      return { action: 'skip', reason: 'group-row-clear' }
    }
    return { action: 'write', assetIds: [] }
  }

  if (siblingAssetIds.includes(resolvedAssetId)) {
    return { action: 'skip', reason: 'sibling-owns-asset' }
  }

  if (current.assetIds.length === 1 && current.assetIds[0] === resolvedAssetId) {
    return { action: 'skip', reason: 'unchanged' }
  }

  return { action: 'write', assetIds: [resolvedAssetId] }
}

/**
 * Achata as linhas irmas lidas do banco na lista de `assetIds` que o helper
 * espera. Existe para os cinco chamadores nao repetirem o mesmo `flatMap` e para
 * a forma de leitura (I-leitura-de-grupo) ficar declarada num lugar so.
 */
export function siblingAssetIdsFrom(
  rows: Array<{ id: string; assetIds: string[] }>,
  currentId: string,
): string[] {
  return rows.filter(row => row.id !== currentId).flatMap(row => row.assetIds)
}

/**
 * Conta as linhas IRMAS vivas nas rows lidas do banco. Existe porque
 * `siblingAssetIdsFrom` PERDE o irmao sem asset (o `flatMap` de `[]` desaparece) e a
 * regra 2 de `decideLineAssetIds` depende de existencia de irmao, nao de posse de
 * asset. Recebe as MESMAS rows da consulta unica de grupo (I-leitura-de-grupo): nao
 * abre consulta propria.
 */
export function siblingCountFrom(
  rows: Array<{ id: string; assetIds: string[] }>,
  currentId: string,
): number {
  return rows.filter(row => row.id !== currentId).length
}
