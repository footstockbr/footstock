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

  let actions: Awaited<ReturnType<typeof adminAuditService.getRecentActions>>
  try {
    actions = await adminAuditService.getRecentActions(limit, { ticker, action })
  } catch (err) {
    console.error('[audit/route] getRecentActions failed:', err)
    return NextResponse.json({ success: false, error: { code: 'SYS_001', message: 'Falha ao carregar audit log' } }, { status: 500 })
  }

  // Map each field explicitly — no spread of Prisma objects.
  // Decimal → Number, Date → ISO string, relations → plain objects.
  const serialized = actions.map(a => ({
    id: a.id,
    adminId: a.adminId,
    assetId: a.assetId,
    action: a.action,
    reason: a.reason,
    ticker: a.ticker,
    details: a.details,
    ipAddress: a.ipAddress,
    previousPrice: a.previousPrice != null ? Number(a.previousPrice) : null,
    newPrice: a.newPrice != null ? Number(a.newPrice) : null,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    admin: a.admin ? { name: a.admin.name, email: a.admin.email } : null,
  }))

  return NextResponse.json({ data: serialized })
})
