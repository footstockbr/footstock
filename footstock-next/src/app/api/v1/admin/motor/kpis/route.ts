import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

// GET /api/v1/admin/motor/kpis
// Retorna: circuitBreakers (ativos halted) + aggregatePnl (soma P&L aberto)
export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser: User = {
        id: 'dev-user',
        email: 'dev@foot-stock.test',
        name: 'Dev User',
        phone: null,
        birthDate: '',
        favoriteClub: '',
        favoriteClubDisplayName: null,
        userType: 'NORMAL',
        investorProfile: 'INICIANTE',
        planType: 'JOGADOR',
        fsBalance: 0,
        marginBlocked: 0,
        tourCompleted: false,
        ageVerificationPending: false,
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const [circuitBreakers, pnlResult] = await Promise.all([
      // Ativos com halt ativo no banco
      prisma.asset.count({ where: { isHalted: true } }),

      // P&L agregado de todas as posições OPEN
      // P&L = (currentPrice - avgPrice) * quantity
      prisma.$queryRaw<{ aggregate_pnl: string }[]>`
        SELECT COALESCE(
          SUM((a.current_price - p.avg_price) * p.quantity),
          0
        ) AS aggregate_pnl
        FROM positions p
        JOIN assets a ON a.id = p.asset_id
        WHERE p.status = 'OPEN'
      `,
    ])

    const aggregatePnl = parseFloat(pnlResult[0]?.aggregate_pnl ?? '0')

    return ok({ circuitBreakers, aggregatePnl })
  } catch (error) {
    console.error('[motor/kpis] Error:', error)
    return errors.server()
  }
}
