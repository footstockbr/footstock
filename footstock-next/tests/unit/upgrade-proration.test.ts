/**
 * Testes unitários — M066: ledger de estorno pró-rata de upgrade (upgrade-proration.ts).
 * Desenho pós-review codex (2ª rodada): OUTBOX durável criado na tx do upgrade (F1),
 * consolidação ÚNICA com gate effectsAppliedAt exatamente-uma-vez compartilhada entre
 * executor síncrono e eco de webhook (F2/F3), PARTIALLY_REFUNDED nunca promovido a
 * REFUNDED inteiro, clawback proporcional de comissão PENDING, fallback FS$ 1.3x.
 */

jest.mock('@/lib/env', () => ({
  env: {
    UPGRADE_PRORATION_REFUND_ENABLED: 'true',
    UPGRADE_PRORATION_REFUND_FLOOR_CENTS: '200',
  },
}))

const refundPaymentMock = jest.fn()
jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGateway: jest.fn(() => ({ refundPayment: refundPaymentMock })),
}))

jest.mock('@/lib/prisma', () => {
  const paymentRefund = {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  }
  const payment = { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
  const affiliateTransaction = {
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
  }
  const user = { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) }
  const transaction = { create: jest.fn().mockResolvedValue({}) }
  const notification = { create: jest.fn().mockResolvedValue({}) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = { paymentRefund, payment, affiliateTransaction, user, transaction, notification }
  prisma.$transaction = jest.fn(async (arg: unknown): Promise<unknown> => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(prisma)
    return Promise.all(arg as Promise<unknown>[])
  })
  return { prisma }
})

import {
  createUpgradeProrationRefundOutbox,
  consolidateExpectedRefund,
  executeUpgradeProrationRefund,
  sweepPendingUpgradeProrationRefunds,
} from '@/lib/services/upgrade-proration'
import { prisma } from '@/lib/prisma'
import { GatewayRetryableError } from '@/lib/gateways/IGateway'
import type { Prisma } from '@prisma/client'

const pr = prisma.paymentRefund as unknown as Record<string, jest.Mock>
const pay = prisma.payment as unknown as Record<string, jest.Mock>
const aff = prisma.affiliateTransaction as unknown as Record<string, jest.Mock>
const usr = prisma.user as unknown as Record<string, jest.Mock>
const txn = prisma.transaction as unknown as Record<string, jest.Mock>
const notif = prisma.notification as unknown as Record<string, jest.Mock>

const LEDGER = {
  id: 'ref-1',
  paymentId: 'pay-db-1',
  gatewayPaymentId: '167033565774',
  amountCents: 45,
  reason: 'UPGRADE_PRORATION',
  expected: true,
  idempotencyKey: 'upgrade-proration-newsub',
  status: 'REQUESTED',
  effectsAppliedAt: null,
  metadata: {
    userId: 'u1',
    newSubscriptionId: 'newsub',
    priorSubscriptionId: 'oldsub',
    priorAmountCents: 100,
    gateway: 'MERCADO_PAGO',
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  pr.updateMany.mockResolvedValue({ count: 1 })
  pr.findMany.mockResolvedValue([])
  pr.upsert.mockResolvedValue({ id: 'ref-1' })
  pay.updateMany.mockResolvedValue({ count: 1 })
  aff.findMany.mockResolvedValue([])
  refundPaymentMock.mockResolvedValue({ refundId: 'mp-refund-1', alreadyRefunded: false })
})

