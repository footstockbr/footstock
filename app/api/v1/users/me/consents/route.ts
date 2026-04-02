// ============================================================================
// Foot Stock — GET /api/v1/users/me/consents
// Retorna todos os consentimentos do usuário autenticado.
// Rastreabilidade: INT-102, US-M13-001, TASK-1/ST003
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { consentService } from '@/lib/services/ConsentService'

async function handler(req: NextRequest, { user }: AuthContext) {
  const consents = await consentService.getConsents(user.id)
  return NextResponse.json({ consents })
}

export const GET = withAuth(handler as never)
