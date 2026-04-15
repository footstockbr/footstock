// ============================================================================
// Foot Stock — PriceBuffer (T-022)
// Buffer Redis de cotações por ativo, indexado por timestamp.
// Permite consulta de preço histórico com delay por plano.
//
// Arquitetura:
// - ZSET `price:buffer:{TICKER}` com score = timestamp (ms) e member = JSON
// - TTL: 65 minutos (cobre delay max de 60min com margem de segurança)
// - getDelayed usa ZREVRANGEBYSCORE para pegar o tick mais recente antes do alvo
// - ingest é atômico via Lua (zadd + pexpire + prune em uma operação)
// ============================================================================

import { getRedisClient } from '@/lib/redis'

const TTL_MS = 65 * 60 * 1000 // 65 minutos
const PRUNE_WINDOW_MS = 65 * 60 * 1000 // apaga entradas mais antigas que 65 min

// Lua script atômico: ZADD + PEXPIRE + ZREMRANGEBYSCORE
const INGEST_LUA = `
local key     = KEYS[1]
local score   = tonumber(ARGV[1])
local member  = ARGV[2]
local ttl_ms  = tonumber(ARGV[3])
local prune_ts = tonumber(ARGV[4])
redis.call('ZADD', key, score, member)
redis.call('PEXPIRE', key, ttl_ms)
redis.call('ZREMRANGEBYSCORE', key, '-inf', prune_ts)
return redis.call('ZCARD', key)
`

export interface PriceEntry {
  ticker: string
  price: number
  timestamp: number
}

export class PriceBuffer {
  static zsetKey(ticker: string): string {
    return `price:buffer:${ticker.trim().toUpperCase()}`
  }

  /**
   * Ingere um tick no buffer Redis de forma atômica.
   * Opera via Lua: ZADD + PEXPIRE + prune de entradas antigas.
   * Falha silenciosamente se Redis não estiver disponível.
   */
  static async ingest(ticker: string, price: number, timestamp: number): Promise<void> {
    const redis = getRedisClient()
    if (!redis) return

    const normalizedTicker = ticker.trim().toUpperCase()
    const key = this.zsetKey(normalizedTicker)
    const pruneTs = Date.now() - PRUNE_WINDOW_MS

    // Membro único: score=timestamp, member=JSON com ticker+price+ts
    // Se o mesmo timestamp já existir, o ZADD é no-op (mesmo score+member)
    const member = JSON.stringify({ ticker: normalizedTicker, price, timestamp })

    try {
      await redis.eval(
        INGEST_LUA,
        1,
        key,
        String(timestamp),
        member,
        String(TTL_MS),
        String(pruneTs)
      )
    } catch (err) {
      // Buffer indisponível: não bloqueia o fluxo normal
      console.warn('[PriceBuffer] ingest error for', normalizedTicker, err instanceof Error ? err.message : err)
    }
  }

  /**
   * Retorna o preço mais recente disponível no buffer com timestamp <= (now - delayMs).
   * Usa ZREVRANGEBYSCORE para pegar o ÚLTIMO tick elegível (score mais alto ≤ targetTs).
   *
   * Retorna null se:
   * - Redis indisponível
   * - Buffer vazio (sistema recém-iniciado ou após restart)
   * - Não há tick suficientemente antigo (buffer ainda aquecendo)
   */
  static async getDelayed(ticker: string, delayMs: number): Promise<number | null> {
    const redis = getRedisClient()
    if (!redis) return null

    const normalizedTicker = ticker.trim().toUpperCase()
    const targetTs = Date.now() - delayMs

    try {
      const results = await redis.zrevrangebyscore(
        this.zsetKey(normalizedTicker),
        targetTs,   // max score (inclusive)
        '-inf',     // min score
        'LIMIT',
        0,
        1           // apenas o mais recente elegível
      )

      if (!results.length) return null

      const parsed = JSON.parse(results[0]) as { price?: unknown }
      return typeof parsed.price === 'number' ? parsed.price : null
    } catch (err) {
      console.warn('[PriceBuffer] getDelayed error for', normalizedTicker, err instanceof Error ? err.message : err)
      return null
    }
  }

  /**
   * Informa se o buffer já tem dados suficientes para um determinado delay.
   * Útil para decidir se deve enviar evento `buffering` ou preço atrasado.
   */
  static async hasDataForDelay(ticker: string, delayMs: number): Promise<boolean> {
    const price = await this.getDelayed(ticker, delayMs)
    return price !== null
  }

  /**
   * Retorna todos os preços do buffer para inspeção/diagnóstico.
   * Não usar em produção para tickers com histórico denso.
   */
  static async debugDump(ticker: string): Promise<PriceEntry[]> {
    const redis = getRedisClient()
    if (!redis) return []

    try {
      const results = await redis.zrangebyscore(
        this.zsetKey(ticker.trim().toUpperCase()),
        '-inf',
        '+inf',
        'WITHSCORES'
      )
      const entries: PriceEntry[] = []
      for (let i = 0; i < results.length; i += 2) {
        try {
          const parsed = JSON.parse(results[i]) as PriceEntry
          entries.push(parsed)
        } catch { /* membro malformado */ }
      }
      return entries
    } catch {
      return []
    }
  }
}
