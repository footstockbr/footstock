import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

/** GET /api/v1/users/me/consents — listar consentimentos do usuário */
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const consents = await prisma.consent.findMany({
      where: { userId: auth.user.id },
      select: {
        id: true,
        purpose: true,
        grantedAt: true,
        revoked: true,
        revokedAt: true,
      },
      orderBy: { grantedAt: 'asc' },
    })

    return ok(
      consents.map((c) => ({
        ...c,
        grantedAt: c.grantedAt.toISOString(),
        revokedAt: c.revokedAt?.toISOString() ?? null,
      }))
    )
  } catch {
    return errors.server()
  }
}
