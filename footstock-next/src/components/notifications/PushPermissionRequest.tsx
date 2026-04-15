'use client'

import { Bell, BellOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotification } from '@/hooks/usePushNotification'

/**
 * Componente de CTA para ativar Web Push Notifications.
 * - Exibe apenas se browser suporta push E permissao nao foi concedida.
 * - Estado "denied" mostra instrucoes para reativar nas configuracoes do browser.
 * - Estado "dismissed" nao renderiza (usuario preferiu nao ativar).
 * - Estado "unsupported" nao renderiza (fallback para inbox in-app).
 */
export function PushPermissionRequest() {
  const { permissionState, isLoading, requestPermissionAndSubscribe, dismissRequest } =
    usePushNotification()

  if (
    permissionState === 'granted' ||
    permissionState === 'dismissed' ||
    permissionState === 'unsupported'
  ) {
    return null
  }

  if (permissionState === 'denied') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-xl border border-[#2B3139] bg-[#1A1F26] p-4 flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <BellOff className="w-4 h-4 text-[#929AA5] shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium text-[#EAECEF]">Notificações bloqueadas</p>
        </div>
        <p className="text-xs text-[#929AA5] leading-relaxed">
          Para receber alertas em tempo real, habilite notificações nas{' '}
          <strong className="text-[#EAECEF]">Configurações do navegador</strong>{' '}
          &rsaquo; Permissões do site &rsaquo; Notificações.
        </p>
      </div>
    )
  }

  // Estado "default" — CTA explícita
  return (
    <div
      role="region"
      aria-label="Ativar notificações push"
      className="rounded-xl border border-[#2B3139] bg-[#1A1F26] p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#F0B90B] shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium text-[#EAECEF]">Ativar notificações</p>
        </div>
        <button
          onClick={dismissRequest}
          aria-label="Dispensar solicitação de notificações"
          className="text-[#929AA5] hover:text-[#EAECEF] transition-colors p-0.5 rounded"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <p className="text-xs text-[#929AA5] leading-relaxed">
        Receba alertas de MARGIN_CALL e Circuit Breaker em tempo real, mesmo com o app fechado.
      </p>

      <Button
        onClick={requestPermissionAndSubscribe}
        disabled={isLoading}
        size="sm"
        className="w-full bg-[#F0B90B] hover:bg-[#d4a109] text-[#0B0E11] font-semibold"
        aria-busy={isLoading}
      >
        {isLoading ? 'Aguarde...' : 'Ativar notificações'}
      </Button>
    </div>
  )
}
