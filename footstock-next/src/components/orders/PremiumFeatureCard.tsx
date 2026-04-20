'use client'

import { Lock } from 'lucide-react'
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
        className={`relative rounded-lg border p-3 bg-gradient-to-br ${colors.gradient} ${colors.border} transition-all duration-200 hover:border-opacity-60 cursor-pointer group`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <div className={`mt-0.5 ${colors.text}`}>{feature.icon}</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-[#EAECEF]">{feature.title}</h3>
              <p className="text-xs text-[#929AA5] mt-0.5 line-clamp-2">{feature.description}</p>
            </div>
          </div>
          <div className="text-[10px] font-medium text-[#4ade80] flex items-center gap-1 mt-1">
            ✓ Desbloqueado
          </div>
        </div>
      </div>
    )
  }

  // Se não tem acesso, mostra card bloqueado com overlay
  return (
    <>
      <div
        data-testid={`premium-feature-card-${feature.id}`}
        onClick={() => setShowUpgradeModal(true)}
        className={`relative rounded-lg border p-3 bg-gradient-to-br ${colors.gradient} ${colors.border} transition-all duration-200 cursor-pointer overflow-hidden group`}
      >
        {/* Conteúdo semi-transparente */}
        <div className="opacity-40 group-hover:opacity-50 transition-opacity">
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <div className={`mt-0.5 ${colors.text}`}>{feature.icon}</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[#EAECEF]">{feature.title}</h3>
                <p className="text-xs text-[#929AA5] mt-0.5 line-clamp-2">{feature.description}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Overlay com lock + CTA */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40 group-hover:bg-black/50 transition-colors">
          <Lock className="h-4 w-4 text-[#F0B90B]" aria-hidden="true" />
          <span className="text-[11px] font-semibold text-white text-center px-2">
            Requer <br /> {feature.requiredPlan}
          </span>
        </div>
      </div>

      {/* Modal de upgrade */}
      {showUpgradeModal && (
        <div
          data-testid={`premium-feature-locked-${feature.id}`}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setShowUpgradeModal(false)}
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
            <h2 style={{ color: '#EAECEF', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
              Desbloqueie {feature.title}
            </h2>
            <p style={{ color: '#929AA5', fontSize: '13px', marginBottom: '20px', lineHeight: '1.5' }}>
              {feature.description}
            </p>

            <PlanCTAButton
              planType={feature.requiredPlan}
              label={`Fazer upgrade para ${feature.requiredPlan}`}
              featureBlocked={`order_confirmation_${feature.id}`}
            />

            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
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
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
