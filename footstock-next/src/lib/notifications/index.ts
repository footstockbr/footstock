// ============================================================================
// FootStock — Wiring de runtime do NotificationService (FIX-25)
// Os call sites de produção importam `notificationService` daqui.
// O stub (./stubs/NotificationStub) é adapter EXCLUSIVO de teste — nenhum call
// site de runtime o referencia (ver Task 11 > "Destino do stub").
// ============================================================================

export {
  notificationService,
  NotificationService,
} from './NotificationService'

export type {
  INotificationService,
  NotifyInput,
  NotifyResult,
  CriticalNotificationType,
} from './NotificationService'
