'use client'

import { useEffect, useRef } from 'react'

/**
 * Registra o Service Worker de Web Push e solicita permissao de notificacoes.
 * Deve ser chamado apos o login, quando o userId esta disponivel.
 */
export function usePushRegistration(userId?: string | null) {
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!userId || registeredRef.current) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const registerPush = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw-push.js')
        const permission = await Notification.requestPermission()

        if (permission !== 'granted') return

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) return

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        })

        const json = sub.toJSON()
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

        registeredRef.current = true
      } catch {
        // Falha silenciosa — push e complementar ao inbox in-app
      }
    }

    registerPush()
  }, [userId])
}
