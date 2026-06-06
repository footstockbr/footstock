// ============================================================================
// FootStock — NewsInjectionService
// Injeção manual de notícias pelo admin com RBAC e auditoria.
// Rastreabilidade: INT-049
// ============================================================================

import { z } from 'zod'
import { ImpactCategory, Sentiment } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { redisPublisher, REDIS_CHANNELS } from '@/lib/redis'
import type { NewsInjectEvent } from '../types/news'

const NEWS_IMPACT_DURATION_TICKS = 50

// ---------------------------------------------------------------------------
// Schema de validação do DTO
// ---------------------------------------------------------------------------

export const adminNewsInjectSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1).optional(),
  ticker: z.string().min(1).max(10).transform(v => v.toUpperCase()),
  impactCategory: z.nativeEnum(ImpactCategory),
  sentiment: z.number().min(-1).max(1),
  source: z.string().optional().default('Admin'),
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

// ---------------------------------------------------------------------------
// Classe NewsInjectionService
// ---------------------------------------------------------------------------

export class NewsInjectionService {
  /**
   * Injeta uma notícia manualmente (admin).
   * Salva no DB, publica no Redis e registra auditoria.
   * @returns { newsId: string }
   */
  async inject(dto: AdminNewsInjectDTO, adminId: string): Promise<{ newsId: string }> {
    // -----------------------------------------------------------------------
    // 0. Localizar ativo pelo ticker para obter assetId
    // -----------------------------------------------------------------------
    const asset = await prisma.asset.findUnique({ where: { ticker: dto.ticker } })
    if (!asset) {
      throw new Error(`Ativo não encontrado: ${dto.ticker}`)
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
    // 1. Salvar notícia no banco
    // -----------------------------------------------------------------------
    // Map numeric sentiment to Sentiment enum
    const sentimentEnum: Sentiment = dto.sentiment > 0.3
      ? Sentiment.BULLISH
      : dto.sentiment < -0.3
        ? Sentiment.BEARISH
        : Sentiment.NEUTRAL

    const news = await prisma.news.create({
      data: {
        title: dto.title,
        content: dto.content ?? '',
        impact: dto.impactCategory,
        sentiment: sentimentEnum,
        ticker: asset.ticker,
        assetIds: [asset.id],
        source: dto.source ?? 'Admin',
        isPublished: true,
        publishedAt: new Date(),
      },
    })

    const audit = await prisma.adminMarketAction.create({
      data: {
        adminId,
        assetId: asset.id,
        ticker: asset.ticker,
        action: 'NEWS_INJECT',
        reason: `[${dto.impactCategory}] ${dto.title}`,
        details: {
          newsId: news.id,
          correlationId: news.id,
          publishedImpactApplied: false,
          title: dto.title,
          source: dto.source ?? 'Admin',
          impactCategory: dto.impactCategory,
          sentiment: dto.sentiment,
          publishedAt: news.publishedAt?.toISOString(),
          durationTicks: NEWS_IMPACT_DURATION_TICKS,
          reason: `[${dto.impactCategory}] ${dto.title} (sentiment: ${dto.sentiment}, source: ${dto.source ?? 'Admin'})`,
        },
      },
    })

    // -----------------------------------------------------------------------
    // 2. Publicar no Redis imediatamente
    // -----------------------------------------------------------------------
    const event: NewsInjectEvent = {
      type: 'NEWS',
      assetId: dto.ticker,
      newsId: news.id,
      ticker: dto.ticker,
      title: dto.title,
      sentiment: dto.sentiment,
      impactCategory: dto.impactCategory,
      source: dto.source ?? 'Admin',
      publishedAt: news.publishedAt?.toISOString(),
      correlationId: news.id,
      durationTicks: NEWS_IMPACT_DURATION_TICKS,
      curveType: 'canonical',
    }
    await redisPublisher.publish(REDIS_CHANNELS.NEWS_INJECT, JSON.stringify(event))

    // Também publicar no canal motor:control para que o motor processe o impacto de preço.
    // O motor indexa assetStates por UUID (asset.id), não por ticker.
    // Isolado em try/catch: falha aqui não deve impedir o registro de auditoria abaixo.
    try {
      const isNegative = dto.sentiment < 0
      const motorControlEvent = {
        type: 'INJECT_NEWS',
        assetId: asset.id,
        adminId,
        payload: {
          impact: isNegative ? 'NEGATIVE' : 'POSITIVE',
          magnitude: Math.min(Math.abs(dto.sentiment) * magnitudeMultiplier, 1),
          durationTicks: NEWS_IMPACT_DURATION_TICKS,
          curveType: 'canonical',
          newsId: news.id,
          title: dto.title,
          source: dto.source ?? 'Admin',
          impactCategory: dto.impactCategory,
          sentiment: dto.sentiment,
          publishedAt: news.publishedAt?.toISOString(),
          correlationId: news.id,
          adminActionId: audit.id,
        },
        correlationId: news.id,
      }
      await redisPublisher.publish(REDIS_CHANNELS.MOTOR_CONTROL, JSON.stringify(motorControlEvent))
      await prisma.adminMarketAction.update({
        where: { id: audit.id },
        data: {
          details: {
            newsId: news.id,
            correlationId: news.id,
            publishedImpactApplied: true,
            title: dto.title,
            source: dto.source ?? 'Admin',
            impactCategory: dto.impactCategory,
            sentiment: dto.sentiment,
            publishedAt: news.publishedAt?.toISOString(),
            durationTicks: NEWS_IMPACT_DURATION_TICKS,
            adminActionId: audit.id,
            reason: `[${dto.impactCategory}] ${dto.title} (sentiment: ${dto.sentiment}, source: ${dto.source ?? 'Admin'})`,
          },
        },
      })
    } catch (err) {
      // Motor:control indisponível: notícia salva no DB e news:inject publicado.
      // Impacto de preço não será aplicado, mas auditoria prossegue normalmente.
      console.error('[NewsInjectionService] Falha ao publicar INJECT_NEWS no motor:control:', err)
    }

    return { newsId: news.id }
  }

  async reconcileUnappliedNews(limit = 50): Promise<{ checked: number; reapplied: number; failed: number; unapplied: number }> {
    const actions = await prisma.adminMarketAction.findMany({
      where: {
        action: 'NEWS_INJECT',
        details: {
          path: ['publishedImpactApplied'],
          equals: false,
        },
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
          publishedAt: stringField(details.publishedAt, new Date().toISOString()),
          correlationId,
          adminActionId: action.id,
        },
        correlationId,
      }

      try {
        await redisPublisher.publish(REDIS_CHANNELS.MOTOR_CONTROL, JSON.stringify(motorControlEvent))
        await prisma.adminMarketAction.update({
          where: { id: action.id },
          data: {
            details: {
              ...details,
              newsId,
              correlationId,
              publishedImpactApplied: true,
              reconciledAt: new Date().toISOString(),
            },
          },
        })
        reapplied++
      } catch (err) {
        failed++
        await prisma.adminMarketAction.update({
          where: { id: action.id },
          data: {
            details: {
              ...details,
              newsId,
              correlationId,
              publishedImpactApplied: false,
              reconciliationError: String(err),
              reconciliationFailedAt: new Date().toISOString(),
            },
          },
        })
      }
    }

    return { checked: actions.length, reapplied, failed, unapplied: Math.max(actions.length - reapplied, 0) }
  }
}

export const newsInjectionService = new NewsInjectionService()
