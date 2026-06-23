/**
 * Testes unitários — processRenewalReminders (D8)
 * Idempotência por claim atômico no renewalReminderSentAt.
 * Fonte: blacksmith/brainstorm-mcp/05-24-foot-stock-bugfix-tasks-ciclo-assinatura.md (task-004)
 */

jest.mock('@/lib/prisma', () => {
  const subscription = { findMany: jest.fn(), updateMany: jest.fn() }
  return { prisma: { subscription } }
})
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: jest.fn().mockResolvedValue({ notification: {}, deduped: false }) },
}))

import { processRenewalReminders } from '@/lib/jobs/subscription-expiry'
import { prisma } from '@/lib/prisma'
import { notificationService } from '@/lib/notifications'

const sub = prisma.subscription as unknown as Record<string, jest.Mock>
const notify = notificationService.notify as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

function upcomingSub() {
  return {
    id: 's1',
    userId: 'u1',
    planType: 'CRAQUE',
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  }
}

describe('processRenewalReminders — D8', () => {
  it('só busca assinaturas com renewalReminderSentAt null', async () => {
    sub.findMany.mockResolvedValue([])
    await processRenewalReminders()
    expect(sub.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ renewalReminderSentAt: null, status: 'ACTIVE' }),
      })
    )
  })

  it('claim vencedor (count=1) notifica e marca renewalReminderSentAt', async () => {
    sub.findMany.mockResolvedValue([upcomingSub()])
    sub.updateMany.mockResolvedValue({ count: 1 })

    const res = await processRenewalReminders()

    expect(sub.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 's1',
          status: 'ACTIVE',
          renewalReminderSentAt: null,
        }),
        data: expect.objectContaining({ renewalReminderSentAt: expect.any(Date) }),
      })
    )
    expect(notify).toHaveBeenCalledTimes(1)
    expect(res.processed).toBe(1)
  })

  it('claim perdido (count=0, outro processo já reivindicou) NÃO notifica', async () => {
    sub.findMany.mockResolvedValue([upcomingSub()])
    sub.updateMany.mockResolvedValue({ count: 0 })

    const res = await processRenewalReminders()

    expect(notify).not.toHaveBeenCalled()
    expect(res.processed).toBe(0)
  })
})
