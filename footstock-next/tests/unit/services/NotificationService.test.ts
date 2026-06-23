/**
 * Testes unitários — NotificationService real (FIX-25)
 * Asserção de ENTREGA: registro persistido + tentativa de email rastreável
 * (email_status/email_provider_id/email_error), não só histórico em memória.
 * Cobre cada tipo crítico da tabela "Tipos críticos" + idempotência + falha de email.
 * Fonte: blacksmith/loop-archives/06-22-footstock-financeiro-planos (Task 11).
 *
 * Nota: o arquivo vive em tests/ (não __tests__/) porque o jest.config testMatch
 * só varre tests/** — manter o teste executável é parte do aceite (Zero Fluxos Incompletos).
 */

jest.mock('@/lib/prisma', () => {
  const notification = { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() }
  const user = { findUnique: jest.fn() }
  const notificationPreference = { findUnique: jest.fn() }
  return { prisma: { notification, user, notificationPreference } }
})
jest.mock('@/lib/services/EmailNotificationService', () => ({
  emailNotificationService: { sendForTypeResult: jest.fn() },
}))

import { NotificationService } from '@/lib/notifications/NotificationService'
import { prisma } from '@/lib/prisma'
import { emailNotificationService } from '@/lib/services/EmailNotificationService'
import { Prisma } from '@prisma/client'

const notification = prisma.notification as unknown as Record<string, jest.Mock>
const user = prisma.user as unknown as Record<string, jest.Mock>
const notificationPreference = prisma.notificationPreference as unknown as Record<string, jest.Mock>
const sendEmail = emailNotificationService.sendForTypeResult as jest.Mock

const service = new NotificationService()

const VERIFIED_USER = { id: 'u1', email: 'jogador@footstock.app', emailVerified: new Date(0) }
const UNVERIFIED_USER = { id: 'u2', email: 'novo@footstock.app', emailVerified: null }

beforeEach(() => {
  jest.clearAllMocks()
  user.findUnique.mockResolvedValue(VERIFIED_USER)
  notificationPreference.findUnique.mockResolvedValue(null)
  // create ecoa o data + id; update mescla.
  notification.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'n1', isRead: false, isArchived: false, ...data })
  )
  notification.update.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
    Promise.resolve({ id: where.id, ...data })
  )
  sendEmail.mockResolvedValue({ status: 'sent', providerId: 're_123' })
})

