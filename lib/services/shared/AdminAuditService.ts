// ============================================================================
// Foot Stock — AdminAuditService
// Registra todas as ações administrativas em admin_market_actions.
// GUARD: não importar de lib/services/admin/ — evita circular deps
// Importado por: module-17 (news inject), module-18 (moderation), module-22
// ============================================================================

import { prisma } from '@/lib/prisma'
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
   * Usa `select` explícito (sem `include + as never`) para evitar
   * problemas de serialização e type mismatch em runtime.
   */
  async getRecentActions(
    limit = 50,
    filters?: { ticker?: string; action?: string }
  ) {
    return prisma.adminMarketAction.findMany({
      where: {
        ...(filters?.ticker ? { ticker: filters.ticker } : {}),
        ...(filters?.action ? { action: filters.action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        adminId: true,
        assetId: true,
        action: true,
        reason: true,
        ticker: true,
        details: true,
        ipAddress: true,
        previousPrice: true,
        newPrice: true,
        createdAt: true,
        admin: { select: { name: true, email: true } },
      },
    })
  }
}

export const adminAuditService = new AdminAuditService()
