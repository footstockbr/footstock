// TODO: Implementar via /auto-flow execute

export class PaymentService {
  async createCheckout(_userId: string, _planType: string, _gateway: string, _period: string): Promise<void> {
    throw new Error('Not implemented - run /auto-flow execute')
  }

  async processWebhook(_gatewayTransactionId: string, _status: string, _metadata: unknown): Promise<void> {
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const paymentService = new PaymentService()
