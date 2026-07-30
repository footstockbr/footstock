// ============================================================================
// FootStock — NewsInjectionService
// Injeção manual de notícias pelo admin com RBAC e auditoria.
// Rastreabilidade: INT-049
// ============================================================================

import { z } from 'zod'
import { ImpactCategory, Sentiment } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { redisPublisher, REDIS_CHANNELS } from '@/lib/redis'
import { writeNewsGroup } from './newsGroupWriter'
import type { NewsInjectEvent } from '../types/news'

const NEWS_IMPACT_DURATION_TICKS = 50

/** Mensagens de validação do grupo multi-time, reusadas pela rota e pelos testes. */
export const NEWS_GROUP_MAX_ADDITIONAL_MSG =
  'Grupo de notícia aceita no máximo 3 times (1 principal + 2 adicionais).'
export const newsGroupDuplicateTickerMsg = (ticker: string) =>
  `Ticker repetido no grupo: ${ticker}. Cada time entra uma vez só na mesma notícia.`

// ---------------------------------------------------------------------------
// Schema de validação do DTO
// ---------------------------------------------------------------------------

export const adminNewsInjectSchema = z
  .object({
    title: z.string().min(1),
    content: z.string().min(1).optional(),
    ticker: z.string().min(1).max(10).transform(v => v.toUpperCase()),
    impactCategory: z.nativeEnum(ImpactCategory),
    sentiment: z.number().min(-1).max(1),
    source: z.string().optional().default('Admin'),
    // Times adicionais do MESMO fato (grupo M067). Ausente ou vazio = notícia de
    // linha única, caminho idêntico ao anterior a este item (critério 17).
    // Cada linha tem ticker e sentimento PRÓPRIOS; título, conteúdo, impacto e
    // fonte são do fato e por isso ficam fora daqui.
    additionalTeams: z
      .array(
        z.object({
          ticker: z
            .string()
            .min(1, 'Ticker do time adicional é obrigatório.')
            .max(10)
            .transform(v => v.toUpperCase()),
          sentiment: z.number().min(-1).max(1),
        })
      )
      .max(2, NEWS_GROUP_MAX_ADDITIONAL_MSG)
      .optional(),
  })
  .superRefine((data, ctx) => {
    // Ticker repetido é erro de intenção, não de digitação: duas linhas do mesmo
    // time no mesmo grupo violariam o índice único parcial por ticker (DB-05) já
    // no INSERT, com erro P2002 opaco para o operador.
    const extra = data.additionalTeams ?? []
    if (extra.length === 0) return
    const seen = new Set<string>([data.ticker])
    extra.forEach((team, index) => {
      if (seen.has(team.ticker)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['additionalTeams', index, 'ticker'],
          message: newsGroupDuplicateTickerMsg(team.ticker),
        })
        return
      }
      seen.add(team.ticker)
    })
  })

