// ============================================================================
// Foot Stock — GET /api/v1/ai/analyze?ticker={ticker}
// Assessor IA: análise fundamentalista por ticker — plano Craque+ obrigatório
// Fonte: module-21/TASK-1/ST003
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { aiAdvisorService, TimeoutError } from '@/lib/services/AIAdvisorService'
import { aiRateLimiter } from '@/lib/redis/AIRateLimiter'
import { PLAN_TYPE } from '@/lib/enums'
import { CLUBS, normalizeClubTicker } from '@/lib/constants/clubs'
import type { PlanType } from '@/lib/enums'

// ---------------------------------------------------------------------------
// Schema de validação do query param (validação contra lista canônica CLUBS)
// ---------------------------------------------------------------------------

const VALID_TICKERS = CLUBS.map(c => c.ticker)

const TickerSchema = z
  .string()
  .min(3)
  .max(6)
  .toUpperCase()
  .refine(
    (t) => VALID_TICKERS.includes(t),
    { message: 'Ticker inválido ou não cadastrado.' }
  )

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function analyzeHandler(req: NextRequest, { user }: AuthContext) {
  const userPlan = user.planType as PlanType

  // Gate de plano — Jogador não tem acesso
  if (userPlan === PLAN_TYPE.JOGADOR) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AI-050',
          message: 'O Assessor IA está disponível a partir do plano Craque.',
          requiredPlan: 'CRAQUE',
        },
      },
      { status: 403 }
    )
  }

  // Validação do ticker
  const { searchParams } = new URL(req.url)
  const tickerRaw = searchParams.get('ticker') ?? ''
  const normalizedTicker = normalizeClubTicker(tickerRaw)
  const tickerResult = TickerSchema.safeParse(normalizedTicker)

  if (!tickerResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VAL-002',
          message: 'Ticker inválido ou não cadastrado.',
          field: 'ticker',
        },
      },
      { status: 400 }
    )
  }

  const ticker = tickerResult.data

  // Peek cache ANTES do rate limiter — cache hits não consomem quota
  const cachedAnalysis = await aiAdvisorService.peekCache(ticker, userPlan)
  if (cachedAnalysis) {
    return NextResponse.json({ success: true, data: cachedAnalysis }, { status: 200 })
  }

  // Cache miss — verificar rate limit antes de chamar o Claude
  const rateLimitStatus = await aiRateLimiter.check(user.id)

  const headers = new Headers({
    'X-RateLimit-Remaining': String(rateLimitStatus.remaining),
    'X-RateLimit-Reset': String(rateLimitStatus.resetAt),
  })

  if (!rateLimitStatus.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rateLimitStatus.resetAt - Date.now()) / 1000))
    headers.set('Retry-After', String(retryAfterSec))
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE-002',
          message: 'Limite de consultas ao Assessor IA atingido (10/hora).',
          remaining: 0,
          resetAt: rateLimitStatus.resetAt,
        },
      },
      { status: 429, headers }
    )
  }

  // Análise (cache miss confirmado, rate limit aprovado)
  try {
    const analysis = await aiAdvisorService.analyze(ticker, user.id, userPlan)
    return NextResponse.json({ success: true, data: analysis }, { status: 200, headers })
  } catch (err) {
    if (err instanceof TimeoutError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SYS-003',
            message: 'A operação demorou mais do que o esperado. Por favor, tente novamente.',
          },
        },
        { status: 504, headers }
      )
    }

    console.error('[/api/v1/ai/analyze] Erro inesperado:', err)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AI-051',
          message: 'O Assessor IA está temporariamente indisponível. Tente novamente.',
        },
      },
      { status: 503, headers }
    )
  }
}

export const GET = withAuth(analyzeHandler)
