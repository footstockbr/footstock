import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'

// GET /api/v1/users/me/export?format=json|csv — Portabilidade LGPD
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const format = request.nextUrl.searchParams.get('format') ?? 'json'

  try {
    // TODO: Implementar via /auto-flow execute
    const [user, orders, positions, transactions] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.user.id } }),
      prisma.order.findMany({ where: { userId: auth.user.id } }),
      prisma.position.findMany({ where: { userId: auth.user.id } }),
      prisma.transaction.findMany({ where: { userId: auth.user.id } }),
    ])

    const exportData = { profile: user, orders, positions, transactions }

    if (format === 'csv') {
      // TODO: Implementar conversão para CSV via /auto-flow execute
      return new NextResponse('exportação em CSV em desenvolvimento', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="foot-stock-dados.csv"',
        },
      })
    }

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="foot-stock-dados.json"',
      },
    })
  } catch {
    return errors.server()
  }
}
