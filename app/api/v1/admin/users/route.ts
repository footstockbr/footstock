// ============================================================================
// Foot Stock — Admin: Listagem de usuários regulares (jogadores)
// GET /api/v1/admin/users?page=1&limit=20&search=...&planType=...&status=...
// Recurso: users:read — disponível para SUPER_ADMIN, ADMINISTRADOR, MODERADOR
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import type { AuthContext } from '@/app/api/middleware'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  planType: z.enum(['JOGADOR', 'CRAQUE', 'LENDA']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']).optional(),
})

async function getHandler(req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_001', message: 'Parâmetros inválidos' } },
      { status: 422 },
    )
  }

  const { page, limit, search, planType, status } = parsed.data
  const skip = (page - 1) * limit

  const where = {
    adminRole: null,
    ...(planType ? { planType } : {}),
    ...(status ? { status } : {}),
    ...(search?.trim()
      ? {
          OR: [
            { name: { contains: search.trim(), mode: 'insensitive' as const } },
            { email: { contains: search.trim(), mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        planType: true,
        fsBalance: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ])

  return NextResponse.json({
    success: true,
    data: users.map((u) => ({
      ...u,
      fsBalance: Number(u.fsBalance),
      createdAt: u.createdAt.toISOString(),
    })),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  })
}

export const GET = withAdmin('users:read')(getHandler)
