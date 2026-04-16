// ============================================================================
// FootStock — POST /api/v1/positions/short
// Abre posição SHORT com margem 150%. Exclusivo para plano LENDA.
// Rastreabilidade: INT-014 / TASK-4/ST003
// ============================================================================

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { created, error, errors } from '@/lib/api'
import { shortService } from '@/lib/services/ShortService'
import { AppError } from '@/lib/services/OrderService'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { requireActiveSubscription } from '@/lib/middleware/requireActiveSubscription'

const OpenShortSchema = z.object({
  ticker: z
    .string()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}\d{0,2}$/, 'Ticker inválido.'),
  quantity: z
    .number({ message: 'quantity deve ser número inteiro positivo.' })
    .int('quantity deve ser inteiro.')
    .positive('quantity deve ser maior que zero.')
    .min(1),
})

// POST /api/v1/positions/short — abre posição short
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  // Bloqueado em CANCELLATION_LOCK: novas shorts são proibidas
  const lockGuard = await requireActiveSubscription(auth.user.id, 'NEW_SHORT')
  if (lockGuard) return lockGuard

  try {
    const body = await request.json()
    const parsed = OpenShortSchema.safeParse(body)
    if (!parsed.success) {
      return errors.validation(
        parsed.error.issues.map((e) => e.message).join('; ')
      )
    }

    const { ticker, quantity } = parsed.data

    // Buscar ativo para obter preço atual
    const asset = await prisma.asset.findUnique({ where: { ticker } })
    if (!asset) {
      return error('ASSET_031', 'Ativo não encontrado.', 422, { ticker })
    }

    const currentPrice = Number(asset.currentPrice)
    if (currentPrice <= 0) {
      return error('ASSET_032', 'Preço do ativo inválido.', 422, { ticker })
    }

    // Verificar halt via DB (admin halt) e Redis (halt automático do motor)
    if (asset.isHalted) {
      return error('ASSET_030', 'Ativo temporariamente suspenso por circuit breaker.', 423, { ticker })
    }

    const haltKey = await redis.get(`motor:halt:${ticker}`).catch(() => null)
    if (haltKey !== null) {
      return error('ASSET_030', 'Ativo temporariamente suspenso pelo administrador.', 423, { ticker })
    }

    const position = await shortService.openShort(
      auth.user.id,
      asset.id,
      quantity,
      currentPrice
    )

    return created({
      position: {
        id: position.id,
        assetId: position.assetId,
        ticker,
        side: 'SHORT',
        quantity: Number(position.quantity),
        avgPrice: Number(position.avgPrice),
        marginBlocked: Number(position.marginBlocked),
        dailyInterestRate: Number(position.dailyInterestRate),
        interestAccrued: Number(position.interestAccrued),
        status: position.status,
        createdAt: position.createdAt.toISOString(),
      },
    })
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return error(err.code, err.message, err.statusCode, err.details)
    }
    return errors.server()
  }
}
