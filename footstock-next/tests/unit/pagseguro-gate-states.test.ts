// Item 009 — gate de DUAS FASES do PagSeguro: diferencia EMPTY, PLACEHOLDER,
// SANDBOX_IN_PROD, WEBHOOK_UNCONFIRMED e VALID; contrato de log do servidor
// (NO_GATEWAY_CONFIGURED vs GATEWAY_DISABLED_BY_HARDENING, mutuamente exclusivos);
// e higiene de nomes de env (.env.production.example sem MERCADOPAGO_/PAGOSEGURO_).
import * as fs from 'fs'
import * as path from 'path'

jest.mock('server-only', () => ({}))

const mockEnv: Record<string, string | undefined> = {}
jest.mock('@/lib/env', () => ({
  get env() {
    return mockEnv
  },
}))

import {
  evaluateGatewayState,
  isCheckoutGatewayConfigured,
  computeGatewayGateLogs,
  type GatewayGateState,
} from '@/lib/payments/enabled-gateways.server'
import type { CheckoutGateway } from '@/lib/constants/checkout-gateways'

function setEnv(values: Record<string, string | undefined>) {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key]
  Object.assign(mockEnv, values)
}

// Credencial de habilitacao (FASE A) valida e token de webhook (FASE B) valido.
const ENABLING_OK = { PAGSEGURO_TOKEN: 'APP-USR-prod-real-token' }
const WEBHOOK_OK = { PAGSEGURO_NOTIFICATION_TOKEN: 'notif-real-token' }

describe('evaluateGatewayState(PAGSEGURO) — um caso por estado', () => {
  it('credencial de habilitacao ausente -> EMPTY (gateway oculto)', () => {
    setEnv({ ...WEBHOOK_OK }) // so o token de webhook; habilitacao ausente
    expect(evaluateGatewayState('PAGSEGURO')).toBe('EMPTY')
    expect(isCheckoutGatewayConfigured('PAGSEGURO')).toBe(false)
  })

  it('credencial de habilitacao com valor placeholder -> PLACEHOLDER (gateway oculto)', () => {
    setEnv({ PAGSEGURO_TOKEN: 'your-token-here', ...WEBHOOK_OK })
    expect(evaluateGatewayState('PAGSEGURO')).toBe('PLACEHOLDER')
    expect(isCheckoutGatewayConfigured('PAGSEGURO')).toBe(false)
  })

  it('credencial de habilitacao de sandbox com NODE_ENV=production -> SANDBOX_IN_PROD (gateway oculto)', () => {
    setEnv({
      NODE_ENV: 'production',
      PAGSEGURO_TOKEN: 'real-token',
      PAGSEGURO_SANDBOX: 'true',
      ...WEBHOOK_OK,
    })
    expect(evaluateGatewayState('PAGSEGURO')).toBe('SANDBOX_IN_PROD')
    expect(isCheckoutGatewayConfigured('PAGSEGURO')).toBe(false)
  })

  it('habilitacao valida + PAGSEGURO_NOTIFICATION_TOKEN ausente -> WEBHOOK_UNCONFIRMED (estado atingivel; gateway oculto)', () => {
    setEnv({ ...ENABLING_OK }) // FASE A verde, FASE B sem token de webhook
    expect(evaluateGatewayState('PAGSEGURO')).toBe('WEBHOOK_UNCONFIRMED')
    expect(isCheckoutGatewayConfigured('PAGSEGURO')).toBe(false)
  })

  it('habilitacao valida + PAGSEGURO_NOTIFICATION_TOKEN presente/coerente -> VALID (gateway exposto)', () => {
    setEnv({ ...ENABLING_OK, ...WEBHOOK_OK })
    expect(evaluateGatewayState('PAGSEGURO')).toBe('VALID')
    expect(isCheckoutGatewayConfigured('PAGSEGURO')).toBe(true)
  })

  it('precedencia: EMPTY vence WEBHOOK_UNCONFIRMED (higiene de config antes de readiness)', () => {
    setEnv({}) // nada: habilitacao ausente domina
    expect(evaluateGatewayState('PAGSEGURO')).toBe('EMPTY')
  })

  it('PAGSEGURO_WEBHOOK_SECRET (HMAC legado) NAO habilita o gateway sozinho', () => {
    // Apenas habilitacao + secret legado, sem o token de autenticidade canonico.
    setEnv({ ...ENABLING_OK, PAGSEGURO_WEBHOOK_SECRET: 'legacy-hmac-secret' })
    expect(evaluateGatewayState('PAGSEGURO')).toBe('WEBHOOK_UNCONFIRMED')
    expect(isCheckoutGatewayConfigured('PAGSEGURO')).toBe(false)
  })
})

