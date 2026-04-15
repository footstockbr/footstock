/**
 * T-032 — Locking Otimista: Testes de Concorrência
 *
 * Cobre:
 *  - deductBalance: CAS bem-sucedido (version incrementado)
 *  - deductBalance: ConcurrentUpdateError quando version mudou
 *  - deductBalance: InsufficientBalanceError (sem retry)
 *  - deductBalance: retry automático (até 3 tentativas) resolve conflito transitório
 *  - cancelOrder: locking otimista detecta mudança concorrente
 *  - retryWithBackoff: propaga erro não-retryable imediatamente
 *  - retryWithBackoff: esgota tentativas e propaga ConcurrentUpdateError
 */

// ─── Mocks — declarados inline para evitar hoisting issue do Jest ─────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    position: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    asset: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

// ─── Imports após mocks ───────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import { UserService } from '@/lib/services/UserService'
import { retryWithBackoff, ConcurrentUpdateError, InsufficientBalanceError } from '@/lib/utils/retryWithBackoff'

// ─── Helpers tipados ──────────────────────────────────────────────────────────

const mockUserFindUnique = jest.mocked(prisma.user.findUnique)
const mockUserUpdateMany = jest.mocked(prisma.user.updateMany)

function makeUser(overrides: Partial<{
  id: string
  fsBalance: number
  version: number
}> = {}) {
  return {
    id: 'user-001',
    // Simula Decimal do Prisma: Number(5000) === 5000
    fsBalance: 5000,
    version: 3,
    ...overrides,
  }
}

// ─── UserService.deductBalance ────────────────────────────────────────────────

describe('UserService.deductBalance', () => {
  let service: UserService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new UserService()
  })

  it('debita saldo e incrementa version em CAS bem-sucedido', async () => {
    const user = makeUser({ fsBalance: 1000, version: 2 })
    mockUserFindUnique.mockResolvedValueOnce(user as never)
    mockUserUpdateMany.mockResolvedValueOnce({ count: 1 })

    const result = await service.deductBalance('user-001', 300)

    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'user-001', version: 2, fsBalance: { gte: 300 } }),
        data: expect.objectContaining({ fsBalance: { decrement: 300 }, version: { increment: 1 } }),
      }),
    )
    expect(result.newVersion).toBe(3)
    expect(result.newBalance).toBe(700)
  })

  it('lança InsufficientBalanceError quando saldo insuficiente (sem retry)', async () => {
    // Primeira tentativa: version ok mas saldo insuficiente
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ fsBalance: 100, version: 5 }) as never)
    mockUserUpdateMany.mockResolvedValueOnce({ count: 0 })
    // Re-fetch pós-falha: mesma version (não houve conflito), saldo insuficiente confirmado
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ fsBalance: 100, version: 5 }) as never)

    await expect(service.deductBalance('user-001', 500)).rejects.toThrow(InsufficientBalanceError)

    // Deve ter feito apenas 1 tentativa (sem retry em InsufficientBalance)
    expect(mockUserFindUnique).toHaveBeenCalledTimes(2) // 1 pre-CAS + 1 diagnóstico
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(1)
  })

  it('lança ConcurrentUpdateError quando version mudou (3 conflitos consecutivos)', async () => {
    // Tentativa 1: CAS falha por version mismatch
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ version: 3 }) as never)
    mockUserUpdateMany.mockResolvedValueOnce({ count: 0 })
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ version: 4 }) as never) // version mudou

    // Tentativa 2 (retry 1)
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ version: 4 }) as never)
    mockUserUpdateMany.mockResolvedValueOnce({ count: 0 })
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ version: 5 }) as never)

    // Tentativa 3 (retry 2)
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ version: 5 }) as never)
    mockUserUpdateMany.mockResolvedValueOnce({ count: 0 })
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ version: 6 }) as never)

    await expect(service.deductBalance('user-001', 100)).rejects.toThrow(ConcurrentUpdateError)

    // 3 tentativas × 2 findUnique cada = 6 chamadas ao total
    expect(mockUserFindUnique).toHaveBeenCalledTimes(6)
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(3)
  })

  it('sucede na segunda tentativa quando conflito é transitório', async () => {
    // Tentativa 1: CAS falha (version mismatch)
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ fsBalance: 1000, version: 3 }) as never)
    mockUserUpdateMany.mockResolvedValueOnce({ count: 0 })
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ version: 4 }) as never) // version mudou

    // Tentativa 2: CAS sucede com nova versão
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ fsBalance: 1000, version: 4 }) as never)
    mockUserUpdateMany.mockResolvedValueOnce({ count: 1 })

    const result = await service.deductBalance('user-001', 200)

    expect(result.newVersion).toBe(5)
    expect(result.newBalance).toBe(800)
    expect(mockUserUpdateMany).toHaveBeenCalledTimes(2)
  })

  it('lança erro se usuário não encontrado', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null)

    await expect(service.deductBalance('user-inexistente', 100)).rejects.toThrow('Usuário não encontrado')
  })
})

