'use client'

// ============================================================================
// Foot Stock — PlanCards: 3 cards de plano (Jogador / Craque / Lenda)
// ============================================================================

import type { PlanType } from '@/lib/enums'
import { PlanIcon } from '@/components/ui/PlanIcon'
import { Btn } from '@/components/ui/Btn'
import { Badge } from '@/components/ui/Badge'
import { DividendYieldBadge } from '@/components/portfolio/DividendYieldBadge'
import { formatBRL } from '@/lib/utils/formatCurrency'
import { PLAN_HIERARCHY } from '@/lib/enums'

// ─── Configuração estática dos planos ───────────────────────────────────────

const PLAN_CONFIG: Record<PlanType, {
  name: string
  priceMonthly: number
  priceYearly: number
  bonusFS: number
  color: string
  badge?: string
  features: Array<{ label: string; included: boolean }>
}> = {
  JOGADOR: {
    name: 'Jogador',
    priceMonthly: 0,
    priceYearly: 0,
    bonusFS: 2000,
    color: '#6b7280',
    features: [
      { label: 'FS$2.000 de bônus inicial', included: true },
      { label: '2 ordens por dia', included: true },
      { label: 'Ordens a mercado', included: true },
      { label: 'Cotações com 1h de atraso', included: true },
      { label: 'Short selling', included: false },
      { label: 'Alavancagem 2x', included: false },
      { label: 'Bandas de Bollinger', included: true },
    ],
  },
  CRAQUE: {
    name: 'Craque',
    priceMonthly: 19.9,
    priceYearly: 179.1,
    bonusFS: 5000,
    color: '#F0B90B',
    badge: 'Popular',
    features: [
      { label: 'FS$5.000 de bônus inicial', included: true },
      { label: '5 ordens por dia', included: true },
      { label: 'Ordens a mercado + limitadas + agendadas', included: true },
      { label: 'Cotações com 30min de atraso', included: true },
      { label: 'Short selling', included: false },
      { label: 'Alavancagem 2x', included: false },
      { label: 'Bandas de Bollinger', included: true },
    ],
  },
  LENDA: {
    name: 'Lenda',
    priceMonthly: 39.9,
    priceYearly: 359.1,
    bonusFS: 25000,
    color: '#F0B90B',
    badge: 'Premium',
    features: [
      { label: 'FS$25.000 de bônus inicial', included: true },
      { label: 'Ordens ilimitadas', included: true },
      { label: 'Todos os tipos de ordem', included: true },
      { label: 'Cotações em tempo real', included: true },
      { label: 'Short selling', included: true },
      { label: 'Alavancagem 2x', included: true },
      { label: 'Bandas de Bollinger + MM9 + MM21', included: true },
    ],
  },
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function PlanCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-700 p-6 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-1/3 mb-4" />
      <div className="h-8 bg-gray-700 rounded w-1/2 mb-2" />
      <div className="h-4 bg-gray-700 rounded w-3/4 mb-6" />
      <div className="h-10 bg-gray-700 rounded" />
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface PlanCardsProps {
  currentPlan: PlanType
  isLoading?: boolean
  onSelectPlan: (plan: PlanType, period: 'monthly' | 'yearly') => void
  period: 'monthly' | 'yearly'
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function PlanCards({ currentPlan, isLoading = false, onSelectPlan, period }: PlanCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PlanCardSkeleton />
        <PlanCardSkeleton />
        <PlanCardSkeleton />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {(Object.keys(PLAN_CONFIG) as PlanType[]).map((plan) => {
        const config = PLAN_CONFIG[plan]
        const isCurrent = plan === currentPlan
        const isUpgrade = PLAN_HIERARCHY[plan] > PLAN_HIERARCHY[currentPlan]

        const price = period === 'yearly' ? config.priceYearly : config.priceMonthly
        const priceLabel = price === 0
          ? 'Gratuito'
          : period === 'yearly'
            ? `${formatBRL(price)}/ano`
            : `${formatBRL(price)}/mês`

        return (
          <div
            key={plan}
            className="rounded-xl border-2 p-6 flex flex-col gap-4 transition-all"
            style={{ borderColor: config.color }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlanIcon plan={plan} size={24} />
                <span className="font-semibold text-lg">{config.name}</span>
              </div>
              {config.badge && (
                <Badge variant="plan" plan={plan} className="text-xs">
                  {config.badge}
                </Badge>
              )}
            </div>

            {/* Preço */}
            <div>
              <span className="text-3xl font-bold">{priceLabel}</span>
              {period === 'yearly' && price > 0 && (
                <span className="ml-2 text-sm text-green-400 font-medium">-25%</span>
              )}
            </div>

            {/* Bônus */}
            <p className="text-sm font-medium" style={{ color: '#F0B90B' }}>
              + FS${config.bonusFS.toLocaleString('pt-BR')} para começar
            </p>

            {/* Yield badge — retorna null para JOGADOR */}
            <DividendYieldBadge plan={plan} />

            {/* Features */}
            <ul className="flex flex-col gap-1 text-sm flex-1">
              {config.features.map((f) => (
                <li key={f.label} className="flex items-center gap-2">
                  <span className={f.included ? 'text-green-400' : 'text-gray-500'} aria-hidden="true">
                    {f.included ? '✓' : '✗'}
                  </span>
                  <span className={f.included ? 'text-gray-200' : 'text-gray-500'}>{f.label}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            {isCurrent ? (
              <Btn
                variant="secondary"
                disabled
                aria-disabled="true"
                className="w-full opacity-60 cursor-not-allowed"
                data-plan={plan}
                data-testid={`plan-cta-${plan.toLowerCase()}`}
              >
                Plano Atual
              </Btn>
            ) : isUpgrade ? (
              <Btn
                variant="primary"
                className="w-full"
                data-plan={plan}
                data-testid={`plan-cta-${plan.toLowerCase()}`}
                onClick={() => onSelectPlan(plan, period)}
              >
                Assinar
              </Btn>
            ) : (
              <Btn
                variant="secondary"
                data-plan={plan}
                data-testid={`plan-cta-${plan.toLowerCase()}`}
                disabled
                aria-disabled="true"
                className="w-full opacity-60 cursor-not-allowed"
              >
                Downgrade indisponível
              </Btn>
            )}
          </div>
        )
      })}
    </div>
  )
}
