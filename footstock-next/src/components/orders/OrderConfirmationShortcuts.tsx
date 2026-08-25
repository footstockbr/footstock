'use client'

import { Lightbulb, TrendingDown, TrendingUp, Zap } from 'lucide-react'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { PLAN_FEATURES, type PlanFeature } from '@/lib/auth/planAccess'
import {
  LEVERAGE_DAILY_INTEREST_PERCENT_LABEL,
  LEVERAGE_REQUIRED_PLAN,
} from '@/lib/constants/leverage'
import { PLAN_HIERARCHY, type PlanType } from '@/lib/enums'
import { PremiumFeatureCard, type PremiumFeatureSpec } from './PremiumFeatureCard'

/**
 * Menor plano da hierarquia que concede a feature, lido do MESMO mapa que o gate
 * consulta (`PLAN_FEATURES` em `@/lib/auth/planAccess`). Retorna null quando
 * nenhum plano concede a feature.
 */
export function minimumPlanForFeature(feature: PlanFeature): PlanType | null {
  const ordered = (Object.keys(PLAN_FEATURES) as PlanType[]).sort(
    (a, b) => PLAN_HIERARCHY[a] - PLAN_HIERARCHY[b],
  )
  return ordered.find((plan) => PLAN_FEATURES[plan].includes(feature)) ?? null
}

/**
 * Plano anunciado no card premium, derivado do mapa de features em vez de literal.
 * Task 19: o item `oco` declarava 'CRAQUE' enquanto `planAccess` so concede
 * `oco_orders` a LENDA, entao um usuario CRAQUE via a feature anunciada como
 * incluida no plano dele e batia no gate ao tentar usar. Derivando aqui, a
 * divergencia nao pode ser reintroduzida por edicao isolada do card.
 *
 * Feature sem plano concedente cai em LENDA (o tier mais alto), que e a leitura
 * conservadora: nunca anunciar acesso que o gate nega. Feature concedida ao plano
 * gratuito nao pertence a este card e por isso nao tem caso aqui.
 */
export function premiumPlanForFeature(feature: PlanFeature): 'CRAQUE' | 'LENDA' {
  return minimumPlanForFeature(feature) === 'CRAQUE' ? 'CRAQUE' : 'LENDA'
}

interface OrderConfirmationShortcutsProps {
  /** Tipo de operação para contexto (BUY/SELL) */
  operationType?: 'BUY' | 'SELL'
}

const PREMIUM_FEATURES: PremiumFeatureSpec[] = [
  {
    id: 'short',
    name: 'Short Selling',
    title: 'Short Selling',
    description: 'Venda descoberta com margem 150%. Aluguel 0,5%/dia.',
    requiredPlan: premiumPlanForFeature('short_orders'),
    icon: <TrendingDown className="h-5 w-5" />,
    color: 'red',
  },
  {
    id: 'leverage',
    name: 'Alavancagem 2x',
    title: 'Alavancagem 2x',
    description: `Amplifique seus ganhos com crédito virtual. Juros ${LEVERAGE_DAILY_INTEREST_PERCENT_LABEL}/dia.`,
    requiredPlan: LEVERAGE_REQUIRED_PLAN,
    icon: <TrendingUp className="h-5 w-5" />,
    color: 'purple',
  },
  {
    id: 'oco',
    name: 'OCO / Stop Loss',
    title: 'OCO / Stop Loss',
    description: 'Ordens condicionais com proteção automática de perdas.',
    requiredPlan: premiumPlanForFeature('oco_orders'),
    icon: <Zap className="h-5 w-5" />,
    color: 'amber',
  },
]

/**
 * OrderConfirmationShortcuts — Exibe ferramentas premium ao lado do botão de confirmação de ordem.
 * Permite ao usuário descobrir features avançadas e fazer upgrade dentro do fluxo de compra/venda.
 */
export function OrderConfirmationShortcuts({ operationType = 'BUY' }: OrderConfirmationShortcutsProps) {
  const { hasAccess } = usePlanGuard()

  return (
    <div
      data-testid="order-confirmation-shortcuts"
      className="space-y-3 pt-4 border-t border-[rgba(240,185,11,.1)]"
    >
      {/* Header */}
      <div>
        <p className="text-xs font-semibold text-[#929AA5] uppercase tracking-wide">
          Ferramentas Premium
        </p>
        <p className="text-[11px] text-[#707A8A] mt-1">
          Desbloqueie recursos avançados com upgrade de plano
        </p>
      </div>

      {/* Grid de features */}
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {PREMIUM_FEATURES.map((feature) => (
          <PremiumFeatureCard
            key={feature.id}
            feature={feature}
            hasAccess={hasAccess(feature.requiredPlan)}
          />
        ))}
      </div>

      {/* Dica contextual */}
      <div className="flex items-start gap-1.5 pt-1 text-[11px] italic leading-snug text-[#707A8A]">
        <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-[#F0B90B]" aria-hidden="true" />
        <span>
          Dica: {operationType === 'BUY' ? 'Use Short para lucrar com quedas.' : 'Combine com Stop Loss para proteger seus ganhos.'}
        </span>
      </div>
    </div>
  )
}
