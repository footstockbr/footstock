// lib/repositories/NotificationRepository.ts
// module-19 — Acesso a dados de notificações + preferências via Prisma

import { prisma } from '@/lib/prisma'
import type { NotificationDTO, SendNotificationOptions, Pagination, NotificationType } from '@/types'

const NOTIFICATION_TTL_DAYS = 30
const INBOX_PAGE_SIZE = 50

// Tipos urgentes que ignoram preferências de canal
const ALWAYS_ON_TYPES = new Set<string>([
  'MARGIN_CALL_ALERT',
  'CIRCUIT_BREAKER',
  'CANCELLATION_LOCK_ACTIVE',
  'CANCELLATION_LOCK_LIQUIDATED',
  'PASSWORD_RESET',
  'ACCOUNT_DELETED',
  'BRUTE_FORCE_BLOCKED',
  'ADMIN_BROADCAST',
  'PAYMENT_FAILED',
  'ORDER_EXECUTED',
])

export class NotificationRepository {
  async findByUserId(
    userId: string,
    page: number,
    unreadOnly?: boolean,
    archived?: boolean
  ): Promise<{ data: NotificationDTO[]; pagination: Pagination }> {
    const skip = (page - 1) * INBOX_PAGE_SIZE

    const where = {
      userId,
      isArchived: archived ?? false,
      ...(unreadOnly ? { isRead: false } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: INBOX_PAGE_SIZE,
      }),
      prisma.notification.count({ where }),
    ])

    return {
      data: rows.map(this._serialize),
      pagination: {
        page,
        limit: INBOX_PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE)),
        hasNext: page * INBOX_PAGE_SIZE < total,
      },
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false, isArchived: false },
    })
  }

  async markAsRead(id: string, userId: string): Promise<NotificationDTO> {
    const notification = await prisma.notification.findUnique({ where: { id } })

    if (!notification) {
      throw Object.assign(new Error('Notificação não encontrada.'), { code: 'NOT_FOUND' })
    }
    if (notification.userId !== userId) {
      throw Object.assign(new Error('Notificação não encontrada.'), { code: 'NOT_FOUND' })
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    })

    return this._serialize(updated)
  }

  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false, isArchived: false },
      data: { isRead: true },
    })
  }

  async archive(id: string, userId: string): Promise<NotificationDTO> {
    const notification = await prisma.notification.findUnique({ where: { id } })

    if (!notification || notification.userId !== userId) {
      throw Object.assign(new Error('Notificação não encontrada.'), { code: 'NOT_FOUND' })
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isArchived: true, isRead: true },
    })

    return this._serialize(updated)
  }

  async create(options: SendNotificationOptions): Promise<NotificationDTO> {
    const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000)

    const notification = await prisma.notification.create({
      data: {
        userId: options.userId,
        type: options.type,
        title: options.title,
        body: options.body,
        data: options.metadata !== undefined ? (options.metadata as object) : undefined,
        expiresAt,
      },
    })
    return this._serialize(notification)
  }

  async deleteExpired(): Promise<number> {
    const result = await prisma.notification.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    return result.count
  }

  // ── Preferências ─────────────────────────────────────────────────────────────

  async getPreferences(userId: string): Promise<Record<string, { inApp: boolean; push: boolean; email: boolean }>> {
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId },
    })

    const result: Record<string, { inApp: boolean; push: boolean; email: boolean }> = {}
    for (const p of prefs) {
      result[p.notificationType] = {
        inApp: p.inAppEnabled,
        push: p.pushEnabled,
        email: p.emailEnabled,
      }
    }
    return result
  }

  async upsertPreference(
    userId: string,
    notificationType: string,
    channels: { inApp?: boolean; push?: boolean; email?: boolean }
  ): Promise<void> {
    // Tipos urgentes não podem ser desabilitados
    if (ALWAYS_ON_TYPES.has(notificationType)) return

    await prisma.notificationPreference.upsert({
      where: {
        userId_notificationType: { userId, notificationType },
      },
      create: {
        userId,
        notificationType,
        inAppEnabled: channels.inApp ?? true,
        pushEnabled: channels.push ?? true,
        emailEnabled: channels.email ?? true,
      },
      update: {
        ...(channels.inApp !== undefined && { inAppEnabled: channels.inApp }),
        ...(channels.push !== undefined && { pushEnabled: channels.push }),
        ...(channels.email !== undefined && { emailEnabled: channels.email }),
      },
    })
  }

  /**
   * Verifica se um canal específico está habilitado para um usuário e tipo.
   * Urgentes sempre retornam true (não podem ser desabilitados).
   */
  async isChannelEnabled(
    userId: string,
    type: NotificationType,
    channel: 'inApp' | 'push' | 'email',
    prefsCache?: Record<string, { inApp: boolean; push: boolean; email: boolean }>
  ): Promise<boolean> {
    if (ALWAYS_ON_TYPES.has(type)) return true

    const prefs = prefsCache ?? (await this.getPreferences(userId))
    const typePref = prefs[type]
    if (!typePref) return true // Default: habilitado

    return typePref[channel]
  }

  private _serialize(n: {
    id: string
    userId: string
    type: string
    title: string
    body: string
    isRead: boolean
    isArchived: boolean
    data: unknown
    createdAt: Date
    expiresAt: Date | null
  }): NotificationDTO {
    return {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.isRead,
      archived: n.isArchived,
      metadata: n.data as Record<string, unknown> | null,
      createdAt: n.createdAt.toISOString(),
      expiresAt: n.expiresAt?.toISOString() ?? null,
    }
  }
}

export const notificationRepository = new NotificationRepository()
