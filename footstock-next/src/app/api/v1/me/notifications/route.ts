// ============================================================================
// FootStock — GET /api/v1/me/notifications
// Lista notificações do usuário autenticado com suporte a:
//   ?unread=true      → filtra apenas não lidas
//   ?count=true       → retorna apenas contagem (sem payload completo)
//   ?page=N&limit=N   → paginação (default: page=1, limit=20, max=50)
// PATCH /api/v1/me/notifications — marca todas como lidas
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { ERROR_CODES } from '@/lib/constants/errors'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

async function getHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const unreadOnly = searchParams.get('unread') === 'true'
  const countOnly = searchParams.get('count') === 'true'

  const where = {
    userId: user.id,
    ...(unreadOnly ? { isRead: false } : {}),
  }

  try {
    if (countOnly) {
      const count = await prisma.notification.count({ where })
      return NextResponse.json({ success: true, data: { count } })
    }

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)))
    const skip = (page - 1) * limit

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          data: true,
          isRead: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount: unreadOnly ? total : undefined,
      },
    })
  } catch (err) {
    console.error('[notifications:get] Erro:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_002, message: 'Erro ao carregar notificações.' } },
      { status: 503 }
    )
  }
}

async function patchHandler(_req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    })
    return NextResponse.json({ success: true, data: { marked: count } })
  } catch (err) {
    console.error('[notifications:patch] Erro:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_002, message: 'Erro ao atualizar notificações.' } },
      { status: 503 }
    )
  }
}

export const GET = withAuth(getHandler)
export const PATCH = withAuth(patchHandler)
