// ============================================================================
// Foot Stock — GET /api/v1/affiliate/me
// Métricas do influenciador afiliado: link, conversões, comissões acumuladas.
// IDOR prevention: userId SEMPRE da sessão, nunca de query param.
// Rastreabilidade: INT-084, US-036, TASK-3/ST002
// ============================================================================

import { NextResponse } from 'next/server'
import { getAffiliateContext } from '@/lib/auth/affiliate-auth'
import { prisma } from '@/lib/prisma'
import { PAYMENT_STATUS } from '@/lib/enums'
import type { AffiliateConversion, AffiliateMetrics } from '@/types/club'

const BASE_REFERRAL_URL = 'footstock.app/ref'

const PAGE_SIZE = 20

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const ctx = await getAffiliateContext()
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: { code: 'AFFILIATE_001', message: 'Sem código de afiliado ativo.' } },
      { status: 403 }
    )
  }

  try {
    // Contagens agregadas (sem paginação)
    const [allTransactions, totalCount] = await Promise.all([
      prisma.affiliateTransaction.findMany({
        where: { affiliateCodeId: ctx.affiliateCodeId },
        select: { transactionType: true, status: true, amount: true },
      }),
      prisma.affiliateTransaction.count({
        where: { affiliateCodeId: ctx.affiliateCodeId },
      }),
    ])

    const totalSignups = allTransactions.filter(
      (t) => t.transactionType === 'SIGNUP'
    ).length

    const paidConversions = allTransactions.filter(
      (t) => t.transactionType === 'CONVERSION' && t.status === PAYMENT_STATUS.PAID
    ).length

    const totalCommissionFS = allTransactions
      .filter((t) => t.status === PAYMENT_STATUS.PAID)
      .reduce((acc, t) => acc + Number(t.amount), 0)

    // Conversões paginadas
    const paginatedTransactions = await prisma.affiliateTransaction.findMany({
      where: { affiliateCodeId: ctx.affiliateCodeId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        transactionType: true,
        amount: true,
        status: true,
        createdAt: true,
        referredUser: {
          select: {
            planType: true,
          },
        },
      },
    })

    const conversions: AffiliateConversion[] = paginatedTransactions.map((t) => ({
      date: t.createdAt.toISOString(),
      planType: (t.referredUser?.planType ?? 'JOGADOR') as AffiliateConversion['planType'],
      commissionFS: Number(t.amount),
      status: t.status as AffiliateConversion['status'],
    }))

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)

    const metrics: AffiliateMetrics = {
      affiliateCode: ctx.code,
      referralLink: `${BASE_REFERRAL_URL}/${ctx.code.toLowerCase()}`,
      totalSignups,
      paidConversions,
      totalCommissionFS,
      commissionPct: ctx.commissionPercentage,
      conversions,
    }

    return NextResponse.json({
      success: true,
      data: metrics,
      pagination: { page, pageSize: PAGE_SIZE, totalCount, totalPages, hasNextPage: page < totalPages },
    })
  } catch (err) {
    console.error('[affiliate/me] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}
