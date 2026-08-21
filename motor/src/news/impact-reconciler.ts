// ============================================================================
// FootStock Motor — Impact Reconciler (T-22 / item 023 do loop 08-18)
// Drena a fila de notícias com `impactDispatchedAt IS NULL` que têm impacto
// pendente (ticker resolvido, published, dentro do limite de idade).
//
// Motivação: quando o Redis falha no `dispatchGroup` do NewsPublisher, a linha
// fica com `impactDispatchedAt` NULL e o impacto não é despachado. Este
// reconciliador varre essas linhas e reenvia o evento, marcando-as após sucesso.
//
// Kill switch: env IMPACT_RECONCILER_ENABLED (default: true). Lida em runtime,
// não em compile-time, para permitir toggle sem redeploy.
//
// Rastreabilidade: T-22, DB-12, critério 29.
// ============================================================================

import type Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'
import {
  NEWS_INJECT_CHANNEL,
  NEWS_IMPACT_DURATION_TICKS,
} from '../contracts/news-inject-contract'
import { IMPACT_MAGNITUDE } from './types'
import type { ImpactCategory } from './types'
import type { NewsInjectEvent, ImpactCategoryType } from '../types/events.types'

// ---------------------------------------------------------------------------
// Kill switch (lido em runtime, não em compile-time)
// ---------------------------------------------------------------------------

export const IMPACT_RECONCILER_FLAG = 'IMPACT_RECONCILER_ENABLED' as const

/**
 * `true` quando o reconciliador está habilitado. Default: true (ligado).
 * Lida a cada ciclo, de propósito — o kill switch deve ser observável no ponto
 * de decisão, sem depender de ordem de import ou restart.
 */
