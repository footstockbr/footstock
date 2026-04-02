// ============================================================================
// Foot Stock — Testes unitários: GatewayFactory
// Cobre: getGateway, getGatewayByHeader, detectGatewayType, getSupportedGateways
// Referência: PAYMENT_052 (gateway não suportado)
// ============================================================================

import {
  getGateway,
  getGatewayByHeader,
  detectGatewayType,
  getSupportedGateways,
  clearGatewayCache,
} from '../GatewayFactory'
import { GatewayType } from '../IGateway'
import { MercadoPagoGateway } from '../mercadopago'
import { PagSeguroGateway } from '../pagseguro'
import { PayPalGateway } from '../paypal'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/env', () => ({ env: {} }))
jest.mock('@/lib/constants/payment-security', () => ({
  CHECKOUT_EXPIRY_MINUTES: 30,
  GATEWAY_TIMEOUT_MS: 5000,
  WEBHOOK_REPLAY_WINDOW_MS: 300000,
}))

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('GatewayFactory', () => {
  beforeEach(() => {
    clearGatewayCache()
  })

  // ─── getGateway ────────────────────────────────────────────────────────────

  describe('getGateway', () => {
    it('retorna instância de MercadoPagoGateway para MERCADO_PAGO', () => {
      const gw = getGateway(GatewayType.MERCADO_PAGO)
      expect(gw).toBeInstanceOf(MercadoPagoGateway)
      expect(gw.name).toBe('MERCADO_PAGO')
    })

    it('retorna instância de PagSeguroGateway para PAGSEGURO', () => {
      const gw = getGateway(GatewayType.PAGSEGURO)
      expect(gw).toBeInstanceOf(PagSeguroGateway)
      expect(gw.name).toBe('PAGSEGURO')
    })

    it('retorna instância de PayPalGateway para PAYPAL', () => {
      const gw = getGateway(GatewayType.PAYPAL)
      expect(gw).toBeInstanceOf(PayPalGateway)
      expect(gw.name).toBe('PAYPAL')
    })

    it('retorna a mesma instância em chamadas repetidas (singleton)', () => {
      const gw1 = getGateway(GatewayType.MERCADO_PAGO)
      const gw2 = getGateway(GatewayType.MERCADO_PAGO)
      expect(gw1).toBe(gw2)
    })

    it('lança erro com code PAYMENT_052 para tipo não suportado', () => {
      expect(() => getGateway('STRIPE' as GatewayType)).toThrow()
      try {
        getGateway('STRIPE' as GatewayType)
      } catch (err) {
        expect((err as { code: string }).code).toBe('PAYMENT_052')
      }
    })

    it('mensagem de erro inclui o tipo inválido', () => {
      expect(() => getGateway('BOLETO' as GatewayType)).toThrow(/BOLETO/)
    })
  })

  // ─── getGatewayByHeader ────────────────────────────────────────────────────

  describe('getGatewayByHeader', () => {
    it('detecta Mercado Pago pelo header x-signature', () => {
      const headers = new Headers({ 'x-signature': 'ts=123,v1=abc' })
      const gw = getGatewayByHeader(headers)
      expect(gw).toBeInstanceOf(MercadoPagoGateway)
    })

    it('detecta PagSeguro pelo header x-pagseguro-signature', () => {
      const headers = new Headers({ 'x-pagseguro-signature': 'sha256-abc123' })
      const gw = getGatewayByHeader(headers)
      expect(gw).toBeInstanceOf(PagSeguroGateway)
    })

    it('detecta PayPal pelo header paypal-transmission-sig', () => {
      const headers = new Headers({ 'paypal-transmission-sig': 'sig-xyz' })
      const gw = getGatewayByHeader(headers)
      expect(gw).toBeInstanceOf(PayPalGateway)
    })

    it('retorna null quando nenhum header é reconhecido', () => {
      const headers = new Headers({ 'content-type': 'application/json' })
      expect(getGatewayByHeader(headers)).toBeNull()
    })

    it('retorna null para headers vazios', () => {
      expect(getGatewayByHeader(new Headers())).toBeNull()
    })

    it('prioriza Mercado Pago quando múltiplos headers estão presentes', () => {
      const headers = new Headers({
        'x-signature': 'ts=1,v1=abc',
        'x-pagseguro-signature': 'sha256-xyz',
      })
      expect(getGatewayByHeader(headers)).toBeInstanceOf(MercadoPagoGateway)
    })
  })

  // ─── detectGatewayType ────────────────────────────────────────────────────

  describe('detectGatewayType', () => {
    it('retorna MERCADO_PAGO para x-signature', () => {
      expect(detectGatewayType(new Headers({ 'x-signature': 'ts=1,v1=abc' })))
        .toBe(GatewayType.MERCADO_PAGO)
    })

    it('retorna PAGSEGURO para x-pagseguro-signature', () => {
      expect(detectGatewayType(new Headers({ 'x-pagseguro-signature': 'sig' })))
        .toBe(GatewayType.PAGSEGURO)
    })

    it('retorna PAYPAL para paypal-transmission-sig', () => {
      expect(detectGatewayType(new Headers({ 'paypal-transmission-sig': 'sig' })))
        .toBe(GatewayType.PAYPAL)
    })

    it('retorna null para headers sem correspondência', () => {
      expect(detectGatewayType(new Headers({ 'x-unknown': 'abc' }))).toBeNull()
    })
  })

  // ─── getSupportedGateways ─────────────────────────────────────────────────

  describe('getSupportedGateways', () => {
    it('lista os 3 gateways suportados', () => {
      const supported = getSupportedGateways()
      expect(supported).toHaveLength(3)
      expect(supported).toContain(GatewayType.MERCADO_PAGO)
      expect(supported).toContain(GatewayType.PAGSEGURO)
      expect(supported).toContain(GatewayType.PAYPAL)
    })
  })
})
