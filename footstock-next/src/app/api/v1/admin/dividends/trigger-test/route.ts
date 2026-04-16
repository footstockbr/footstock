// ============================================================================
// FootStock — POST /api/v1/admin/dividends/trigger-test
// Disparo manual de cálculo de dividendo esportivo para testes (admin only).
// Rastreabilidade: INT-072
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { dividendService } from '@/lib/services/DividendService'
import { IMPACT_EVENT_TYPE } from '@/lib/enums'
import type { AuthContext } from '@/app/api/middleware'

const TriggerSchema = z.object({
  ticker: z.string().min(2).max(10),
  impactCategory: z.enum([
    IMPACT_EVENT_TYPE.VITORIA,
    IMPACT_EVENT_TYPE.TITULO,
    IMPACT_EVENT_TYPE.EMPATE,
    IMPACT_EVENT_TYPE.DERROTA,
  ]),
  sentiment: z.number().min(0).max(1),
})

async function handler(req: NextRequest, { user }: AuthContext) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Body JSON inválido.' } },
        { status: 400 }
      )
    }

    const parsed = TriggerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos.',
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      )
    }

    const { ticker, impactCategory, sentiment } = parsed.data

    console.log(
      `[AdminTrigger] disparo manual: ticker=${ticker}, category=${impactCategory}, sentiment=${sentiment}, adminId=${user.id}`
    )

    const result = await dividendService.calcularDividendoEsportivo(
      ticker,
      impactCategory,
      sentiment
    )

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[POST /api/v1/admin/dividends/trigger-test]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}

export const POST = withAdmin('financial:write')(handler)
