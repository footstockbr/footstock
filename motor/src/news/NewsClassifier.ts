// ============================================================================
// Foot Stock Motor — NewsClassifier
// Classifica notícias via Claude Sonnet: ticker, impactCategory, sentiment, relevance.
// Rate limiting por token bucket Redis (60 req/min).
// Rastreabilidade: INT-047, INT-128
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'
import type Redis from 'ioredis'
import { type PrismaClient, Prisma } from '@prisma/client'
import { ImpactCategory } from './types'
import { logger } from '../utils/logger'
import { newsQueue, type RawNewsItem } from './NewsQueue'
import type { NewsPublisher } from './NewsPublisher'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassifiedNews {
  ticker: string          // ticker do ativo afetado; '' se não identificado
  sentiment: number       // -1.0 a 1.0
  impactCategory: string  // ImpactCategory como string
  relevance: number       // 0.0 a 1.0
}

const CLASSIFICATION_FALLBACK: ClassifiedNews = {
  ticker: '',
  sentiment: 0,
  impactCategory: 'INSTITUCIONAL',
  relevance: 0,
}

// ---------------------------------------------------------------------------
// Rate limit config
// ---------------------------------------------------------------------------

const RATE_LIMIT_KEY = 'news:sonnet:tokens'
const RATE_LIMIT_MAX = 60
const RATE_LIMIT_TTL = 60 // segundos

// ---------------------------------------------------------------------------
// Erro de rate limit
// ---------------------------------------------------------------------------

export class RateLimitError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'RateLimitError'
  }
}

// ---------------------------------------------------------------------------
// Tickers dos 40 ativos disponíveis
// ---------------------------------------------------------------------------

const TICKERS_40 = [
  'URU3', 'POR4', 'TIM3', 'TRI4', 'GAL3', 'FOG3', 'COL3', 'IMO3', 'RAP3', 'MAL4',
  'TRI3', 'GUE4', 'TOR3', 'LEM3', 'BAL4', 'FUR3', 'VOA4', 'CON3', 'LEA3', 'LEB3',
  'COE3', 'CAV4', 'DRA3', 'LEI4', 'PAN3', 'VOZ3', 'GAP3', 'TIG4', 'DOU4', 'LEP4',
  'PER3', 'IND4', 'TUB3', 'NAF3', 'TIV3', 'FAS3', 'MAC4', 'ABT4', 'LEI3', 'TIS3',
]

const IMPACT_CATEGORIES = Object.values(ImpactCategory).join(', ')

// ---------------------------------------------------------------------------
// Classe NewsClassifier
// ---------------------------------------------------------------------------

export class NewsClassifier {
  private anthropic: Anthropic
  private running = false
  /** Linha compacta "URU3=flamengo,fla,urubu | POR4=palmeiras,porco | ..." carregada do DB */
  private tickerMapLine = ''

