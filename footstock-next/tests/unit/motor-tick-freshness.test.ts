// ============================================================================
// lib/motor/tick-freshness — limiar unico de frescor do tick do motor
// Cobre: default, override valido, override invalido (aviso uma vez), limites,
//        idade nao-finita.
// ============================================================================

import {
  DEFAULT_TICK_STALE_S,
  MAX_TICK_STALE_S,
  MIN_TICK_STALE_S,
  TICK_STALE_ENV_KEY,
  __resetTickFreshnessWarning,
  getTickStaleThresholdS,
  isTickFresh,
} from '@/lib/motor/tick-freshness'

describe('tick-freshness', () => {
  const originalEnv = process.env[TICK_STALE_ENV_KEY]
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    delete process.env[TICK_STALE_ENV_KEY]
    __resetTickFreshnessWarning()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    if (originalEnv === undefined) delete process.env[TICK_STALE_ENV_KEY]
    else process.env[TICK_STALE_ENV_KEY] = originalEnv
  })

  describe('getTickStaleThresholdS', () => {
    test('sem env, usa o default de 25s', () => {
      expect(getTickStaleThresholdS()).toBe(DEFAULT_TICK_STALE_S)
      expect(DEFAULT_TICK_STALE_S).toBe(25)
    })

    test('env vazia ou so espaco cai no default sem avisar', () => {
      process.env[TICK_STALE_ENV_KEY] = '   '
      expect(getTickStaleThresholdS()).toBe(DEFAULT_TICK_STALE_S)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    test('inteiro valido dentro da faixa e respeitado', () => {
      process.env[TICK_STALE_ENV_KEY] = '40'
      expect(getTickStaleThresholdS()).toBe(40)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    test('limites inclusivos', () => {
      process.env[TICK_STALE_ENV_KEY] = String(MIN_TICK_STALE_S)
      expect(getTickStaleThresholdS()).toBe(MIN_TICK_STALE_S)
      process.env[TICK_STALE_ENV_KEY] = String(MAX_TICK_STALE_S)
      expect(getTickStaleThresholdS()).toBe(MAX_TICK_STALE_S)
      expect(warnSpy).not.toHaveBeenCalled()
    })

    test.each([
      ['0', 'abaixo do piso'],
      ['61', 'acima do teto'],
      ['-5', 'negativo'],
      ['12.5', 'nao inteiro'],
      ['banana', 'nao numerico'],
      ['25s', 'sufixo — parseInt aceitaria, Number nao'],
    ])('%s (%s) cai no default', (value) => {
      process.env[TICK_STALE_ENV_KEY] = value
      expect(getTickStaleThresholdS()).toBe(DEFAULT_TICK_STALE_S)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    test('valor invalido avisa apenas uma vez, mesmo em varias chamadas', () => {
      process.env[TICK_STALE_ENV_KEY] = 'banana'
      getTickStaleThresholdS()
      getTickStaleThresholdS()
      getTickStaleThresholdS()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('isTickFresh', () => {
    test('idade dentro do limiar e fresca; o limiar exato ainda vale', () => {
      expect(isTickFresh(0)).toBe(true)
      expect(isTickFresh(24.9)).toBe(true)
      expect(isTickFresh(DEFAULT_TICK_STALE_S)).toBe(true)
    })

    test('idade acima do limiar nao e fresca', () => {
      expect(isTickFresh(DEFAULT_TICK_STALE_S + 0.1)).toBe(false)
      expect(isTickFresh(120)).toBe(false)
    })

    test('a janela nova cobre o jitter que derrubava o antigo limiar de 10s', () => {
      // 10.05s era "offline" nos tres consumidores; com heartbeat de 10s isso
      // acontecia em operacao normal.
      expect(isTickFresh(10.05)).toBe(true)
    })

    test('limiar explicito sobrescreve o resolvido por env', () => {
      expect(isTickFresh(30, 60)).toBe(true)
      expect(isTickFresh(30, 10)).toBe(false)
    })

    test('idade nao-finita e tratada como stale (lado pessimista)', () => {
      expect(isTickFresh(Number.NaN)).toBe(false)
      expect(isTickFresh(Number.POSITIVE_INFINITY)).toBe(false)
      expect(isTickFresh(Number.NEGATIVE_INFINITY)).toBe(false)
    })
  })
})
