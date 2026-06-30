// ============================================================================
// FootStock Motor — AdminChannel
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
        // handleControlMessage e async (HALT_ALL/RESUME_ALL persistem no DB); o
        // callback do subscriber e sync, entao descartamos a promise explicitamente.
        // Erros sao tratados internamente (try/catch por acao) para evitar rejeicao
        // nao capturada.
        void this.handleControlMessage(message)
      } else if (channel === REDIS_CHANNELS.NEWS_INJECT) {
        this.handleNewsInject(message)
      }
    })
    logger.info('[admin-channel] Subscrito em motor:control e news:inject')
  }

  async stop(): Promise<void> {
    await this.subscriber.unsubscribe(REDIS_CHANNELS.MOTOR_CONTROL, REDIS_CHANNELS.NEWS_INJECT)
  }

  private async handleControlMessage(message: string): Promise<void> {
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
        // Sem reason o tick de halt cai no fallback 'CIRCUIT_BREAKER' e a UI
        // mente sobre o motivo da pausa. Propagar o motivo real do admin.
        if (event.assetId) this.engine.pauseAsset(event.assetId, event.reason ?? 'PAUSE_ASSET')
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
          this.engine.injectNewsImpact(event.assetId, magnitude, durationTicks, {
            newsId: typeof payload.newsId === 'string' ? payload.newsId : undefined,
            // Injecao manual sem title usa o motivo do admin: a atribuicao passa
            // a nomear a intervencao real em vez de "noticia ativa" anonima.
            title: typeof payload.title === 'string'
              ? payload.title
              : typeof event.reason === 'string' ? event.reason : undefined,
            source: typeof payload.source === 'string' ? payload.source : 'admin',
            impactCategory: typeof payload.impactCategory === 'string' ? payload.impactCategory : undefined,
            sentiment: typeof payload.sentiment === 'number' || typeof payload.sentiment === 'string' ? payload.sentiment : undefined,
            publishedAt: typeof payload.publishedAt === 'string' ? payload.publishedAt : undefined,
            correlationId: event.correlationId ?? (typeof payload.correlationId === 'string' ? payload.correlationId : undefined),
          })
        }
        break
      }
      case 'ADJUST_PRICE': {
        const payload = event.payload ?? {}
        const newPrice = payload.newPrice as number
        if (event.assetId && newPrice > 0) {
          this.engine.adjustPrice(event.assetId, newPrice, {
            adminId: event.adminId,
            reason: typeof event.reason === 'string' ? event.reason : undefined,
          })
        }
        break
      }
      case 'HALT_ASSET': {
        // Admin halt individual via REST /admin/motor/halt/:ticker
        // Bloqueia processamento de preço do ativo (complementa motor:halt:{ticker} no Redis)
        // Reason propagado: sem ele o halt tick cai no fallback 'CIRCUIT_BREAKER'.
        if (event.assetId) {
          this.engine.pauseAsset(event.assetId, event.reason ?? 'HALT_ASSET')
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
        // Caminho duravel: engine.haltAll persiste no DB (DB-first) antes de mutar
        // memoria; a pausa sobrevive a restart. Em falha, log explicito (Zero
        // Silencio) e nenhuma pausa fantasma so-em-memoria.
        try {
          const halted = await this.engine.haltAll()
          logger.warn(`[admin-channel] HALT_ALL recebido — ${halted} ativos pausados (persistido)`)
        } catch (err) {
          logger.error(`[admin-channel] HALT_ALL falhou ao persistir: ${(err as Error).message}`)
        }
        break
      }
      case 'RESUME_ALL': {
        // engine.resumeAll retoma apenas halts de admin (haltReason='HALT_ALL'),
        // preservando suspensoes de CIRCUIT_BREAKER. Persistencia DB-first.
        try {
          const resumed = await this.engine.resumeAll()
          logger.info(`[admin-channel] RESUME_ALL recebido — ${resumed} ativos retomados (persistido)`)
        } catch (err) {
          logger.error(`[admin-channel] RESUME_ALL falhou ao persistir: ${(err as Error).message}`)
        }
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

      this.engine.injectNewsImpact(assetId, event.magnitude, event.durationTicks, {
        newsId: event.newsId,
        title: event.title,
        source: event.source,
        impactCategory: event.impactCategory ?? event.impact,
        sentiment: event.sentiment,
        publishedAt: event.publishedAt,
        correlationId: event.correlationId ?? event.newsId,
      })
      logger.info(
        `[news-channel] Notícia injetada: ${event.assetId} | newsId=${event.newsId ?? 'legacy'} | magnitude=${event.magnitude} | ticks=${event.durationTicks}`
      )
    } catch (err) {
      logger.error(`[news-channel] Erro ao processar news:inject: ${(err as Error).message}`)
    }
  }
}
