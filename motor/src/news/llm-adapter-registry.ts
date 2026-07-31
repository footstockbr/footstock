// ============================================================================
// FootStock Motor — Allowlisted LLM adapters (mirror of footstock-next registry)
// Mantido em sync manual com footstock-next/src/lib/news/llm-adapter-registry.ts
// ============================================================================

export type LlmProtocol = 'anthropic' | 'anthropic-compatible'

export interface LlmAdapterDefinition {
  slug: string
  displayName: string
  protocol: LlmProtocol
  baseURL?: string
  defaultModel: string
  aliases: string[]
}

const KIMI_DEFAULT_BASE_URL = 'https://api.kimi.com/coding'
const KIMI_DEFAULT_MODEL = 'kimi-for-coding'
const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-6'

export const LLM_ADAPTER_REGISTRY: readonly LlmAdapterDefinition[] = [
  {
    slug: 'kimi',
    displayName: 'Kimi',
    protocol: 'anthropic-compatible',
    baseURL: KIMI_DEFAULT_BASE_URL,
    defaultModel: KIMI_DEFAULT_MODEL,
    aliases: ['kimi', 'kimi for coding', 'moonshot', 'moonshot ai'],
  },
  {
    slug: 'anthropic',
    displayName: 'Anthropic',
    protocol: 'anthropic',
    defaultModel: ANTHROPIC_DEFAULT_MODEL,
    aliases: ['anthropic', 'claude', 'anthropic claude'],
  },
] as const

export function getAdapterBySlug(slug: string): LlmAdapterDefinition | null {
  const s = slug.trim().toLowerCase()
  return LLM_ADAPTER_REGISTRY.find((a) => a.slug === s) ?? null
}
