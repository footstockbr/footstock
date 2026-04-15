// lib/services/NotificationQueueService.ts
// module-19 — Fila Redis para notificações em quiet hours (23h-7h BRT)
// Cron de 07:00 BRT processa e despacha notificações enfileiradas

import { getRedisClient } from '@/lib/redis'
import type { SendNotificationOptions } from '@/types'

const QUEUE_KEY = 'notification_queue'
const QUEUE_TTL_SECONDS = 24 * 60 * 60 // 24h — TTL de segurança para itens não processados

interface QueueItem extends SendNotificationOptions {
  queuedAt: string
  scheduledFor: string
}

class NotificationQueueService {
  /**
   * Enfileira uma notificação para envio após as 07:00 BRT.
   */
  async enqueue(options: SendNotificationOptions, scheduledFor: Date): Promise<void> {
    const redis = getRedisClient()
    if (!redis) {
      console.warn('[NotificationQueueService] Redis indisponível — notificação descartada da fila:', options.type)
      return
    }

    const item: QueueItem = {
      ...options,
      queuedAt: new Date().toISOString(),
      scheduledFor: scheduledFor.toISOString(),
    }

    try {
      await redis.lpush(QUEUE_KEY, JSON.stringify(item))
      await redis.expire(QUEUE_KEY, QUEUE_TTL_SECONDS)
    } catch (err) {
      console.error('[NotificationQueueService] Erro ao enfileirar:', err)
    }
  }

  /**
   * Retira e retorna todos os itens pendentes da fila.
   * Usado pelo cron de 07:00 BRT.
   */
  async drainQueue(): Promise<QueueItem[]> {
    const redis = getRedisClient()
    if (!redis) return []

    try {
      const items: QueueItem[] = []
      // LMPOP não disponível em todos os providers — usar loop com RPOP
      let raw: string | null
      do {
        raw = await redis.rpop(QUEUE_KEY)
        if (raw) {
          try {
            items.push(JSON.parse(raw) as QueueItem)
          } catch {
            console.warn('[NotificationQueueService] Item inválido na fila, ignorado')
          }
        }
      } while (raw)
      return items
    } catch (err) {
      console.error('[NotificationQueueService] Erro ao drenar fila:', err)
      return []
    }
  }

  async queueLength(): Promise<number> {
    const redis = getRedisClient()
    if (!redis) return 0
    try {
      return await redis.llen(QUEUE_KEY)
    } catch {
      return 0
    }
  }
}

export const notificationQueueService = new NotificationQueueService()
