'use client'

// ============================================================================
// FootStock — CookieConsent Banner (LGPD)
// Consentimento explicito para analytics antes de inicializar Mixpanel
// Rastreabilidade: ANALYTICS-SPEC.md EVT-036, T-029, LGPD Art. 8
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { analytics } from '@/lib/analytics'

const CONSENT_STORAGE_KEY = 'fs-cookie-consent'

type ConsentChoice = 'accepted' | 'rejected' | null

export function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const pathname = usePathname()
  const isAdminRoute = pathname?.startsWith('/admin')

  useEffect(() => {
    // Verifica se ja fez escolha
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY) as ConsentChoice
    if (!stored) {
      setVisible(true)
    }
  }, [])

  const handleAccept = useCallback(async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    setVisible(false)

    // Inicializar Mixpanel e rastrear consent_granted (EVT-036)
    analytics.init()
    analytics.track('consent_granted', {
      purposes: ['essential', 'analytics'],
    })

    // Persistir consentimento no backend se usuario logado
    try {
      await fetch('/api/v1/users/me/consents/analytics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granted: true }),
        credentials: 'include',
      })
    } catch {
      // best-effort — consentimento local ja salvo
    }
  }, [])

  const handleReject = useCallback(async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'rejected')
    setVisible(false)

    // Garantir opt-out
    analytics.disable()

    // Persistir recusa no backend
    try {
      await fetch('/api/v1/users/me/consents/analytics/revoke', {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // best-effort
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Consentimento de cookies"
      className={
        isAdminRoute
          ? 'fixed bottom-4 right-4 z-[9999] max-w-sm rounded-lg border border-[rgba(240,185,11,.18)] bg-[#1E2329] p-3 shadow-[0_12px_36px_rgba(0,0,0,.45)]'
          : 'fixed bottom-0 left-0 right-0 z-[9999] border-t border-[rgba(240,185,11,.18)] bg-[#1E2329] px-4 py-4 shadow-[0_-4px_20px_rgba(0,0,0,.4)] sm:px-6'
      }
    >
      <div className={isAdminRoute ? 'flex flex-col gap-3' : 'mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'}>
        <p className={isAdminRoute ? 'text-xs leading-5 text-[#848E9C]' : 'text-sm text-[#848E9C]'}>
          Usamos cookies de analytics para melhorar sua experiência. Seus dados são pseudonimizados e nunca compartilhamos PII.{' '}
          <a
            href="/privacidade"
            className="text-[#F0B90B] underline underline-offset-2 hover:text-[#F0B90B]/80"
          >
            Política de Privacidade
          </a>
        </p>
        <div className="flex shrink-0 justify-end gap-2">
          <button
            onClick={handleReject}
            className="rounded-lg border border-[rgba(240,185,11,.2)] bg-transparent px-3 py-2 text-sm font-medium text-[#848E9C] transition-colors hover:border-[rgba(240,185,11,.4)] hover:text-[#EAECEF]"
          >
            Recusar
          </button>
          <button
            onClick={handleAccept}
            className="rounded-lg bg-[#F0B90B] px-3 py-2 text-sm font-semibold text-[#0B0E11] transition-colors hover:bg-[#F0B90B]/90"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  )
}
