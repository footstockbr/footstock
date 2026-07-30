// ============================================================================
// FootStock — newsGroupWriter
// Escrita das linhas de uma noticia multi-time (grupo M067).
// Item 018 do loop 07-28-noticias-multi-time-linha-por-time (ST002).
//
// Por que um modulo separado, e nao um export dentro do NewsInjectionService:
// o POST editorial de `admin/news/route.ts` (ST013) consome o MESMO helper, e
// `NewsInjectionService.ts` importa `@/lib/redis`. O `redisPublisher` e um Proxy
// lazy (src/lib/redis.ts:78-117), entao o import nao abre conexao, mas arrastaria
// `@/lib/redis` e `ioredis` para o grafo do modulo da rota editorial e para a
// superficie de mock da suite dela. Este modulo nao importa nada de Redis.
//
// Escopo deliberadamente estreito: esta funcao NAO resolve asset, NAO monta
// auditoria e NAO publica evento. Os tres continuam no `inject()`, que e quem
// fala com o motor. A rota editorial nao faz nenhum dos tres.
//
// A UNICA concessao e o hook `onPersisted`: escritas que precisam commitar JUNTO
// com as linhas (a auditoria por linha) recebem o MESMO client transacional, em
// vez de rodar depois do commit. Quem decide O QUE gravar continua sendo o
// chamador; este modulo so empresta a fronteira da transacao.
// ============================================================================

import type { ImpactCategory, News, Prisma, Sentiment } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Cap DB-04: CHECK (group_rank BETWEEN 0 AND 2) na migration M067. */
export const NEWS_GROUP_MAX_ROWS = 3

/** Uma linha do grupo, com o asset JA resolvido pelo chamador. */
export interface PlannedNewsGroupRow {
  /** Ticker da linha. `null` so e valido na ancora (noticia sem time vinculado). */
  ticker: string | null
  sentiment: Sentiment
  assetIds: string[]
  /** 0 = ancora (time principal); 1 e 2 = irmaos. */
  rank: number
}

/** Campos iguais em TODAS as linhas do grupo (criterios 1 e 3). */
export interface SharedNewsGroupFields {
  title: string
  content: string
  impact: ImpactCategory
  source: string | null
  isPublished: boolean
  /**
   * UMA instancia de Date reusada por todas as linhas. Recalcular por linha
   * abriria empate instavel na ordenacao do feed (mesma decisao de
   * NewsPublisher.publish).
   */
  publishedAt: Date | null
  /** Opcional: o `inject()` nao grava author, o POST editorial grava. */
  author?: string
}

export interface WriteNewsGroupResult {
  groupId: string
  /** Ids na ordem de rank. `newsIds[0]` e sempre a ancora. */
  newsIds: string[]
  /** Linha da ancora como gravada (com `groupId` ja resolvido). */
  anchor: News
}

/**
 * Client usado para gravar o grupo. No caminho de 2..3 linhas e o client da
 * transacao; no caminho de linha unica e o `prisma` global (`PrismaClient` e
 * atribuivel a `TransactionClient`). Quem recebe este client NAO deve abrir
 * transacao propria nem chamar `$connect`/`$disconnect`.
 */
export type NewsGroupClient = Prisma.TransactionClient

/** Uma linha JA gravada, na ordem de rank. */
export interface PersistedNewsGroupRow {
  newsId: string
  /** `group_rank` efetivo da linha. */
  rank: number
  /** Indice da linha na lista ORIGINAL do chamador (antes do sort por rank). */
  sourceIndex: number
}

export interface WriteNewsGroupOptions {
  /**
   * Escritas que devem commitar JUNTO com as linhas do grupo — na pratica, a
   * auditoria por linha do `inject()`.
   *
   * Grupo (2..3 linhas): roda DENTRO da transacao, depois do ultimo `create`.
   * Se lancar, a transacao inteira reverte: nao existe estado com linhas
   * gravadas e auditoria pela metade (nem o inverso).
   *
   * Linha unica: roda FORA de transacao, imediatamente depois do `create`,
   * porque esse caminho precisa manter as MESMAS chamadas de Prisma do fluxo
   * anterior a M067 (criterio 17) — abrir transacao ali seria regressao de
   * contrato, nao correcao.
   *
   * Publicacao em Redis NUNCA entra aqui: evento antes do commit expoe ao motor
   * um grupo que ainda pode reverter.
   */
  onPersisted?: (client: NewsGroupClient, persisted: PersistedNewsGroupRow[]) => Promise<void>
}

function rowData(
  row: PlannedNewsGroupRow,
  shared: SharedNewsGroupFields,
  extra: Partial<Prisma.NewsUncheckedCreateInput>
): Prisma.NewsUncheckedCreateInput {
  return {
    title: shared.title,
    content: shared.content,
    impact: shared.impact,
    sentiment: row.sentiment,
    ticker: row.ticker,
    assetIds: row.assetIds,
    source: shared.source,
    isPublished: shared.isPublished,
    publishedAt: shared.publishedAt,
    // `author` fica FORA do payload quando o chamador nao o informa, para o
    // caminho de linha unica do injetor continuar identico ao de hoje.
    ...(shared.author !== undefined ? { author: shared.author } : {}),
    ...extra,
  }
}

