// ============================================================================
// Foot Stock Motor — NewsPublisher
// Persiste notícia classificada no DB + publica no Redis (condicional).
// Rastreabilidade: INT-046, INT-049
// ============================================================================

import type Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { ImpactCategory } from './types'
import { logger } from '../utils/logger'
import type { RawNewsItem } from './NewsQueue'
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
// Classe NewsPublisher
// ---------------------------------------------------------------------------

export class NewsPublisher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  async publish(raw: RawNewsItem, classified: ClassifiedNews): Promise<void> {
    // -----------------------------------------------------------------------
    // Passo 1 — Salvar no DB
    // -----------------------------------------------------------------------
    let newsId: string | undefined

    try {
      // Mapear sentimento numérico → enum Sentiment do schema real
      const sentimentEnum = classified.sentiment > 0.1 ? 'BULLISH'
        : classified.sentiment < -0.1 ? 'BEARISH'
        : 'NEUTRAL'

      // GAP-014: PrismaClient gerado pode não incluir modelo 'news' no tipo estático
      // quando rodando no motor Railway com client separado. Type assertion mínima tipada.
      type PrismaWithNews = { news: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> } }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const prismaWithNews = this.prisma as unknown as PrismaWithNews
      const news = await prismaWithNews.news.create({
        data: {
          title: raw.title,
          content: raw.description ?? raw.title,
          impact: this.resolveImpactCategory(classified.impactCategory),
          sentiment: sentimentEnum,
          assetIds: classified.ticker ? [classified.ticker] : [],
          source: raw.source,
          isPublished: true,
          publishedAt: new Date(raw.publishedAt),
        },
      })
      newsId = news.id
    } catch (err) {
      logger.error(`[NewsPublisher] Erro ao salvar no DB: ${(err as Error).message}`)
      return // Não publicar Redis sem DB salvo
    }

    // -----------------------------------------------------------------------
    // Passo 2 — Publicar no Redis (condicional: ticker + relevance > 0.3)
    // -----------------------------------------------------------------------
    const shouldPublish = classified.ticker &&
      classified.ticker !== '' &&
      classified.relevance > RELEVANCE_THRESHOLD

    if (shouldPublish) {
      try {
        const resolvedCategory = this.resolveImpactCategory(classified.impactCategory)
        const event: NewsInjectEvent = {
          type: 'NEWS',
          assetId: classified.ticker,
          impact: resolvedCategory as NewsInjectEvent['impact'],
          magnitude: IMPACT_MAGNITUDE[resolvedCategory] ?? 0.01,
          durationTicks: sentimentToDurationTicks(classified.sentiment),
        }
        await this.redis.publish(NEWS_INJECT_CHANNEL, JSON.stringify(event))
      } catch (err) {
        logger.error(`[NewsPublisher] Erro ao publicar no Redis: ${(err as Error).message}`)
        // Não reverter — DB já salvo
      }
    }

    // -----------------------------------------------------------------------
    // Passo 3 — Notificação NEWS_FAVORITE_CLUB
    // DECISÃO DE BOUNDARY (module-17): O motor Railway não tem acesso ao serviço
    // de notificações Next.js. Responsabilidade delegada ao module-19-inbox-notificacoes:
    // deve subscrever o canal `news:inject` e verificar se o ticker é o clube favorito
    // do usuário para disparar a notificação NEWS_FAVORITE_CLUB.
    // Rastreabilidade: OVERVIEW.md §Impacto em Outros Módulos → module-19
    // GAP-015: boundary documentado — não é gap de implementação deste módulo.
    // -----------------------------------------------------------------------
    void newsId // referenciado para evitar lint warnings
  }

  // ---------------------------------------------------------------------------
  // Helper: mapear impactCategory string → enum Prisma
  // ---------------------------------------------------------------------------

  private resolveImpactCategory(category: string): ImpactCategory {
    const valid = Object.values(ImpactCategory)
    if (valid.includes(category as ImpactCategory)) {
      return category as ImpactCategory
    }
    return ImpactCategory.INSTITUCIONAL
  }
}
