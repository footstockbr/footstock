// ============================================================================
// FootStock Motor — Lifecycle do pipeline RSS (fetcher + classifier)
//
// Centraliza a criacao, parada e religacao do pipeline de noticias para evitar
// split-brain entre instancias (T-07). O pipeline so deve rodar na instancia
// lider; ao perder a lideranca ele e parado e descartado, sendo recriado no
// proximo became-leader.
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type Redis from 'ioredis'
import { RSSFetcher } from './RSSFetcher'
import { NewsClassifier } from './NewsClassifier'
import { NewsPublisher } from './NewsPublisher'
import { NewsLlmRuntimeConfigService, setNewsLlmRuntimeService } from './NewsLlmRuntimeConfigService'
import { logger } from '../utils/logger'

export interface NewsPipeline {
  rssFetcher: RSSFetcher
  newsClassifier: NewsClassifier
  newsPrisma: PrismaClient
}

export async function startNewsPipeline(redis: Redis): Promise<NewsPipeline> {
  const newsAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const newsPrisma = new PrismaClient({ adapter: newsAdapter })
  const publisher = new NewsPublisher(newsPrisma, redis)
  const llmRuntime = new NewsLlmRuntimeConfigService(newsPrisma, redis)
  setNewsLlmRuntimeService(llmRuntime)
  const newsClassifier = new NewsClassifier(redis, newsPrisma, llmRuntime)
  const rssFetcher = new RSSFetcher(redis, newsPrisma)
  newsClassifier.startClassifying(publisher).catch(err =>
    logger.error('[motor] Classifier error:', err)
  )
  rssFetcher.start()
  // Fetch imediato sem bloquear o startup
  rssFetcher.fetchAll().catch(err =>
    logger.error('[motor] Fetch inicial RSS error:', err)
  )
  logger.info('[motor] Pipeline RSS iniciado')
  return { rssFetcher, newsClassifier, newsPrisma }
}

export function stopNewsPipeline(pipeline: NewsPipeline | null): void {
  if (!pipeline) return
  pipeline.rssFetcher.stop()
  pipeline.newsClassifier.stopClassifying()
  // Apenas para os loops. Quem descarta o pipeline deve usar disposeNewsPipeline,
  // que tambem fecha o PrismaClient — ver comentario abaixo.
  logger.info('[motor] Pipeline RSS parado')
}

/**
 * Para o pipeline E fecha o PrismaClient criado por startNewsPipeline.
 *
 * OBRIGATORIO sempre que a referencia ao pipeline for descartada (perda de
 * lideranca ou shutdown). startNewsPipeline instancia um PrismaClient novo a
 * cada became-leader; se a referencia for perdida sem $disconnect, o pool PG
 * fica orfao e nenhum caminho consegue mais fecha-lo — um vazamento por flap
 * de lideranca.
 */
export async function disposeNewsPipeline(pipeline: NewsPipeline | null): Promise<void> {
  if (!pipeline) return
  // Drenar fila em memoria: URLs marcadas como processadas sao liberadas
  // para que o proximo ciclo as traga de volta (T-13).
  try {
    const { drained, unmarked } = await pipeline.rssFetcher.drainQueue()
    if (drained > 0) {
      logger.info(JSON.stringify({
        event: 'news_queue_drained_on_shutdown',
        drained,
        unmarked,
      }))
    }
  } catch (err) {
    logger.warn(JSON.stringify({
      event: 'news_queue_drain_failed_on_shutdown',
      error_message: (err as Error).message,
    }))
  }
  stopNewsPipeline(pipeline)
  await pipeline.newsPrisma.$disconnect().catch(err =>
    logger.error('[motor] Erro ao desconectar Prisma do pipeline RSS:', err)
  )
  logger.info('[motor] Pipeline RSS descartado (Prisma desconectado)')
}
