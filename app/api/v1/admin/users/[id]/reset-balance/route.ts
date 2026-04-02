// ============================================================================
// Foot Stock — Admin: Reset de saldo FS$ de usuário
// POST /api/v1/admin/users/[id]/reset-balance
// Zera o saldo fsBalance e registra a ação no audit log.
// Recurso: financial:write — restrito a SUPER_ADMIN e ADMINISTRADOR
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { adminAuditService } from '@/lib/services/shared'

function extractUserId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  // /api/v1/admin/users/{id}/reset-balance
  return segments[segments.length - 2] ?? ''
}

async function postHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const targetId = extractUserId(req)
  if (!targetId) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_001', message: 'ID de usuário inválido' } },
      { status: 400 },
    )
  }

  if (targetId === user.id) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_003', message: 'Não é possível resetar o próprio saldo via painel admin' } },
      { status: 403 },
    )
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, adminRole: true, fsBalance: true },
  })

  if (!target) {
    return NextResponse.json(
      { success: false, error: { code: 'USR_001', message: 'Usuário não encontrado' } },
      { status: 404 },
    )
  }

  if (target.adminRole) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_004', message: 'Não é possível resetar saldo de contas administrativas' } },
      { status: 403 },
    )
  }

  const previousBalance = Number(target.fsBalance)

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { fsBalance: 0, marginBlocked: 0 },
    select: { id: true, fsBalance: true, marginBlocked: true },
  })

  await adminAuditService.log({
    adminId: user.id,
    action: 'USER_BALANCE_RESET',
    details: {
      targetUserId: targetId,
      targetName: target.name,
      previousBalance,
      newBalance: 0,
    },
  })

  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      fsBalance: Number(updated.fsBalance),
      marginBlocked: Number(updated.marginBlocked),
    },
  })
}

export const POST = withAdmin('financial:write')(postHandler)
