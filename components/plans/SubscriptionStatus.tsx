'use client'

// ============================================================================
// Foot Stock — SubscriptionStatus: badge de status com countdown CANCELLATION_LOCK
// Reage em tempo real a notificações de pagamento
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanType } from '@/lib/enums'
import { SUBSCRIPTION_STATUS } from '@/lib/enums'
import { ROUTES } from '@/lib/constants'
import { PlanIcon } from '@/components/ui/PlanIcon'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'

interface CancellationLockInfo {
  expiresAt: string
  hoursRemaining: number
  requiresLiquidation: boolean
}

interface BonusCredit {
  amount: number
  scheduledAt: string | null
  credited: boolean
}

interface SubscriptionStatusData {
  planType: PlanType
  status: string
  expiresAt?: string
  daysUntilExpiry?: number
  cancellationLock?: CancellationLockInfo | null
  bonusCredit?: BonusCredit | null
}

interface SubscriptionStatusProps {
  subscription: SubscriptionStatusData | null
  compact?: boolean
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const getRemaining = useCallback(() => {
    return Math.max(0, new Date(expiresAt).getTime() - Date.now())
  }, [expiresAt])

  const [remaining, setRemaining] = useState(getRemaining)

  useEffect(() => {
    const interval = setInterval(() => setRemaining(getRemaining()), 1000)
    return () => clearInterval(interval)
  }, [getRemaining])

  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)

  if (remaining === 0) {
    return <span className="text-red-400 text-sm font-medium animate-pulse">Liquidação em andamento...</span>
  }

  return (
    <span className="text-red-300 font-mono text-sm tabular-nums">
      {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}min para liquidação manual
    </span>
  )
}

export function SubscriptionStatus({ subscription, compact = false }: SubscriptionStatusProps) {
  const router = useRouter()
  const [announcement, setAnnouncement] = useState('')

  const status = subscription?.status ?? 'FREE'
  const planType = subscription?.planType ?? 'JOGADOR'

  // Anunciar mudanças de status para screen readers
  useEffect(() => {
    if (subscription?.status) {
      setAnnouncement(`Status do plano atualizado: ${subscription.status}`)
    }
  }, [subscription?.status])

  const renderBadge = () => {
    switch (status) {
      case 'ACTIVE':
        return (
          <div className="flex items-center gap-2">
            <Badge variant="success" className="flex items-center gap-1 bg-green-900/40 text-green-400 border-green-700">
              <PlanIcon plan={planType} size={14} />
              Plano Ativo
            </Badge>
          </div>
        )
      case 'TRIAL':
        return (
          <Badge variant="default" className="bg-blue-900/40 text-blue-400 border-blue-700">
            Período Trial
            {subscription?.expiresAt && (
              <span className="ml-1 text-xs opacity-80">
                · expira {new Date(subscription.expiresAt).toLocaleDateString('pt-BR')}
              </span>
            )}
          </Badge>
        )
      case 'CANCELLATION_LOCK':
        return (
          <div className="flex flex-col gap-1">
            <Badge variant="error" className="bg-red-900/40 text-red-400 border-red-700 animate-pulse w-fit">
              Cancelamento em Andamento
            </Badge>
            {subscription?.cancellationLock?.expiresAt && (
              <CountdownTimer expiresAt={subscription.cancellationLock.expiresAt} />
            )}
          </div>
        )
      case 'EXPIRED':
        return (
          <Badge variant="error" className="bg-red-900/40 text-red-400 border-red-700">
            Plano Expirado
          </Badge>
        )
      case 'SUSPENDED':
        return (
          <Badge variant="warning" className="bg-orange-900/40 text-orange-400 border-orange-700">
            Conta Suspensa
          </Badge>
        )
      default:
        return (
          <Badge variant="default" className="bg-gray-800 text-gray-400 border-gray-600">
            Plano Gratuito
          </Badge>
        )
    }
  }

  if (compact) {
    return (
      <div role="status" aria-live="polite" aria-label="Status da assinatura">
        <span className="sr-only" aria-live="polite">{announcement}</span>
        {renderBadge()}
      </div>
    )
  }

  return (
    <div role="status" aria-live="polite" aria-label="Status da assinatura" className="space-y-2">
      <span className="sr-only" aria-live="polite">{announcement}</span>

      {renderBadge()}

      {/* Expiração */}
      {subscription?.daysUntilExpiry !== undefined && status === SUBSCRIPTION_STATUS.ACTIVE && (
        <p className={`text-xs ${subscription.daysUntilExpiry > 7 ? 'text-green-400' : 'text-orange-400'}`}>
          {subscription.daysUntilExpiry > 0
            ? `Expira em ${subscription.daysUntilExpiry} dia(s)`
            : 'Expirado'}
        </p>
      )}

      {/* Posições afetadas em CANCELLATION_LOCK */}
      {status === SUBSCRIPTION_STATUS.CANCELLATION_LOCK && subscription?.cancellationLock?.requiresLiquidation && (
        <div className="mt-2">
          <Btn
            variant="secondary"
            className="text-xs border-yellow-600 text-yellow-400 hover:bg-yellow-900/20 h-7 px-3"
            onClick={() => router.push(`${ROUTES.PORTFOLIO}?tab=posicoes`)}
          >
            Liquidar posições
          </Btn>
        </div>
      )}

      {/* CTAs por estado */}
      {(status === SUBSCRIPTION_STATUS.EXPIRED || status === SUBSCRIPTION_STATUS.SUSPENDED) && (
        <Btn
          variant="primary"
          className="mt-2 h-8 text-sm px-4"
          onClick={() => router.push(ROUTES.PLANOS)}
          data-testid="btn-renovar"
        >
          Renovar
        </Btn>
      )}

      {(!subscription || status === 'FREE') && (
        <Btn
          variant="secondary"
          className="mt-2 h-8 text-sm px-4"
          onClick={() => router.push(ROUTES.PLANOS)}
          data-testid="btn-ver-planos"
        >
          Ver planos
        </Btn>
      )}

      {/* Bônus pendente */}
      {subscription?.bonusCredit?.scheduledAt && !subscription.bonusCredit.credited && (
        <p className="text-xs text-yellow-500 mt-1">
          Bônus pendente em{' '}
          {Math.ceil(
            (new Date(subscription.bonusCredit.scheduledAt).getTime() - Date.now()) / 86_400_000
          )}{' '}
          dia(s)
        </p>
      )}
    </div>
  )
}
