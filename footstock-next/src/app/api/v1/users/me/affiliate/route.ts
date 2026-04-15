// ============================================================================
// Foot Stock — GET /api/v1/users/me/affiliate
// Retorna dados do programa de afiliados do usuário autenticado.
// Todo usuário cadastrado tem um AffiliateCode (criado automaticamente no registro).
// ============================================================================

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://footstock.app'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const affiliateCode = await prisma.affiliateCode.findUnique({
      where: { userId: auth.user.id },
      include: {
        transactions: {
          where: { transactionType: 'SIGNUP' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            referredUser: { select: { name: true, createdAt: true } },
          },
        },
        _count: { select: { transactions: true } },
      },
    })

    // Usuário muito antigo pode não ter código (pré-backfill); tratar graciosamente
    if (!affiliateCode) {
      return NextResponse.json({
        success: true,
        data: {
          hasAffiliateCode: false,
          affiliateCode: null,
          referralLink: null,
          totalReferrals: 0,
          totalEarnedFS: 0,
          recentConversions: [],
        },
      })
    }

    // Total FS$ ganho via programa (todas as transações PAID)
    const aggregate = await prisma.affiliateTransaction.aggregate({
      where: { affiliateCodeId: affiliateCode.id, status: 'PAID' },
      _sum: { amount: true },
    })

    // Total de indicações únicas (SIGNUP) — não confundir com RENEWAL/CONVERSION
    const totalReferrals = await prisma.affiliateTransaction.count({
      where: { affiliateCodeId: affiliateCode.id, transactionType: 'SIGNUP' },
    })

    const totalEarnedFS = Number(aggregate._sum.amount ?? 0)

    // Mascarar nome do indicado: "João da Silva" → "Jo***"
    const maskName = (name: string) => {
      const trimmed = name.trim()
      if (trimmed.length <= 2) return '***'
      return trimmed.slice(0, 2) + '***'
    }

    const recentConversions = affiliateCode.transactions.map((t) => ({
      referredUserName: maskName(t.referredUser.name),
      earnedFS: Number(t.amount),
      date: t.createdAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      data: {
        hasAffiliateCode: true,
        affiliateCode: affiliateCode.code,
        referralLink: `${APP_URL}/ref/${affiliateCode.code}`,
        totalReferrals,
        totalEarnedFS,
        recentConversions,
        active: affiliateCode.active,
      },
    })
  } catch (err) {
    console.error('[users/me/affiliate][GET] error:', err)
    return errors.server()
  }
}
