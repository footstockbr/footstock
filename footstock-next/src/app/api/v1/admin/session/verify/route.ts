// ============================================================================
// FootStock — GET /api/v1/admin/session/verify
// Verifica se sessão atual tem adminRole no banco. Inicializa TTL Redis.
// Rastreabilidade: INT-085, INT-087, TASK-1/ST007
// ============================================================================

import { NextResponse } from 'next/server'
import { adminSessionService } from '@/lib/admin/AdminSessionService'
import { getAuthUser } from '@/lib/auth'

export async function GET() {
  try {
    const auth = await getAuthUser()

    if (!auth?.user.adminRole) {
      const hasAuthenticatedIdentity = Boolean(auth)
      return NextResponse.json(
        { error: hasAuthenticatedIdentity ? 'AUTH-005' : 'AUTH-001' },
        { status: hasAuthenticatedIdentity ? 403 : 401 }
      )
    }

    // Inicializa TTL de atividade Redis para a sessão admin
    await adminSessionService.storeActivityTimestamp(auth.user.id)

    return NextResponse.json({ ok: true, adminRole: auth.user.adminRole })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
