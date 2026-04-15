// POST /api/v1/admin/broadcast/maintenance — ADMIN+
// module-19 — Comunicado de manutenção programada (SYSTEM_MAINTENANCE)
// Envia in-app + push para todos os usuários ativos
// Rastreabilidade: T-014, NOTIFICATION-SPEC.md

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notificationService } from '@/lib/services/NotificationService'
import { adminAuditService } from '@/lib/services/shared'
import { ok, errors } from '@/lib/api'

const MaintenanceSchema = z.object({
  title: z.string().min(5).max(100),
  message: z.string().min(10).max(500),
  scheduledAt: z.string().datetime().optional(), // ISO 8601
  estimatedDuration: z.string().max(50).optional(), // ex: "2 horas"
})

export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  let body: unknown
  try { body = await request.json() } catch { return errors.validation() }

  const parsed = MaintenanceSchema.safeParse(body)
  if (!parsed.success) return errors.validation()

  const { title, message, scheduledAt, estimatedDuration } = parsed.data

  try {
    const recipients = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    })

    let sent = 0
    let errors_count = 0

    // Enviar em lotes para não sobrecarregar
    const BATCH_SIZE = 100
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map((u) =>
          notificationService.sendNotification({
            userId: u.id,
            type: 'SYSTEM_MAINTENANCE',
            title,
            body: message,
            metadata: {
              scheduledAt,
              estimatedDuration,
              broadcastBy: auth.user.id,
            },
          }).then(() => { sent++ }).catch(() => { errors_count++ })
        )
      )
    }

    await adminAuditService.log({
      adminId: auth.user.id,
      action: 'SYSTEM_MAINTENANCE_BROADCAST',
      details: { title, scheduledAt, estimatedDuration, recipientCount: recipients.length, sent },
    })

    return ok({ sent, errors: errors_count, recipientCount: recipients.length })
  } catch {
    return errors.server()
  }
}
