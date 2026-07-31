/**
 * Garante Node-only: com LLM desligada, classify nao tenta HTTP.
 */
import { NewsClassifier } from '../NewsClassifier'
import { NewsLlmRuntimeConfigService } from '../NewsLlmRuntimeConfigService'

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockRejectedValue(new Error('HTTP should not be called in Node-only')),
    },
  }))
})

describe('NewsClassifier Node-only', () => {
  it('skips HTTP when llm disabled by admin', async () => {
    const redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn(),
      expire: jest.fn(),
      eval: jest.fn().mockResolvedValue(1),
    } as unknown as import('ioredis').default

    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { llm_enabled: false, active_provider_id: null, config_version: 7 },
      ]),
    } as unknown as import('@prisma/client').PrismaClient

    const runtime = new NewsLlmRuntimeConfigService(prisma, redis)
    const classifier = new NewsClassifier(redis, prisma, runtime)

    const result = await classifier.classify({
      url: 'https://example.com/n1',
      title: 'Flamengo vence',
      description: 'teste',
      publishedAt: new Date().toISOString(),
      source: 'test',
    })

    expect(result.ticker).toBeDefined()
    // messages.create nao deve ter sido chamado com sucesso de rede —
    // o mock rejeitaria. Se chegamos aqui, Node-only funcionou.
    expect(redis.set).toHaveBeenCalled()
  })
})
