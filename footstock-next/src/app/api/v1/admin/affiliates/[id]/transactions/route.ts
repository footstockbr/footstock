// ============================================================================
// Foot Stock — GET /api/v1/admin/affiliates/:id/transactions
// Histórico de comissões de um afiliado.
// RESOLVED: G002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

function getAffiliateId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/')
  // path: /api/v1/admin/affiliates/{id}/transactions → index -2
  return parts[parts.length - 2] ?? ''
}

export const GET = withAdmin('financial:read')(async (request: NextRequest) => {
  const affiliateId = getAffiliateId(request)
  const sp = request.nextUrl.searchParams
  const status = sp.get('status') ?? undefined

  const affiliate = await prisma.affiliateCode.findUnique({
    where: { id: affiliateId },
    select: { id: true, code: true },
  })
  if (!affiliate) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Afiliado não encontrado' } }, { status: 404 })
  }

  const transactions = await prisma.affiliateTransaction.findMany({
    where: {
      affiliateCodeId: affiliateId,
      ...(status ? { status: status as 'PENDING' | 'PAID' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id:           true,
      transactionType: true,
      amount:       true,
      status:       true,
      paidAt:       true,
      createdAt:    true,
      referredUser: { select: { name: true, email: true } },
    },
  })

  return NextResponse.json({
    data: transactions.map(t => ({
      id:              t.id,
      transactionType: t.transactionType,
      amount:          Number(t.amount),
      status:          t.status,
      paidAt:          t.paidAt,
      createdAt:       t.createdAt,
      referredUserName:  t.referredUser.name,
      referredUserEmail: t.referredUser.email,
    })),
  })
})
