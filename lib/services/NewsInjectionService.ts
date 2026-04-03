// ============================================================================
// Foot Stock — NewsInjectionService
// Injeção manual de notícias pelo admin com RBAC e auditoria.
// Rastreabilidade: INT-049
// ============================================================================

import { z } from 'zod'
import { ImpactCategory, Sentiment } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { redisPublisher, REDIS_CHANNELS } from '@/lib/redis'
import { sentimentToDurationTicks } from '../contracts/NewsInjectContract'
import type { NewsInjectEvent } from '../types/news'

// ---------------------------------------------------------------------------
// Schema de validação do DTO
// ---------------------------------------------------------------------------

export const adminNewsInjectSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  ticker: z.string().min(1).max(4).transform(v => v.toUpperCase()),
  impactCategory: z.nativeEnum(ImpactCategory),
  sentiment: z.number().min(-1).max(1),
  source: z.string().optional().default('Admin'),
})

export type AdminNewsInjectDTO = z.infer<typeof adminNewsInjectSchema>

// ---------------------------------------------------------------------------
// Helper: mapear sentimento numérico → enum Sentiment
// ---------------------------------------------------------------------------

function numberToSentiment(sentiment: number): Sentiment {
  if (sentiment > 0.1) return Sentiment.BULLISH
  if (sentiment < -0.1) return Sentiment.BEARISH
  return Sentiment.NEUTRAL
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
    // 1. Salvar notícia no banco
    // -----------------------------------------------------------------------
    const news = await prisma.news.create({
      data: {
        title: dto.title,
        content: dto.content,
        impact: dto.impactCategory,
        sentiment: numberToSentiment(dto.sentiment),
        assetIds: [asset.id],
        source: dto.source ?? 'Admin',
        isPublished: true,
        publishedAt: new Date(),
      },
    })

    // -----------------------------------------------------------------------
    // 2. Publicar no Redis imediatamente
    // -----------------------------------------------------------------------
    const event: NewsInjectEvent = {
      type: 'NEWS',
      assetId: dto.ticker,
      impact: dto.impactCategory,
      magnitude: Math.abs(dto.sentiment),
      durationTicks: sentimentToDurationTicks(dto.sentiment),
    }
    await redisPublisher.publish(REDIS_CHANNELS.NEWS_INJECT, JSON.stringify(event))

    // Também publicar no canal motor:control para que o motor processe o impacto de preço.
    // O motor indexa assetStates por UUID (asset.id), não por ticker.
    const isNegative = dto.sentiment < 0
    const motorControlEvent = {
      type: 'INJECT_NEWS',
      assetId: asset.id,
      adminId,
      payload: {
        impact: isNegative ? 'NEGATIVE' : 'POSITIVE',
        magnitude: Math.abs(dto.sentiment),
        durationTicks: sentimentToDurationTicks(dto.sentiment),
        sentiment: dto.sentiment,
      },
    }
    await redisPublisher.publish(REDIS_CHANNELS.MOTOR_CONTROL, JSON.stringify(motorControlEvent))

    // -----------------------------------------------------------------------
    // 3. Registrar auditoria
    // -----------------------------------------------------------------------
    await prisma.adminMarketAction.create({
      data: {
        adminId,
        assetId: asset.id,
        action: 'NEWS_INJECT',
        reason: `[${dto.impactCategory}] ${dto.title} (sentiment: ${dto.sentiment}, source: ${dto.source ?? 'Admin'})`,
      },
    })

    return { newsId: news.id }
  }
}

export const newsInjectionService = new NewsInjectionService()
