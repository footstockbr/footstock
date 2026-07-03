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
  const user = { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) }
  const notification = { create: jest.fn().mockResolvedValue({}) }
  // M066: pró-rata lê o último Payment PAID da sub antiga dentro da tx
  const payment = { findFirst: jest.fn().mockResolvedValue(null) }
  // M066/F4: crédito FS$ imediato gera extrato Transaction BONUS na tx
  const transaction = { create: jest.fn().mockResolvedValue({}) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = { subscription, user, notification, payment, transaction }
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
// M066: mocka o ledger de estorno — os testes assertam a DECISÃO do upgradeUser (intent
// coletado vs crédito FS$), não a execução do gateway (coberta em upgrade-proration.test.ts).
jest.mock('@/lib/services/upgrade-proration', () => ({
  createUpgradeProrationRefundOutbox: jest.fn().mockResolvedValue('ref-ledger-1'),
  executeUpgradeProrationRefund: jest.fn().mockResolvedValue('SUCCEEDED'),
  isUpgradeProrationRefundEnabled: jest.fn(() => false),
  upgradeProrationRefundFloorCents: jest.fn(() => 200),
}))

import { PlanService } from '@/lib/services/PlanService'
import { prisma } from '@/lib/prisma'
import { notificationService } from '@/lib/notifications'
import {
  createUpgradeProrationRefundOutbox,
  executeUpgradeProrationRefund,
  isUpgradeProrationRefundEnabled,
} from '@/lib/services/upgrade-proration'
import { getGateway } from '@/lib/gateways/GatewayFactory'

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

  it('#5 CRÍTICO: religa usuário suspenso por lapso — usr.updateMany SUSPENDED→ACTIVE ao ativar', async () => {
    sub.findUnique.mockResolvedValue({
      id: 'new', userId: 'u1', planType: 'CRAQUE', status: 'PENDING', amount: 100,
    })
    usr.findUnique.mockResolvedValue({ planType: 'JOGADOR', adminRole: null })
    sub.findMany.mockResolvedValue([])
    sub.updateMany.mockResolvedValue({ count: 1 })

    await planService.upgradeUser('u1', 'new')

    // reset ESCOPADO em SUSPENDED (não toca BANNED nem outros estados). Sem isto o assinante
    // suspenso por lapso pagava e continuava sem login.
    expect(usr.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1', status: 'SUSPENDED' },
      data: { status: 'ACTIVE' },
    }))
  })

  it('upgrade recorrente: cancela TERMINALMENTE o preapproval da assinatura ANTERIOR no gateway (anti double-charge)', async () => {
    const cancelTerminal = jest.fn().mockResolvedValue(undefined)
    const { getGateway } = require('@/lib/gateways/GatewayFactory')
    getGateway.mockReturnValue({ cancelSubscriptionTerminal: cancelTerminal })
    sub.findUnique.mockResolvedValue({ id: 'new', userId: 'u1', planType: 'LENDA', status: 'PENDING', amount: 9990 })
    usr.findUnique.mockResolvedValue({ planType: 'CRAQUE', adminRole: null })
    // assinatura CRAQUE anterior RECORRENTE (preapproval vivo no gateway) sendo superseded pelo upgrade
    sub.findMany.mockResolvedValue([
      { id: 'old', status: 'ACTIVE', bonusAmount: null, bonusScheduledAt: null, bonusCreditedAt: null,
        billingMode: 'recurring', gateway: 'MERCADO_PAGO', gatewaySubscriptionId: 'preapp-old' },
    ])
    sub.updateMany.mockResolvedValue({ count: 1 })

    await planService.upgradeUser('u1', 'new')

    // Sem isto, o auto-renew do CRAQUE continuaria cobrando após o upgrade para LENDA.
    expect(cancelTerminal).toHaveBeenCalledWith('preapp-old')
  })
})

