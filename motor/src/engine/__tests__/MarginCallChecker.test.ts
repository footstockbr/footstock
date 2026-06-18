/**
 * @jest-environment node
 */
// ============================================================================
// MarginCallChecker — Testes Unitários
// Cobre: marginRatio >50% não faz nada, marginRatio <50% envia alerta
//        (notifications + margin:call), marginRatio <20% força liquidação
//        (notifications + margin:call), throttle impede alertas duplicados,
//        ticker sem preço é ignorado, código POS_050 nas notificações.
// INTAKE canônico: alerta=50%, liquidação=20% (perdas >80%)
// ============================================================================

import { MarginCallChecker } from '../MarginCallChecker'

// ─── Mocks de módulos ────────────────────────────────────────────────────────
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ─── Factories ───────────────────────────────────────────────────────────────
/**
 * Cria uma posição SHORT com avgPrice e marginBlocked configuráveis.
 * marginRatio = (marginBlocked - unrealizedLoss) / marginBlocked
 * unrealizedLoss = max(0, (currentPrice - avgPrice) * quantity)
 *
 * Para forçar marginRatio:
 *   ratio = 0.60 → safe (>50%)
 *   ratio = 0.35 → alerta (20-50%)
 *   ratio = 0.15 → liquidação (<20%)
 */
function makePosition(overrides: Partial<any> = {}): any {
  return {
    id: 'pos-001',
    userId: 'user-001',
    assetId: 'asset-001',
    side: 'SHORT',
    status: 'OPEN',
    quantity: 10,
    avgPrice: 100,         // preço médio de abertura do short
    marginBlocked: 1000,   // margem bloqueada
    interestAccrued: 0,
    asset: { ticker: 'CRAQUE10' },
    ...overrides,
  }
}

function makeUser(overrides: Partial<any> = {}): any {
  return {
    id: 'user-001',
    fsBalance: 5000,
    marginBlocked: 1000,
    ...overrides,
  }
}

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
function makePrisma(positions: any[] = [], user: any = makeUser()): any {
  const txMock = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
    position: {
      update: jest.fn().mockResolvedValue({}),
      // CAS claim (06-18): default count:1 = posicao reivindicada com sucesso.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      // recompute-in-tx: relê a posicao fresca dentro da transacao.
      findUniqueOrThrow: jest.fn().mockResolvedValue(positions[0]),
    },
    transaction: {
      create: jest.fn().mockResolvedValue({}),
    },
  }

  return {
    position: {
      findMany: jest.fn().mockResolvedValue(positions),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(txMock)),
    _tx: txMock,
  }
}