describe('computeGatewayGateLogs — codigos mutuamente exclusivos', () => {
  it('todos EMPTY -> NO_GATEWAY_CONFIGURED (unico)', () => {
    const states: Record<CheckoutGateway, GatewayGateState> = {
      MERCADO_PAGO: 'EMPTY',
      PAGSEGURO: 'EMPTY',
      PAYPAL: 'EMPTY',
    }
    expect(computeGatewayGateLogs(states)).toEqual([{ code: 'NO_GATEWAY_CONFIGURED' }])
  })

  it('havia config porem hardening ativo -> GATEWAY_DISABLED_BY_HARDENING com estado-causa', () => {
    const states: Record<CheckoutGateway, GatewayGateState> = {
      MERCADO_PAGO: 'VALID',
      PAGSEGURO: 'WEBHOOK_UNCONFIRMED',
      PAYPAL: 'PLACEHOLDER',
    }
    const logs = computeGatewayGateLogs(states)
    // VALID nao gera log; nao ha NO_GATEWAY_CONFIGURED quando ha config.
    expect(logs).toEqual([
      { code: 'GATEWAY_DISABLED_BY_HARDENING', gateway: 'PAGSEGURO', cause: 'WEBHOOK_UNCONFIRMED' },
      { code: 'GATEWAY_DISABLED_BY_HARDENING', gateway: 'PAYPAL', cause: 'PLACEHOLDER' },
    ])
    expect(logs.some((l) => l.code === 'NO_GATEWAY_CONFIGURED')).toBe(false)
  })

  it('SANDBOX_IN_PROD carrega a causa correta', () => {
    const states: Record<CheckoutGateway, GatewayGateState> = {
      MERCADO_PAGO: 'SANDBOX_IN_PROD',
      PAGSEGURO: 'EMPTY',
      PAYPAL: 'EMPTY',
    }
    expect(computeGatewayGateLogs(states)).toEqual([
      { code: 'GATEWAY_DISABLED_BY_HARDENING', gateway: 'MERCADO_PAGO', cause: 'SANDBOX_IN_PROD' },
    ])
  })
})

describe('higiene de nomes de env (.env.production.example)', () => {
  const envPath = path.resolve(__dirname, '../../.env.production.example')
  const content = fs.readFileSync(envPath, 'utf8')

  it('NAO contem os prefixos legados MERCADOPAGO_ nem PAGOSEGURO_', () => {
    expect(/MERCADOPAGO_/.test(content)).toBe(false)
    expect(/PAGOSEGURO_/.test(content)).toBe(false)
  })

  it('contem os nomes canonicos exigidos pelo gate', () => {
    expect(content).toContain('MERCADO_PAGO_ACCESS_TOKEN')
    expect(content).toContain('PAGSEGURO_NOTIFICATION_TOKEN')
    expect(content).toContain('PAGSEGURO_LEGACY_HMAC_FALLBACK=false')
  })

  it('NAO declara PAGSEGURO_WEBHOOK_SECRET como campo obrigatorio de autenticidade', () => {
    // O secret legado nao deve aparecer como variavel obrigatoria (linha `KEY=`);
    // referencia em comentario explicativo e permitida.
    const requiredLine = /^\s*PAGSEGURO_WEBHOOK_SECRET\s*=/m
    expect(requiredLine.test(content)).toBe(false)
  })
})
