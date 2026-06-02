'use client'

// ============================================================================
// SubscriptionActions — wrapper client para ações da página de assinatura
// Gerencia estado do modal de cancelamento e botão de reversão
// Usado na assinatura/page.tsx (Server Component)
// ============================================================================

import { useState } from 'react'
import { CancellationModal } from './CancellationModal'
import { RevertCancellationButton } from './RevertCancellationButton'

interface Props {
  planType: string
  status: string
  canCancel: boolean
  isEligibleForRefund: boolean
}

export function SubscriptionActions({ planType, status, canCancel, isEligibleForRefund }: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  const inCancellationLock = status === 'CANCELLATION_LOCK'

  return (
    <>
      {inCancellationLock && (
        <RevertCancellationButton className="w-full" />
      )}

      {canCancel && !inCancellationLock && (
        <button
          onClick={() => setModalOpen(true)}
          className="w-full py-2.5 rounded-lg border border-[rgba(246,70,93,.2)] text-[#F6465D] text-sm hover:bg-[rgba(246,70,93,.06)] transition-colors"
          data-testid="cancel-subscription-button"
        >
          Cancelar assinatura
        </button>
      )}

      <CancellationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        planType={planType}
        isEligibleForRefund={isEligibleForRefund}
      />
    </>
  )
}
