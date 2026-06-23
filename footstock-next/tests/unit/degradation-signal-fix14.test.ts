/**
 * Testes unitarios — FIX-14: observabilidade de degradacao silenciosa.
 * Loop 06-22-footstock-financeiro-planos (Task 18).
 *
 * Aceite: cada ponto antes silencioso emite sinal observavel; health-check do
 * secret falha-rapido (alerta) quando ausente. Cobrimos:
 *  (a) emitDegradationSignal: warn -> console.warn + Sentry warning; alert -> console.error + Sentry error;
 *  (b) throttle por chave (anti-flood) e bypass com throttleMs:0; warn/alert nao colidem;
 *  (c) fail-open: erro de transporte (Sentry) nao propaga;
 *  (d) runWebhookSecretHealthCheck: ACTIVE_GATEWAY com secret faltando -> alerta; com secret -> ok; unset -> no-op.
 */

const mockCaptureMessage = jest.fn()
const mockAddBreadcrumb = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  addBreadcrumb: (...a: unknown[]) => mockAddBreadcrumb(...a),
}))

// env mockado para nao disparar o boot fail-fast real (env.ts) ao importar o
// webhook-validator; mutavel por teste (ACTIVE_GATEWAY lido em call-time).
jest.mock('@/lib/env', () => ({
  env: {
    ACTIVE_GATEWAY: undefined,
    MERCADO_PAGO_WEBHOOK_SECRET: undefined,
    PAGSEGURO_WEBHOOK_SECRET: undefined,
    PAYPAL_WEBHOOK_ID: undefined,
  },
}))

import {
  emitDegradationSignal,
  __resetDegradationThrottle,
} from '@/lib/observability/degradation-signal'

const { env } = require('@/lib/env') as { env: Record<string, string | undefined> }
const { runWebhookSecretHealthCheck } =
  require('@/lib/gateways/webhook-validator') as typeof import('@/lib/gateways/webhook-validator')

let warnSpy: jest.SpyInstance
let errorSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  __resetDegradationThrottle()
  env.ACTIVE_GATEWAY = undefined
  env.MERCADO_PAGO_WEBHOOK_SECRET = undefined
  env.PAGSEGURO_WEBHOOK_SECRET = undefined
  env.PAYPAL_WEBHOOK_ID = undefined
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

describe('emitDegradationSignal (FIX-14)', () => {
  test('(a) warn: console.warn + Sentry warning, retorna true', () => {
    const emitted = emitDegradationSignal('rate_limiter.fail_open', {
      context: { prefix: 'rl:auth', reason: 'redis_unavailable' },
    })
    expect(emitted).toBe(true)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain('[DEGRADATION:WARN] signal=rate_limiter.fail_open')
    expect(String(warnSpy.mock.calls[0][0])).toContain('prefix=rl:auth')
    expect(errorSpy).not.toHaveBeenCalled()
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'degradation:rate_limiter.fail_open',
      expect.objectContaining({ level: 'warning' }),
    )
  })

  test('(a) alert: console.error + Sentry error', () => {
    const emitted = emitDegradationSignal('webhook.config_missing', {
      level: 'alert',
      context: { gateway: 'MERCADO_PAGO' },
    })
    expect(emitted).toBe(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('[DEGRADATION:ALERT] signal=webhook.config_missing')
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'degradation:webhook.config_missing',
      expect.objectContaining({ level: 'error' }),
    )
  })

  test('(b) throttle: segunda emissao identica na janela retorna false e nao reemite', () => {
    expect(emitDegradationSignal('s.dup', { throttleMs: 60_000 })).toBe(true)
    expect(emitDegradationSignal('s.dup', { throttleMs: 60_000 })).toBe(false)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  test('(b) throttleMs:0 sempre emite', () => {
    expect(emitDegradationSignal('s.always', { throttleMs: 0 })).toBe(true)
    expect(emitDegradationSignal('s.always', { throttleMs: 0 })).toBe(true)
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  test('(b) warn e alert da mesma signal nao se bloqueiam (chave inclui o level)', () => {
    expect(emitDegradationSignal('s.mix', { level: 'warn' })).toBe(true)
    expect(emitDegradationSignal('s.mix', { level: 'alert' })).toBe(true)
  })

  test('(c) fail-open: erro no transporte Sentry nao propaga', () => {
    mockCaptureMessage.mockImplementation(() => {
      throw new Error('sentry down')
    })
    expect(() => emitDegradationSignal('s.failopen')).not.toThrow()
  })
})

describe('runWebhookSecretHealthCheck (FIX-14)', () => {
  test('(d) ACTIVE_GATEWAY unset: no-op (ok, sem alerta)', () => {
    const res = runWebhookSecretHealthCheck()
    expect(res).toEqual({ gateway: null, ok: true, missingVar: null })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test('(d) MERCADO_PAGO ativo sem secret: alerta + ok=false', () => {
    env.ACTIVE_GATEWAY = 'MERCADO_PAGO'
    const res = runWebhookSecretHealthCheck()
    expect(res.ok).toBe(false)
    expect(res.missingVar).toBe('MERCADO_PAGO_WEBHOOK_SECRET')
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('signal=webhook.secret_health_check_failed')
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'degradation:webhook.secret_health_check_failed',
      expect.objectContaining({ level: 'error' }),
    )
  })

  test('(d) MERCADO_PAGO ativo com secret: ok, sem alerta', () => {
    env.ACTIVE_GATEWAY = 'MERCADO_PAGO'
    env.MERCADO_PAGO_WEBHOOK_SECRET = 'whsec_present'
    const res = runWebhookSecretHealthCheck()
    expect(res).toEqual({ gateway: 'MERCADO_PAGO', ok: true, missingVar: null })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test('(d) PAYPAL ativo sem webhook id: alerta + missingVar=PAYPAL_WEBHOOK_ID', () => {
    env.ACTIVE_GATEWAY = 'PAYPAL'
    const res = runWebhookSecretHealthCheck()
    expect(res.ok).toBe(false)
    expect(res.missingVar).toBe('PAYPAL_WEBHOOK_ID')
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})
