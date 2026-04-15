// T-031: resolução de aliases de ticker (FLA3 → URU3) aplicada ao campo ticker do body.
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/auth'
import { created, list, error, errors } from '@/lib/api'
import { orderService, AppError } from '@/lib/services/OrderService'
import { CreateOrderSchema } from '@/lib/validators/order'
import { isMotorOnline } from '@/middleware/motorOnlineCheck'
import { requireActiveSubscription } from '@/lib/middleware/requireActiveSubscription'
import { checkDailyOrderLimit, type DailyLimitInfo } from '@/lib/middleware/checkDailyOrderLimit'
import { getOrdersRateLimit } from '@/lib/ratelimit'
import { applyRateLimitHeaders, msToResetSeconds, retryAfterFromReset } from '@/middleware/rateLimit'
import { AliasService } from '@/services/AliasService'
import type { RateLimitInfo } from '@/middleware/rateLimit'
import type { PlanType } from '@/lib/enums'

// POST /api/v1/orders — cria ordem com validação de plano
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  // ── Rate limiting: 100 req / 60s por userId (sliding window ZSET, TASK-026) ──
  const ordersLimiter = getOrdersRateLimit()
  const rlResult = await ordersLimiter.limit(auth.user.id)
  const rlInfo: RateLimitInfo = {
    limit: 100,
    remaining: rlResult.remaining,
    resetTimestampSeconds: msToResetSeconds(rlResult.reset),
  }

  if (!rlResult.success) {
    const retryAfter = retryAfterFromReset(rlResult.reset)
    const res = errors.rateLimit('Limite de ordens por minuto atingido. Aguarde antes de enviar novas ordens.')
    applyRateLimitHeaders(res, rlInfo, retryAfter)
    return res
  }

  // Guard semântico para CANCELLATION_LOCK:
  // Ler o body antecipadamente para verificar se é SELL (redução de risco = permitido)
  // BUY e ordens premium (OCO, SCHEDULED) são bloqueadas
  const rawBody = await request.json().catch(() => null)
  if (!rawBody) {
    const res = errors.validation('Body JSON inválido.')
    applyRateLimitHeaders(res, rlInfo)
    return res
  }

  const orderSide = rawBody?.side
  const orderType = rawBody?.type
  const isRiskReduction = orderSide === 'SELL' && orderType === 'MARKET'

  if (!isRiskReduction) {
    const lockGuard = await requireActiveSubscription(auth.user.id, 'NEW_ORDER')
    if (lockGuard) {
      applyRateLimitHeaders(lockGuard, rlInfo)
      return lockGuard
    }
  }

  // Gate de limite diário (verifica plano + tipo + contador Redis)
  let dailyLimitInfo: DailyLimitInfo | null = null
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { planType: true },
  })
  if (user) {
    const { block, info } = await checkDailyOrderLimit(
      auth.user.id,
      user.planType as PlanType,
      orderType ?? '',
    )
    if (block) {
      applyRateLimitHeaders(block, rlInfo)
      return block
    }
    dailyLimitInfo = info
  }

  // Gate no motor (belt-and-suspenders além do check em OrderService)
  const motorStatus = await isMotorOnline()
  if (!motorStatus.online) {
    const res = error('MOTOR_090', 'Motor de mercado temporariamente indisponível. Novas ordens estão suspensas.', 503)
    _attachDailyHeaders(res, dailyLimitInfo)
    applyRateLimitHeaders(res, rlInfo)
    return res
  }

  try {
    const parsed = CreateOrderSchema.safeParse(rawBody)
    if (!parsed.success) {
      const res = errors.validation(parsed.error.issues.map((e) => e.message).join('; '))
      _attachDailyHeaders(res, dailyLimitInfo)
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // Resolver alias do ticker no body: FLA3 → URU3 (T-031)
    const resolvedTicker = await AliasService.resolve(parsed.data.ticker)
    if (!resolvedTicker) {
      const res = errors.validation('Ativo não encontrado.')
      _attachDailyHeaders(res, dailyLimitInfo)
      applyRateLimitHeaders(res, rlInfo)
      return res
    }
    const orderData = { ...parsed.data, ticker: resolvedTicker }

    const order = await orderService.createOrder(auth.user.id, orderData)
    const res = created({ order })

    // Headers de limite diário
    if (dailyLimitInfo) {
      const { limit, remaining, resetAt } = dailyLimitInfo
      res.headers.set('X-DailyOrder-Limit', limit !== null ? String(limit) : 'unlimited')
      const newRemaining = remaining !== null ? Math.max(0, remaining - 1) : 'unlimited'
      res.headers.set('X-DailyOrder-Remaining', String(newRemaining))
      res.headers.set('X-DailyOrder-Reset', resetAt)
    }

    applyRateLimitHeaders(res, rlInfo)
    return res
  } catch (err: unknown) {
    if (err instanceof AppError) {
      const res = error(err.code, err.message, err.statusCode, err.details)
      _attachDailyHeaders(res, dailyLimitInfo)
      applyRateLimitHeaders(res, rlInfo)
      return res
    }
    const res = errors.server()
    _attachDailyHeaders(res, dailyLimitInfo)
    applyRateLimitHeaders(res, rlInfo)
    return res
  }
}

function _attachDailyHeaders(res: ReturnType<typeof error>, info: DailyLimitInfo | null): void {
  if (!info) return
  res.headers.set('X-DailyOrder-Limit', info.limit !== null ? String(info.limit) : 'unlimited')
  res.headers.set('X-DailyOrder-Remaining', info.remaining !== null ? String(info.remaining) : 'unlimited')
  res.headers.set('X-DailyOrder-Reset', info.resetAt)
}

// GET /api/v1/orders — lista ordens paginadas do usuário
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  const userId = auth.user.id

  try {
    const { searchParams } = request.nextUrl
    const filters = {
      status: searchParams.get('status') ?? undefined,
      assetId: searchParams.get('assetId') ?? undefined,
      type: searchParams.get('type') ?? undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Math.min(Number(searchParams.get('limit')), 100) : 20,
    }

    const result = await orderService.getOrders(userId, filters)
    return list(result.data, result.pagination)
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return error(err.code, err.message, err.statusCode)
    }
    return errors.server()
  }
}
