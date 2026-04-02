import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { canAccess, type AdminResource } from '@/lib/auth/canAccess'

/**
 * Garante acesso server-side ao recurso admin informado.
 * Redireciona para /admin/login sem sessão admin e para /admin sem permissão.
 */
export async function requireAdminResource(resource: AdminResource): Promise<void> {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // No-op em server render.
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const devAuthEmail =
    process.env.NODE_ENV !== 'production' ? cookieStore.get('fs_dev_auth')?.value : null

  const dbUser = user
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { adminRole: true },
      })
    : devAuthEmail
    ? await prisma.user.findUnique({
        where: { email: devAuthEmail },
        select: { adminRole: true },
      })
    : null

  if (!dbUser?.adminRole) {
    redirect('/admin/login')
  }

  if (!canAccess(dbUser.adminRole, resource)) {
    redirect('/admin')
  }
}

