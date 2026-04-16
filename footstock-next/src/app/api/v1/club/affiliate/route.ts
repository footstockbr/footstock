// ============================================================================
// FootStock — GET /api/v1/club/affiliate
// Royalties e métricas de afiliado do clube parceiro.
// Rastreabilidade: US-036 [SUCCESS] cenário 1, GAP-003 (auditoria module-25)
// ============================================================================

import { NextResponse } from 'next/server'
import { getClubContext } from '@/lib/auth/club-auth'
import { prisma } from '@/lib/prisma'
import { PAYMENT_STATUS } from '@/lib/enums'

interface RoyaltyEntry {
  id: string
  period: string
  amount: number
  status: 'PENDENTE' | 'PAGO'
}

export async function GET(): Promise<NextResponse> {
  const ctx = await getClubContext()
  if (!ctx) {
    return NextResponse.json(
      { success: false, error: { code: 'ADMIN_050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    // Buscar código de afiliado do clube
    const affiliateCode = await prisma.affiliateCode.findFirst({
      where: {
        OR: [
          { code: ctx.clubId.toLowerCase() },
          { code: `time-${ctx.clubId.toLowerCase()}` },
        ],
        active: true,
      },
      select: { id: true, code: true, commissionPercentage: true },
    })

    if (!affiliateCode) {
      return NextResponse.json({
        success: true,
        data: {
          referralLink: `footstock.app/ref/time/${ctx.clubId.toLowerCase()}`,
          totalRoyalties: 0,
          royalties: [],
          commissionPct: 0,
        },
      })
    }

    // Buscar transações de afiliado (royalties)
    const transactions = await prisma.affiliateTransaction.findMany({
      where: { affiliateCodeId: affiliateCode.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
      },
    })

    const totalRoyalties = transactions
      .filter((t) => t.status === PAYMENT_STATUS.PAID)
      .reduce((acc, t) => acc + Number(t.amount), 0)

    const royalties: RoyaltyEntry[] = transactions.map((t) => ({
      id: t.id,
      period: t.createdAt.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
      amount: Number(t.amount),
      status: t.status === PAYMENT_STATUS.PAID ? 'PAGO' as const : 'PENDENTE' as const,
    }))

    return NextResponse.json({
      success: true,
      data: {
        referralLink: `footstock.app/ref/time/${ctx.clubId.toLowerCase()}`,
        totalRoyalties,
        royalties,
        commissionPct: affiliateCode.commissionPercentage,
      },
    })
  } catch (err) {
    console.error('[club/affiliate GET] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}
