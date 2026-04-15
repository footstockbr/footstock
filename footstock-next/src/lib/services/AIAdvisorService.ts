// ============================================================================
// Foot Stock — AIAdvisorService (module-21/TASK-1/ST002+ST004 + TASK-2/ST003)
// Prompt builder + chamada Claude Sonnet com AbortController (30s timeout)
// Cache Redis segregado por plano (ai:cache:{ticker}:{plan} TTL 30min)
// ============================================================================

import Anthropic from '@anthropic-ai/sdk'
import type { TextBlock } from '@anthropic-ai/sdk/resources/messages/messages'
import { redisPublisher as redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { PLAN_TYPE, type PlanType } from '@/lib/enums'
import { aiResponseParser } from '@/lib/services/AIResponseParser'
import type { AIAnalysis, AnalysisContext } from '@/lib/types/ai'

const CACHE_TTL = 1800 // RESOLVED: cache TTL corrigido para 30min conforme FDD (era 15min)
const TIMEOUT_MS = 30_000

/** Erro lançado pelo AbortController após 30s de espera */
export class TimeoutError extends Error {
  readonly code = 'SYS_003' as const
  constructor() {
    super('A operação demorou mais do que o esperado. Por favor, tente novamente.')
    this.name = 'TimeoutError'
  }
}

// ---------------------------------------------------------------------------
// Singleton Anthropic (inicializa apenas quando ANTHROPIC_API_KEY disponível)
// ---------------------------------------------------------------------------

function getAnthropic(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function getCacheKey(ticker: string, plan: PlanType): string {
  const planKey = plan === PLAN_TYPE.LENDA ? 'LENDA' : 'CRAQUE'
  return `ai:cache:${ticker}:${planKey}`
}

// ---------------------------------------------------------------------------
// AIAdvisorService
// ---------------------------------------------------------------------------

export class AIAdvisorService {
  /**
   * Busca contexto do ativo: preço, variação, posição do usuário e últimas notícias.
   * News são filtradas por assetIds (array de IDs do ativo, não ticker).
   */
  async fetchContext(ticker: string, userId: string): Promise<AnalysisContext> {
    // 1. Buscar o asset para obter currentPrice, openPrice e assetId
    const assetRow = await prisma.asset
      .findFirst({ where: { ticker }, select: { id: true, currentPrice: true, openPrice: true } })
      .catch(() => null)

    const assetId = assetRow?.id ?? null
    const currentPrice = assetRow?.currentPrice ? Number(assetRow.currentPrice) : 0
    const openPrice = assetRow?.openPrice ? Number(assetRow.openPrice) : 0
    const changePercent = openPrice > 0 ? ((currentPrice - openPrice) / openPrice) * 100 : 0

    // 2. Notícias filtradas pelo assetId (assetIds é array de IDs de ativos)
    const recentNewsRaw = assetId
      ? await prisma.news
          .findMany({
            where: { assetIds: { has: assetId } },
            orderBy: { publishedAt: 'desc' },
            take: 5,
            select: { title: true, sentiment: true },
          })
          .catch(() => [])
      : []

    // Mapear Sentiment enum para número escalar para o prompt
    const SENTIMENT_SCORE: Record<string, number> = {
      BULLISH: 0.7,
      NEUTRAL: 0,
      BEARISH: -0.7,
    }

    // 3. Posição do usuário (por assetId)
    const userPositionRaw = assetId
      ? await prisma.position
          .findFirst({
            where: { userId, assetId, status: 'OPEN' },
            select: { quantity: true, avgPrice: true },
          })
          .catch(() => null)
      : null

    return {
      currentPrice,
      changePercent,
      userPosition: userPositionRaw
        ? { qty: Number(userPositionRaw.quantity), avgPrice: Number(userPositionRaw.avgPrice) }
        : null,
      recentNews: recentNewsRaw.map(n => ({
        title: n.title,
        sentiment: SENTIMENT_SCORE[String(n.sentiment)] ?? 0,
      })),
    }
  }

  /**
   * Constrói o prompt para o Claude em pt-BR com os dados do contexto.
   */
  buildPrompt(ticker: string, context: AnalysisContext): string {
    const posicaoStr = context.userPosition
      ? context.userPosition.qty < 0
        ? `Posição SHORT: ${Math.abs(context.userPosition.qty)} ações vendidas a descoberto com preço médio FS$ ${context.userPosition.avgPrice.toFixed(2)}`
        : `${context.userPosition.qty} ações com preço médio FS$ ${context.userPosition.avgPrice.toFixed(2)}`
      : 'Sem posição'

    const noticiasStr = context.recentNews.length
      ? context.recentNews.map(n => `- ${n.title} (sentimento: ${n.sentiment.toFixed(2)})`).join('\n')
      : '- Sem notícias recentes disponíveis'

    return `Você é um assessor financeiro especializado em futebol e mercado de capitais virtual.
Analise o ativo ${ticker} (clube de futebol) e forneça uma análise fundamentalista em português.

Dados atuais:
- Preço: FS$ ${context.currentPrice.toFixed(2)} (${context.changePercent >= 0 ? '+' : ''}${context.changePercent.toFixed(2)}% hoje)
- Posição do usuário: ${posicaoStr}

Últimas notícias:
${noticiasStr}

Retorne APENAS JSON válido, sem markdown, sem explicações adicionais:
{"resumo":"...","pontos_positivos":["..."],"pontos_negativos":["..."],"sentimento":0.0,"recomendacao":"COMPRAR|MANTER|VENDER","risco":"ALTO|MEDIO|BAIXO","noticias_relevantes":["..."]}`
  }

  /**
   * Verifica o cache sem incrementar nenhum contador.
   * Retorna o resultado cacheado (com cached: true) ou null se não houver entrada.
   */
  async peekCache(ticker: string, plan: PlanType): Promise<AIAnalysis | null> {
    const cacheKey = getCacheKey(ticker, plan)
    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached as string) as AIAnalysis
        return { ...parsed, cached: true }
      }
    } catch {
      // Redis indisponível — tratar como cache miss
    }
    return null
  }

  /**
   * Executa a análise completa com cache, chamada ao Claude e AbortController.
   * Assume que o chamador já verificou o rate limit antes de invocar este método.
   */
  async analyze(ticker: string, userId: string, plan: PlanType): Promise<AIAnalysis> {
    const cacheKey = getCacheKey(ticker, plan)

    // Cache check (defesa em profundidade — peekCache já foi chamado na rota)
    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached as string) as AIAnalysis
        return { ...parsed, cached: true }
      }
    } catch {
      // Redis indisponível — tratar como cache miss
    }

    // Buscar contexto
    const context = await this.fetchContext(ticker, userId)
    const prompt = this.buildPrompt(ticker, context)
    const isLenda = plan === PLAN_TYPE.LENDA

    // RESOLVED: retry com backoff exponencial para erros transitórios 429/5xx (G007)
    const MAX_RETRIES = 3
    const RETRY_DELAYS_MS = [1000, 2000] // delays entre tentativas

    let rawText: string
    let lastError: unknown

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]))
      }

      // AbortController para timeout de 30s (por tentativa)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {
        const anthropic = getAnthropic()
        let responseContent: string

        type BetaContentBlock = { type: string; text?: string }
        type BetaMessageResponse = { content: BetaContentBlock[] }
        type BetaMessages = {
          create: (params: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<BetaMessageResponse>
        }

        if (isLenda) {
          // Lenda: usa web_search tool via beta
          const res = await (anthropic.beta.messages as unknown as BetaMessages).create(
            {
              model: 'claude-sonnet-4-5',
              max_tokens: 1024,
              tools: [{ type: 'web_search_20250305', name: 'web_search' }],
              messages: [{ role: 'user', content: prompt }],
              betas: ['web-search-2025-03-05'],
            },
            { signal: controller.signal, timeout: 30_000 }
          )
          // Extrair texto da resposta (pode incluir tool_use blocks)
          const textBlock = res.content.find(b => b.type === 'text')
          responseContent = textBlock?.text ?? ''
        } else {
          // Craque: sem tools
          const res = await anthropic.messages.create(
            {
              model: 'claude-sonnet-4-5',
              max_tokens: 1024,
              messages: [{ role: 'user', content: prompt }],
            },
            { signal: controller.signal, timeout: 30_000 }
          )
          const textBlock = res.content.find((b): b is TextBlock => b.type === 'text')
          responseContent = textBlock?.text ?? ''
        }

        clearTimeout(timeoutId)
        rawText = responseContent
        break // sucesso — sair do loop
      } catch (err) {
        clearTimeout(timeoutId)
        if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
          throw new TimeoutError()
        }
        // Verificar se é erro transitório (429 ou 5xx) para retry
        const isTransient =
          err instanceof Error &&
          (err.message.includes('429') || err.message.includes('503') || err.message.includes('500') || err.message.includes('529'))
        if (!isTransient || attempt === MAX_RETRIES - 1) {
          lastError = err
          break
        }
        lastError = err
      }
    }

    if (rawText! === undefined) {
      throw lastError
    }

    const analysis = aiResponseParser.parse(rawText, ticker)
    const result: AIAnalysis = {
      ...analysis,
      isWebSearched: isLenda,
      cached: false,
    }

    // Salvar no cache (silencioso em caso de falha)
    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result))
    } catch {
      // ignorar falha de cache
    }

    // Registra AI_ASSESSOR_CONSULTED (2 pts, Pilar 2) para ligas ativas do usuário
    // Deduplica por (leagueId, userId, eventType, period) — no máximo 1 evento/dia/liga
    void this.registerAIConsultedEvent(userId, ticker).catch(() => {
      // silencioso — falha no registro não deve bloquear a resposta ao usuário
    })

    return result
  }

  /**
   * Registra o evento AI_ASSESSOR_CONSULTED (2 pts, Pilar 2) para todas as ligas ativas do usuário.
   * Deduplicação diária via LeagueEventRecorder.
   */
  private async registerAIConsultedEvent(userId: string, ticker: string): Promise<void> {
    const { leagueEventRecorder } = await import('./leagues/LeagueEventRecorder')
    await leagueEventRecorder.recordForAllActiveLeagues(
      userId,
      'AI_ASSESSOR_CONSULTED',
      { ticker }
    )
  }
}

export const aiAdvisorService = new AIAdvisorService()
