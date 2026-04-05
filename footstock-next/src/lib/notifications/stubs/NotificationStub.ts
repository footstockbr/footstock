// ============================================================================
// Foot Stock — Stub de notificações (G-003)
// TODO: substituir por NotificationService real de module-19 quando disponível
// ============================================================================

export type NotificationType =
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_FAILED'
  | 'PLAN_CANCEL_ALERT'
  | 'BONUS_CREDITED'
  | 'CANCELLATION_LOCK_ACTIVE'
  | 'CANCELLATION_LOCK_LIQUIDATED'

export interface INotificationService {
  notify(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>
  ): Promise<void>
}

/** Histórico em memória para uso em testes (spy) */
const _history: Array<{ userId: string; type: NotificationType; payload: Record<string, unknown> }> = []

export const NotificationStub: INotificationService = {
  async notify(userId, type, payload) {
    _history.push({ userId, type, payload })
    if (process.env.NODE_ENV !== 'test') {
      console.log('[NOTIFICATION_STUB]', { userId, type, payload })
    }
  },
}

/** Acesso ao histórico em testes para assertions */
export const NotificationStubInspector = {
  getHistory: () => [..._history],
  clear: () => { _history.length = 0 },
  wasCalledWith: (userId: string, type: NotificationType) =>
    _history.some((e) => e.userId === userId && e.type === type),
}