describe('createUpgradeProrationRefundOutbox — F1 (outbox na tx do upgrade)', () => {
  it('happy: upsert REQUESTED idempotente por idempotencyKey, com metadata de contexto', async () => {
    const id = await createUpgradeProrationRefundOutbox(prisma as unknown as Prisma.TransactionClient, {
      newSubscriptionId: 'newsub',
      userId: 'u1',
      priorSubscriptionId: 'oldsub',
      priorAmountCents: 100,
      paymentDbId: 'pay-db-1',
      gatewayPaymentId: '167033565774',
      gateway: 'MERCADO_PAGO',
      residualCents: 45,
    })
    expect(id).toBe('ref-1')
    expect(pr.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'upgrade-proration-newsub' },
      update: {}, // replay NUNCA rebaixa estado avançado
      create: expect.objectContaining({
        amountCents: 45,
        reason: 'UPGRADE_PRORATION',
        metadata: expect.objectContaining({ priorSubscriptionId: 'oldsub', userId: 'u1' }),
      }),
    }))
  })
})

describe('consolidateExpectedRefund — F2/F3 (consolidação única, efeitos exatamente-uma-vez)', () => {
  it('happy: SUCCEEDED com efeitos — Payment PARTIALLY_REFUNDED acumulado + notificação', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER })
    // 1ª updateMany = status CAS; 2ª = gate de efeitos (effectsAppliedAt null)
    pr.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    pay.findUnique.mockResolvedValue({ amount: 100, refundedAmountCents: 0 })

    const result = await consolidateExpectedRefund('ref-1', {
      toStatus: 'SUCCEEDED',
      gatewayRefundId: 'mp-refund-1',
    })

    expect(result).toBe('EFFECTS_APPLIED')
    // Parcial NUNCA vira REFUNDED inteiro: 45 de 100 => PARTIALLY_REFUNDED
    expect(pay.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'pay-db-1', status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }),
      data: { refundedAmountCents: 45, status: 'PARTIALLY_REFUNDED' },
    }))
    expect(notif.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'UPGRADE_PRORATION_REFUND', userId: 'u1' }),
    }))
  })

  it('happy: eco após consolidação síncrona (effectsAppliedAt já setado) => STATUS_ONLY, zero efeitos', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER, status: 'SUCCEEDED' })
    pr.updateMany
      .mockResolvedValueOnce({ count: 1 }) // status SUCCEEDED -> WEBHOOK_CONFIRMED
      .mockResolvedValueOnce({ count: 0 }) // gate de efeitos: já aplicado

    const result = await consolidateExpectedRefund('ref-1', { toStatus: 'WEBHOOK_CONFIRMED' })

    expect(result).toBe('STATUS_ONLY')
    expect(pay.updateMany).not.toHaveBeenCalled()
    expect(notif.create).not.toHaveBeenCalled()
  })

  it('happy: crash-gap — eco de webhook em REQUESTED aplica os efeitos exatamente uma vez', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER })
    pr.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    pay.findUnique.mockResolvedValue({ amount: 100, refundedAmountCents: 0 })

    const result = await consolidateExpectedRefund('ref-1', { toStatus: 'WEBHOOK_CONFIRMED' })

    expect(result).toBe('EFFECTS_APPLIED')
    expect(pay.updateMany).toHaveBeenCalled()
  })

  it('happy: estorno que completa o valor cheio => Payment REFUNDED', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER, amountCents: 100 })
    pr.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    pay.findUnique.mockResolvedValue({ amount: 100, refundedAmountCents: 0 })

    await consolidateExpectedRefund('ref-1', { toStatus: 'SUCCEEDED' })

    expect(pay.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { refundedAmountCents: 100, status: 'REFUNDED' },
    }))
  })

  it('happy: clawback proporcional da comissão PENDING (45% estornado => comissão reduzida)', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER, amountCents: 45 })
    pr.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    pay.findUnique.mockResolvedValue({ amount: 100, refundedAmountCents: 0 })
    aff.findMany.mockResolvedValue([{ id: 'comm-1', amount: 0.1 }])

    await consolidateExpectedRefund('ref-1', { toStatus: 'SUCCEEDED' })

    const updateArg = aff.update.mock.calls[0][0]
    expect(Number(updateArg.data.amount)).toBeCloseTo(0.06, 2)
  })

  it('happy: clawback que zera a comissão => VOIDED', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER, amountCents: 100 })
    pr.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    pay.findUnique.mockResolvedValue({ amount: 100, refundedAmountCents: 0 })
    aff.findMany.mockResolvedValue([{ id: 'comm-1', amount: 0.1 }])

    await consolidateExpectedRefund('ref-1', { toStatus: 'SUCCEEDED' })

    expect(aff.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'comm-1' },
      data: { status: 'VOIDED' },
    }))
  })
})

