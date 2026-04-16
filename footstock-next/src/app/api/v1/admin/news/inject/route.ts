// ============================================================================
// FootStock — POST /api/v1/admin/news/inject
// Injeção manual de notícias no motor de preços com RBAC (motor:control).
// Requer: SuperAdmin ou Administrador (não Editor — restringe manipulação de preços).
// Rastreabilidade: INT-049
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { newsInjectionService, adminNewsInjectSchema } from '@/lib/services/NewsInjectionService'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import type { AuthContext } from '@/app/api/middleware'

async function postHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  try {
    const body: unknown = await req.json()

    // Validação Zod
    const parseResult = adminNewsInjectSchema.safeParse(body)
    if (!parseResult.success) {
      const issues = parseResult.error.issues
      const isRequired = issues.some(i => i.code === 'invalid_type')
      const code = isRequired ? ERROR_CODES.VAL_001 : ERROR_CODES.VAL_003
      const message = isRequired ? ERROR_MESSAGES['VAL-001'] : ERROR_MESSAGES['VAL-003']
      return NextResponse.json({ success: false, error: { code, message } }, { status: 400 })
    }

    const { newsId } = await newsInjectionService.inject(parseResult.data, user.id)

    return NextResponse.json({ success: true, newsId }, { status: 201 })
  } catch (err) {
    console.error('[/api/v1/admin/news/inject] Erro interno:', err)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
      { status: 500 }
    )
  }
}

export const POST = withAdmin('motor:control')(postHandler)
