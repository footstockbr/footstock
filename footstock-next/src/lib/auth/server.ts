import { headers, cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { hasPlanAccess } from '@/lib/auth/planAccess'
import { readAuthjsSession, decodeAuthjsToken } from '@/lib/auth/authjs-session'
import type { PlanType } from '@/lib/enums'
import type { User } from '@/types/models'

export async function getAuthUser(): Promise<{ user: User } | null> {
  const headerStore = await headers()
  const cookieStore = await cookies()

  const authHeader =
    headerStore.get('authorization') ?? headerStore.get('Authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  // Bearer token (clientes nativos): JWE Auth.js emitido por /api/v1/auth/login.
  if (bearer) {
    const payload = await decodeAuthjsToken(bearer)
    if (payload?.id) {
      const dbUser = await prisma.user.findUnique({ where: { id: payload.id } })
      if (dbUser) return { user: dbUser as unknown as User }
    }
    return null
  }

  // Cookie de sessão Auth.js v5 (`__Secure-authjs.session-token`).
  const authjs = await readAuthjsSession()
  if (authjs?.id) {
    const dbUser = await prisma.user.findUnique({ where: { id: authjs.id } })
    if (dbUser) return { user: dbUser as unknown as User }
  }

  // DEV local fallback: cookie HttpOnly fs_dev_auth.
  if (process.env.NODE_ENV !== 'production') {
    const devAuthEmail = cookieStore.get('fs_dev_auth')?.value
    if (devAuthEmail) {
      const devUser = await prisma.user.findUnique({ where: { email: devAuthEmail } })
      if (devUser) return { user: devUser as unknown as User }
    }
  }

  return null
}

export function hasPlan(userPlan: PlanType | null | undefined, requiredPlan: PlanType): boolean {
  return hasPlanAccess(userPlan, requiredPlan)
}
