'use client'

import { TrendingDown, TrendingUp, Zap } from 'lucide-react'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { PremiumFeatureCard, type PremiumFeatureSpec } from './PremiumFeatureCard'

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
    requiredPlan: 'LENDA',
    icon: <TrendingDown className="h-5 w-5" />,
    color: 'red',
  },
  {
    id: 'leverage',
    name: 'Alavancagem 2x',
    title: 'Alavancagem 2x',
    description: 'Amplifique seus ganhos com crédito virtual. Juros 0,1%/dia.',
    requiredPlan: 'LENDA',
    icon: <TrendingUp className="h-5 w-5" />,
    color: 'purple',
  },
  {
    id: 'oco',
    name: 'OCO / Stop Loss',
    title: 'OCO / Stop Loss',
    description: 'Ordens condicionais com proteção automática de perdas.',
    requiredPlan: 'CRAQUE',
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {PREMIUM_FEATURES.map((feature) => (
          <PremiumFeatureCard
            key={feature.id}
            feature={feature}
            hasAccess={hasAccess(feature.requiredPlan)}
          />
        ))}
      </div>

      {/* Dica contextual */}
      <div className="text-[11px] text-[#707A8A] italic pt-1">
        💡 Dica: {operationType === 'BUY' ? 'Use Short para lucrar com quedas.' : 'Combine com Stop Loss para proteger seus ganhos.'}
      </div>
    </div>
  )
}
