// TODO: Implementar via /auto-flow execute

export class NotificationService {
  async findAll(_userId: string, _read?: boolean): Promise<unknown[]> {
    return []
  }

  async countUnread(_userId: string): Promise<number> {
    return 0
  }

  async markAsRead(_notificationId: string, _userId: string): Promise<void> {
    throw new Error('Not implemented - run /auto-flow execute')
  }
}

export const notificationService = new NotificationService()
