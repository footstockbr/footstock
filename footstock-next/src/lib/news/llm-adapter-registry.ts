// ============================================================================
// FootStock — Allowlisted LLM adapters for news classifier providers
// Cadastro so e aceito quando o nome resolve para um adapter conhecido.
// ============================================================================

export type LlmProtocol = 'anthropic' | 'anthropic-compatible'

export interface LlmAdapterDefinition {
  slug: string
  displayName: string
  protocol: LlmProtocol
  /** Base URL opcional (Kimi Anthropic-compat). Anthropic nativo omite. */
  baseURL?: string
  defaultModel: string
  /** Nomes aceitos no cadastro (case-insensitive, apos trim). */
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

export const MAX_CUSTOM_PROVIDERS = 8

export function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function resolveAdapterByName(name: string): LlmAdapterDefinition | null {
  const n = normalizeProviderName(name)
  if (!n) return null
  for (const adapter of LLM_ADAPTER_REGISTRY) {
    if (adapter.aliases.includes(n) || adapter.slug === n || normalizeProviderName(adapter.displayName) === n) {
      return adapter
    }
  }
  return null
}

export function getAdapterBySlug(slug: string): LlmAdapterDefinition | null {
  const s = slug.trim().toLowerCase()
  return LLM_ADAPTER_REGISTRY.find((a) => a.slug === s) ?? null
}

export function listNativeSeedProviders(): Array<{ slug: string; name: string }> {
  return LLM_ADAPTER_REGISTRY.map((a) => ({ slug: a.slug, name: a.displayName }))
}
