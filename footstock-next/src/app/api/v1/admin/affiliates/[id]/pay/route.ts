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

  // Atomicidade: selecionar os IDs PENDING, somar e marcar EXATAMENTE esses como PAID
  // numa única transação. Antes, o aggregate e o updateMany eram chamadas separadas —
  // uma comissão criada entre elas (ex.: webhook) era paga mas não entrava no total
  // reportado, desalinhando amount e count.
  const { count, amount } = await prisma.$transaction(async (tx) => {
    const pending = await tx.affiliateTransaction.findMany({
      where: { affiliateCodeId: affiliateId, status: 'PENDING' },
      select: { id: true, amount: true },
    })
    if (pending.length === 0) return { count: 0, amount: 0 }

    const ids = pending.map((p) => p.id)
    const sum = pending.reduce((acc, p) => acc + p.amount.toNumber(), 0)
    const upd = await tx.affiliateTransaction.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'PAID', paidAt: now },
    })
    return { count: upd.count, amount: sum }
  })

  // EVT-042: affiliate_payout_initiated
  if (count > 0) {
    mixpanelServer.trackAffiliatePayoutInitiated(affiliate.id, {
      affiliateId: affiliate.id,
      amount: amount.toFixed(2),
      payoutMethod: 'manual_transfer', // comprovante manual = transferencia
    })
  }

  return NextResponse.json({
    success: true,
    data: {
      affiliateId,
      processedAt:  now,
      countPaid:    count,
      comprovante:  parsed.data.comprovante,
    },
  })
})
