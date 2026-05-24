// ============================================================================
// FootStock — POST /api/v1/club/auth/logout
// Logout do portal de clubes parceiros. Invalida sessão Auth.js.
// Rastreabilidade: TASK-015 sub-item 2
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClubContext } from '@/lib/auth/club-auth'
import { clearDualCookies } from '@/lib/auth'

const AUTHJS_SESSION_COOKIES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
]

export async function POST(request: NextRequest) {
  let userId: string | null = null

  // Registrar logout no log (antes de destruir a sessão)
  try {
    const ctx = await getClubContext()
    if (ctx) {
      userId = ctx.userId
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

  // Revogar Session rows do Auth.js no banco (session strategy 'database')
  if (userId) {
    try {
      await prisma.session.deleteMany({ where: { userId } })
    } catch { /* não bloqueia logout */ }
  }

  // Limpar cookies Auth.js + Supabase legados
  await clearDualCookies()

  // Limpar cookies de sessão do portal do clube (incluindo dev HttpOnly cookies)
  const res = NextResponse.json({ success: true, message: 'Sessão encerrada com sucesso.' })
  for (const name of AUTHJS_SESSION_COOKIES) {
    res.cookies.set(name, '', { path: '/', maxAge: 0, httpOnly: true })
  }
  res.cookies.set('fs_dev_auth', '', { path: '/', maxAge: 0, httpOnly: true })
  res.cookies.set('fs_dev_club_id', '', { path: '/', maxAge: 0, httpOnly: true })
  res.cookies.set('fs-admin-role', '', { path: '/', maxAge: 0 })
  return res
}
