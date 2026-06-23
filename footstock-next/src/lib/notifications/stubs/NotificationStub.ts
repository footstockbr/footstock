// ============================================================================
// FootStock — NotificationStub: adapter EXCLUSIVO de teste (FIX-25)
// Antes: fallback de produção (G-003, histórico em memória). Agora: rebaixado a
// adapter de teste. Implementa a MESMA interface INotificationService do serviço
// real, SEM efeitos colaterais (não persiste, não envia email). Nenhum call site
// de runtime referencia este módulo — o wiring de produção aponta para
// `notificationService` em '@/lib/notifications'.
// ============================================================================

import type {
  INotificationService,
  NotifyInput,
  NotifyResult,
} from '@/lib/notifications/NotificationService'
import type { Notification } from '@prisma/client'

interface StubEntry extends NotifyInput {
  deduped: boolean
}

/** Histórico em memória para assertions de teste (spy). */
const _history: StubEntry[] = []

/** Chaves já vistas para simular o no-op idempotente sem banco. */
const _seenKeys = new Set<string>()

function occurrenceKey(input: NotifyInput): string {
  const marker = input.period ? `${input.entityId}:${input.period}` : input.entityId
  return `${input.type}:${input.entityId}:${marker}`
}

/**
 * Adapter de teste. Constrói uma Notification sintética (sem tocar o banco) e
 * espelha a semântica de dedupe da interface real.
 */
export const NotificationStub: INotificationService = {
  async notify(input: NotifyInput): Promise<NotifyResult> {
    const key = occurrenceKey(input)
    const deduped = _seenKeys.has(key)
    _seenKeys.add(key)
    _history.push({ ...input, deduped })

    const notification = {
      id: `stub-${key}`,
      userId: input.userId,
      type: input.type,
      title: typeof input.payload?.title === 'string' ? (input.payload.title as string) : input.type,
      body: typeof input.payload?.body === 'string' ? (input.payload.body as string) : '',
      data: (input.payload ?? null),
      isRead: false,
      isArchived: false,
      createdAt: new Date(0),
      expiresAt: null,
      idempotencyKey: key,
      emailStatus: 'na',
      emailProviderId: null,
      emailError: null,
    } as unknown as Notification

    return { notification, deduped }
  },
}

/** Acesso ao histórico em testes para assertions. */
export const NotificationStubInspector = {
  getHistory: () => [..._history],
  clear: () => {
    _history.length = 0
    _seenKeys.clear()
  },
  wasCalledWith: (userId: string, type: NotifyInput['type']) =>
    _history.some((e) => e.userId === userId && e.type === type),
}
