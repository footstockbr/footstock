// ============================================================================
// FootStock — PATCH /api/v1/admin/affiliates/:id
// Editar percentual de comissão, dados bancários e status.
// RESOLVED: G002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'

const patchSchema = z.object({
  commissionPercentage: z.number().min(0).max(1).optional(),
  active:               z.boolean().optional(),
  bankData: z.object({
    banco:   z.string().optional(),
    agencia: z.string().optional(),
    conta:   z.string().optional(),
    pixKey:  z.string().optional(),
    cnpj:    z.string().optional(),
  }).optional(),
})

function getId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/')
  return parts[parts.length - 1] ?? ''
}

export const PATCH = withAdmin('financial:write')(async (request: NextRequest) => {
  const id = getId(request)

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: { code: 'VAL_001', message: 'JSON inválido' } }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: 'VAL_001', message: 'Dados inválidos' } }, { status: 422 })
  }

  try {
    const updated = await prisma.affiliateCode.update({
      where: { id },
      data: {
        ...(parsed.data.commissionPercentage !== undefined ? { commissionPercentage: parsed.data.commissionPercentage } : {}),
        ...(parsed.data.active !== undefined               ? { active: parsed.data.active }                             : {}),
        ...(parsed.data.bankData !== undefined             ? { bankData: parsed.data.bankData }                         : {}),
      },
      select: { id: true, code: true, commissionPercentage: true, active: true, updatedAt: true, affiliateType: true, userId: true },
    })

    // EVT-043: affiliate_config_updated (server-side fallback — no admin UI form yet)
    // TODO: Mover para componente client-side quando admin affiliate edit form existir
    const fieldsUpdated = Object.keys(parsed.data).filter(
      (k) => parsed.data[k as keyof typeof parsed.data] !== undefined
    )
    mixpanelServer.track(updated.userId, 'affiliate_config_updated', {
      affiliateType: updated.affiliateType as string,
      fieldsUpdated,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Afiliado não encontrado' } }, { status: 404 })
  }
})
