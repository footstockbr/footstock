// ============================================================================
// Foot Stock — POST /api/v1/admin/session/activity
// Renova TTL de inatividade no Redis para o admin autenticado.
// Rastreabilidade: INT-087, TASK-1/ST006
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { adminSessionService } from '@/lib/admin/AdminSessionService'

export async function POST(request: NextRequest) {
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
      process.env.NODE_ENV !== 'production' ? request.cookies.get('fs_dev_auth')?.value : null
    const devAdminRole =
      process.env.NODE_ENV !== 'production' ? request.cookies.get('fs-admin-role')?.value : null

    let dbUser = user
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

    // Dev mode: fallback to fs-admin-role cookie if no Supabase user
    if (!dbUser && devAdminRole) {
      dbUser = { id: 'dev-user', adminRole: devAdminRole }
    }

    if (!dbUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!dbUser.adminRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await adminSessionService.storeActivityTimestamp(dbUser.id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
