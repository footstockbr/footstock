import { NextRequest } from 'next/server'
import { getAuthUser, hasPlan } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors, error } from '@/lib/api'
import { getAIAnalyzeRateLimit } from '@/lib/ratelimit'
import { aiAdvisorService } from '@/lib/services/AIAdvisorService'
import { isMotorOnline } from '@/middleware/motorOnlineCheck'
import { requireActiveSubscription } from '@/lib/middleware/requireActiveSubscription'
import { applyRateLimitHeaders, msToResetSeconds, retryAfterFromReset } from '@/middleware/rateLimit'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import type { RateLimitInfo } from '@/middleware/rateLimit'
import type { AIAnalysis } from '@/types'
import type { PlanType } from '@/lib/enums'
import type { UserPlan } from '@/lib/analytics'

// GET /api/v1/ai/analyze?ticker=URU3
// Plano mínimo: CRAQUE
// Rate limit: 10 req/hora por userId (TASK-026)
// Cache Redis TTL 30 min por ticker+plano
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasPlan(auth.user.planType, 'CRAQUE')) {
    return errors.forbidden(
      'O Assessor IA está disponível a partir do plano Craque.',
      'CRAQUE'
    )
  }

  // AI Assessor bloqueado em CANCELLATION_LOCK
  const lockGuard = await requireActiveSubscription(auth.user.id, 'AI_ADVISOR')
  if (lockGuard) return lockGuard

  // Assessor IA bloqueado quando motor offline (depende de dados em tempo real — US-034)
  const motorStatus = await isMotorOnline()
  if (!motorStatus.online) {
    return error(
      'MOTOR_090',
      'Assessor IA indisponível — mercado em manutenção. Tente novamente quando o mercado retomar.',
      503
    )
  }

  // ── Rate limit: 10 req/h por userId (TASK-026 — controle billing Anthropic) ──
  // X-RateLimit-Remaining é especialmente importante aqui (usuário precisa saber quantas análises restam)
  const rateLimiter = getAIAnalyzeRateLimit()
  const { success, remaining, reset } = await rateLimiter.limit(auth.user.id)

  const rlInfo: RateLimitInfo = {
    limit: 10,
    remaining,
    resetTimestampSeconds: msToResetSeconds(reset),
  }

  if (!success) {
    const resetDate = new Date(reset)
    const minutesLeft = Math.ceil((reset - Date.now()) / 60_000)
    const resetTime = resetDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    const retryAfter = retryAfterFromReset(reset)

    const res = errors.rateLimit(
      `Limite de análises IA atingido. Reinicia em ${minutesLeft} min (${resetTime} BRT).`,
      resetDate.toISOString()
    )
    applyRateLimitHeaders(res, rlInfo, retryAfter)
    return res
  }

  const ticker = request.nextUrl.searchParams.get('ticker')?.toUpperCase()

  if (!ticker) {
    const res = errors.validation('Parâmetro ticker é obrigatório.')
    applyRateLimitHeaders(res, rlInfo)
    return res
  }

  try {
    // Busca asset para validação e para obter clubName
    const asset = await prisma.asset.findUnique({
      where: { ticker },
      select: { ticker: true, displayName: true },
    })

    if (!asset) {
      const res = errors.notFound('Ativo não encontrado.')
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    const planType = auth.user.planType as PlanType

    // Chama o AIAdvisorService real (Claude Sonnet, cache Redis 30min, retry com backoff)
    // CRAQUE: sem web_search | LENDA: com web_search tool use
    const startMs = Date.now()
    const serviceResult = await aiAdvisorService.analyze(ticker, auth.user.id, planType)
    const responseMs = Date.now() - startMs

    // EVT-028: ai_advisor_queried — rastreia consulta ao assessor IA
    mixpanelServer.trackAIAdvisorQueried(auth.user.id, {
      asset_ticker: ticker,
      plan: (auth.user.planType ?? 'JOGADOR') as UserPlan,
      served_from_cache: serviceResult.cached,
      response_ms: responseMs,
    })

    // Mapeia sentimento numérico (-1..1) para enum de display
    const sentimentScore = serviceResult.sentimento
    const sentimentoGeral: AIAnalysis['sentimentoGeral'] =
      sentimentScore > 0.3 ? 'BULLISH' : sentimentScore < -0.3 ? 'BEARISH' : 'NEUTRAL'
    const emoji =
      sentimentoGeral === 'BULLISH' ? '📈' : sentimentoGeral === 'BEARISH' ? '📉' : '➡️'

    const analysis: AIAnalysis & { isWebSearched: boolean; cached: boolean } = {
      ticker: asset.ticker,
      clubName: asset.displayName,
      resumo: serviceResult.resumo,
      pontosPositivos: serviceResult.pontos_positivos,
      pontosNegativos: serviceResult.pontos_negativos,
      sentimentoGeral,
      recomendacao: serviceResult.recomendacao,
      nivelRisco: serviceResult.risco,
      noticiasRecentes: serviceResult.noticias_relevantes.map((n) => ({
        titulo: n,
        sentimento: sentimentoGeral,
        emoji,
      })),
      isWebSearched: serviceResult.isWebSearched,
      cached: serviceResult.cached,
    }

    const res = ok(analysis)
    applyRateLimitHeaders(res, rlInfo)
    return res
  } catch (err) {
    console.error('[AI Analyze] Erro ao gerar análise:', err)
    const res = errors.server('Assessor indisponível. Tente em breve.')
    applyRateLimitHeaders(res, rlInfo)
    return res
  }
}
