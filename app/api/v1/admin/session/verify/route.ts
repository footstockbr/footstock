// ============================================================================
// Foot Stock — GET /api/v1/admin/session/verify
// Verifica se sessão atual tem adminRole no banco. Inicializa TTL Redis.
// Rastreabilidade: INT-085, INT-087, TASK-1/ST007
// ============================================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { adminSessionService } from '@/lib/admin/AdminSessionService'

export async function GET() {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch { /* Server Component */ }
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    const devAuthEmail =
      process.env.NODE_ENV !== 'production' ? cookieStore.get('fs_dev_auth')?.value : null

    // adminRole sempre do banco — JWT não confiável para autorização
    const dbUser = user
      ? await prisma.user.findUnique({
          where: { id: user.id },
          select: { id: true, adminRole: true },
        })
      : devAuthEmail
      ? await prisma.user.findUnique({
          where: { email: devAuthEmail },
          select: { id: true, adminRole: true },
        })
      : null

    if (!dbUser?.adminRole) {
      const hasAuthenticatedIdentity = Boolean(user || devAuthEmail)
      return NextResponse.json(
        { error: hasAuthenticatedIdentity ? 'AUTH-005' : 'AUTH-001' },
        { status: hasAuthenticatedIdentity ? 403 : 401 }
      )
    }

    // Inicializa TTL de atividade Redis para a sessão admin
    await adminSessionService.storeActivityTimestamp(dbUser.id)

    return NextResponse.json({ ok: true, adminRole: dbUser.adminRole })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
