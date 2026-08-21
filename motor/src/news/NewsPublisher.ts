// ============================================================================
// FootStock Motor — NewsPublisher
// Persiste notícia classificada no DB + publica no Redis (condicional).
//
// M067 / item 013 do loop 07-28-noticias-multi-time-linha-por-time:
// escrita das N linhas do grupo em TRANSAÇÃO ÚNICA e publicação dos N eventos
// APÓS o commit, com `correlationId = groupId`. O fan-out é gatilhado pelo flag
// NEWS_MULTI_TEAM_ENABLED, entregue DESLIGADO (D1..D6). Com o flag desligado o
// caminho é byte-a-byte o de hoje: uma linha, um evento, `correlationId = newsId`.
//
// Item 014 do mesmo loop:
//  - falha de persistência é RUIDOSA (`news_publish_db_failed` + `NewsPersistenceError`
//    propagada), nunca mais um `return` mudo — o chamador precisa poder desmarcar
//    o item como processado e reprocessá-lo no ciclo seguinte (critério 6);
//  - marcador durável `impactDispatchedAt` (DB-12, opção O1 da seção 10.6),
//    gravado com o MESMO timestamp no despacho bem-sucedido e na decisão de NÃO
//    despachar por gate — o que distingue os dois casos é a ausência de evento no
//    Redis, não o valor gravado (leitura A8, fechada pelo operador em 2026-07-29:
//    TIMESTAMPTZ só, sem coluna de estado, sem migration nova).
//
// Rastreabilidade: INT-046, INT-049; critérios 1, 2, 3, 4, 6, 27, 29 e 36 da seção 12.
// ============================================================================

import type Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { ImpactCategory, MULTI_TEAM_CAP } from './types'
import type { TeamSignalOrigin } from './types'
import { decideEditorialPublication } from './editorial-gate'
import type { EditorialDecision } from './editorial-gate'
import { logger } from '../utils/logger'
import type { RawNewsItem } from './NewsQueue'
import { normalizeNewsText } from './news-text'
import type { ClassifiedNews } from './NewsClassifier'
import {
  NEWS_INJECT_CHANNEL,
  sentimentToDurationTicks,
} from '../contracts/news-inject-contract'
import { IMPACT_MAGNITUDE } from './types'
import type { NewsInjectEvent } from '../types/events.types'

// ---------------------------------------------------------------------------
// Threshold de relevância para publicar no Redis e disparar notificações
// ---------------------------------------------------------------------------

const RELEVANCE_THRESHOLD = 0.3

// ---------------------------------------------------------------------------
// Flag de runtime do fan-out multi-time (item 013; kill switch do item 022)
// ---------------------------------------------------------------------------

/** Nome da variável de ambiente que liga o fan-out multi-time. */
export const NEWS_MULTI_TEAM_FLAG = 'NEWS_MULTI_TEAM_ENABLED' as const

/**
 * `true` somente quando a variável vale exatamente `true` (case-insensitive,
 * com trim). Qualquer outro valor — ausente, vazio, `1`, `yes`, lixo — resolve
 * para DESLIGADO: o default é o comportamento de hoje, e ligar a feature tem
 * que ser um ato explícito.
 *
 * Lida a CADA publicação, de propósito, e não no carregamento do módulo (como
 * `config/env.ts` faz com as demais flags). Motivo: este é o kill switch do
 * runbook do item 022 e o gatilho de reversão de G13 — o valor precisa ser
 * observável no ponto de decisão, sem depender de ordem de import. A convenção
 * de ler `process.env` no ponto de uso já é a do módulo de notícias
 * (`ai-provider.ts`, `NewsClassifier.ts`).
 */
export function isMultiTeamFanOutEnabled(): boolean {
  return (process.env[NEWS_MULTI_TEAM_FLAG] ?? 'false').trim().toLowerCase() === 'true'
}

// ---------------------------------------------------------------------------
// Motivos de NÃO despachar impacto — os dois gates NÃO se colapsam
// ---------------------------------------------------------------------------

/**
 * Gate de relevância (`relevance > 0.3`) vale para o GRUPO inteiro e é aplicado
 * ANTES do gate de confidence. Gate de confidence (`>= 0.6`, só ranks 1 e 2, já
 * materializado pelo classificador em `origin === 'low_confidence'`) é aplicado
 * DEPOIS, por linha. Um grupo reprovado na relevância não despacha nada, mesmo
 * com confidence alto em todos os times.
 *
 * Os dois motivos precisam permanecer distinguíveis no log (e no marcador
 * persistido do item 014). NUNCA colapsar num único "não despachou".
 */
export type DispatchSkipReason =
  | 'relevance_gate'        // grupo inteiro reprovado por relevance <= 0.3
  | 'low_confidence'        // linha de rank 1 ou 2 abaixo do limiar da versão
  | 'ticker_unresolved'     // nenhum ticker resolvido para a linha
  | 'editorial_blocked'     // grupo não publicado pelo gate editorial de escopo
  | 'degraded_publication'  // publicado sem LLM (heurística) — não move preço

