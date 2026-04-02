// ============================================================================
// Foot Stock — Admin Audit Service
// Registra toda ação administrativa em admin_market_actions
// Rastreabilidade: INT-079, INT-080, INT-083 | module-22, module-23, module-24
// ============================================================================

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export const REQUIRED_ADMIN_ACTIONS = [
  'USER_SUSPENDED',
  'USER_PROMOTED',
  'BALANCE_RESET',
  'NEWS_EDITED',
  'NEWS_ARCHIVED',
  'POST_MODERATED',
  'BLACKLIST_UPDATED',
  'RULES_UPDATED',
  'MOTOR_HALTED',
  'NEWS_INJECTED',
] as const

export type AdminAuditAction = (typeof REQUIRED_ADMIN_ACTIONS)[number] | string

export interface AuditAdminActionParams {
  action: AdminAuditAction
  adminId: string
  targetType?: string
  targetId?: string
  details?: Record<string, unknown>
  ipAddress?: string
}

/**
 * Registra uma ação administrativa em admin_market_actions.
 * adminId NUNCA pode ser null — lança erro se nulo/undefined.
 * Rastreabilidade: toda ação admin deve gerar exatamente 1 registro.
 */
export async function auditAdminAction(params: AuditAdminActionParams): Promise<void> {
  const { action, adminId, targetType, targetId, details, ipAddress } = params

  if (!adminId) {
    throw new Error('auditAdminAction: adminId é obrigatório — ação não registrada')
  }

  await prisma.adminMarketAction.create({
    data: {
      action,
      adminId,
      reason: targetType ? `${targetType}:${targetId ?? 'unknown'}` : undefined,
      details: details as Prisma.InputJsonValue ?? undefined,
      ipAddress: ipAddress ?? null,
    },
  })
}
