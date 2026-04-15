// GET /api/cron/notification-ttl-cleanup — Cron diário (0 4 * * *)
// Remove notificações com expiresAt < now() (TTL de 30 dias)
// Rastreabilidade: T-014, NOTIFICATION-SPEC.md

import { NextRequest, NextResponse } from 'next/server'
import { notificationRepository } from '@/lib/repositories/NotificationRepository'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const deleted = await notificationRepository.deleteExpired()
    return NextResponse.json({ success: true, deleted })
  } catch (err) {
    console.error('[cron/notification-ttl-cleanup] Erro:', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
