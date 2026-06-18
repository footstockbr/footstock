import { PriceCalculator } from '../PriceCalculator'
import { NUDGE_TICKS } from '../nudge-constants'
import type { AssetState, ClusterParams } from '../../types/motor.types'

const baseState = (): AssetState => ({
  id: 'asset_001',
  ticker: 'FLM3',
  cluster: 'A_TOP',
  state: 'SP',
  currentPrice: 28.00,
  openPrice: 28.00,
  highPrice: 28.00,
  lowPrice: 28.00,
  closePrice: 28.00,
  fairValue: 28.00,
  volume: 50000,
  variance: 0.0001,
  pendingBuyVolume: 0,
  pendingSellVolume: 0,
  isPaused: false,
  haltReason: null,
  haltResumeAt: null,
  newsImpact: 0,
  newsImpactTicks: 0,
  ofiState: 0,
  dailyVolAccum: 0,
  dailySigmaMultiplier: 1.0,
  volatilityMultiplier: 1.0,
})

const baseParams = (): ClusterParams => ({
  cluster: 'A_TOP',
  baseVolume: 50000,
  drift: 0.0,
  theta: 0.12,
  sigma: 0.0018,
  garchAlpha: 0.12,
  garchBeta: 0.85,
  lambdaKyle: 0.0001,
  spread: 0.0005,
  maxTickChange: 0.0035,
  ofiDecay: 0.91,
  alphaOfi: 0.0005,
})

describe('PriceCalculator (integração)', () => {
  let calculator: PriceCalculator

  beforeEach(() => {
    calculator = new PriceCalculator()
  })

  test('retorna preço atual se ativo está pausado (isPaused=true)', () => {
    const state = baseState()
    state.isPaused = true
    const result = calculator.calculate(state, baseParams(), 0)
    expect(result.halted).toBe(true)
    expect(result.newPrice).toBe(28.00)
    expect(result.layerResults).toHaveLength(0)
  })

  test('circuit breaker (L10) interrompe pipeline se variação >= 8%', () => {
    const state = baseState()
    state.currentPrice = 30.80  // ~10% acima do closePrice 28.00 — margem suficiente pós-L2 (-0.3%)
    const result = calculator.calculate(state, baseParams(), 0)
    expect(result.halted).toBe(true)
    expect(state.isPaused).toBe(true)
    // L10 é o último layer no pipeline (trigger após L1-L9)
    const cbResult = result.layerResults.find(r => r.layer === 'L10_CircuitBreaker')
    expect(cbResult).toBeDefined()
  })

  test('com noise=0 e sem ordens pendentes: delta próximo de zero', () => {
    const state = baseState()
    const result = calculator.calculate(state, baseParams(), 0)
    expect(result.halted).toBe(false)
    expect(result.newPrice).toBeCloseTo(28.00, 4)
  })

  test('velocity cap limita delta acima de maxTickChange (2% para A_TOP)', () => {
    const state = baseState()
    state.newsImpact = 0.5
    state.newsImpactTicks = 10
    // Força ruído alto para exceder cap
    const result = calculator.calculate(state, baseParams(), 10.0)
    const changePercent = Math.abs(result.newPrice - 28.00) / 28.00
    expect(changePercent).toBeLessThanOrEqual(0.021)  // max 2% com margem
  })

  test('preço nunca vai abaixo de 0.01', () => {
    const state = baseState()
    state.currentPrice = 0.02
    state.closePrice = 0.02
    const result = calculator.calculate(state, baseParams(), -100.0)
    expect(result.newPrice).toBeGreaterThanOrEqual(0.01)
  })

  // T4.5: piso de preco NUMERICO (PRICE_EPSILON=0.01) separado da ancora economica R$1.
  describe('T4.5 — piso de preco não distorce retorno de ativos sub-R$1', () => {
    test('ativo sub-R$1 não é catapultado à âncora R$1 (sem retorno artificial pelo piso)', () => {
      const state = baseState()
      state.currentPrice = 0.50
      state.openPrice = 0.50
      state.closePrice = 0.50
      state.fairValue = 0.50
      // Mesmo com ruído extremo, o delta é capado por L8 (0.35%/tick); o preço deve
      // permanecer na vizinhança de R$0,50 — JAMAIS saltar para o antigo floor de R$1.
      const result = calculator.calculate(state, baseParams(), 5.0)
      expect(result.newPrice).toBeLessThan(1.0)
      const ret = Math.abs(result.newPrice - 0.50) / 0.50
      expect(ret).toBeLessThanOrEqual(0.0035 + 1e-9) // dentro do velocity cap de L8
    })

    test('queda extrema mantém preço estritamente positivo (sem divisão por zero / underflow)', () => {
      const state = baseState()
      state.currentPrice = 0.02
      state.openPrice = 0.02
      state.closePrice = 0.02
      state.fairValue = 0.02
      // Sequência longa de choques negativos não pode levar o preço a 0 nem a negativo,
      // e o retorno realizado (delta/preço) deve permanecer finito a cada tick.
      let price = state.currentPrice
      for (let i = 0; i < 200; i++) {
        const result = calculator.calculate(state, baseParams(), -50.0)
        expect(result.newPrice).toBeGreaterThanOrEqual(0.01)
        expect(Number.isFinite(result.newPrice)).toBe(true)
        const realizedReturn = (result.newPrice - price) / state.currentPrice
        expect(Number.isFinite(realizedReturn)).toBe(true)
        price = result.newPrice
        state.currentPrice = result.newPrice
      }
      expect(state.currentPrice).toBeGreaterThanOrEqual(0.01)
    })

    test('nudge em ativo sub-R$1 inativo não empurra ao floor de R$1', () => {
      const state = baseState()
      state.currentPrice = 0.40
      state.openPrice = 0.40
      state.closePrice = 0.40
      state.fairValue = 0.40
      state.pendingBuyVolume = 0
      state.pendingSellVolume = 0
      state.ticksSinceLastChange = NUDGE_TICKS // próximo tick inativo dispara o nudge
      const result = calculator.calculate(state, baseParams(), 0)
      const nudge = result.layerResults.find(r => r.layer === 'L7_5_Nudge')
      // Se o nudge disparar, o alvo respeita o piso numérico (0.01), nunca a âncora R$1.
      if (nudge) {
        expect(result.newPrice).toBeLessThan(1.0)
      }
      expect(result.newPrice).toBeGreaterThanOrEqual(0.01)
    })
  })

  test('layerResults contém todas as camadas do pipeline (L9+L1-L7+L8+L10 = 10 entradas mínimo)', () => {
    const state = baseState()
    const result = calculator.calculate(state, baseParams(), 0)
    // Pipeline: L9_DailyVolTarget + L1-L7 (7 layers) + L8_VelocityCap + L10_CircuitBreaker = 10
    expect(result.layerResults.length).toBeGreaterThanOrEqual(10)
    const layerNames = result.layerResults.map(r => r.layer)
    expect(layerNames).toContain('L9_DailyVolTarget')
    expect(layerNames).toContain('L1_OrnsteinUhlenbeck')
    expect(layerNames).toContain('L8_VelocityCap')
    expect(layerNames).toContain('L10_CircuitBreaker')
  })
})

