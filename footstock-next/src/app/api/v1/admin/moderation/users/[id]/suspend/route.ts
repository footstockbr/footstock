// ============================================================================
// Foot Stock — POST /api/v1/admin/moderation/users/[id]/suspend
// Suspensão/reativação de usuário via módulo de moderação.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { adminAuditService } from '@/lib/services/shared'

const schema = z.object({
  suspend: z.boolean().default(true),
  reason: z.string().max(255).optional(),
})

function extractUserId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  // /admin/moderation/users/{id}/suspend
  return segments[segments.length - 2] ?? ''
}

async function postHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const targetId = extractUserId(req)
  if (!targetId) {
    return NextResponse.json({ success: false, error: 'ID inválido.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Payload inválido.' }, { status: 422 })
  }

  const { suspend, reason } = parsed.data

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, adminRole: true, status: true },
  })

  if (!target) {
    return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 })
  }

  // Módulo de moderação atua sobre usuários da comunidade, não sobre contas admin.
  if (target.adminRole) {
    return NextResponse.json(
      { success: false, error: 'Não é permitido suspender contas administrativas por este fluxo.' },
      { status: 403 }
    )
  }

  const nextStatus = suspend ? 'SUSPENDED' : 'ACTIVE'
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { status: nextStatus },
    select: { id: true, status: true },
  })

  await adminAuditService.log({
    adminId: user.id,
    action: suspend ? 'USER_SUSPEND' : 'USER_REACTIVATE',
    details: { targetUserId: targetId, reason: reason ?? null },
  })

  return NextResponse.json({ success: true, data: updated })
}

export const POST = withAdmin('users:suspend')(postHandler)