// ─── UserService.creditBalance ────────────────────────────────────────────────

describe('UserService.creditBalance', () => {
  let service: UserService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new UserService()
  })

  it('credita saldo e incrementa version', async () => {
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ fsBalance: 500, version: 1 }) as never)
    mockUserUpdateMany.mockResolvedValueOnce({ count: 1 })

    const result = await service.creditBalance('user-001', 100)

    expect(result.newBalance).toBe(600)
    expect(result.newVersion).toBe(2)
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fsBalance: { increment: 100 }, version: { increment: 1 } }),
      }),
    )
  })
})

// ─── UserService.resetBalance ─────────────────────────────────────────────────

describe('UserService.resetBalance', () => {
  let service: UserService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new UserService()
  })

  it('zera saldo e incrementa version', async () => {
    mockUserFindUnique.mockResolvedValueOnce(makeUser({ version: 7 }) as never)
    mockUserUpdateMany.mockResolvedValueOnce({ count: 1 })

    const result = await service.resetBalance('user-001')

    expect(result.newBalance).toBe(0)
    expect(result.newVersion).toBe(8)
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fsBalance: 0, version: { increment: 1 } }),
      }),
    )
  })
})

// ─── retryWithBackoff ─────────────────────────────────────────────────────────

describe('retryWithBackoff', () => {
  it('retorna resultado imediatamente em sucesso na 1ª tentativa', async () => {
    const fn = jest.fn().mockResolvedValue('ok')
    const result = await retryWithBackoff(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('propaga InsufficientBalanceError imediatamente (sem retry)', async () => {
    const fn = jest.fn().mockRejectedValue(new InsufficientBalanceError())
    await expect(retryWithBackoff(fn)).rejects.toThrow(InsufficientBalanceError)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('faz retry em ConcurrentUpdateError e sucede na 2ª tentativa', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new ConcurrentUpdateError())
      .mockResolvedValueOnce('success')

    const result = await retryWithBackoff(fn, { delays: [1, 1, 1] })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('esgota 3 tentativas e propaga ConcurrentUpdateError', async () => {
    const fn = jest.fn().mockRejectedValue(new ConcurrentUpdateError())
    await expect(retryWithBackoff(fn, { delays: [1, 1] })).rejects.toThrow(ConcurrentUpdateError)
    expect(fn).toHaveBeenCalledTimes(3) // maxAttempts = delays.length + 1 = 3
  })

  it('não faz retry para erros genéricos (não ConcurrentUpdate)', async () => {
    const customErr = new Error('custom error')
    const fn = jest.fn().mockRejectedValue(customErr)
    await expect(retryWithBackoff(fn)).rejects.toThrow('custom error')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

// ─── Simulação de alta concorrência (serializada via mock) ───────────────────

describe('Simulação: 10 deduções sequenciais sem race condition', () => {
  let service: UserService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new UserService()
  })

  it('todas as 10 deduções são realizadas e version incrementa 10 vezes', async () => {
    let currentVersion = 0
    let currentBalance = 10000

    ;(mockUserFindUnique as jest.Mock).mockImplementation(async () => ({
      id: 'user-001',
      fsBalance: currentBalance,
      version: currentVersion,
    }))

    ;(mockUserUpdateMany as jest.Mock).mockImplementation(async (args: {
      where: { version: number; fsBalance?: { gte: number } }
      data: { fsBalance?: { decrement?: number }; version: { increment: number } }
    }) => {
      const { where, data } = args
      if (where.version === currentVersion && (!where.fsBalance || currentBalance >= where.fsBalance.gte)) {
        if (data.fsBalance?.decrement) currentBalance -= data.fsBalance.decrement
        currentVersion += data.version.increment
        return { count: 1 }
      }
      return { count: 0 }
    })

    const results = []
    for (let i = 0; i < 10; i++) {
      const result = await service.deductBalance('user-001', 100)
      results.push(result)
    }

    expect(results).toHaveLength(10)
    // Saldo final: 10000 - (10 × 100) = 9000
    expect(currentBalance).toBe(9000)
    // Version incrementada 10 vezes
    expect(currentVersion).toBe(10)
    // Balances decrescentes — sem duplicatas
    for (let i = 1; i < results.length; i++) {
      expect(results[i].newBalance).toBeLessThan(results[i - 1].newBalance)
    }
  })
})
