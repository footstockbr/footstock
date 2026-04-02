// lib/repositories/NotificationRepository.ts
// module-19 — Acesso a dados de notificações via Prisma

import { prisma } from '@/lib/prisma'
import type { NotificationDTO, SendNotificationOptions, Pagination } from '@/types'

export class NotificationRepository {
  async findByUserId(
    userId: string,
    page: number,
    unreadOnly?: boolean
  ): Promise<{ data: NotificationDTO[]; pagination: Pagination }> {
    const limit = 20
    const skip = (page - 1) * limit

    const where = {
      userId,
      ...(unreadOnly ? { read: false } : {}),
    }

    const [rows, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ])

    return {
      data: rows.map(this._serialize),
      pagination: { page, limit, total, hasNext: page * limit < total },
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, read: false } })
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
      data: { read: true },
    })

    return this._serialize(updated)
  }

  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })
  }

  async create(options: SendNotificationOptions): Promise<NotificationDTO> {
    const notification = await prisma.notification.create({
      data: {
        userId: options.userId,
        type: options.type,
        title: options.title,
        body: options.body,
        metadata: options.metadata !== undefined ? (options.metadata as object) : undefined,
      },
    })
    return this._serialize(notification)
  }

  private _serialize(n: {
    id: string
    userId: string
    type: string
    title: string
    body: string
    read: boolean
    metadata: unknown
    createdAt: Date
  }): NotificationDTO {
    return {
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      metadata: n.metadata as Record<string, unknown> | null,
      createdAt: n.createdAt.toISOString(),
    }
  }
}

export const notificationRepository = new NotificationRepository()
