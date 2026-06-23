/**
 * T-021 — Bonus FS$ com Carência de 7 Dias (CDC Art. 49)
 * FIX-06 — crédito de bônus via claim condicional (anti double-credit sob corrida).
 * Testes de integração para o cron de crédito de bônus e fluxos relacionados.
 *
 * Cobre:
 *  - processBonusCredits: crédito idempotente após T+7
 *  - Claim condicional (updateMany bonusCreditedAt:null + abort count===0) — anti double-credit
 *  - Múltiplos upgrades: diferenciais corretos
 *  - bonusAmount imutável armazenado vs calculado dinamicamente
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Factory define jest.fn() inline (evita TDZ de const sob hoisting de jest.mock);
// as referências são obtidas do módulo mockado após o import.

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findMany:   jest.fn(),
      update:     jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update:     jest.fn(),
    },
    transaction: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

// ─── Import após mocks ────────────────────────────────────────────────────────

import { processBonusCredits } from '@/lib/jobs/bonus-credit'
import { calcUpgradeBonusAmount } from '@/lib/services/plan-logic'
import { prisma } from '@/lib/prisma'

// ─── Referências aos mocks (pós-import) ─────────────────────────────────────────

const mockSubscriptionFindMany   = prisma.subscription.findMany as jest.Mock
const mockSubscriptionUpdateMany  = prisma.subscription.updateMany as jest.Mock
const mockNotificationCreate      = prisma.notification.create as jest.Mock
const mockPrismaTransaction       = prisma.$transaction as jest.Mock

// tx proxy: simula o cliente Prisma dentro de $transaction callback
const txMock = {
  user:         { findUnique: jest.fn(), update: jest.fn() },
  subscription: { update: jest.fn(), updateMany: jest.fn() },
  transaction:  { create: jest.fn() },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Stub fiel a um Prisma.Decimal: o código de produção usa Number(bonusAmount),
// que num Decimal real resolve via valueOf — o mock precisa expor valueOf também.
function decimalLike(n: number) {
  return { toNumber: () => n, valueOf: () => n }
}

function makeSubscription(overrides: Partial<{
  id: string; userId: string; planType: string; previousPlanType: string | null
  bonusAmount: { toNumber: () => number; valueOf: () => number } | null; bonusScheduledAt: Date; cancelledAt: Date | null
}> = {}) {
  const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // T-8 dias (já passou os 7)
  return {
    id:               'sub-001',
    userId:           'user-001',
    planType:         'CRAQUE',
    previousPlanType: 'JOGADOR',
    bonusAmount:      null,
    bonusScheduledAt: past,
    cancelledAt:      null,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('T-021 / FIX-06 — processBonusCredits (cron)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockNotificationCreate.mockResolvedValue({})
    // Claim condicional do caminho BONUS_ZERO: por padrão reivindica (count 1)
    mockSubscriptionUpdateMany.mockResolvedValue({ count: 1 })

    // Simula callback form: $transaction(async (tx) => { ... })
    // Cria um tx proxy que resolve operações com retorno padrão
    txMock.user.findUnique.mockResolvedValue({ fsBalance: 5000 })
    txMock.user.update.mockResolvedValue({})
    txMock.subscription.update.mockResolvedValue({})
    // Claim condicional dentro da tx: por padrão reivindica com sucesso (count 1)
    txMock.subscription.updateMany.mockResolvedValue({ count: 1 })
    txMock.transaction.create.mockResolvedValue({})

    mockPrismaTransaction.mockImplementation(async (fn: (tx: typeof txMock) => Promise<void>) => {
      await fn(txMock)
    })
  })

  it('credita bônus diferencial JOGADOR→CRAQUE (FS$3.000) após T+7', async () => {
    const sub = makeSubscription()
    mockSubscriptionFindMany.mockResolvedValue([sub])

    const result = await processBonusCredits()

    expect(result.processed).toBe(1)
    expect(result.errors).toBe(0)
    // Diferencial JOGADOR(2000) → CRAQUE(5000) = 3000
    expect(mockPrismaTransaction).toHaveBeenCalledTimes(1)
    expect(result.details[0]?.action).toContain('3000FS')
  })

  it('usa bonusAmount armazenado quando disponível (imutabilidade)', async () => {
    const sub = makeSubscription({ bonusAmount: decimalLike(3000) })
    mockSubscriptionFindMany.mockResolvedValue([sub])

    const result = await processBonusCredits()

    expect(result.processed).toBe(1)
    expect(result.details[0]?.action).toContain('3000FS')
  })

  it('usa diferencial calculado quando bonusAmount é null (fallback)', async () => {
    const sub = makeSubscription({ bonusAmount: null, planType: 'CRAQUE', previousPlanType: 'JOGADOR' })
    mockSubscriptionFindMany.mockResolvedValue([sub])

    const result = await processBonusCredits()

    expect(result.processed).toBe(1)
    // Diferencial calculado = 5000 - 2000 = 3000
    expect(result.details[0]?.action).toContain('3000FS')
  })

  it('é idempotente: não processa quando findMany retorna vazio', async () => {
    // A query no banco já filtra bonusCreditedAt IS NULL — se retornar vazio, sem crédito
    mockSubscriptionFindMany.mockResolvedValue([])

    const result = await processBonusCredits()

    expect(result.processed).toBe(0)
    expect(mockPrismaTransaction).not.toHaveBeenCalled()
  })

  it('não credita bônus zero (diferencial negativo/mesmo plano — BONUS_ZERO_SKIP)', async () => {
    // CRAQUE → CRAQUE (renovação sem upgrade real)
    const sub = makeSubscription({ planType: 'CRAQUE', previousPlanType: 'CRAQUE' })
    mockSubscriptionFindMany.mockResolvedValue([sub])
    mockSubscriptionUpdateMany.mockResolvedValue({ count: 1 })

    const result = await processBonusCredits()

    expect(result.processed).toBe(1)
    expect(result.details[0]?.action).toBe('BONUS_ZERO_SKIP')
    expect(mockPrismaTransaction).not.toHaveBeenCalled()
    // Claim condicional (não escrita incondicional) marca bonusCreditedAt
    expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'sub-001', bonusCreditedAt: null, status: 'ACTIVE' }),
      })
    )
  })

  it('bônus zero já reivindicado por outro runner (count 0) não reprocessa', async () => {
    const sub = makeSubscription({ planType: 'CRAQUE', previousPlanType: 'CRAQUE' })
    mockSubscriptionFindMany.mockResolvedValue([sub])
    // Outro runner concorrente já reivindicou o BONUS_ZERO
    mockSubscriptionUpdateMany.mockResolvedValue({ count: 0 })

    const result = await processBonusCredits()

    expect(result.processed).toBe(0)
    expect(result.errors).toBe(0)
    expect(result.details[0]?.action).toBe('BONUS_ZERO_ALREADY_CLAIMED')
    expect(mockPrismaTransaction).not.toHaveBeenCalled()
  })

  it('FIX-06: claim condicional usa guarda bonusCreditedAt:null + status ACTIVE na tx', async () => {
    const sub = makeSubscription()
    mockSubscriptionFindMany.mockResolvedValue([sub])

    await processBonusCredits()

    // O claim que reserva o crédito acontece DENTRO da transação (atômico)
    expect(txMock.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'sub-001', bonusCreditedAt: null, status: 'ACTIVE' }),
        data:  expect.objectContaining({ bonusCreditedAt: expect.any(Date) }),
      })
    )
  })

  it('FIX-06: não credita em dobro sob corrida — claim count 0 aborta sem creditar', async () => {
    const sub = makeSubscription()
    mockSubscriptionFindMany.mockResolvedValue([sub])
    // Runner concorrente já creditou: claim condicional dentro da tx retorna count 0
    txMock.subscription.updateMany.mockResolvedValue({ count: 0 })

    const result = await processBonusCredits()

    // Transação abriu, mas o claim falhou → nenhum incremento de saldo nem extrato
    expect(txMock.user.update).not.toHaveBeenCalled()
    expect(txMock.transaction.create).not.toHaveBeenCalled()
    expect(mockNotificationCreate).not.toHaveBeenCalled()
    expect(result.processed).toBe(0)
    expect(result.errors).toBe(0)
    expect(result.details[0]?.action).toBe('ALREADY_CREDITED_SKIP')
  })

  it('cria notificação BONUS_CREDITED real no banco após crédito', async () => {
    const sub = makeSubscription()
    mockSubscriptionFindMany.mockResolvedValue([sub])

    await processBonusCredits()

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-001',
          type:   'BONUS_CREDITED',
        }),
      })
    )
  })

  it('cria entrada de extrato (Transaction BONUS) dentro da transação', async () => {
    const sub = makeSubscription()
    mockSubscriptionFindMany.mockResolvedValue([sub])

    await processBonusCredits()

    expect(txMock.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId:        'user-001',
          financialType: 'BONUS',
          totalAmount:   3000,
          assetId:       null,
          side:          null,
        }),
      })
    )
  })

  it('continua processando demais subscriptions mesmo após erro em uma', async () => {
    const sub1 = makeSubscription({ id: 'sub-001', userId: 'user-001' })
    const sub2 = makeSubscription({ id: 'sub-002', userId: 'user-002' })
    mockSubscriptionFindMany.mockResolvedValue([sub1, sub2])

    // Erro no primeiro crédito, segundo funciona
    mockPrismaTransaction
      .mockImplementationOnce(async () => { throw new Error('DB timeout') })
      .mockImplementationOnce(async (fn: (tx: typeof txMock) => Promise<void>) => { await fn(txMock) })

    const result = await processBonusCredits()

    expect(result.errors).toBe(1)
    expect(result.processed).toBe(1)
  })
})

// ─── Testes de calcUpgradeBonusAmount ─────────────────────────────────────────

describe('T-021 — calcUpgradeBonusAmount', () => {
  it('JOGADOR → CRAQUE = FS$3.000', () => {
    expect(calcUpgradeBonusAmount('JOGADOR', 'CRAQUE')).toBe(3000)
  })

  it('JOGADOR → LENDA = FS$23.000', () => {
    expect(calcUpgradeBonusAmount('JOGADOR', 'LENDA')).toBe(23000)
  })

  it('CRAQUE → LENDA = FS$20.000', () => {
    expect(calcUpgradeBonusAmount('CRAQUE', 'LENDA')).toBe(20000)
  })

  it('downgrade retorna 0 (proteção)', () => {
    expect(calcUpgradeBonusAmount('LENDA', 'CRAQUE')).toBe(0)
    expect(calcUpgradeBonusAmount('CRAQUE', 'JOGADOR')).toBe(0)
  })

  it('mesmo plano retorna 0', () => {
    expect(calcUpgradeBonusAmount('CRAQUE', 'CRAQUE')).toBe(0)
  })
})

// ─── Testes de múltiplos upgrades ─────────────────────────────────────────────

describe('T-021 — múltiplos upgrades antes do crédito', () => {
  it('JOGADOR→CRAQUE + CRAQUE→LENDA = total FS$23.000 (3000 + 20000)', () => {
    const bonus1 = calcUpgradeBonusAmount('JOGADOR', 'CRAQUE') // 3000
    const bonus2 = calcUpgradeBonusAmount('CRAQUE', 'LENDA')   // 20000
    expect(bonus1 + bonus2).toBe(23000)
  })
})
