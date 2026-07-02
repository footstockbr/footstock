// ============================================================================
// PA-WH-01 — claim atômico de idempotência de webhook (state machine)
// ============================================================================

import { claimWebhook } from '@/lib/services/webhook-idempotency'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    webhookIdempotency: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as unknown as {
  webhookIdempotency: {
    create: jest.Mock
    findUnique: jest.Mock
    updateMany: jest.Mock
  }
}

const P2002 = Object.assign(new Error('unique violation'), { code: 'P2002' })
const GW = 'MERCADO_PAGO' as never

describe('claimWebhook (PA-WH-01)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('CLAIMED na primeira reivindicação (create bem-sucedido)', async () => {
    mockPrisma.webhookIdempotency.create.mockResolvedValue({ id: 'c1' })
    const r = await claimWebhook(GW, 'PAYMENT_CONFIRMED', 'tx1')
    expect(r).toEqual({ outcome: 'CLAIMED', id: 'c1' })
  })

  it('DUPLICATE quando a linha já está PROCESSED', async () => {
    mockPrisma.webhookIdempotency.create.mockRejectedValue(P2002)
    mockPrisma.webhookIdempotency.findUnique.mockResolvedValue({ id: 'c1', status: 'PROCESSED', updatedAt: new Date() })
    const r = await claimWebhook(GW, 'PAYMENT_CONFIRMED', 'tx1')
    expect(r).toEqual({ outcome: 'DUPLICATE' })
    expect(mockPrisma.webhookIdempotency.updateMany).not.toHaveBeenCalled()
  })

  it('IN_PROGRESS quando PROCESSING dentro do lease', async () => {
    mockPrisma.webhookIdempotency.create.mockRejectedValue(P2002)
    mockPrisma.webhookIdempotency.findUnique.mockResolvedValue({ id: 'c1', status: 'PROCESSING', updatedAt: new Date() })
    const r = await claimWebhook(GW, 'PAYMENT_CONFIRMED', 'tx1')
    expect(r).toEqual({ outcome: 'IN_PROGRESS' })
    expect(mockPrisma.webhookIdempotency.updateMany).not.toHaveBeenCalled()
  })

  it('re-CLAIMED quando a linha anterior está FAILED', async () => {
    mockPrisma.webhookIdempotency.create.mockRejectedValue(P2002)
    mockPrisma.webhookIdempotency.findUnique.mockResolvedValue({ id: 'c1', status: 'FAILED', updatedAt: new Date() })
    mockPrisma.webhookIdempotency.updateMany.mockResolvedValue({ count: 1 })
    const r = await claimWebhook(GW, 'PAYMENT_CONFIRMED', 'tx1')
    expect(r).toEqual({ outcome: 'CLAIMED', id: 'c1' })
  })

  it('re-CLAIMED quando PROCESSING com lease expirado (abandonado)', async () => {
    mockPrisma.webhookIdempotency.create.mockRejectedValue(P2002)
    const stale = new Date(Date.now() - 61_000)
    mockPrisma.webhookIdempotency.findUnique.mockResolvedValue({ id: 'c1', status: 'PROCESSING', updatedAt: stale })
    mockPrisma.webhookIdempotency.updateMany.mockResolvedValue({ count: 1 })
    const r = await claimWebhook(GW, 'PAYMENT_CONFIRMED', 'tx1')
    expect(r).toEqual({ outcome: 'CLAIMED', id: 'c1' })
  })

  it('IN_PROGRESS quando o CAS de re-claim perde a corrida (count=0)', async () => {
    mockPrisma.webhookIdempotency.create.mockRejectedValue(P2002)
    mockPrisma.webhookIdempotency.findUnique.mockResolvedValue({ id: 'c1', status: 'FAILED', updatedAt: new Date() })
    mockPrisma.webhookIdempotency.updateMany.mockResolvedValue({ count: 0 })
    const r = await claimWebhook(GW, 'PAYMENT_CONFIRMED', 'tx1')
    expect(r).toEqual({ outcome: 'IN_PROGRESS' })
  })

  it('propaga erro não-P2002 (não mascara falha real de DB)', async () => {
    mockPrisma.webhookIdempotency.create.mockRejectedValue(Object.assign(new Error('conn'), { code: 'P1001' }))
    await expect(claimWebhook(GW, 'PAYMENT_CONFIRMED', 'tx1')).rejects.toThrow('conn')
  })
})
