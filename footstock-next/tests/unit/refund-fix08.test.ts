/**
 * Testes unitários — FIX-08: rota self-service de refund bloqueia quando não
 * consegue liquidar posições restritas. Loop 06-22-footstock-financeiro-planos (Task 13).
 *
 * Aceite: usuário LENDA com SHORT aberto que pede refund tem as posições liquidadas
 * OU o refund é bloqueado — NUNCA rebaixa deixando posição órfã. Aqui cobrimos o ramo
 * de bloqueio: se a liquidação não zera as posições, o refund não estorna nem rebaixa.
 */

const mockGetAuthUser = jest.fn()
jest.mock('@/lib/auth', () => ({ getAuthUser: mockGetAuthUser }))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findFirst: jest.fn() },
    payment: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/services/plan-logic', () => ({ isWithinCoolingOff: jest.fn(() => true) }))

const mockGetGateway = jest.fn()
jest.mock('@/lib/gateways/GatewayFactory', () => ({ getGateway: mockGetGateway }))

jest.mock('@/lib/services/analytics/MixpanelServerService', () => ({
  mixpanelServer: { trackSubscriptionCancelled: jest.fn() },
}))

const mockLiquidate = jest.fn()
jest.mock('@/lib/services/forced-liquidation', () => ({ liquidateRestrictedPositions: mockLiquidate }))

async function callRefund() {
  const { POST } = await import('@/app/api/v1/subscriptions/me/refund/route')
  return POST()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue({ user: { id: 'user-lenda' } })
  const { prisma } = require('@/lib/prisma')
  prisma.subscription.findFirst.mockResolvedValue({
    id: 'sub-1',
    planType: 'LENDA',
    status: 'ACTIVE',
    amount: 9990,
    startsAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    cancelledAt: null,
    cancellationLockExpiresAt: null,
  })
})

describe('FIX-08 — refund self-service bloqueia sem liquidar', () => {
  it('com SHORT que não pôde ser encerrado: bloqueia, não estorna no gateway, não rebaixa', async () => {
    mockLiquidate.mockResolvedValue({ found: 1, liquidated: 0, failed: 1, remaining: 1, cleared: false })
    const { prisma } = require('@/lib/prisma')

    const res = await callRefund()
    const body = await res.json()

    expect(res.status).toBe(422) // errors.validation → 422 (VAL-001)
    expect(body.error.message).toMatch(/posições restritas/i)
    // Nunca rebaixa deixando posição órfã: sem estorno e sem transação de downgrade.
    expect(mockGetGateway).not.toHaveBeenCalled()
    expect(prisma.payment.findFirst).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('chama a liquidação com o reason canônico do fluxo self-service', async () => {
    mockLiquidate.mockResolvedValue({ found: 0, liquidated: 0, failed: 0, remaining: 0, cleared: true })
    // cleared=true segue para o lookup de pagamento; sem Payment PAID e amount>0 → bloqueia ali,
    // o que basta para provar que a liquidação roda ANTES e com o reason correto.
    const { prisma } = require('@/lib/prisma')
    prisma.payment.findFirst.mockResolvedValue(null)

    await callRefund()

    expect(mockLiquidate).toHaveBeenCalledWith('user-lenda', 'sub-1', 'REFUND_COOLING_OFF')
  })
})
