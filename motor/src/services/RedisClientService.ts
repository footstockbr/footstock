// ============================================================================
// Foot Stock Motor — Redis Client Service (motor standalone)
// Publisher e Subscriber separados conforme exigido pelo protocolo Redis.
// TODO: usar process.env.REDIS_URL com TLS quando NODE_ENV === 'production'
// ============================================================================

import Redis from 'ioredis'
import { logger } from '../utils/logger'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const REDIS_TLS = process.env.REDIS_TLS === 'true'

function buildRedisOptions(): Redis['options'] {
  const opts: Redis['options'] = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  }
  if (REDIS_TLS) {
    opts.tls = {}
  }
  return opts
}

export class RedisClientService {
  private static instance: Redis | null = null

  static async getInstance(): Promise<Redis> {
    if (!RedisClientService.instance) {
      RedisClientService.instance = new Redis(REDIS_URL, buildRedisOptions())

      RedisClientService.instance.on('error', err => {
        logger.error('[motor:redis] Erro:', err.message)
      })

      RedisClientService.instance.on('connect', () => {
        logger.info('[motor:redis] Conectado')
      })
    }
    return RedisClientService.instance
  }

  /**
   * Cria um novo cliente Redis para uso como SUBSCRIBER.
   * Subscriber precisa de conexão separada — nunca reutilizar o publisher.
   * TODO: usar process.env.REDIS_URL com TLS quando NODE_ENV === 'production'
   */
  static createSubscriber(): Redis {
    const sub = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      ...(REDIS_TLS ? { tls: {} } : {}),
    })
    sub.on('error', err => {
      logger.error('[motor:redis:subscriber] Erro:', err.message)
    })
    return sub
  }
}
