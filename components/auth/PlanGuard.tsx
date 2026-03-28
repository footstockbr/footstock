'use client'

import Link from 'next/link'
import { Btn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Card'
import { ROUTES } from '@/lib/constants/routes'
import { PLAN_LABELS } from '@/lib/constants/labels'
import type { PlanType } from '@/lib/enums'

/** Hierarquia dos planos — JOGADOR < CRAQUE < LENDA */
const PLAN_HIERARCHY: Record<PlanType, number> = {
  JOGADOR: 0,
  CRAQUE: 1,
  LENDA: 2,
}

export interface PlanGuardProps {
  /** Plano atual do usuario */
  currentPlan: PlanType
  /** Plano minimo necessario */
  requiredPlan: PlanType
  children: React.ReactNode
  /** Exibe CTA de upgrade em vez de nada (padrao: true) */
  showUpgradeCTA?: boolean
}

/**
 * Gate de plano — exibe conteudo apenas se o plano do usuario for suficiente.
 * Se nao, exibe CTA para upgrade.
 */
export function PlanGuard({
  currentPlan,
  requiredPlan,
  children,
  showUpgradeCTA = true,
}: PlanGuardProps) {
  const hasAccess = PLAN_HIERARCHY[currentPlan] >= PLAN_HIERARCHY[requiredPlan]

  if (hasAccess) return <>{children}</>

  if (!showUpgradeCTA) return null

  return (
    <Card className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-text-secondary">
        Este recurso esta disponivel no plano{' '}
        <span className="text-accent font-semibold">{PLAN_LABELS[requiredPlan]}</span>
      </p>
      <Link href={ROUTES.ASSINATURA}>
        <Btn variant="plan" size="sm">
          Fazer Upgrade
        </Btn>
      </Link>
    </Card>
  )
}
