/**
 * Testes — 2 lockouts da mesma classe (billing) corrigidos:
 *  (#2) SubscriptionReconcileService NÃO deve rebaixar CANCELLATION_LOCK -> SUSPENDED ao ler
 *       'paused' do gateway (o lock pausa o preapproval de propósito; rebaixar perde o lock).
 *  (#3) terminateGatewaySubscriptions cancela TERMINALMENTE o preapproval de assinaturas
 *       recorrentes na exclusão de conta (evita cobrança-fantasma em conta anonimizada).
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}))
const mockGateway = {
  getSubscriptionStatus: jest.fn(),
  cancelSubscriptionTerminal: jest.fn().mockResolvedValue(undefined),
  cancelAutoRenewal: jest.fn().mockResolvedValue(undefined),
}
jest.mock('@/lib/gateways/GatewayFactory', () => ({ getGateway: jest.fn(() => mockGateway) }))
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: jest.fn().mockResolvedValue({ notification: {}, deduped: false }) },
}))
jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({
  leagueAutoEnrollService: { enrollUserInPublicLeague: jest.fn() },
}))

beforeEach(() => jest.clearAllMocks())

describe('#2 reconcile — CANCELLATION_LOCK não corrompido por gateway paused', () => {
  it('CANCELLATION_LOCK + gateway paused → SKIP (NÃO vira SUSPENDED)', async () => {
    const { prisma } = require('@/lib/prisma')
    const { SubscriptionReconcileService } = require('@/lib/services/SubscriptionReconcileService')
    prisma.subscription.findMany.mockResolvedValue([
      { id: 'lock-1', status: 'CANCELLATION_LOCK', gatewayStatus: 'authorized', gatewaySubscriptionId: 'pre-1' },
    ])
    mockGateway.getSubscriptionStatus.mockResolvedValue({ status: 'paused' }) // canonical = SUSPENDED

    const res = await new SubscriptionReconcileService().reconcile({})

    // NUNCA rebaixa o lock para SUSPENDED (a corrupção) e refresca a auditoria via CAS
    // (updateMany com where.status='CANCELLATION_LOCK'), preservando o status do lock.
    const calls = prisma.subscription.updateMany.mock.calls.map(
      (c: [{ where: Record<string, unknown>; data: Record<string, unknown> }]) => c[0],
    )
    expect(calls.some((c: { data: Record<string, unknown> }) => c.data.status === 'SUSPENDED')).toBe(false)
    expect(
      calls.some(
        (c: { where: Record<string, unknown>; data: Record<string, unknown> }) =>
          c.where.status === 'CANCELLATION_LOCK' && c.data.gatewayStatus === 'paused' && c.data.status === undefined,
      ),
    ).toBe(true)
    expect(res.details.some((d: { action: string }) => d.action === 'SKIP_CANCELLATION_LOCK_paused')).toBe(true)
  })

  it('CANCELLATION_LOCK + gateway cancelled → ainda reconcilia para CANCELLED (terminal permitido)', async () => {
    const { prisma } = require('@/lib/prisma')
    const { SubscriptionReconcileService } = require('@/lib/services/SubscriptionReconcileService')
    prisma.subscription.findMany.mockResolvedValue([
      { id: 'lock-2', status: 'CANCELLATION_LOCK', gatewayStatus: 'paused', gatewaySubscriptionId: 'pre-2' },
    ])
    mockGateway.getSubscriptionStatus.mockResolvedValue({ status: 'cancelled' }) // canonical = CANCELLED

    await new SubscriptionReconcileService().reconcile({})

    expect(prisma.subscription.updateMany).toHaveBeenCalledTimes(1)
    const patch = prisma.subscription.updateMany.mock.calls[0][0].data
    expect(patch.status).toBe('CANCELLED')
  })

  it('PENDING + gateway authorized → SKIP (defere ativação ao payment-reconcile; não vira ACTIVE-bare sem plano)', async () => {
    const { prisma } = require('@/lib/prisma')
    const { SubscriptionReconcileService } = require('@/lib/services/SubscriptionReconcileService')
    prisma.subscription.findMany.mockResolvedValue([
      { id: 'pend-1', status: 'PENDING', gatewayStatus: 'pending', gatewaySubscriptionId: 'pre-p' },
    ])
    mockGateway.getSubscriptionStatus.mockResolvedValue({ status: 'authorized' }) // canonical = ACTIVE

    const res = await new SubscriptionReconcileService().reconcile({})

    // Bare-flip PENDING→ACTIVE deixaria a sub ACTIVE sem entitlement (planType/Payment) e bloquearia
    // o checkout. Defere ao payment-reconcile (upgradeUser). Sem updateMany de status aqui.
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    expect(res.details.some((d: { action: string }) => d.action === 'SKIP_PENDING_ACTIVATION_DEFER_PAYMENT_RECONCILE')).toBe(true)
  })

  it('CANCELLATION_LOCK + gateway authorized (auto-renew vivo na janela) → RE-PAUSA o gateway (anti cobrança-fantasma)', async () => {
    const { prisma } = require('@/lib/prisma')
    const { SubscriptionReconcileService } = require('@/lib/services/SubscriptionReconcileService')
    prisma.subscription.findMany.mockResolvedValue([
      { id: 'lock-a', status: 'CANCELLATION_LOCK', gatewayStatus: 'paused', gatewaySubscriptionId: 'pre-l' },
    ])
    mockGateway.getSubscriptionStatus.mockResolvedValue({ status: 'authorized' })

    const res = await new SubscriptionReconcileService().reconcile({})

    // Auto-renew autorizado durante o lock → re-pausar (senão cobra na janela de cancelamento).
    expect(mockGateway.cancelAutoRenewal).toHaveBeenCalledWith('pre-l')
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled() // não rebaixa o status do lock
    expect(res.details.some((d: { action: string }) => d.action === 'REPAUSED_CANCELLATION_LOCK_authorized')).toBe(true)
  })

  it('ACTIVE + gateway cancelled → cancel-at-period-end (NÃO terminal; planType não encalha)', async () => {
    const { prisma } = require('@/lib/prisma')
    const { SubscriptionReconcileService } = require('@/lib/services/SubscriptionReconcileService')
    prisma.subscription.findMany.mockResolvedValue([
      { id: 'act-1', status: 'ACTIVE', gatewayStatus: 'authorized', gatewaySubscriptionId: 'pre-3' },
    ])
    mockGateway.getSubscriptionStatus.mockResolvedValue({ status: 'cancelled' })

    await new SubscriptionReconcileService().reconcile({})

    const patch = prisma.subscription.updateMany.mock.calls[0][0].data
    // Mesma semântica do webhook SUBSCRIPTION_CANCELLED: marca a intenção e deixa os crons de
    // expiração resetarem User.planType no vencimento — NÃO salta para status terminal CANCELLED.
    expect(patch.cancelAtPeriodEnd).toBe(true)
    expect(patch.status).toBeUndefined()
  })
})

describe('#3 terminateGatewaySubscriptions — anti cobrança-fantasma na exclusão de conta', () => {
  it('cancela TERMINALMENTE o preapproval de cada assinatura recorrente do usuário', async () => {
    const { prisma } = require('@/lib/prisma')
    const { subscriptionService } = require('@/lib/services/SubscriptionService')
    prisma.subscription.findMany.mockResolvedValue([
      { id: 's1', gateway: 'MERCADO_PAGO', gatewaySubscriptionId: 'pre-1' },
      { id: 's2', gateway: 'PAYPAL', gatewaySubscriptionId: 'pre-2' },
    ])

    await subscriptionService.terminateGatewaySubscriptions('user-1')

    expect(mockGateway.cancelSubscriptionTerminal).toHaveBeenCalledWith('pre-1')
    expect(mockGateway.cancelSubscriptionTerminal).toHaveBeenCalledWith('pre-2')
    // só recorrentes com preapproval (o where filtra billingMode/gatewaySubscriptionId/terminal)
    const where = prisma.subscription.findMany.mock.calls[0][0].where
    expect(where.billingMode).toBe('recurring')
    expect(where.gatewaySubscriptionId).toEqual({ not: null })
  })

  it('best-effort: falha em um gateway NÃO lança nem bloqueia os demais (exclusão LGPD não trava)', async () => {
    const { prisma } = require('@/lib/prisma')
    const { subscriptionService } = require('@/lib/services/SubscriptionService')
    prisma.subscription.findMany.mockResolvedValue([
      { id: 's1', gateway: 'MERCADO_PAGO', gatewaySubscriptionId: 'pre-1' },
      { id: 's2', gateway: 'MERCADO_PAGO', gatewaySubscriptionId: 'pre-2' },
    ])
    mockGateway.cancelSubscriptionTerminal.mockRejectedValueOnce(new Error('gateway down')) // 1ª falha

    await expect(subscriptionService.terminateGatewaySubscriptions('user-1')).resolves.toBeUndefined()
    expect(mockGateway.cancelSubscriptionTerminal).toHaveBeenCalledTimes(2) // tentou os dois
  })
})
