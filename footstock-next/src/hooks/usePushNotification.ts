'use client'

import { useState, useEffect, useCallback } from 'react'
import { analytics } from '@/lib/analytics'

const SW_PATH = '/sw-push.js'
const DISMISSED_KEY = 'push_permission_dismissed'

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'dismissed' | 'unsupported'

export interface UsePushNotificationReturn {
  permissionState: PushPermissionState
  isSupported: boolean
  isSubscribed: boolean
  isLoading: boolean
  requestPermissionAndSubscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
  dismissRequest: () => void
}

function getIsSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

function saveDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // Falha silenciosa
  }
}

async function subscribeOnServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys) return

  const res = await fetch('/api/v1/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      userAgent: navigator.userAgent,
    }),
  })

  if (!res.ok) {
    throw new Error(`[usePushNotification] subscribe falhou: ${res.status}`)
  }
}

async function unsubscribeOnServer(endpoint: string): Promise<void> {
  const res = await fetch('/api/v1/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })

  if (!res.ok) {
    throw new Error(`[usePushNotification] unsubscribe falhou: ${res.status}`)
  }
}

function resolveInitialState(isSupported: boolean): PushPermissionState {
  if (!isSupported) return 'unsupported'

  // Permissao do browser tem precedencia — reflete realidade atual
  const perm = Notification.permission
  if (perm === 'granted') return 'granted'
  if (perm === 'denied') return 'denied'

  // dismissed so e relevante quando permissao ainda eh default
  if (readDismissed()) return 'dismissed'

  return 'default'
}

/**
 * Hook completo de Web Push:
 * - Detecta suporte ao browser
 * - Gerencia estado: default | granted | denied | dismissed | unsupported
 * - Persiste recusa do usuario em localStorage (nao pede novamente)
 * - Expoe requestPermissionAndSubscribe() para uso em CTA explicita
 * - Expoe unsubscribe() para settings
 */
export function usePushNotification(): UsePushNotificationReturn {
  const supported = getIsSupported()
  const [permissionState, setPermissionState] = useState<PushPermissionState>(() =>
    resolveInitialState(supported)
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Verificar se ja tem subscription ao montar
  useEffect(() => {
    if (!supported || permissionState !== 'granted') return

    navigator.serviceWorker
      .register(SW_PATH)
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setIsSubscribed(!!sub)
      })
      .catch(() => {})
  }, [supported, permissionState])

  const requestPermissionAndSubscribe = useCallback(async () => {
    if (!supported) return
    if (isLoading) return

    setIsLoading(true)
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) return

      const reg = await navigator.serviceWorker.register(SW_PATH)
      const permission = await Notification.requestPermission()

      if (permission === 'denied') {
        setPermissionState('denied')
        // EVT-045: push_permission_denied
        // plan e obtido das super properties registradas pelo Mixpanel (fallback JOGADOR)
        analytics.track('push_permission_denied', { plan: 'JOGADOR' })
        return
      }

      if (permission !== 'granted') return

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      })

      await subscribeOnServer(sub)
      setPermissionState('granted')
      setIsSubscribed(true)
      // EVT-044: push_permission_granted
      // plan e obtido das super properties registradas pelo Mixpanel (fallback JOGADOR)
      analytics.track('push_permission_granted', { plan: 'JOGADOR' })
    } catch {
      // Falha silenciosa — push e complementar ao inbox in-app
    } finally {
      setIsLoading(false)
    }
  }, [supported, isLoading])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setIsLoading(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH)
      if (!reg) return

      const sub = await reg.pushManager.getSubscription()
      if (!sub) return

      await unsubscribeOnServer(sub.endpoint)
      await sub.unsubscribe()
      setIsSubscribed(false)
    } catch {
      // Falha silenciosa
    } finally {
      setIsLoading(false)
    }
  }, [supported])

  const dismissRequest = useCallback(() => {
    saveDismissed()
    setPermissionState('dismissed')
  }, [])

  return {
    permissionState,
    isSupported: supported,
    isSubscribed,
    isLoading,
    requestPermissionAndSubscribe,
    unsubscribe,
    dismissRequest,
  }
}