  constructor(
    private readonly redis: Redis,
    private readonly prisma?: PrismaClient,
  ) {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  // ---------------------------------------------------------------------------
  // Carregamento do mapeamento ticker → clube real (search_text do DB)
  // ---------------------------------------------------------------------------

  private async loadTickerAliases(): Promise<void> {
    if (!this.prisma) {
      logger.warn('[NewsClassifier] Sem Prisma — mapeamento de tickers desativado (qualidade reduzida)')
      return
    }
    try {
      const rows = await this.prisma.$queryRaw<Array<{ ticker: string; search_text: string }>>`
        SELECT ticker, search_text FROM assets WHERE is_active = true AND search_text <> '' ORDER BY ticker
      `
      // Formato compacto para o prompt: "URU3=flamengo,fla,mengao,urubu | POR4=palmeiras,porco,verdao"
      this.tickerMapLine = rows
        .map((r: { ticker: string; search_text: string }) =>
          `${r.ticker}=${r.search_text.split(/[,;|]+/).map((s: string) => s.trim()).filter(Boolean).slice(0, 6).join(',')}`
        )
        .join(' | ')
      logger.info(`[NewsClassifier] Mapeamento real→ticker: ${rows.length} ativos carregados`)
    } catch (err) {
      logger.warn(`[NewsClassifier] Falha ao carregar mapeamento do DB: ${(err as Error).message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Token bucket rate limit
  // ---------------------------------------------------------------------------

  async checkRateLimit(): Promise<void> {
    // Garantir que o bucket existe
    const exists = await this.redis.exists(RATE_LIMIT_KEY)
    if (!exists) {
      await this.redis.set(RATE_LIMIT_KEY, RATE_LIMIT_MAX, 'EX', RATE_LIMIT_TTL)
    }

    const tokens = await this.redis.decr(RATE_LIMIT_KEY)
    if (tokens < 0) {
      await this.redis.incr(RATE_LIMIT_KEY) // reverter decrement
      throw new RateLimitError('RATE_001', 'Rate limit Sonnet excedido (60 req/min)')
    }
  }

  // ---------------------------------------------------------------------------
  // Prompt de classificação
  // ---------------------------------------------------------------------------

  private buildPrompt(item: RawNewsItem): string {
    const mapSection = this.tickerMapLine
      ? `\nMapeamento ticker → nomes reais do clube (use para identificar o ticker correto):\n${this.tickerMapLine}\n`
      : ''
    return `Você é um classificador de notícias de futebol brasileiro para um sistema financeiro fictício.
Os clubes têm nomes fictícios internos (ex: "Urubu da Gávea FC") mas correspondem a clubes reais.
Use o mapeamento abaixo para identificar corretamente o ticker a partir do nome real do clube na notícia.
${mapSection}
Tickers disponíveis: ${TICKERS_40.join(', ')}
Categorias de impacto: ${IMPACT_CATEGORIES}

Regras:
- ticker: código do clube afetado (sempre 4 chars), ou "" se a notícia não afeta nenhum clube específico
- sentiment: número de -1.0 (muito negativo) a 1.0 (muito positivo) para o clube
- impactCategory: uma das categorias listadas acima
- relevance: 0.0 a 1.0 — quão relevante é para o mercado financeiro do clube

Notícia:
Título: ${item.title}
${item.description ? `Descrição: ${item.description}` : ''}
Fonte: ${item.source}

Responda SOMENTE com JSON no formato:
{"ticker":"URU3","sentiment":0.8,"impactCategory":"ESPORTIVA_MAJORITARIA","relevance":0.9}`
  }

  // ---------------------------------------------------------------------------
  // Classificar uma notícia
  // ---------------------------------------------------------------------------

  async classify(item: RawNewsItem, attempt = 1): Promise<ClassifiedNews> {
    await this.checkRateLimit()

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
      logger.warn(`[NewsClassifier] Timeout após 5s — abortando chamada Sonnet (tentativa ${attempt})`)
    }, 5000)

    try {
      const response = await this.anthropic.messages.create(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 150,
          messages: [{ role: 'user', content: this.buildPrompt(item) }],
        },
        { signal: controller.signal as AbortSignal }
      )

      const text = response.content[0].type === 'text' ? response.content[0].text : ''

      try {
        const parsed = JSON.parse(text) as Partial<ClassifiedNews>

        const rawTicker = typeof parsed.ticker === 'string' ? parsed.ticker.toUpperCase().slice(0, 4) : ''
        const ticker = TICKERS_40.includes(rawTicker) ? rawTicker : ''
        if (rawTicker && !ticker) {
          logger.warn(`[NewsClassifier] Ticker inválido retornado pelo LLM: "${rawTicker}" — ignorado`)
        }

        const sentiment = typeof parsed.sentiment === 'number' && isFinite(parsed.sentiment)
          ? Math.max(-1, Math.min(1, parsed.sentiment))
          : 0
        const relevance = typeof parsed.relevance === 'number' && isFinite(parsed.relevance)
          ? Math.max(0, Math.min(1, parsed.relevance))
          : 0

        return {
          ticker,
          sentiment,
          impactCategory: typeof parsed.impactCategory === 'string' ? parsed.impactCategory : 'INSTITUCIONAL',
          relevance,
        }
      } catch {
        logger.warn(`[NewsClassifier] Resposta Sonnet não é JSON válido — aplicando fallback`)
        return { ...CLASSIFICATION_FALLBACK }
      }
    } catch (err) {
      if (attempt < 3) {
        await sleep(1000)
        return this.classify(item, attempt + 1)
      }

      logger.error(`[SYS_002] Sonnet API indisponível após 3 tentativas: ${(err as Error).message}`)
      return { ...CLASSIFICATION_FALLBACK }
    } finally {
      clearTimeout(timeout)
    }
  }

  // ---------------------------------------------------------------------------
  // Worker loop — processa a fila continuamente
  // ---------------------------------------------------------------------------

  async startClassifying(publisher: NewsPublisher): Promise<void> {
    this.running = true
    await this.loadTickerAliases()
    logger.info('[NewsClassifier] Worker iniciado')

    while (this.running) {
      if (newsQueue.isEmpty()) {
        await sleep(500)
        continue
      }

      const item = newsQueue.dequeue()!
      try {
        const classified = await this.classify(item)
        await publisher.publish(item, classified)
      } catch (err) {
        if (err instanceof RateLimitError) {
          logger.warn(`[RATE_001] Rate limit atingido — re-enfileirando item e aguardando 1s`)
          newsQueue.enqueue(item)
          await sleep(1000)
        } else {
          logger.error(`[NewsClassifier] Erro inesperado no worker: ${(err as Error).message}`)
          // fallback já aplicado em classify
        }
      }
    }

    logger.info('[NewsClassifier] Worker parado')
  }

  stopClassifying(): void {
    this.running = false
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
