/**
 * Testes unitários — createCheckout: recover-or-supersede de PENDING recorrente abandonado.
 *
 * BUG CRÍTICO corrigido: com MP recorrente LIGADO, todo checkout cria um PENDING recorrente com
 * gatewaySubscriptionId. O guard antigo (`|| holdsGatewaySub`) reutilizava INCONDICIONALMENTE →
 * um PENDING abandonado bloqueava a assinatura PARA SEMPRE ("Você já tem um pagamento pendente…"),
 * matando a venda. Fix: fresco+mesmo período reutiliza; abandonado (stale) faz SUPERSEDE
 * (cancela o preapproval no gateway TERMINALMENTE + cancela local + checkout novo). Guard
 * anti-double-charge: preapproval 'authorized' (webhook atrasado) NUNCA é superseded.
 */

jest.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_APP_URL: 'https://app.test', MERCADO_PAGO_ACCESS_TOKEN: 'tok' },
}))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    subscription: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  },
}))
const mockGateway = {
  getSubscriptionStatus: jest.fn(),
  cancelSubscriptionTerminal: jest.fn().mockResolvedValue(undefined),
  createCheckout: jest.fn().mockResolvedValue({ redirectUrl: 'https://fresh-checkout', transactionId: 'tx-new' }),
  createSubscription: jest.fn(),
}
jest.mock('@/lib/gateways/GatewayFactory', () => ({ getGateway: jest.fn(() => mockGateway) }))
jest.mock('@/lib/services/SubscriptionService', () => ({
  subscriptionService: { createSubscription: jest.fn().mockResolvedValue({ id: 'new-sub' }) },
}))
jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({
  leagueAutoEnrollService: { enrollUserInPublicLeague: jest.fn() },
}))
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: jest.fn().mockResolvedValue({ notification: {}, deduped: false }) },
}))
jest.mock('@/lib/gateways/recurring-flag', () => ({ isRecurringEnabled: jest.fn().mockResolvedValue(false) }))

import { PlanService } from '@/lib/services/PlanService'
const planService = new PlanService()

function setUser() {
  const { prisma } = require('@/lib/prisma')
  prisma.user.findUnique.mockResolvedValue({ planType: 'JOGADOR', adminRole: null, email: 'u@t.com' })
}
// findFirst: ACTIVE-check -> null; PENDING-check -> o openPending fornecido.
function setPending(pending: Record<string, unknown> | null) {
  const { prisma } = require('@/lib/prisma')
  prisma.subscription.findFirst.mockImplementation(({ where }: { where: { status?: string } }) => {
    if (where.status === 'ACTIVE') return Promise.resolve(null)
    if (where.status === 'PENDING') return Promise.resolve(pending)
    return Promise.resolve(null)
  })
}
const DTO = { planType: 'CRAQUE' as const, gateway: 'MERCADO_PAGO' as const, period: 'monthly' as const, userEmail: 'u@t.com' }
const recurringPending = (overrides: Record<string, unknown>) => ({
  id: 'old-pending', period: 'MONTHLY', billingMode: 'recurring',
  gatewaySubscriptionId: 'preapp-1', gateway: 'MERCADO_PAGO', ...overrides,
})

beforeEach(() => jest.clearAllMocks())

