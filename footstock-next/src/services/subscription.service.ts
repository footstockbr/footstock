// TODO: Implementar via /auto-flow execute

export class SubscriptionService {
  async findActive(_userId: string): Promise<unknown | null> {
    return null
  }

  async cancel(_subscriptionId: string, _userId: string): Promise<void> {
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const subscriptionService = new SubscriptionService()
