// lib/services/NotificationService.ts
// module-19 — Serviço central de notificações (singleton)
// T-014: 23 tipos, quiet hours 23h-7h BRT, preferências por canal, digest DIVIDEND_CREDITED

import { notificationRepository } from '@/lib/repositories/NotificationRepository'
import { pushService } from '@/lib/services/PushService'
import { emailNotificationService } from '@/lib/services/EmailNotificationService'
import { quietHoursService, URGENT_TYPES } from '@/lib/services/QuietHoursService'
import { notificationQueueService } from '@/lib/services/NotificationQueueService'
import { digestService } from '@/lib/services/DigestService'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import { prisma } from '@/lib/prisma'
import type { NotificationType, SendNotificationOptions } from '@/types'
import type { NotificationType as AnalyticsNotificationType, UserPlan } from '@/lib/analytics'

// Tipos que recebem Web Push (além da notificação in-app)
export const PUSH_ENABLED_TYPES = new Set<NotificationType>([
  'ORDER_EXECUTED',
  'MARGIN_CALL_WARNING',
  'MARGIN_CALL_ALERT',
  'CIRCUIT_BREAKER',
  'NEWS_FAVORITE_CLUB',
  'PAYMENT_FAILED',
  'LEAGUE_RESULT',
  'CANCELLATION_LOCK_ACTIVE',
  'CANCELLATION_LOCK_LIQUIDATED',
  'ADMIN_BROADCAST',
  'SYSTEM_MAINTENANCE',
  'AFFILIATE_COMMISSION_EARNED', // NOTIF-016: push obrigatório (spec)
  'AFFILIATE_INVITE_JOINED',     // NOTIF-017: push obrigatório (spec)
])

// Tipos que só têm canal email (sem in-app)
const EMAIL_ONLY_TYPES = new Set<NotificationType>([
  'PASSWORD_RESET',
  'LGPD_EXPORT_READY',
  'ACCOUNT_DELETED',
  'BRUTE_FORCE_BLOCKED',
])

// Tipos que usam digest (agrupa múltiplas notificações do mesmo dia)
const DIGEST_TYPES = new Set<NotificationType>([
  'DIVIDEND_CREDITED',
])

class NotificationService {
  /**
   * Ponto de entrada único para todas as notificações.
   * Aplica: quiet hours, preferências de canal, digest, push, email.
   */
  async sendNotification(options: SendNotificationOptions): Promise<void> {
    const { userId, type } = options

    // ── Tipos digest: acumular e não enviar individualmente ──────────────────
    if (DIGEST_TYPES.has(type)) {
      const metadata = options.metadata ?? {}
      await digestService.accumulate(
        userId,
        String(metadata.ticker ?? ''),
        Number(metadata.value ?? 0),
        String(metadata.dividendType ?? '')
      )
      return
    }

    // ── Email-only: não cria registro in-app ────────────────────────────────
    if (EMAIL_ONLY_TYPES.has(type)) {
      await this._sendEmailChannel(options)
      return
    }

    // ── Quiet hours: enfileirar para 07:00 BRT ──────────────────────────────
    if (quietHoursService.isQuietHour(type)) {
      const scheduledFor = quietHoursService.nextDeliveryAt()
      await notificationQueueService.enqueue(options, scheduledFor)
      return
    }

    // ── Envio imediato ───────────────────────────────────────────────────────
    await this._dispatchImmediate(options)
  }

  /**
   * Despacha notificação imediatamente (usado pelo serviço principal e pelo cron de queue).
   */
  async dispatchImmediate(options: SendNotificationOptions): Promise<void> {
    return this._dispatchImmediate(options)
  }

  private async _dispatchImmediate(options: SendNotificationOptions): Promise<void> {
    const { userId, type } = options

    // Carregar preferências do usuário para verificar canais
    const prefs = await notificationRepository.getPreferences(userId)

    // ── 1. Canal in-app (persiste no banco) ────────────────────────────────
    const inAppEnabled = await notificationRepository.isChannelEnabled(userId, type, 'inApp', prefs)
    if (inAppEnabled) {
      await notificationRepository.create(options)

      // EVT-033: notification_received — rastreia notificacao recebida
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { planType: true },
        })
        mixpanelServer.trackNotificationReceived(userId, {
          notification_type: type as AnalyticsNotificationType,
          channel: 'in-app',
          plan: (user?.planType ?? 'JOGADOR') as UserPlan,
        })
      } catch {
        // analytics nunca deve quebrar o fluxo de notificacoes
      }

      // Entrega ao frontend é feita por polling (useNotifications, 30s).
      // O antigo broadcast Realtime via Supabase foi removido na decomissão.
    }

    // ── 2. Canal push ──────────────────────────────────────────────────────
    const pushEnabled = PUSH_ENABLED_TYPES.has(type)
      && await notificationRepository.isChannelEnabled(userId, type, 'push', prefs)

    if (pushEnabled) {
      try {
        await pushService.sendToUser(userId, {
          title: options.title,
          body: options.body,
          url: '/inbox',
          tag: type,
        })
      } catch (err) {
        console.error('[NotificationService] Erro no Web Push:', err)
      }
    }

    // ── 3. Canal email ──────────────────────────────────────────────────────
    if (emailNotificationService.hasEmailChannel(type)) {
      const emailEnabled = await notificationRepository.isChannelEnabled(userId, type, 'email', prefs)
      if (emailEnabled) {
        await this._sendEmailChannel(options)
      }
    }
  }

  private async _sendEmailChannel(options: SendNotificationOptions): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: options.userId },
        select: { email: true, name: true },
      })
      if (!user?.email) return

      await emailNotificationService.sendForType(options.type, user.email, {
        userName: user.name,
        title: options.title,
        body: options.body,
        metadata: options.metadata,
      })
    } catch (err) {
      console.error('[NotificationService] Erro no canal email:', err)
    }
  }
}

export const notificationService = new NotificationService()

/** Atalho de compatibilidade com código existente que importa a função diretamente. */
export async function sendNotification(
  userId: string,
  type: NotificationType,
  opts: { title: string; body: string; metadata?: Record<string, unknown> }
): Promise<void> {
  return notificationService.sendNotification({
    userId,
    type,
    title: opts.title,
    body: opts.body,
    metadata: opts.metadata,
  })
}

export { URGENT_TYPES }
