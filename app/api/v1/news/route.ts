// ============================================================================
// Foot Stock — GET /api/v1/news
// Feed de notícias paginado (20/página), filtro por ticker (via assetId), auth JWT.
// Requer: plano Jogador ou superior.
// Rastreabilidade: INT-046, INT-047
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withPlan } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import type { AuthContext } from '@/app/api/middleware'

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Query params schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  ticker: z.string().min(2).max(4).toUpperCase().optional(),
  page: z.coerce.number().int().min(1).default(1),
})

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function getHandler(req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url)
    const parseResult = querySchema.safeParse({
      ticker: searchParams.get('ticker') ?? undefined,
      page: searchParams.get('page') ?? 1,
    })

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: { code: ERROR_CODES.VAL_003, message: ERROR_MESSAGES['VAL-003'] } },
        { status: 400 }
      )
    }

    const { ticker, page } = parseResult.data

    // Se ticker informado: buscar o assetId correspondente para filtrar
    let assetId: string | undefined
    if (ticker) {
      const asset = await prisma.asset.findUnique({ where: { ticker }, select: { id: true } })
      assetId = asset?.id
      // GAP-010: ticker fornecido mas não encontrado no DB → retornar vazio (não ALL news)
      if (assetId === undefined) {
        return NextResponse.json({
          success: true,
          items: [],
          total: 0,
          page,
          hasNextPage: false,
        })
      }
    }

    // GAP-012: sempre filtrar isPublished: true — não expor rascunhos admin a usuários
    const where = assetId ? { assetIds: { has: assetId }, isPublished: true } : { isPublished: true }

    const [items, total] = await Promise.all([
      prisma.news.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          title: true,
          content: true,
          impact: true,
          sentiment: true,
          assetIds: true,
          source: true,
          isPublished: true,
          publishedAt: true,
        },
      }),
      prisma.news.count({ where }),
    ])

    const response = NextResponse.json({
      success: true,
      items,
      total,
      page,
      hasNextPage: page * PAGE_SIZE < total,
    })

    response.headers.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=60')

    return response
  } catch (err) {
    console.error('[/api/v1/news] Erro interno:', err)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
      { status: 500 }
    )
  }
}

// GAP-009: withPlan('JOGADOR') exigido para acesso ao feed de notícias
export const GET = withPlan('JOGADOR')(getHandler)
