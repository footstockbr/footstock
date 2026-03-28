import { type NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, error, errors } from '@/lib/api'

/** Finalidades que podem ser revogadas pelo usuário */
const REVOCABLE_PURPOSES = ['MARKETING', 'ANALYTICS', 'THIRD_PARTY'] as const

/** Finalidades obrigatórias para uso do serviço */
const REQUIRED_PURPOSES = ['TERMS', 'PRIVACY'] as const

type RevocablePurpose = (typeof REVOCABLE_PURPOSES)[number]
type RequiredPurpose = (typeof REQUIRED_PURPOSES)[number]

/** POST /api/v1/users/me/consents/[purpose]/revoke — revogar consentimento */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ purpose: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { purpose } = await params

  // Não permitir revogar consentimentos obrigatórios
  if (REQUIRED_PURPOSES.includes(purpose as RequiredPurpose)) {
    return error(
      'LGPD_002',
      'Este consentimento é obrigatório para o uso do serviço e não pode ser revogado.',
      400
    )
  }

  // Validar purpose
  if (!REVOCABLE_PURPOSES.includes(purpose as RevocablePurpose)) {
    return error('LGPD_001', 'Finalidade de consentimento inválida.', 400)
  }

  try {
    await prisma.consent.updateMany({
      where: { userId: auth.user.id, purpose },
      data: { revoked: true, revokedAt: new Date() },
    })

    return ok({ revoked: true, purpose })
  } catch {
    return errors.server()
  }
}
