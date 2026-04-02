// ============================================================================
// Foot Stock — GET /api/v1/admin/audit?limit=20&ticker=FLM&action=HALT_ASSET
// Log de ações administrativas recentes. Requer: admin:dashboard.
// Rastreabilidade: INT-086, TASK-3/ST003
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { adminAuditService } from '@/lib/services/shared'

export const GET = withAdmin('admin:audit')(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20))
  const ticker = sp.get('ticker') ?? undefined
  const action = sp.get('action') ?? undefined

  const actions = await adminAuditService.getRecentActions(limit, { ticker, action })

  // Prisma Decimal fields are not JSON-serializable — convert explicitly
  const serialized = actions.map(a => ({
    ...a,
    previousPrice: a.previousPrice != null ? Number(a.previousPrice) : null,
    newPrice: a.newPrice != null ? Number(a.newPrice) : null,
  }))

  return NextResponse.json({ data: serialized })
})
