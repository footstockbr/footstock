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
import {
  ImpactCategory,
  CLASSIFIER_OUTPUT_VERSION,
  MULTI_TEAM_CAP,
  isTeamSignalConfident,
  isLlmUnavailableReason,
  resolveConfidenceThreshold,
  type ClassifiedNews,
  type ClassifiedTeam,
  type ClassifierFallbackReason,
} from './types'
import { logger } from '../utils/logger'
import { newsQueue, type RawNewsItem } from './NewsQueue'
import { NewsDispatchError, NewsPersistenceError, type NewsPublisher } from './NewsPublisher'
import { unmarkAsProcessed } from './news-dedup'
import {
  buildAliasIndex,
  resolveFromIndex,
  type AliasIndex,
} from './ticker-fallback'
import { aiClientOptions, resolveModel } from './ai-provider'
import {
  getNewsLlmRuntimeService,
  type NewsLlmRuntimeConfigService,
  type ResolvedLlmRuntime,
} from './NewsLlmRuntimeConfigService'
import { classifyHttpErrorToHealth } from './llm-health'
import { extractJsonPayload, type JsonExtractionStrategy } from './extract-json-payload'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// O contrato de saída (ClassifiedNews, ClassifiedTeam, limiar por versão) vive
// em ./types. Re-exportado aqui porque os consumidores existentes (NewsPublisher,
// suites) importam `ClassifiedNews` deste módulo.
export type {
  ClassifiedNews,
  ClassifiedTeam,
  TeamSignalOrigin,
  ClassifierFallbackReason,
} from './types'

/**
 * Fallback de classificação. É uma FÁBRICA (não uma constante) porque
 * `teams` é um array: espalhar uma constante compartilharia a mesma referência
 * entre notícias.
 */
function makeClassificationFallback(): ClassifiedNews {
  return {
    ticker: '',
    sentiment: 0,
    impactCategory: 'INSTITUCIONAL',
    relevance: 0,
    teams: [],
  }
}

/**
 * Por que o classificador caiu no fallback determinístico (mono-time).
 *
 * A definição migrou para `./types` em 2026-08-03 porque o gate editorial
 * (NewsPublisher) precisa distinguir "o LLM respondeu e disse que não há time"
 * de "o LLM não respondeu". Alias local mantido para não tocar nos ~20 usos
 * internos deste módulo.
 */
type FallbackReason = ClassifierFallbackReason

/** Shape bruto (não confiável) devolvido pelo LLM. */
interface ParsedTeam {
  ticker?: unknown
  sentiment?: unknown
  confidence?: unknown
}

interface ParsedClassification {
  teams?: unknown
  ticker?: unknown
  sentiment?: unknown
  confidence?: unknown
  impactCategory?: unknown
  relevance?: unknown
}

/**
 * O modelo declarou, de propósito, que NENHUM clube da lista é afetado?
 *
 * Só `teams: []` explícito conta — e apenas quando o payload também não traz o
 * shape legado (`ticker` na raiz), que `collectTeamCandidates` ainda aceita.
 * Qualquer outra forma de terminar sem time (array não vazio que normaliza para
 * zero, ticker fora dos 40, campo ausente) é payload inutilizável, não veredito:
 * vira `parse_invalid` e segue para o fallback determinístico, em vez de virar
 * `llm_no_team` e bloquear a publicação por decisão editorial que ninguém tomou.
 */
function isExplicitNoTeamVerdict(parsed: ParsedClassification): boolean {
  return (
    Array.isArray(parsed.teams) &&
    parsed.teams.length === 0 &&
    typeof parsed.ticker !== 'string'
  )
}

/** Candidato a time, já normalizado, antes da política de confidence e do corte. */
interface TeamCandidate {
  ticker: string
  sentiment: number
  confidence: number
  /** Ordem de aparição na resposta do LLM (usada como desempate determinístico). */
  order: number
}

// ---------------------------------------------------------------------------
// Config de model e caching
// ---------------------------------------------------------------------------

// Modelo base Anthropic; o runtime service mapeia para o modelo do provider ativo.
const ANTHROPIC_BASE_MODEL = 'claude-sonnet-4-6'

function resolveMaxTokens(): number {
  const raw = Number.parseInt(process.env.NEWS_CLASSIFIER_MAX_TOKENS ?? '', 10)
  if (Number.isFinite(raw) && raw > 0) return raw
  // O default do Anthropic subiu de 150 para 512 no contrato multi-time. Com
  // 150, um grupo de 3 já truncava no meio do JSON, o parse falhava e a notícia
  // caía no fallback mono-time sem sinal de causa óbvio. O teto ficou em 512
  // (mesmo valor que o caminho Kimi já usava) porque o prompt deixou de impor
  // limite de quantidade em `teams`: o corte para MULTI_TEAM_CAP é feito pelo
  // parser, então a resposta pode legitimamente trazer mais de 3 clubes e ela
  // precisa caber inteira — truncar aqui reintroduziria o corte cego no LLM.
  return 512
}

