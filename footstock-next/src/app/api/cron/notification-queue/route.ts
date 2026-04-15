// GET /api/cron/notification-queue — Cron 07:00 BRT (10:00 UTC) diário
// Processa notificações enfileiradas durante quiet hours (23h-7h BRT)
// Rastreabilidade: T-014, NOTIFICATION-SPEC.md (Quiet Hours)

import { NextRequest, NextResponse } from 'next/server'
import { notificationQueueService } from '@/lib/services/NotificationQueueService'
import { notificationService } from '@/lib/services/NotificationService'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const queueLength = await notificationQueueService.queueLength()
  if (queueLength === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  const items = await notificationQueueService.drainQueue()
  let sent = 0
  let errors = 0

  for (const item of items) {
    try {
      // Usa dispatchImmediate para ignorar quiet hours (já passou das 07:00)
      await notificationService.dispatchImmediate({
        userId: item.userId,
        type: item.type,
        title: item.title,
        body: item.body,
        metadata: item.metadata,
      })
      sent++
    } catch (err) {
      console.error('[cron/notification-queue] Erro ao despachar item:', item.type, item.userId, err)
      errors++
    }
  }

  return NextResponse.json({ success: true, processed: items.length, sent, errors })
}