// ─── Mock Redis ───────────────────────────────────────────────────────────────
function makeRedis(throttleAlreadySet: boolean = false): any {
  return {
    publish: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(throttleAlreadySet ? '1' : null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  }
}

// ─── Helpers para calcular preços que induzem ratios específicos ─────────────
/**
 * Dado marginBlocked=M, avgPrice=A, quantity=Q:
 *   ratio = (M - loss) / M onde loss = max(0, (currentPrice - A) * Q)
 *   Para ratio=r: loss = M*(1-r) → currentPrice = A + M*(1-r)/Q
 */
function priceForRatio(ratio: number, avgPrice: number, marginBlocked: number, quantity: number): number {
  const targetLoss = marginBlocked * (1 - ratio)
  return avgPrice + targetLoss / quantity
}

// ─── Testes ──────────────────────────────────────────────────────────────────
describe('MarginCallChecker', () => {
  let prisma: ReturnType<typeof makePrisma>
  let redis: ReturnType<typeof makeRedis>
  let checker: MarginCallChecker

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('checkMarginCalls — sem posições', () => {
    test('retorna sem executar nada quando não há posições SHORT abertas', async () => {
      prisma = makePrisma([])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: 110 })

      expect(redis.publish).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('checkMarginCalls — ticker sem preço', () => {
    test('ignora posição quando ticker não está em currentPrices', async () => {
      const position = makePosition({ asset: { ticker: 'SEM_PRECO' } })
      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ OUTRO_TICKER: 100 })

      expect(redis.publish).not.toHaveBeenCalled()
    })

    test('ignora posição quando preço é zero', async () => {
      const position = makePosition({ asset: { ticker: 'ZERADO' } })
      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ ZERADO: 0 })

      expect(redis.publish).not.toHaveBeenCalled()
    })
  })

  describe('_evaluatePosition — marginRatio >50% (safe)', () => {
    test('não envia alerta nem liquida quando marginRatio está acima de 50%', async () => {
      // ratio=0.60 → safe zone, nenhuma ação
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.60, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      expect(redis.publish).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    test('não envia alerta com marginRatio exatamente em 50%', async () => {
      // ratio=0.50 → limite exato, ainda não dispara (< 0.50 para disparar)
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.50, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      expect(redis.publish).not.toHaveBeenCalled()
    })
  })

  describe('_evaluatePosition — marginRatio <50% (alerta)', () => {
    test('envia alerta quando marginRatio está entre 20% e 50%', async () => {
      // ratio=0.35 → zona de alerta (20% < ratio < 50%)
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.35, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      expect(redis.publish).toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    test('alerta publica no canal notifications:{userId}', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.35, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      const publishedChannels = redis.publish.mock.calls.map(([ch]: [string]) => ch)
      expect(publishedChannels).toContain(`notifications:${position.userId}`)
    })

    test('alerta publica no canal margin:call:{userId}', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.35, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      const publishedChannels = redis.publish.mock.calls.map(([ch]: [string]) => ch)
      expect(publishedChannels).toContain(`margin:call:${position.userId}`)
    })

    test('payload de alerta contém type MARGIN_CALL_WARNING', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.35, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      const notifCall = redis.publish.mock.calls.find(
        ([ch]: [string]) => ch.startsWith('notifications:')
      )
      expect(notifCall).toBeDefined()
      const parsed = JSON.parse(notifCall[1])
      expect(parsed.type).toBe('MARGIN_CALL_WARNING')
    })
  })

  describe('_evaluatePosition — marginRatio <20% (liquidação forçada)', () => {
    test('força liquidação quando marginRatio cai abaixo de 20% (perdas >80%)', async () => {
      // ratio=0.15 → abaixo do threshold de liquidação (20%)
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.15, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    test('liquidação publica no canal notifications:{userId}', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.15, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      const publishedChannels = redis.publish.mock.calls.map(([ch]: [string]) => ch)
      expect(publishedChannels).toContain(`notifications:${position.userId}`)
    })

    test('liquidação publica no canal margin:call:{userId}', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.15, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      const publishedChannels = redis.publish.mock.calls.map(([ch]: [string]) => ch)
      expect(publishedChannels).toContain(`margin:call:${position.userId}`)
    })

    test('payload de liquidação contém type FORCED_LIQUIDATION', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.15, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      const notifCall = redis.publish.mock.calls.find(
        ([ch]: [string]) => ch.startsWith('notifications:')
      )
      expect(notifCall).toBeDefined()
      const parsed = JSON.parse(notifCall[1])
      expect(parsed.type).toBe('FORCED_LIQUIDATION')
    })

    test('payload de liquidação contém código POS_050', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.15, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      // POS_050 deve aparecer em pelo menos um dos canais publicados
      const allPayloads = redis.publish.mock.calls.map(([, payload]: [string, string]) =>
        JSON.parse(payload)
      )
      const hasPOS050 = allPayloads.some((p: any) => p.code === 'POS_050')
      expect(hasPOS050).toBe(true)
    })

    test('código POS_050 está presente tanto em notifications quanto em margin:call', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.15, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      const callsWithCode = redis.publish.mock.calls.filter(([, payload]: [string, string]) => {
        const parsed = JSON.parse(payload)
        return parsed.code === 'POS_050'
      })

      expect(callsWithCode.length).toBeGreaterThanOrEqual(2)
    })

    test('posição é fechada (status CLOSED, quantity 0) após liquidação', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.15, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      // CAS (06-18): a posicao e reivindicada via updateMany com guarda status:'OPEN'
      // (claim atomico, sem zerar quantity ainda — relemos os valores frescos).
      expect(prisma._tx.position.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: position.id, status: 'OPEN' }),
          data: expect.objectContaining({ status: 'CLOSED' }),
        })
      )
      // quantity e zerada ao final, apos a releitura/recompute.
      expect(prisma._tx.position.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: position.id },
          data: expect.objectContaining({ quantity: 0 }),
        })
      )
    })

    test('CAS no-op: posicao ja fechada por fluxo concorrente (count!=1) NAO credita nem publica', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.15, 100, 1000, 10)

      prisma = makePrisma([position])
      // Simula corrida: o claim CAS encontra 0 linhas OPEN (outro fluxo ja fechou).
      prisma._tx.position.updateMany.mockResolvedValue({ count: 0 })
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      // Sem efeito financeiro: nenhum credito ao usuario, nenhuma transaction, nenhum publish.
      expect(prisma._tx.user.update).not.toHaveBeenCalled()
      expect(prisma._tx.transaction.create).not.toHaveBeenCalled()
      expect((redis.publish as jest.Mock).mock.calls.length).toBe(0)
    })
  })

  describe('_sendMarginAlert — throttle anti-duplicação', () => {
    test('não envia alerta quando throttle key já existe no Redis', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.35, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis(true) // throttle já ativo
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      expect(redis.publish).not.toHaveBeenCalled()
    })

    test('throttle key verificada com GET antes de publicar alerta', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.35, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis(false) // throttle não ativo
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      const throttleKey = `motor:margin_alert:${position.id}`
      expect(redis.get).toHaveBeenCalledWith(throttleKey)
    })

    test('throttle key definida com SETEX após primeiro alerta', async () => {
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.35, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis(false)
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      const throttleKey = `motor:margin_alert:${position.id}`
      expect(redis.setex).toHaveBeenCalledWith(throttleKey, 3600, '1')
    })

    test('liquidação forçada NÃO é bloqueada pelo throttle', async () => {
      // Throttle ativo mas marginRatio < 20% → liquidação deve ocorrer
      const position = makePosition({ avgPrice: 100, marginBlocked: 1000, quantity: 10 })
      const currentPrice = priceForRatio(0.15, 100, 1000, 10)

      prisma = makePrisma([position])
      redis = makeRedis(true) // throttle ativo
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: currentPrice })

      // Liquidação não passa pelo throttle — executa transação
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('_evaluatePosition — marginBlocked zero', () => {
    test('ignora posição quando marginBlocked é zero (evita divisão por zero)', async () => {
      const position = makePosition({ marginBlocked: 0 })

      prisma = makePrisma([position])
      redis = makeRedis()
      checker = new MarginCallChecker(prisma, redis)

      await checker.checkMarginCalls({ CRAQUE10: 150 })

      expect(redis.publish).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })
})