const MAX_TOKENS = resolveMaxTokens()

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

export const RATE_LIMIT_KEY = 'news:sonnet:tokens'
export const RATE_LIMIT_MAX = 60
export const RATE_LIMIT_TTL = 60 // segundos

// Lua script: atomic check-init-decrement with TTL guarantee.
// Fixes race condition where key expires between EXISTS and DECR, causing
// DECR to recreate key at -1 without TTL, leading to permanent lockout.
// Also fixes initialization race (M4) via SET NX (only first instance wins).
export const RATE_LIMIT_CHECK_DECR_SCRIPT = `
local key = KEYS[1]
local max = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

if redis.call('SET', key, max, 'EX', ttl, 'NX') then
  return redis.call('DECR', key)
end

if redis.call('TTL', key) == -1 then
  redis.call('EXPIRE', key, ttl)
end

local tokens = redis.call('DECR', key)

if redis.call('TTL', key) == -1 then
  redis.call('EXPIRE', key, ttl)
end

return tokens
`

// Lua script: atomic increment-revert with TTL guarantee.
// Used when tokens < 0 to revert the decrement and ensure TTL is restored.
export const RATE_LIMIT_REVERT_INCR_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])

redis.call('INCR', key)

if redis.call('TTL', key) == -1 then
  redis.call('EXPIRE', key, ttl)
end