// ---------------------------------------------------------------------------
// Falha ruidosa de persistência (item 014, critério 6)
// ---------------------------------------------------------------------------

/**
 * Lançada quando a escrita da notícia no banco falha.
 *
 * Existe para que a falha seja DISTINGUÍVEL pelo chamador: o worker
 * (`NewsClassifier.startClassifying`) precisa saber que este item específico não
 * chegou ao banco para desmarcá-lo do set de dedup do RSS e deixá-lo voltar no
 * ciclo seguinte. Antes do item 014 o publisher engolia o erro com um `return`
 * mudo e o item ficava marcado como processado por 48h — a notícia era perdida
 * em silêncio, sem sinal nenhum além de uma linha de log em texto livre.
 *
 * Carrega o item bruto (e não só a URL) para que o chamador não precise
 * reconstruir contexto a partir da mensagem.
 */
export class NewsPersistenceError extends Error {
  readonly item: RawNewsItem

  constructor(item: RawNewsItem, cause: Error) {
    super(`[NewsPublisher] Falha ao persistir noticia '${item.url}': ${cause.message}`)
    this.name = 'NewsPersistenceError'
    this.item = item
    this.cause = cause
  }
}

/**
 * Lançada quando algo falha DEPOIS que as linhas já foram commitadas.
 *
 * É a contraparte exata da `NewsPersistenceError` e existe pelo mesmo motivo:
 * dizer ao worker o que fazer com o set de dedup. Aqui a resposta é o oposto —
 * a notícia ESTÁ no banco, então desmarcar a URL faria o RSS trazê-la de volta
 * no ciclo seguinte e gravar uma SEGUNDA linha do mesmo fato. Duplicata no feed
 * é justamente uma das falhas que este trabalho está consertando.
 *
 * Sem este tipo, o worker teria de adivinhar de que lado da transação veio um
 * erro genérico e escolher entre perder notícia (nunca desmarcar) ou duplicar
 * notícia (sempre desmarcar). Com ele, cada lado é explícito.
 */
export class NewsDispatchError extends Error {
  readonly item: RawNewsItem
  readonly groupId: string

  constructor(item: RawNewsItem, groupId: string, cause: Error) {
    super(`[NewsPublisher] Falha pós-commit no grupo '${groupId}': ${cause.message}`)
    this.name = 'NewsDispatchError'
    this.item = item
    this.groupId = groupId
    this.cause = cause
  }
}

// ---------------------------------------------------------------------------
// Tipos internos de plano de escrita
// ---------------------------------------------------------------------------

/** Uma linha a ser gravada, já com o asset resolvido. */
interface PlannedRow {
  /** Ticker do time. `''` quando nenhum time foi resolvido (linha legada sem ticker). */
  ticker: string
  /** Sentimento DESTA linha (0 quando `origin === 'low_confidence'`). */
  sentiment: number
  /** Posição no grupo. 0 = âncora. */
  rank: number
  /** Procedência do sinal — decide o gate de confidence sem reinferir por sentiment. */
  origin: TeamSignalOrigin
  /** UUID do asset resolvido, ou `null` quando o ticker não existe em `assets`. */
  assetId: string | null
}

/** Linha já gravada, pronta para virar evento. */
interface PersistedRow extends PlannedRow {
  newsId: string
}

// Superfície mínima do PrismaClient usada aqui. GAP-014: o client gerado pode
// não incluir o modelo `news` no tipo estático quando o motor roda no Railway
// com client separado, por isso a asserção tipada em vez de `any`.
type NewsWriteDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string }>
}
type NewsDelegate = NewsWriteDelegate & {
  updateMany: (args: {
    where: { id: { in: string[] } }
    data: Record<string, unknown>
  }) => Promise<{ count: number }>
}
type AssetDelegate = {
  findUnique: (args: { where: { ticker: string }; select: { id: boolean } }) => Promise<{ id: string } | null>
}
/**
 * Client transacional entregue por `$transaction` ao callback. Só expõe o que a
 * escrita do grupo usa: `updateMany` fica de fora de propósito, porque o marcador
 * de despacho (item 014) é gravado DEPOIS do commit, nunca dentro da transação.
 */
type NewsTxClient = { news: NewsWriteDelegate }
type PrismaLike = {
  news: NewsDelegate
  asset: AssetDelegate
  $transaction: <T>(fn: (tx: NewsTxClient) => Promise<T>) => Promise<T>
}

// ---------------------------------------------------------------------------
// Classe NewsPublisher
// ---------------------------------------------------------------------------