describe('executeUpgradeProrationRefund — executor síncrono', () => {
  it('happy: gateway OK => consolida como SUCCEEDED', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER })
    pr.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    pay.findUnique.mockResolvedValue({ amount: 100, refundedAmountCents: 0 })

    const result = await executeUpgradeProrationRefund('ref-1')

    expect(result).toBe('SUCCEEDED')
    expect(refundPaymentMock).toHaveBeenCalledWith('167033565774', 45)
  })

  it('sad: falha transitória => FAILED_RETRYABLE, sem tocar Payment', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER })
    refundPaymentMock.mockRejectedValue(new GatewayRetryableError('MP 502'))

    const result = await executeUpgradeProrationRefund('ref-1')

    expect(result).toBe('FAILED_RETRYABLE')
    expect(pr.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED_RETRYABLE' }),
    }))
    expect(pay.updateMany).not.toHaveBeenCalled()
  })

  it('sad: rejeição terminal (MP 3024) => FAILED_UNSUPPORTED + fallback FS$ 1.3x + notificação', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER, amountCents: 100 })
    refundPaymentMock.mockRejectedValue(
      new Error('[MERCADO_PAGO] refund rejeitado HTTP 400: Partial refund unsupported (3024)')
    )
    usr.findUnique.mockResolvedValue({ fsBalance: 2000 })

    const result = await executeUpgradeProrationRefund('ref-1')

    expect(result).toBe('FAILED_UNSUPPORTED')
    expect(usr.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: { fsBalance: { increment: 1.3 } },
    }))
    expect(txn.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ financialType: 'BONUS', fsAmount: 1.3 }),
    }))
    expect(notif.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ title: 'Bônus promocional de migração' }),
    }))
  })

  it('sad: ledger já SUCCEEDED => SKIPPED sem chamada ao gateway (idempotência)', async () => {
    pr.findUnique.mockResolvedValue({ ...LEDGER, status: 'SUCCEEDED' })
    const result = await executeUpgradeProrationRefund('ref-1')
    expect(result).toBe('SKIPPED')
    expect(refundPaymentMock).not.toHaveBeenCalled()
  })

  it('sad: erro inesperado ao carregar NUNCA propaga', async () => {
    pr.findUnique.mockRejectedValue(new Error('db down'))
    await expect(executeUpgradeProrationRefund('ref-1')).resolves.toBe('SKIPPED')
  })
})

describe('sweepPendingUpgradeProrationRefunds — retry do cron (cobre REQUESTED órfão do outbox)', () => {
  it('happy: re-executa FAILED_RETRYABLE e contabiliza', async () => {
    pr.findMany.mockResolvedValue([{ id: 'ref-1' }])
    pr.findUnique.mockResolvedValue({ ...LEDGER, status: 'FAILED_RETRYABLE' })
    pr.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    pay.findUnique.mockResolvedValue({ amount: 100, refundedAmountCents: 0 })

    const result = await sweepPendingUpgradeProrationRefunds(10)

    expect(result).toEqual({ scanned: 1, succeeded: 1, retryable: 0, unsupported: 0 })
  })

  it('happy: nada pendente => zeros', async () => {
    pr.findMany.mockResolvedValue([])
    const result = await sweepPendingUpgradeProrationRefunds(10)
    expect(result).toEqual({ scanned: 0, succeeded: 0, retryable: 0, unsupported: 0 })
  })
})
