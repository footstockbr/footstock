// ============================================================================
// FootStock Motor — Entry Point
// Gerencia leader election, inicialização e graceful shutdown.
// ============================================================================

import './config/env'   // fail-fast para variáveis ausentes
import http from 'http'
import crypto from 'crypto'
import { handleMarketStream } from './server/routes/marketStream'
import { handleNewsStream } from './server/routes/newsStream'
import { verifyJwt, extractTokenFromRequest } from './lib/auth'
import { registerAllJobs, startScheduler } from './scheduler'
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
import { PrismaPg } from '@prisma/adapter-pg'

const MOTOR_ID = `motor-${process.env.RAILWAY_REPLICA_ID ?? 'local'}-${Date.now()}`

// ─── HTTP Server: health + admin debug endpoints ─────────────────────────────
// Porta 3001 (Railway/Docker health check + admin endpoints)
const PORT = parseInt(process.env.PORT ?? '3001', 10)

let _engineRef: import('./engine/MarketEngine').MarketEngine | null = null
// R2: readiness != liveness. _engineReady só vira true quando o engine ticando
// (lider adquirido + loadAssets concluido). /health = liveness; /ready = readiness.
let _engineReady = false

// S1/S3/S4: secret de admin para endpoints operacionais (layers-debug). Fail-closed:
// sem secret configurado, o endpoint NAO serve (503) em vez de fail-open. Aceita
// ADMIN_DEBUG_TOKEN (dedicado) ou MOTOR_ADMIN_SECRET (ja setado em prod) como fallback.
const ADMIN_SECRET = process.env.ADMIN_DEBUG_TOKEN || process.env.MOTOR_ADMIN_SECRET || ''

function requireAdmin(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!ADMIN_SECRET) {
    res.writeHead(503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'admin endpoint not configured' }))
    return false
  }
  // Comparacao timing-safe do Bearer (evita timing-attack na descoberta do token).
  const auth = req.headers.authorization ?? ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const a = Buffer.from(provided)
  const b = Buffer.from(ADMIN_SECRET)
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
  if (!ok) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return false
  }
  return true
}

const healthServer = http.createServer(async (req, res) => {
  const url = req.url ?? ''
  // Rotear por pathname: req.url inclui querystring (ex: /stream/market?token=...),
  // que quebrava o exact-match dos endpoints SSE e fazia cair no 404 final.
  const pathname = url.split('?')[0]

  // GET /health — liveness (Railway/Docker). Sempre 200 enquanto o processo vive.
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', id: MOTOR_ID }))
    return
  }

  // GET /ready — LEADER readiness (R2). 200 só quando o engine esta ticando (lider +
  // assets carregados). ATENCAO: e readiness de LIDER, nao readiness de processo — uma
  // instancia secundaria saudavel (standby aguardando lideranca) responde 503 com
  // role:'standby'. NAO usar como healthcheck per-replica (causaria restart-loop em
  // standbys); use para LB/probe que deve rotear so ao produtor de ticks. /health
  // (liveness) permanece o healthcheck do container (railway.toml).
  if (pathname === '/ready') {
    const leaderReady = _engineReady && _engineRef !== null
    res.writeHead(leaderReady ? 200 : 503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: leaderReady ? 'ready' : 'not-ready',
      role: leaderReady ? 'leader' : 'standby',
      id: MOTOR_ID,
    }))
    return
  }

  // GET /api/v1/market/engine/layers-debug — contribuição de cada camada por ticker.
  // S1: admin-only, FAIL-CLOSED (requireAdmin retorna 503 sem secret, 401 sem Bearer).
  if (pathname === '/api/v1/market/engine/layers-debug') {
    if (!requireAdmin(req, res)) return
    const params  = new URL(url, 'http://localhost').searchParams
    const ticker  = params.get('ticker') ?? undefined
    const debug   = await (_engineRef?.getLayersDebug(ticker) ?? Promise.resolve({}))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(debug))
    return
  }

  // GET /api/v1/assets/:ticker/ofi-history — histórico OFI para sub-chart.
  // S3: exige JWT de usuario (mesmo contrato do /stream/market). Antes era publico.
  const ofiMatch = pathname.match(/^\/api\/v1\/assets\/([A-Z0-9]+)\/ofi-history$/)
  if (ofiMatch) {
    try {
      verifyJwt(extractTokenFromRequest(req))
    } catch {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    const ticker  = ofiMatch[1]
    const history = await _engineRef?.getOfiHistory(ticker) ?? []
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ticker, history }))
    return
  }

  // GET /stream/market — SSE streaming de ticks (migrado do Vercel em 2026-05-06)
  if (pathname === '/stream/market') {
    handleMarketStream(req, res)
    return
  }

  // GET /stream/news — SSE streaming de notícias (migrado do Vercel em 2026-05-06)
  if (pathname === '/stream/news') {
    handleNewsStream(req, res)
    return
  }

  res.writeHead(404)
  res.end()
})
healthServer.listen(PORT, () => {
  logger.info(`[motor] Health server escutando na porta ${PORT}`)
})

async function main() {
  logger.info(`[motor] Iniciando instância: ${MOTOR_ID}`)

  // M052: garante coluna halted_until em assets (IF NOT EXISTS — idempotente).
  // Roda antes de qualquer query Prisma que referencie a coluna.
  {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    const mc = new PrismaClient({ adapter })
    await mc.$executeRaw`ALTER TABLE assets ADD COLUMN IF NOT EXISTS halted_until TIMESTAMPTZ`
    await mc.$disconnect()
    logger.info('[motor] Schema check: coluna halted_until OK')
  }

  const redis = await RedisClientService.getInstance()
  const leader = new LeaderElection(redis, MOTOR_ID)
  const engine = new MarketEngine(redis)
  _engineRef = engine  // Expõe referência para os endpoints HTTP
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
    _engineReady = true  // R2: engine ticando -> /ready passa a responder 200

    // Pipeline RSS — inicia junto com o engine
    if (!rssFetcher) {
      const newsAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
      newsPrisma = new PrismaClient({ adapter: newsAdapter })
      const publisher = new NewsPublisher(newsPrisma, redis)
      newsClassifier = new NewsClassifier(redis, newsPrisma)
      rssFetcher = new RSSFetcher(redis, newsPrisma)
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
      _engineReady = false  // R2: deixou de ser lider -> nao pronto ate re-adquirir
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

  // Iniciar scheduler se opt-in via env (item 011 + 012)
  if (process.env.MOTOR_SCHEDULER_ENABLED === 'true') {
    registerAllJobs()
    startScheduler(leader)
    logger.info('[motor] Scheduler iniciado (MOTOR_SCHEDULER_ENABLED=true)')
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
