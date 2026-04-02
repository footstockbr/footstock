// ============================================================================
// Foot Stock — Interface de desacoplamento de gateways de pagamento (G-001)
// Permite que module-11 seja desenvolvido e testado sem depender de module-12
// ============================================================================

export interface IGatewayAdapter {
  /**
   * Cria uma intenção de checkout e retorna a URL de redirect para o gateway externo.
   * Dados de cartão NUNCA passam por esta interface — somente metadados do pedido.
   */
  createCheckout(params: {
    planType: string
    period: 'monthly' | 'yearly'
    amount: number  // centavos Int — ex: 1990 = R$19,90
    subscriptionId: string
    successUrl: string
    failureUrl: string
    userId: string
  }): Promise<{ redirectUrl: string }>

  /**
   * Solicita reembolso de um pagamento já processado.
   * Apenas metadados são enviados — sem dados sensíveis.
   */
  refundPayment(params: {
    gatewayTransactionId: string
    amount: number  // centavos Int
    reason: string
  }): Promise<{ refundId: string }>

  /**
   * Cancela assinatura recorrente no gateway externo.
   */
  cancelSubscription(params: {
    gatewayTransactionId: string
  }): Promise<void>
}
