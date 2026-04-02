// ============================================================================
// Foot Stock — POST /api/v1/admin/broadcast
// Broadcast de notificação para todos os usuários ou assinantes.
// Rate limit: 5/hora por admin. Requer: admin:dashboard (ADMIN+).
// Rastreabilidade: INT-086, TASK-3/ST004
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { redisPublisher } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import { adminAuditService } from '@/lib/services/shared'

const BroadcastSchema = z.object({
  title: z.string().min(5).max(100),
  message: z.string().min(10).max(500),
  type: z.enum(['INFO', 'WARNING', 'MAINTENANCE']),
  targetAudience: z.enum(['ALL_ACTIVE', 'SUBSCRIBERS_ONLY']).default('ALL_ACTIVE'),
})

const MAX_BROADCASTS_PER_HOUR = 5

export const POST = withAdmin('users:write')(async (request: NextRequest, { user }) => {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BroadcastSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const { title, message, type, targetAudience } = parsed.data

  // Rate limit: 5 broadcasts/hora por adminId
  try {
    const rateKey = `admin:broadcast:${user.id}`
    const count = await redisPublisher.incr(rateKey)
    if (count === 1) await redisPublisher.expire(rateKey, 3600)
    if (count > MAX_BROADCASTS_PER_HOUR) {
      const ttl = await redisPublisher.ttl(rateKey)
      return NextResponse.json(
        {
          error: {
            code: 'RATE-001',
            message: 'Limite de broadcasts excedido (5/hora). Aguarde antes de tentar novamente.',
            resetAt: new Date(Date.now() + ttl * 1000).toISOString(),
          },
        },
        { status: 429, headers: { 'Retry-After': String(ttl) } }
      )
    }
  } catch { /* ignora falha Redis de rate */ }

  // Buscar destinatários
  const recipients = targetAudience === 'SUBSCRIBERS_ONLY'
    ? await prisma.user.findMany({
        where: { subscriptions: { some: { status: 'ACTIVE' } } },
        select: { id: true },
      })
    : await prisma.user.findMany({ select: { id: true } })

  const broadcastId = crypto.randomUUID()
  if (recipients.length > 0) {
    await prisma.notification.createMany({
      data: recipients.map(u => ({
        userId: u.id,
        type: 'ADMIN_BROADCAST',
        title,
        body: message,
        metadata: { broadcastId, broadcastType: type, targetAudience },
      })),
    })
  }

  await adminAuditService.log({
    adminId: user.id,
    action: 'ADMIN_BROADCAST',
    details: { title, type, targetAudience, recipientCount: recipients.length, broadcastId },
  })

  return NextResponse.json({ data: { sent: true, recipientCount: recipients.length, broadcastId } })
})
