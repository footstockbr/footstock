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

/** Mapeia sentimento numérico para duração de ticks do efeito da notícia */
function numberToSentimentDuration(sentiment: number): number {
  const abs = Math.abs(sentiment)
  if (abs > 0.7) return 10
  if (abs > 0.3) return 6
  return 3
}

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

    // -----------------------------------------------------------------------
    // 2. Publicar no Redis imediatamente
    // -----------------------------------------------------------------------
    const event: NewsInjectEvent = {
      ticker: dto.ticker,
      title: dto.title,
      sentiment: dto.sentiment,
      impactCategory: dto.impactCategory,
      source: dto.source ?? 'Admin',
      durationTicks: numberToSentimentDuration(dto.sentiment),
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
          durationTicks: numberToSentimentDuration(dto.sentiment),
          sentiment: dto.sentiment,
        },
      }
      await redisPublisher.publish(REDIS_CHANNELS.MOTOR_CONTROL, JSON.stringify(motorControlEvent))
    } catch (err) {
      // Motor:control indisponível: notícia salva no DB e news:inject publicado.
      // Impacto de preço não será aplicado, mas auditoria prossegue normalmente.
      console.error('[NewsInjectionService] Falha ao publicar INJECT_NEWS no motor:control:', err)
    }

    // -----------------------------------------------------------------------
    // 3. Registrar auditoria
    // -----------------------------------------------------------------------
    await prisma.adminMarketAction.create({
      data: {
        adminId,
        ticker: asset.ticker,
        action: 'NEWS_INJECT',
        details: { reason: `[${dto.impactCategory}] ${dto.title} (sentiment: ${dto.sentiment}, source: ${dto.source ?? 'Admin'})` },
      },
    })

    return { newsId: news.id }
  }
}

export const newsInjectionService = new NewsInjectionService()
