import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRedisClient } from '@/lib/redis'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { adminAuditService } from '@/lib/services/shared'
import { ok, errors } from '@/lib/api'

const BroadcastSchema = z.object({
  title: z.string().min(5).max(100),
  message: z.string().min(10).max(500),
  type: z.enum(['INFO', 'WARNING', 'MAINTENANCE']),
  targetAudience: z.enum(['ALL_ACTIVE', 'SUBSCRIBERS_ONLY']).default('ALL_ACTIVE'),
})

const MAX_BROADCASTS_PER_HOUR = 5

// POST /api/v1/admin/broadcast — ADMIN+
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
      { status: 403 }
    )
  }

  let body: unknown
  try { body = await request.json() } catch { return errors.validation() }

  const parsed = BroadcastSchema.safeParse(body)
  if (!parsed.success) return errors.validation()

  const { title, message, type, targetAudience } = parsed.data

  // Rate limit: 5 broadcasts/hora por adminId
  const redis = getRedisClient()
  if (redis) {
    try {
      const rateKey = `admin:broadcast:${auth.user.id}`
      const count = await redis.incr(rateKey)
      if (count === 1) await redis.expire(rateKey, 3600)
      if (count > MAX_BROADCASTS_PER_HOUR) {
        const ttl = await redis.ttl(rateKey)
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
  }

  try {
    // Buscar destinatários
    const userFilter =
      targetAudience === 'SUBSCRIBERS_ONLY'
        ? { subscriptions: { some: { status: 'ACTIVE' as const } } }
        : {}

    const recipients = await prisma.user.findMany({
      where: userFilter,
      select: { id: true },
    })

    // Inserir notificações em batch
    const broadcastId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    if (recipients.length > 0) {
      await prisma.notification.createMany({
        data: recipients.map((u) => ({
          userId: u.id,
          type: 'ADMIN_BROADCAST' as const,
          title,
          body: message,
          data: { broadcastId, broadcastType: type, targetAudience }, // campo correto no schema
          expiresAt,
        })),
      })
    }

    await adminAuditService.log({
      adminId: auth.user.id,
      action: 'ADMIN_BROADCAST',
      details: { title, type, targetAudience, recipientCount: recipients.length, broadcastId },
    })

    return ok({ sent: true, recipientCount: recipients.length, broadcastId })
  } catch {
    return errors.server()
  }
}
