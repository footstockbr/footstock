// ============================================================================
// Foot Stock — Marcar notificação como lida (EP026)
// PATCH /api/v1/notifications/:id/read
// IDOR check: a notificação deve pertencer ao usuário autenticado
// Idempotente: retorna 200 mesmo se já estava lida
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

function extractId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  // /api/v1/notifications/{id}/read → id está em segments[-2]
  return segments[segments.length - 2] ?? ''
}

async function readHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const id = extractId(req)

  if (!id) {
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.VAL_001, message: ERROR_MESSAGES['VAL-001'] } },
      { status: 400 },
    )
  }

  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { id: true, userId: true, isRead: true },
  })

  // 404 para não encontrado OU pertence a outro usuário (previne IDOR)
  if (!notification || notification.userId !== user.id) {
    return NextResponse.json(
      { success: false, error: { code: 'NOTIF-080', message: 'Notificação não encontrada.' } },
      { status: 404 },
    )
  }

  // Idempotente: se já lida, retorna sem update
  if (notification.isRead) {
    return NextResponse.json({ success: true, data: { id, isRead: true } })
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
    select: { id: true, isRead: true },
  })

  return NextResponse.json({ success: true, data: updated })
}

export const PATCH = withAuth(readHandler)
