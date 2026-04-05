// ============================================================================
// Foot Stock — PATCH /api/v1/admin/affiliates/:id
// Editar percentual de comissão, dados bancários e status.
// RESOLVED: G002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

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
      select: { id: true, code: true, commissionPercentage: true, active: true, updatedAt: true },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Afiliado não encontrado' } }, { status: 404 })
  }
})
