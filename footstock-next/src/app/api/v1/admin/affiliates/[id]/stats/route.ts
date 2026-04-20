// T-15: GET /api/v1/admin/affiliates/[id]/stats — estatísticas do afiliado

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

function extractAffiliateId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  // /api/v1/admin/affiliates/{id}/stats
  return segments[segments.length - 2] ?? ''
}

async function statsHandler(req: NextRequest, _context: AuthContext): Promise<NextResponse> {
  const id = extractAffiliateId(req)
  if (!id) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_001', message: 'ID de afiliado inválido' } },
      { status: 400 },
    )
  }

  const affiliate = await prisma.affiliateCode.findUnique({
    where: { id },
    select: { id: true, code: true, user: { select: { id: true, name: true, email: true } } },
  })

  if (!affiliate) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Afiliado não encontrado' } },
      { status: 404 }
    )
  }

  const transactions = await prisma.affiliateTransaction.findMany({
    where: { affiliateCodeId: id },
    orderBy: { createdAt: 'desc' },
  })

  const conversions = transactions.filter(t => t.status === 'PAID' || t.status === 'PROCESSING').length
  const totalCommission = transactions.reduce((sum, t) => sum + t.amount.toNumber(), 0)

  const commissionHistory = transactions.map(t => ({
    id: t.id,
    referredUserId: t.referredUserId,
    amount: t.amount.toNumber(),
    status: t.status,
    transactionType: t.transactionType,
    paidAt: t.paidAt,
    createdAt: t.createdAt,
  }))

  return NextResponse.json({
    success: true,
    data: {
      affiliate: {
        id: affiliate.id,
        code: affiliate.code,
        name: affiliate.user.name,
        email: affiliate.user.email,
      },
      conversions,
      totalCommission,
      commissionHistory,
    },
  })
}

export const GET = withAdmin('financial:read')(statsHandler)
