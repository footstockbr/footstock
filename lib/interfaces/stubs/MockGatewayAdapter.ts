// ============================================================================
// Foot Stock — Stub de gateway para desenvolvimento e testes (G-001)
// TODO: substituir por GatewayFactory de module-12 quando disponível
// ============================================================================

import type { IGatewayAdapter } from '../IGatewayAdapter'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export class MockGatewayAdapter implements IGatewayAdapter {
  async createCheckout(params: Parameters<IGatewayAdapter['createCheckout']>[0]) {
    // Simula redirecionamento para gateway em ambiente de desenvolvimento
    const redirectUrl = `${APP_URL}/dev/payment-success?sub=${params.subscriptionId}&plan=${params.planType}&amount=${params.amount}`
    return { redirectUrl }
  }

  async refundPayment(params: Parameters<IGatewayAdapter['refundPayment']>[0]) {
    // Simula refund bem-sucedido
    return { refundId: `mock-refund-${Date.now()}-${params.gatewayTransactionId}` }
  }

  async cancelSubscription(_params: Parameters<IGatewayAdapter['cancelSubscription']>[0]) {
    // Simula cancelamento no gateway — no-op em mock
  }
}
