import { headers, cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { hasPlanAccess } from '@/lib/auth/planAccess'
import type { PlanType } from '@/lib/enums'
import type { User } from '@/types/models'

export async function getAuthUser(): Promise<{ user: User } | null> {
  const headerStore = await headers()
  const cookieStore = await cookies()

  const authHeader =
    headerStore.get('authorization') ?? headerStore.get('Authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const {
    data: { user: sessionUser },
  } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser()

  if (!sessionUser) {
    if (process.env.NODE_ENV !== 'production') {
      const devAuthEmail = cookieStore.get('fs_dev_auth')?.value
      if (devAuthEmail) {
        const devUser = await prisma.user.findUnique({ where: { email: devAuthEmail } })
        if (devUser) return { user: devUser as unknown as User }
      }
    }
    return null
  }

  const dbUser = await prisma.user.findUnique({ where: { id: sessionUser.id } })
  if (!dbUser) return null

  return { user: dbUser as unknown as User }
}

export function hasPlan(userPlan: PlanType | null | undefined, requiredPlan: PlanType): boolean {
  return hasPlanAccess(userPlan, requiredPlan)
}