export type AdminNewsInjectDTO = z.infer<typeof adminNewsInjectSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function numberField(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Mapa sentimento numérico -> enum. Thresholds inalterados (0.3 / -0.3): agora
 * roda POR LINHA, porque cada time pode reagir em direção diferente ao mesmo
 * fato (uma venda é BULLISH para quem vende e BEARISH para quem compra).
 */
function toSentimentEnum(value: number): Sentiment {
  return value > 0.3 ? Sentiment.BULLISH : value < -0.3 ? Sentiment.BEARISH : Sentiment.NEUTRAL
}

// ---------------------------------------------------------------------------
// Classe NewsInjectionService
// ---------------------------------------------------------------------------

export class NewsInjectionService {
  /**
   * Injeta uma notícia manualmente (admin).
   * Salva no DB (1..3 linhas irmãs do mesmo fato), publica no Redis e registra
   * auditoria POR LINHA.
   * @returns { newsId: id da âncora, groupId, newsIds: ids na ordem de rank }
   */
  async inject(
    dto: AdminNewsInjectDTO,
    adminId: string
  ): Promise<{ newsId: string; groupId: string; newsIds: string[] }> {
    // -----------------------------------------------------------------------
    // 0. Planejar as linhas do grupo (âncora + times adicionais)
    // -----------------------------------------------------------------------
    const plannedRows = [
      { ticker: dto.ticker, sentiment: dto.sentiment, rank: 0 },
      ...(dto.additionalTeams ?? []).map((team, index) => ({
        ticker: team.ticker,
        sentiment: team.sentiment,
        rank: index + 1,
      })),
    ]

    // -----------------------------------------------------------------------
    // 0a. Localizar ativo pelo ticker para obter assetId — TODAS as linhas antes
    //    de qualquer escrita. Ticker inexistente em qualquer posição derruba a
    //    injeção inteira ANTES do primeiro INSERT: nenhum grupo nasce parcial e
    //    o motor não recebe evento de um fato pela metade.
    // -----------------------------------------------------------------------
    const resolvedRows: Array<{
      ticker: string
      sentiment: number
      rank: number
      asset: { id: string; ticker: string }
    }> = []
    for (const row of plannedRows) {
      const asset = await prisma.asset.findUnique({ where: { ticker: row.ticker } })
      if (!asset) {
        throw new Error(`Ativo não encontrado: ${row.ticker}`)
      }
      resolvedRows.push({ ...row, asset })
    }

    // -----------------------------------------------------------------------
    // 0b. Verificar whitelist: se a fonte está na whitelist, dobrar magnitude
    // -----------------------------------------------------------------------
    let magnitudeMultiplier = 1
    if (dto.source && dto.source !== 'Admin') {
      try {
        const sourceDomain = new URL(dto.source.startsWith('http') ? dto.source : `https://${dto.source}`).hostname
        const whitelisted = await prisma.newsSourceWhitelist.findFirst({
          where: { domain: sourceDomain },
        })
        if (whitelisted) magnitudeMultiplier = 2
      } catch {
        // URL inválida: magnitude padrão (1x)
      }
    }

    // -----------------------------------------------------------------------
    // 1. Salvar notícia no banco (1 linha por time, mesmo group_id)
    // -----------------------------------------------------------------------
    // UMA instância de Date para todas as linhas: ordenação do feed é por
    // publishedAt, e recalcular por linha criaria empate instável entre irmãs.
    const publishedAt = new Date()
    const publishedAtIso = publishedAt.toISOString()
    const source = dto.source ?? 'Admin'

    // Auditoria POR LINHA (não uma por grupo): `reconcileUnappliedNews` abaixo
    // reprocessa a partir de `action.assetId` + `details.*` de UMA ação. Uma
    // única linha de auditoria por grupo reaplicaria impacto em um time só e
    // deixaria os irmãos sem correção para sempre. `correlationId` é o groupId
    // nas três linhas: é ele que amarra o fato no motor e nos logs.
    //
    // As auditorias são criadas DENTRO da mesma transação das linhas (hook
    // `onPersisted`): se o INSERT de uma auditoria falhar, o grupo inteiro
    // reverte. Criá-las depois do commit deixaria prefixo auditado + irmãs sem
    // ação nenhuma — e `reconcileUnappliedNews` só varre ações que existem,
    // então essas irmãs nunca seriam recuperadas. No caminho de linha única o
    // hook roda fora de transação, como antes de M067 (critério 17).
    const auditedRows: Array<{
      auditId: string
      newsId: string
      rank: number
      row: (typeof resolvedRows)[number]
    }> = []

    const { groupId, newsIds } = await writeNewsGroup(
      resolvedRows.map(row => ({
        ticker: row.asset.ticker,
        sentiment: toSentimentEnum(row.sentiment),
        assetIds: [row.asset.id],
        rank: row.rank,
      })),
      {
        title: dto.title,
        content: dto.content ?? '',
        impact: dto.impactCategory,
        source,
        isPublished: true,
        publishedAt,
      },
      {
        onPersisted: async (client, persisted) => {
          // Retry de transação re-executa este hook: começar do zero evita
          // auditoria duplicada na lista em memória.
          auditedRows.length = 0
          // `persisted` vem ordenado por rank, então [0] é a âncora. Não usar o
          // `groupId` do retorno: ele só existe depois que esta função termina.
          // Na linha única `groupId === newsId` por DB-03, então o valor é o
          // mesmo dos dois lados.
          const anchorId = persisted[0].newsId
          for (const entry of persisted) {
            const row = resolvedRows[entry.sourceIndex]
            const audit = await client.adminMarketAction.create({
              data: {
                adminId,
                assetId: row.asset.id,
                ticker: row.asset.ticker,
                action: 'NEWS_INJECT',
                reason: `[${dto.impactCategory}] ${dto.title}`,
                details: {
                  newsId: entry.newsId,
                  correlationId: anchorId,
                  groupId: anchorId,
                  groupRank: entry.rank,
                  publishedImpactApplied: false,
                  // Estado de despacho POR CANAL: `news:inject` e `motor:control`
                  // falham de forma independente, e o reconcile precisa saber
                  // qual dos dois ficou pendente.
                  newsInjectPublished: false,
                  title: dto.title,
                  source,
                  impactCategory: dto.impactCategory,
                  sentiment: row.sentiment,
                  publishedAt: publishedAtIso,
                  durationTicks: NEWS_IMPACT_DURATION_TICKS,
                  reason: `[${dto.impactCategory}] ${dto.title} (sentiment: ${row.sentiment}, source: ${source})`,
                },
              },
            })
            auditedRows.push({ auditId: audit.id, newsId: entry.newsId, rank: entry.rank, row })
          }
        },
      }
    )

    // -----------------------------------------------------------------------
    // 2. Publicar no Redis imediatamente — SEMPRE depois do commit do grupo
    // -----------------------------------------------------------------------
    // Publicar dentro da transação exporia ao motor um grupo que ainda pode dar
    // rollback (mesma regra de NewsPublisher.persistGroup). Todas as linhas de
    // auditoria já existem neste ponto (commitadas junto com as linhas): se a
    // publicação morrer no meio, cada linha ainda tem sua ação com o canal
    // pendente marcado e o `reconcileUnappliedNews` recupera o grupo inteiro.
    //
    // NENHUMA falha de despacho interrompe o loop: uma irmã que não publica não
    // pode impedir as outras de chegar ao motor. Cada canal tem seu próprio
    // try/catch e seu próprio flag em `details`.
    for (const { auditId, newsId, rank, row } of auditedRows) {
      const event: NewsInjectEvent = {
        type: 'NEWS',
        assetId: row.ticker,
        newsId,
        ticker: row.ticker,
        title: dto.title,
        sentiment: row.sentiment,
        impactCategory: dto.impactCategory,
        source,
        publishedAt: publishedAtIso,
        correlationId: groupId,
        durationTicks: NEWS_IMPACT_DURATION_TICKS,
        curveType: 'canonical',
      }

      let newsInjectPublished = false
      try {
        await redisPublisher.publish(REDIS_CHANNELS.NEWS_INJECT, JSON.stringify(event))
        newsInjectPublished = true
      } catch (err) {
        // Canal de feed indisponível: a linha fica com `newsInjectPublished:
        // false` e o reconcile republica SÓ esse canal. As irmãs seguem.
        console.error(
          `[NewsInjectionService] Falha ao publicar no news:inject (newsId=${newsId}, groupId=${groupId}, ticker=${row.ticker}):`,
          err
        )
      }

      // Também publicar no canal motor:control para que o motor processe o impacto de preço.
      // O motor indexa assetStates por UUID (asset.id), não por ticker.
      let publishedImpactApplied = false
      try {
        const isNegative = row.sentiment < 0
        const motorControlEvent = {
          type: 'INJECT_NEWS',
          assetId: row.asset.id,
          adminId,
          payload: {
            impact: isNegative ? 'NEGATIVE' : 'POSITIVE',
            magnitude: Math.min(Math.abs(row.sentiment) * magnitudeMultiplier, 1),
            durationTicks: NEWS_IMPACT_DURATION_TICKS,
            curveType: 'canonical',
            newsId,
            title: dto.title,
            source,
            impactCategory: dto.impactCategory,
            sentiment: row.sentiment,
            publishedAt: publishedAtIso,
            correlationId: groupId,
            adminActionId: auditId,
          },
          correlationId: groupId,
        }
        await redisPublisher.publish(REDIS_CHANNELS.MOTOR_CONTROL, JSON.stringify(motorControlEvent))
        publishedImpactApplied = true
      } catch (err) {
        // Motor:control indisponível: notícia salva no DB e auditoria intacta.
        // Impacto de preço não será aplicado agora; o reconcile republica.
        // A linha e o grupo entram no log para o operador achar as irmãs.
        console.error(
          `[NewsInjectionService] Falha ao publicar INJECT_NEWS no motor:control (newsId=${newsId}, groupId=${groupId}, ticker=${row.ticker}):`,
          err
        )
      }

      // Persistir o resultado do despacho só quando houve o que registrar: se os
      // dois canais falharam, a ação já está no estado correto (ambos `false`)
      // desde o INSERT e um UPDATE idêntico só gastaria escrita.
      if (newsInjectPublished || publishedImpactApplied) {
        try {
          await prisma.adminMarketAction.update({
            where: { id: auditId },
            data: {
              details: {
                newsId,
                correlationId: groupId,
                groupId,
                groupRank: rank,
                publishedImpactApplied,
                newsInjectPublished,
                title: dto.title,
                source,
                impactCategory: dto.impactCategory,
                sentiment: row.sentiment,
                publishedAt: publishedAtIso,
                durationTicks: NEWS_IMPACT_DURATION_TICKS,
                adminActionId: auditId,
                reason: `[${dto.impactCategory}] ${dto.title} (sentiment: ${row.sentiment}, source: ${source})`,
              },
            },
          })
        } catch (err) {
          // DB fora do ar depois de publicar: o evento já chegou ao motor e a
          // ação continua marcada como pendente. O reconcile pode republicar —
          // `injectNewsImpact` descarta duplicata pelo mesmo `newsId`. Nunca
          // abortar as irmãs por causa disso.
          console.error(
            `[NewsInjectionService] Falha ao registrar despacho na auditoria (auditId=${auditId}, newsId=${newsId}, groupId=${groupId}):`,
            err
          )
        }
      }
    }

    return { newsId: newsIds[0], groupId, newsIds }
  }

  async reconcileUnappliedNews(limit = 50): Promise<{ checked: number; reapplied: number; failed: number; unapplied: number }> {
    // Dois canais, dois flags: `publishedImpactApplied` (motor:control) e
    // `newsInjectPublished` (news:inject). Uma ação entra na varredura quando
    // QUALQUER um dos dois está pendente — publicar um e falhar o outro deixava
    // a linha invisível para o reconcile antes desta correção.
    // Linha legacy (anterior a M067) não tem a chave `newsInjectPublished`, e
    // `path equals false` não casa chave ausente: essas continuam entrando só
    // pelo primeiro clause e sendo tratadas exatamente como antes.
    const actions = await prisma.adminMarketAction.findMany({
      where: {
        action: 'NEWS_INJECT',
        OR: [
          { details: { path: ['publishedImpactApplied'], equals: false } },
          { details: { path: ['newsInjectPublished'], equals: false } },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    })

    let reapplied = 0
    let failed = 0

    for (const action of actions) {
      const details = isRecord(action.details) ? action.details : {}
      const newsId = stringField(details.newsId, action.id)
      const correlationId = stringField(details.correlationId, newsId)
      const sentiment = numberField(details.sentiment, 0)
      const title = stringField(details.title, stringField(details.reason, 'Noticia administrativa sem titulo'))
      const source = stringField(details.source, 'Admin')
      const impactCategory = stringField(details.impactCategory, 'ADMIN')
      const durationTicks = numberField(details.durationTicks, NEWS_IMPACT_DURATION_TICKS)

      // Pendência POR CANAL. `=== false` é estrito de propósito: chave ausente é
      // linha legacy, e para ela o comportamento continua sendo motor:control
      // só — republicar news:inject de uma linha que talvez já tenha publicado
      // seria inventar histórico.
      const impactPending = details.publishedImpactApplied !== true
      const newsInjectPending = details.newsInjectPublished === false

      const publishedAtIso = stringField(details.publishedAt, new Date().toISOString())

      const motorControlEvent = {
        type: 'INJECT_NEWS',
        assetId: action.assetId,
        adminId: 'reconciliation-cron',
        payload: {
          impact: sentiment < 0 ? 'NEGATIVE' : 'POSITIVE',
          magnitude: Math.min(Math.abs(sentiment), 1),
          durationTicks,
          curveType: 'canonical',
          newsId,
          title,
          source,
          impactCategory,
          sentiment,
          publishedAt: publishedAtIso,
          correlationId,
          adminActionId: action.id,
        },
        correlationId,
      }

      // Canal pendente republica; canal já entregue não é tocado. Publicar de
      // novo o que já foi publicado dispararia um segundo evento para o mesmo
      // fato — `injectNewsImpact` descarta duplicata pelo `newsId` enquanto o
      // impacto está ativo, mas depender disso seria despacho às cegas.
      let newsInjectOk = !newsInjectPending
      let impactOk = !impactPending
      let lastError: unknown = null

      if (newsInjectPending) {
        // O motor resolve ticker -> UUID em `handleNewsInject`; sem ticker não há
        // evento possível nesse canal.
        const ticker = typeof action.ticker === 'string' && action.ticker.length > 0 ? action.ticker : null
        if (!ticker) {
          lastError = new Error(`acao ${action.id} sem ticker: news:inject nao pode ser republicado`)
          console.error(`[NewsInjectionService] ${String(lastError)}`)
        } else {
          const newsInjectEvent: NewsInjectEvent = {
            type: 'NEWS',
            assetId: ticker,
            newsId,
            ticker,
            title,
            sentiment,
            impactCategory,
            source,
            publishedAt: publishedAtIso,
            correlationId,
            durationTicks,
            curveType: 'canonical',
          }
          try {
            await redisPublisher.publish(REDIS_CHANNELS.NEWS_INJECT, JSON.stringify(newsInjectEvent))
            newsInjectOk = true
          } catch (err) {
            lastError = err
            console.error(
              `[NewsInjectionService] Reconcile falhou em news:inject (actionId=${action.id}, newsId=${newsId}):`,
              err
            )
          }
        }
      }

      if (impactPending) {
        try {
          await redisPublisher.publish(REDIS_CHANNELS.MOTOR_CONTROL, JSON.stringify(motorControlEvent))
          impactOk = true
        } catch (err) {
          lastError = err
          console.error(
            `[NewsInjectionService] Reconcile falhou em motor:control (actionId=${action.id}, newsId=${newsId}):`,
            err
          )
        }
      }

      const republished = newsInjectOk && impactOk
      let persisted = false
      try {
        await prisma.adminMarketAction.update({
          where: { id: action.id },
          data: {
            details: {
              ...details,
              newsId,
              correlationId,
              publishedImpactApplied: impactOk,
              // A chave só entra quando ESTA execução tentou o canal: linha
              // legacy continua sem ela.
              ...(newsInjectPending ? { newsInjectPublished: newsInjectOk } : {}),
              ...(republished
                ? { reconciledAt: new Date().toISOString() }
                : {
                    reconciliationError: String(lastError),
                    reconciliationFailedAt: new Date().toISOString(),
                  }),
            },
          },
        })
        persisted = true
      } catch (err) {
        // Sem persistir o flag a recuperação não é durável: conta como falha e a
        // próxima varredura tenta de novo. Uma ação não derruba a varredura.
        console.error(
          `[NewsInjectionService] Reconcile publicou mas nao persistiu o flag (actionId=${action.id}):`,
          err
        )
      }

      if (republished && persisted) {
        reapplied++
      } else {
        failed++
      }
    }

    return { checked: actions.length, reapplied, failed, unapplied: Math.max(actions.length - reapplied, 0) }
  }
}

export const newsInjectionService = new NewsInjectionService()
