import { NewsLlmRuntimeConfigService } from '../NewsLlmRuntimeConfigService'
import { shouldAcceptHealthEvent } from '../llm-health'

describe('NewsLlmRuntimeConfigService', () => {
  const prev = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    KIMI_API_KEY: process.env.KIMI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  }

  afterEach(() => {
    process.env.AI_PROVIDER = prev.AI_PROVIDER
    process.env.KIMI_API_KEY = prev.KIMI_API_KEY
    process.env.ANTHROPIC_API_KEY = prev.ANTHROPIC_API_KEY
  })

  it('env fallback resolves kimi when key present', async () => {
    process.env.AI_PROVIDER = 'kimi'
    process.env.KIMI_API_KEY = 'sk-kimi-test'
    const svc = new NewsLlmRuntimeConfigService(undefined, undefined)
    const rt = await svc.getRuntimeConfig(true)
    expect(rt.llmEnabled).toBe(true)
    expect(rt.adapterSlug).toBe('kimi')
    expect(rt.apiKey).toBe('sk-kimi-test')
  })

  it('first boot without config or env is Node-only closed', async () => {
    delete process.env.KIMI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    const svc = new NewsLlmRuntimeConfigService(undefined, undefined)
    const rt = await svc.getRuntimeConfig(true)
    expect(rt.llmEnabled).toBe(false)
    expect(rt.reason).toBe('no_config')
  })

  it('DB Node-only when llm_enabled false', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { llm_enabled: false, active_provider_id: null, config_version: 4 },
        ]),
    } as unknown as import('@prisma/client').PrismaClient
    const svc = new NewsLlmRuntimeConfigService(prisma, undefined)
    const rt = await svc.getRuntimeConfig(true)
    expect(rt.llmEnabled).toBe(false)
    expect(rt.reason).toBe('llm_disabled_by_admin')
    expect(rt.configVersion).toBe(4)
  })

  it('DB active provider with env key when ciphertext null', async () => {
    process.env.KIMI_API_KEY = 'sk-from-env'
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { llm_enabled: true, active_provider_id: 'seed-kimi', config_version: 2 },
        ])
        .mockResolvedValueOnce([
          {
            id: 'seed-kimi',
            slug: 'kimi',
            name: 'Kimi',
            enabled: true,
            token_ciphertext: null,
            deleted_at: null,
          },
        ]),
    } as unknown as import('@prisma/client').PrismaClient
    const svc = new NewsLlmRuntimeConfigService(prisma, undefined)
    const rt = await svc.getRuntimeConfig(true)
    expect(rt.llmEnabled).toBe(true)
    expect(rt.providerId).toBe('seed-kimi')
    expect(rt.apiKey).toBe('sk-from-env')
    expect(rt.model).toBeTruthy()
  })

  it('health event rejection for stale version', () => {
    expect(
      shouldAcceptHealthEvent(
        { providerId: 'a', configVersion: 1 },
        { providerId: 'a', configVersion: 2, llmEnabled: true },
      ),
    ).toBe(false)
  })

  it('publishHealth writes sanitized snapshot to redis', async () => {
    const set = jest.fn().mockResolvedValue('OK')
    const redis = { set } as unknown as import('ioredis').default
    process.env.KIMI_API_KEY = 'sk-kimi-test'
    process.env.AI_PROVIDER = 'kimi'
    const svc = new NewsLlmRuntimeConfigService(undefined, redis)
    await svc.publishHealth({ state: 'healthy', reasonCode: 'ok' })
    expect(set).toHaveBeenCalled()
    const payload = JSON.parse(set.mock.calls[0][1] as string)
    expect(payload.state).toBe('healthy')
    expect(JSON.stringify(payload)).not.toMatch(/sk-kimi/)
  })

  it('hot switch: invalidate + force reload picks new active provider without process restart', async () => {
    process.env.KIMI_API_KEY = 'sk-kimi-hot'
    process.env.ANTHROPIC_API_KEY = 'sk-anth-hot'
    const queryRaw = jest
      .fn()
      // 1st load: kimi active v=1
      .mockResolvedValueOnce([
        { llm_enabled: true, active_provider_id: 'seed-kimi', config_version: 1 },
      ])
      .mockResolvedValueOnce([
        {
          id: 'seed-kimi',
          slug: 'kimi',
          name: 'Kimi',
          enabled: true,
          token_ciphertext: null,
          deleted_at: null,
        },
      ])
      // 2nd load after invalidate: anthropic active v=2
      .mockResolvedValueOnce([
        { llm_enabled: true, active_provider_id: 'seed-anth', config_version: 2 },
      ])
      .mockResolvedValueOnce([
        {
          id: 'seed-anth',
          slug: 'anthropic',
          name: 'Anthropic',
          enabled: true,
          token_ciphertext: null,
          deleted_at: null,
        },
      ])
    const prisma = { $queryRaw: queryRaw } as unknown as import('@prisma/client').PrismaClient
    const svc = new NewsLlmRuntimeConfigService(prisma, undefined)

    const first = await svc.getRuntimeConfig(true)
    expect(first.adapterSlug).toBe('kimi')
    expect(first.configVersion).toBe(1)
    expect(first.providerId).toBe('seed-kimi')

    // Sem force, cache de 5s devolveria o mesmo; invalidate + force = hot switch.
    svc.invalidate()
    const second = await svc.getRuntimeConfig(true)
    expect(second.adapterSlug).toBe('anthropic')
    expect(second.configVersion).toBe(2)
    expect(second.providerId).toBe('seed-anth')
    expect(second.apiKey).toBe('sk-anth-hot')
  })
})
