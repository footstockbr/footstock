/**
 * Teste de regressao — PlanService.processAffiliateCommission (unidade da comissao)
 * FIX-03: subscriptionAmount chega em CENTAVOS; a comissao gravada em
 * AffiliateTransaction.amount fica em FS$ (1 FS$ = R$1). Antes do fix o codigo
 * aplicava o pct direto sobre os centavos, inflando a comissao em 100x.
 * Aceite canonico: R$39,90 (3990 centavos) @ 10% -> 3,99 FS$.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    affiliateCode: { findFirst: jest.fn() },
    affiliateTransaction: { createMany: jest.fn() },
  },
}))
jest.mock('@/lib/gateways/GatewayFactory', () => ({ getGateway: jest.fn() }))
jest.mock('@/lib/services/SubscriptionService', () => ({
  subscriptionService: { createSubscription: jest.fn() },
}))
jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({
  leagueAutoEnrollService: { enrollUserInPublicLeague: jest.fn() },
}))
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: jest.fn().mockResolvedValue({ notification: {}, deduped: false }) },
}))
jest.mock('@/lib/services/analytics/MixpanelServerService', () => ({
  mixpanelServer: {
    trackPaymentCompleted: jest.fn(),
    trackAffiliateConversion: jest.fn(),
  },
}))
jest.mock('@/lib/services/leagues/LeagueEventRecorder', () => ({
  leagueEventRecorder: { recordForAllActiveLeagues: jest.fn().mockResolvedValue(undefined) },
}))

import { PlanService } from '@/lib/services/PlanService'
import { prisma } from '@/lib/prisma'

const userFindUniqueMock = prisma.user.findUnique as jest.Mock
const affiliateCodeFindFirstMock = prisma.affiliateCode.findFirst as jest.Mock
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createManyMock = (prisma as any).affiliateTransaction.createMany as jest.Mock

const planService = new PlanService()

// processAffiliateCommission e private; acessa via bracket para o teste de unidade focado.
type CommissionParams = {
  userId: string
  subscriptionId: string
  subscriptionAmount: number
  gatewayTransactionId?: string
  planType: 'CRAQUE' | 'LENDA'
}
function callProcess(params: CommissionParams): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (planService as any).processAffiliateCommission(params)
}

function lastCommissionAmount(): number {
  const call = createManyMock.mock.calls[createManyMock.mock.calls.length - 1]
  return call[0].data[0].amount as number
}

describe('PlanService.processAffiliateCommission — unidade da comissao (FIX-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    userFindUniqueMock.mockResolvedValue({ referredByCode: 'PARCEIRO10' })
    affiliateCodeFindFirstMock.mockResolvedValue({
      id: 'aff-1',
      userId: 'affiliate-owner',
      commissionPercentage: 0.1,
      affiliateType: 'TIME_PARCEIRO',
      code: 'PARCEIRO10',
    })
  })

  it('R$39,90 (3990 centavos) @ 10% gera 3,99 FS$ (nao 399)', async () => {
    await callProcess({
      userId: 'referred-user',
      subscriptionId: 'sub-1',
      subscriptionAmount: 3990,
      gatewayTransactionId: 'tx-1',
      planType: 'CRAQUE',
    })

    expect(createManyMock).toHaveBeenCalledTimes(1)
    expect(lastCommissionAmount()).toBe(3.99)
  })

  it('R$59,90 (5990 centavos) @ 15% gera 8,99 FS$ (arredondado a 2 casas)', async () => {
    affiliateCodeFindFirstMock.mockResolvedValue({
      id: 'aff-2',
      userId: 'affiliate-owner',
      commissionPercentage: 0.15,
      affiliateType: 'INFLUENCIADOR',
      code: 'INFLU15',
    })

    await callProcess({
      userId: 'referred-user',
      subscriptionId: 'sub-2',
      subscriptionAmount: 5990,
      gatewayTransactionId: 'tx-2',
      planType: 'LENDA',
    })

    // 59.90 * 0.15 = 8.985 -> arredonda para 8.99
    expect(lastCommissionAmount()).toBe(8.99)
  })

  it('comissao calculada sobre reais nunca confunde centavos com a propria unidade FS$', async () => {
    await callProcess({
      userId: 'referred-user',
      subscriptionId: 'sub-3',
      subscriptionAmount: 3990,
      gatewayTransactionId: 'tx-3',
      planType: 'CRAQUE',
    })
    // Guard explicito contra a regressao original (399 = pct aplicado direto sobre centavos).
    expect(lastCommissionAmount()).not.toBe(399)
  })
})

describe('PlanService.processAffiliateCommission — assert non-null da chave (FIX-16)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    userFindUniqueMock.mockResolvedValue({ referredByCode: 'PARCEIRO10' })
    affiliateCodeFindFirstMock.mockResolvedValue({
      id: 'aff-1',
      userId: 'affiliate-owner',
      commissionPercentage: 0.1,
      affiliateType: 'TIME_PARCEIRO',
      code: 'PARCEIRO10',
    })
  })

  it('sem gatewayTransactionId lanca antes de gravar (dedup via @unique exige a chave)', async () => {
    await expect(
      callProcess({
        userId: 'referred-user',
        subscriptionId: 'sub-1',
        subscriptionAmount: 3990,
        planType: 'CRAQUE',
      })
    ).rejects.toThrow(/gatewayTransactionId ausente/)
    // Zero gravacao nao-deduplicavel: a comissao nunca chega ao banco sem a chave.
    expect(createManyMock).not.toHaveBeenCalled()
  })

  it('grava a comissao com a chave quando gatewayTransactionId esta presente', async () => {
    await callProcess({
      userId: 'referred-user',
      subscriptionId: 'sub-1',
      subscriptionAmount: 3990,
      gatewayTransactionId: 'tx-present',
      planType: 'CRAQUE',
    })
    expect(createManyMock).toHaveBeenCalledTimes(1)
    const call = createManyMock.mock.calls[createManyMock.mock.calls.length - 1]
    expect(call[0].data[0].gatewayTransactionId).toBe('tx-present')
  })
})