export function isImpactReconcilerEnabled(): boolean {
  return (process.env[IMPACT_RECONCILER_FLAG] ?? 'true').trim().toLowerCase() !== 'false'
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

/** Limite de idade para reprocessamento. Notícias mais antigas que isso são
 *  consideradas stale e NÃO são reenviadas (evita reprocessamento infinito). */
const DEFAULT_STALE_THRESHOLD_HOURS = 72

/** Threshold de backlog para emitir alerta. */
const DEFAULT_BACKLOG_ALERT_THRESHOLD = 50

/** Limite de registros por ciclo (evita loop infinito se a fila crescer). */
const DEFAULT_BATCH_LIMIT = 100

export interface ImpactReconcilerConfig {
  /** Idade máxima em horas para reprocessamento. Default: 72. */
  staleThresholdHours?: number
  /** Threshold de backlog para alerta. Default: 50. */
  backlogAlertThreshold?: number
  /** Limite de registros por ciclo. Default: 100. */
  batchLimit?: number
}

// ---------------------------------------------------------------------------
// Conversão enum Sentiment -> número (inverso de NewsPublisher.toSentimentEnum)
// ---------------------------------------------------------------------------

function sentimentEnumToNumber(sentiment: string): number {
  switch (sentiment) {
    case 'BULLISH':
      return 1
    case 'BEARISH':
      return -1
    case 'NEUTRAL':
    default:
      return 0
  }
}

// ---------------------------------------------------------------------------
// Métrica de backlog (exposta para health/metrics)
// ---------------------------------------------------------------------------

let _lastBacklogCount = 0

/** Retorna o contador de backlog da última execução do reconciliador. */
export function getImpactBacklogCount(): number {
  return _lastBacklogCount
}

// ---------------------------------------------------------------------------
// Superfície mínima do PrismaClient usada pelo reconciliador
// ---------------------------------------------------------------------------

type ReconcilerNewsDelegate = {
  findMany: (args: {
    where: Record<string, unknown>
    select: Record<string, boolean>
    orderBy: Record<string, string>
    take: number
  }) => Promise<Array<{
    id: string
    title: string
    impact: string
    sentiment: string
    ticker: string | null
    source: string | null
    publishedAt: Date | null
    groupId: string | null
    createdAt: Date
  }>>
  updateMany: (args: {
    where: { id: { in: string[] } }
    data: Record<string, unknown>
  }) => Promise<{ count: number }>
  count: (args: { where: Record<string, unknown> }) => Promise<number>
}

type ReconcilerPrismaLike = {
  news: ReconcilerNewsDelegate
}

// ---------------------------------------------------------------------------
// Reconciliador
// ---------------------------------------------------------------------------

export class ImpactReconciler {
  private readonly prisma: ReconcilerPrismaLike
  private readonly redis: Redis
  private readonly staleThresholdMs: number
  private readonly backlogAlertThreshold: number
  private readonly batchLimit: number

  constructor(
    prisma: PrismaClient,
    redis: Redis,
    config: ImpactReconcilerConfig = {}
  ) {
    this.prisma = prisma as unknown as ReconcilerPrismaLike
    this.redis = redis
    this.staleThresholdMs = (config.staleThresholdHours ?? DEFAULT_STALE_THRESHOLD_HOURS) * 60 * 60 * 1000
    this.backlogAlertThreshold = config.backlogAlertThreshold ?? DEFAULT_BACKLOG_ALERT_THRESHOLD
    this.batchLimit = config.batchLimit ?? DEFAULT_BATCH_LIMIT
  }

  /**
   * Executa um ciclo do reconciliador.
   *
   * 1. Verifica kill switch.
   * 2. Conta backlog total (para métrica e alerta).
   * 3. Busca registros elegíveis (NULL + ticker + published + dentro do limite).
   * 4. Para cada registro, tenta reenviar o evento no Redis.
   * 5. Ao sucesso, marca `impactDispatchedAt`.
   * 6. Loga resultado.
   *
   * NÃO lança exceção — erros são logados e o ciclo continua.
   */
  async run(): Promise<ImpactReconcilerResult> {
    if (!isImpactReconcilerEnabled()) {
      logger.info('[impact-reconciler] Desligado por flag (IMPACT_RECONCILER_ENABLED=false). Skip.')
      return { status: 'disabled', processed: 0, failed: 0, backlog: 0 }
    }

    const staleCutoff = new Date(Date.now() - this.staleThresholdMs)

    // Conta backlog total (para métrica)
    let backlogTotal: number
    try {
      backlogTotal = await this.prisma.news.count({
        where: {
          impactDispatchedAt: null,
          ticker: { not: null },
          isPublished: true,
        },
      })
    } catch (err) {
      logger.error(`[impact-reconciler] Erro ao contar backlog: ${(err as Error).message}`)
      return { status: 'error', processed: 0, failed: 0, backlog: 0 }
    }

    _lastBacklogCount = backlogTotal

    // Alerta se backlog cresceu acima do threshold
    if (backlogTotal >= this.backlogAlertThreshold) {
      logger.warn(JSON.stringify({
        event: 'impact_reconciler_backlog_alert',
        backlog: backlogTotal,
        threshold: this.backlogAlertThreshold,
        message: `Backlog de impacto não despachado (${backlogTotal}) acima do threshold (${this.backlogAlertThreshold})`,
      }))
    }

    if (backlogTotal === 0) {
      logger.info('[impact-reconciler] Backlog vazio. Nada a fazer.')
      return { status: 'ok', processed: 0, failed: 0, backlog: 0 }
    }

    // Busca registros elegíveis (dentro do limite de idade)
    let eligible: Array<{
      id: string
      title: string
      impact: string
      sentiment: string
      ticker: string | null
      source: string | null
      publishedAt: Date | null
      groupId: string | null
      createdAt: Date
    }>

    try {
      eligible = await this.prisma.news.findMany({
        where: {
          impactDispatchedAt: null,
          ticker: { not: null },
          isPublished: true,
          createdAt: { gte: staleCutoff },
        },
        select: {
          id: true,
          title: true,
          impact: true,
          sentiment: true,
          ticker: true,
          source: true,
          publishedAt: true,
          groupId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        take: this.batchLimit,
      })
    } catch (err) {
      logger.error(`[impact-reconciler] Erro ao buscar elegíveis: ${(err as Error).message}`)
      return { status: 'error', processed: 0, failed: 0, backlog: backlogTotal }
    }

    if (eligible.length === 0) {
      logger.info(`[impact-reconciler] Backlog=${backlogTotal}, mas nenhum registro dentro do limite de idade (${this.staleThresholdMs / 3600000}h). Skip.`)
      return { status: 'ok', processed: 0, failed: 0, backlog: backlogTotal }
    }

    let processed = 0
    let failed = 0
    const succeededIds: string[] = []

    for (const row of eligible) {
      if (!row.ticker) continue

      try {
        const event = this.buildEvent(row as typeof row & { ticker: string })
        await this.redis.publish(NEWS_INJECT_CHANNEL, JSON.stringify(event))
        succeededIds.push(row.id)
        processed++
      } catch (err) {
        failed++
        logger.error(JSON.stringify({
          event: 'impact_reconciler_dispatch_failed',
          news_id: row.id,
          ticker: row.ticker,
          error: (err as Error).message,
        }))
        // Não interrompe o ciclo — as demais linhas seguem sendo processadas.
      }
    }

    // Marca as linhas que tiveram sucesso
    if (succeededIds.length > 0) {
      try {
        const dispatchedAt = new Date()
        await this.prisma.news.updateMany({
          where: { id: { in: succeededIds } },
          data: { impactDispatchedAt: dispatchedAt },
        })
        logger.info(JSON.stringify({
          event: 'impact_reconciler_marked',
          marked: succeededIds.length,
          dispatched_at: dispatchedAt.toISOString(),
        }))
      } catch (err) {
        // Falha ao marcar: as linhas serão reprocessadas no próximo ciclo (idempotente).
        // O pior caso é um reenvio duplicado, não uma perda.
        logger.error(`[impact-reconciler] Erro ao marcar impactDispatchedAt: ${(err as Error).message}`)
      }
    }

    logger.info(JSON.stringify({
      event: 'impact_reconciler_cycle_complete',
      backlog: backlogTotal,
      eligible: eligible.length,
      processed,
      failed,
      stale_threshold_hours: this.staleThresholdMs / 3600000,
    }))

    return {
      status: failed > 0 && processed === 0 ? 'error' : 'ok',
      processed,
      failed,
      backlog: backlogTotal,
    }
  }

  /**
   * Reconstrói o evento NewsInjectEvent a partir do registro do banco.
   * Idempotente: o mesmo registro produz o mesmo evento (mesmo correlationId).
   */
  private buildEvent(row: {
    id: string
    title: string
    impact: string
    sentiment: string
    ticker: string
    source: string | null
    publishedAt: Date | null
    groupId: string | null
  }): NewsInjectEvent {
    const impact = row.impact as ImpactCategoryType
    const magnitude = IMPACT_MAGNITUDE[impact as ImpactCategory] ?? IMPACT_MAGNITUDE.INSTITUCIONAL
    const sentimentNum = sentimentEnumToNumber(row.sentiment)
    const signedMagnitude = sentimentNum < -0.1 ? -magnitude : magnitude

    return {
      type: 'NEWS',
      assetId: row.ticker,
      newsId: row.id,
      title: row.title.slice(0, 160),
      source: (row.source ?? '').slice(0, 80),
      impact,
      impactCategory: impact,
      sentiment: sentimentNum,
      publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : new Date().toISOString(),
      correlationId: row.groupId ?? row.id,
      magnitude: signedMagnitude,
      durationTicks: NEWS_IMPACT_DURATION_TICKS,
      curveType: 'canonical',
    }
  }
}

// ---------------------------------------------------------------------------
// Resultado do ciclo
// ---------------------------------------------------------------------------

export interface ImpactReconcilerResult {
  status: 'ok' | 'error' | 'disabled'
  processed: number
  failed: number
  backlog: number
}
