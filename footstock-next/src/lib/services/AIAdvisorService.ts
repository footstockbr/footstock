// ============================================================================
// FootStock — AIAdvisorService (module-21/TASK-1/ST002+ST004 + TASK-2/ST003)
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

// ---------------------------------------------------------------------------
// Dynamic prompt config (DB + Redis cache)
// ---------------------------------------------------------------------------

interface PromptConfigFields {
  persona: string
  context: string
  analysisGuidelines: string
  riskCriteria: string
  tone: string
  extraInstructions: string
}

const PROMPT_CONFIG_CACHE_KEY = 'ai:prompt-config'
const PROMPT_CONFIG_CACHE_TTL = 3600 // 1h

const DEFAULT_PROMPT_CONFIG: PromptConfigFields = {
  persona: 'Você é um assessor financeiro virtual especializado no mercado de futebol do FootStock. Você combina conhecimento profundo de futebol mundial com análise técnica e fundamentalista de mercado de capitais. Seu nome é Assessor FS e você atua como um analista profissional CNPI (Certificado Nacional do Profissional de Investimentos) especializado no universo futebolístico. Você tem experiência em análise de clubes europeus, sul-americanos e seleções, e conhece profundamente as dinâmicas de transferências, desempenho em campeonatos, gestão financeira de clubes e fatores que influenciam o "valor de mercado" de cada ativo.',
  context: 'O FootStock é um simulador de mercado de capitais baseado em clubes e seleções de futebol. A moeda virtual é FS$ (FootStock Dollar). Cada ativo representa um clube ou seleção real. O preço reflete desempenho esportivo, notícias, contratações, resultados em campeonatos e sentimento da comunidade. Não há dinheiro real envolvido — é 100 porcento educacional e simulado. O mercado funciona com livro de ofertas (order book), posições long e short, dividendos trimestrais baseados em performance esportiva, e ligas competitivas entre investidores. Os planos são: Jogador (gratuito, sem assessor), Craque (assessor sem web search) e Lenda (assessor com web search em tempo real).',
  analysisGuidelines: 'Ao analisar um ativo, considere com rigor e profundidade:\n\n1. DESEMPENHO ESPORTIVO: Resultados recentes (últimos 5-10 jogos), posição na tabela do campeonato principal, desempenho em copas nacionais e internacionais, sequência de vitórias/derrotas, gols marcados vs sofridos.\n\n2. MERCADO DE TRANSFERÊNCIAS: Contratações e vendas recentes de jogadores-chave, janela de transferências aberta/fechada, impacto financeiro das movimentações, jogadores em fim de contrato.\n\n3. FATORES INTERNOS: Lesões de jogadores importantes, suspensões, mudanças de técnico/diretoria, crise institucional, dívidas do clube, estádio/infraestrutura.\n\n4. FATORES EXTERNOS: Calendário de jogos próximos (dificuldade dos adversários), fase da temporada (início/meio/fim), competições paralelas, clima político do futebol local.\n\n5. SENTIMENTO E VOLUME: Sentimento da comunidade de investidores, volume de negociação recente, tendência de preço (alta, baixa, lateral), suportes e resistências identificáveis.\n\n6. COMPARAÇÃO: Compare com ativos similares da mesma divisão/liga para contextualizar se o preço está caro ou barato relativamente.\n\nSeja ESPECÍFICO e EMBASADO — cite dados concretos disponíveis, evite generalizações vagas como "o time está bem". Cada ponto deve ser acionável para uma decisão de investimento.',
  riskCriteria: 'BAIXO: Ativo estável, clube de grande porte com histórico consistente de pelo menos 5 temporadas, sem notícias negativas relevantes, baixa volatilidade recente (variação diária inferior a 3 porcento), posição confortável na tabela, elenco mantido sem grandes perdas.\n\nMEDIO: Volatilidade moderada (variação entre 3 porcento e 8 porcento), resultados mistos nas últimas rodadas, algumas incertezas como troca recente de técnico, período de janela de transferências com movimentações em andamento, posição intermediária na tabela.\n\nALTO: Alta volatilidade (variação superior a 8 porcento), crise esportiva (sequência de 3+ derrotas), crise institucional (mudança de presidente/diretoria), dependência excessiva de um único jogador, risco de rebaixamento, investigações/punições, elenco sendo desmontado.',
  tone: 'Profissional mas acessível. Use linguagem clara em português brasileiro. Evite jargão financeiro complexo — o público é de entusiastas de futebol que estão aprendendo sobre mercado. Seja direto e objetivo nas recomendações. Use analogias futebolísticas quando apropriado para explicar conceitos de mercado. Não use emojis. Mantenha um tom confiante mas prudente — reconheça incertezas quando existirem em vez de forçar uma opinião.',
  extraInstructions: '',
}

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
   * Carrega a configuração dinâmica do prompt: Redis (cache) -> DB -> defaults hardcoded.
   */
  async getPromptConfig(): Promise<PromptConfigFields> {
    // 1. Redis cache
    try {
      const cached = await redis.get(PROMPT_CONFIG_CACHE_KEY)
      if (cached) {
        return JSON.parse(cached as string) as PromptConfigFields
      }
    } catch {
      // Redis indisponível
    }

    // 2. DB
    try {
      const rows = await prisma.$queryRaw<Array<{
        persona: string; context: string; analysis_guidelines: string;
        risk_criteria: string; tone: string; extra_instructions: string
      }>>`
        SELECT persona, context, analysis_guidelines, risk_criteria, tone, extra_instructions
        FROM ai_prompt_configs WHERE id = 'default' LIMIT 1
      `
      if (rows.length > 0) {
        const row = rows[0]
        const config: PromptConfigFields = {
          persona: row.persona,
          context: row.context,
          analysisGuidelines: row.analysis_guidelines,
          riskCriteria: row.risk_criteria,
          tone: row.tone,
          extraInstructions: row.extra_instructions,
        }
        // Re-cache
        try { await redis.setex(PROMPT_CONFIG_CACHE_KEY, PROMPT_CONFIG_CACHE_TTL, JSON.stringify(config)) } catch { /* ignore */ }
        return config
      }
    } catch {
      // DB unavailable — use defaults
    }

    // 3. Hardcoded defaults
    return DEFAULT_PROMPT_CONFIG
  }

  /**
   * Constrói o system prompt para o Claude usando configuração dinâmica.
   */
  buildSystemPrompt(cfg: PromptConfigFields): string {
    const sections = [
      `# PERSONA\n${cfg.persona}`,
      `# CONTEXTO DA PLATAFORMA\n${cfg.context}`,
      `# DIRETRIZES DE ANÁLISE\n${cfg.analysisGuidelines}`,
      `# CRITÉRIOS DE RISCO\n${cfg.riskCriteria}`,
      `# TOM E LINGUAGEM\n${cfg.tone}`,
    ]

    if (cfg.extraInstructions.trim()) {
      sections.push(`# INSTRUÇÕES ADICIONAIS\n${cfg.extraInstructions}`)
    }

    sections.push(`# FORMATO DE RESPOSTA (OBRIGATÓRIO)
Retorne APENAS um objeto JSON válido, sem markdown, sem blocos de código, sem explicações antes ou depois.
O JSON deve seguir EXATAMENTE esta estrutura:
{
  "resumo": "Resumo da análise em 2-4 frases, mencionando o cenário atual do ativo e perspectivas de curto prazo.",
  "pontos_positivos": ["Ponto 1 específico e embasado", "Ponto 2", "Até 5 pontos"],
  "pontos_negativos": ["Ponto 1 específico e embasado", "Ponto 2", "Até 5 pontos"],
  "sentimento": 0.0,
  "recomendacao": "COMPRAR|MANTER|VENDER",
  "risco": "ALTO|MEDIO|BAIXO",
  "noticias_relevantes": ["Notícia 1 contextualizada", "Notícia 2"]
}

Regras do JSON:
- "sentimento": número decimal de -1.0 (muito negativo) a +1.0 (muito positivo), com 2 casas
- "recomendacao": exatamente "COMPRAR", "MANTER" ou "VENDER" (sem variações)
- "risco": exatamente "ALTO", "MEDIO" ou "BAIXO"
- "pontos_positivos" e "pontos_negativos": mínimo 1 item, máximo 5
- "noticias_relevantes": lista com as notícias mais relevantes para a análise (pode ser vazia se não houver)
- Não inclua comentários, trailing commas, ou qualquer texto fora do JSON`)

    return sections.join('\n\n')
  }

  /**
   * Constrói o user prompt com os dados reais do ativo para a análise.
   */
  buildUserPrompt(ticker: string, context: AnalysisContext): string {
    const posicaoStr = context.userPosition
      ? context.userPosition.qty < 0
        ? `Posição SHORT: ${Math.abs(context.userPosition.qty)} ações vendidas a descoberto com preço médio FS$ ${context.userPosition.avgPrice.toFixed(2)}`
        : `Posição LONG: ${context.userPosition.qty} ações com preço médio FS$ ${context.userPosition.avgPrice.toFixed(2)}`
      : 'Sem posição aberta'

    const noticiasStr = context.recentNews.length
      ? context.recentNews.map(n => `- ${n.title} (score sentimento: ${n.sentiment.toFixed(2)})`).join('\n')
      : '- Nenhuma notícia recente disponível para este ativo'

    return `Analise o ativo ${ticker} no mercado FootStock.

DADOS DE MERCADO:
- Preço atual: FS$ ${context.currentPrice.toFixed(2)}
- Variação hoje: ${context.changePercent >= 0 ? '+' : ''}${context.changePercent.toFixed(2)}%
- Posição do investidor: ${posicaoStr}

NOTÍCIAS RECENTES DO ATIVO:
${noticiasStr}

Com base nos dados acima, nas notícias e no seu conhecimento sobre o clube/seleção representado por ${ticker}, gere a análise no formato JSON especificado.`
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

    // Buscar contexto e configuração do prompt em paralelo
    const [context, promptConfig] = await Promise.all([
      this.fetchContext(ticker, userId),
      this.getPromptConfig(),
    ])

    // Dev mode: retorna análise mock quando ANTHROPIC_API_KEY não está configurada
    if (!process.env.ANTHROPIC_API_KEY && process.env.NODE_ENV === 'development') {
      return this.buildDevMockAnalysis(ticker, context, plan)
    }

    const systemPrompt = this.buildSystemPrompt(promptConfig)
    const userPrompt = this.buildUserPrompt(ticker, context)
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
          // Lenda: usa web_search tool via beta + system prompt
          const res = await (anthropic.beta.messages as unknown as BetaMessages).create(
            {
              model: 'claude-sonnet-4-5',
              max_tokens: 1024,
              system: systemPrompt,
              tools: [{ type: 'web_search_20250305', name: 'web_search' }],
              messages: [{ role: 'user', content: userPrompt }],
              betas: ['web-search-2025-03-05'],
            },
            { signal: controller.signal, timeout: 30_000 }
          )
          // Extrair TODOS os text blocks (web_search retorna narrativa + JSON em blocks separados)
          const textBlocks = res.content.filter(b => b.type === 'text' && b.text)
          responseContent = textBlocks.map(b => b.text!).join('\n')
        } else {
          // Craque: sem tools, com system prompt
          const res = await anthropic.messages.create(
            {
              model: 'claude-sonnet-4-5',
              max_tokens: 1024,
              system: systemPrompt,
              messages: [{ role: 'user', content: userPrompt }],
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
      // Dev mode: fallback mock quando Anthropic retorna erro não-transitório (400/401/402)
      if (process.env.NODE_ENV === 'development') {
        console.warn('[AIAdvisor] Anthropic API error in dev, falling back to mock:', lastError instanceof Error ? lastError.message : lastError)
        return this.buildDevMockAnalysis(ticker, context, plan)
      }
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
   * Dev mode: retorna análise mock realista quando ANTHROPIC_API_KEY não está configurada.
   * Evita 500 em dev local e permite testar o fluxo completo do assessor.
   */
  private buildDevMockAnalysis(ticker: string, context: AnalysisContext, plan: PlanType): AIAnalysis {
    const score = context.changePercent > 0 ? 0.5 : context.changePercent < 0 ? -0.4 : 0.1
    return {
      ticker,
      resumo: `[DEV MOCK] Analise simulada para ${ticker}. Preco atual FS$ ${context.currentPrice.toFixed(2)} com variacao de ${context.changePercent >= 0 ? '+' : ''}${context.changePercent.toFixed(2)}% hoje. Resposta gerada localmente em modo de desenvolvimento (API Anthropic indisponivel).`,
      pontos_positivos: [
        'Liquidez consistente no mercado',
        'Base de holders estavel',
        'Historico de recuperacao apos quedas',
      ],
      pontos_negativos: [
        'Volatilidade acima da media do setor',
        'Dependencia de resultados esportivos',
      ],
      sentimento: score,
      recomendacao: score > 0.3 ? 'COMPRAR' : score < -0.3 ? 'VENDER' : 'MANTER',
      risco: 'MEDIO',
      noticias_relevantes: context.recentNews.length > 0
        ? context.recentNews.map(n => n.title)
        : ['Sem noticias recentes disponiveis para este ativo'],
      generatedAt: new Date().toISOString(),
      isWebSearched: plan === PLAN_TYPE.LENDA,
      cached: false,
    }
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
