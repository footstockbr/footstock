// ============================================================================
// Foot Stock — GET /api/v1/assets
// Listagem paginada de ativos com filtros e delay por plano.
// ============================================================================

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { marketAssetRepository } from '@/lib/repositories/MarketAssetRepository'
import { applyDelayBatch, getCacheHint, getDelaySeconds } from '@/lib/services/DelayService'
import { checkRateLimit } from '@/lib/middleware/rateLimit'
import { ERROR_CODES } from '@/lib/constants/errors'
import { DIVISION } from '@/lib/enums'
import type { PlanType } from '@/lib/enums'
import type { AssetApiResponse } from '@/types/market'

// Schema de validação de query params
const querySchema = z.object({
  division: z.enum([DIVISION.SERIE_A, DIVISION.SERIE_B]).optional(),
  sort: z.enum(['price', 'change', 'volume']).optional(),
  search: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(40).default(20),
})

async function handler(req: NextRequest, { user }: AuthContext) {
  const url = new URL(req.url)
  const params = Object.fromEntries(url.searchParams)
  const parsed = querySchema.safeParse(params)

  if (!parsed.success) {
    const firstError = parsed.error.errors[0]
    const field = firstError?.path[0]
    return Response.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.VAL_002,
          message: `Formato inválido para o campo ${field ?? 'desconhecido'}.`,
        },
      },
      { status: 400 }
    )
  }

  const { division, sort, search, page, limit } = parsed.data
  const planType = user.planType as PlanType

  // Rate limiting: 60 req/min por userId
  const rl = await checkRateLimit(`ratelimit:assets:${user.id}`, 60, 60)
  if (!rl.allowed) {
    return Response.json(
      {
        success: false,
        error: { code: 'RATE_001', message: 'Muitas requisições. Tente novamente em 1 minuto.' },
      },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  try {
    const result = await marketAssetRepository.findAll(
      { division, sort, search },
      { page, limit }
    )

    const delayedAssets = await applyDelayBatch(result.data, planType)
    const delaySeconds = getDelaySeconds(planType)
    const cacheHint = getCacheHint(planType)

    const body: AssetApiResponse = {
      data: delayedAssets,
      total: result.total,
      page,
      limit,
      _delaySeconds: delaySeconds,
      _cacheHint: cacheHint,
    }

    return Response.json(body, {
      headers: {
        'Cache-Control': cacheHint,
        'X-Plan-Type': planType,
      },
    })
  } catch (err) {
    // Prisma connection errors
    if (
      err instanceof Error &&
      (err.constructor.name === 'PrismaClientInitializationError' ||
        err.constructor.name === 'PrismaClientKnownRequestError' ||
        err.constructor.name === 'PrismaClientRustPanicError')
    ) {
      if (err.constructor.name === 'PrismaClientRustPanicError') {
        console.error('[assets] Prisma engine panic:', err)
      }
      return Response.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.SYS_002,
            message: 'Serviço temporariamente indisponível. Tente novamente em alguns instantes.',
          },
        },
        { status: 503 }
      )
    }

    console.error('[assets] Unexpected error:', err instanceof Error ? err.message : err)
    return Response.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.SYS_001,
          message: 'Ocorreu um erro interno. Por favor, tente novamente em instantes.',
        },
      },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handler as never)
