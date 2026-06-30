// ============================================================================
// FootStock — Admin Market Actions Endpoint
// POST /api/v1/admin/market — publica ação no canal motor:control via Redis
// GET  /api/v1/admin/market — histórico das últimas 100 ações
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { redisPublisher } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import type { AuthContext } from '@/app/api/middleware'

const adminActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PAUSE_ASSET'),
    assetId: z.string().cuid(),
    reason: z.string().min(10).max(500),
  }),
  z.object({
    type: z.literal('RESUME_ASSET'),
    assetId: z.string().cuid(),
    reason: z.string().min(10).max(500),
  }),
  z.object({
    type: z.literal('INJECT_NEWS'),
    assetId: z.string().cuid(),
    reason: z.string().min(10).max(500),
    payload: z.object({
      impact: z.enum(['FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR']),
      magnitude: z.number().min(0.1).max(1.0),
      durationTicks: z.number().int().min(1).max(150),
      // Opcionais: quando presentes, o motor grava o rastro causal com a
      // noticia real (newsId/title) em vez de NEWS_WITHOUT_ID.
      newsId: z.string().optional(),
      title: z.string().max(160).optional(),
    }),
  }),
  z.object({
    type: z.literal('ADJUST_PRICE'),
    assetId: z.string().cuid(),
    reason: z.string().min(10).max(500),
    payload: z.object({
      newPrice: z.number().positive(),
    }),
  }),
  z.object({
    type: z.literal('HALT_ALL'),
    reason: z.string().min(10).max(500),
  }),
  z.object({
    type: z.literal('RESUME_ALL'),
    reason: z.string().min(10).max(500),
  }),
])

const COMMAND_STATUS_TTL_SECONDS = 300

function isGlobalCommand(type: string): type is 'HALT_ALL' | 'RESUME_ALL' {
  return type === 'HALT_ALL' || type === 'RESUME_ALL'
}

function commandStatusKey(commandId: string): string {
  return `motor:control:status:${commandId}`
}

async function postHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  try {
    // Rate limiting: max 10 ações admin por minuto por adminId
    const rateLimitKey = `admin:market:ratelimit:${user.id}`
    const currentCount = await redisPublisher.incr(rateLimitKey)
    if (currentCount === 1) {
      await redisPublisher.expire(rateLimitKey, 60)
    }
    if (currentCount > 10) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_001', message: 'Limite de 10 ações por minuto atingido' } },
        { status: 429 }
      )
    }

    const body = await req.json()
    const validation = adminActionSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VAL_001', message: validation.error.issues[0]?.message ?? 'Payload inválido' } },
        { status: 400 }
      )
    }

    const action = validation.data
    const commandId = randomUUID()
    const publishedAt = new Date().toISOString()

    // Verificar que o ativo existe (se assetId fornecido)
    let assetCurrentPrice: number | null = null
    if ('assetId' in action && action.assetId) {
      const asset = await prisma.asset.findUnique({
        where: { id: action.assetId },
        select: { id: true, currentPrice: true },
      })
      if (!asset) {
        return NextResponse.json(
          { success: false, error: { code: 'MARKET_001', message: 'Ativo não encontrado' } },
          { status: 404 }
        )
      }
      assetCurrentPrice = asset.currentPrice.toNumber()
    }

    // Publicar no canal motor:control para o motor processar
    const event = {
      ...action,
      adminId: user.id,
      correlationId: commandId,
      timestamp: Date.now(),
    }

    if (isGlobalCommand(action.type)) {
      const publishedStatus = {
        commandId,
        type: action.type,
        state: 'published',
        publishedAt,
        adminId: user.id,
        applied: false,
      }
      await redisPublisher.set(commandStatusKey(commandId), JSON.stringify(publishedStatus), 'EX', COMMAND_STATUS_TTL_SECONDS)
      await redisPublisher.set('motor:control:last-command', JSON.stringify(publishedStatus), 'EX', COMMAND_STATUS_TTL_SECONDS)
    }

    await redisPublisher.publish('motor:control', JSON.stringify(event))

    // Registrar audit log para ações com ativo específico
    // Ações globais (HALT_ALL, RESUME_ALL) são auditadas pelo motor via AuditLogger
    // previousPrice/newPrice em ADJUST_PRICE são o que permite à análise de valor
    // tratar a ação como causa DIRETA do salto de preço (não apenas correlação).
    if ('assetId' in action && action.assetId) {
      await prisma.adminMarketAction.create({
        data: {
          adminId: user.id,
          assetId: action.assetId,
          action: action.type,
          details: {
            reason: action.reason,
            ...('payload' in action ? { payload: action.payload } : {}),
          },
          ...(action.type === 'ADJUST_PRICE'
            ? { previousPrice: assetCurrentPrice, newPrice: action.payload.newPrice }
            : {}),
        },
      })
    } else {
      // Acoes globais (HALT_ALL, RESUME_ALL): o AuditLogger do motor descarta
      // acoes sem assetId, entao a auditoria precisa acontecer aqui.
      await prisma.adminMarketAction.create({
        data: {
          adminId: user.id,
          assetId: null,
          action: action.type,
          details: { reason: action.reason, commandId, operationalState: 'published' },
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        message: `Ação ${action.type} publicada no canal do motor`,
        commandId,
        operationalStatus: isGlobalCommand(action.type)
          ? { state: 'published', applied: false }
          : null,
        timestamp: Date.now(),
      },
    })
  } catch (err) {
    console.error('[admin/market] Erro:', err)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
      { status: 500 }
    )
  }
}

async function getHandler(_req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  try {
    const actions = await prisma.adminMarketAction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        admin: { select: { name: true, email: true, adminRole: true } },
      },
    })

    return NextResponse.json({ success: true, data: actions })
  } catch (err) {
    console.error('[admin/market] Erro ao buscar histórico:', err)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
      { status: 500 }
    )
  }
}

export const POST = withAdmin('motor:control')(postHandler)
export const GET = withAdmin('motor:read')(getHandler)
