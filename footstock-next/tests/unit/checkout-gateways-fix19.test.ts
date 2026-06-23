// FIX-19: o seletor de checkout NAO pode oferecer gateways nao configurados
// (PagSeguro/PayPal), que criariam Subscription PENDING orfa + DECLINED.
import {
  ENABLED_CHECKOUT_GATEWAYS,
  DEFAULT_CHECKOUT_GATEWAY,
  CHECKOUT_GATEWAY_LABELS,
  isCheckoutGatewayEnabled,
  getEnabledCheckoutGatewayOptions,
} from '@/lib/constants/checkout-gateways'

describe('FIX-19: checkout gateways habilitados', () => {
  it('NAO oferece PagSeguro nem PayPal (default seguro ate configurados)', () => {
    expect(ENABLED_CHECKOUT_GATEWAYS).not.toContain('PAGSEGURO')
    expect(ENABLED_CHECKOUT_GATEWAYS).not.toContain('PAYPAL')
    expect(isCheckoutGatewayEnabled('PAGSEGURO')).toBe(false)
    expect(isCheckoutGatewayEnabled('PAYPAL')).toBe(false)
  })

  it('oferece Mercado Pago e PIX (gateways configurados/wired)', () => {
    expect(ENABLED_CHECKOUT_GATEWAYS).toContain('MERCADO_PAGO')
    expect(ENABLED_CHECKOUT_GATEWAYS).toContain('PIX')
    expect(isCheckoutGatewayEnabled('MERCADO_PAGO')).toBe(true)
    expect(isCheckoutGatewayEnabled('PIX')).toBe(true)
  })

  it('default do seletor e um gateway habilitado', () => {
    expect(isCheckoutGatewayEnabled(DEFAULT_CHECKOUT_GATEWAY)).toBe(true)
    expect(DEFAULT_CHECKOUT_GATEWAY).toBe('MERCADO_PAGO')
  })

  it('opcoes do seletor batem 1:1 com a lista habilitada e tem rotulo', () => {
    const options = getEnabledCheckoutGatewayOptions()
    expect(options.map((o) => o.value)).toEqual([...ENABLED_CHECKOUT_GATEWAYS])
    for (const option of options) {
      expect(option.label).toBe(CHECKOUT_GATEWAY_LABELS[option.value])
      expect(option.label.length).toBeGreaterThan(0)
    }
    // Nenhuma opcao oferecida e um gateway nao configurado.
    expect(options.map((o) => o.value)).not.toContain('PAGSEGURO')
    expect(options.map((o) => o.value)).not.toContain('PAYPAL')
  })
})