describe('NotificationService — entrega de eventos críticos (FIX-25)', () => {
  it('pagamento_confirmado (user verificado): persiste PAYMENT_CONFIRMED + email sent + provider id', async () => {
    const res = await service.notify({
      type: 'pagamento_confirmado',
      userId: 'u1',
      entityId: 'sub-100',
      payload: { planType: 'CRAQUE', amount: 1990 },
    })

    // Persist-first: cria com idempotencyKey e email_status inicial 'pending'.
    expect(notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'PAYMENT_CONFIRMED',
          userId: 'u1',
          emailStatus: 'pending',
          idempotencyKey: expect.any(String),
        }),
      })
    )
    // Email tentado para o tipo Prisma + endereço do usuário.
    expect(sendEmail).toHaveBeenCalledWith('PAYMENT_CONFIRMED', VERIFIED_USER.email, expect.any(Object))
    // Sucesso => email_status 'sent' + provider id (nunca sent sem provider).
    expect(notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailStatus: 'sent', emailProviderId: 're_123' } })
    )
    expect(res.deduped).toBe(false)
    expect(res.notification.emailStatus).toBe('sent')
  })

  it('pagamento_confirmado (user NÃO verificado): persiste mas email_status na, sem email', async () => {
    user.findUnique.mockResolvedValue(UNVERIFIED_USER)

    const res = await service.notify({ type: 'pagamento_confirmado', userId: 'u2', entityId: 'sub-200' })

    expect(notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailStatus: 'na' }) })
    )
    expect(sendEmail).not.toHaveBeenCalled()
    expect(res.deduped).toBe(false)
  })

  it('pagamento_recusado: canal ambos, email enviado quando verificado', async () => {
    await service.notify({ type: 'pagamento_recusado', userId: 'u1', entityId: 'sub-1:attempt-2' })
    expect(notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'PAYMENT_FAILED', emailStatus: 'pending' }) })
    )
    expect(sendEmail).toHaveBeenCalledWith('PAYMENT_FAILED', VERIFIED_USER.email, expect.any(Object))
  })

  it('bonus_creditado: canal apenas persistência — email_status na e NENHUM email', async () => {
    const res = await service.notify({
      type: 'bonus_creditado',
      userId: 'u1',
      entityId: 'bonus-9',
      payload: { amount: 500 },
    })
    expect(notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'BONUS_CREDITED', emailStatus: 'na' }) })
    )
    expect(sendEmail).not.toHaveBeenCalled()
    expect(res.notification.emailStatus).toBe('na')
  })

  it('reembolso_processado: persiste REFUND_PROCESSED + email quando verificado', async () => {
    await service.notify({ type: 'reembolso_processado', userId: 'u1', entityId: 'refund-7', payload: { amount: 49.9 } })
    expect(notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'REFUND_PROCESSED', emailStatus: 'pending' }) })
    )
    expect(sendEmail).toHaveBeenCalledWith('REFUND_PROCESSED', VERIFIED_USER.email, expect.any(Object))
  })

  it('assinatura_expirando SEM period: erro determinista (occurrence_marker do ciclo)', async () => {
    await expect(
      service.notify({ type: 'assinatura_expirando', userId: 'u1', entityId: 'sub-1:renewal' })
    ).rejects.toThrow(/period/)
    expect(notification.create).not.toHaveBeenCalled()
  })

  it('assinatura_expirando: respeita opt-out transacional (emailEnabled=false) => na, sem email', async () => {
    notificationPreference.findUnique.mockResolvedValue({ emailEnabled: false })
    await service.notify({ type: 'assinatura_expirando', userId: 'u1', entityId: 'sub-1:renewal', period: '2026-07' })
    expect(notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'PLAN_CANCEL_ALERT', emailStatus: 'na' }) })
    )
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('assinatura_expirada: NÃO respeita opt-out (fato consumado) — email enviado se verificado', async () => {
    notificationPreference.findUnique.mockResolvedValue({ emailEnabled: false })
    await service.notify({ type: 'assinatura_expirada', userId: 'u1', entityId: 'sub-1:expired', period: '2026-07' })
    expect(sendEmail).toHaveBeenCalledWith('PLAN_CANCEL_ALERT', VERIFIED_USER.email, expect.any(Object))
  })

  it('idempotência: conflito de unique (P2002) retorna existente com deduped=true, sem re-email', async () => {
    const existing = { id: 'n-existing', type: 'PAYMENT_CONFIRMED', emailStatus: 'sent' }
    notification.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7.6.0' })
    )
    notification.findUnique.mockResolvedValue(existing)

    const res = await service.notify({ type: 'pagamento_confirmado', userId: 'u1', entityId: 'sub-100' })

    expect(res.deduped).toBe(true)
    expect(res.notification).toBe(existing)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(notification.update).not.toHaveBeenCalled()
  })

  it('falha de email: persistência permanece válida, email_status failed + email_error rastreável', async () => {
    sendEmail.mockResolvedValue({ status: 'failed', error: 'Resend 500' })
    const res = await service.notify({ type: 'pagamento_confirmado', userId: 'u1', entityId: 'sub-300' })

    expect(notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailStatus: 'failed', emailError: 'Resend 500' }) })
    )
    expect(res.deduped).toBe(false) // entrega in-app não depende do email
  })

  it('estado parcial proibido: provider sem id NÃO marca sent (vira failed rastreável)', async () => {
    sendEmail.mockResolvedValue({ status: 'sent', providerId: undefined })
    await service.notify({ type: 'pagamento_confirmado', userId: 'u1', entityId: 'sub-400' })
    expect(notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailStatus: 'failed' }) })
    )
  })

  it('idempotency_key é determinística: mesma entrada => mesma chave', async () => {
    const input = { type: 'reembolso_processado' as const, userId: 'u1', entityId: 'refund-42' }
    await service.notify(input)
    const key1 = notification.create.mock.calls[0][0].data.idempotencyKey
    notification.create.mockClear()
    await service.notify(input)
    const key2 = notification.create.mock.calls[0][0].data.idempotencyKey
    expect(key1).toBe(key2)
    expect(key1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
