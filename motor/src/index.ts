// ============================================================================
// Foot Stock Motor — Entry Point
// Gerencia leader election, inicialização e graceful shutdown.
// ============================================================================

import './config/env'   // fail-fast para variáveis ausentes
import http from 'http'
import { logger } from './utils/logger'
import { LeaderElection } from './leader/LeaderElection'
import { MarketEngine } from './engine/MarketEngine'
import { RedisClientService } from './services/RedisClientService'
import { MotorHealthService } from './services/MotorHealthService'
import { AdminChannel } from './broadcast/AdminChannel'
import { RSSFetcher } from './news/RSSFetcher'
import { NewsClassifier } from './news/NewsClassifier'
import { NewsPublisher } from './news/NewsPublisher'
import { PrismaClient } from '@prisma/client'

const MOTOR_ID = `motor-${process.env.RAILWAY_REPLICA_ID ?? 'local'}-${Date.now()}`

// Health check HTTP server para Railway/Docker
const PORT = parseInt(process.env.PORT ?? '3001', 10)
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', id: MOTOR_ID }))
  } else {
    res.writeHead(404)
    res.end()
  }
})
healthServer.listen(PORT, () => {
  logger.info(`[motor] Health server escutando na porta ${PORT}`)
})

async function main() {
  logger.info(`[motor] Iniciando instância: ${MOTOR_ID}`)

  const redis = await RedisClientService.getInstance()
  const leader = new LeaderElection(redis, MOTOR_ID)
  const engine = new MarketEngine(redis)
  const healthService = MotorHealthService.getInstance(redis)

  let adminChannel: AdminChannel | null = null
  // Guardado no escopo externo para poder chamar .quit() no graceful shutdown
  let adminSubscriber: ReturnType<typeof RedisClientService.createSubscriber> | null = null

  // Pipeline RSS — inicializado apenas na instância líder
  let rssFetcher: RSSFetcher | null = null
  let newsClassifier: NewsClassifier | null = null
  let newsPrisma: PrismaClient | null = null

  /**
   * Inicializa tudo que precisa rodar quando esta instância se torna líder.
   * Chamado tanto no startup direto quanto ao adquirir liderança via polling.
   */
  async function onBecameLeader(): Promise<void> {
    logger.info('[motor] Liderança adquirida! Iniciando engine...')

    // Registrar horário de início
    await redis.set('motor:started_at', new Date().toISOString(), 'EX', 86400).catch(() => null)

    // Canal de controle admin — garante que funciona mesmo após blue-green deploy
    if (!adminChannel) {
      adminSubscriber = RedisClientService.createSubscriber()
      adminChannel = new AdminChannel(adminSubscriber, engine)
      await adminChannel.start()
      logger.info('[motor] AdminChannel iniciado')
    }

    await engine.start()

    // Pipeline RSS — inicia junto com o engine
    if (!rssFetcher) {
      newsPrisma = new PrismaClient()
      const publisher = new NewsPublisher(newsPrisma, redis)
      newsClassifier = new NewsClassifier(redis)
      rssFetcher = new RSSFetcher(redis)
      newsClassifier.startClassifying(publisher).catch(err =>
        logger.error('[motor] Classifier error:', err)
      )
      rssFetcher.start()
      // Fetch imediato sem bloquear o startup
      rssFetcher.fetchAll().catch(err =>
        logger.error('[motor] Fetch inicial RSS error:', err)
      )
      logger.info('[motor] Pipeline RSS iniciado')
    }

    // Callback ao perder liderança: parar ticks (sem desconectar Prisma) e reiniciar
    // polling — engine.start() pode ser chamado novamente sem recriar o PrismaClient.
    leader.onLeadershipLost = () => {
      logger.warn('[motor] Liderança perdida — parando engine e aguardando re-aquisição...')
      engine.stop(false).catch(err => logger.error('[motor] Erro ao parar engine:', err))
      startPolling()
    }
  }

  /** Polling de 5s para assumir liderança se o líder atual morrer. */
  function startPolling(): void {
    logger.info('[motor] Instância secundária: aguardando liderança...')
    const interval = setInterval(async () => {
      const acquired = await leader.tryAcquire()
      if (acquired) {
        clearInterval(interval)
        await onBecameLeader()
      }
    }, 5_000)
  }

  // Tentar ganhar liderança imediatamente
  const isLeader = await leader.tryAcquire()
  if (isLeader) {
    await onBecameLeader()
  } else {
    startPolling()
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[motor] Recebido ${signal}. Encerrando...`)
    await healthService.publishOffline()
    if (adminChannel) {
      await adminChannel.stop()
    }
    // Fechar conexão do subscriber antes de sair (evita leak de conexão Redis)
    if (adminSubscriber) {
      await adminSubscriber.quit().catch(() => null)
    }
    // Parar pipeline RSS
    if (rssFetcher) rssFetcher.stop()
    if (newsClassifier) newsClassifier.stopClassifying()
    if (newsPrisma) await newsPrisma.$disconnect().catch(() => null)
    // Shutdown definitivo: desconectar Prisma (disconnectPrisma=true)
    await engine.stop(true)
    await leader.release()
    await redis.quit()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('uncaughtException', err => {
    logger.error('[motor] Erro não capturado:', err)
    void shutdown('uncaughtException')
  })
}

main().catch(err => {
  logger.error('[motor] Erro fatal:', err)
  process.exit(1)
})
