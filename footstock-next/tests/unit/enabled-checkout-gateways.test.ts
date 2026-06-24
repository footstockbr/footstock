// Resolucao em runtime dos gateways habilitados: um gateway so e oferecido
// quando TODAS as suas credenciais estao presentes (heranca da FIX-19 — nunca
// oferecer gateway sem credencial, que criaria Subscription PENDING orfa).
jest.mock('server-only', () => ({}))

const mockEnv: Record<string, string | undefined> = {}
jest.mock('@/lib/env', () => ({
  get env() {
    return mockEnv
  },
}))

import {
  resolveEnabledCheckoutGateways,
  isCheckoutGatewayConfigured,
} from '@/lib/payments/enabled-gateways.server'

function setEnv(values: Record<string, string | undefined>) {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key]
  Object.assign(mockEnv, values)
}

const MP = { MERCADO_PAGO_ACCESS_TOKEN: 'tok', MERCADO_PAGO_WEBHOOK_SECRET: 'sec' }
const PS = { PAGSEGURO_TOKEN: 'tok', PAGSEGURO_WEBHOOK_SECRET: 'sec' }
const PP = { PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'sec', PAYPAL_WEBHOOK_ID: 'wh' }

describe('resolveEnabledCheckoutGateways', () => {
  it('retorna [] quando nenhuma credencial esta presente', () => {
    setEnv({})
    expect(resolveEnabledCheckoutGateways()).toEqual([])
  })

  it('oferece apenas o gateway configurado (so Mercado Pago)', () => {
    setEnv({ ...MP })
    expect(resolveEnabledCheckoutGateways()).toEqual(['MERCADO_PAGO'])
  })

  it('oferece os 3 quando os 3 estao configurados, em ordem canonica', () => {
    setEnv({ ...MP, ...PS, ...PP })
    expect(resolveEnabledCheckoutGateways()).toEqual(['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL'])
  })

  it('exige TODAS as credenciais do gateway (PayPal sem webhook id fica fora)', () => {
    setEnv({ ...MP, PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'sec' })
    expect(isCheckoutGatewayConfigured('PAYPAL')).toBe(false)
    expect(resolveEnabledCheckoutGateways()).toEqual(['MERCADO_PAGO'])
  })

  it('trata credencial vazia/espacos como ausente', () => {
    setEnv({ PAGSEGURO_TOKEN: '   ', PAGSEGURO_WEBHOOK_SECRET: 'sec' })
    expect(isCheckoutGatewayConfigured('PAGSEGURO')).toBe(false)
  })
})
