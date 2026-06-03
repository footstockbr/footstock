'use client'

import { CheckCircle2, Lock } from 'lucide-react'
import { useState } from 'react'
import { PlanCTAButton } from '@/components/payments/PlanCTAButton'

export interface PremiumFeatureSpec {
  id: string
  name: string
  title: string
  description: string
  requiredPlan: 'CRAQUE' | 'LENDA'
  icon: React.ReactNode
  color: 'amber' | 'red' | 'purple'
}

interface PremiumFeatureCardProps {
  feature: PremiumFeatureSpec
  hasAccess: boolean
}

const COLOR_CLASSES = {
  amber: {
    gradient: 'from-[#F0B90B]/20 to-[#8a6820]/10',
    border: 'border-[#F0B90B]/30',
    text: 'text-[#F0B90B]',
  },
  red: {
    gradient: 'from-[#F6465D]/20 to-[#8B2E2E]/10',
    border: 'border-[#F6465D]/30',
    text: 'text-[#F6465D]',
  },
  purple: {
    gradient: 'from-[#9333EA]/20 to-[#6B21A8]/10',
    border: 'border-[#9333EA]/30',
    text: 'text-[#9333EA]',
  },
}

export function PremiumFeatureCard({ feature, hasAccess }: PremiumFeatureCardProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const colors = COLOR_CLASSES[feature.color]

  // Se tem acesso, mostra card habilitado
  if (hasAccess) {
    return (
      <div
        data-testid={`premium-feature-card-${feature.id}`}
        className={`relative rounded-lg border p-3 bg-gradient-to-br ${colors.gradient} ${colors.border} transition-all duration-200`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className={`mt-0.5 shrink-0 ${colors.text}`}>{feature.icon}</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold leading-snug text-[#EAECEF]">{feature.title}</h3>
              <p className="mt-1 text-xs leading-snug text-[#929AA5]">{feature.description}</p>
            </div>
          </div>
          <div className="mt-auto flex items-center gap-1 text-[10px] font-medium text-[#4ade80]">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Desbloqueado
          </div>
        </div>
      </div>
    )
  }

  // Se não tem acesso, mostra card bloqueado sem overlay sobre o conteúdo.
  return (
    <>
      <button
        type="button"
        data-testid={`premium-feature-card-${feature.id}`}
        onClick={() => setShowUpgradeModal(true)}
        className={`relative flex min-h-[132px] w-full flex-col rounded-lg border p-3 text-left bg-gradient-to-br ${colors.gradient} ${colors.border} transition-all duration-200 hover:bg-[#2B3139]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(240,185,11,.55)]`}
        aria-label={`Desbloquear ${feature.title}. Requer plano ${feature.requiredPlan}`}
      >
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className={`mt-0.5 shrink-0 ${colors.text}`}>{feature.icon}</div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[rgba(240,185,11,.28)] bg-[rgba(240,185,11,.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F0B90B]">
              <Lock className="h-3 w-3" aria-hidden="true" />
              {feature.requiredPlan}
            </span>
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-snug text-[#EAECEF]">
              {feature.title}
            </h3>
            <p className="mt-1 text-xs leading-snug text-[#929AA5]">
              {feature.description}
            </p>
          </div>

          <div className="mt-auto pt-1 text-[11px] font-medium leading-snug text-[#F0B90B]">
            Requer {feature.requiredPlan}
          </div>
        </div>
      </button>

      {/* Modal de upgrade */}
      {showUpgradeModal && (
        <div
          data-testid={`premium-feature-locked-${feature.id}`}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowUpgradeModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`premium-feature-upgrade-title-${feature.id}`}
        >
          <div
            className="w-full max-w-[360px] rounded-xl border border-[rgba(240,185,11,.2)] bg-[#1E2329] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5">
              <h2
                id={`premium-feature-upgrade-title-${feature.id}`}
                className="text-base font-bold leading-snug text-[#EAECEF]"
              >
                Desbloqueie {feature.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#929AA5]">
                {feature.description}
              </p>
            </div>

            <PlanCTAButton
              planType={feature.requiredPlan}
              label={`Fazer upgrade para ${feature.requiredPlan}`}
              featureBlocked={`order_confirmation_${feature.id}`}
            />

            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="mt-3 w-full rounded-md border border-[rgba(240,185,11,.15)] bg-transparent p-2 text-xs text-[#929AA5] transition-colors hover:border-[rgba(240,185,11,.35)] hover:text-[#EAECEF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(240,185,11,.55)]"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
