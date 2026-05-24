// ============================================================================
// FootStock — POST /api/v1/admin/session/activity
// Renova TTL de inatividade no Redis para o admin autenticado.
// Rastreabilidade: INT-087, TASK-1/ST006
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { adminSessionService } from '@/lib/admin/AdminSessionService'
import { getAuthUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser()

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!auth.user.adminRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const requestedUserId = typeof body?.userId === 'string' ? body.userId : null

    if (requestedUserId && requestedUserId !== auth.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await adminSessionService.storeActivityTimestamp(auth.user.id)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