return 1
`

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
  /** Circuit-breaker de credito esgotado: epoch (ms) ate quando pular a API. 0 = fechado. */
  private creditCircuitOpenUntil = 0
  /** Linha compacta "URU3=flamengo,fla,urubu | POR3=palmeiras,porco | ..." carregada do DB */
  private tickerMapLine = ''
  /** Índice determinístico (full search_text) para fallback quando o LLM devolve ticker vazio. */
  private tickerIndex: AliasIndex = []

  private readonly cacheMode: CacheMode
  private readonly promptFormat: PromptFormat
  private readonly timeoutMs: number
  private readonly runtime: NewsLlmRuntimeConfigService
  private boundConfigVersion = -1
  private boundModel = resolveModel(ANTHROPIC_BASE_MODEL)

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
    runtime?: NewsLlmRuntimeConfigService,
  ) {
    this.cacheMode = resolveCacheMode()
    this.promptFormat = resolvePromptFormat()
    this.timeoutMs = resolveTimeoutMs()
    this.runtime = runtime ?? getNewsLlmRuntimeService()

    // Cliente inicial via env (compat testes); hot-swap em ensureClient().
    this.anthropic = this.buildClientFromEnv()
  }

  private buildClientFromEnv(): Anthropic {
    const defaultHeaders =
      this.cacheMode === '1h'
        ? { 'anthropic-beta': 'extended-cache-ttl-2025-04-11' }
        : undefined
    return new Anthropic({
      ...aiClientOptions(),
      maxRetries: 0,
      ...(defaultHeaders ? { defaultHeaders } : {}),
    })
  }

  private buildClientFromRuntime(rt: ResolvedLlmRuntime): Anthropic {
    const defaultHeaders =
      this.cacheMode === '1h'
        ? { 'anthropic-beta': 'extended-cache-ttl-2025-04-11' }
        : undefined
    return new Anthropic({
      apiKey: rt.apiKey,
      ...(rt.baseURL ? { baseURL: rt.baseURL } : {}),
      maxRetries: 0,
      ...(defaultHeaders ? { defaultHeaders } : {}),
    })
  }

  /** Aplica hot switch se configVersion mudou. Retorna runtime atual. */
  private async ensureClient(): Promise<ResolvedLlmRuntime> {
    const rt = await this.runtime.getRuntimeConfig()
    if (rt.llmEnabled && rt.reason === 'ok' && rt.configVersion !== this.boundConfigVersion) {
      this.anthropic = this.buildClientFromRuntime(rt)
      this.boundConfigVersion = rt.configVersion
      this.boundModel = rt.model
      // O probe de cache roda contra ESTE cliente. Trocou de credencial/modelo,
      // re-sondar: um probe feito com o cliente de boot (env, hoje sem chave)
      // desabilitaria o prompt caching para sempre.
      this.cacheProbed = false
      logger.info(
        `[NewsClassifier] Runtime LLM aplicado: provider=${rt.providerName} slug=${rt.adapterSlug} v=${rt.configVersion} model=${rt.model}`,
      )
    }
    return rt
  }

  private currentModel(): string {
    return this.boundModel || resolveModel(ANTHROPIC_BASE_MODEL)
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

ESCOPO EDITORIAL (aplique ANTES de qualquer outra regra):
Este produto cobre EXCLUSIVAMENTE os clubes da lista de tickers acima. Uma
notícia só entra no escopo se algum clube DA LISTA for afetado de forma direta.
Devolva "teams": [] — sem exceção e sem tentar aproximar — quando a notícia for:
- de outro esporte (NBA, NFL, tênis, vôlei, automobilismo, e-sports);
- sobre clube estrangeiro, salvo se o texto declarar efeito concreto sobre um
  clube da lista (transferência, dívida, disputa contratual, indenização);
- sobre jogador, técnico ou dirigente que não pertence a nenhum clube da lista
  no momento da notícia — inclusive brasileiro atuando fora do país;
- sobre seleção, CBF, FIFA, UEFA, Conmebol ou entidade, sem consequência
  declarada para um clube específico da lista;
- social, policial, publicitária, leilão, agenda ou celebridade, sem efeito
  esportivo ou financeiro sobre um clube da lista.
Menção de passagem a um clube da lista NÃO coloca a notícia em escopo. O teste é
sempre: "existe consequência para ESTE clube afirmada no texto?" Se não existe,
"teams": []. Devolver [] é a resposta CORRETA para notícia fora de escopo, não
uma falha sua — não force um ticker para evitar a lista vazia.

Uma notícia pode afetar MAIS DE UM clube. Liste em "teams" TODOS os clubes
afetados, sem limite de quantidade, na ORDEM EM QUE APARECEM no texto — o clube
que é o sujeito do título vem primeiro. NÃO pré-selecione, não corte e não
descarte clube afetado por achar que são muitos: quem escolhe quais entram no
grupo final é o sistema, e um clube omitido aqui não pode ser recuperado nem
registrado depois.

Campos de cada item de "teams":
- ticker: código do clube afetado (sempre 4 chars), obrigatoriamente um da lista acima
- sentiment: -1.0 (muito negativo) a 1.0 (muito positivo) PARA AQUELE CLUBE
- confidence: 0.0 a 1.0 — quanto você confia em que o clube é afetado E em que o sinal está correto

Regras de decisão (obrigatórias):
- Vitória e derrota no mesmo confronto: sinais opostos e de mesma magnitude para os dois clubes
- Venda de jogador para rival: comprador positivo se houver reforço material; vendedor negativo se houver perda material; se o efeito não for claro, vendedor com sentiment 0
- Empate que elimina os dois: ambos negativos
- Lesão de jogador emprestado: impacta o clube onde ele joga; o clube dono só entra em "teams" se a matéria citar obrigação financeira ou contratual explícita
- Decisão judicial ou administrativa: sentimento pela consequência direta, nunca por menção incidental
- Menção incidental (tabela de classificação, histórico, comparação): NÃO gera item em "teams"
- Ambiguidade: sentiment 0 com confidence baixa
- Se a notícia não afeta nenhum clube específico: "teams": []

Campos da notícia inteira (não por clube):
- impactCategory: uma das categorias listadas acima
- relevance: 0.0 a 1.0 — quão relevante é para o mercado financeiro

Responda SOMENTE com JSON no formato:
{"teams":[{"ticker":"URU3","sentiment":0.8,"confidence":0.95},{"ticker":"POR3","sentiment":-0.8,"confidence":0.9}],"impactCategory":"ESPORTIVA_MAJORITARIA","relevance":0.9}

FORMATO DA RESPOSTA (obrigatório): sua resposta inteira é o objeto JSON. Ela
começa com { e termina com }. NÃO use bloco de código markdown (\`\`\`), não
escreva nada antes nem depois do JSON e não explique o raciocínio.`
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

    // Antes do primeiro hot-swap o cliente ainda e o de boot (env). Como as chaves
    // de LLM sairam do env (o token vive no painel admin), sondar agora daria 401 e
    // travaria cacheEligible=false. Adia sem marcar cacheProbed: classify() chama
    // ensureClient() antes e a proxima passada sonda com a credencial correta.
    if (this.boundConfigVersion < 0) return

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
          model: this.currentModel(),
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
    // Atomic check-init-decrement via Lua script.
    // Fixes: (1) race where key expires between EXISTS and DECR causing permanent
    // lockout at -1/0 without TTL; (2) initialization race (M4) via SET NX.
    const tokens = await this.redis.eval(
      RATE_LIMIT_CHECK_DECR_SCRIPT,
      1,
      RATE_LIMIT_KEY,
      RATE_LIMIT_MAX,
      RATE_LIMIT_TTL,
    ) as number

    if (tokens < 0) {
      // Atomic revert with TTL guarantee
      await this.redis.eval(
        RATE_LIMIT_REVERT_INCR_SCRIPT,
        1,
        RATE_LIMIT_KEY,
        RATE_LIMIT_TTL,
      )
      throw new RateLimitError('RATE_001', 'Rate limit Sonnet excedido (60 req/min)')
    }
  }

  // ---------------------------------------------------------------------------
  // Montagem dos parâmetros da chamada (split com cache vs legacy)
  // ---------------------------------------------------------------------------

  private buildCreateParams(item: RawNewsItem): Anthropic.MessageCreateParamsNonStreaming {
    if (this.promptFormat === 'legacy') {
      return {
        model: this.currentModel(),
        max_tokens: MAX_TOKENS,
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
      model: this.currentModel(),
      max_tokens: MAX_TOKENS,
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
    // Runtime config (hot switch). Node-only: zero HTTP, zero rate-limit.
    const runtime = await this.ensureClient()
    if (!runtime.llmEnabled || runtime.reason !== 'ok') {
      await this.runtime.publishHealth(
        { state: 'disabled', reasonCode: 'llm_disabled_by_admin' },
        runtime,
      )
      const reason: FallbackReason =
        runtime.reason === 'ok' ? 'llm_disabled_by_admin' : runtime.reason
      return this.withTickerFallback(makeClassificationFallback(), item.title, reason)
    }

    await this.checkRateLimit()

    // Circuit-breaker de credito esgotado: se a Anthropic ja sinalizou billing
    // esgotado ha pouco, pular a chamada (todos os itens falhariam igual) e ir
    // direto ao fallback. Evita o flood de N erros [SYS_002] por lote/rodada.
    if (Date.now() < this.creditCircuitOpenUntil) {
      await this.runtime.publishHealth(
        { state: 'insufficient_credits', reasonCode: 'credit_exhausted' },
        runtime,
      )
      return this.withTickerFallback(makeClassificationFallback(), item.title, 'credit_circuit_open')
    }

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

      // Concatena TODOS os blocos text, não só o primeiro: modelo com thinking
      // (ou que resolve narrar antes de responder) manda o preâmbulo num bloco
      // e o JSON no seguinte. Pegar só `[0]` descartava a resposta inteira.
      const textBlocks = response.content.filter((block) => block.type === 'text')
      const text = textBlocks
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('\n')
      if (textBlocks.length === 0) {
        const blockTypes = response.content.map((block) => block.type).join(',') || 'none'
        logger.warn(
          `[NewsClassifier] Resposta sem bloco text; aplicando fallback ` +
          `(stop_reason=${response.stop_reason ?? 'n/a'}, blocks=${blockTypes})`
        )
      }

      let parseValid = true
      // Motivo a carimbar SE o classificador terminar sem time nenhum. O default
      // é `parse_invalid` (indisponibilidade) e só vira `llm_no_team` (veredito
      // editorial que BLOQUEIA a publicação) quando o modelo declarou lista vazia
      // de propósito. Sem essa distinção, um payload de time inutilizável —
      // `teams: [{ticker: "PAL"}]`, ticker fora dos 40 — normalizaria para zero
      // candidatos e seria lido como "o LLM disse que não há clube", bloqueando
      // notícia legítima de clube brasileiro em vez de cair no fallback por título.
      let noTeamReason: ClassifierFallbackReason = 'parse_invalid'
      let result: ClassifiedNews
      // `raw` é o caminho feliz. Qualquer outra estratégia significa que o
      // modelo desobedeceu "Responda SOMENTE com JSON" e foi resgatado — o
      // valor vai para a telemetria para a taxa ficar visível em produção.
      let payloadStrategy: JsonExtractionStrategy | 'none' = 'none'
      try {
        const extraction = extractJsonPayload(text)
        if (!extraction) {
          throw new SyntaxError('resposta sem objeto JSON extraível')
        }
        payloadStrategy = extraction.strategy
        const parsed = JSON.parse(extraction.json) as ParsedClassification

        const relevance = typeof parsed.relevance === 'number' && isFinite(parsed.relevance)
          ? Math.max(0, Math.min(1, parsed.relevance))
          : 0

        // Pipeline multi-time. `teams[0]` (rank 0) é a âncora; `ticker` e
        // `sentiment` de topo são a projeção dela para o consumidor legado.
        const teams = this.parseTeams(parsed, item.title, item.description)
        const anchor = teams[0]
        noTeamReason = isExplicitNoTeamVerdict(parsed) ? 'llm_no_team' : 'parse_invalid'

        result = {
          ticker: anchor?.ticker ?? '',
          sentiment: anchor?.sentiment ?? 0,
          impactCategory: typeof parsed.impactCategory === 'string' ? parsed.impactCategory : 'INSTITUCIONAL',
          relevance,
          teams,
        }
      } catch {
        parseValid = false
        payloadStrategy = 'none'
        logger.warn(
          `[NewsClassifier] Resposta do LLM não contém JSON válido — aplicando fallback ` +
          `(prefixo: ${JSON.stringify(text.slice(0, 120))})`
        )
        result = makeClassificationFallback()
      }

      if (parseValid && payloadStrategy !== 'raw') {
        logger.warn(
          `[NewsClassifier] JSON resgatado de resposta fora de contrato ` +
          `(strategy=${payloadStrategy}, model=${this.currentModel()})`
        )
      }

      result = this.withTickerFallback(result, item.title, parseValid ? noTeamReason : 'parse_invalid')

      this.logCall(response, {
        attempt,
        latencyMs: Date.now() - startMs,
        ticker: result.ticker,
        parseValid,
        payloadStrategy,
      })
      // Sucesso fecha o circuito (credito de volta / API saudavel).
      this.creditCircuitOpenUntil = 0
      if (!parseValid || !text) {
        const h = classifyHttpErrorToHealth({ parseValid, emptyText: !text })
        await this.runtime.publishHealth(h, runtime)
      } else {
        await this.runtime.publishHealth({ state: 'healthy', reasonCode: 'ok' }, runtime)
      }
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
        if (isCreditExhaustedError(err) && Date.now() >= this.creditCircuitOpenUntil) {
          this.creditCircuitOpenUntil = Date.now() + CREDIT_EXHAUSTED_COOLDOWN_MS
          logger.error(
            `[SYS_002][CIRCUIT_OPEN] Credito Anthropic esgotado — circuito aberto por ` +
            `${CREDIT_EXHAUSTED_COOLDOWN_MS / 60000}min; classificacao em fallback ate recarga: ${error.message}`,
          )
        } else if (!isCreditExhaustedError(err)) {
          logger.error(`[SYS_002] Sonnet API erro não-retentável (status=${status ?? 'n/a'}): ${error.message}`)
        }
        const h = classifyHttpErrorToHealth({ status, message: error.message, aborted })
        await this.runtime.publishHealth(h, runtime)
        return this.withTickerFallback(makeClassificationFallback(), item.title, 'api_error_non_retryable')
      }

      // Timeout/abort tem teto próprio (1 retry) para não multiplicar custo numa
      // API persistentemente lenta. Demais erros retentáveis vão até RETRY_MAX_ATTEMPTS.
      const timeoutCapHit = aborted && attempt >= TIMEOUT_MAX_ATTEMPTS
      if (attempt < RETRY_MAX_ATTEMPTS && !timeoutCapHit) {
        await sleep(retryDelayMs({ attempt, status, err }))
        return this.classify(item, attempt + 1)
      }

      logger.error(`[SYS_002] Sonnet API indisponível após ${attempt} tentativa(s): ${error.message}`)
      const h = classifyHttpErrorToHealth({ status, message: error.message, aborted })
      await this.runtime.publishHealth(h, runtime)
      return this.withTickerFallback(makeClassificationFallback(), item.title, 'api_unavailable')
    } finally {
      clearTimeout(timeout)
    }
  }

  // ---------------------------------------------------------------------------
  // Parser multi-time
  //
  // Ordem OBRIGATÓRIA do pipeline de seleção (decisão do operador, 2026-07-28):
  //   1) dedup por ticker
  //   2) política de confidence
  //   3) corte para MULTI_TEAM_CAP
  //   4) atribuição de rank
  // Inverter (2) e (3) deixaria vaga vazia com candidato elegível de fora.
  // ---------------------------------------------------------------------------

  private parseTeams(
    parsed: ParsedClassification,
    title: string,
    description?: string | null,
  ): ClassifiedTeam[] {
    const candidates = this.collectTeamCandidates(parsed)
    if (candidates.length === 0) return []

    // (1) dedup por ticker — mantém a primeira ocorrência (ordem de aparição).
    const seen = new Set<string>()
    const deduped: TeamCandidate[] = []
    const duplicates: string[] = []
    for (const candidate of candidates) {
      if (seen.has(candidate.ticker)) {
        duplicates.push(candidate.ticker)
        continue
      }
      seen.add(candidate.ticker)
      deduped.push(candidate)
    }
    if (duplicates.length > 0) {
      logger.info(
        `[NewsClassifier.metrics] ${JSON.stringify({
          event: 'news_classifier_teams_deduped',
          title: title.slice(0, 80),
          duplicates,
        })}`
      )
    }

    // A âncora (futuro rank 0) é resolvida ANTES da política de confidence: ela
    // é função pura do título (e do corpo como fallback), nunca do confidence
    // nem do sentimento. O rank 0 precisa ser estável a recalibração do modelo
    // porque carrega `ticker`/`sentiment` de topo lidos por consumidor legado.
    const anchorTicker = this.resolveAnchorTicker(deduped, title, description)

    // (2) política de confidence — aplicada apenas aos times que NÃO são a
    // âncora (o rank 0 segue o gate de publicação existente, não o limiar).
    // Time abaixo do limiar não é descartado: entra NEUTRAL, com origem
    // `low_confidence`, e não despacha impacto.
    const threshold = resolveConfidenceThreshold(CLASSIFIER_OUTPUT_VERSION)
    if (threshold === null) {
      logger.warn(
        `[NewsClassifier] Limiar de confidence não resolvido para a versão ` +
        `"${CLASSIFIER_OUTPUT_VERSION}" — fail-closed: todo time de rank 1+ entra como low_confidence`
      )
    }
    const policed = deduped.map((candidate) => {
      const isAnchor = candidate.ticker === anchorTicker
      const confident = isAnchor || isTeamSignalConfident(candidate.confidence, CLASSIFIER_OUTPUT_VERSION)
      return {
        ...candidate,
        sentiment: confident ? candidate.sentiment : 0,
        origin: (confident ? 'classifier' : 'low_confidence') as ClassifiedTeam['origin'],
      }
    })

    // (3) corte para MULTI_TEAM_CAP — a âncora ocupa uma vaga por direito; as
    // vagas restantes vão para os maiores `confidence`, com desempate por ordem
    // de aparição. Os cortados são sempre registrados em log estruturado.
    const anchor = policed.find((team) => team.ticker === anchorTicker)
    const others = policed.filter((team) => team.ticker !== anchorTicker)
    const ranked = [...others].sort((a, b) =>
      b.confidence !== a.confidence ? b.confidence - a.confidence : a.order - b.order
    )
    const keptOthers = ranked.slice(0, Math.max(0, MULTI_TEAM_CAP - (anchor ? 1 : 0)))
    const dropped = ranked.slice(keptOthers.length)
    if (dropped.length > 0) {
      logger.info(
        `[NewsClassifier.metrics] ${JSON.stringify({
          event: 'news_classifier_teams_capped',
          title: title.slice(0, 80),
          cap: MULTI_TEAM_CAP,
          dropped: dropped.map((team) => ({ ticker: team.ticker, confidence: team.confidence })),
        })}`
      )
    }

    // (4) atribuição de rank — âncora em 0; os demais em ordem de aparição,
    // não por confidence (a ordem do corte não deve vazar para a ordem do grupo).
    const keptInOrder = keptOthers.sort((a, b) => a.order - b.order)
    const selected = anchor ? [anchor, ...keptInOrder] : keptInOrder
    const teams: ClassifiedTeam[] = selected.map((team, rank) => ({
      ticker: team.ticker,
      sentiment: team.sentiment,
      confidence: team.confidence,
      rank,
      origin: team.origin,
    }))

    logger.info(
      `[NewsClassifier.metrics] ${JSON.stringify({
        event: 'news_classifier_teams_resolved',
        title: title.slice(0, 80),
        classifier_version: CLASSIFIER_OUTPUT_VERSION,
        confidence_threshold: threshold,
        multi_team: teams.length > 1,
        teams: teams.map((team) => ({
          ticker: team.ticker,
          rank: team.rank,
          sentiment: team.sentiment,
          confidence: team.confidence,
          origin: team.origin,
        })),
      })}`
    )

    return teams
  }

  /**
   * Normaliza o array bruto do LLM em candidatos válidos. Aceita também o shape
   * legado mono-time (`{ticker, sentiment}` na raiz) para não perder a notícia
   * quando o modelo ignora o formato novo.
   */
  private collectTeamCandidates(parsed: ParsedClassification): TeamCandidate[] {
    const rawTeams: ParsedTeam[] = Array.isArray(parsed.teams)
      ? (parsed.teams as ParsedTeam[])
      : []

    // A normalização vem ANTES da decisão pelo shape legado: um `teams` não
    // vazio em tamanho mas composto só de lixo (null, ticker fora da lista,
    // objeto sem ticker) normaliza para zero candidatos. Testar `rawTeams.length`
    // primeiro faria essa resposta híbrida suprimir um `ticker` raiz válido e
    // terminar sem nenhum time.
    const normalized = this.normalizeCandidates(rawTeams)
    if (normalized.length > 0) return normalized

    if (typeof parsed.ticker === 'string') {
      logger.warn(
        rawTeams.length === 0
          ? '[NewsClassifier] Resposta em shape legado (ticker na raiz, sem teams[]) — tratada como time único'
          : '[NewsClassifier] Resposta híbrida: teams[] sem candidato válido — recorrendo ao ticker da raiz'
      )
      return this.normalizeCandidates([
        { ticker: parsed.ticker, sentiment: parsed.sentiment, confidence: parsed.confidence },
      ])
    }

    return normalized
  }

  private normalizeCandidates(rawTeams: ParsedTeam[]): TeamCandidate[] {
    const candidates: TeamCandidate[] = []
    rawTeams.forEach((raw, order) => {
      if (!raw || typeof raw !== 'object') return
      const rawTicker = typeof raw.ticker === 'string' ? raw.ticker.toUpperCase().slice(0, 4) : ''
      if (!rawTicker) return
      if (!TICKERS_40.includes(rawTicker)) {
        logger.warn(`[NewsClassifier] Ticker inválido retornado pelo LLM: "${rawTicker}" — ignorado`)
        return
      }
      candidates.push({
        ticker: rawTicker,
        sentiment: clampRange(raw.sentiment, -1, 1),
        confidence: clampRange(raw.confidence, 0, 1),
        order,
      })
    })
    return candidates
  }

  /**
   * Ticker do rank 0: o primeiro ticker único citado no TÍTULO; se o título não
   * resolver nenhum dos candidatos, o primeiro citado no CORPO. Não usa
   * `confidence` nem sentimento em nenhum dos dois passos.
   *
   * A resolução delega ao MESMO `resolveFromIndex` do fallback determinístico,
   * sobre um recorte do índice de aliases restrito aos candidatos. Isso mantém
   * a semântica idêntica à do resolver espelhado (match mais à esquerda, com
   * desempate por alias mais longo): uma segunda implementação local
   * desempatava só por ordem dos candidatos e podia eleger rank 0 diferente do
   * fallback quando dois tickers têm aliases sobrepostos.
   *
   * `candidates[0]` (ordem da resposta do LLM) é o ÚLTIMO recurso, usado apenas
   * quando nem título nem corpo resolvem — nunca antes de tentar o corpo.
   */
  private resolveAnchorTicker(
    candidates: TeamCandidate[],
    title: string,
    description?: string | null,
  ): string {
    const allowed = new Set(candidates.map((candidate) => candidate.ticker))
    const scoped: AliasIndex = this.tickerIndex.filter(([, ticker]) => allowed.has(ticker))

    if (scoped.length > 0) {
      const fromTitle = resolveFromIndex(title, scoped)
      if (fromTitle) return fromTitle.ticker

      const fromBody = resolveFromIndex(description ?? '', scoped)
      if (fromBody) return fromBody.ticker
    }

    return candidates[0].ticker
  }

  /**
   * Fallback determinístico (gatilho "sem time"): quando o classificador não
   * identifica o clube (teams vazio — seja por julgamento do LLM, parse inválido
   * OU falha de API como crédito esgotado/timeout), tenta resolver pelo TÍTULO de
   * forma precision-first. NÃO altera relevance/sentiment → notícias institucionais
   * ganham o badge do time sem disparar impacto de preço (que exige relevance>0.3
   * no publish). Aplicado em TODOS os caminhos de retorno de classify().
   *
   * O fallback é SEMPRE mono-time (nunca inventa grupo) e registra explicitamente
   * que caiu no fallback e por quê (`reason`), com `origin: 'classifier_fallback'`
   * no time resolvido — a UI e a telemetria distinguem isso de `low_confidence`.
   */
  private withTickerFallback(result: ClassifiedNews, title: string, reason: FallbackReason): ClassifiedNews {
    // O LLM devolveu time: não houve fallback nenhum, e `fallbackReason` fica
    // ausente — é assim que o gate editorial sabe que existe veredito do LLM.
    if (result.ticker) return result

    // A partir daqui SEMPRE carimbar o motivo, inclusive quando o resolvedor
    // determinístico não achar nada. O gate editorial decide por este campo, e
    // um `undefined` aqui seria lido como "o LLM respondeu" — fail-open exato
    // que este carimbo existe para fechar.
    const degraded = isLlmUnavailableReason(reason)
    const stamped: ClassifiedNews = { ...result, fallbackReason: reason, llmDegraded: degraded }
    const hit = resolveFromIndex(title, this.tickerIndex)
    logger.info(
      `[NewsClassifier.metrics] ${JSON.stringify({
        event: 'news_classifier_deterministic_fallback',
        reason,
        title: title.slice(0, 80),
        resolved: hit !== null,
        ticker: hit?.ticker ?? null,
        alias: hit?.alias ?? null,
        multi_team: false,
        llm_degraded: degraded,
      })}`
    )
    if (!hit) return stamped
    logger.info(`[NewsClassifier] Fallback determinístico (${reason}): "${title.slice(0, 60)}" → ${hit.ticker} (alias="${hit.alias}")`)
    return {
      ...stamped,
      ticker: hit.ticker,
      teams: [
        {
          ticker: hit.ticker,
          sentiment: result.sentiment,
          confidence: 0,
          rank: 0,
          origin: 'classifier_fallback',
        },
      ],
    }
  }

  // ---------------------------------------------------------------------------
  // Instrumentação de custo/qualidade (1 linha estruturada por chamada)
  // ---------------------------------------------------------------------------

  private logCall(
    response: Anthropic.Message,
    meta: {
      attempt: number
      latencyMs: number
      ticker: string
      parseValid: boolean
      payloadStrategy: JsonExtractionStrategy | 'none'
    },
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
        model: this.currentModel(),
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
        // 'raw' = modelo obedeceu; 'fenced'/'embedded' = resgatado do formato
        // errado; 'none' = nem resgate salvou. Métrica de saúde do contrato.
        payload_strategy: meta.payloadStrategy,
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
        model: this.currentModel(),
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
      `[NewsClassifier] Worker iniciado (model=${this.currentModel()}, cache=${this.cacheMode}, format=${this.promptFormat}, timeout=${this.timeoutMs}ms)`
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
        } else if (err instanceof NewsPersistenceError) {
          // Critério 6 (item 014): a notícia NÃO chegou ao banco, então ela não
          // pode continuar marcada como processada. Desmarcamos a URL para que o
          // próximo ciclo do RSSFetcher a traga de volta, em vez de perdê-la em
          // silêncio pelos 48h do TTL de dedup.
          //
          // Sem re-enfileirar na fila em memória de propósito: o erro é de
          // infraestrutura de banco e tende a persistir por mais de um item;
          // re-enfileirar aqui giraria a fila em busy-loop contra um banco que
          // ainda está fora. O ciclo de RSS (10 min) é o backoff natural.
          const unmarked = await unmarkAsProcessed(this.redis, err.item.url, err.item.title)
          logger.error(JSON.stringify({
            event: 'news_worker_persist_failed',
            url: err.item.url,
            title: err.item.title.slice(0, 80),
            source: err.item.source,
            unmarked_for_retry: unmarked,
            error_message: (err.cause as Error | undefined)?.message ?? err.message,
          }))
        } else if (err instanceof NewsDispatchError) {
          // As linhas JÁ estão no banco; só o despacho pós-commit falhou. NÃO
          // desmarcar: o RSS traria a mesma URL de volta em 10 min e gravaria um
          // segundo registro do mesmo fato. O grupo fica sem `impactDispatchedAt`
          // e é retentável pelo caminho de reconciliação, não por re-fetch.
          logger.error(JSON.stringify({
            event: 'news_worker_dispatch_failed',
            url: err.item.url,
            group_id: err.groupId,
            title: err.item.title.slice(0, 80),
            source: err.item.source,
            unmarked_for_retry: false,
            error_message: (err.cause as Error | undefined)?.message ?? err.message,
          }))
        } else {
          // Erro inesperado que NÃO é nem persistência nem despacho: veio da
          // classificação ou da parte pura do publisher, antes de qualquer
          // escrita. Nada foi gravado, então manter a URL marcada perderia a
          // notícia em silêncio pelos 48h do TTL — o mesmo bug que o critério 6
          // consertou para a falha de banco. Desmarcamos para que o próximo
          // ciclo do RSS a traga de volta.
          const unmarked = await unmarkAsProcessed(this.redis, item.url, item.title)
          logger.error(JSON.stringify({
            event: 'news_worker_unexpected_failed',
            url: item.url,
            title: item.title.slice(0, 80),
            source: item.source,
            unmarked_for_retry: unmarked,
            error_name: (err as Error).name,
            error_message: (err as Error).message,
          }))
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

/** Número do LLM saneado para o intervalo [min, max]. Não numérico vira `min` quando
 * o intervalo é não negativo (confidence) e 0 quando cruza o zero (sentiment). */
function clampRange(value: unknown, min: number, max: number): number {
  const fallback = min >= 0 ? min : 0
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

// Política de retry (centralizada aqui; SDK roda com maxRetries:0).
const RETRY_MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 1000
const RETRY_MAX_DELAY_MS = 8000
// Timeout/abort é transitório mas CARO (a chamada já consumiu tokens server-side
// antes do abort). Limitamos a 1 retry para não reabrir o multiplicador de custo
// que motivou esta mudança — API persistentemente lenta não vira 3x de gasto.
const TIMEOUT_MAX_ATTEMPTS = 2

// Cooldown do circuit-breaker de credito esgotado. Quando a API RECUSA a chamada
// por saldo zerado, os proximos itens do lote falham igual — abrimos o circuito por
// este periodo, pulando a chamada e indo direto ao fallback (1 log em vez de N).
// Curto de proposito: uma recusa por saldo custa 0 token, entao reprovar cedo e
// barato e a operacao volta sozinha assim que o credito e recarregado.
const CREDIT_EXHAUSTED_COOLDOWN_MS = 60 * 1000

// Detecta o erro de credito ESGOTADO — a API recusou de fato a chamada por saldo.
// Exige DUAS evidencias para nao parar a operacao por sinal de saldo BAIXO:
//   1. HTTP status de recusa por billing (400 invalid_request_error / 402), quando
//      houver status. Um 429 "billing tier limit" e rate-limit, NAO credito acabado;
//      um 500 que mencione billing e erro do servidor.
//   2. Mensagem que afirma a recusa (saldo insuficiente / quota esgotada), nao um
//      aviso generico com a palavra "billing".
// Enquanto a API aceitar a chamada, o classificador segue operando ate acabar.
const CREDIT_EXHAUSTED_STATUSES = new Set([400, 402])
const CREDIT_EXHAUSTED_MESSAGE =
  /credit balance (is )?too low|insufficient (funds|credits?|balance|quota)|(credits?|quota|balance) (has been |is |are )?(exhausted|depleted)|payment required/i

function isCreditExhaustedError(err: unknown): boolean {
  const status = extractHttpStatus(err)
  if (status !== undefined && !CREDIT_EXHAUSTED_STATUSES.has(status)) return false
  const msg = (err as { message?: unknown } | null | undefined)?.message
  if (typeof msg !== 'string') return false
  return CREDIT_EXHAUSTED_MESSAGE.test(msg)
}

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
