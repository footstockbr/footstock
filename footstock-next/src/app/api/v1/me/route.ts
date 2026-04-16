// ============================================================================
// FootStock — GET /api/v1/me  PATCH /api/v1/me
// Retorna e atualiza dados do usuário autenticado.
// withDataAccessLog registra acesso a PII (LGPD Art. 37)
// RESOLVED: mass assignment — PATCH usa allowlist via updateProfileSchema
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { AuthContext } from '@/app/api/middleware'
import { withDataAccessLog } from '@/lib/utils/data-access-logger'
import { prisma } from '@/lib/prisma'
import { updateProfileSchema } from '@/lib/schemas/user.schema'
import type { UserPublic } from '@/types/models'

async function getHandler(_req: NextRequest, { user }: AuthContext) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cpfHash: _cpfHash, ...safeUser } = user as UserPublic & { cpfHash: string }
  return NextResponse.json({ success: true, data: safeUser as UserPublic })
}

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
    const errors = parsed.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))
    return NextResponse.json({ success: false, errors }, { status: 400 })
  }

  // Apenas campos presentes no body são atualizados (undefined = ignorado pelo Prisma)
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

export const GET = withDataAccessLog(getHandler as never, 'profile')
export const PATCH = withDataAccessLog(patchHandler as never, 'profile_update')
