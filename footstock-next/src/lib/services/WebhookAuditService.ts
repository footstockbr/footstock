// ============================================================================
// Foot Stock — WebhookAuditService: log de auditoria PCI-DSS
// Referência: PAYMENT_001/002 (rejected), retenção 90 dias (INT-108)
// ============================================================================

import { prisma } from '@/lib/prisma'
import type { SubscriptionGateway, WebhookAuditStatus } from '@prisma/client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface WebhookAuditInput {
  gateway:        SubscriptionGateway
  eventType?:     string
  transactionId?: string
  subscriptionId?: string
  status:         WebhookAuditStatus
  hmacValid:      boolean
  ipAddress?:     string
  errorMessage?:  string
}

export interface WebhookAuditListParams {
  gateway?:   SubscriptionGateway
  status?:    WebhookAuditStatus
  dateFrom?:  Date
  dateTo?:    Date
  page?:      number
  limit?:     number
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class WebhookAuditService {
  /**
   * Registra um webhook recebido (aceito, rejeitado ou duplicado).
   * Best-effort: falhas de escrita são capturadas sem impactar a resposta ao gateway.
   */
  async logWebhook(data: WebhookAuditInput): Promise<void> {
    try {
      await prisma.webhookAuditLog.create({
        data: {
          gateway:        data.gateway,
          eventType:      data.eventType ?? null,
          transactionId:  data.transactionId ?? null,
          subscriptionId: data.subscriptionId ?? null,
          status:         data.status,
          hmacValid:      data.hmacValid,
          ipAddress:      data.ipAddress ?? null,
          errorMessage:   data.errorMessage ?? null,
        },
      })
    } catch (err) {
      // Falha ao logar não deve impactar a resposta ao gateway (SYS_001)
      console.error('[WebhookAuditService] Falha ao salvar audit log:', err)
    }
  }

  /**
   * Retorna logs paginados para o painel admin.
   */
  async listLogs(params: WebhookAuditListParams = {}) {
    const page  = Math.max(1, params.page ?? 1)
    const limit = Math.min(100, Math.max(1, params.limit ?? 20))
    const skip  = (page - 1) * limit

    const where = {
      ...(params.gateway   ? { gateway:    params.gateway }   : {}),
      ...(params.status    ? { status:     params.status }    : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            processedAt: {
              ...(params.dateFrom ? { gte: params.dateFrom } : {}),
              ...(params.dateTo   ? { lte: params.dateTo }   : {}),
            },
          }
        : {}),
    }

    const [logs, total] = await Promise.all([
      prisma.webhookAuditLog.findMany({
        where,
        orderBy: { processedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.webhookAuditLog.count({ where }),
    ])

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Remove registros com mais de 90 dias (política de retenção PCI-DSS req. 6).
   * Deve ser chamado por cron job diário.
   */
  async pruneOldLogs(): Promise<number> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const { count } = await prisma.webhookAuditLog.deleteMany({
      where: { processedAt: { lt: cutoff } },
    })
    return count
  }
}

export const webhookAuditService = new WebhookAuditService()
