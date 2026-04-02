// ============================================================================
// Foot Stock — GET /api/v1/users/me/data
// Dados completos do usuário para portabilidade (LGPD Art. 18, IV)
// Rastreabilidade: INT-103, US-027, TASK-2/ST001
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { collectUserData } from '@/lib/services/DataExportService'
import { consentService } from '@/lib/services/ConsentService'

async function handler(req: NextRequest, { user }: AuthContext) {
  // Log de acesso obrigatório (LGPD Art. 37) — fire-and-forget
  void consentService.logDataAccess({
    userId: user.id,
    accessedBy: user.id,
    dataType: 'full_data_view',
    endpoint: '/api/v1/users/me/data',
    ip: req.headers.get('x-forwarded-for') ?? undefined,
  })

  const data = await collectUserData(user.id)

  return NextResponse.json({ data }, {
    headers: { 'Cache-Control': 'no-store' }, // dados sensíveis: nunca cachear
  })
}

export const GET = withAuth(handler as never)
