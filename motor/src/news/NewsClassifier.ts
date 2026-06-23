// ============================================================================
// FootStock Motor — NewsClassifier
// Classifica notícias via Claude Sonnet: ticker, impactCategory, sentiment, relevance.
// Prompt caching no prefixo estático (primeiro content block da mensagem user +
// cache_control), gate de 1024 tokens, versionamento do mapa de tickers e
// instrumentação de custo.
// Rate limiting por token bucket Redis (60 req/min).
// Rastreabilidade: INT-047, INT-128
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import type Redis from 'ioredis'
import { type PrismaClient, Prisma } from '@prisma/client'
import { ImpactCategory } from './types'
import { logger } from '../utils/logger'
import { newsQueue, type RawNewsItem } from './NewsQueue'
import type { NewsPublisher } from './NewsPublisher'
import { buildAliasIndex, resolveFromIndex, type AliasIndex } from './ticker-fallback'

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
// Config de model e caching
// ---------------------------------------------------------------------------

const MODEL = 'claude-sonnet-4-6'

// Mínimo cacheável do Anthropic para Sonnet. Prefixos abaixo disso fazem o
// cache_control ser IGNORADO silenciosamente (sem erro, sem cache, custo cheio).
// Usamos margem (1100) porque a contagem inclui overhead de mensagem.
const CACHE_MIN_PREFIX_TOKENS = 1024
const CACHE_PROBE_MARGIN_TOKENS = 1100

type CacheMode = 'off' | '5m' | '1h'
type PromptFormat = 'legacy' | 'split'

function resolveCacheMode(): CacheMode {
  const raw = (process.env.NEWS_CLASSIFIER_PROMPT_CACHE ?? '1h').toLowerCase()
  return raw === 'off' || raw === '5m' || raw === '1h' ? raw : '1h'
}

function resolvePromptFormat(): PromptFormat {
  const raw = (process.env.NEWS_CLASSIFIER_PROMPT_FORMAT ?? 'split').toLowerCase()
  return raw === 'legacy' ? 'legacy' : 'split'
}

function resolveTimeoutMs(): number {
  const raw = Number.parseInt(process.env.NEWS_CLASSIFIER_TIMEOUT_MS ?? '', 10)
  // Default 15s: o antigo 5s abortava chamadas Sonnet legítimas e disparava
  // retries que custavam dobrado (a requisição já consumia tokens server-side).
  return Number.isFinite(raw) && raw > 0 ? raw : 15_000
}

// ---------------------------------------------------------------------------
// Rate limit config
// ---------------------------------------------------------------------------

const RATE_LIMIT_KEY = 'news:sonnet:tokens'
const RATE_LIMIT_MAX = 60
const RATE_LIMIT_TTL = 60 // segundos

// Recarga periódica do mapa de tickers (resolve mapa-velho-carregado-no-boot)
const ALIAS_RELOAD_INTERVAL_MS = 60_000

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
  'URU3', 'POR3', 'TIM3', 'TRI3', 'GAL3', 'REG3', 'COL3', 'IMO3', 'RAP3', 'CRZ3',
  'BMP3', 'GUE3', 'TOR3', 'LEM3', 'PEI3', 'FUR3', 'COX3', 'CON3', 'RMO3', 'LEA3',
  'COE3', 'CAV3', 'DRA3', 'LDI3', 'PAN3', 'VOZ3', 'GAP3', 'TIG3', 'CBA3', 'LEP3',
  'PER3', 'IND3', 'TUB3', 'NAF3', 'TIV3', 'FAS3', 'MAC3', 'ABT3', 'LEI3', 'TIS3',
]

const IMPACT_CATEGORIES = Object.values(ImpactCategory).join(', ')

// ---------------------------------------------------------------------------
// Classe NewsClassifier
// ---------------------------------------------------------------------------

