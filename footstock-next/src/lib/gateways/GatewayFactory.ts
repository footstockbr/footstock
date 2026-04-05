// ============================================================================
// Foot Stock — GatewayFactory: instância singleton por tipo de gateway
// Detecta gateway por header do webhook para roteamento unificado
// Referência: PAYMENT_052 (gateway não suportado)
// ============================================================================

import type { IGateway } from './IGateway'
import { GatewayType } from './IGateway'
import { MercadoPagoGateway } from './mercadopago'
import { PagSeguroGateway } from './pagseguro'
import { PayPalGateway } from './paypal'

// ─── Cache de instâncias (module-level singleton) ─────────────────────────────

const instances = new Map<GatewayType, IGateway>()

// ─── GatewayFactory ───────────────────────────────────────────────────────────

/**
 * Retorna a instância singleton do gateway para o tipo informado.
 * @throws Error com code PAYMENT_052 para tipos não suportados
 */
export function getGateway(type: GatewayType): IGateway {
  if (instances.has(type)) {
    return instances.get(type)!
  }

  let gateway: IGateway

  switch (type) {
    case GatewayType.MERCADO_PAGO:
      gateway = new MercadoPagoGateway()
      break
    case GatewayType.PAGSEGURO:
      gateway = new PagSeguroGateway()
      break
    case GatewayType.PAYPAL:
      gateway = new PayPalGateway()
      break
    default: {
      const err = new Error(`Gateway não suportado: ${type}`) as Error & { code: string }
      err.code = 'PAYMENT_052'
      throw err
    }
  }

  instances.set(type, gateway)
  return gateway
}

/**
 * Detecta o gateway correto a partir dos headers do webhook.
 * @returns IGateway correspondente ou null se não reconhecido
 */
export function getGatewayByHeader(headers: Headers): IGateway | null {
  if (headers.get('x-signature')) {
    return getGateway(GatewayType.MERCADO_PAGO)
  }
  if (headers.get('x-pagseguro-signature')) {
    return getGateway(GatewayType.PAGSEGURO)
  }
  if (headers.get('paypal-transmission-sig')) {
    return getGateway(GatewayType.PAYPAL)
  }
  return null
}

/**
 * Detecta o GatewayType a partir dos headers do webhook.
 * @returns GatewayType ou null se não reconhecido
 */
export function detectGatewayType(headers: Headers): GatewayType | null {
  if (headers.get('x-signature')) return GatewayType.MERCADO_PAGO
  if (headers.get('x-pagseguro-signature')) return GatewayType.PAGSEGURO
  if (headers.get('paypal-transmission-sig')) return GatewayType.PAYPAL
  return null
}

/**
 * Lista todos os gateways suportados.
 */
export function getSupportedGateways(): GatewayType[] {
  return [GatewayType.MERCADO_PAGO, GatewayType.PAGSEGURO, GatewayType.PAYPAL]
}

/**
 * Limpa o cache de instâncias (útil para testes).
 */
export function clearGatewayCache(): void {
  instances.clear()
}
