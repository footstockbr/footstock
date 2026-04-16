// ============================================================================
// FootStock — Admin: Auditoria de transações de usuário
// GET /api/v1/admin/users/[id]/audit
// Rastreabilidade: INT-021 / TASK-5/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { auditTransactionIntegrity } from '@/lib/contracts/transaction-contract'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { consentService } from '@/lib/services/ConsentService'
import type { AuthContext } from '@/app/api/middleware'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  financialType: z.string().optional(),
  integrity: z.enum(['true', 'false']).optional(),
})

async function getHandler(
  req: NextRequest,
  ctx: AuthContext,
): Promise<NextResponse> {
  try {
    // Extract userId from URL path: /api/v1/admin/users/[id]/audit
    const match = req.url.match(/\/admin\/users\/([^/]+)\/audit/)
    const userId = match?.[1]
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'VAL_001', message: 'ID de usuário inválido na URL' } },
        { status: 400 }
      )
    }

    // Verificar que o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, planType: true, fsBalance: true, marginBlocked: true },
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'AUTH_001', message: 'Usuário não encontrado' } },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(req.url)
    const query = querySchema.parse(Object.fromEntries(searchParams.entries()))
    const skip = (query.page - 1) * query.limit

    // Filtros de transações
    const where: Record<string, unknown> = { userId }
    if (query.financialType) where.financialType = query.financialType

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        
      }),
      prisma.transaction.count({ where }),
    ])

    // Auditoria de integridade (opcional — pode ser lento para históricos grandes)
    let integrityReport = null
    if (query.integrity === 'true') {
      integrityReport = await auditTransactionIntegrity(userId, async (uid) => {
        const txs = await prisma.transaction.findMany({
          where: { userId: uid },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            userId: true,
            fsAmount: true,
            balanceBefore: true,
            balanceAfter: true,
            createdAt: true,
          },
        })
        return txs.map(tx => ({
          id: tx.id,
          userId: tx.userId,
          fsAmount: tx.fsAmount ? Number(tx.fsAmount) : null,
          balanceBefore: tx.balanceBefore ? Number(tx.balanceBefore) : null,
          balanceAfter: tx.balanceAfter ? Number(tx.balanceAfter) : null,
          createdAt: tx.createdAt,
        }))
      })
    }

    // LGPD: registrar acesso admin a dados pessoais (fire-and-forget)
    setImmediate(() => {
      void consentService.logDataAccess({
        userId,
        accessedBy: ctx.user.id,
        dataType: 'admin_audit',
        endpoint: req.nextUrl.pathname,
        reason: 'admin_access',
        ip: req.headers.get('x-forwarded-for') ?? undefined,
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        user,
        transactions,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit),
        },
        ...(integrityReport && { integrityReport }),
      },
    })
  } catch (err) {
    console.error('[admin/users/audit] Erro:', err)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
      { status: 500 }
    )
  }
}

export const GET = withAdmin('admin:audit')(getHandler)
