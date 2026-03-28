import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'
import type { PlanType, AdminRole } from '@/types'

// GET /api/v1/admin/users — MONITOR+
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return errors.forbidden()
  }

  const { searchParams } = request.nextUrl
  const planType = searchParams.get('planType') as PlanType | null
  const adminRole = searchParams.get('adminRole') as AdminRole | null
  const search = searchParams.get('search')
  const { page, limit, skip } = parsePagination(searchParams)

  try {
    // Registrar acesso de dados sensíveis
    await prisma.dataAccessLog.create({
      data: {
        userId: auth.user.id,
        accessedBy: auth.user.id,
        action: 'ADMIN_LIST_USERS',
        details: { filters: { planType, adminRole, search } },
      },
    })

    const where = {
      ...(planType && { planType }),
      ...(adminRole && { adminRole }),
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
      }),
      prisma.user.count({ where }),
    ])

    return list(users.map(serializeUser), buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}
