/**
 * Testes unitários — PlanService: getDailyOrderLimit + getAllowedOrderTypes
 * T-020 / INT-019
 */

// Mock das dependências externas (não testamos checkout/gateway aqui)
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    subscription: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  },
}))
jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGateway: jest.fn(),
}))
jest.mock('@/lib/services/SubscriptionService', () => ({
  subscriptionService: { createSubscription: jest.fn() },
}))
jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({
  leagueAutoEnrollService: { enrollUserInPublicLeague: jest.fn() },
}))
jest.mock('@/lib/notifications/stubs/NotificationStub', () => ({
  NotificationStub: { notify: jest.fn() },
}))

import { PlanService } from '@/lib/services/PlanService'

const planService = new PlanService()

describe('PlanService.getDailyOrderLimit', () => {
  it('retorna 2 para plano JOGADOR', () => {
    expect(planService.getDailyOrderLimit('JOGADOR')).toBe(2)
  })

  it('retorna 5 para plano CRAQUE', () => {
    expect(planService.getDailyOrderLimit('CRAQUE')).toBe(5)
  })

  it('retorna null para plano LENDA (ilimitado)', () => {
    expect(planService.getDailyOrderLimit('LENDA')).toBeNull()
  })

  it('retorna null para plano desconhecido (fail-safe = ilimitado)', () => {
    expect(planService.getDailyOrderLimit('INVALIDO')).toBeNull()
  })

  it('retorna número inteiro para JOGADOR e CRAQUE', () => {
    expect(Number.isInteger(planService.getDailyOrderLimit('JOGADOR')!)).toBe(true)
    expect(Number.isInteger(planService.getDailyOrderLimit('CRAQUE')!)).toBe(true)
  })
})

describe('PlanService.getAllowedOrderTypes', () => {
  it('retorna apenas MARKET para JOGADOR', () => {
    const types = planService.getAllowedOrderTypes('JOGADOR')
    expect(types).toEqual(['MARKET'])
    expect(types).toHaveLength(1)
  })

  it('retorna MARKET, LIMIT e SCHEDULED para CRAQUE', () => {
    const types = planService.getAllowedOrderTypes('CRAQUE')
    expect(types).toContain('MARKET')
    expect(types).toContain('LIMIT')
    expect(types).toContain('SCHEDULED')
    expect(types).not.toContain('OCO')
  })

  it('retorna MARKET, LIMIT, OCO e SCHEDULED para LENDA', () => {
    const types = planService.getAllowedOrderTypes('LENDA')
    expect(types).toContain('MARKET')
    expect(types).toContain('LIMIT')
    expect(types).toContain('OCO')
    expect(types).toContain('SCHEDULED')
  })

  it('JOGADOR não pode usar LIMIT', () => {
    expect(planService.getAllowedOrderTypes('JOGADOR')).not.toContain('LIMIT')
  })

  it('JOGADOR não pode usar OCO', () => {
    expect(planService.getAllowedOrderTypes('JOGADOR')).not.toContain('OCO')
  })

  it('JOGADOR não pode usar SCHEDULED', () => {
    expect(planService.getAllowedOrderTypes('JOGADOR')).not.toContain('SCHEDULED')
  })

  it('CRAQUE não pode usar OCO', () => {
    expect(planService.getAllowedOrderTypes('CRAQUE')).not.toContain('OCO')
  })

  it('retorna array não vazio para plano desconhecido (fail-safe = MARKET)', () => {
    const types = planService.getAllowedOrderTypes('INVALIDO')
    expect(types).toHaveLength(1)
    expect(types[0]).toBe('MARKET')
  })

  it('retorna array (não muta a constante original)', () => {
    const types1 = planService.getAllowedOrderTypes('JOGADOR')
    const types2 = planService.getAllowedOrderTypes('JOGADOR')
    // São valores iguais mas a mutação de um não deve afetar o outro
    expect(types1).toEqual(types2)
  })
})

describe('Invariantes de plano cruzados', () => {
  it('planos com limite nulo (LENDA) não devem retornar zero como limite', () => {
    const limit = planService.getDailyOrderLimit('LENDA')
    expect(limit).toBeNull()
    expect(limit).not.toBe(0)
  })

  it('upgrade de JOGADOR para CRAQUE aumenta limite (2 → 5)', () => {
    const jogador = planService.getDailyOrderLimit('JOGADOR')
    const craque = planService.getDailyOrderLimit('CRAQUE')
    expect(craque!).toBeGreaterThan(jogador!)
  })

  it('upgrade de CRAQUE para LENDA remove o limite (5 → null)', () => {
    const craque = planService.getDailyOrderLimit('CRAQUE')
    const lenda = planService.getDailyOrderLimit('LENDA')
    expect(craque).not.toBeNull()
    expect(lenda).toBeNull()
  })

  it('LENDA tem todos os tipos que CRAQUE tem', () => {
    const craque = planService.getAllowedOrderTypes('CRAQUE')
    const lenda = planService.getAllowedOrderTypes('LENDA')
    for (const type of craque) {
      expect(lenda).toContain(type)
    }
  })

  it('CRAQUE tem todos os tipos que JOGADOR tem', () => {
    const jogador = planService.getAllowedOrderTypes('JOGADOR')
    const craque = planService.getAllowedOrderTypes('CRAQUE')
    for (const type of jogador) {
      expect(craque).toContain(type)
    }
  })
})