export class NewsPublisher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async publish(raw: RawNewsItem, classified: ClassifiedNews): Promise<void> {
    const multiTeam = isMultiTeamFanOutEnabled()
    const impact = this.resolveImpactCategory(classified.impactCategory)
    // DB-02: os irmãos compartilham `published_at`. Uma única instância de Date
    // é reusada por todas as linhas — recalcular por linha abriria empate
    // instável na ordenação do feed (P12).
    const publishedAt = new Date(raw.publishedAt)
    // Critério 36: o motor grava `sentimentClassifiedAt` na PRÓPRIA escrita,
    // tornando a linha inelegível ao cron `classify-news-sentiment` do Next
    // (critério 24). Vale nos dois estados do flag: o flag governa o fan-out,
    // não a procedência do sentimento. O item 014 mantém este campo ao
    // acrescentar o marcador de despacho (`impactDispatchedAt`).
    const sentimentClassifiedAt = new Date()

    // -----------------------------------------------------------------------
    // Passo 1 — Planejar as linhas (1 linha com flag desligado; N com ligado)
    // -----------------------------------------------------------------------
    const planned = this.planRows(raw, classified, multiTeam)

    // -----------------------------------------------------------------------
    // Passo 2 — Resolver assets e gravar em TRANSAÇÃO ÚNICA (critério 2)
    // -----------------------------------------------------------------------
    let persisted: PersistedRow[]
    let groupId: string
    let editorial: EditorialDecision

    try {
      const prismaLike = this.prisma as unknown as PrismaLike

      // A resolução de asset é leitura e fica FORA da transação de escrita, como
      // hoje: manter `findUnique` dentro alongaria a transação por N round-trips
      // sem ganho de atomicidade (o asset não é escrito aqui).
      const withAssets = await this.resolveAssets(prismaLike, planned)

      // ---------------------------------------------------------------------
      // Gate editorial de escopo (autoritativo). Roda DEPOIS de resolveAssets
      // porque a decisão depende de `assetId`: "existe na tabela `assets`" é a
      // definição operacional de time local. Roda ANTES da persistência porque
      // o veredito é o próprio valor de `isPublished` — a linha continua sendo
      // gravada (o admin precisa ver o que foi barrado e por quê), mas não
      // aparece para o usuário final.
      // ---------------------------------------------------------------------
      editorial = decideEditorialPublication({
        fallbackReason: classified.fallbackReason ?? null,
        rows: withAssets,
        title: raw.title,
      })

      logger.info(JSON.stringify({
        event: 'news_publisher_persist',
        title: raw.title.slice(0, 80),
        multi_team_enabled: multiTeam,
        classified_ticker: classified.ticker || null,
        classified_relevance: classified.relevance,
        classified_impact: classified.impactCategory,
        classifier_fallback_reason: classified.fallbackReason ?? null,
        editorial_publish: editorial.publish,
        editorial_block_reason: editorial.blockReason,
        editorial_degraded: editorial.degraded,
        rows: withAssets.map((row) => ({
          ticker: row.ticker || null,
          rank: row.rank,
          origin: row.origin,
          asset_id_resolved: row.assetId,
        })),
        will_persist_ticker: !!classified.ticker,
      }))

      const grouped = withAssets.length > 1
      const persistCtx = { raw, impact, publishedAt, sentimentClassifiedAt, grouped, editorial }

      // M054: persistir flag de publicação degradada. Quando editorial.degraded
      // é true, a notícia foi publicada sem classificação LLM (heurística
      // determinística). O flag sentimentDegraded permite que a consulta de
      // janela de sentimento (task-007) exclua essas notícias do cálculo.
      const sentimentDegraded = editorial.degraded

      // Grupo de N linhas: transação única (critério 1). Grupo unitário (flag
      // desligado, ou uma única linha elegível): `create` direto, SEM transação.
      // Uma escrita só já é atômica no Postgres, e abrir `$transaction`
      // interativa aqui introduziria um modo de falha que o caminho de hoje não
      // tem (o adapter `PrismaPg` aplica maxWait/timeout próprios, então sob
      // contenção de pool a escrita passaria a poder falhar com P2028).
      // Decisão do operador em 2026-07-29 (F-01/F-02 do review do item 013):
      // com o flag desligado o comportamento permanece o de hoje, EXCETO
      // `sentimentClassifiedAt`, que o critério 36 exige nos dois estados do flag.
      const result = grouped
        ? await prismaLike.$transaction(async (tx) => this.persistGroup(tx, withAssets, persistCtx))
        : await this.persistGroup(prismaLike, withAssets, persistCtx)

      persisted = result.rows
      groupId = result.groupId
    } catch (err) {
      // Falha em QUALQUER linha reverte o grupo inteiro (critério 2): a
      // transação já desfez o que tinha sido escrito. Nenhum evento é publicado.
      //
      // Critério 6 (item 014): a falha é RUIDOSA. Log estruturado
      // `news_publish_db_failed` (o mesmo evento que o critério 34 procura na
      // primeira hora após o rebuild) e exceção tipada propagada ao worker, que
      // desmarca a URL do set de dedup do RSS. Um `return` mudo aqui deixava o
      // item marcado como processado por 48h com a notícia jamais gravada.
      const cause = err as Error
      logger.error(JSON.stringify({
        event: 'news_publish_db_failed',
        url: raw.url,
        title: raw.title.slice(0, 80),
        source: raw.source,
        multi_team_enabled: multiTeam,
        planned_rows: planned.length,
        planned_tickers: planned.map((row) => row.ticker || null),
        error_name: cause.name,
        error_message: cause.message,
      }))
      throw new NewsPersistenceError(raw, cause)
    }

