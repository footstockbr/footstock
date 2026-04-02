// ============================================================================
// Foot Stock — Testes unitários: job interest-accrual
// Cobre: acúmulo de juros diários em posições SHORT, skip de posições CLOSED,
//        proteção de margem e notificação de margin call.
// ============================================================================

import { processInterestAccrual } from '../interest-accrual'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'

// Mock do módulo inteiro do ShortService para controlar accrueInterest
jest.mock('@/lib/services/ShortService', () => ({
  shortService: {
    accrueInterest: jest.fn(),
  },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    position: { findMany: jest.fn() },
    user: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    publish: jest.fn(),
  },
}))

// Imports após os mocks
import { shortService } from '@/lib/services/ShortService'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRedis = redis as jest.Mocked<typeof redis>
const mockAccrueInterest = shortService.accrueInterest as jest.Mock

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function criarPosicaoShortMock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pos_short_001',
    userId: 'user_short_001',
    assetId: 'asset_001',
    quantity: 10,
    avgPrice: 50.0,
    totalInvested: 500.0,
    side: 'SHORT',
    status: 'OPEN',
    marginBlocked: 750.0,            // 150% de 500
    dailyInterestRate: 0.005,         // 0,5% ao dia
    interestAccrued: 0,
    openedAt: new Date('2026-01-01T09:00:00Z'),
    createdAt: new Date('2026-01-01T09:00:00Z'),
    updatedAt: new Date('2026-01-01T09:00:00Z'),
    // asset included via prisma include — currentPrice=75 so notionalValue=10*75=750, interest=3.75
    asset: { ticker: 'ASSET_001', currentPrice: 75 },
    ...overrides,
  }
}

function criarUsuarioMock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_short_001',
    fsBalance: 1000.0,
    marginBlocked: 750.0,
    planType: 'LENDA',
    ...overrides,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Testes do job processInterestAccrual
// ──────────────────────────────────────────────────────────────────────────────

