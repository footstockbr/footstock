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

  // Tentar ganhar liderança
  const isLeader = await leader.tryAcquire()

  if (!isLeader) {
    logger.info('[motor] Instância secundária: aguardando liderança...')
    // Polling a cada 5s para assumir liderança se o líder morrer
    const interval = setInterval(async () => {
      const acquired = await leader.tryAcquire()
      if (acquired) {
        clearInterval(interval)
        logger.info('[motor] Liderança adquirida! Iniciando engine...')
        await engine.start()
        // Parar engine se liderança for perdida durante operação
        leader.onLeadershipLost = () => {
          logger.warn('[motor] Liderança perdida durante operação — parando engine.')
          engine.stop().catch(err => logger.error('[motor] Erro ao parar engine após perda de liderança:', err))
        }
      }
    }, 5_000)
    return
  }

  logger.info('[motor] Liderança adquirida! Iniciando engine...')

  // Registrar horário de início (TTL longo — reset a cada deploy)
  const healthService = MotorHealthService.getInstance(redis)
  await redis.set('motor:started_at', new Date().toISOString(), 'EX', 86400).catch(() => null)

  // Canal de controle admin (HALT_ASSET, RELEASE_HALT, INJECT_NEWS, etc.)
  const adminSubscriber = RedisClientService.createSubscriber()
  const adminChannel = new AdminChannel(adminSubscriber, engine)
  await adminChannel.start()
  logger.info('[motor] AdminChannel iniciado')

  await engine.start()

  // Parar engine se liderança for perdida durante operação (ex: deploy blue-green)
  leader.onLeadershipLost = () => {
    logger.warn('[motor] Liderança perdida durante operação — parando engine para evitar ticks duplicados.')
    engine.stop().catch(err => logger.error('[motor] Erro ao parar engine após perda de liderança:', err))
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`[motor] Recebido ${signal}. Encerrando...`)
    await healthService.publishOffline()
    await adminChannel.stop()
    await adminSubscriber.quit()
    await engine.stop()
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
