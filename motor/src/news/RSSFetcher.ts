// ============================================================================
// Foot Stock Motor — RSSFetcher
// Fetch periódico de feeds RSS com deduplicação Redis (TTL 48h),
// retry exponencial (1s→2s→4s) e fallback pool automático.
// Rastreabilidade: INT-046, INT-048, INT-128
// ============================================================================

import Parser from 'rss-parser'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import { newsQueue, type RawNewsItem } from './NewsQueue'
import { FallbackPool } from './FallbackPool'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FEEDS = [
  { url: 'https://www.espnbrasil.com.br/rss', source: 'ESPN Brasil' },
  { url: 'https://ge.globo.com/rss/globoesporte/', source: 'Globo Esporte' },
  { url: 'https://www.lance.com.br/rss', source: 'Lance!' },
]

const NEWS_URLS_KEY = 'news:urls'
const NEWS_LAST_FETCH_KEY = 'news:last_fetch'
const URL_TTL_SECONDS = 48 * 60 * 60    // 48 horas
const FETCH_INTERVAL_MS = 5 * 60 * 1000  // 5 minutos
const NEWS_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 horas — INTAKE canônico

// ---------------------------------------------------------------------------
// Classe RSSFetcher
// ---------------------------------------------------------------------------

export class RSSFetcher {
  private parser: Parser
  private _interval: ReturnType<typeof setInterval> | null = null

  constructor(private readonly redis: Redis) {
    this.parser = new Parser({ timeout: 10_000 })
  }

  // ---------------------------------------------------------------------------
  // Fetch de um feed individual com retry exponencial
  // ---------------------------------------------------------------------------

  async fetchFeed(feedConfig: { url: string; source: string }, attempt = 1): Promise<RawNewsItem[]> {
    try {
      const feed = await this.parser.parseURL(feedConfig.url)
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

    const results = await Promise.allSettled(FEEDS.map(f => this.fetchFeed(f)))
    let totalCount = 0

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const source = FEEDS[i].source

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
