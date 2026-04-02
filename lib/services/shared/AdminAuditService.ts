// ============================================================================
// Foot Stock — AdminAuditService
// Registra todas as ações administrativas em admin_market_actions.
// GUARD: não importar de lib/services/admin/ — evita circular deps
// Importado por: module-17 (news inject), module-18 (moderation), module-22
// ============================================================================

import { prisma } from '@/lib/prisma'
import type { AdminMarketAction } from '@prisma/client'
import type { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface AuditLogOptions {
  adminId: string
  action: string
  ticker?: string
  details?: Record<string, unknown>
  ipAddress?: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class AdminAuditService {
  /**
   * Registra uma ação admin no audit trail.
   * Nunca lança exceção — falha de audit não bloqueia a ação principal.
   */
  async log(options: AuditLogOptions): Promise<void> {
    const { adminId, action, ticker, details, ipAddress } = options
    try {
      await prisma.adminMarketAction.create({
        data: {
          adminId,
          action,
          ticker: ticker ?? null,
          details: details ? (details as Prisma.InputJsonValue) : undefined,
          ipAddress: ipAddress ?? null,
        },
      })
      console.info('[AdminAudit]', action, { adminId, ticker })
    } catch (err) {
      console.error('[AdminAudit] insert failed — não propagado ao cliente:', err)
    }
  }

  /**
   * Retorna as ações admin mais recentes para exibição no painel.
   */
  async getRecentActions(
    limit = 50,
    filters?: { ticker?: string; action?: string }
  ): Promise<AdminMarketAction[]> {
    return prisma.adminMarketAction.findMany({
      where: {
        ...(filters?.ticker ? { ticker: filters.ticker } : {}),
        ...(filters?.action ? { action: filters.action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        admin: { select: { name: true, email: true } },
      } as never,
    })
  }
}

export const adminAuditService = new AdminAuditService()
