// lib/repositories/PushSubscriptionRepository.ts
// module-19 — CRUD de push subscriptions via Prisma

import { prisma } from '@/lib/prisma'

export interface PushSubscriptionData {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
  active: boolean
  createdAt: string
}

export class PushSubscriptionRepository {
  async findByUserId(userId: string): Promise<PushSubscriptionData[]> {
    const rows = await prisma.pushSubscription.findMany({
      where: { userId, active: true },
    })
    return rows.map(this._serialize)
  }

  async upsert(
    userId: string,
    data: { endpoint: string; p256dh: string; auth: string; userAgent?: string }
  ): Promise<void> {
    await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      update: {
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent,
        active: true,
      },
      create: {
        userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        userAgent: data.userAgent,
      },
    })
  }

  async deleteByEndpoint(userId: string, endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    })
  }

  private _serialize(s: {
    id: string
    userId: string
    endpoint: string
    p256dh: string
    auth: string
    userAgent: string | null
    active: boolean
    createdAt: Date
  }): PushSubscriptionData {
    return {
      id: s.id,
      userId: s.userId,
      endpoint: s.endpoint,
      p256dh: s.p256dh,
      auth: s.auth,
      userAgent: s.userAgent,
      active: s.active,
      createdAt: s.createdAt.toISOString(),
    }
  }
}

export const pushSubscriptionRepository = new PushSubscriptionRepository()
