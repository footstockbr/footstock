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
  // Nao desconecta o Prisma aqui; o shutdown global gerencia isso.
  logger.info('[motor] Pipeline RSS parado')
}
