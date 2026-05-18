// ============================================================================
// Foot Stock Motor — AdminChannel
// Subscreve no canal motor:control e despacha ações ao MarketEngine.
// TODO: usar process.env.REDIS_URL com TLS quando NODE_ENV === 'production'
// ============================================================================

import type Redis from 'ioredis'
import type { MarketEngine } from '../engine/MarketEngine'
import { REDIS_CHANNELS } from '../types/events.types'
import type { MotorControlEvent, NewsInjectEvent } from '../types/events.types'
import { NEWS_IMPACT_DURATION_TICKS } from '../contracts/news-inject-contract'
import { logger } from '../utils/logger'

export class AdminChannel {
  private subscriber: Redis
  private engine: MarketEngine

  constructor(subscriber: Redis, engine: MarketEngine) {
    this.subscriber = subscriber
    this.engine = engine
  }

  async start(): Promise<void> {
    await this.subscriber.subscribe(REDIS_CHANNELS.MOTOR_CONTROL, REDIS_CHANNELS.NEWS_INJECT)
    this.subscriber.on('message', (channel, message) => {
      if (channel === REDIS_CHANNELS.MOTOR_CONTROL) {
        this.handleControlMessage(message)
      } else if (channel === REDIS_CHANNELS.NEWS_INJECT) {
        this.handleNewsInject(message)
      }
    })
    logger.info('[admin-channel] Subscrito em motor:control e news:inject')
  }

  async stop(): Promise<void> {
    await this.subscriber.unsubscribe(REDIS_CHANNELS.MOTOR_CONTROL, REDIS_CHANNELS.NEWS_INJECT)
  }

  private handleControlMessage(message: string): void {
    let event: MotorControlEvent
    try {
      event = JSON.parse(message) as MotorControlEvent
    } catch {
      logger.error('[admin-channel] Mensagem inválida:', message)
      return
    }

    logger.info(`[admin-channel] Recebida ação: ${event.type} | ativo: ${event.assetId ?? 'all'} | admin: ${event.adminId}`)

    switch (event.type) {
      case 'PAUSE_ASSET':
        if (event.assetId) this.engine.pauseAsset(event.assetId)
        break
      case 'RESUME_ASSET':
        if (event.assetId) this.engine.resumeAsset(event.assetId)
        break
      case 'INJECT_NEWS': {
        const payload = event.payload ?? {}
        const rawMagnitude = (payload.magnitude as number) ?? 0
        const impact = (payload.impact as string) ?? 'NEUTRAL'
        const magnitude = impact === 'NEGATIVE' ? -rawMagnitude : rawMagnitude
        const durationTicks = (payload.durationTicks as number) ?? NEWS_IMPACT_DURATION_TICKS
        if (event.assetId) {
          this.engine.injectNewsImpact(event.assetId, magnitude, durationTicks)
        }
        break
      }
      case 'ADJUST_PRICE': {
        const payload = event.payload ?? {}
        const newPrice = payload.newPrice as number
        if (event.assetId && newPrice > 0) {
          this.engine.adjustPrice(event.assetId, newPrice)
        }
        break
      }
      case 'HALT_ASSET': {
        // Admin halt individual via REST /admin/motor/halt/:ticker
        // Bloqueia processamento de preço do ativo (complementa motor:halt:{ticker} no Redis)
        if (event.assetId) {
          this.engine.pauseAsset(event.assetId)
          logger.warn(`[admin-channel] HALT_ASSET: ativo ${event.assetId} pausado por admin ${event.adminId}`)
        }
        break
      }
      case 'RELEASE_HALT': {
        // Liberação de halt individual via REST DELETE /admin/motor/halt/:ticker
        if (event.assetId) {
          this.engine.resumeAsset(event.assetId)
          logger.info(`[admin-channel] RELEASE_HALT: ativo ${event.assetId} retomado por admin ${event.adminId}`)
        }
        break
      }
      case 'HALT_ALL': {
        const halted = this.engine.haltAll()
        logger.warn(`[admin-channel] HALT_ALL recebido — ${halted} ativos pausados`)
        break
      }
      case 'RESUME_ALL': {
        const resumed = this.engine.resumeAll()
        logger.info(`[admin-channel] RESUME_ALL recebido — ${resumed} ativos retomados`)
        break
      }
      default:
        logger.warn(`[admin-channel] Tipo de ação desconhecido: ${event.type}`)
    }
  }

  private handleNewsInject(message: string): void {
    try {
      const event = JSON.parse(message) as NewsInjectEvent
      if (event.type !== 'NEWS' || !event.assetId) return

      // NewsPublisher publica com assetId = ticker; resolver para UUID interno
      const assetId = this.engine.findAssetIdByTicker(event.assetId)
      if (!assetId) {
        logger.warn(`[news-channel] Ticker não encontrado: ${event.assetId}`)
        return
      }

      this.engine.injectNewsImpact(assetId, event.magnitude, event.durationTicks)
      logger.info(
        `[news-channel] Notícia injetada: ${event.assetId} | magnitude=${event.magnitude} | ticks=${event.durationTicks}`
      )
    } catch (err) {
      logger.error(`[news-channel] Erro ao processar news:inject: ${(err as Error).message}`)
    }
  }
}