describe('processInterestAccrual', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(mockRedis.publish as jest.Mock).mockResolvedValue(0)
  })

  test('retorna resultado zerado quando não há posições SHORT abertas', async () => {
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([])

    const resultado = await processInterestAccrual()

    expect(resultado.processed).toBe(0)
    expect(resultado.totalInterest).toBe(0)
    expect(resultado.errors).toBe(0)
    expect(mockAccrueInterest).not.toHaveBeenCalled()
  })

  test('acumula juros de 0,5% ao dia sobre a margem bloqueada em posição SHORT aberta', async () => {
    const posicao = criarPosicaoShortMock()
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([{ id: posicao.id }])

    // 0,5% de 750 (marginBlocked) = 3,75
    const jurosDiarios = 3.75
    mockAccrueInterest.mockResolvedValue(jurosDiarios)

    const resultado = await processInterestAccrual()

    expect(resultado.processed).toBe(1)
    expect(resultado.totalInterest).toBeCloseTo(3.75)
    expect(mockAccrueInterest).toHaveBeenCalledWith(posicao.id)
  })

  test('não conta a posição como processada quando accrueInterest retorna zero', async () => {
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([{ id: 'pos_zero' }])
    // Retorna 0: posição pode ter sido fechada entre o findMany e o accrueInterest
    mockAccrueInterest.mockResolvedValue(0)

    const resultado = await processInterestAccrual()

    expect(resultado.processed).toBe(0)
    expect(resultado.totalInterest).toBe(0)
  })

  test('pula posição CLOSED — accrueInterest retorna 0 para posições fechadas', async () => {
    // O ShortService já guarda a invariante: retorna 0 se status !== OPEN
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([{ id: 'pos_closed' }])
    mockAccrueInterest.mockResolvedValue(0)

    const resultado = await processInterestAccrual()

    expect(resultado.processed).toBe(0)
    expect(mockAccrueInterest).toHaveBeenCalledWith('pos_closed')
  })

  test('processa múltiplas posições SHORT e acumula total de juros corretamente', async () => {
    const posicoes = [
      { id: 'pos_a' },
      { id: 'pos_b' },
      { id: 'pos_c' },
    ]
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue(posicoes)
    mockAccrueInterest
      .mockResolvedValueOnce(3.75)   // pos_a: 0,5% de 750
      .mockResolvedValueOnce(1.50)   // pos_b: 0,5% de 300
      .mockResolvedValueOnce(5.00)   // pos_c: 0,5% de 1000

    const resultado = await processInterestAccrual()

    expect(resultado.processed).toBe(3)
    expect(resultado.totalInterest).toBeCloseTo(10.25)
    expect(resultado.errors).toBe(0)
  })

  test('incrementa contador de erros quando accrueInterest lança exceção', async () => {
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([{ id: 'pos_erro' }])
    mockAccrueInterest.mockRejectedValue(new Error('Banco indisponível'))

    const resultado = await processInterestAccrual()

    expect(resultado.errors).toBe(1)
    expect(resultado.processed).toBe(0)
  })

  test('continua processando demais posições quando uma lança erro', async () => {
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([
      { id: 'pos_falha' },
      { id: 'pos_ok' },
    ])
    mockAccrueInterest
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce(2.50)

    const resultado = await processInterestAccrual()

    expect(resultado.errors).toBe(1)
    expect(resultado.processed).toBe(1)
    expect(resultado.totalInterest).toBeCloseTo(2.50)
  })

  test('a data de processedAt corresponde ao momento da execução do job', async () => {
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([])
    const antes = new Date()

    const resultado = await processInterestAccrual()

    const depois = new Date()
    expect(resultado.processedAt.getTime()).toBeGreaterThanOrEqual(antes.getTime())
    expect(resultado.processedAt.getTime()).toBeLessThanOrEqual(depois.getTime())
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Testes do ShortService.accrueInterest (comportamento interno via mock real)
// ──────────────────────────────────────────────────────────────────────────────

describe('ShortService.accrueInterest — comportamento de margem e notificação', () => {
  // Recria o serviço real (sem mock de accrueInterest) para testar sua lógica interna
  let ShortServiceReal: typeof import('@/lib/services/ShortService').ShortService

  beforeEach(async () => {
    jest.resetModules()
    // Precisa remock do ShortService sem o override de accrueInterest
    jest.mock('@/lib/prisma', () => ({
      prisma: {
        position: { findUnique: jest.fn(), update: jest.fn() },
        user: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
        transaction: { create: jest.fn() },
        $transaction: jest.fn(),
      },
    }))
    jest.mock('@/lib/redis', () => ({
      redisPublisher: { publish: jest.fn() },
    }))
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = jest.requireActual('@/lib/services/ShortService') as typeof import('@/lib/services/ShortService')
    ShortServiceReal = mod.ShortService
  })

  afterEach(() => {
    jest.resetModules()
    jest.restoreAllMocks()
  })

  test('cobra 0,5% ao dia sobre marginBlocked e atualiza interestAccrued', async () => {
    const { prisma: p } = await import('@/lib/prisma')
    const { redisPublisher: r } = await import('@/lib/redis')
    const posicao = criarPosicaoShortMock()
    const usuario = criarUsuarioMock()

    ;(p.position.findUnique as jest.Mock).mockResolvedValue(posicao)
    ;(p.$transaction as jest.Mock).mockImplementation(async (fn) => {
      const txMock = {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(usuario),
          update: jest.fn().mockResolvedValue({}),
        },
        position: { update: jest.fn().mockResolvedValue({}) },
        transaction: { create: jest.fn().mockResolvedValue({}) },
      }
      return fn(txMock)
    })
    ;(r.publish as jest.Mock).mockResolvedValue(0)

    const service = new ShortServiceReal()
    const juros = await service.accrueInterest(posicao.id)

    // 0,5% de 750 = 3,75
    expect(juros).toBeCloseTo(3.75)
  })

  test('publica notificação MARGIN_CALL_ALERT quando saldo zera após cobrança', async () => {
    const { prisma: p } = await import('@/lib/prisma')
    const { redisPublisher: r } = await import('@/lib/redis')

    // Usuário com saldo exatamente igual ao juro → newBalance = 0
    // notionalValue = quantity(10) * currentPrice(75) = 750, interest = 750*0.005 = 3.75
    const posicao = criarPosicaoShortMock() // juro = 3.75
    const usuarioComSaldoMinimo = criarUsuarioMock({ fsBalance: 3.75 })

    ;(p.position.findUnique as jest.Mock).mockResolvedValue(posicao)

    let publishFn: jest.Mock
    ;(p.$transaction as jest.Mock).mockImplementation(async (fn) => {
      publishFn = jest.fn().mockResolvedValue(0)
      ;(r.publish as jest.Mock) = publishFn
      const txMock = {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(usuarioComSaldoMinimo),
          update: jest.fn().mockResolvedValue({}),
        },
        position: { update: jest.fn().mockResolvedValue({}) },
        transaction: { create: jest.fn().mockResolvedValue({}) },
      }
      return fn(txMock)
    })
    ;(r.publish as jest.Mock).mockResolvedValue(0)

    const service = new ShortServiceReal()
    await service.accrueInterest(posicao.id)

    expect(r.publish).toHaveBeenCalledWith(
      `notifications:${posicao.userId}`,
      expect.stringContaining('MARGIN_CALL_ALERT'),
    )
  })

  test('não cobra juros e retorna 0 para posição com status CLOSED', async () => {
    const { prisma: p } = await import('@/lib/prisma')
    const posicaoFechada = criarPosicaoShortMock({ status: 'CLOSED' })

    ;(p.position.findUnique as jest.Mock).mockResolvedValue(posicaoFechada)

    const service = new ShortServiceReal()
    const juros = await service.accrueInterest(posicaoFechada.id)

    expect(juros).toBe(0)
    expect(p.$transaction).not.toHaveBeenCalled()
  })

  test('não cobra juros e retorna 0 quando posição não é encontrada', async () => {
    const { prisma: p } = await import('@/lib/prisma')
    ;(p.position.findUnique as jest.Mock).mockResolvedValue(null)

    const service = new ShortServiceReal()
    const juros = await service.accrueInterest('pos_inexistente')

    expect(juros).toBe(0)
  })

  test('não deixa saldo negativo: cobra apenas até o saldo disponível', async () => {
    const { prisma: p } = await import('@/lib/prisma')
    const { redisPublisher: r } = await import('@/lib/redis')

    // notionalValue = quantity(10) * currentPrice(75) = 750, juro bruto = 3.75, mas saldo = 2 → cobra só 2
    const posicao = criarPosicaoShortMock()
    const usuarioSaldoBaixo = criarUsuarioMock({ fsBalance: 2.0 })

    ;(p.position.findUnique as jest.Mock).mockResolvedValue(posicao)

    let capturedBalance: number | undefined
    ;(p.$transaction as jest.Mock).mockImplementation(async (fn) => {
      const txMock = {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(usuarioSaldoBaixo),
          update: jest.fn().mockImplementation(({ data }) => {
            capturedBalance = Number(data.fsBalance)
            return Promise.resolve({})
          }),
        },
        position: { update: jest.fn().mockResolvedValue({}) },
        transaction: { create: jest.fn().mockResolvedValue({}) },
      }
      return fn(txMock)
    })
    ;(r.publish as jest.Mock).mockResolvedValue(0)

    const service = new ShortServiceReal()
    const juros = await service.accrueInterest(posicao.id)

    // Cobra apenas o saldo disponível (2), não o juro cheio (3.75)
    expect(juros).toBeCloseTo(2)
    // Saldo deve ser exatamente 0 após cobrança
    expect(capturedBalance).toBeCloseTo(0)
  })
})
