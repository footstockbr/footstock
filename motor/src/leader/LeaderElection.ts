// ============================================================================
// Foot Stock Motor — Leader Election
// Redis SETNX + heartbeat + fencing token + release atômico via Lua script.
// ============================================================================

import type Redis from 'ioredis'
import type { LeaderState } from '../types/motor.types'

const LEADER_KEY = 'motor:leader'
const FENCING_KEY = 'motor:fencing-token'
const LEADER_TTL_MS = 30_000   // 30 segundos - ADR-001 (failover <= 40s com heartbeat 10s)
const HEARTBEAT_MS = 10_000    // 10 segundos

export class LeaderElection {
  private redis: Redis
  private motorId: string
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private fencingToken = 0
  private _isLeader = false
  /** Callback disparado quando a liderança é perdida durante operação. */
  onLeadershipLost?: () => void

  constructor(redis: Redis, motorId: string) {
    // Validar formato do motorId para evitar injection nos Lua scripts
    if (!/^[a-zA-Z0-9-]+$/.test(motorId)) {
      throw new Error(
        `[leader] motorId inválido: "${motorId}". Apenas alfanuméricos e hífens.`
      )
    }
    if (motorId.length > 128) {
      throw new Error('[leader] motorId muito longo (max 128 chars)')
    }
    this.redis = redis
    this.motorId = motorId
  }

  get isLeader(): boolean {
    return this._isLeader
  }

  /**
   * Tenta adquirir a liderança via SETNX.
   * Retorna true se bem-sucedido, false se outro motor já é líder.
   */
  async tryAcquire(): Promise<boolean> {
    const pipeline = this.redis.pipeline()
    pipeline.set(LEADER_KEY, this.motorId, 'PX', LEADER_TTL_MS, 'NX')
    pipeline.incr(FENCING_KEY)

    const results = await pipeline.exec()
    if (!results) return false

    const [setResult, incrResult] = results
    const acquired = setResult[1] === 'OK'

    if (acquired) {
      this.fencingToken = (incrResult[1] as number) ?? 0
      this._isLeader = true
      this.startHeartbeat()
      console.log(`[leader] Liderança adquirida. Fencing token: ${this.fencingToken}`)
    }

    return acquired
  }

  /**
   * Inicia o heartbeat para renovar o TTL da chave de liderança.
   * Heartbeat a cada 10s (TTL=30s → 3x margem).
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return

    this.heartbeatTimer = setInterval(async () => {
      try {
        const renewed = await this.renewLease()
        if (!renewed) {
          console.error('[leader] Falha ao renovar liderança! Encerrando heartbeat.')
          this._isLeader = false
          this.stopHeartbeat()
          // Notificar o engine para parar de publicar ticks
          this.onLeadershipLost?.()
        }
      } catch (err) {
        // Erro de conexão: loga mas NÃO muda isLeader — apenas quando renewLease() retorna false
        console.error('[leader] Erro no heartbeat:', err)
      }
    }, HEARTBEAT_MS)

    // .unref() garante que o timer não impede o graceful shutdown
    this.heartbeatTimer.unref?.()
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Renova o TTL da chave de liderança com atomicidade via Lua script.
   * Só renova se ainda sou o líder (compare-and-expire).
   */
  private async renewLease(): Promise<boolean> {
    const luaScript = `
      local current = redis.call('GET', KEYS[1])
      if current == ARGV[1] then
        redis.call('PEXPIRE', KEYS[1], ARGV[2])
        return 1
      end
      return 0
    `
    const result = await this.redis.eval(
      luaScript,
      1,
      LEADER_KEY,
      this.motorId,
      String(LEADER_TTL_MS)
    )
    return result === 1
  }

  /**
   * Libera a liderança (graceful shutdown).
   * Usa Lua script para garantir que só quem é líder pode liberar.
   */
  async release(): Promise<void> {
    if (!this._isLeader) return

    this.stopHeartbeat()

    const luaScript = `
      local current = redis.call('GET', KEYS[1])
      if current == ARGV[1] then
        redis.call('DEL', KEYS[1])
        return 1
      end
      return 0
    `
    const result = await this.redis.eval(luaScript, 1, LEADER_KEY, this.motorId)
    this._isLeader = false

    if (result === 1) {
      console.log('[leader] Liderança liberada.')
    } else {
      console.warn('[leader] Liderança já havia expirado ao tentar liberar.')
    }
  }

  /**
   * Retorna o estado atual da liderança.
   */
  async getState(): Promise<LeaderState> {
    const [currentLeader, ttl] = await Promise.all([
      this.redis.get(LEADER_KEY),
      this.redis.pttl(LEADER_KEY),
    ])

    return {
      isLeader: this._isLeader,
      leaderId: currentLeader ?? '',
      ttl: ttl > 0 ? ttl : 0,
      fencingToken: this.fencingToken,
    }
  }

  /**
   * Verifica se este motor ainda é o líder no Redis.
   * Útil para validação antes de operações críticas.
   */
  async isCurrentLeader(): Promise<boolean> {
    if (!this._isLeader) return false
    const current = await this.redis.get(LEADER_KEY)
    const still = current === this.motorId
    if (!still) {
      this._isLeader = false
      this.stopHeartbeat()
    }
    return still
  }
}
