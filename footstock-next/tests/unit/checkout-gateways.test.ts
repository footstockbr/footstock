// Seletor de checkout: oferece as 3 PLATAFORMAS reais (Mercado Pago, PagSeguro,
// PayPal) e NUNCA a entrada falsa "PIX" (que era um metodo do Mercado Pago
// listado em duplicidade). O conjunto efetivamente oferecido e gateado em
// runtime por credenciais (ver enabled-checkout-gateways.test.ts).
import {
  ALL_CHECKOUT_GATEWAYS,
  CHECKOUT_GATEWAY_LABELS,
  DEFAULT_CHECKOUT_GATEWAY,
  getCheckoutGatewayOptions,
  isKnownCheckoutGateway,
} from '@/lib/constants/checkout-gateways'

describe('checkout-gateways: plataformas oferecidas', () => {
  it('conhece exatamente as 3 plataformas reais, sem PIX', () => {
    expect([...ALL_CHECKOUT_GATEWAYS]).toEqual(['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL'])
    expect(ALL_CHECKOUT_GATEWAYS).not.toContain('PIX')
    expect(isKnownCheckoutGateway('PIX')).toBe(false)
  })

  it('tem rotulo nao-vazio para cada plataforma', () => {
    for (const gateway of ALL_CHECKOUT_GATEWAYS) {
      expect(CHECKOUT_GATEWAY_LABELS[gateway].length).toBeGreaterThan(0)
    }
    // Nenhum rotulo duplica "Mercado Pago" (a duplicidade do bug original).
    const labels = ALL_CHECKOUT_GATEWAYS.map((g) => CHECKOUT_GATEWAY_LABELS[g])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('default e Mercado Pago', () => {
    expect(DEFAULT_CHECKOUT_GATEWAY).toBe('MERCADO_PAGO')
    expect(isKnownCheckoutGateway(DEFAULT_CHECKOUT_GATEWAY)).toBe(true)
  })

  it('getCheckoutGatewayOptions reflete a lista habilitada na ordem canonica', () => {
    const options = getCheckoutGatewayOptions(['PAYPAL', 'MERCADO_PAGO'])
    // Ordem canonica preservada (MP antes de PayPal), independente da entrada.
    expect(options.map((o) => o.value)).toEqual(['MERCADO_PAGO', 'PAYPAL'])
    for (const option of options) {
      expect(option.label).toBe(CHECKOUT_GATEWAY_LABELS[option.value])
    }
  })

  it('getCheckoutGatewayOptions com lista vazia retorna []', () => {
    expect(getCheckoutGatewayOptions([])).toEqual([])
  })

  it('oferece as 3 quando as 3 estao habilitadas', () => {
    const options = getCheckoutGatewayOptions([...ALL_CHECKOUT_GATEWAYS])
    expect(options.map((o) => o.value)).toEqual(['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL'])
  })
})
