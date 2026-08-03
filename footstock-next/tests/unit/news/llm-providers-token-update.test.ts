/**
 * @jest-environment node
 *
 * updateProviderToken — caminho de escrita de credencial em provider JA existente.
 * Existe porque createProvider recusa slug duplicado (LLM-004) e os nativos
 * seed-kimi/seed-anthropic nascem com token_ciphertext NULL.
 *
 * Contrato observavel coberto:
 *  - ciphertext gravado e decriptavel (roundtrip real, sem mock de crypto);
 *  - config_version bumpado (invalida snapshot de health colado);
 *  - token nunca aparece no DTO devolvido — so tokenConfigured;
 *  - token vazio -> LLM-002; provider inexistente -> LLM-404 (nada e escrito).
 */

interface FakeProvider {
  id: string
  slug: string
  name: string
  enabled: boolean
  token_ciphertext: string | null
  token_key_version: number
  deleted_at: Date | null
  created_at: Date
  updated_at: Date
  created_by: string | null
}

const NOW = new Date('2026-08-03T12:00:00.000Z')

const store: {
  providers: FakeProvider[]
  config: {
    id: string
    llm_enabled: boolean
    active_provider_id: string | null
    config_version: number
    updated_at: Date
    updated_by: string | null
  }
} = {
  providers: [],
  config: {
    id: 'default',
    llm_enabled: true,
    active_provider_id: 'seed-kimi',
    config_version: 1,
    updated_at: NOW,
    updated_by: 'system',
  },
}

function seedStore() {
  store.providers = [
    {
      id: 'seed-kimi',
      slug: 'kimi',
      name: 'Kimi',
      enabled: true,
      token_ciphertext: null,
      token_key_version: 1,
      deleted_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by: 'system',
    },
    {
      id: 'seed-anthropic',
      slug: 'anthropic',
      name: 'Anthropic',
      enabled: true,
      token_ciphertext: null,
      token_key_version: 1,
      deleted_at: null,
      created_at: NOW,
      updated_at: NOW,
      created_by: 'system',
    },
  ]
  store.config = {
    id: 'default',
    llm_enabled: true,
    active_provider_id: 'seed-kimi',
    config_version: 1,
    updated_at: NOW,
    updated_by: 'system',
  }
}

/** Reconstroi o SQL da tagged template para rotear o fake. */
function sql(strings: readonly string[], values: unknown[]): string {
  return strings.reduce<string>((acc, part, i) => acc + part + (i < values.length ? `$${i}` : ''), '')
}

const queryRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = sql(strings, values)
  if (/FROM news_llm_config/.test(text)) return [store.config]
  if (/COUNT\(\*\)/.test(text)) return [{ c: BigInt(store.providers.length) }]
  if (/FROM news_llm_providers/.test(text)) {
    if (/WHERE id = /.test(text)) {
      const id = values[0] as string
      return store.providers.filter((p) => p.id === id && p.deleted_at === null)
    }
    if (/WHERE slug = /.test(text)) {
      const slug = values[0] as string
      const wantsDeleted = /deleted_at IS NOT NULL/.test(text)
      return store.providers.filter(
        (p) => p.slug === slug && (wantsDeleted ? p.deleted_at !== null : p.deleted_at === null),
      )
    }
    return store.providers.filter((p) => p.deleted_at === null)
  }
  return []
})

const executeRaw = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = sql(strings, values)
  if (/UPDATE news_llm_providers/.test(text) && /token_ciphertext = /.test(text)) {
    const [ciphertext, keyVersion, id] = values as [string, number, string]
    const row = store.providers.find((p) => p.id === id && p.deleted_at === null)
    if (!row) return 0
    row.token_ciphertext = ciphertext
    row.token_key_version = keyVersion
    return 1
  }
  if (/UPDATE news_llm_config/.test(text) && /config_version = config_version \+ 1/.test(text)) {
    store.config.config_version += 1
    store.config.updated_by = (values[0] as string) ?? store.config.updated_by
    return 1
  }
  // INSERT ... ON CONFLICT DO NOTHING do seed idempotente: no-op.
  return 0
})

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => queryRaw(strings, ...values),
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => executeRaw(strings, ...values),
    $transaction: (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: { get: jest.fn(async () => null) },
}))

import { decryptToken } from '@/lib/news/llm-token-crypto'
import { getErrorCode, updateProviderToken } from '@/lib/news/llm-providers-service'

describe('updateProviderToken', () => {
  const prevEnc = process.env.ENCRYPTION_KEY
  const prevNews = process.env.NEWS_LLM_TOKEN_KEY

  beforeAll(() => {
    process.env.NEWS_LLM_TOKEN_KEY = 'b'.repeat(64)
    delete process.env.ENCRYPTION_KEY
  })

  afterAll(() => {
    if (prevEnc === undefined) delete process.env.ENCRYPTION_KEY
    else process.env.ENCRYPTION_KEY = prevEnc
    if (prevNews === undefined) delete process.env.NEWS_LLM_TOKEN_KEY
    else process.env.NEWS_LLM_TOKEN_KEY = prevNews
  })

  beforeEach(() => {
    seedStore()
    queryRaw.mockClear()
    executeRaw.mockClear()
  })

  it('grava ciphertext decriptavel no provider nativo e bumpa config_version', async () => {
    const result = await updateProviderToken({
      id: 'seed-kimi',
      token: '  sk-kimi-token-de-teste  ',
      adminId: 'admin-1',
    })

    const row = store.providers.find((p) => p.id === 'seed-kimi')!
    expect(row.token_ciphertext).toBeTruthy()
    // Trim aplicado antes de cifrar — espaco colado do clipboard nao vaza para o header.
    expect(decryptToken(row.token_ciphertext!)).toBe('sk-kimi-token-de-teste')
    expect(store.config.config_version).toBe(2)
    expect(result.config.configVersion).toBe(2)
  })

  it('nao devolve o token nem o ciphertext no DTO', async () => {
    const result = await updateProviderToken({
      id: 'seed-anthropic',
      token: 'sk-ant-token-de-teste',
      adminId: 'admin-1',
    })

    const dto = result.providers.find((p) => p.id === 'seed-anthropic')!
    expect(dto.tokenConfigured).toBe(true)
    expect(JSON.stringify(result)).not.toContain('sk-ant-token-de-teste')
    expect(JSON.stringify(result)).not.toContain(store.providers[1].token_ciphertext)
  })

  it('token vazio -> LLM-002 sem escrever nada', async () => {
    await expect(
      updateProviderToken({ id: 'seed-kimi', token: '   ', adminId: 'admin-1' }),
    ).rejects.toThrow()
    try {
      await updateProviderToken({ id: 'seed-kimi', token: '', adminId: 'admin-1' })
    } catch (err) {
      expect(getErrorCode(err)).toBe('LLM-002')
    }
    expect(store.providers.every((p) => p.token_ciphertext === null)).toBe(true)
    expect(store.config.config_version).toBe(1)
  })

  it('provider inexistente ou soft-deleted -> LLM-404 sem bump de versao', async () => {
    try {
      await updateProviderToken({ id: 'prov-fantasma', token: 'sk-x', adminId: 'admin-1' })
      throw new Error('deveria ter lancado')
    } catch (err) {
      expect(getErrorCode(err)).toBe('LLM-404')
    }
    expect(store.config.config_version).toBe(1)
  })
})