describe('createCheckout — recover-or-supersede (anti-lockout)', () => {
  it('PENDING recorrente FRESCO + mesmo período → REUTILIZA (não bloqueia, não chama gateway)', async () => {
    setUser()
    setPending(recurringPending({ createdAt: new Date() })) // fresco
    const res = await planService.createCheckout('user-1', DTO)
    expect(res.subscriptionId).toBe('old-pending')
    expect(res.redirectUrl).toContain('payment=pending&sub=old-pending')
    expect(mockGateway.getSubscriptionStatus).not.toHaveBeenCalled()
    expect(mockGateway.cancelSubscriptionTerminal).not.toHaveBeenCalled()
    const { prisma } = require('@/lib/prisma')
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
  })

  it('PENDING recorrente ABANDONADO (stale, gateway pending) → SUPERSEDE + checkout NOVO', async () => {
    setUser()
    setPending(recurringPending({ createdAt: new Date(Date.now() - 10 * 60 * 1000) })) // 10min = stale
    mockGateway.getSubscriptionStatus.mockResolvedValue({ status: 'pending' })
    const res = await planService.createCheckout('user-1', DTO)
    // Cancelou TERMINALMENTE o preapproval antigo no gateway antes de liberar o lock.
    expect(mockGateway.cancelSubscriptionTerminal).toHaveBeenCalledWith('preapp-1')
    const { prisma } = require('@/lib/prisma')
    const upd = prisma.subscription.updateMany.mock.calls[0][0]
    expect(upd.where).toMatchObject({ id: 'old-pending', status: 'PENDING' })
    expect(upd.data.status).toBe('CANCELLED')
    // Resultado é um checkout FRESCO (não o aviso de pendência) — a venda acontece.
    expect(res.redirectUrl).toBe('https://fresh-checkout')
    expect(res.subscriptionId).toBe('new-sub')
  })

  it('anti-double-charge: se a CONSULTA de status do gateway FALHA → 503 retry (não cancela às cegas)', async () => {
    setUser()
    setPending(recurringPending({ createdAt: new Date(Date.now() - 10 * 60 * 1000) }))
    mockGateway.getSubscriptionStatus.mockRejectedValue(new Error('gateway timeout'))
    await expect(planService.createCheckout('user-1', DTO)).rejects.toMatchObject({
      code: 'PAYMENT_SUPERSEDE_RETRY', statusCode: 503,
    })
    // Status indeterminado → NÃO cancela (poderia ser 'authorized' e virar dupla cobrança).
    expect(mockGateway.cancelSubscriptionTerminal).not.toHaveBeenCalled()
    const { prisma } = require('@/lib/prisma')
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
  })

  it('anti-double-charge: preapproval ABANDONADO mas AUTHORIZED (webhook atrasado) → NÃO supersede', async () => {
    setUser()
    setPending(recurringPending({ createdAt: new Date(Date.now() - 10 * 60 * 1000) }))
    mockGateway.getSubscriptionStatus.mockResolvedValue({ status: 'authorized' }) // já pagou
    const res = await planService.createCheckout('user-1', DTO)
    expect(mockGateway.cancelSubscriptionTerminal).not.toHaveBeenCalled()
    const { prisma } = require('@/lib/prisma')
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    expect(res.redirectUrl).toContain('payment=pending&sub=old-pending')
  })

  it.each(['cancelled', 'not_found'])(
    'preapproval MORTO (%s) → pula o cancel e faz supersede LOCAL (sem 503 eterno / lockout permanente)',
    async (deadStatus) => {
      setUser()
      setPending(recurringPending({ createdAt: new Date(Date.now() - 10 * 60 * 1000) }))
      mockGateway.getSubscriptionStatus.mockResolvedValue({ status: deadStatus })
      const res = await planService.createCheckout('user-1', DTO)
      // Nada vivo a cancelar → NÃO chama o gateway (evita 4xx/404 → 503 eterno).
      expect(mockGateway.cancelSubscriptionTerminal).not.toHaveBeenCalled()
      const { prisma } = require('@/lib/prisma')
      // Supersede LOCAL acontece e a venda prossegue (checkout fresco).
      expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'old-pending', status: 'PENDING' }) }),
      )
      expect(res.redirectUrl).toBe('https://fresh-checkout')
    },
  )

  it('fail-closed: se o cancelamento no gateway FALHA, NÃO libera o lock nem cria checkout (503)', async () => {
    setUser()
    setPending(recurringPending({ createdAt: new Date(Date.now() - 10 * 60 * 1000) }))
    mockGateway.getSubscriptionStatus.mockResolvedValue({ status: 'pending' })
    mockGateway.cancelSubscriptionTerminal.mockRejectedValueOnce(new Error('gateway down'))
    await expect(planService.createCheckout('user-1', DTO)).rejects.toMatchObject({
      code: 'PAYMENT_SUPERSEDE_RETRY', statusCode: 503,
    })
    const { prisma } = require('@/lib/prisma')
    const { subscriptionService } = require('@/lib/services/SubscriptionService')
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled() // não superseder com preapproval vivo
    expect(subscriptionService.createSubscription).not.toHaveBeenCalled()
  })
})

/**
 * 2º sales-blocker (achado do lockout-hunt): o guard `!canUpgrade(...)` tratava RENOVAR o próprio
 * tier (planType ainda pago, sem assinatura ACTIVE — janela de graça pós-expiração) como downgrade
 * e devolvia PAYMENT_054, impedindo o usuário de pagar para restaurar o acesso. Agora só bloqueia
 * downgrade REAL (destino estritamente inferior).
 */
describe('createCheckout — renovação do mesmo tier NÃO é bloqueada como downgrade', () => {
  it('planType pago SEM assinatura ACTIVE renovando o MESMO plano → checkout novo (não PAYMENT_054)', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.user.findUnique.mockResolvedValue({ planType: 'CRAQUE', adminRole: null, email: 'u@t.com' })
    setPending(null) // sem ACTIVE, sem PENDING, sem CANCELLATION_LOCK
    const res = await planService.createCheckout('user-1', DTO) // DTO pede CRAQUE
    expect(res.redirectUrl).toBe('https://fresh-checkout')
    expect(res.subscriptionId).toBe('new-sub')
  })

  it('downgrade REAL (LENDA→CRAQUE) sem CANCELLATION_LOCK → ainda bloqueia com PAYMENT_054', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.user.findUnique.mockResolvedValue({ planType: 'LENDA', adminRole: null, email: 'u@t.com' })
    setPending(null)
    await expect(planService.createCheckout('user-1', DTO)).rejects.toMatchObject({
      code: 'PAYMENT_054', statusCode: 422,
    })
  })
})
