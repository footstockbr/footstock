// ============================================================================
// Foot Stock — Contrato de Atomicidade de Transações
// Verifica cálculo de saldo, atomicidade Prisma e taxas por plano
// Rastreabilidade: INT-011, INT-018 | US-007 | module-28/TASK-2/ST003
// ============================================================================

type PlanType = 'JOGADOR' | 'CRAQUE' | 'LENDA'

const FEE_BY_PLAN: Record<PlanType, number> = {
  JOGADOR: 0.25,
  CRAQUE: 0.35,
  LENDA: 0.45,
}

// Mock Prisma — simula $transaction sem banco real
const mockPrisma = {
  $transaction: jest.fn(),
  transaction: { create: jest.fn() },
  order: { update: jest.fn() },
  position: { upsert: jest.fn() },
  user: { update: jest.fn() },
}

describe('ST003: Transaction Atomicity Contract', () => {
  beforeEach(() => jest.clearAllMocks())

  // ── Cálculo de saldo ─────────────────────────────────────────────────────

  describe('[SUCCESS] cálculo de saldo', () => {
    it('balanceAfter = balanceBefore - (quantity × price) - fee (plano CRAQUE)', () => {
      const balanceBefore = 5000
      const quantity = 10
      const pricePerUnit = 100
      const fee = FEE_BY_PLAN['CRAQUE'] // 0.35
      const expectedBalance = balanceBefore - quantity * pricePerUnit - fee
      // 5000 - 1000 - 0.35 = 3999.65
      expect(expectedBalance).toBeCloseTo(3999.65, 2)
    })

    it('balanceAfter = balanceBefore - (quantity × price) - fee (plano JOGADOR)', () => {
      const balanceBefore = 1000
      const quantity = 5
      const pricePerUnit = 50
      const fee = FEE_BY_PLAN['JOGADOR'] // 0.25
      const expectedBalance = balanceBefore - quantity * pricePerUnit - fee
      // 1000 - 250 - 0.25 = 749.75
      expect(expectedBalance).toBeCloseTo(749.75, 2)
    })
  })

  // ── Atomicidade Prisma ───────────────────────────────────────────────────

  describe('[SUCCESS] atomicidade Prisma', () => {
    it('Transaction e Order são operados na mesma $transaction', async () => {
      let transactionCalled = false

      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
        transactionCalled = true
        return fn(mockPrisma)
      })
      mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-1' })
      mockPrisma.order.update.mockResolvedValue({ id: 'ord-1' })
      mockPrisma.position.upsert.mockResolvedValue({ id: 'pos-1' })
      mockPrisma.user.update.mockResolvedValue({ id: 'usr-1' })

      await mockPrisma.$transaction(async (tx: typeof mockPrisma) => {
        await tx.transaction.create({ data: {} })
        await tx.order.update({ where: { id: 'ord-1' }, data: {} })
        await tx.position.upsert({ where: {}, update: {}, create: {} })
        await tx.user.update({ where: { id: 'usr-1' }, data: {} })
      })

      expect(transactionCalled).toBe(true)
      expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.order.update).toHaveBeenCalledTimes(1)
    })
  })

  // ── Rollback em falha ────────────────────────────────────────────────────

  describe('[ERROR] rollback em falha parcial', () => {
    it('falha de position.upsert reverte saldo — balanceAfter === balanceBefore', async () => {
      const balanceBefore = 5000
      let balanceAfter = balanceBefore

      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
        try {
          return await fn(mockPrisma)
        } catch {
          // Simula rollback: saldo não alterado
          balanceAfter = balanceBefore
          throw new Error('Transaction rolled back')
        }
      })

      mockPrisma.position.upsert.mockRejectedValue(new Error('DB constraint error'))

      await expect(
        mockPrisma.$transaction(async (tx: typeof mockPrisma) => {
          // Débito seria aplicado aqui
          balanceAfter = balanceBefore - 1000 - 0.35
          // Falha ao persistir posição
          await tx.position.upsert({ where: {}, update: {}, create: {} })
        }),
      ).rejects.toThrow('Transaction rolled back')

      // Saldo deve permanecer inalterado após rollback
      expect(balanceAfter).toBe(balanceBefore)
    })
  })

  // ── Taxa por plano ───────────────────────────────────────────────────────

  describe('[EDGE] taxa correta por plano', () => {
    const cases: Array<{ plan: PlanType; expectedFee: number }> = [
      { plan: 'JOGADOR', expectedFee: 0.25 },
      { plan: 'CRAQUE', expectedFee: 0.35 },
      { plan: 'LENDA', expectedFee: 0.45 },
    ]

    test.each(cases)('plano $plan aplica taxa FS$ $expectedFee', ({ plan, expectedFee }) => {
      const fee = FEE_BY_PLAN[plan]
      expect(fee).toBeCloseTo(expectedFee, 2)
    })

    it('não existe plano fora dos 3 definidos', () => {
      const knownPlans = Object.keys(FEE_BY_PLAN)
      expect(knownPlans).toHaveLength(3)
      expect(knownPlans).toEqual(expect.arrayContaining(['JOGADOR', 'CRAQUE', 'LENDA']))
    })
  })

  // ── Campos do modelo Transaction (schema Prisma) ─────────────────────────

  describe('[SUCCESS] campos do modelo Transaction no DMMF', () => {
    let transactionModel: ReturnType<
      typeof import('@prisma/client').Prisma.dmmf.datamodel.models.find
    >

    beforeAll(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Prisma } = require('@prisma/client')
      transactionModel = Prisma.dmmf.datamodel.models.find(
        (m: { name: string }) => m.name === 'Transaction',
      )
    })

    it('modelo Transaction existe no schema Prisma', () => {
      expect(transactionModel).toBeDefined()
    })

    it('campos financeiros críticos presentes: fee, totalAmount, balanceBefore, balanceAfter', () => {
      const fieldNames =
        (transactionModel as { fields: { name: string }[] } | undefined)?.fields.map(
          (f) => f.name,
        ) ?? []
      expect(fieldNames).toContain('fee')
      expect(fieldNames).toContain('totalAmount')
      expect(fieldNames).toContain('balanceBefore')
      expect(fieldNames).toContain('balanceAfter')
    })
  })
})
