// ============================================================================
// FootStock — FIX-19: gateways oferecidos no seletor de checkout ao cliente
// ----------------------------------------------------------------------------
// DEFAULT de menor risco (auditoria financeira 06-22, decisao D10 "default
// seguro"): o seletor de pagamento oferece APENAS gateways efetivamente
// configurados e validados. PagSeguro e PayPal ficam FORA da lista ate que
// (1) suas credenciais (env PAGSEGURO_*/PAYPAL_*) estejam configuradas e
// (2) seus fluxos sejam validados. Enquanto isso, selecionar um deles criaria
// uma Subscription PENDING orfa e devolveria DECLINED ao cliente (ver
// PlanService.createCheckout: cria PENDING antes de chamar o gateway, e o
// gateway nao configurado lanca PAYMENT_053 -> DECLINED, deixando a PENDING).
// Em producao o gateway ativo e o Mercado Pago (PIX tambem via MP).
//
// Re-habilitar PagSeguro/PayPal exige, nesta ordem: configurar as credenciais
// e adicionar o codigo a ENABLED_CHECKOUT_GATEWAYS abaixo. Esta lista e a fonte
// unica de verdade do que o seletor oferece (consumida por CheckoutButton.tsx).
// ============================================================================

export type CheckoutGateway = 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL' | 'PIX'

// Rotulos de TODOS os gateways conhecidos (inclui os desabilitados, para
// completude de tipo e para reabilitar trocando apenas ENABLED_CHECKOUT_GATEWAYS).
export const CHECKOUT_GATEWAY_LABELS: Record<CheckoutGateway, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  PAGSEGURO: 'PagSeguro',
  PAYPAL: 'PayPal',
  PIX: 'Pix (Mercado Pago)',
}

// Gateways efetivamente oferecidos ao cliente. A ordem define a ordem de exibicao.
export const ENABLED_CHECKOUT_GATEWAYS: readonly CheckoutGateway[] = ['MERCADO_PAGO', 'PIX']

// Gateway default do seletor — garantidamente habilitado (primeiro da lista).
export const DEFAULT_CHECKOUT_GATEWAY: CheckoutGateway = ENABLED_CHECKOUT_GATEWAYS[0]

export function isCheckoutGatewayEnabled(gateway: CheckoutGateway): boolean {
  return ENABLED_CHECKOUT_GATEWAYS.includes(gateway)
}

export function getEnabledCheckoutGatewayOptions(): Array<{ value: CheckoutGateway; label: string }> {
  return ENABLED_CHECKOUT_GATEWAYS.map((gateway) => ({
    value: gateway,
    label: CHECKOUT_GATEWAY_LABELS[gateway],
  }))
}
