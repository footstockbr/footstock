// lib/services/PushService.ts
// module-19 — Envio de Web Push notifications server-side

import webpush from 'web-push'
import { pushSubscriptionRepository } from '@/lib/repositories/PushSubscriptionRepository'

let initialized = false

function initVapid() {
  if (initialized) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!publicKey || !privateKey) {
    console.warn('[PushService] VAPID keys não configuradas — push desabilitado.')
    return
  }

  webpush.setVapidDetails('mailto:admin@footstock.app', publicKey, privateKey)
  initialized = true
}

export interface BulkSendResult {
  attemptedUsers: number
  sentSubscriptions: number
  expiredSubscriptions: number
  failures: number
}

export interface PushPayload {
  title: string
  body: string
  /** URL para abrir ao clicar na notificacao (ex: '/inbox') */
  url?: string
  /** Tag para agrupar notificacoes do mesmo tipo */
  tag?: string
  /** Contador de nao lidas para atualizar o app badge */
  badgeCount?: number
}

export class PushService {
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    initVapid()

    if (!initialized) return

    const subscriptions = await pushSubscriptionRepository.findByUserId(userId)
    if (subscriptions.length === 0) return

    const payloadStr = JSON.stringify(payload)

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payloadStr
          )
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 410) {
            // Subscription expirada — limpar automaticamente
            await pushSubscriptionRepository.deleteByEndpoint(userId, sub.endpoint).catch(() => {})
          } else {
            console.error('[PushService] Erro ao enviar push para', sub.endpoint, err)
          }
        }
      })
    )
  }

  /**
   * Broadcast para multiplos usuarios (ex: admin, circuit breaker global).
   * Deduplica userIds e retorna metricas agregadas.
   * Preserva cleanup de subscriptions expiradas (410 Gone).
   */
  async sendBulk(
    userIds: string[],
    payload: PushPayload
  ): Promise<BulkSendResult> {
    initVapid()

    const result: BulkSendResult = {
      attemptedUsers: 0,
      sentSubscriptions: 0,
      expiredSubscriptions: 0,
      failures: 0,
    }

    if (!initialized) return result

    const uniqueUserIds = [...new Set(userIds)]
    result.attemptedUsers = uniqueUserIds.length

    const payloadStr = JSON.stringify(payload)

    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        const subscriptions = await pushSubscriptionRepository.findByUserId(userId)

        await Promise.all(
          subscriptions.map(async (sub) => {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payloadStr
              )
              result.sentSubscriptions++
            } catch (err: unknown) {
              const status = (err as { statusCode?: number }).statusCode
              if (status === 410) {
                result.expiredSubscriptions++
                await pushSubscriptionRepository
                  .deleteByEndpoint(userId, sub.endpoint)
                  .catch(() => {})
              } else {
                result.failures++
                console.error('[PushService] sendBulk — erro para', sub.endpoint, err)
              }
            }
          })
        )
      })
    )

    return result
  }
}

export const pushService = new PushService()
