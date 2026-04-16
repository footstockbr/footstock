// lib/services/QuietHoursService.ts
// module-19 — Quiet Hours: 23h-7h BRT para notificações não urgentes
// BRT = UTC-3 fixo (Brasil aboliu horário de verão em 2019)

import type { NotificationType } from '@/types'

// Tipos urgentes — ignoram quiet hours e preferências de canal (exceto opt-out explícito)
export const URGENT_TYPES = new Set<NotificationType>([
  'ORDER_EXECUTED',             // transacional imediato
  'MARGIN_CALL_ALERT',          // 80% — crítico
  'CIRCUIT_BREAKER',            // halt de mercado
  'PAYMENT_FAILED',             // falha financeira
  'PAYMENT_CONFIRMED',          // NOTIF-005: "Quiet hours: Não aplicável (transacional)"
  'PLAN_CANCEL_ALERT',          // NOTIF-007: "Quiet hours: Não aplicável (transacional crítico)"
  'CANCELLATION_LOCK_ACTIVE',
  'CANCELLATION_LOCK_LIQUIDATED',
  'ADMIN_BROADCAST',
  'PASSWORD_RESET',
  'ACCOUNT_DELETED',
  'BRUTE_FORCE_BLOCKED',
])

// Tipos não urgentes que respeitam quiet hours
const QUIET_HOURS_TYPES = new Set<NotificationType>([
  'ORDER_CANCELLED',
  'MARGIN_CALL_WARNING',  // 50% — aviso, pode esperar
  'NEWS_FAVORITE_CLUB',
  'DIVIDEND_CREDITED',
  'BONUS_CREDITED',
  'LEAGUE_RESULT',
  'AFFILIATE_COMMISSION_EARNED',
  'AFFILIATE_INVITE_JOINED',
  'LGPD_EXPORT_READY',
  'SYSTEM_MAINTENANCE',
  'REFERRAL_JOINED',
])

const QUIET_HOURS_START_BRT = 23
const QUIET_HOURS_END_BRT = 7
const BRT_OFFSET_HOURS = 3 // UTC-3

class QuietHoursService {
  /**
   * Retorna true se o tipo deve ser enfileirado para envio às 7:00 BRT.
   * Urgentes NUNCA são suprimidos.
   */
  isQuietHour(type: NotificationType, now: Date = new Date()): boolean {
    if (URGENT_TYPES.has(type)) return false
    if (!QUIET_HOURS_TYPES.has(type)) return false

    const hourBRT = (now.getUTCHours() - BRT_OFFSET_HOURS + 24) % 24
    return hourBRT >= QUIET_HOURS_START_BRT || hourBRT < QUIET_HOURS_END_BRT
  }

  /**
   * Calcula o próximo horário de 07:00 BRT a partir de agora.
   * Usado para definir scheduledFor na fila de quiet hours.
   */
  nextDeliveryAt(now: Date = new Date()): Date {
    const utcMs = now.getTime()
    // Hora BRT atual
    const hourBRT = (now.getUTCHours() - BRT_OFFSET_HOURS + 24) % 24
    const minBRT = now.getUTCMinutes()

    // Se já passou das 07:00 BRT, programar para 07:00 BRT do dia seguinte
    const hoursUntil7am =
      hourBRT < QUIET_HOURS_END_BRT
        ? QUIET_HOURS_END_BRT - hourBRT
        : 24 - hourBRT + QUIET_HOURS_END_BRT

    const msUntil7am = (hoursUntil7am * 60 - minBRT) * 60 * 1000 - now.getUTCSeconds() * 1000
    return new Date(utcMs + msUntil7am)
  }

  isUrgent(type: NotificationType): boolean {
    return URGENT_TYPES.has(type)
  }
}

export const quietHoursService = new QuietHoursService()
