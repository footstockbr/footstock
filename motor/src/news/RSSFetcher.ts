// ============================================================================
// FootStock Motor — RSSFetcher
// Fetch periódico de feeds RSS com deduplicação Redis (TTL 48h),
// retry exponencial (1s→2s→4s) e fallback pool automático.
// Rastreabilidade: INT-046, INT-048, INT-128
// ============================================================================

import Parser from 'rss-parser'
import type Redis from 'ioredis'
import type { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'
import { newsQueue, type RawNewsItem } from './NewsQueue'
import { FallbackPool } from './FallbackPool'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Fallback hardcoded — usado quando DB não está disponível */
const FEEDS_FALLBACK = [
  { url: 'https://www.espn.com.br/rss',                  source: 'ESPN Brasil'       },
  { url: 'https://www.gazetaesportiva.com/feed/',         source: 'Gazeta Esportiva'  },
  { url: 'https://trivela.com.br/feed/',                  source: 'Trivela'           },
  { url: 'https://jovempan.com.br/esportes/feed',         source: 'Jovem Pan Esportes'},
  { url: 'https://www.mercadodabola.com.br/feed/',        source: 'Mercado da Bola'   },
]

const NEWS_URLS_KEY = 'news:urls'
const NEWS_LAST_FETCH_KEY = 'news:last_fetch'
const URL_TTL_SECONDS = 48 * 60 * 60    // 48 horas
const FETCH_INTERVAL_MS = 10 * 60 * 1000  // 10 minutos - FDD canonico
const NEWS_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 horas — INTAKE canônico

// ---------------------------------------------------------------------------
// Classe RSSFetcher
// ---------------------------------------------------------------------------

export class RSSFetcher {
  private parser: Parser
  private _interval: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly redis: Redis,
    private readonly prisma?: PrismaClient
  ) {
    this.parser = new Parser({
      timeout: 10_000,
      // F3-C (06-18): UA browser-like + Accept. Varios feeds (ex: O Gol 403) bloqueiam
      // clientes sem UA de navegador; o rss-parser default manda "User-Agent: rss-parser".
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FootStockBot/1.0; +https://footstock.com.br)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
      },
    })
  }

  // F3-B (06-18): contador de falhas consecutivas por feed (in-memory). Sem isto, um feed
  // cronicamente morto rendia 0 itens + 1 log [SYS_001] por ciclo, para sempre, sem sinal
  // escalonado. Ao cruzar o limiar, emite um ALERTA estruturado (1x) e uma metrica Redis.
  private consecutiveFailures = new Map<string, number>()
  private deadFeedAlerted = new Set<string>()  // dedup: 1 alerta por incidente, re-arma no recovery
  private static readonly DEAD_FEED_ALERT_THRESHOLD = 5

  // ---------------------------------------------------------------------------
  // Resolução dos feeds: DB → fallback hardcoded
  // ---------------------------------------------------------------------------

  private async resolveFeeds(): Promise<Array<{ url: string; source: string }>> {
    if (!this.prisma) return FEEDS_FALLBACK

    try {
      // $queryRaw independe do Prisma client gerado — funciona mesmo sem RssFeed no schema local
      const rows = await this.prisma.$queryRaw<Array<{ url: string; name: string }>>`
        SELECT url, name FROM rss_feeds WHERE is_active = true ORDER BY created_at ASC
      `
      if (rows.length > 0) {
        return rows.map((r: { url: string; name: string }) => ({ url: r.url, source: r.name }))
      }
    } catch (err) {
      logger.warn(`[RSS] Falha ao ler feeds do DB — usando fallback hardcoded: ${(err as Error).message}`)
    }

    return FEEDS_FALLBACK
  }

  // ---------------------------------------------------------------------------
  // Fetch de um feed individual com retry exponencial
  // ---------------------------------------------------------------------------

  async fetchFeed(feedConfig: { url: string; source: string }, attempt = 1): Promise<RawNewsItem[]> {
    try {
      const feed = await this.parser.parseURL(feedConfig.url)
      this.consecutiveFailures.set(feedConfig.source, 0)  // F3-B: feed saudavel -> zera contador
      this.deadFeedAlerted.delete(feedConfig.source)      // re-arma o alerta se voltar a morrer
      return (feed.items ?? []).map(item => ({
        url: item.link ?? item.guid ?? '',
        title: item.title ?? '',
        description: item.contentSnippet ?? item.summary,
        source: feedConfig.source,
        publishedAt: item.pubDate ?? new Date().toISOString(),
      })).filter(item => item.url && item.title)
    } catch (err) {
      if (attempt < 3) {
        const delay = Math.pow(2, attempt - 1) * 1000
        await sleep(delay)
        return this.fetchFeed(feedConfig, attempt + 1)
      }
      logger.error(`[SYS_001] Feed ${feedConfig.source} falhou após 3 tentativas: ${(err as Error).message}`)
      // F3-B: escalona feed cronicamente morto. Ao cruzar o limiar, emite ALERTA 1x +
      // metrica Redis (operador desativa is_active=false / corrige a URL no DB).
      const failures = (this.consecutiveFailures.get(feedConfig.source) ?? 0) + 1
      this.consecutiveFailures.set(feedConfig.source, failures)
      // Alerta 1x por incidente (>= limiar + dedup), nao so no instante == limiar.
      if (failures >= RSSFetcher.DEAD_FEED_ALERT_THRESHOLD && !this.deadFeedAlerted.has(feedConfig.source)) {
        this.deadFeedAlerted.add(feedConfig.source)
        logger.error(
          `[ALERT][RSS_DEAD_FEED] Feed "${feedConfig.source}" (${feedConfig.url}) falhou ` +
          `${failures} ciclos consecutivos. Verificar URL/desativar is_active no rss_feeds.`
        )
        this.redis.incr('motor:metrics:rss_dead_feeds').catch(() => {})
      }
      return []
    }
  }

  // ---------------------------------------------------------------------------
  // Deduplicação por URL usando Redis SET
  // ---------------------------------------------------------------------------

  async isDuplicate(url: string): Promise<boolean> {
    try {
      const exists = await this.redis.sismember(NEWS_URLS_KEY, url)
      return exists === 1
    } catch (err) {
      logger.warn(`[RSS] Redis indisponível em isDuplicate — assumindo não-duplicata: ${(err as Error).message}`)
      return false
    }
  }

  async markAsProcessed(url: string): Promise<void> {
    await this.redis.sadd(NEWS_URLS_KEY, url)
    await this.redis.expire(NEWS_URLS_KEY, URL_TTL_SECONDS)
  }

  // ---------------------------------------------------------------------------
  // Ciclo principal de fetch
  // ---------------------------------------------------------------------------

  async fetchAll(): Promise<number> {
    const startTime = Date.now()
    logger.info(`[RSS] Ciclo iniciado — ${new Date().toISOString()}`)

    const feeds = await this.resolveFeeds()
    const results = await Promise.allSettled(feeds.map(f => this.fetchFeed(f)))
    let totalCount = 0

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const source = feeds[i].source

      if (result.status === 'rejected') {
        logger.error(`[SYS_001] Feed ${source} rejeitado: ${result.reason}`)
        continue
      }

      const items = result.value
      let duplicateCount = 0
      let newCount = 0

      for (const item of items) {
        if (!item.url) continue

        // Filtrar notícias com mais de 12h (INTAKE canônico)
        if (item.publishedAt) {
          const publishedMs = new Date(item.publishedAt).getTime()
          if (!isNaN(publishedMs) && Date.now() - publishedMs > NEWS_MAX_AGE_MS) {
            continue
          }
        }

        const duplicate = await this.isDuplicate(item.url)
        if (duplicate) {
          duplicateCount++
          continue
        }

        const enqueued = newsQueue.enqueue(item)
        if (enqueued) {
          await this.markAsProcessed(item.url)
          newCount++
          totalCount++
        } else {
          logger.warn(`[RSS] Fila cheia — item descartado (será buscado no próximo ciclo): ${item.url}`)
          // Não marcar como processado — reprocessar no próximo ciclo
        }
      }

      logger.info(`[RSS] ${source}: ${items.length} itens brutos, ${duplicateCount} duplicados descartados, ${newCount} novos`)
    }

    // Atualizar timestamp do último fetch
    await this.redis.set(NEWS_LAST_FETCH_KEY, Date.now().toString())

    // Ativar fallback se nenhum item novo
    if (totalCount === 0 && await FallbackPool.isActivated(this.redis)) {
      const fallbackItems = FallbackPool.getRandom(5)
      for (const item of fallbackItems) {
        newsQueue.enqueue(item)
      }
      logger.info(`[RSS] Fallback ativado — feeds offline há > 15min. Usando ${fallbackItems.length} itens do pool estático.`)
    }

    const elapsed = Date.now() - startTime
    logger.info(`[RSS] Ciclo concluído: ${totalCount} novos itens enfileirados em ${elapsed}ms`)

    return totalCount
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    this._interval = setInterval(() => {
      this.fetchAll().catch(err => logger.error('[RSS] Erro não capturado no ciclo:', err))
    }, FETCH_INTERVAL_MS)
    logger.info('[RSS] Fetcher iniciado — ciclo a cada 5min')
  }

  stop(): void {
    if (this._interval) {
      clearInterval(this._interval)
      this._interval = null
    }
    logger.info('[RSS] Fetcher parado')
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
