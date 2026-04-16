import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'
import type { PlanType, AdminRole, User } from '@/types'

// GET /api/v1/admin/users — MONITOR+
// Suporta filtros: search, planType, adminRole, status (active/suspended), userType, page
export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  // Dev mode fallback: accept fs-admin-role cookie
  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser = { id: 'dev-user', email: 'dev@foot-stock.test', name: 'Dev User', adminRole: adminRole as AdminRole } as unknown as User
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return errors.forbidden()
  }

  const searchParams = request.nextUrl.searchParams
  const planType = searchParams.get('planType') as PlanType | null
  const adminRole = searchParams.get('adminRole') as AdminRole | null
  const userType = searchParams.get('userType')
  const hasAdmin = searchParams.get('hasAdmin') // 'true' = only users with any adminRole
  const status = searchParams.get('status') // 'active' | 'suspended'
  const search = searchParams.get('search')
  const { page, limit, skip } = parsePagination(searchParams)

  try {
    // Log de acesso (não falha se houver erro)
    try {
      await prisma.dataAccessLog.create({
        data: {
          userId: auth.user.id,
          accessedBy: auth.user.id,
          dataType: 'admin_view',
          endpoint: '/api/v1/admin/users',
          reason: 'ADMIN_LIST_USERS',
        },
      })
    } catch (logError) {
      console.error('Failed to log data access:', logError)
    }

    // Build adminRole filter: explicit role > hasAdmin (excludes CLUB_PARTNER)
    const adminRoleFilter = adminRole
      ? { adminRole: adminRole as string }
      : hasAdmin === 'true'
        ? { adminRole: { in: ['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR'] as string[] } }
        : {}

    const where = {
      ...(planType && { planType }),
      ...adminRoleFilter,
      ...(userType && { userType }),
      ...(status === 'suspended' && { suspendedAt: { not: null } }),
      ...(status === 'active' && { suspendedAt: null }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          affiliateCode: {
            select: { code: true, affiliateType: true, commissionPercentage: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    const serialized = users.map((u) => ({
      ...serializeUser(u),
      status: u.suspendedAt ? 'suspended' : 'active',
      suspendedAt: u.suspendedAt?.toISOString() ?? null,
      suspensionReason: u.suspensionReason ?? null,
      affiliateCode: u.affiliateCode ?? null,
    }))

    return list(serialized, buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}
