// ============================================================================
// Foot Stock — POST/DELETE /api/v1/admin/motor/halt/:ticker
// Suspende ou libera um ativo via Redis (motor:halt:{ticker}).
// POST → suspende. DELETE → libera. Requer: assets:halt.
// Rastreabilidade: INT-086, TASK-3/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { redisPublisher, REDIS_CHANNELS } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { adminAuditService } from '@/lib/services/shared'
import { TICKERS_40 } from '@/lib/constants/tickers'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

const HaltSchema = z.object({
  reason: z.string().min(5).max(100),
})

/** Extrai ticker do path: /api/v1/admin/motor/halt/{ticker} */
function extractTicker(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  return (segments[segments.length - 1] ?? '').toUpperCase()
}

// POST — suspende ativo
export const POST = withAdmin('assets:halt')(async (request, { user }) => {
  const upper = extractTicker(request)

  if (!(TICKERS_40 as readonly string[]).includes(upper)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.ASSET_051, message: ERROR_MESSAGES['ASSET-051'] } },
      { status: 422 }
    )
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = HaltSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const { reason } = parsed.data

  const asset = await prisma.asset.findUnique({ where: { ticker: upper }, select: { id: true } })
  if (!asset) {
    return NextResponse.json({ error: 'Ativo não encontrado.' }, { status: 404 })
  }

  await redisPublisher.set(
    `motor:halt:${upper}`,
    JSON.stringify({ reason, haltedAt: new Date().toISOString(), adminId: user.id })
  )

  await redisPublisher.publish(
    REDIS_CHANNELS.MOTOR_CONTROL,
    JSON.stringify({ action: 'HALT_ASSET', ticker: upper, reason, adminId: user.id })
  )

  await adminAuditService.log({
    adminId: user.id,
    action: 'HALT_ASSET',
    ticker: upper,
    details: { reason },
  })

  return NextResponse.json({ data: { ticker: upper, halted: true, reason } })
})

// DELETE — libera ativo
export const DELETE = withAdmin('assets:halt')(async (request, { user }) => {
  const upper = extractTicker(request)

  if (!(TICKERS_40 as readonly string[]).includes(upper)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.ASSET_051, message: ERROR_MESSAGES['ASSET-051'] } },
      { status: 422 }
    )
  }

  const existed = await redisPublisher.del(`motor:halt:${upper}`)

  await redisPublisher.publish(
    REDIS_CHANNELS.MOTOR_CONTROL,
    JSON.stringify({ action: 'RELEASE_HALT', ticker: upper, adminId: user.id })
  )

  await adminAuditService.log({
    adminId: user.id,
    action: 'RELEASE_HALT',
    ticker: upper,
    details: { wasHalted: existed > 0 },
  })

  return NextResponse.json({ data: { ticker: upper, halted: false } })
})
