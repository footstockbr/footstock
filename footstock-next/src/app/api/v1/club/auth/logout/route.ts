// ============================================================================
// Foot Stock — POST /api/v1/club/auth/logout
// Logout do portal de clubes parceiros. Invalida sessão Supabase.
// Rastreabilidade: TASK-015 sub-item 2
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { getClubContext } from '@/lib/auth/club-auth'

export async function POST(request: NextRequest) {
  // Registrar logout no log (antes de destruir a sessão)
  try {
    const ctx = await getClubContext()
    if (ctx) {
      const clubUser = await prisma.clubUser.findFirst({
        where: { clubTicker: ctx.clubId, isActive: true },
        select: { id: true },
      })
      if (clubUser) {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null
        await prisma.clubAccessLog.create({
          data: {
            clubUserId: clubUser.id,
            action: 'LOGOUT',
            ipAddress: ip,
            userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
          },
        })
      }
    }
  } catch {
    // Log falhou — não bloqueia logout
  }

  // Invalidar sessão Supabase
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
          } catch { /* ignora */ }
        },
      },
    }
  )

  await supabase.auth.signOut()

  // Limpar cookies de sessão do portal do clube (incluindo dev HttpOnly cookies)
  const res = NextResponse.json({ success: true, message: 'Sessão encerrada com sucesso.' })
  res.cookies.set('fs_dev_auth', '', { path: '/', maxAge: 0, httpOnly: true })
  res.cookies.set('fs_dev_club_id', '', { path: '/', maxAge: 0, httpOnly: true })
  res.cookies.set('fs-admin-role', '', { path: '/', maxAge: 0 })
  return res
}
