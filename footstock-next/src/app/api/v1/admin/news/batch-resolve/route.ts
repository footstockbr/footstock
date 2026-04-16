// FootStock — POST /api/v1/admin/news/batch-resolve
// Re-resolve o ticker de todas as noticias que estao sem ticker (null ou vazio).
// Usa resolveTickerFromText (realName + coachName + aliases).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveTickerFromText } from '@/lib/utils/resolve-ticker'
import type { User, AdminRole } from '@/types'

const VALID_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMINISTRADOR']

function devAuthFallback(request: NextRequest): { user: User; supabaseId: string } | null {
  if (process.env.NODE_ENV !== 'development') return null
  const adminRole = request.cookies.get('fs-admin-role')?.value
  if (!adminRole || !VALID_ADMIN_ROLES.includes(adminRole)) return null
  return {
    user: {
      id: 'dev-user', email: 'dev@foot-stock.test', name: 'Dev User',
      phone: null, birthDate: '', favoriteClub: '', favoriteClubDisplayName: null,
      userType: 'NORMAL', investorProfile: 'INICIANTE', planType: 'JOGADOR',
      fsBalance: 0, marginBlocked: 0, tourCompleted: false, ageVerificationPending: false,
      adminRole: adminRole as AdminRole, version: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    supabaseId: 'dev-user',
  }
}

export async function POST(request: NextRequest) {
  let auth = await getAuthUser()
  if (!auth) auth = devAuthFallback(request)

  if (!auth) return NextResponse.json({ error: { message: 'Nao autorizado' } }, { status: 401 })
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json({ error: { message: 'Apenas SUPER_ADMIN' } }, { status: 403 })
  }

  const unlinked = await prisma.news.findMany({
    where: { OR: [{ ticker: null }, { ticker: '' }] },
    select: { id: true, title: true, content: true },
    take: 500,
  })

  let resolved = 0
  for (const news of unlinked) {
    const ticker = await resolveTickerFromText(`${news.title} ${news.content}`)
    if (ticker) {
      await prisma.news.update({
        where: { id: news.id },
        data: { ticker },
      })
      resolved++
    }
  }

  return NextResponse.json({
    data: { total: unlinked.length, resolved, remaining: unlinked.length - resolved },
  })
}