type RedisGetMock = { get: jest.Mock<Promise<string | null>, [string]> }

// Mapeia cada chave Redis ao valor mockado; chaves ausentes retornam null.
const redisWith = (values: Record<string, string | null>): RedisGetMock => ({
  get: jest.fn(async (key: string) => {
    if (key.startsWith('garch:var:')) return values.variance ?? null
    if (key.startsWith('ofi:state:')) return values.ofi ?? null
    if (key.startsWith('daily_vol:')) return values.dailyVol ?? null
    return null
  }),
})

describe('PriceCalculator.hydrateFromRedis (Number.isFinite)', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  test('payload válido persistido sobrescreve o estado (compatibilidade preservada)', async () => {
    const state = baseState()
    const redis = redisWith({ variance: '0.0025', ofi: '-0.42', dailyVol: '0.0137' })
    const calculator = new PriceCalculator(redis as never)

    await calculator.hydrateFromRedis(state)

    expect(state.variance).toBeCloseTo(0.0025, 6)
    expect(state.ofiState).toBeCloseTo(-0.42, 6)
    expect(state.dailyVolAccum).toBeCloseTo(0.0137, 6)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test('payload "0" persistido é aceito (zero é finito, não cai em default)', async () => {
    const state = baseState()
    state.variance = 0.5  // default não-zero para provar que "0" sobrescreve
    const redis = redisWith({ variance: '0', ofi: '0', dailyVol: '0' })
    const calculator = new PriceCalculator(redis as never)

    await calculator.hydrateFromRedis(state)

    expect(state.variance).toBe(0)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test('payload inválido (lixo) cai para default explícito, emite warn e não propaga NaN', async () => {
    const state = baseState()
    const defaults = {
      variance: state.variance,
      ofiState: state.ofiState,
      dailyVolAccum: state.dailyVolAccum,
    }
    const redis = redisWith({ variance: 'garbage', ofi: 'NaN', dailyVol: 'Infinity' })
    const calculator = new PriceCalculator(redis as never)

    await calculator.hydrateFromRedis(state)

    // Mantém defaults explícitos inalterados.
    expect(state.variance).toBe(defaults.variance)
    expect(state.ofiState).toBe(defaults.ofiState)
    expect(state.dailyVolAccum).toBe(defaults.dailyVolAccum)
    // Nenhum NaN/Infinity propagado ao estado.
    expect(Number.isFinite(state.variance)).toBe(true)
    expect(Number.isFinite(state.ofiState)).toBe(true)
    expect(Number.isFinite(state.dailyVolAccum)).toBe(true)
    // Warn emitido para cada chave inválida.
    expect(warnSpy).toHaveBeenCalledTimes(3)
  })

  test('chave ausente (null) mantém default silenciosamente, sem warn', async () => {
    const state = baseState()
    const defaults = { variance: state.variance, ofiState: state.ofiState }
    const redis = redisWith({ variance: null, ofi: null, dailyVol: null })
    const calculator = new PriceCalculator(redis as never)

    await calculator.hydrateFromRedis(state)

    expect(state.variance).toBe(defaults.variance)
    expect(state.ofiState).toBe(defaults.ofiState)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test('sem cliente Redis injetado: no-op seguro', async () => {
    const state = baseState()
    const before = { ...state }
    const calculator = new PriceCalculator()

    await expect(calculator.hydrateFromRedis(state)).resolves.toBeUndefined()
    expect(state.variance).toBe(before.variance)
  })
})