export class NewsClassifier {
  private anthropic: Anthropic
  private running = false
  /** Linha compacta "URU3=flamengo,fla,urubu | POR3=palmeiras,porco | ..." carregada do DB */
  private tickerMapLine = ''
  /** Índice determinístico (full search_text) para fallback quando o LLM devolve ticker vazio. */
  private tickerIndex: AliasIndex = []

  private readonly cacheMode: CacheMode
  private readonly promptFormat: PromptFormat
  private readonly timeoutMs: number

  // Estado derivado do prefixo estático (recomputado quando o mapa muda)
  private staticPrefix = ''
  private prefixHash = ''
  private aliasMapVersion = ''
  private cacheEligible = false
  private cacheProbed = false
  private lastAliasLoadMs = 0

  constructor(
    private readonly redis: Redis,
    private readonly prisma?: PrismaClient,
  ) {
    this.cacheMode = resolveCacheMode()
    this.promptFormat = resolvePromptFormat()
    this.timeoutMs = resolveTimeoutMs()

    // TTL estendido (1h) exige header beta. Inofensivo quando não usado.
    const defaultHeaders =
      this.cacheMode === '1h'
        ? { 'anthropic-beta': 'extended-cache-ttl-2025-04-11' }
        : undefined

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      // O SDK reentrega 429/5xx/timeout até maxRetries (default 2). Combinado com
      // o retry manual 3x daqui, dava até ~9 chamadas HTTP por item — exatamente
      // o multiplicador de custo que motivou esta mudança. Centralizamos o retry
      // numa única política (a manual, em classify), zerando a do SDK.
      maxRetries: 0,
      ...(defaultHeaders ? { defaultHeaders } : {}),
    })
  }

  // ---------------------------------------------------------------------------
  // Carregamento do mapeamento ticker → clube real (search_text do DB)
  // ---------------------------------------------------------------------------

  private async loadTickerAliases(): Promise<void> {
    this.lastAliasLoadMs = Date.now()

    if (!this.prisma) {
      logger.warn('[NewsClassifier] Sem Prisma — mapeamento de tickers desativado (qualidade reduzida)')
      await this.rebuildStaticPrefix()
      return
    }
    try {
      const rows = await this.prisma.$queryRaw<Array<{ ticker: string; search_text: string }>>`
        SELECT ticker, search_text FROM assets WHERE is_active = true AND search_text <> '' ORDER BY ticker
      `
      // Formato compacto e DETERMINÍSTICO para o prompt (ordenado por ticker no SQL).
      // Determinismo é obrigatório: qualquer variação de bytes quebra o cache.
      const nextMapLine = rows
        .map((r: { ticker: string; search_text: string }) =>
          `${r.ticker}=${r.search_text.split(/[,;|]+/).map((s: string) => s.trim()).filter(Boolean).slice(0, 6).join(',')}`
        )
        .join(' | ')

      // Índice determinístico de fallback usa o search_text COMPLETO (não o
      // truncado a 6 tokens do prompt). Reconstruído a cada load (barato).
      this.tickerIndex = buildAliasIndex(
        rows.map((r: { ticker: string; search_text: string }) => ({ ticker: r.ticker, searchText: r.search_text })),
      )

      if (nextMapLine !== this.tickerMapLine) {
        this.tickerMapLine = nextMapLine
        await this.rebuildStaticPrefix()
        logger.info(`[NewsClassifier] Mapeamento real→ticker: ${rows.length} ativos (version=${this.aliasMapVersion.slice(0, 8)})`)
      }
    } catch (err) {
      logger.warn(`[NewsClassifier] Falha ao carregar mapeamento do DB: ${(err as Error).message}`)
      if (!this.staticPrefix) await this.rebuildStaticPrefix()
    }
  }

  /** Recarga periódica barata: só consulta o DB se passou o intervalo. */
  private async maybeReloadAliases(): Promise<void> {
    if (Date.now() - this.lastAliasLoadMs >= ALIAS_RELOAD_INTERVAL_MS) {
      await this.loadTickerAliases()
    }
  }

  // ---------------------------------------------------------------------------
  // Prefixo estático (cacheável) — recomputado quando o mapa muda
  // ---------------------------------------------------------------------------

  private buildStaticPrefix(): string {
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

Responda SOMENTE com JSON no formato:
{"ticker":"URU3","sentiment":0.8,"impactCategory":"ESPORTIVA_MAJORITARIA","relevance":0.9}`
  }

  private buildDynamicPrompt(item: RawNewsItem): string {
    return `Notícia:
Título: ${item.title}
${item.description ? `Descrição: ${item.description}` : ''}
Fonte: ${item.source}

Classifique a notícia acima usando as regras e o mapeamento fornecidos.`
  }

  /** Prompt legado em string única (rollback via NEWS_CLASSIFIER_PROMPT_FORMAT=legacy). */
  private buildLegacyPrompt(item: RawNewsItem): string {
    return `${this.buildStaticPrefix()}\n\n${this.buildDynamicPrompt(item)}`
  }

  /**
   * Recomputa prefixo estático + hashes e re-sonda elegibilidade de cache.
   * Chamado no boot e sempre que o mapa de tickers muda.
   */
  private async rebuildStaticPrefix(): Promise<void> {
    this.staticPrefix = this.buildStaticPrefix()
    this.prefixHash = createHash('sha256').update(this.staticPrefix).digest('hex')
    this.aliasMapVersion = createHash('sha256').update(this.tickerMapLine).digest('hex')
    this.cacheProbed = false
    await this.ensureCacheEligibility()
  }

  /**
   * Gate de 1024 tokens: mede o prefixo via countTokens e só habilita cache
   * se >= margem. Fail-closed: qualquer falha (SDK sem countTokens, erro de
   * rede) deixa cacheEligible=false sem quebrar a classificação.
   */
  private async ensureCacheEligibility(): Promise<void> {
    if (this.cacheProbed) return
    this.cacheProbed = true

    if (this.cacheMode === 'off' || this.promptFormat === 'legacy') {
      this.cacheEligible = false
      return
    }

    try {
      // Mede só o bloco estático cacheável (mesmo papel/posição da chamada real:
      // primeiro content block de uma mensagem user), para o gate refletir o
      // tamanho real do prefixo, não o prompt inteiro.
      const probe = await (this.anthropic.messages as { countTokens?: (args: unknown) => Promise<{ input_tokens?: number }> })
        .countTokens?.({
          model: MODEL,
          messages: [{ role: 'user', content: [{ type: 'text', text: this.staticPrefix }] }],
        })

      const tokens = probe?.input_tokens
      if (typeof tokens !== 'number') {
        this.cacheEligible = false
        logger.info('[NewsClassifier] prompt_cache_disabled: countTokens indisponível (probe sem input_tokens)')
        return
      }

      this.cacheEligible = tokens >= CACHE_PROBE_MARGIN_TOKENS
      logger.info(
        `[NewsClassifier] prompt_cache ${this.cacheEligible ? 'ELEGÍVEL' : 'DESABILITADO'}: ` +
        `prefixo=${tokens} tok (mínimo ${CACHE_MIN_PREFIX_TOKENS}, margem ${CACHE_PROBE_MARGIN_TOKENS}), ttl=${this.cacheMode}`
      )
    } catch (err) {
      this.cacheEligible = false
      logger.info(`[NewsClassifier] prompt_cache_disabled: probe countTokens falhou (${(err as Error).message})`)
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
  // Montagem dos parâmetros da chamada (split com cache vs legacy)
  // ---------------------------------------------------------------------------

  private buildCreateParams(item: RawNewsItem): Anthropic.MessageCreateParamsNonStreaming {
    if (this.promptFormat === 'legacy') {
      return {
        model: MODEL,
        max_tokens: 150,
        messages: [{ role: 'user', content: this.buildLegacyPrompt(item) }],
      }
    }

    // Mantém TUDO no papel `user` (igual ao legacy one-shot), só dividido em dois
    // content blocks: [estático cacheável] + [notícia dinâmica]. Isso preserva a
    // semântica do prompt original (nada migra para `system`), protegendo a
    // qualidade de identificação do ticker, e ainda assim habilita o cache no
    // prefixo estático. O prefixo cacheável é o primeiro bloco.
    const staticBlock: Anthropic.TextBlockParam = { type: 'text', text: this.staticPrefix }
    if (this.cacheEligible) {
      // ttl '1h' exige header beta (setado no constructor) e cast (não tipado no
      // SDK ^0.39, aceito em runtime). Para 5m, omitimos ttl: o ephemeral default
      // já é 5m — menos superfície e sem depender de header.
      staticBlock.cache_control =
        this.cacheMode === '1h'
          ? ({ type: 'ephemeral', ttl: '1h' } as Anthropic.CacheControlEphemeral)
          : { type: 'ephemeral' }
    }

    return {
      model: MODEL,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: [staticBlock, { type: 'text', text: this.buildDynamicPrompt(item) }],
        },
      ],
    }
  }

  // ---------------------------------------------------------------------------
  // Classificar uma notícia
  // ---------------------------------------------------------------------------

  async classify(item: RawNewsItem, attempt = 1): Promise<ClassifiedNews> {
    await this.checkRateLimit()

    // Lazy: garante prefixo + elegibilidade mesmo se classify for chamado
    // sem startClassifying (ex: testes, uso direto).
    if (!this.staticPrefix) await this.rebuildStaticPrefix()
    else await this.ensureCacheEligibility()

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
      logger.warn(`[NewsClassifier] Timeout após ${this.timeoutMs}ms — abortando chamada Sonnet (tentativa ${attempt})`)
    }, this.timeoutMs)

    const startMs = Date.now()
    try {
      const response = await this.anthropic.messages.create(
        this.buildCreateParams(item),
        { signal: controller.signal as AbortSignal }
      )

      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

      let parseValid = true
      let result: ClassifiedNews
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

        result = {
          ticker,
          sentiment,
          impactCategory: typeof parsed.impactCategory === 'string' ? parsed.impactCategory : 'INSTITUCIONAL',
          relevance,
        }
      } catch {
        parseValid = false
        logger.warn(`[NewsClassifier] Resposta Sonnet não é JSON válido — aplicando fallback`)
        result = { ...CLASSIFICATION_FALLBACK }
      }

      result = this.withTickerFallback(result, item.title)

      this.logCall(response, { attempt, latencyMs: Date.now() - startMs, ticker: result.ticker, parseValid })
      return result
    } catch (err) {
      const error = err as Error
      const aborted = controller.signal.aborted
      const status = extractHttpStatus(err)
      const retryable = isRetryableError({ aborted, status, err })
      // Instrumenta a tentativa que falhou — é aqui que mora o custo oculto
      // (chamada já consumiu tokens server-side antes do abort/erro).
      this.logFailure({ attempt, latencyMs: Date.now() - startMs, errorName: error.name, timeout: aborted, status, retryable })

      // Erros não-retentáveis (4xx exceto 429: crédito esgotado, auth inválida,
      // request malformado; bugs locais sem status) NUNCA têm sucesso ao repetir.
      // Falha rápido para o fallback.
      if (!retryable) {
        logger.error(`[SYS_002] Sonnet API erro não-retentável (status=${status ?? 'n/a'}): ${error.message}`)
        return this.withTickerFallback({ ...CLASSIFICATION_FALLBACK }, item.title)
      }

      // Timeout/abort tem teto próprio (1 retry) para não multiplicar custo numa
      // API persistentemente lenta. Demais erros retentáveis vão até RETRY_MAX_ATTEMPTS.
      const timeoutCapHit = aborted && attempt >= TIMEOUT_MAX_ATTEMPTS
      if (attempt < RETRY_MAX_ATTEMPTS && !timeoutCapHit) {
        await sleep(retryDelayMs({ attempt, status, err }))
        return this.classify(item, attempt + 1)
      }

      logger.error(`[SYS_002] Sonnet API indisponível após ${attempt} tentativa(s): ${error.message}`)
      return this.withTickerFallback({ ...CLASSIFICATION_FALLBACK }, item.title)
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Fallback determinístico (gatilho "sem time"): quando o classificador não
   * identifica o clube (ticker vazio — seja por julgamento do LLM, parse inválido
   * OU falha de API como crédito esgotado/timeout), tenta resolver pelo TÍTULO de
   * forma precision-first. NÃO altera relevance/sentiment → notícias institucionais
   * ganham o badge do time sem disparar impacto de preço (que exige relevance>0.3
   * no publish). Aplicado em TODOS os caminhos de retorno de classify().
   */
  private withTickerFallback(result: ClassifiedNews, title: string): ClassifiedNews {
    if (result.ticker) return result
    const hit = resolveFromIndex(title, this.tickerIndex)
    if (!hit) return result
    logger.info(`[NewsClassifier] Fallback determinístico: "${title.slice(0, 60)}" → ${hit.ticker} (alias="${hit.alias}")`)
    return { ...result, ticker: hit.ticker }
  }

  // ---------------------------------------------------------------------------
  // Instrumentação de custo/qualidade (1 linha estruturada por chamada)
  // ---------------------------------------------------------------------------

  private logCall(
    response: Anthropic.Message,
    meta: { attempt: number; latencyMs: number; ticker: string; parseValid: boolean },
  ): void {
    const usage = response.usage as
      | (Anthropic.Usage & { cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null })
      | undefined
    const inputTokens = usage?.input_tokens ?? 0
    const cacheCreate = usage?.cache_creation_input_tokens ?? 0
    const cacheRead = usage?.cache_read_input_tokens ?? 0

    logger.info(
      `[NewsClassifier.metrics] ${JSON.stringify({
        event: 'news_classifier_anthropic_call',
        model: MODEL,
        cache_mode: this.cacheMode,
        cache_eligible: this.cacheEligible,
        prefix_hash: this.prefixHash.slice(0, 12),
        alias_map_version: this.aliasMapVersion.slice(0, 12),
        input_tokens: inputTokens,
        output_tokens: usage?.output_tokens ?? 0,
        cache_creation_input_tokens: cacheCreate,
        cache_read_input_tokens: cacheRead,
        total_input_tokens: inputTokens + cacheCreate + cacheRead,
        cache_hit: cacheRead > 0,
        attempts: meta.attempt,
        latency_ms: meta.latencyMs,
        returned_ticker: meta.ticker,
        parse_valid: meta.parseValid,
      })}`
    )
  }

  private logFailure(meta: {
    attempt: number
    latencyMs: number
    errorName: string
    timeout: boolean
    status?: number
    retryable: boolean
  }): void {
    logger.info(
      `[NewsClassifier.metrics] ${JSON.stringify({
        event: 'news_classifier_anthropic_call_failed',
        model: MODEL,
        cache_mode: this.cacheMode,
        attempt: meta.attempt,
        latency_ms: meta.latencyMs,
        error_name: meta.errorName,
        timeout: meta.timeout,
        http_status: meta.status ?? null,
        retryable: meta.retryable,
      })}`
    )
  }

  // ---------------------------------------------------------------------------
  // Worker loop — processa a fila continuamente
  // ---------------------------------------------------------------------------

  async startClassifying(publisher: NewsPublisher): Promise<void> {
    this.running = true
    await this.loadTickerAliases()
    logger.info(
      `[NewsClassifier] Worker iniciado (model=${MODEL}, cache=${this.cacheMode}, format=${this.promptFormat}, timeout=${this.timeoutMs}ms)`
    )

    while (this.running) {
      if (newsQueue.isEmpty()) {
        await sleep(500)
        continue
      }

      // Reload barato do mapa (resolve mapa-velho-no-boot quando o DB muda).
      await this.maybeReloadAliases()

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

// Política de retry (centralizada aqui; SDK roda com maxRetries:0).
const RETRY_MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1000
const RETRY_MAX_DELAY_MS = 8000
// Timeout/abort é transitório mas CARO (a chamada já consumiu tokens server-side
// antes do abort). Limitamos a 1 retry para não reabrir o multiplicador de custo
// que motivou esta mudança — API persistentemente lenta não vira 3x de gasto.
const TIMEOUT_MAX_ATTEMPTS = 2

// Extrai o HTTP status de um erro do SDK Anthropic (APIError expõe `.status`).
// Retorna undefined para erros sem status (conexão/rede, abort, erro genérico).
function extractHttpStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null | undefined)?.status
  return typeof status === 'number' ? status : undefined
}

// Erro "de conexão/transporte" do SDK (sem HTTP status) vs bug inesperado.
// Só os primeiros merecem retry quando não há status; um TypeError/bug local
// não melhora ao repetir e seria mascarado como falha de rede.
function isConnectionLikeError(err: unknown, aborted: boolean): boolean {
  if (aborted) return true
  const name = (err as { name?: unknown } | null | undefined)?.name
  return (
    name === 'APIConnectionError' ||
    name === 'APIConnectionTimeoutError' ||
    name === 'APIUserAbortError'
  )
}

// Lê retry-after do erro 429 (header `retry-after-ms` em ms, ou `retry-after`
// em segundos). Suporta tanto Headers (fetch) quanto objeto plano. undefined se
// ausente/inválido — o caller cai no backoff exponencial.
function extractRetryAfterMs(err: unknown): number | undefined {
  const headers = (err as { headers?: unknown } | null | undefined)?.headers
  if (!headers) return undefined
  const get = (key: string): string | undefined => {
    const h = headers as { get?: (k: string) => string | null } & Record<string, unknown>
    if (typeof h.get === 'function') return h.get(key) ?? undefined
    const v = h[key]
    return typeof v === 'string' ? v : undefined
  }
  const ms = get('retry-after-ms')
  if (ms !== undefined) {
    const n = Number(ms)
    if (Number.isFinite(n) && n >= 0) return n
  }
  const secs = get('retry-after')
  if (secs !== undefined) {
    const n = Number(secs)
    if (Number.isFinite(n) && n >= 0) return n * 1000
  }
  return undefined
}

// Backoff exponencial com jitter: 1s, 2s, ... limitado ao teto.
function backoffDelayMs(attempt: number): number {
  const exp = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
  const jitter = Math.random() * RETRY_BASE_DELAY_MS
  return Math.min(exp + jitter, RETRY_MAX_DELAY_MS)
}

// Decide se a NATUREZA do erro é retentável (independente da contagem de tentativas).
// Retentável: timeout/abort, 429, 408/409, qualquer 5xx, e erro de conexão sem
// status. NÃO retentável: demais 4xx (400 crédito/request inválido, 401 auth,
// 403 permissão, 404, 413, 422) e bugs locais sem status — repetir nunca resolve.
function isRetryableError(meta: { aborted: boolean; status?: number; err: unknown }): boolean {
  if (meta.aborted) return true
  if (meta.status === undefined) return isConnectionLikeError(meta.err, false)
  if (meta.status === 429 || meta.status === 408 || meta.status === 409) return true
  if (meta.status >= 500) return true
  return false
}

// Atraso antes do próximo retry. Em 429, respeita retry-after do servidor; nos
// demais casos, backoff exponencial com jitter.
function retryDelayMs(meta: { attempt: number; status?: number; err: unknown }): number {
  if (meta.status === 429) {
    const ra = extractRetryAfterMs(meta.err)
    if (ra !== undefined) return Math.min(ra, RETRY_MAX_DELAY_MS)
  }
  return backoffDelayMs(meta.attempt)
}
