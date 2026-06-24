// ============================================================================
// FootStock — resolucao em runtime dos gateways de checkout HABILITADOS
// ----------------------------------------------------------------------------
// SERVER-ONLY: importa `env` (credenciais) e por isso NUNCA pode ser importado
// por um client component. Consumidores client usam /api/v1/payments/gateways
// (+ hook useCheckoutGateways); consumidores server (ex.: pagina /planos)
// chamam resolveEnabledCheckoutGateways() direto e passam como prop.
//
// Um gateway so e oferecido ao cliente quando TODAS as suas credenciais
// obrigatorias estao presentes. Isso impede o bug de origem (FIX-19): oferecer
// um gateway sem credencial cria uma Subscription PENDING orfa e devolve
// DECLINED. O mesmo mapa de credenciais e usado pelo gate de boot em env.ts
// (FIX-24), mantendo uma unica definicao de "o que torna um gateway utilizavel".
// ============================================================================

import 'server-only'

import { env } from '@/lib/env'
import {
  ALL_CHECKOUT_GATEWAYS,
  type CheckoutGateway,
} from '@/lib/constants/checkout-gateways'

// Credenciais obrigatorias por gateway (espelha env.ts FIX-24). Um gateway esta
// "configurado" quando todos os valores abaixo estao presentes e nao-vazios.
function requiredCredentials(gateway: CheckoutGateway): Array<string | undefined> {
  switch (gateway) {
    case 'MERCADO_PAGO':
      return [env.MERCADO_PAGO_ACCESS_TOKEN, env.MERCADO_PAGO_WEBHOOK_SECRET]
    case 'PAGSEGURO':
      return [env.PAGSEGURO_TOKEN, env.PAGSEGURO_WEBHOOK_SECRET]
    case 'PAYPAL':
      return [env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET, env.PAYPAL_WEBHOOK_ID]
  }
}

export function isCheckoutGatewayConfigured(gateway: CheckoutGateway): boolean {
  return requiredCredentials(gateway).every((value) => Boolean(value && value.trim()))
}

/**
 * Lista, na ordem canonica, os gateways efetivamente oferecidos ao cliente.
 * Retorna apenas os que possuem credenciais completas. Pode retornar [] quando
 * nenhum gateway esta configurado — a UI trata esse caso como "pagamento
 * temporariamente indisponivel" (Zero Silencio), nunca como select vazio mudo.
 */
export function resolveEnabledCheckoutGateways(): CheckoutGateway[] {
  return ALL_CHECKOUT_GATEWAYS.filter(isCheckoutGatewayConfigured)
}
