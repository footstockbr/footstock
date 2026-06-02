// ============================================================================
// FootStock Motor — NewsPublisher
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
      // ADR: blacksmith/adr/adr-news-ticker-assetids-sync.md — Opcao A (ticker + assetIds sincronizados)
      type PrismaWithNews = { news: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> } }
      type PrismaWithAsset = {
        asset: { findUnique: (args: { where: { ticker: string }; select: { id: boolean } }) => Promise<{ id: string } | null> }
      } & PrismaWithNews
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const prismaWithAsset = this.prisma as unknown as PrismaWithAsset

      let assetId: string | null = null
      if (classified.ticker) {
        const asset = await prismaWithAsset.asset.findUnique({
          where: { ticker: classified.ticker },
          select: { id: true },
        })
        assetId = asset?.id ?? null
        if (!assetId) {
          logger.warn(`[NewsPublisher] Ticker '${classified.ticker}' nao encontrado em assets — assetIds ficara vazio`)
        }
      }

      logger.info(JSON.stringify({
        event: 'news_publisher_persist',
        title: raw.title.slice(0, 80),
        classified_ticker: classified.ticker || null,
        classified_relevance: classified.relevance,
        classified_impact: classified.impactCategory,
        asset_id_resolved: assetId,
        will_persist_ticker: !!(classified.ticker),
      }))

      const news = await prismaWithAsset.news.create({
        data: {
          title: raw.title,
          content: raw.description ?? raw.title,
          impact: this.resolveImpactCategory(classified.impactCategory),
          sentiment: sentimentEnum,
          ticker: classified.ticker || null,
          assetIds: assetId ? [assetId] : [],
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
        const baseMagnitude = IMPACT_MAGNITUDE[resolvedCategory] ?? 0.01
        // Aplicar sinal do sentimento: negativo → queda de preço
        const signedMagnitude = classified.sentiment < -0.1 ? -baseMagnitude : baseMagnitude
        const event: NewsInjectEvent = {
          type: 'NEWS',
          assetId: classified.ticker,
          impact: resolvedCategory as NewsInjectEvent['impact'],
          magnitude: signedMagnitude,
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
