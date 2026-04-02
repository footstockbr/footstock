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

export class PushService {
  async sendToUser(userId: string, payload: { title: string; body: string }): Promise<void> {
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
}

export const pushService = new PushService()
