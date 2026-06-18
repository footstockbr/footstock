// ============================================================================
// FootStock Motor — Testes do resolvedor EXPLÍCITO de DT (T3.3 + T3.4)
// loop 06-17-motor-footstock-correcoes-variacoes / Itens 014 + 015
//
// Aceite T3.3: o motor lê um DT EXPLÍCITO e auditável (proibido default
// acidental). Cobre as 3 fontes (override env, flag de recalibração, default-safe
// legacy) e a precedência entre elas.
// Aceite T3.4: override inválido (NaN/Infinity/negativo/zero/lixo) é rejeitado de
// forma determinística — warn estruturado + fallback explícito, sem usar o valor
// inválido e sem seguir em silêncio (não lança / não bloqueia startup).
// ============================================================================

import {
  resolveTickDt,
  getTickDt,
  __resetTickDtWarnings,
  MOTOR_TICK_DT_LEGACY_DEFAULT,
  MOTOR_TICK_DT_FORMAL_RECALIBRATION,
} from '../../tick-dt'

describe('tick-dt — resolução explícita do DT (T3.3)', () => {
  it('default-safe legacy: env vazio => 5/390 com source legacy-default-safe', () => {
    // Bug 1 do diagnóstico era o default ACIDENTAL 1.0. Agora o default é explícito:
    // 1/390 (legacy, tick de 2s) ajustado ao tick de 10s de produção (× 5) = 5/390.
    expect(MOTOR_TICK_DT_LEGACY_DEFAULT).toBeCloseTo(5 / 390, 15)
    expect(resolveTickDt({})).toEqual({ value: 5 / 390, source: 'legacy-default-safe' })
  })

  it('flag de recalibração formal: MOTOR_TICK_DT_FORMAL_RECALIBRATION=true => DT=1', () => {
    expect(MOTOR_TICK_DT_FORMAL_RECALIBRATION).toBe(1.0)
    expect(resolveTickDt({ MOTOR_TICK_DT_FORMAL_RECALIBRATION: 'true' })).toEqual({
      value: 1.0,
      source: 'formal-recalibration-flag',
    })
  })

  it('override explícito: MOTOR_TICK_DT_SECONDS finito > 0 => explicit-env', () => {
    expect(resolveTickDt({ MOTOR_TICK_DT_SECONDS: '0.5' })).toEqual({
      value: 0.5,
      source: 'explicit-env',
    })
    expect(resolveTickDt({ MOTOR_TICK_DT_SECONDS: '0.0128205' }).source).toBe('explicit-env')
  })

  it('precedência: override explícito vence a flag de recalibração', () => {
    const r = resolveTickDt({
      MOTOR_TICK_DT_SECONDS: '0.02',
      MOTOR_TICK_DT_FORMAL_RECALIBRATION: 'true',
    })
    expect(r).toEqual({ value: 0.02, source: 'explicit-env' })
  })

  it('string em branco em MOTOR_TICK_DT_SECONDS cai no default-safe (não é override)', () => {
    expect(resolveTickDt({ MOTOR_TICK_DT_SECONDS: '   ' })).toEqual({
      value: 5 / 390,
      source: 'legacy-default-safe',
    })
  })

  it('flag != "true" não ativa a recalibração (cai no default-safe)', () => {
    expect(resolveTickDt({ MOTOR_TICK_DT_FORMAL_RECALIBRATION: '1' }).source).toBe(
      'legacy-default-safe',
    )
    expect(resolveTickDt({ MOTOR_TICK_DT_FORMAL_RECALIBRATION: 'TRUE' }).source).toBe(
      'legacy-default-safe',
    )
  })

  it('getTickDt retorna apenas o valor numérico da resolução', () => {
    expect(getTickDt({})).toBeCloseTo(5 / 390, 15)
    expect(getTickDt({ MOTOR_TICK_DT_SECONDS: '0.25' })).toBe(0.25)
    expect(getTickDt({ MOTOR_TICK_DT_FORMAL_RECALIBRATION: 'true' })).toBe(1.0)
  })
})

describe('tick-dt — T3.4: rejeição determinística de DT inválido (warn + fallback)', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    __resetTickDtWarnings()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // NaN ('lixo'/'NaN'), Infinity ('Infinity'/'1e999'), negativo ('-1'/'-0.5') e zero ('0').
  const INVALID = ['0', '-1', '-0.5', 'lixo', 'NaN', 'Infinity', '1e999', '-Infinity']

  it('cada entrada inválida cai no fallback default-safe (nunca usa o valor inválido)', () => {
    for (const bad of INVALID) {
      __resetTickDtWarnings()
      const r = resolveTickDt({ MOTOR_TICK_DT_SECONDS: bad })
      expect(r.source).toBe('invalid-env-fallback')
      expect(r.value).toBeCloseTo(MOTOR_TICK_DT_LEGACY_DEFAULT, 15)
      expect(r.rejectedEnvValue).toBe(bad)
      // DT efetivo é sempre finito > 0 — nenhuma execução segue com DT inválido.
      expect(Number.isFinite(r.value)).toBe(true)
      expect(r.value).toBeGreaterThan(0)
    }
  })

  it('não lança (env mal configurada não derruba o motor / não bloqueia startup)', () => {
    for (const bad of INVALID) {
      expect(() => resolveTickDt({ MOTOR_TICK_DT_SECONDS: bad })).not.toThrow()
    }
  })

  it('emite warn estruturado mencionando a variável e o valor rejeitado (não silencioso)', () => {
    resolveTickDt({ MOTOR_TICK_DT_SECONDS: 'lixo' })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const msg = String(warnSpy.mock.calls[0][0])
    expect(msg).toContain('[motor:tick-dt]')
    expect(msg).toContain('MOTOR_TICK_DT_SECONDS')
    expect(msg).toContain('lixo')
  })

  it('fallback respeita a precedência: flag de recalibração quando o override é inválido', () => {
    const r = resolveTickDt({
      MOTOR_TICK_DT_SECONDS: '-1',
      MOTOR_TICK_DT_FORMAL_RECALIBRATION: 'true',
    })
    expect(r.source).toBe('invalid-env-fallback')
    expect(r.value).toBe(MOTOR_TICK_DT_FORMAL_RECALIBRATION)
    expect(r.rejectedEnvValue).toBe('-1')
  })

  it('warn é deduplicado por valor cru (sem spam quando lido a cada tick)', () => {
    for (let i = 0; i < 5; i++) resolveTickDt({ MOTOR_TICK_DT_SECONDS: '0' })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('getTickDt retorna o DT do fallback (válido) para override inválido', () => {
    expect(getTickDt({ MOTOR_TICK_DT_SECONDS: 'NaN' })).toBeCloseTo(MOTOR_TICK_DT_LEGACY_DEFAULT, 15)
  })
})
