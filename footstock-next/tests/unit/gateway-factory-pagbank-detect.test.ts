/**
 * Testes unitarios — Item 008: deteccao de gateway por header do webhook.
 *
 * PagBank/PagSeguro `/orders` passa a ser detectado pelo header canonico
 * `x-authenticity-token` (esquema SHA-256 token-payload). O header legado
 * `x-pagseguro-signature` continua roteando para PAGSEGURO (o gating do esquema
 * acontece no validador, nao no detector). getGatewayByHeader e detectGatewayType
 * devem permanecer em PARIDADE.
 */

jest.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://test.footstock' } }))

import {
  detectGatewayType,
  getGatewayByHeader,
  clearGatewayCache,
} from '@/lib/gateways/GatewayFactory'
import { GatewayType } from '@/lib/gateways/IGateway'

beforeEach(() => clearGatewayCache())

describe('detectGatewayType — PagBank x-authenticity-token (Item 008)', () => {
  it('x-authenticity-token -> PAGSEGURO', () => {
    expect(detectGatewayType(new Headers({ 'x-authenticity-token': 'abc123' }))).toBe(GatewayType.PAGSEGURO)
  })

  it('x-pagseguro-signature (legado) ainda -> PAGSEGURO', () => {
    expect(detectGatewayType(new Headers({ 'x-pagseguro-signature': 'abc123' }))).toBe(GatewayType.PAGSEGURO)
  })

  it('x-signature (Mercado Pago) tem precedencia mesmo com x-authenticity-token presente', () => {
    const headers = new Headers({ 'x-signature': 'ts=1,v1=aa', 'x-authenticity-token': 'abc123' })
    expect(detectGatewayType(headers)).toBe(GatewayType.MERCADO_PAGO)
  })

  it('paypal-transmission-sig -> PAYPAL', () => {
    expect(detectGatewayType(new Headers({ 'paypal-transmission-sig': 'sig' }))).toBe(GatewayType.PAYPAL)
  })

  it('nenhum header conhecido -> null', () => {
    expect(detectGatewayType(new Headers({ 'content-type': 'application/json' }))).toBeNull()
  })
})

describe('getGatewayByHeader — paridade com detectGatewayType', () => {
  it('x-authenticity-token -> instancia PAGSEGURO', () => {
    expect(getGatewayByHeader(new Headers({ 'x-authenticity-token': 'abc123' }))?.name).toBe('PAGSEGURO')
  })

  it('x-pagseguro-signature -> instancia PAGSEGURO', () => {
    expect(getGatewayByHeader(new Headers({ 'x-pagseguro-signature': 'abc123' }))?.name).toBe('PAGSEGURO')
  })

  it('header desconhecido -> null', () => {
    expect(getGatewayByHeader(new Headers({ 'content-type': 'application/json' }))).toBeNull()
  })
})
