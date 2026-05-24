'use client'

import { useEffect, useRef } from 'react'

/**
 * Monta silenciosamente o sync de subscription de push para usuarios que
 * ja concederam permissao. Nao solicita permissao — isso e feito via CTA explicita.
 * Colocar no app layout para que o sync ocorra em toda navegacao autenticada.
 */
export function PushSyncBootstrap() {
  const syncedRef = useRef(false)

  useEffect(() => {
    if (syncedRef.current) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission !== 'granted') return

    const run = async () => {
      try {
        const sessionRes = await fetch('/api/v1/auth/session', { credentials: 'include' })
        if (!sessionRes.ok) return
        const sessionData = await sessionRes.json()
        if (!sessionData?.user?.id) return

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) return

        const reg = await navigator.serviceWorker.register('/sw-push.js')
        const sub = await reg.pushManager.getSubscription()
        if (!sub) return

        const json = sub.toJSON()
        if (!json.endpoint || !json.keys) return

        const res = await fetch('/api/v1/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          }),
        })

        if (!res.ok) return // Nao marcar synced — tentara novamente no proximo mount
        syncedRef.current = true
      } catch {
        // Falha silenciosa — push e complementar
      }
    }

    run()
  }, [])

  return null
}