/**
 * Grava as linhas de uma noticia (1..3) e devolve a identidade do grupo.
 *
 * Linha unica: `prisma.news.create` direto, sem transacao e sem passar
 * `groupId`/`groupRank` — o trigger `news_group_defaults_trg` preenche
 * `group_id = id` e `group_rank = 0` (DB-03). Caminho identico ao anterior a
 * este item (criterio 17).
 *
 * Duas ou tres linhas: espelha `NewsPublisher.persistGroup`
 * (motor/src/news/NewsPublisher.ts:444-482) — cria a ancora com `groupRank: 0`
 * explicito, afirma `groupId = ancora.id` num update, e cria os irmaos com
 * `groupId`/`groupRank` explicitos. Tudo dentro de uma transacao, inclusive o
 * `onPersisted` do chamador: falha em qualquer linha OU na auditoria reverte o
 * grupo inteiro, nenhum grupo nasce parcial.
 */
export async function writeNewsGroup(
  rows: PlannedNewsGroupRow[],
  shared: SharedNewsGroupFields,
  options: WriteNewsGroupOptions = {}
): Promise<WriteNewsGroupResult> {
  if (rows.length === 0) {
    throw new Error('writeNewsGroup: nenhuma linha para gravar')
  }
  if (rows.length > NEWS_GROUP_MAX_ROWS) {
    throw new Error(
      `writeNewsGroup: grupo aceita no maximo ${NEWS_GROUP_MAX_ROWS} linhas (recebeu ${rows.length})`
    )
  }

  // Ranks validados ANTES de qualquer escrita. O CHECK DB-04 só restringe a
  // faixa (BETWEEN 0 AND 2): ele nao exige unicidade nem a presenca da ancora.
  // Um grupo sem `group_rank = 0` nasce invisivel para toda listagem que filtra
  // por ancora (`admin/news/route.ts` GET) — grupo parcial por outro caminho.
  // Ranks duplicados escolheriam a ancora por ordem de entrada, em silencio.
  const ranks = rows.map(row => row.rank)
  for (const rank of ranks) {
    if (!Number.isInteger(rank) || rank < 0 || rank > NEWS_GROUP_MAX_ROWS - 1) {
      throw new Error(
        `writeNewsGroup: rank invalido ${rank} (esperado inteiro entre 0 e ${NEWS_GROUP_MAX_ROWS - 1})`
      )
    }
  }
  if (new Set(ranks).size !== ranks.length) {
    throw new Error(`writeNewsGroup: ranks duplicados no grupo [${ranks.join(', ')}]`)
  }
  if (!ranks.includes(0)) {
    throw new Error(`writeNewsGroup: grupo sem ancora (nenhuma linha com rank 0): [${ranks.join(', ')}]`)
  }

  // `sourceIndex` preservado no sort: `onPersisted` precisa voltar da linha
  // gravada para a linha que o chamador passou, e a ordem de rank nao e
  // garantidamente a ordem de entrada.
  const ordered = rows
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .sort((a, b) => a.row.rank - b.row.rank)

  if (ordered.length === 1) {
    const only = ordered[0]
    const single = (await prisma.news.create({
      data: rowData(only.row, shared, {}),
    })) as News
    await options.onPersisted?.(prisma, [
      { newsId: single.id, rank: only.row.rank, sourceIndex: only.sourceIndex },
    ])
    // `groupId` vem do trigger; o fallback para `id` cobre o mock de teste e a
    // igualdade `groupId === newsId` que DB-03 garante no caso unitario.
    return { groupId: single.groupId ?? single.id, newsIds: [single.id], anchor: single }
  }

  return prisma.$transaction(async (tx) => {
    const anchor = ordered[0]
    const anchorRow = (await tx.news.create({
      data: rowData(anchor.row, shared, { groupRank: anchor.row.rank }),
    })) as News

    const groupId = anchorRow.id
    await tx.news.update({ where: { id: anchorRow.id }, data: { groupId } })

    const persisted: PersistedNewsGroupRow[] = [
      { newsId: anchorRow.id, rank: anchor.row.rank, sourceIndex: anchor.sourceIndex },
    ]
    for (const entry of ordered.slice(1)) {
      const created = (await tx.news.create({
        data: rowData(entry.row, shared, { groupId, groupRank: entry.row.rank }),
      })) as News
      persisted.push({ newsId: created.id, rank: entry.row.rank, sourceIndex: entry.sourceIndex })
    }

    // Auditoria (ou qualquer escrita do chamador) DENTRO da transacao: falha
    // aqui derruba as linhas junto, em vez de deixar prefixo auditado.
    await options.onPersisted?.(tx, persisted)

    // O `create` da ancora rodou ANTES do update de `groupId`, entao a linha que
    // ele devolveu tem `groupId` nulo. Quem le o retorno espera a identidade do
    // grupo ja afirmada.
    return { groupId, newsIds: persisted.map(entry => entry.newsId), anchor: { ...anchorRow, groupId } }
  })
}
