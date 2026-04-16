// ============================================================================
// FootStock — Admin: Banimento permanente de usuário
// POST /api/v1/admin/users/[id]/ban   → bane o usuário
// DELETE /api/v1/admin/users/[id]/ban → remove o banimento
// Recurso: users:suspend — disponível para SUPER_ADMIN e ADMINISTRADOR
// Diferença de SUSPENDED: banimento é permanente, sem data de expiração
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { adminAuditService } from '@/lib/services/shared'
import { USER_STATUS } from '@/lib/enums'

const banSchema = z.object({
  reason: z.string().min(1).max(500),
})

function extractUserId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  // /api/v1/admin/users/{id}/ban
  return segments[segments.length - 2] ?? ''
}

// POST — banir usuário
async function banHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const targetId = extractUserId(req)
  if (!targetId) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_001', message: 'ID de usuário inválido' } },
      { status: 400 },
    )
  }

  let body: unknown
  try { body = await req.json() } catch { body = {} }

  const parsed = banSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_002', message: 'Motivo do banimento é obrigatório' } },
      { status: 422 },
    )
  }

  if (targetId === user.id) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_003', message: 'Não é possível banir a própria conta' } },
      { status: 403 },
    )
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, adminRole: true, status: true },
  })

  if (!target) {
    return NextResponse.json(
      { success: false, error: { code: 'USR_001', message: 'Usuário não encontrado' } },
      { status: 404 },
    )
  }

  if (target.adminRole) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_004', message: 'Não é possível banir contas administrativas' } },
      { status: 403 },
    )
  }

  if (target.status === USER_STATUS.BANNED) {
    return NextResponse.json(
      { success: false, error: { code: 'USR_002', message: 'Usuário já está banido' } },
      { status: 409 },
    )
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { status: USER_STATUS.BANNED },
    select: { id: true, status: true },
  })

  await adminAuditService.log({
    adminId: user.id,
    action: 'USER_BANNED',
    details: { targetUserId: targetId, targetName: target.name, reason: parsed.data.reason },
  })

  return NextResponse.json({ success: true, data: updated })
}

// DELETE — remover banimento
async function unbanHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const targetId = extractUserId(req)
  if (!targetId) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_001', message: 'ID de usuário inválido' } },
      { status: 400 },
    )
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, status: true },
  })

  if (!target) {
    return NextResponse.json(
      { success: false, error: { code: 'USR_001', message: 'Usuário não encontrado' } },
      { status: 404 },
    )
  }

  if (target.status !== USER_STATUS.BANNED) {
    return NextResponse.json(
      { success: false, error: { code: 'USR_003', message: 'Usuário não está banido' } },
      { status: 409 },
    )
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { status: USER_STATUS.ACTIVE },
    select: { id: true, status: true },
  })

  await adminAuditService.log({
    adminId: user.id,
    action: 'USER_UNBANNED',
    details: { targetUserId: targetId, targetName: target.name },
  })

  return NextResponse.json({ success: true, data: updated })
}

export const POST = withAdmin('users:suspend')(banHandler)
export const DELETE = withAdmin('users:suspend')(unbanHandler)
