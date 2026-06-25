// ============================================================================
// FootStock — ai-provider resolver tests (toggle Anthropic <-> Kimi)
// ============================================================================

import {
  getAIProvider,
  getActiveAIKey,
  hasAIKey,
  aiClientOptions,
  resolveModel,
} from '@/lib/services/ai-provider'

const ENV_KEYS = ['AI_PROVIDER', 'ANTHROPIC_API_KEY', 'KIMI_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL'] as const

describe('ai-provider', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('default provider é kimi quando AI_PROVIDER ausente', () => {
    expect(getAIProvider()).toBe('kimi')
  })

  it('AI_PROVIDER=anthropic seleciona anthropic; qualquer outro valor cai para kimi', () => {
    process.env.AI_PROVIDER = 'anthropic'
    expect(getAIProvider()).toBe('anthropic')
    process.env.AI_PROVIDER = 'qualquer-coisa'
    expect(getAIProvider()).toBe('kimi')
    process.env.AI_PROVIDER = 'ANTHROPIC'
    expect(getAIProvider()).toBe('anthropic')
  })

  it('kimi: aiClientOptions injeta baseURL Anthropic-compatível e a KIMI_API_KEY', () => {
    process.env.AI_PROVIDER = 'kimi'
    process.env.KIMI_API_KEY = 'sk-kimi-test'
    const opts = aiClientOptions()
    expect(opts.apiKey).toBe('sk-kimi-test')
    expect(opts.baseURL).toBe('https://api.kimi.com/coding')
  })

  it('kimi: KIMI_BASE_URL faz override do endpoint default', () => {
    process.env.AI_PROVIDER = 'kimi'
    process.env.KIMI_BASE_URL = 'https://proxy.interno/coding'
    expect(aiClientOptions().baseURL).toBe('https://proxy.interno/coding')
  })

  it('anthropic: aiClientOptions usa ANTHROPIC_API_KEY e NÃO seta baseURL', () => {
    process.env.AI_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    const opts = aiClientOptions()
    expect(opts.apiKey).toBe('sk-ant-test')
    expect(opts.baseURL).toBeUndefined()
  })

  it('resolveModel: kimi mapeia qualquer modelo Claude para kimi-for-coding (override KIMI_MODEL)', () => {
    process.env.AI_PROVIDER = 'kimi'
    expect(resolveModel('claude-sonnet-4-5')).toBe('kimi-for-coding')
    process.env.KIMI_MODEL = 'kimi-k2-custom'
    expect(resolveModel('claude-haiku-4-5-20251001')).toBe('kimi-k2-custom')
  })

  it('resolveModel: anthropic preserva o modelo Claude recebido', () => {
    process.env.AI_PROVIDER = 'anthropic'
    expect(resolveModel('claude-sonnet-4-5')).toBe('claude-sonnet-4-5')
  })

  it('hasAIKey/getActiveAIKey refletem a credencial do provider ativo', () => {
    process.env.AI_PROVIDER = 'kimi'
    expect(hasAIKey()).toBe(false)
    process.env.KIMI_API_KEY = 'sk-kimi-test'
    expect(hasAIKey()).toBe(true)
    expect(getActiveAIKey()).toBe('sk-kimi-test')

    process.env.AI_PROVIDER = 'anthropic'
    expect(hasAIKey()).toBe(false) // ANTHROPIC_API_KEY ausente
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    expect(getActiveAIKey()).toBe('sk-ant-test')
  })
})
