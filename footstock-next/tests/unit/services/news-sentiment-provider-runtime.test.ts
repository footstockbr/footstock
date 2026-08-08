// ============================================================================
// NewsSentimentClassifier - runtime provider selection
// ============================================================================

const mockMessagesCreate = jest.fn()
const mockQueryRaw = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockMessagesCreate,
    },
  }))
})

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      mockQueryRaw(strings, ...values),
  },
}))

import { classifyNewsSentiment } from '@/lib/services/NewsSentimentClassifier'
import Anthropic from '@anthropic-ai/sdk'

const ENV_KEYS = ['AI_PROVIDER', 'ANTHROPIC_API_KEY', 'KIMI_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL'] as const

describe('NewsSentimentClassifier provider runtime', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    jest.clearAllMocks()
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

  it('usa Anthropic do admin mesmo quando AI_PROVIDER legado ainda aponta para kimi', async () => {
    process.env.AI_PROVIDER = 'kimi'
    process.env.KIMI_API_KEY = 'sk-kimi-test'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    mockQueryRaw.mockResolvedValue([
      {
        llm_enabled: true,
        active_provider_id: 'seed-anthropic',
        config_version: 12,
        provider_id: 'seed-anthropic',
        provider_slug: 'anthropic',
        provider_name: 'Anthropic',
        provider_enabled: true,
        token_ciphertext: null,
      },
    ])
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'BULLISH' }],
      stop_reason: 'end_turn',
    })

    const result = await classifyNewsSentiment('Flamengo vence e assume lideranca')

    expect(result).toBe('BULLISH')
    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test' })
    expect(mockMessagesCreate.mock.calls[0][0].model).toBe('claude-haiku-4-5-20251001')
  })

  it('nao chama API quando o provider ativo do admin esta desabilitado', async () => {
    process.env.AI_PROVIDER = 'kimi'
    process.env.KIMI_API_KEY = 'sk-kimi-test'
    mockQueryRaw.mockResolvedValue([
      {
        llm_enabled: true,
        active_provider_id: 'seed-kimi',
        config_version: 13,
        provider_id: 'seed-kimi',
        provider_slug: 'kimi',
        provider_name: 'Kimi',
        provider_enabled: false,
        token_ciphertext: null,
      },
    ])

    const result = await classifyNewsSentiment('Teste')

    expect(result).toBeNull()
    expect(Anthropic).not.toHaveBeenCalled()
    expect(mockMessagesCreate).not.toHaveBeenCalled()
  })
})
