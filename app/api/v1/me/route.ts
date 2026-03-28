// ============================================================================
// Foot Stock — GET /api/v1/me
// Retorna dados do usuário autenticado.
// ============================================================================

import { NextRequest } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'

async function handler(_req: NextRequest, { user }: AuthContext) {
  return Response.json({ success: true, data: user })
}

export const GET = withAuth(handler as never)
