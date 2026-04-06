import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { adminAuditService } from '@/lib/services/shared'
import { ok, errors } from '@/lib/api'

// GET /api/v1/admin/audit?limit=20&ticker=URU3&action=HALT_ASSET — Monitor+
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
      { status: 403 }
    )
  }

  try {
    const sp = request.nextUrl.searchParams
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20))
    const ticker = sp.get('ticker') ?? undefined
    const action = sp.get('action') ?? undefined

    const actions = await adminAuditService.getRecentActions(limit, { ticker, action })
    return ok(actions)
  } catch {
    return errors.server()
  }
}
