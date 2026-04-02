/**
 * Admin Audit Trail Middleware — module-23-admin-usuarios-financeiro
 *
 * Provides two utilities:
 *   - withAdminAudit: wraps a Next.js route handler to auto-log actions
 *   - logAdminAction: standalone function to log a single admin action
 *
 * INVARIANTE: importar SEMPRE de 'lib/middleware/admin-audit' (nunca de 'lib/services/admin/')
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export interface AdminAuditPayload {
  adminId: string
  action: string
  targetTicker?: string | null
  details?: Record<string, unknown>
}

/**
 * Registra uma ação administrativa em admin_market_actions.
 * Uso direto para casos onde o contexto do usuário já foi resolvido.
 */
export async function logAdminAction(payload: AdminAuditPayload): Promise<void> {
  try {
    await prisma.adminMarketAction.create({
      data: {
        adminId: payload.adminId,
        action: payload.action,
        targetTicker: payload.targetTicker ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: (payload.details ?? {}) as any,
      },
    })
  } catch {
    // Falha no log nunca deve quebrar a operação principal
    console.error('[admin-audit] Falha ao registrar ação:', payload.action)
  }
}

export type AdminRouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>

export type AuditConfig = {
  action: string
  targetTicker?: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<string | null> | string | null
  details?: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Record<string, unknown>> | Record<string, unknown>
}

/**
 * HOC que envolve um route handler e registra automaticamente no audit trail.
 *
 * Uso:
 *   export const PATCH = withAdminAudit(
 *     async (req, ctx) => { ... },
 *     { action: 'SUSPEND_USER' }
 *   )
 *
 * O adminId é extraído do header x-admin-id (injetado pelo requireAdminRole).
 * Se não encontrado, o audit é silenciosamente ignorado para não bloquear a operação.
 */
export function withAdminAudit(handler: AdminRouteHandler, config: AuditConfig): AdminRouteHandler {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const response = await handler(req, ctx)

    // Só registrar se a operação foi bem-sucedida (2xx)
    if (response.status >= 200 && response.status < 300) {
      const adminId = req.headers.get('x-admin-id')
      if (adminId) {
        const targetTicker = config.targetTicker
          ? await Promise.resolve(config.targetTicker(req, ctx))
          : null
        const details = config.details
          ? await Promise.resolve(config.details(req, ctx))
          : {}

        await logAdminAction({
          adminId,
          action: config.action,
          targetTicker,
          details,
        })
      }
    }

    return response
  }
}