    logger.info(JSON.stringify({
      event: 'news_publisher_group_persisted',
      group_id: groupId,
      multi_team_enabled: multiTeam,
      editorial_publish: editorial.publish,
      editorial_block_reason: editorial.blockReason,
      editorial_degraded: editorial.degraded,
      source: raw.source,
      rows: persisted.map((row) => ({
        news_id: row.newsId,
        ticker: row.ticker || null,
        rank: row.rank,
        origin: row.origin,
      })),
    }))

    // -----------------------------------------------------------------------
    // Passo 3 — Publicar os N eventos APÓS o commit
    //
    // Grupo barrado pelo gate editorial não despacha nada: se a notícia não é
    // visível para o usuário, mover o preço do ativo por causa dela seria pior
    // do que publicá-la — o usuário veria o preço andar sem explicação no feed.
    // Publicação DEGRADADA (sem LLM) também não despacha: o sentimento e a
    // categoria vieram de heurística de título, não de análise.
    // Nos dois casos as linhas são marcadas como terminais (`impactDispatchedAt`),
    // senão ficariam elegíveis a retentativa para sempre.
    // -----------------------------------------------------------------------
    // Daqui para baixo as linhas JÁ estão commitadas. Qualquer falha vira
    // `NewsDispatchError` para que o worker saiba não desmarcar a URL do set de
    // dedup: a notícia existe: reprocessá-la criaria uma duplicata no feed.
    try {
      if (!editorial.publish || editorial.degraded) {
        const reason: DispatchSkipReason = editorial.publish
          ? 'degraded_publication'
          : 'editorial_blocked'
        this.logSkip(groupId, persisted, reason, {
          editorial_block_reason: editorial.blockReason,
          classifier_fallback_reason: classified.fallbackReason ?? null,
          source: raw.source,
        })
        await this.markImpactDispatched(
          groupId,
          persisted.map((row) => ({ newsId: row.newsId, outcome: reason })),
          new Date()
        )
        return
      }

      await this.dispatchGroup({
        raw,
        classified,
        impact,
        groupId,
        rows: persisted,
      })
    } catch (err) {
      throw new NewsDispatchError(raw, groupId, err as Error)
    }

