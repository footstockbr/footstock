// ============================================================================
// Foot Stock — POST /api/v1/admin/news
// Injeção manual de notícias no motor de preços com auditoria. Requer: motor:control.
// Restringe a SuperAdmin e Administrador — Editor não pode manipular preços via notícias.
// Rastreabilidade: INT-049, INT-086, TASK-3/ST008
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { newsInjectionService, adminNewsInjectSchema } from '@/lib/services/NewsInjectionService'
import { TICKERS_40 } from '@/lib/constants/tickers'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

export const POST = withAdmin('motor:control')(async (request: NextRequest, { user }) => {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = adminNewsInjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  if (!(TICKERS_40 as readonly string[]).includes(parsed.data.ticker)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.ASSET_051, message: ERROR_MESSAGES['ASSET-051'] } },
      { status: 422 }
    )
  }

  try {
    const result = await newsInjectionService.inject(parsed.data, user.id)
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
