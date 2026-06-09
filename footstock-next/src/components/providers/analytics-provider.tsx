'use client'

// ============================================================================
// FootStock — AnalyticsProvider
// Inicializacao condicional Mixpanel baseada em consentimento LGPD
// Rastreabilidade: ANALYTICS-SPEC.md, T-029
// ============================================================================

import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react'
import {
  analytics,
  type AnalyticsEvents,
  type UserProperties,
} from '@/lib/analytics'

// === Context ===

interface AnalyticsContextValue {
  track: <E extends keyof AnalyticsEvents>(event: E, properties: AnalyticsEvents[E]) => void
  page: (pageName: string, properties?: Record<string, unknown>) => void
  identify: (userId: string, properties: UserProperties) => void
  reset: () => void
  isEnabled: () => boolean
}

const AnalyticsContext = createContext<AnalyticsContextValue>({
  track: () => {},
  page: () => {},
  identify: () => {},
  reset: () => {},
  isEnabled: () => false,
})

// === Provider ===

async function checkConsentAndInit() {
  try {
    // Gate de sessao: este provider vive no root layout e monta tambem em paginas
    // publicas/login, onde nao ha sessao. Chamar /api/v1/me direto gera um 401 no
    // console (a rota e auth-gated). /api/auth/session retorna 200 + null quando
    // deslogado, entao usamos ele como gate sem ruido.
    const sessionRes = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'include' })
    const session = sessionRes.ok ? await sessionRes.json() : null
    if (!session?.user?.id) return // Sem sessao — nao inicializa nem chama /api/v1/me

    const res = await fetch('/api/v1/me', { cache: 'no-store', credentials: 'include' })
    if (!res.ok) return // Usuario nao logado — nao inicializa

    const json = await res.json()
    const user = json.data ?? json

    // Verificar se usuario concedeu consentimento analytics
    const consents: Array<{ purpose: string; granted: boolean }> = user.consents ?? []
    const hasAnalyticsConsent = consents.some(
      (c) => c.purpose === 'analytics' && c.granted
    )

    if (!hasAnalyticsConsent) return // Sem consentimento — nao rastrear

    // Inicializar Mixpanel
    analytics.init()

    // Identificar usuario com propriedades nao-PII
    if (user.id) {
      analytics.identify(user.id, {
        plan: user.plan ?? 'JOGADOR',
        investorProfile: user.investorProfile ?? 'INICIANTE',
        userType: user.userType ?? 'NORMAL',
        affiliateCode: user.affiliateCode ?? null,
        referredByCode: user.referredByCode ?? null,
        createdAt: user.createdAt ?? new Date().toISOString(),
      })
    }
  } catch {
    // Falha silenciosa — analytics nunca deve quebrar o app
  }
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Verificar consentimento analytics antes de inicializar
    checkConsentAndInit()
  }, [])

  const track = useCallback(<E extends keyof AnalyticsEvents>(
    event: E,
    properties: AnalyticsEvents[E]
  ) => {
    analytics.track(event, properties)
  }, [])

  const page = useCallback((pageName: string, properties?: Record<string, unknown>) => {
    analytics.page(pageName, properties)
  }, [])

  const identify = useCallback((userId: string, properties: UserProperties) => {
    analytics.identify(userId, properties)
  }, [])

  const reset = useCallback(() => {
    analytics.reset()
  }, [])

  const isEnabled = useCallback(() => {
    return analytics.isEnabled()
  }, [])

  // Listener para eventos de push notification do Service Worker (EVT-046, EVT-047)
  useEffect(() => {
    function handleSWMessage(event: MessageEvent) {
      if (!analytics.isEnabled()) return

      if (event.data?.type === 'ANALYTICS_PUSH_RECEIVED') {
        analytics.track('push_notification_received', {
          notification_type: event.data.notification_type ?? 'ADMIN_BROADCAST',
          plan: 'JOGADOR', // super property resolve o valor real
        })
      }

      if (event.data?.type === 'ANALYTICS_PUSH_CLICKED') {
        analytics.track('push_notification_clicked', {
          notification_type: event.data.notification_type ?? 'ADMIN_BROADCAST',
          time_to_click_seconds: event.data.time_to_click_seconds,
          plan: 'JOGADOR',
        })
      }
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage)
      return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage)
    }
  }, [])

  return (
    <AnalyticsContext value={{ track, page, identify, reset, isEnabled }}>
      {children}
    </AnalyticsContext>
  )
}

// === Hook ===

export function useAnalytics() {
  return useContext(AnalyticsContext)
}
