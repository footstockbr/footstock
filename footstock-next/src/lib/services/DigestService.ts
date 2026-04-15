// lib/services/DigestService.ts
// module-19 — Digest de DIVIDEND_CREDITED: agrupa N dividendos do dia em 1 notificação
// Acumula por userId+date em Redis; cron horário consolida e envia

import { getRedisClient } from '@/lib/redis'

interface DigestItem {
  ticker: string
  value: number
  dividendType: string
}

interface DigestAccumulator {
  items: DigestItem[]
  totalValue: number
  userId: string
  date: string // YYYY-MM-DD BRT
}

const BRT_OFFSET_HOURS = 3
const DIGEST_TTL_SECONDS = 25 * 60 * 60 // 25h — cobre um dia completo

function getTodayBRT(): string {
  const now = new Date()
  const brt = new Date(now.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000)
  return brt.toISOString().slice(0, 10)
}

function digestKey(userId: string, date: string): string {
  return `dividend_digest:${userId}:${date}`
}

function pendingSetKey(): string {
  return `dividend_digest:pending`
}

class DigestService {
  /**
   * Acumula um dividendo creditado no digest do dia.
   * Se apenas 1 clube pagar no dia (verificado no cron), envia individual.
   */
  async accumulate(
    userId: string,
    ticker: string,
    value: number,
    dividendType: string
  ): Promise<void> {
    const redis = getRedisClient()
    if (!redis) return

    const date = getTodayBRT()
    const key = digestKey(userId, date)

    try {
      const raw = await redis.get(key)
      const acc: DigestAccumulator = raw
        ? (JSON.parse(raw) as DigestAccumulator)
        : { items: [], totalValue: 0, userId, date }

      acc.items.push({ ticker, value, dividendType })
      acc.totalValue = acc.items.reduce((sum, i) => sum + i.value, 0)

      await redis.set(key, JSON.stringify(acc), 'EX', DIGEST_TTL_SECONDS)
      // Registrar userId no set de pendentes para o cron encontrar
      await redis.sadd(pendingSetKey(), `${userId}:${date}`)
      await redis.expire(pendingSetKey(), DIGEST_TTL_SECONDS)
    } catch (err) {
      console.error('[DigestService] Erro ao acumular dividendo:', err)
    }
  }

  /**
   * Retorna todos os acumuladores pendentes e limpa o set.
   * Chamado pelo cron horário de digest.
   */
  async drainPending(): Promise<DigestAccumulator[]> {
    const redis = getRedisClient()
    if (!redis) return []

    try {
      const members = await redis.smembers(pendingSetKey())
      if (members.length === 0) return []

      const result: DigestAccumulator[] = []
      for (const member of members) {
        const [userId, date] = member.split(':')
        if (!userId || !date) continue
        const key = digestKey(userId, date)
        const raw = await redis.get(key)
        if (raw) {
          result.push(JSON.parse(raw) as DigestAccumulator)
          // Remover após leitura — evita reprocessamento
          await redis.del(key)
        }
      }

      // Limpar o set de pendentes
      await redis.del(pendingSetKey())
      return result
    } catch (err) {
      console.error('[DigestService] Erro ao drenar pendentes:', err)
      return []
    }
  }
}

export const digestService = new DigestService()
export type { DigestAccumulator }
