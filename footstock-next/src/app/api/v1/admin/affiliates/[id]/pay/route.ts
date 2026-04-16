// ============================================================================
// FootStock — POST /api/v1/admin/affiliates/:id/pay
// Processar pagamento de comissões pendentes. SUPER_ADMIN only (financial:write).
// RESOLVED: G002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'

const paySchema = z.object({
  comprovante: z.string().min(1, 'Comprovante obrigatório'),
  observacao:  z.string().max(500).optional(),
})

function getAffiliateId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/')
  return parts[parts.length - 2] ?? ''
}

export const POST = withAdmin('financial:write')(async (request: NextRequest) => {
  const affiliateId = getAffiliateId(request)

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: { code: 'VAL_001', message: 'JSON inválido' } }, { status: 400 })
  }

  const parsed = paySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({
      success: false,
      error: { code: 'VAL_001', message: 'Dados inválidos', details: parsed.error.flatten() },
    }, { status: 422 })
  }

  const affiliate = await prisma.affiliateCode.findUnique({
    where: { id: affiliateId },
    select: { id: true, code: true },
  })
  if (!affiliate) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Afiliado não encontrado' } }, { status: 404 })
  }

  const now = new Date()

  // Somar total pendente antes de marcar como PAID (para analytics)
  const pendingTotal = await prisma.affiliateTransaction.aggregate({
    where: { affiliateCodeId: affiliateId, status: 'PENDING' },
    _sum: { amount: true },
  })

  // Marcar todas as transações PENDING como PAID
  const result = await prisma.affiliateTransaction.updateMany({
    where: { affiliateCodeId: affiliateId, status: 'PENDING' },
    data:  { status: 'PAID', paidAt: now },
  })

  // EVT-042: affiliate_payout_initiated
  if (result.count > 0) {
    const payoutAmount = pendingTotal._sum.amount?.toNumber() ?? 0
    mixpanelServer.trackAffiliatePayoutInitiated(affiliate.id, {
      affiliateId: affiliate.id,
      amount: payoutAmount.toFixed(2),
      payoutMethod: 'manual_transfer', // comprovante manual = transferencia
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      affiliateId,
      processedAt:  now,
      countPaid:    result.count,
      comprovante:  parsed.data.comprovante,
    },
  })
})