// ─── M066: pró-rata do tempo não usado no upgrade (estudo 2026-07-03) ───────────
describe('PlanService.upgradeUser — M066 pró-rata', () => {
  const DAY = 24 * 60 * 60 * 1000
  const outboxMock = createUpgradeProrationRefundOutbox as unknown as jest.Mock
  const executeMock = executeUpgradeProrationRefund as unknown as jest.Mock
  const enabledMock = isUpgradeProrationRefundEnabled as unknown as jest.Mock
  const pay = prisma.payment as unknown as Record<string, jest.Mock>
  const gw = getGateway as unknown as jest.Mock

  function priorActive(overrides: Record<string, unknown> = {}) {
    const now = Date.now()
    return {
      id: 'old',
      status: 'ACTIVE',
      cancelledAt: null,
      bonusAmount: null,
      bonusScheduledAt: null,
      bonusCreditedAt: null,
      billingMode: 'recurring',
      gateway: 'MERCADO_PAGO',
      gatewaySubscriptionId: 'pre-old',
      amount: 100,
      planType: 'CRAQUE',
      startsAt: new Date(now - 15 * DAY),
      expiresAt: new Date(now + 15 * DAY),
      currentPeriodStart: null,
      currentPeriodEnd: null,
      ...overrides,
    }
  }

  beforeEach(() => {
    enabledMock.mockReturnValue(false)
    pay.findFirst.mockResolvedValue(null)
    gw.mockReturnValue({ cancelSubscriptionTerminal: jest.fn().mockResolvedValue(undefined) })
    sub.findUnique.mockResolvedValue({
      id: 'new', userId: 'u1', planType: 'LENDA', status: 'PENDING', amount: 120,
      upgradeProrationMeta: null,
    })
    usr.findUnique.mockResolvedValue({ planType: 'CRAQUE', adminRole: null, fsBalance: 2000 })
  })

  it('Fase 1 (FS$): residual ×1.2 creditado IMEDIATO (F4), bônus T+7 fica só no diferencial', async () => {
    sub.findMany.mockResolvedValue([priorActive()])

    await planService.upgradeUser('u1', 'new')

    const newUpdate = sub.updateMany.mock.calls.find((c) => c[0].where.id === 'new')![0]
    // F4 (review codex): o pró-rata NÃO entra no bonusAmount cancelável — bônus = só diferencial
    expect(newUpdate.data.bonusAmount).toBe(20000)
    // metade do ciclo de 30d sobre 100c => residual 50c (ceil); FS$ = 50×1.2/100 = 0.6 IMEDIATO
    expect(usr.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: { fsBalance: { increment: 0.6 } },
    }))
    const txnCreate = (prisma as unknown as { transaction: { create: jest.Mock } }).transaction.create
    expect(txnCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ financialType: 'BONUS', fsAmount: 0.6 }),
    }))
    const meta = newUpdate.data.upgradeProrationMeta as {
      proration: { entries: Array<Record<string, unknown>> }
    }
    expect(meta.proration.entries[0]).toMatchObject({
      priorSubscriptionId: 'old',
      compensation: 'FS_CREDIT',
      residualCents: 50,
      fsCredit: 0.6,
      creditedImmediately: true,
    })
    expect(outboxMock).not.toHaveBeenCalled()
  })

  it('Fase 2 (flag on + acima do piso): intent de estorno pós-commit, SEM crédito FS$ do residual', async () => {
    enabledMock.mockReturnValue(true)
    sub.findMany.mockResolvedValue([priorActive({ amount: 1000 })])
    pay.findFirst.mockResolvedValue({
      id: 'pay-db', gatewayTransactionId: '167033565774', amount: 1000, refundedAmountCents: 0,
    })

    await planService.upgradeUser('u1', 'new')

    // residual = 500c >= piso 200 => refund path: outbox na tx (F1) + execução pós-commit
    expect(outboxMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      newSubscriptionId: 'new',
      priorSubscriptionId: 'old',
      gatewayPaymentId: '167033565774',
      residualCents: 500,
    }))
    expect(executeMock).toHaveBeenCalledWith('ref-ledger-1')
    const newUpdate = sub.updateMany.mock.calls.find((c) => c[0].where.id === 'new')![0]
    // bônus fica só no diferencial (20000) — residual vai em dinheiro, não em FS$
    expect(newUpdate.data.bonusAmount).toBe(20000)
    const meta = newUpdate.data.upgradeProrationMeta as {
      proration: { entries: Array<Record<string, unknown>> }
    }
    expect(meta.proration.entries[0]).toMatchObject({ compensation: 'PARTIAL_REFUND' })
  })

  it('Fase 2 flag on mas residual ABAIXO do piso => cai no crédito FS$ (sem refund de centavos)', async () => {
    enabledMock.mockReturnValue(true)
    sub.findMany.mockResolvedValue([priorActive({ amount: 100 })]) // residual 50c < piso 200

    await planService.upgradeUser('u1', 'new')

    expect(outboxMock).not.toHaveBeenCalled()
    // FS$ imediato (0.6), bônus T+7 intacto no diferencial
    expect(usr.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { fsBalance: { increment: 0.6 } },
    }))
  })

  it('sad: flag on sem Payment PAID rastreável => fallback FS$ (nunca fica sem compensação)', async () => {
    enabledMock.mockReturnValue(true)
    sub.findMany.mockResolvedValue([priorActive({ amount: 1000 })])
    pay.findFirst.mockResolvedValue(null)

    await planService.upgradeUser('u1', 'new')

    expect(outboxMock).not.toHaveBeenCalled()
    // residual 500c ×1.2 = FS$ 6 IMEDIATO; bônus T+7 = só diferencial
    expect(usr.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { fsBalance: { increment: 6 } },
    }))
    const newUpdate = sub.updateMany.mock.calls.find((c) => c[0].where.id === 'new')![0]
    expect(newUpdate.data.bonusAmount).toBe(20000)
  })

  it('sad: ciclo do plano antigo já expirado => zero pró-rata (só o diferencial)', async () => {
    const past = Date.now() - 40 * DAY
    sub.findMany.mockResolvedValue([
      priorActive({ startsAt: new Date(past), expiresAt: new Date(past + 30 * DAY) }),
    ])

    await planService.upgradeUser('u1', 'new')

    const newUpdate = sub.updateMany.mock.calls.find((c) => c[0].where.id === 'new')![0]
    expect(newUpdate.data.bonusAmount).toBe(20000)
    expect(outboxMock).not.toHaveBeenCalled()
  })
})
