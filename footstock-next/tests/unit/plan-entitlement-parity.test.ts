/**
 * Task 16 — paridade entre promessa comercial de exportacao e entitlement real.
 *
 * Compara, para cada plano (JOGADOR, CRAQUE, LENDA), a presenca de texto
 * comercial sobre "Relatorios exportaveis" em PLAN_DETAILS com o resultado de
 * planHasFeature(plan, 'export_data'). Divergencia futura quebra o build.
 *
 * Nota de implantacao: o texto comercial vive em PLAN_DETAILS (plan-details.ts),
 * que e a fonte importavel de dados de plano. A pagina /planos/page.tsx mantem
 * copia inline das mesmas features; este teste cobre a SSoT de dados. A pagina
 * deve ser refatorada para consumir PLAN_DETAILS (dedupe pendente documentado
 * no proprio plan-details.ts).
 */

import { PLAN_DETAILS } from '@/lib/constants/plan-details'
import { planHasFeature } from '@/lib/auth/planAccess'
import type { PlanType } from '@/lib/enums'

const PLANS: PlanType[] = ['JOGADOR', 'CRAQUE', 'LENDA']

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const EXPORT_PATTERN = /relatorios?\s+exportaveis/i

type PlanDetailsEntry = { features: string[]; missing: string[] }

// Bridge: PLAN_DETAILS usa o enum PlanType (constants/plans) como chave, mas
// as chaves em runtime sao strings identicas ao PlanType de lib/enums.
const details = PLAN_DETAILS as unknown as Record<PlanType, PlanDetailsEntry>

describe('Task 16 — paridade exportacao comercial vs entitlement', () => {
  test.each(PLANS)(
    '%s: promessa comercial de exportacao coincide com planHasFeature(export_data)',
    (plan) => {
      const commercialPromisesExport = details[plan].features.some((f) =>
        EXPORT_PATTERN.test(stripAccents(f)),
      )
      const entitlementGrantsExport = planHasFeature(plan, 'export_data')
      expect(commercialPromisesExport).toBe(entitlementGrantsExport)
    },
  )

  test('CRAQUE anuncia relatorios exportaveis (nao e mais exclusividade LENDA)', () => {
    expect(
      details['CRAQUE'].features.some((f) => EXPORT_PATTERN.test(stripAccents(f))),
    ).toBe(true)
  })

  test('LENDA anuncia relatorios exportaveis', () => {
    expect(
      details['LENDA'].features.some((f) => EXPORT_PATTERN.test(stripAccents(f))),
    ).toBe(true)
  })

  test('JOGADOR nao anuncia relatorios exportaveis', () => {
    expect(
      details['JOGADOR'].features.some((f) => EXPORT_PATTERN.test(stripAccents(f))),
    ).toBe(false)
  })

  test('planAccess.ts concede export_data a CRAQUE e LENDA, nao a JOGADOR', () => {
    expect(planHasFeature('JOGADOR', 'export_data')).toBe(false)
    expect(planHasFeature('CRAQUE', 'export_data')).toBe(true)
    expect(planHasFeature('LENDA', 'export_data')).toBe(true)
  })
})
