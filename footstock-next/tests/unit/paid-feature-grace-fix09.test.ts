/**
 * Testes unitarios — FIX-09: instrumentar uso de feature paga pos-expiracao,
 * preservando a graca de 7 dias. Loop 06-22-footstock-financeiro-planos (Task 14).
 *
 * Aceite: uso de feature paga pos-expiracao fica observavel (metrica/log); SEM
 * corte de acesso. Aqui cobrimos:
 *  (a) classificacao pura de feature paga (isPaidFeature);
 *  (b) recordPaidFeatureUsage emite a metrica APENAS na graca pos-expiracao;
 *  (c) nunca emite (e nunca lanca) para assinatura ativa, tier gratuito ou ausente;
 *  (d) fail-open: erro ao registrar a metrica nao propaga.
 */

import { isPaidFeature } from '@/lib/auth/planAccess'
import type { SubscriptionForLogic } from '@/lib/services/plan-logic'

// ─── Mocks das dependencias pesadas de src/lib/auth.ts ──────────────────────
jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/lib/auth/authjs-session', () => ({
  readAuthjsSession: jest.fn(),
  isSessionInvalidated: jest.fn(() => false),
}))
jest.mock('@/lib/prisma', () => ({
  prisma: { subscription: { findFirst: jest.fn() } },
}))

const mockRecord = jest.fn()
jest.mock('@/lib/observability/paid-feature-grace-counter', () => ({
  recordPaidFeatureGraceUsage: (...args: unknown[]) => mockRecord(...args),
}))

// Importado APOS os mocks para que a fabrica seja aplicada.
const { recordPaidFeatureUsage } = require('@/lib/auth') as typeof import('@/lib/auth')
const { prisma } = require('@/lib/prisma') as { prisma: { subscription: { findFirst: jest.Mock } } }

const NOW = new Date('2026-06-22T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function sub(overrides: Partial<SubscriptionForLogic> = {}): SubscriptionForLogic {
  return {
    planType: 'LENDA',
    startsAt: new Date(NOW.getTime() - 31 * DAY),
    expiresAt: new Date(NOW.getTime() - 1 * DAY), // expirou ha 1 dia (dentro da graca)
    status: 'ACTIVE',
    cancelledAt: null,
    cancellationLockExpiresAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRecord.mockResolvedValue(undefined)
})

describe('isPaidFeature (puro)', () => {
  test('feature do tier gratuito (JOGADOR) NAO e paga', () => {
    expect(isPaidFeature('delayed_60m')).toBe(false)
  })
  test('features de CRAQUE/LENDA sao pagas', () => {
    expect(isPaidFeature('realtime_prices')).toBe(true)
    expect(isPaidFeature('ai_analysis')).toBe(true)
    expect(isPaidFeature('no_ads')).toBe(true)
  })
})

describe('recordPaidFeatureUsage — graca pos-expiracao', () => {
  test('(b) assinatura expirada dentro da graca: observa e NAO corta acesso', async () => {
    prisma.subscription.findFirst.mockResolvedValue(sub())
    const observed = await recordPaidFeatureUsage({
      userId: 'u-1',
      requiredPlan: 'CRAQUE',
      now: NOW,
    })
    expect(observed).toBe(true)
    expect(mockRecord).toHaveBeenCalledTimes(1)
    expect(mockRecord).toHaveBeenCalledWith(
      'plan:CRAQUE',
      expect.objectContaining({ userId: 'u-1', plan: 'LENDA', requiredPlan: 'CRAQUE' }),
    )
  })

  test('dimensao usa a feature quando informada', async () => {
    const observed = await recordPaidFeatureUsage({
      userId: 'u-2',
      requiredPlan: 'LENDA',
      feature: 'ai_analysis',
      subscription: sub(),
      now: NOW,
    })
    expect(observed).toBe(true)
    expect(mockRecord).toHaveBeenCalledWith('ai_analysis', expect.objectContaining({ feature: 'ai_analysis' }))
  })

  test('(c) assinatura ativa (nao expirada): nao observa', async () => {
    const observed = await recordPaidFeatureUsage({
      userId: 'u-3',
      requiredPlan: 'CRAQUE',
      subscription: sub({ expiresAt: new Date(NOW.getTime() + 5 * DAY) }),
      now: NOW,
    })
    expect(observed).toBe(false)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  test('graca ja vencida (> 7 dias): nao observa (corte e do cron)', async () => {
    const observed = await recordPaidFeatureUsage({
      userId: 'u-4',
      requiredPlan: 'CRAQUE',
      subscription: sub({ expiresAt: new Date(NOW.getTime() - 8 * DAY) }),
      now: NOW,
    })
    expect(observed).toBe(false)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  test('tier gratuito (requiredPlan JOGADOR): nao consulta nem observa', async () => {
    const observed = await recordPaidFeatureUsage({ userId: 'u-5', requiredPlan: 'JOGADOR', now: NOW })
    expect(observed).toBe(false)
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  test('feature gratuita informada: nao consulta nem observa', async () => {
    const observed = await recordPaidFeatureUsage({
      userId: 'u-6',
      requiredPlan: 'CRAQUE',
      feature: 'delayed_60m',
      now: NOW,
    })
    expect(observed).toBe(false)
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  test('sem assinatura: nao observa', async () => {
    prisma.subscription.findFirst.mockResolvedValue(null)
    const observed = await recordPaidFeatureUsage({ userId: 'u-7', requiredPlan: 'LENDA', now: NOW })
    expect(observed).toBe(false)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  test('(d) fail-open: erro ao registrar metrica nao propaga', async () => {
    mockRecord.mockRejectedValue(new Error('redis down'))
    await expect(
      recordPaidFeatureUsage({ userId: 'u-8', requiredPlan: 'CRAQUE', subscription: sub(), now: NOW }),
    ).resolves.toBe(false)
  })
})
