// ============================================================================
// FootStock — gateways de pagamento oferecidos no seletor de checkout
// ----------------------------------------------------------------------------
// Fonte unica de verdade do que o seletor de pagamento expoe ao cliente.
//
// CORRECAO (modal de assinatura): o seletor antigo listava ['MERCADO_PAGO',
// 'PIX']. "PIX" NAO e um gateway — e um metodo de pagamento DENTRO do Mercado
// Pago (o proprio checkout hospedado do MP ja oferece PIX). Lista-lo como uma
// segunda entrada "Pix (Mercado Pago)" duplicava o Mercado Pago e confundia o
// usuario. O seletor agora oferece as 3 PLATAFORMAS reais de pagamento:
// Mercado Pago, PagSeguro e PayPal.
//
// SEGURANCA (heranca da FIX-19): oferecer um gateway sem credenciais cria uma
// Subscription PENDING orfa + devolve DECLINED ao cliente (PlanService cria a
// PENDING antes de chamar o gateway; gateway sem credencial lanca PAYMENT_053).
// Por isso o conjunto efetivamente oferecido NAO e mais uma constante estatica:
// e resolvido em runtime a partir das credenciais presentes
// (ver lib/payments/enabled-gateways.server.ts) e passado as UIs como prop /
// via /api/v1/payments/gateways. Assim um gateway so aparece quando esta
// efetivamente configurado, e os 3 aparecem quando os 3 estao configurados.
// ============================================================================

export type CheckoutGateway = 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL'

// Rotulos exibidos no seletor. Ordem canonica de exibicao em ALL_CHECKOUT_GATEWAYS.
export const CHECKOUT_GATEWAY_LABELS: Record<CheckoutGateway, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  PAGSEGURO: 'PagSeguro',
  PAYPAL: 'PayPal',
}

// Todas as plataformas conhecidas, na ordem de exibicao preferida.
export const ALL_CHECKOUT_GATEWAYS: readonly CheckoutGateway[] = [
  'MERCADO_PAGO',
  'PAGSEGURO',
  'PAYPAL',
]

// Gateway default quando ha >= 1 habilitado e nenhuma preferencia: o primeiro
// habilitado (a chamada concreta resolve a partir da lista efetiva em runtime).
export const DEFAULT_CHECKOUT_GATEWAY: CheckoutGateway = 'MERCADO_PAGO'

export function isKnownCheckoutGateway(value: string): value is CheckoutGateway {
  return (ALL_CHECKOUT_GATEWAYS as readonly string[]).includes(value)
}

/**
 * Monta as opcoes do <select> a partir da lista de gateways HABILITADOS
 * (resolvida em runtime conforme credenciais presentes). Preserva a ordem
 * canonica de ALL_CHECKOUT_GATEWAYS independente da ordem recebida.
 */
export function getCheckoutGatewayOptions(
  enabled: readonly CheckoutGateway[],
): Array<{ value: CheckoutGateway; label: string }> {
  return ALL_CHECKOUT_GATEWAYS.filter((gateway) => enabled.includes(gateway)).map((gateway) => ({
    value: gateway,
    label: CHECKOUT_GATEWAY_LABELS[gateway],
  }))
}
