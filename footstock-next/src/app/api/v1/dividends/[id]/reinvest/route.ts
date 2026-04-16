// ============================================================================
// FootStock — POST /api/v1/dividends/{id}/reinvest
// Reinvestimento manual de dividendo PENDING (apenas Jogador, dentro de 7 dias).
// Rastreabilidade: INT-073
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { DIVIDEND_STATUS } from '@/lib/enums'
import { dividendService } from '@/lib/services/DividendService'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

async function handler(
  _req: NextRequest,
  { user }: AuthContext,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const dividend = await prisma.dividend.findUnique({ where: { id } })

    if (!dividend) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Dividendo não encontrado.' } },
        { status: 404 }
      )
    }

    // IDOR protection
    if (dividend.userId !== user.id) {
      console.warn(`[Security] IDOR attempt: dividendId=${id}, requestUserId=${user.id}, ownerUserId=${dividend.userId}`)
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Acesso negado.' } },
        { status: 403 }
      )
    }

    // Verificar que status é PENDING
    if (dividend.status !== DIVIDEND_STATUS.PENDING) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DIV_001',
            message: 'Este dividendo já foi processado e não pode ser reinvestido novamente.',
          },
        },
        { status: 400 }
      )
    }

    // Verificar prazo de 7 dias
    const msElapsed = Date.now() - new Date(dividend.createdAt).getTime()
    if (msElapsed >= SEVEN_DAYS_MS) {
      const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24))
      console.warn(`[Reinvest] prazo expirado: dividendId=${id}, daysElapsed=${daysElapsed}`)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DIV_002',
            message: 'O prazo para reinvestimento deste dividendo expirou (7 dias).',
          },
        },
        { status: 422 }
      )
    }

    const updated = await dividendService.reinvestirDividendo(id, user.id)

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    console.error('[POST /api/v1/dividends/reinvest]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}

export function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withAuth((r, ctx) => handler(r, ctx, context))(req)
}
