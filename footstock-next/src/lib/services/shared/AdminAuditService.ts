// GUARD: não importar de lib/services/admin/ — evita circular deps
// Imports permitidos: @prisma/client via lib/prisma e lib/types/admin
import { prisma } from '@/lib/prisma'
import type { AdminMarketActionLog } from '@/lib/types/admin'

interface LogOptions {
  adminId: string
  action: string
  ticker?: string
  details?: Record<string, unknown>
  ipAddress?: string
}

class AdminAuditService {
  /**
   * Registra ação administrativa em admin_market_actions.
   * Falha de insert é logada no console mas NÃO lança exceção —
   * audit failure não deve bloquear a ação em si.
   */
  async log(options: LogOptions): Promise<void> {
    const { adminId, action, ticker, details, ipAddress } = options
    console.info('[AdminAudit]', action, { adminId, ticker })
    try {
      await prisma.adminMarketAction.create({
        data: {
          adminId,
          action,
          targetTicker: ticker ?? null,
          details: { ...details, ipAddress: ipAddress ?? null },
        },
      })
    } catch (err) {
      console.error('[AdminAudit] insert failed — not propagated:', err)
    }
  }

  /**
   * Retorna ações recentes do audit trail.
   */
  async getRecentActions(
    limit = 50,
    filters: { ticker?: string; action?: string } = {}
  ): Promise<AdminMarketActionLog[]> {
    const rows = await prisma.adminMarketAction.findMany({
      where: {
        ...(filters.ticker ? { targetTicker: filters.ticker.toUpperCase() } : {}),
        ...(filters.action ? { action: filters.action } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 100),
      include: { admin: { select: { name: true } } },
    })

    return rows.map((r) => ({
      id: r.id,
      adminId: r.adminId,
      action: r.action,
      targetTicker: r.targetTicker,
      details: r.details,
      timestamp: r.timestamp.toISOString(),
      adminName: r.admin.name,
    }))
  }
}

export const adminAuditService = new AdminAuditService()
