// ============================================================================
// FootStock — Middleware: checkDailyOrderLimit
// Verifica limites diários de ordens por plano via Redis (chave BRT).
// Executado em todo POST /api/v1/orders antes da criação.
// Rastreabilidade: T-020 / INT-019
// ============================================================================

import { NextResponse } from 'next/server'
import { redisPublisher as redis } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
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

  // Verificar contador
  const used = await _getDailyCount(userId, now)
  const remaining = Math.max(0, limit - used)

  if (used >= limit) {
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
 * Incrementa o contador diário no Redis após criação bem-sucedida.
 * TTL calculado até meia-noite BRT.
 * Operação atômica via INCR; se Redis falhar, silencioso (fallback no banco no próximo check).
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
    // Falha silenciosa — o fallback do banco será usado na próxima validação
  }
}

// ---------------------------------------------------------------------------
// Helper interno: lê o contador do dia (Redis-first, fallback no banco)
//
// NOTA DE DESIGN — Race condition:
// Este middleware faz read-then-check sem reserva atômica. Duas requisições
// concorrentes podem passar na verificação se `used = limit - 1` nas duas.
// Isso é aceitável por design (spec T-020 exige incremento SÓ após sucesso,
// inviabilizando reserve-and-rollback sem complexidade de saga). Para planos
// com limite baixo (2/5 ordens/dia), a janela de race é milissegundos e
// o impacto prático é no máximo 1 ordem extra em dias extremamente raros.
// O `OrderService._checkDailyLimit` serve como defense-in-depth na camada
// de serviço, reduzindo o impacto da race.
// ---------------------------------------------------------------------------

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
