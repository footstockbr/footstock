/**
 * @jest-environment jsdom
 *
 * Task 19 — paridade entre o plano ANUNCIADO no card de atalho premium e o plano
 * efetivamente EXIGIDO pelo gate. O bug corrigido: o item `oco` declarava
 * `requiredPlan: 'CRAQUE'` por literal enquanto `planAccess` concede
 * `oco_orders` apenas a LENDA, e `ALLOWED_ORDER_TYPES` so libera OCO em LENDA.
 * Um usuario CRAQUE via a feature anunciada como incluida no plano dele.
 */
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  OrderConfirmationShortcuts,
  minimumPlanForFeature,
  premiumPlanForFeature,
} from '@/components/orders/OrderConfirmationShortcuts'
import { planHasFeature, hasPlanAccess } from '@/lib/auth/planAccess'
import { ALLOWED_ORDER_TYPES_BY_PLAN } from '@/lib/services/plan-order-limits'
import type { PlanType } from '@/lib/enums'

const PLANS: PlanType[] = ['JOGADOR', 'CRAQUE', 'LENDA']

// usePlanGuard faz fetch em /api/v1/users/me via SWR; o teste controla o plano.
let mockPlan: PlanType = 'JOGADOR'
jest.mock('@/hooks/usePlanGuard', () => ({
  usePlanGuard: () => ({
    plan: mockPlan,
    isLoading: false,
    isError: false,
    isReady: true,
    hasAccess: (required: PlanType) => {
      const order: Record<string, number> = { JOGADOR: 0, CRAQUE: 1, LENDA: 2 }
      return (order[mockPlan] ?? 0) >= (order[required] ?? 0)
    },
  }),
}))

// PlanCTAButton arrasta hooks de checkout (gateways, analytics) irrelevantes aqui.
jest.mock('@/components/payments/PlanCTAButton', () => ({
  PlanCTAButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))

describe('Task 19 — plano anunciado para OCO no card de atalho', () => {
  test('o plano anunciado deriva do mapa de features e nao de literal', () => {
    expect(minimumPlanForFeature('oco_orders')).toBe('LENDA')
    expect(premiumPlanForFeature('oco_orders')).toBe('LENDA')
  })

  test.each(PLANS)('concorda com planHasFeature(%s, oco_orders)', (plan) => {
    const anunciado = premiumPlanForFeature('oco_orders')
    // Quem alcanca o plano anunciado tem a feature; quem nao alcanca, nao tem.
    expect(hasPlanAccess(plan, anunciado)).toBe(planHasFeature(plan, 'oco_orders'))
  })

  test.each(PLANS)('concorda com ALLOWED_ORDER_TYPES_BY_PLAN para %s', (plan) => {
    const anunciado = premiumPlanForFeature('oco_orders')
    expect(hasPlanAccess(plan, anunciado)).toBe(
      ALLOWED_ORDER_TYPES_BY_PLAN[plan].includes('OCO'),
    )
  })

  test('o espelho ALLOWED_ORDER_TYPES do OrderForm mantem OCO exclusivo de LENDA', () => {
    // O espelho e const de modulo (nao exportado, e a Task 19 exige preserva-lo
    // intacto), entao a paridade e verificada lendo a fonte.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/components/orders/OrderForm.tsx'),
      'utf-8',
    )
    const bloco = src.match(/const ALLOWED_ORDER_TYPES[\s\S]*?\n}/)
    expect(bloco).not.toBeNull()
    const linhas = (bloco as RegExpMatchArray)[0].split('\n')
    for (const plan of PLANS) {
      const linha = linhas.find((l) => l.trim().startsWith(`${plan}:`)) ?? ''
      expect(linha.includes("'OCO'")).toBe(planHasFeature(plan, 'oco_orders'))
    }
  })

  test('usuario CRAQUE ve o card de OCO bloqueado, sem anunciar CRAQUE', () => {
    mockPlan = 'CRAQUE'
    render(<OrderConfirmationShortcuts operationType="SELL" />)

    const card = screen.getByTestId('premium-feature-card-oco')
    expect(card.tagName).toBe('BUTTON') // sem acesso => card clicavel de upgrade
    expect(card.textContent).toContain('Requer LENDA')
    expect(card.textContent).not.toContain('Requer CRAQUE')
    expect(card.textContent).not.toContain('Desbloqueado')
  })

  test('usuario LENDA ve o card de OCO desbloqueado', () => {
    mockPlan = 'LENDA'
    render(<OrderConfirmationShortcuts operationType="SELL" />)

    const card = screen.getByTestId('premium-feature-card-oco')
    expect(card.textContent).toContain('Desbloqueado')
  })

  test('nenhum card premium anuncia plano que o gate nega', () => {
    mockPlan = 'JOGADOR'
    render(<OrderConfirmationShortcuts operationType="BUY" />)

    // short e oco sao LENDA-only em planAccess; alavancagem e LENDA por constante.
    for (const id of ['short', 'oco', 'leverage']) {
      expect(screen.getByTestId(`premium-feature-card-${id}`).textContent).toContain('Requer LENDA')
    }
  })
})