    // -----------------------------------------------------------------------
    // Passo 4 — Notificação NEWS_FAVORITE_CLUB
    // DECISÃO DE BOUNDARY (module-17): O motor Railway não tem acesso ao serviço
    // de notificações Next.js. Responsabilidade delegada ao module-19-inbox-notificacoes:
    // deve subscrever o canal `news:inject` e verificar se o ticker é o clube favorito
    // do usuário para disparar a notificação NEWS_FAVORITE_CLUB.
    // Rastreabilidade: OVERVIEW.md §Impacto em Outros Módulos → module-19
    // GAP-015: boundary documentado — não é gap de implementação deste módulo.
    // -----------------------------------------------------------------------
  }

  // ---------------------------------------------------------------------------
  // Planejamento das linhas
  // ---------------------------------------------------------------------------

  /**
   * Com o flag DESLIGADO devolve exatamente uma linha, montada a partir dos
   * campos de topo (`classified.ticker` / `classified.sentiment`) — os mesmos
   * que o publisher lê hoje. Ler `teams[0]` aqui daria o mesmo resultado pelo
   * contrato do item 011, mas montar a partir do topo torna o caminho desligado
   * independente do array novo: `teams` vazio, mal formado ou ausente não muda
   * uma vírgula do comportamento atual.
   *
   * Com o flag LIGADO devolve as N linhas de `teams`, saneadas.
   */
  private planRows(
    raw: RawNewsItem,
    classified: ClassifiedNews,
    multiTeam: boolean
  ): PlannedRow[] {
    const legacyRow: PlannedRow = {
      ticker: classified.ticker || '',
      sentiment: classified.sentiment,
      rank: 0,
      // Fixo em `classifier`, e não copiado de `teams[0].origin`: o gate de
      // confidence só se aplica aos ranks 1 e 2 (types.ts), então a linha única
      // NUNCA é gatilhada por ele. Herdar a origem do array novo abriria a porta
      // para um `low_confidence` mal emitido no rank 0 silenciar o despacho com
      // o flag desligado — exatamente a regressão que este caminho não pode ter.
      origin: 'classifier',
      assetId: null,
    }

    if (!multiTeam) return [legacyRow]

    const teams = Array.isArray(classified.teams) ? classified.teams : []
    if (teams.length === 0) return [legacyRow]

    // Saneamento defensivo. O classificador (item 011) já deduplica, aplica o
    // cap e atribui os ranks; o publisher NÃO recalcula essa política — apenas
    // se recusa a levar ao banco um grupo que violaria a UNIQUE (group_id, rank),
    // a UNIQUE parcial (group_id, ticker) ou o CHECK de cap da M067, porque essa
    // violação abortaria a transação inteira e derrubaria uma notícia legítima.
    const byTicker = new Map<string, typeof teams[number]>()
    const duplicates: string[] = []
    // O comparador tolera elemento nulo porque a guarda de saneamento vem
    // DEPOIS da ordenação: um `teams` mal formado não pode derrubar a notícia
    // inteira dentro do sort.
    for (const team of [...teams].sort((a, b) => (a?.rank ?? 0) - (b?.rank ?? 0))) {
      if (!team || typeof team.ticker !== 'string' || team.ticker === '') continue
      if (byTicker.has(team.ticker)) {
        duplicates.push(team.ticker)
        continue
      }
      byTicker.set(team.ticker, team)
    }

    const unique = [...byTicker.values()]
    if (unique.length === 0) return [legacyRow]

    const capped = unique.slice(0, MULTI_TEAM_CAP)
    const overflow = unique.slice(MULTI_TEAM_CAP)

    if (duplicates.length > 0 || overflow.length > 0) {
      logger.warn(JSON.stringify({
        event: 'news_publisher_group_sanitized',
        title: raw.title.slice(0, 80),
        cap: MULTI_TEAM_CAP,
        duplicates,
        overflow: overflow.map((team) => team.ticker),
      }))
    }

    // Rank gravado obedece à atribuição do item 011 (rank 0 = primeiro ticker
    // único do título). Só reindexamos quando os ranks recebidos não formam
    // 0..n-1 — e nesse caso o desvio é registrado, nunca silenciado.
    const ranksAreCanonical = capped.every((team, index) => team.rank === index)
    if (!ranksAreCanonical) {
      logger.warn(JSON.stringify({
        event: 'news_publisher_rank_normalized',
        title: raw.title.slice(0, 80),
        received: capped.map((team) => ({ ticker: team.ticker, rank: team.rank })),
      }))
    }

    return capped.map((team, index) => ({
      ticker: team.ticker,
      sentiment: team.sentiment,
      rank: ranksAreCanonical ? team.rank : index,
      origin: team.origin,
      assetId: null,
    }))
  }

  // ---------------------------------------------------------------------------
  // Resolução de assets (leitura, fora da transação de escrita)
  // ---------------------------------------------------------------------------

  /**
   * Um `findUnique` por linha. Sem cache de propósito: `planRows` já garante
   * tickers únicos no grupo (dedupe + cap), então um cache só acrescentaria um
   * caminho que nenhuma entrada real exercita.
   */
  private async resolveAssets(prisma: PrismaLike, rows: PlannedRow[]): Promise<PlannedRow[]> {
    const resolved: PlannedRow[] = []

    for (const row of rows) {
      if (!row.ticker) {
        resolved.push({ ...row, assetId: null })
        continue
      }
      const asset = await prisma.asset.findUnique({
        where: { ticker: row.ticker },
        select: { id: true },
      })
      if (!asset?.id) {
        logger.warn(`[NewsPublisher] Ticker '${row.ticker}' nao encontrado em assets — assetIds ficara vazio`)
      }
      resolved.push({ ...row, assetId: asset?.id ?? null })
    }

    return resolved
  }

  // ---------------------------------------------------------------------------
  // Escrita transacional do grupo
  // ---------------------------------------------------------------------------

  /**
   * Grava as N linhas dentro da transação recebida.
   *
   * Grupo unitário (flag desligado, ou uma única linha com o flag ligado): a
   * escrita é a de hoje, SEM `groupId`/`groupRank` no payload. O default vem do
   * trigger `news_group_defaults_trg` da M067 (`group_id = id`, `group_rank = 0`),
   * que existe exatamente para cobrir este writer na janela D1..D3. Consequência
   * desejada: `groupId === newsId`, e o `correlationId` emitido continua sendo o
   * `newsId` de hoje (critérios 17 e 27).
   *
   * Grupo multi-time: a âncora é criada primeiro para que seu `id` sirva de
   * `groupId`, é atualizada com esse valor e só então os irmãos são criados já
   * apontando para ele. O UPDATE extra é deliberado — a alternativa seria ler o
   * `group_id` que o trigger escreveu, o que faria a identidade do grupo depender
   * do RETURNING de um trigger BEFORE INSERT em vez de ser afirmada pelo writer.
   */
  private async persistGroup(
    tx: NewsTxClient,
    rows: PlannedRow[],
    ctx: {
      raw: RawNewsItem
      impact: ImpactCategory
      publishedAt: Date
      sentimentClassifiedAt: Date
      grouped: boolean
      editorial: EditorialDecision
    }
  ): Promise<{ rows: PersistedRow[]; groupId: string }> {
    const ordered = [...rows].sort((a, b) => a.rank - b.rank)
    const anchor = ordered[0]

    const anchorRow = await tx.news.create({
      data: this.rowData(anchor, ctx, ctx.grouped ? { groupRank: anchor.rank } : {}),
    })

    const groupId = anchorRow.id
    const persisted: PersistedRow[] = [{ ...anchor, newsId: anchorRow.id }]

    if (!ctx.grouped) {
      return { rows: persisted, groupId }
    }

    await tx.news.update({
      where: { id: anchorRow.id },
      data: { groupId },
    })

    for (const row of ordered.slice(1)) {
      const created = await tx.news.create({
        data: this.rowData(row, ctx, { groupId, groupRank: row.rank }),
      })
      persisted.push({ ...row, newsId: created.id })
    }

    return { rows: persisted, groupId }
  }

  /**
   * Conteúdo da linha: description normalizada, senão título normalizado,
   * senão o título cru.
   *
   * T-10. Este é o ÚNICO ponto do motor que escreve a coluna `content` de
   * `news`, então é aqui que a garantia "content nunca é vazio nem literal
   * degenerado" tem que valer. O `??` de antes deixava passar string vazia
   * (427 linhas de "O Gol" em produção, produtor ainda ativo na medição de
   * 2026-08-19) e o literal `'null'` (2003 linhas da ESPN Brasil), que é
   * truthy e nem o `||` pegaria.
   *
   * O terceiro ramo é defensivo e, pelo pipeline atual, INALCANÇÁVEL: as três
   * portas de entrada da fila (ingestão RSS e o
   * requeue pós-rate-limit) só entregam item cujo título já passou pelo filtro
   * de `RSSFetcher.fetchFeed`. Ele existe para não introduzir `throw` novo no
   * caminho de persistência — a coluna é NOT NULL e o publisher não tem hoje
   * um caminho de rejeição de item — e é BARULHENTO em vez de silencioso.
   * Descartada a alternativa de gravar um placeholder ("Sem descrição"), que
   * seria copy nova que ninguém pediu.
   */
  private resolveContent(raw: RawNewsItem): string {
    const description = normalizeNewsText(raw.description)
    if (description !== undefined) return description

    const title = normalizeNewsText(raw.title)
    if (title !== undefined) return title

    logger.error(JSON.stringify({
      event: 'news_content_degenerate_at_publisher',
      url: raw.url,
      source: raw.source,
    }))
    return raw.title
  }

  /** Payload de uma linha. `extra` carrega os campos de grupo quando aplicável. */
  private rowData(
    row: PlannedRow,
    ctx: {
      raw: RawNewsItem
      impact: ImpactCategory
      publishedAt: Date
      sentimentClassifiedAt: Date
      editorial: EditorialDecision
    },
    extra: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      title: ctx.raw.title,
      content: this.resolveContent(ctx.raw),
      // Critério 3: `impact` é da NOTÍCIA, não do time — as N linhas compartilham
      // a categoria, logo a magnitude absoluta dos N eventos é idêntica e apenas
      // o sinal difere.
      impact: ctx.impact,
      sentiment: this.toSentimentEnum(row.sentiment),
      ticker: row.ticker || null,
      assetIds: row.assetId ? [row.assetId] : [],
      source: ctx.raw.source,
      // Gate editorial (ver editorial-gate.ts). Era `true` incondicional até
      // 2026-08-03 — qualquer coisa que chegasse ao publisher virava linha
      // publicada, inclusive NBA, futebol europeu e notícia sem time nenhum
      // quando o LLM estava fora do ar. A linha continua sendo GRAVADA quando
      // barrada: o admin precisa enxergar o que o gate comeu (e poder publicar
      // à mão um falso positivo), e apagar a evidência tornaria o gate cego.
      isPublished: ctx.editorial.publish,
      // `publishedAt` segue preenchido MESMO na linha barrada: esta coluna é a
      // data da FONTE (`raw.publishedAt`), não o instante de entrada no feed.
      // Anulá-la perderia a informação e, como Postgres ordena `DESC` com
      // NULLS FIRST, empilharia todo o bloqueado no topo da lista do admin.
      // Quem controla visibilidade é `isPublished`, e só ele.
      publishedAt: ctx.publishedAt,
      editorialBlockReason: ctx.editorial.blockReason,
      editorialCheckedAt: ctx.sentimentClassifiedAt,
      sentimentClassifiedAt: ctx.sentimentClassifiedAt,
      // M054: flag de publicação degradada. true quando a notícia foi publicada
      // sem classificação LLM (heurística determinística). A consulta de janela
      // de sentimento (task-007) usa este flag para excluir notícias degradadas.
      sentimentDegraded: ctx.editorial.degraded,
      ...extra,
    }
  }

  // ---------------------------------------------------------------------------
  // Despacho dos eventos (sempre APÓS o commit)
  // ---------------------------------------------------------------------------

  private async dispatchGroup(ctx: {
    raw: RawNewsItem
    classified: ClassifiedNews
    impact: ImpactCategory
    groupId: string
    rows: PersistedRow[]
  }): Promise<void> {
    // DB-12 / leitura A8: UM timestamp por publicação, compartilhado pelo despacho
    // bem-sucedido e pela decisão de não despachar por gate. Não há coluna de
    // estado — o que separa os dois casos é a existência do evento no Redis, não
    // o valor gravado. Construído ANTES do gate de relevância para que o grupo
    // barrado receba exatamente o mesmo instante do grupo que despacha.
    const dispatchedAt = new Date()
    /** Linhas cuja decisão de despacho é TERMINAL — saem da fila do reconciliador. */
    const settled: Array<{ newsId: string; outcome: 'dispatched' | DispatchSkipReason }> = []

    // Gate de relevância — vale para o GRUPO inteiro e vem PRIMEIRO. Grupo
    // reprovado aqui não despacha nada, mesmo com confidence alto em todo time.
    if (!(ctx.classified.relevance > RELEVANCE_THRESHOLD)) {
      this.logSkip(ctx.groupId, ctx.rows, 'relevance_gate', {
        relevance: ctx.classified.relevance,
        threshold: RELEVANCE_THRESHOLD,
      })
      // `relevance` não é persistido em `news`. Sem este marcador o reconciliador
      // (impact-reconciler.ts, T-22) tentaria reenviar para sempre uma notícia que
      // nunca deveria impactar preço, porque ele drena por `impact_dispatched_at IS NULL`
      // e não tem como reavaliar o gate (seção 10.6).
      await this.markImpactDispatched(
        ctx.groupId,
        ctx.rows.map((row) => ({ newsId: row.newsId, outcome: 'relevance_gate' as const })),
        dispatchedAt
      )
      return
    }

    // `resolveImpactCategory` já garante um membro válido do enum, e
    // IMPACT_MAGNITUDE é `Record<ImpactCategory, number>` completo — nenhum
    // default é necessário aqui, e um default mudo esconderia enum novo sem
    // magnitude declarada.
    const baseMagnitude = IMPACT_MAGNITUDE[ctx.impact]

    for (const row of ctx.rows) {
      // Gate de ticker — o de hoje. Linha sem ticker resolvido não vira evento.
      if (!row.ticker) {
        this.logSkip(ctx.groupId, [row], 'ticker_unresolved', {})
        // Marcada pelo mesmo motivo do gate de relevância: a seção 10.6 nomeia
        // explicitamente `relevance <= 0.3` OU ticker vazio como as decisões de
        // não despachar que precisam do marcador.
        settled.push({ newsId: row.newsId, outcome: 'ticker_unresolved' })
        continue
      }

      // Gate de confidence — aplicado DEPOIS do de relevância, por linha. O
      // classificador já materializou a decisão em `origin`; ler `origin` (e não
      // `sentiment === 0`) é o que mantém neutro-por-decisão, neutro-por-
      // confidence e neutro-por-fallback distinguíveis. A linha foi gravada
      // normalmente; ela apenas não gera evento, e o motivo fica no log.
      //
      // `rank > 0` é parte do gate, não decoração: `types.ts` define
      // `low_confidence` como estado exclusivo dos ranks 1 e 2, e o caminho
      // flag-OFF já tem defesa em profundidade para isso (`planRows` fixa
      // `origin: 'classifier'` no rank 0). Sem esta metade, o caminho flag-ON
      // ficava sem a mesma defesa: um classificador futuro que emitisse
      // `low_confidence` no rank 0 silenciaria a âncora — e só com o flag ligado.
      if (row.rank > 0 && row.origin === 'low_confidence') {
        this.logSkip(ctx.groupId, [row], 'low_confidence', {})
        // Também terminal. A seção 10.6 foi escrita antes de o gate de confidence
        // existir (item 011), mas o motivo é o mesmo dos outros dois: a linha tem
        // ticker não nulo, entraria na contagem de pendentes do critério 4 e o
        // reconciliador (impact-reconciler.ts, T-22) não tem como reavaliar `origin`,
        // que não é persistido.
        settled.push({ newsId: row.newsId, outcome: 'low_confidence' })
        continue
      }

      try {
        // Aplicar sinal do sentimento: negativo → queda de preço
        const signedMagnitude = row.sentiment < -0.1 ? -baseMagnitude : baseMagnitude
        const event: NewsInjectEvent = {
          type: 'NEWS',
          assetId: row.ticker,
          newsId: row.newsId,
          title: ctx.raw.title.slice(0, 160),
          source: ctx.raw.source.slice(0, 80),
          impact: ctx.impact as NewsInjectEvent['impact'],
          impactCategory: ctx.impact as NewsInjectEvent['impact'],
          sentiment: row.sentiment,
          publishedAt: new Date(ctx.raw.publishedAt).toISOString(),
          // Critério 27: `correlationId = groupId`, SEM campo novo no contrato.
          // Em grupo unitário `groupId === newsId`, então o valor emitido é
          // idêntico ao de hoje. É esta chave que o item 021 usa para suprimir
          // correlação entre ativos do mesmo grupo.
          correlationId: ctx.groupId,
          magnitude: signedMagnitude,
          durationTicks: sentimentToDurationTicks(row.sentiment),
          curveType: 'canonical',
        }
        await this.redis.publish(NEWS_INJECT_CHANNEL, JSON.stringify(event))
        settled.push({ newsId: row.newsId, outcome: 'dispatched' })
      } catch (err) {
        logger.error(`[NewsPublisher] Erro ao publicar no Redis: ${(err as Error).message}`)
        // Não reverter — DB já salvo. As demais linhas do grupo seguem sendo
        // despachadas: um Redis intermitente não pode transformar falha de uma
        // linha em grupo inteiro sem impacto.
        //
        // Deliberadamente NÃO entra em `settled`: esta é a única linha que sai
        // daqui com `impact_dispatched_at IS NULL`, e é exatamente o que o
        // critério 29 pede — o reconciliador (impact-reconciler.ts, T-22) drena
        // por esse predicado e reenvia. Marcar aqui apagaria o impacto em silêncio.
      }
    }

    await this.markImpactDispatched(ctx.groupId, settled, dispatchedAt)
  }

  // ---------------------------------------------------------------------------
  // Marcador durável de despacho (DB-12 / opção O1 da seção 10.6)
  // ---------------------------------------------------------------------------

  /**
   * Grava `impactDispatchedAt` nas linhas com decisão de despacho TERMINAL, num
   * único `updateMany` por publicação.
   *
   * Fora da transação de escrita de propósito: o despacho só acontece depois do
   * commit (critério 2), então o marcador é necessariamente uma segunda escrita.
   *
   * NÃO propaga erro. Se este UPDATE falhar, as linhas ficam com o marcador nulo
   * e o reconciliador (impact-reconciler.ts, T-22) as drena — o pior caso é um
   * reenvio, não uma perda. Propagar aqui seria pior: o worker desmarcaria a URL
   * do dedup e a notícia, JÁ commitada e JÁ despachada, seria gravada de novo no
   * ciclo seguinte.
   */
  private async markImpactDispatched(
    groupId: string,
    settled: Array<{ newsId: string; outcome: 'dispatched' | DispatchSkipReason }>,
    dispatchedAt: Date
  ): Promise<void> {
    if (settled.length === 0) return

    const ids = settled.map((entry) => entry.newsId)

    try {
      const prismaLike = this.prisma as unknown as PrismaLike
      await prismaLike.news.updateMany({
        where: { id: { in: ids } },
        data: { impactDispatchedAt: dispatchedAt },
      })

      logger.info(JSON.stringify({
        event: 'news_publisher_impact_marked',
        group_id: groupId,
        impact_dispatched_at: dispatchedAt.toISOString(),
        marked: settled.map((entry) => ({ news_id: entry.newsId, outcome: entry.outcome })),
      }))
    } catch (err) {
      logger.error(JSON.stringify({
        event: 'news_publisher_impact_marker_failed',
        group_id: groupId,
        news_ids: ids,
        error_message: (err as Error).message,
        note: 'linhas seguem com impact_dispatched_at nulo; reconciliador do item 029 drena',
      }))
    }
  }

  /** Log estruturado do motivo de não despachar — um evento por motivo, nunca colapsado. */
  private logSkip(
    groupId: string,
    rows: Array<Pick<PersistedRow, 'newsId' | 'ticker' | 'rank' | 'origin'>>,
    reason: DispatchSkipReason,
    detail: Record<string, unknown>
  ): void {
    logger.info(JSON.stringify({
      event: 'news_publisher_dispatch_skipped',
      reason,
      group_id: groupId,
      rows: rows.map((row) => ({
        news_id: row.newsId,
        ticker: row.ticker || null,
        rank: row.rank,
        origin: row.origin,
      })),
      ...detail,
    }))
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Sentimento numérico → enum Sentiment do schema real. */
  private toSentimentEnum(sentiment: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    if (sentiment > 0.1) return 'BULLISH'
    if (sentiment < -0.1) return 'BEARISH'
    return 'NEUTRAL'
  }

  /** Mapear impactCategory string → enum Prisma. */
  private resolveImpactCategory(category: string): ImpactCategory {
    const valid = Object.values(ImpactCategory)
    if (valid.includes(category as ImpactCategory)) {
      return category as ImpactCategory
    }
    return ImpactCategory.INSTITUCIONAL
  }
}
