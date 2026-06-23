/**
 * Testes unitários — PlanService.upgradeUser (R3)
 * Encerra assinatura ACTIVE anterior no upgrade, preserva bônus pendente,
 * não reativa assinatura em estado terminal.
 * Fonte: blacksmith/brainstorm-mcp/05-24-foot-stock-bugfix-tasks-ciclo-assinatura.md (task-003)
 */

jest.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://example.test' } }))

jest.mock('@/lib/prisma', () => {
  const subscription = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  }
  const user = { findUnique: jest.fn(), update: jest.fn() }
  const notification = { create: jest.fn().mockResolvedValue({}) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = { subscription, user, notification }
  prisma.$transaction = jest.fn(async (arg: unknown): Promise<unknown> => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(prisma)
    return Promise.all(arg as Promise<unknown>[])
  })
  return { prisma }
})

jest.mock('@/lib/gateways/GatewayFactory', () => ({ getGateway: jest.fn() }))
jest.mock('@/lib/services/SubscriptionService', () => ({
  subscriptionService: { createSubscription: jest.fn() },
}))
jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({
  leagueAutoEnrollService: { enrollUserInPublicLeague: jest.fn().mockResolvedValue(undefined) },
}))
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: jest.fn().mockResolvedValue({ notification: {}, deduped: false }) },
}))

import { PlanService } from '@/lib/services/PlanService'
import { prisma } from '@/lib/prisma'
import { notificationService } from '@/lib/notifications'

const planService = new PlanService()
const sub = prisma.subscription as unknown as Record<string, jest.Mock>
const usr = prisma.user as unknown as Record<string, jest.Mock>
const notify = notificationService.notify as unknown as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('PlanService.upgradeUser — R3', () => {
  it('encerra assinatura ACTIVE anterior como CANCELLED e ativa a nova', async () => {
    sub.findUnique.mockResolvedValue({
      id: 'new', userId: 'u1', planType: 'LENDA', status: 'PENDING', amount: 9990,
    })
    usr.findUnique.mockResolvedValue({ planType: 'CRAQUE', adminRole: null })
    sub.findMany.mockResolvedValue([
      { id: 'old', bonusAmount: null, bonusScheduledAt: null, bonusCreditedAt: null },
    ])

    await planService.upgradeUser('u1', 'new')

    // assinatura anterior encerrada
    expect(sub.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'old' },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    }))
    // nova ativada via updateMany com revalidação de status (anti-corrida)
    expect(sub.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'new' }),
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }))
    expect(usr.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' }, data: { planType: 'LENDA' },
    }))
  })

  it('preserva bônus pendente: CRAQUE(3000 pendente)->LENDA agenda 23000 (não 20000)', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    sub.findUnique.mockResolvedValue({
      id: 'new', userId: 'u1', planType: 'LENDA', status: 'PENDING', amount: 9990,
    })
    usr.findUnique.mockResolvedValue({ planType: 'CRAQUE', adminRole: null })
    sub.findMany.mockResolvedValue([
      { id: 'old', bonusAmount: 3000, bonusScheduledAt: future, bonusCreditedAt: null },
    ])

    await planService.upgradeUser('u1', 'new')

    const newUpdate = sub.updateMany.mock.calls.find((c) => c[0].where.id === 'new')![0]
    expect(newUpdate.data.bonusAmount).toBe(23000)
    // mantém a data de agendamento mais cedo (a do bônus pendente anterior)
    expect(newUpdate.data.bonusScheduledAt).toEqual(future)
  })

  it('NÃO reativa assinatura em estado terminal (CANCELLED) por webhook atrasado', async () => {
    sub.findUnique.mockResolvedValue({
      id: 'new', userId: 'u1', planType: 'LENDA', status: 'CANCELLED', amount: 9990,
    })
    usr.findUnique.mockResolvedValue({ planType: 'JOGADOR', adminRole: null })

    await planService.upgradeUser('u1', 'new')

    expect(sub.update).not.toHaveBeenCalled()
    expect(usr.update).not.toHaveBeenCalled()
  })

  it('aborta ativação se status muda dentro da transação (refund concorrente, count=0)', async () => {
    sub.findUnique.mockResolvedValue({
      id: 'new', userId: 'u1', planType: 'LENDA', status: 'PENDING', amount: 9990,
    })
    usr.findUnique.mockResolvedValue({ planType: 'JOGADOR', adminRole: null })
    sub.findMany.mockResolvedValue([])
    sub.updateMany.mockResolvedValue({ count: 0 }) // refund concorrente já moveu p/ CANCELLED

    await expect(planService.upgradeUser('u1', 'new')).rejects.toMatchObject({
      code: 'PAYMENT_ACTIVATION_RACE',
    })
    expect(usr.update).not.toHaveBeenCalled()
  })

  it('idempotente: já ACTIVE faz skip silencioso', async () => {
    sub.findUnique.mockResolvedValue({
      id: 'new', userId: 'u1', planType: 'LENDA', status: 'ACTIVE', amount: 9990,
    })
    usr.findUnique.mockResolvedValue({ planType: 'LENDA', adminRole: null })

    await planService.upgradeUser('u1', 'new')

    expect(sub.update).not.toHaveBeenCalled()
    expect(usr.update).not.toHaveBeenCalled()
  })

  // ERR-1 (FIX-25 recovery): occurrence_marker de pagamento_confirmado = paymentRef (paymentId),
  // não subscriptionId. Senão a renovação (dunning reativa a MESMA subscription) colidiria na
  // idempotency_key da ativação original e o cliente não receberia a confirmação (Zero Silêncio).
  it('pagamento_confirmado usa o paymentRef como occurrence_marker (entityId), não o subscriptionId', async () => {
    sub.findUnique.mockResolvedValue({
      id: 'sub-1', userId: 'u1', planType: 'LENDA', status: 'PENDING', amount: 9990,
    })
    usr.findUnique.mockResolvedValue({ planType: 'JOGADOR', adminRole: null })
    sub.findMany.mockResolvedValue([])
    sub.updateMany.mockResolvedValue({ count: 1 })

    await planService.upgradeUser('u1', 'sub-1', 'pay-AAA')

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pagamento_confirmado', entityId: 'pay-AAA' })
    )
  })

  it('renovação da MESMA subscription com pagamento novo gera entityId distinto (não deduplicado)', async () => {
    const activate = async (paymentRef: string) => {
      sub.findUnique.mockResolvedValue({
        id: 'sub-1', userId: 'u1', planType: 'LENDA', status: 'PENDING', amount: 9990,
      })
      usr.findUnique.mockResolvedValue({ planType: 'JOGADOR', adminRole: null })
      sub.findMany.mockResolvedValue([])
      sub.updateMany.mockResolvedValue({ count: 1 })
      await planService.upgradeUser('u1', 'sub-1', paymentRef)
    }

    await activate('pay-CICLO-1')
    await activate('pay-CICLO-2') // renovação: mesma subscription, pagamento novo

    const entityIds = notify.mock.calls
      .filter((c) => c[0]?.type === 'pagamento_confirmado')
      .map((c) => c[0].entityId)
    expect(entityIds).toEqual(['pay-CICLO-1', 'pay-CICLO-2'])
    // duas chaves distintas => a confirmação da renovação não é silenciada por dedupe
    expect(new Set(entityIds).size).toBe(2)
  })
})
