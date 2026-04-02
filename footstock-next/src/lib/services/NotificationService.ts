// lib/services/NotificationService.ts
// module-19 — Serviço central de notificações (singleton)
// Uso: import { notificationService } from '@/lib/services/NotificationService'

import { createClient } from '@supabase/supabase-js'
import { notificationRepository } from '@/lib/repositories/NotificationRepository'
import { pushService } from '@/lib/services/PushService'
import type { NotificationType, SendNotificationOptions } from '@/types'

// Tipos que recebem Web Push (além da notificação in-app)
export const PUSH_ENABLED_TYPES: NotificationType[] = [
  'ORDER_EXECUTED',
  'MARGIN_CALL_ALERT',
  'CIRCUIT_BREAKER',
  'LEAGUE_RESULT',
  'CANCELLATION_LOCK_ACTIVE',
  'ADMIN_BROADCAST',
]

// Tipos que requerem badge urgente (vermelho diferenciado)
export const URGENT_TYPES: NotificationType[] = [
  'MARGIN_CALL_ALERT',
  'CANCELLATION_LOCK_ACTIVE',
]

class NotificationService {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  async sendNotification(options: SendNotificationOptions): Promise<void> {
    // 1. Persistir no banco (obrigatório — lança se falhar)
    const notification = await notificationRepository.create(options)

    // 2. Broadcast Supabase Realtime (graceful — não bloqueia se falhar)
    try {
      await this.supabase
        .channel(`notifications:${options.userId}`)
        .send({
          type: 'broadcast',
          event: 'NEW_NOTIFICATION',
          payload: notification,
        })
    } catch (err) {
      console.error('[NotificationService] Erro no broadcast Realtime:', err)
    }

    // 3. Web Push se tipo habilitado (graceful — não bloqueia se falhar)
    if (PUSH_ENABLED_TYPES.includes(options.type)) {
      try {
        await pushService.sendToUser(options.userId, {
          title: options.title,
          body: options.body,
        })
      } catch (err) {
        console.error('[NotificationService] Erro no Web Push:', err)
      }
    }
  }
}

export const notificationService = new NotificationService()
