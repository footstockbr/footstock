'use client'

import { useEffect, useRef } from 'react'

const SW_PATH = '/sw-push.js'

/**
 * Registra o Service Worker de Web Push silenciosamente.
 * NAO solicita permissao — isso e responsabilidade de usePushNotification.
 * Se usuario ja tem permissao granted E ja tem chave VAPID configurada,
 * sincroniza a subscription existente sem pedir nada ao usuario.
 */
export function usePushRegistration(userId?: string | null) {
  const syncedRef = useRef(false)

  useEffect(() => {
    if (!userId || syncedRef.current) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission !== 'granted') return

    const syncSubscription = async () => {
      try {
        const reg = await navigator.serviceWorker.register(SW_PATH)
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) return

        const existingSub = await reg.pushManager.getSubscription()
        if (!existingSub) return

        const json = existingSub.toJSON()
        if (!json.endpoint || !json.keys) return

        await fetch('/api/v1/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: {
              p256dh: json.keys.p256dh,
              auth: json.keys.auth,
            },
          }),
        })

        syncedRef.current = true
      } catch {
        // Falha silenciosa — push e complementar ao inbox in-app
      }
    }

    syncSubscription()
  }, [userId])
}
