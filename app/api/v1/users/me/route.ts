// ============================================================================
// Foot Stock — GET/PATCH/DELETE /api/v1/users/me
// Alias de /api/v1/me para compatibilidade com clientes.
// GET/PATCH delegam para a mesma lógica; DELETE executa exclusão de conta (LGPD).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { AuthContext } from '@/app/api/middleware'
import { withAuth } from '@/app/api/middleware'
import { withDataAccessLog } from '@/lib/utils/data-access-logger'
import { prisma } from '@/lib/prisma'
import { updateProfileSchema } from '@/lib/schemas/user.schema'
import { deleteAccount } from '@/lib/services/account-deletion'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import type { UserPublic } from '@/types/models'

// ---------------------------------------------------------------------------
// GET — retorna dados do usuário autenticado
// ---------------------------------------------------------------------------

async function getHandler(_req: NextRequest, { user }: AuthContext) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cpfHash: _cpfHash, ...safeUser } = user as UserPublic & { cpfHash: string }
  return NextResponse.json({ success: true, data: safeUser as UserPublic })
}

// ---------------------------------------------------------------------------
// PATCH — atualiza dados do usuário autenticado
// ---------------------------------------------------------------------------

async function patchHandler(req: NextRequest, { user }: AuthContext) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Body inválido. Envie um JSON válido.' } },
      { status: 400 }
    )
  }

  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    const fieldErrors = parsed.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))
    return NextResponse.json({ success: false, errors: fieldErrors }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: parsed.data,
    select: {
      id: true, name: true, email: true, phone: true, bio: true,
      favoriteClub: true, favoriteClubDisplayName: true,
      investorProfile: true, planType: true, tourCompleted: true,
      ageVerificationPending: true, userType: true, adminRole: true,
      createdAt: true, updatedAt: true,
    },
  })

  return NextResponse.json({ success: true, data: updated })
}

// ---------------------------------------------------------------------------
// DELETE — exclusão de conta (LGPD Art. 18)
// ---------------------------------------------------------------------------

async function deleteHandler(req: NextRequest, { user }: AuthContext) {
  // Bloquear exclusão se houver assinatura ativa
  const activeSub = await prisma.subscription.findFirst({
    where: { userId: user.id },
  })
  if (activeSub && activeSub.status !== 'CANCELLED' && activeSub.status !== 'EXPIRED') {
    return NextResponse.json(
      { success: false, error: { code: 'SUB_ACTIVE', message: 'Cancele sua assinatura antes de excluir a conta.' } },
      { status: 409 }
    )
  }

  let reason = 'NOT_SPECIFIED'
  try {
    const body = await req.json()
    if (body?.reason) reason = String(body.reason)
  } catch {
    // body opcional
  }

  try {
    const result = await deleteAccount(user.id, reason)
    return NextResponse.json({ success: true, data: { message: result.message, anonymizedAt: result.anonymizedAt } })
  } catch {
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
      { status: 500 }
    )
  }
}

export const GET = withDataAccessLog(getHandler as never, 'profile')
export const PATCH = withDataAccessLog(patchHandler as never, 'profile_update')
export const DELETE = withAuth(deleteHandler)
