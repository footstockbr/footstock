// ============================================================================
// Foot Stock Motor — AuditLogger
// Persiste ações administrativas no banco via Prisma.
// Falha silenciosa: erros de DB não interrompem a ação principal.
// ============================================================================

import { PrismaClient } from '@prisma/client'
import type { AdminAction } from '../types/motor.types'
import { logger } from '../utils/logger'

export class AuditLogger {
  constructor(private prisma: PrismaClient) {}

  async log(action: AdminAction, previousPrice?: number, newPrice?: number): Promise<void> {
    if (!action.assetId) {
      logger.info(`[audit] Ação global: ${action.type} | admin: ${action.adminId}`)
      return
    }

    try {
      await this.prisma.adminMarketAction.create({
        data: {
          adminId: action.adminId,
          assetId: action.assetId,
          action: action.type,
          reason: action.reason,
          previousPrice: previousPrice ?? null,
          newPrice: newPrice ?? null,
        },
      })
    } catch (err) {
      // Audit log não deve interromper a ação principal
      logger.error('[audit] Falha ao persistir audit log:', err)
    }
  }

  async getRecentActions(assetId?: string, limit = 50) {
    return this.prisma.adminMarketAction.findMany({
      where: assetId ? { assetId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        admin: { select: { name: true, email: true, adminRole: true } },
        asset: { select: { ticker: true, displayName: true } },
      },
    })
  }
}
