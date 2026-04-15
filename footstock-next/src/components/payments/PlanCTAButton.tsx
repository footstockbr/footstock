'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { CheckoutButton } from '@/components/payments/CheckoutButton'
import { useAnalytics } from '@/hooks/useAnalytics'
import { usePlanGuard } from '@/hooks/usePlanGuard'

type PlanType = 'CRAQUE' | 'LENDA'

interface PlanCTAButtonProps {
  planType: PlanType
  label: string
  /** Feature que motivou o upgrade prompt (ex: 'planos_page') */
  featureBlocked?: string
  'data-testid'?: string
  className?: string
}

export function PlanCTAButton({ planType, label, featureBlocked = 'planos_page', className, ...props }: PlanCTAButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { track } = useAnalytics()
  const { plan: currentPlan } = usePlanGuard()

  // EVT-019: plan_upgrade_clicked — when user clicks the upgrade CTA button
  function handleUpgradeClick() {
    track('plan_upgrade_clicked', {
      origin: featureBlocked,
      current_plan: currentPlan,
    })
    setIsOpen(true)
  }

  // EVT-015: upgrade_prompt_shown — when the checkout modal is rendered
  useEffect(() => {
    if (!isOpen) return
    track('upgrade_prompt_shown', {
      feature_blocked: featureBlocked,
      current_plan: currentPlan,
      required_plan: planType,
    })
  }, [isOpen, track, featureBlocked, currentPlan, planType])

  return (
    <>
      <Button
        variant="plan"
        size="md"
        fullWidth
        onClick={handleUpgradeClick}
        className={className}
        {...props}
      >
        {label}
      </Button>

      {isOpen && (
        <div
          data-testid={`plan-checkout-modal-${planType.toLowerCase()}`}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: '#1E2329',
              border: '1px solid rgba(240,185,11,.2)',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '360px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#EAECEF', fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
              {planType === 'CRAQUE' ? 'Assinar Craque' : 'Assinar Lenda'}
            </h2>
            <p style={{ color: '#929AA5', fontSize: '12px', marginBottom: '20px' }}>
              Escolha a forma de pagamento para continuar
            </p>

            <CheckoutButton planType={planType} label={label} />

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '8px',
                background: 'transparent',
                border: '1px solid rgba(240,185,11,.15)',
                borderRadius: '6px',
                color: '#929AA5',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
