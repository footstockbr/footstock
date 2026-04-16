// ============================================================================
// FootStock — GET /api/v1/admin/webhooks/logs
// Endpoint paginado de auditoria de webhooks — protegido por withAdmin
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { webhookAuditService } from '@/lib/services/WebhookAuditService'
import type { SubscriptionGateway, WebhookAuditStatus } from '@prisma/client'

const GATEWAYS: SubscriptionGateway[] = ['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL']
const STATUSES: WebhookAuditStatus[]  = ['ACCEPTED', 'REJECTED', 'DUPLICATE']

export const GET = withAdmin('admin:audit')(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)

  const gatewayParam = searchParams.get('gateway')?.toUpperCase() as SubscriptionGateway | null
  const statusParam  = searchParams.get('status')?.toUpperCase() as WebhookAuditStatus | null
  const dateFrom     = searchParams.get('dateFrom')
  const dateTo       = searchParams.get('dateTo')
  const page         = parseInt(searchParams.get('page') ?? '1', 10)
  const limit        = parseInt(searchParams.get('limit') ?? '20', 10)

  // Validar enums
  const gateway = gatewayParam && GATEWAYS.includes(gatewayParam) ? gatewayParam : undefined
  const status  = statusParam  && STATUSES.includes(statusParam)  ? statusParam  : undefined

  const result = await webhookAuditService.listLogs({
    gateway,
    status,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo:   dateTo   ? new Date(dateTo)   : undefined,
    page:     isNaN(page)  ? 1  : page,
    limit:    isNaN(limit) ? 20 : limit,
  })

  return NextResponse.json(result)
})
