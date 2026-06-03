// ============================================================================
// FootStock — Middleware: checkDailyOrderLimit
// Verifica limites diários de ordens por plano via Redis (chave BRT).
// Executado em todo POST /api/v1/orders antes da criação.
// Rastreabilidade: T-020 / INT-019
// ============================================================================

import { NextResponse } from 'next/server'
import { redisPublisher as redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { atomicIncrWithTtl } from '@/utils/redisRateLimit'
import type { PlanType } from '@/lib/enums'
import { DAILY_ORDER_LIMITS_BY_PLAN, ALLOWED_ORDER_TYPES_BY_PLAN } from '@/lib/services/plan-order-limits'
import { todayInBRT, getBrtDayBounds, nextMidnightBRT, secondsUntilMidnightBRT, formatTimeUntilReset } from '@/utils/timezone'

export interface DailyLimitInfo {
  limit: number | null       // null = ilimitado
  used: number
  remaining: number | null   // null = ilimitado
  resetAt: string            // ISO string da próxima meia-noite BRT
}

/**
 * Verifica se o usuário pode criar mais uma ordem com base no plano e tipo.
 *
 * Retorna `null` se a operação está permitida (proceed).
 * Retorna `NextResponse` (403) se o limite ou tipo foi violado.
 *
 * Também popula `info` com os metadados de limite (para os headers HTTP).
 *
 * Importante: esta função NAO incrementa contador. Ela e usada por rotas de
 * leitura/preflight; a reserva atomica de vaga diaria acontece em
 * reserveDailyOrderLimit(), chamada somente quando a criacao vai prosseguir.
 */
export async function checkDailyOrderLimit(
  userId: string,
  planType: PlanType,
  orderType: string,
): Promise<{ block: NextResponse | null; info: DailyLimitInfo }> {
  const now = new Date()
  const resetAt = nextMidnightBRT(now).toISOString()

  // Lenda: sem restrições
  if (planType === 'LENDA') {
    const used = await _getDailyCount(userId, now)
    return {
      block: null,
      info: { limit: null, used, remaining: null, resetAt },
    }
  }

  const limit = DAILY_ORDER_LIMITS_BY_PLAN[planType]
  const allowedTypes = ALLOWED_ORDER_TYPES_BY_PLAN[planType] ?? ['MARKET']

  // Verificar tipo de ordem ANTES do contador
  if (!allowedTypes.includes(orderType)) {
    const response = NextResponse.json(
      {
        error: {
          code: 'ORDER_051',
          message: `Plano ${planType} não permite ordens do tipo ${orderType}. Tipos permitidos: ${allowedTypes.join(', ')}.`,
          planType,
          orderType,
          allowedTypes,
          resetAt,
        },
      },
      { status: 403 }
    )
    response.headers.set('X-DailyOrder-Limit', String(limit))
    response.headers.set('X-DailyOrder-Remaining', '0')
    response.headers.set('X-DailyOrder-Reset', resetAt)
    return {
      block: response,
      info: { limit, used: 0, remaining: 0, resetAt },
    }
  }

  const used = await _getDailyCount(userId, now)
  const remaining = Math.max(0, limit - used)

  if (used >= limit) {
    const response = _dailyLimitResponse({ limit, used, planType, resetAt, now })
    return {
      block: response,
      info: { limit, used, remaining: 0, resetAt },
    }
  }

  return {
    block: null,
    info: { limit, used, remaining, resetAt },
  }
}

/**
 * Reserva atomicamente uma vaga do limite diario. Deve ser chamada apenas apos
 * validacoes deterministicas e imediatamente antes da criacao da ordem.
 *
 * Se a criacao falhar, chame releaseDailyOrderReservation() para nao consumir
 * limite indevidamente.
 */
export async function reserveDailyOrderLimit(
  userId: string,
  planType: PlanType,
  orderType: string,
  now: Date = new Date(),
): Promise<{ block: NextResponse | null; info: DailyLimitInfo; reserved: boolean }> {
  const resetAt = nextMidnightBRT(now).toISOString()

  if (planType === 'LENDA') {
    const used = await _getDailyCount(userId, now)
    return {
      block: null,
      info: { limit: null, used, remaining: null, resetAt },
      reserved: false,
    }
  }

  const limit = DAILY_ORDER_LIMITS_BY_PLAN[planType]
  const allowedTypes = ALLOWED_ORDER_TYPES_BY_PLAN[planType] ?? ['MARKET']

  if (!allowedTypes.includes(orderType)) {
    const response = NextResponse.json(
      {
        error: {
          code: 'ORDER_051',
          message: `Plano ${planType} não permite ordens do tipo ${orderType}. Tipos permitidos: ${allowedTypes.join(', ')}.`,
          planType,
          orderType,
          allowedTypes,
          resetAt,
        },
      },
      { status: 403 }
    )
    response.headers.set('X-DailyOrder-Limit', String(limit))
    response.headers.set('X-DailyOrder-Remaining', '0')
    response.headers.set('X-DailyOrder-Reset', resetAt)
    return {
      block: response,
      info: { limit, used: 0, remaining: 0, resetAt },
      reserved: false,
    }
  }

  const dateStr = todayInBRT(now)
  const redisKey = `order:daily:${userId}:${dateStr}`
  const ttl = secondsUntilMidnightBRT(now)

  try {
    const { count: newCount } = await atomicIncrWithTtl(redisKey, ttl)

    // Sem Redis configurado/operante: fail-open. O fallback por banco passa a
    // contar a ordem assim que ela for criada com sucesso.
    if (newCount === 0) {
      const used = await _getDailyCount(userId, now)
      const remaining = Math.max(0, limit - used)
      if (used >= limit) {
        const response = _dailyLimitResponse({ limit, used, planType, resetAt, now })
        return { block: response, info: { limit, used, remaining: 0, resetAt }, reserved: false }
      }
      return { block: null, info: { limit, used, remaining, resetAt }, reserved: false }
    }

    if (newCount > limit) {
      await redis.decr(redisKey)
      const response = _dailyLimitResponse({ limit, used: limit, planType, resetAt, now })
      return {
        block: response,
        info: { limit, used: limit, remaining: 0, resetAt },
        reserved: false,
      }
    }

    return {
      block: null,
      info: {
        limit,
        used: newCount,
        remaining: Math.max(0, limit - newCount),
        resetAt,
      },
      reserved: true,
    }
  } catch {
    const used = await _getDailyCount(userId, now)
    const remaining = Math.max(0, limit - used)
    if (used >= limit) {
      const response = _dailyLimitResponse({ limit, used, planType, resetAt, now })
      return { block: response, info: { limit, used, remaining: 0, resetAt }, reserved: false }
    }
    return { block: null, info: { limit, used, remaining, resetAt }, reserved: false }
  }
}

export async function releaseDailyOrderReservation(userId: string, now: Date = new Date()): Promise<void> {
  const dateStr = todayInBRT(now)
  const redisKey = `order:daily:${userId}:${dateStr}`
  try {
    const current = await redis.get(redisKey)
    if (current !== null && parseInt(current, 10) > 0) {
      await redis.decr(redisKey)
    }
  } catch {
    // Falha silenciosa: se Redis estiver indisponivel, nao houve reserva confiavel.
  }
}

/**
 * Incrementa o contador diário no Redis após criação bem-sucedida.
 * Mantido para compatibilidade, mas o fluxo de ordens usa reserva atomica.
 */
export async function incrementDailyCounter(userId: string, now: Date = new Date()): Promise<void> {
  const dateStr = todayInBRT(now)
  const redisKey = `order:daily:${userId}:${dateStr}`
  try {
    const count = await redis.incr(redisKey)
    if (count === 1) {
      const { endUtc } = getBrtDayBounds(now)
      const ttl = Math.max(1, Math.ceil((endUtc.getTime() + 1 - now.getTime()) / 1000))
      await redis.expire(redisKey, ttl)
    }
  } catch {
    // Falha silenciosa — o fallback do banco será usado na próxima validação.
  }
}

function _dailyLimitResponse(params: {
  limit: number
  used: number
  planType: PlanType
  resetAt: string
  now: Date
}): NextResponse {
  const { limit, used, planType, resetAt, now } = params
  const timeUntil = formatTimeUntilReset(now)
  const response = NextResponse.json(
    {
      error: {
        code: 'ORDER_051',
        message: `Limite diário de ${limit} ordens atingido para o plano ${planType}. Próximo reset em ${timeUntil}.`,
        limit,
        used,
        planType,
        resetAt,
        retryAfterSeconds: Math.ceil((nextMidnightBRT(now).getTime() - now.getTime()) / 1000),
      },
    },
    { status: 403 }
  )
  response.headers.set('X-DailyOrder-Limit', String(limit))
  response.headers.set('X-DailyOrder-Remaining', '0')
  response.headers.set('X-DailyOrder-Reset', resetAt)
  return response
}

async function _getDailyCount(userId: string, now: Date): Promise<number> {
  const dateStr = todayInBRT(now)
  const redisKey = `order:daily:${userId}:${dateStr}`

  try {
    const val = await redis.get(redisKey)
    if (val !== null) return parseInt(val, 10)
  } catch {
    // Redis indisponível — cair no fallback
  }

  // Fallback: contar no banco usando os limites do dia BRT convertidos para UTC
  const { startUtc, endUtc } = getBrtDayBounds(now)
  const count = await prisma.order.count({
    where: {
      userId,
      createdAt: { gte: startUtc, lte: endUtc },
      status: { not: 'CANCELLED' },
      type: { not: 'SCHEDULED' },
    },
  })

  // Best-effort: repopular Redis a partir do banco para evitar bater no DB
  // em cada request enquanto a chave estiver ausente.
  if (count > 0) {
    try {
      const ttl = secondsUntilMidnightBRT(now)
      await redis.set(redisKey, String(count), 'EX', ttl)
    } catch {
      // Falha silenciosa — o próximo check simplesmente usa o fallback novamente
    }
  }

  return count
}
