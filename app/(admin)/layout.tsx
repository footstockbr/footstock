// ============================================================================
// Foot Stock — Admin Layout (Server Component)
// Verifica sessão admin e renderiza layout com sidebar + timeout 30min.
// Rastreabilidade: INT-085, INT-087, TASK-1/ST005
// ============================================================================

import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminLayoutClient } from './AdminLayoutClient'
import type { AdminRole } from '@/lib/enums'
import type { Metadata } from 'next'
import { ROUTES } from '@/lib/constants'

export const metadata: Metadata = {
  title: { default: 'Admin | Foot Stock', template: '%s | Admin Foot Stock' },
  robots: 'noindex, nofollow',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Página de login admin está dentro deste grupo — pular auth guard para evitar redirect loop.
  // O middleware injeta x-pathname para que possamos detectar isso aqui.
  const headersList = await headers()
  if (headersList.get('x-pathname') === '/admin/login') {
    return <>{children}</>
  }

  // ---------- Verificar sessão via Supabase (Server Component) ----------
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — ignora set
          }
        },
      },
    }
  )

  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser()

  // DEV fallback: permite sessão via cookie fs_dev_auth para usuários de teste admin.
  const devAuthEmail =
    process.env.NODE_ENV !== 'production' ? cookieStore.get('fs_dev_auth')?.value : null

  const dbUser = supabaseUser
    ? await prisma.user.findUnique({
        where: { id: supabaseUser.id },
        select: { id: true, adminRole: true, name: true, email: true },
      })
    : devAuthEmail
    ? await prisma.user.findUnique({
        where: { email: devAuthEmail },
        select: { id: true, adminRole: true, name: true, email: true },
      })
    : null

  if (!dbUser?.adminRole) {
    redirect(ROUTES.ADMIN_LOGIN)
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100 md:flex-row">
      <AdminSidebar adminRole={dbUser.adminRole as AdminRole} />
      <AdminLayoutClient userId={dbUser.id}>
        <main className="flex-1 overflow-auto p-4 pb-[calc(56px+env(safe-area-inset-bottom))] md:p-6">{children}</main>
      </AdminLayoutClient>
    </div>
  )
}
