// GET /api/cron/notification-digest — Cron horário (0 * * * *)
// Consolida dividendos acumulados e envia 1 notificação por usuário por dia
// Rastreabilidade: T-014, NOTIFICATION-SPEC.md (NOTIF-008)

import { NextRequest, NextResponse } from 'next/server'
import { digestService } from '@/lib/services/DigestService'
import { notificationRepository } from '@/lib/repositories/NotificationRepository'
import { pushService } from '@/lib/services/PushService'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const pending = await digestService.drainPending()
  if (pending.length === 0) {
    return NextResponse.json({ success: true, processed: 0 })
  }

  let sent = 0
  let errors = 0

  for (const acc of pending) {
    try {
      const { items, totalValue, userId } = acc
      const total = Number(totalValue.toFixed(2))

      let title: string
      let body: string

      if (items.length === 1 && items[0]) {
        // 1 clube: notificação individual normal
        title = 'Dividendo creditado!'
        body = `Você recebeu FS$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de dividendos de ${items[0].ticker}.`
      } else {
        // N clubes: digest agrupado
        const clubCount = new Set(items.map((i) => i.ticker)).size
        title = 'Dividendos creditados!'
        body = `Você recebeu dividendos de ${clubCount} clube${clubCount > 1 ? 's' : ''} hoje. Total: FS$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
      }

      const notification = await notificationRepository.create({
        userId,
        type: 'DIVIDEND_CREDITED',
        title,
        body,
        metadata: { digest: true, itemCount: items.length, totalValue: total, items },
      })

      // Broadcast Realtime
      try {
        await supabase
          .channel(`notifications:${userId}`)
          .send({ type: 'broadcast', event: 'NEW_NOTIFICATION', payload: notification })
      } catch { /* graceful */ }

      // Push (fora de quiet hours — este cron roda hourly, mas só envia se habilitado)
      try {
        await pushService.sendToUser(userId, {
          title,
          body,
          url: '/carteira?tab=dividendos',
          tag: 'DIVIDEND_CREDITED',
        })
      } catch { /* graceful */ }

      sent++
    } catch (err) {
      console.error('[cron/notification-digest] Erro ao processar digest para userId:', acc.userId, err)
      errors++
    }
  }

  return NextResponse.json({ success: true, processed: pending.length, sent, errors })
}
