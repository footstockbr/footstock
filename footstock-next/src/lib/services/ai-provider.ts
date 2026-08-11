// ============================================================================
// FootStock - AI Provider resolver (toggle Anthropic <-> Kimi)
// Centraliza a escolha de provider de LLM.
//
// O Kimi "for coding" expoe um endpoint Anthropic-compativel
// (https://api.kimi.com/coding + /v1/messages, auth via x-api-key, formato de
// resposta Anthropic incluindo content blocks, usage/cache, count_tokens e o
// server-tool web_search_20250305). Por isso o mesmo @anthropic-ai/sdk atende os
// dois providers: muda apenas baseURL + apiKey + nome do modelo. Nenhuma feature
// (web search do plano LENDA, retries, timeout) precisa ser degradada no Kimi.
//
// Compat legado: as funcoes sincronas continuam lendo env. O runtime server-side
// deve usar resolveActiveAIProviderRuntime(), que respeita a escolha do Super Admin
// em news_llm_config.
// ============================================================================

export type AIProvider = 'anthropic' | 'kimi'

// Endpoint Anthropic-compativel do Kimi. O SDK acrescenta /v1/messages ao baseURL.
const KIMI_DEFAULT_BASE_URL = 'https://api.kimi.com/coding'
const KIMI_DEFAULT_MODEL = 'kimi-for-coding'

export interface AIClientOptions {
  apiKey: string | undefined
  baseURL?: string
}

export interface ActiveAIProviderRuntime {
  provider: AIProvider
  providerId: string | null
  providerName: string | null
  configVersion: number | null
  apiKey: string | undefined
  baseURL?: string
}

interface ActiveProviderDbRow {
  llm_enabled: boolean
  active_provider_id: string | null
  config_version: number
  provider_id: string | null
  provider_slug: string | null
  provider_name: string | null
  provider_enabled: boolean | null
  token_ciphertext: string | null
}

function normalizeProvider(value: string | undefined | null): AIProvider {
  return (value ?? 'anthropic').trim().toLowerCase() !== 'kimi'
    ? 'anthropic'
    : 'kimi'
}

function parseProviderSlug(value: string | undefined | null): AIProvider | null {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'anthropic' || normalized === 'kimi') return normalized
  return null
}

/** Provider de LLM ativo legado. Default 'anthropic'; so 'kimi' explicito resolve para kimi. */
export function getAIProvider(): AIProvider {
  return normalizeProvider(process.env.AI_PROVIDER)
}

function envKeyForProvider(provider: AIProvider): string | undefined {
  const key = provider === 'kimi' ? process.env.KIMI_API_KEY : process.env.ANTHROPIC_API_KEY
  return key && key.trim() ? key.trim() : undefined
}

/** Chave de API da credencial do provider ATIVO (Kimi ou Anthropic). undefined se ausente. */
export function getActiveAIKey(): string | undefined {
  return envKeyForProvider(getAIProvider())
}

/** true quando a credencial do provider ativo esta configurada. */
export function hasAIKey(): boolean {
  return Boolean(getActiveAIKey())
}

/**
 * Options prontas para `new Anthropic({ ...aiClientOptions() })` apontando ao
 * provider ativo. Quando kimi, injeta o baseURL do endpoint Anthropic-compativel.
 */
export function aiClientOptions(): AIClientOptions {
  if (getAIProvider() === 'kimi') {
    return {
      apiKey: envKeyForProvider('kimi'),
      baseURL: (process.env.KIMI_BASE_URL ?? KIMI_DEFAULT_BASE_URL).trim(),
    }
  }
  return { apiKey: envKeyForProvider('anthropic') }
}

/**
 * Mapeia o modelo Claude solicitado para o modelo concreto do provider ativo.
 * Anthropic: retorna o modelo recebido. Kimi: usa KIMI_MODEL ou o default 'kimi-for-coding'.
 */
export function resolveModel(anthropicModel: string): string {
  return resolveModelForProvider(getAIProvider(), anthropicModel)
}

export function resolveModelForProvider(provider: AIProvider, anthropicModel: string): string {
  if (provider === 'kimi') {
    return (process.env.KIMI_MODEL ?? KIMI_DEFAULT_MODEL).trim()
  }
  return anthropicModel
}

export function aiClientOptionsForRuntime(config: ActiveAIProviderRuntime): AIClientOptions {
  if (config.provider === 'kimi') {
    return {
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? (process.env.KIMI_BASE_URL ?? KIMI_DEFAULT_BASE_URL).trim(),
    }
  }
  return { apiKey: config.apiKey }
}

function runtimeFromEnv(): ActiveAIProviderRuntime {
  const provider = getAIProvider()
  return {
    provider,
    providerId: null,
    providerName: provider === 'kimi' ? 'Kimi' : 'Anthropic',
    configVersion: null,
    apiKey: envKeyForProvider(provider),
    ...(provider === 'kimi'
      ? { baseURL: (process.env.KIMI_BASE_URL ?? KIMI_DEFAULT_BASE_URL).trim() }
      : {}),
  }
}

/**
 * Fonte de verdade runtime para chamadas de IA no servidor.
 *
 * A UI do Super Admin persiste a escolha em news_llm_config. Portanto, chamadas
 * reais nao podem depender de AI_PROVIDER, que fica apenas como fallback legado
 * quando a tabela/config ainda nao existe em ambientes antigos ou de teste.
 */
export async function resolveActiveAIProviderRuntime(): Promise<ActiveAIProviderRuntime | null> {
  try {
    const { prisma } = await import('@/lib/prisma')
    if (typeof prisma.$queryRaw !== 'function') {
      return runtimeFromEnv()
    }

    const rows = await prisma.$queryRaw<ActiveProviderDbRow[]>`
      SELECT
        c.llm_enabled,
        c.active_provider_id,
        c.config_version,
        p.id AS provider_id,
        p.slug AS provider_slug,
        p.name AS provider_name,
        p.enabled AS provider_enabled,
        p.token_ciphertext
      FROM news_llm_config c
      LEFT JOIN news_llm_providers p
        ON p.id = c.active_provider_id
       AND p.deleted_at IS NULL
      WHERE c.id = 'default'
      LIMIT 1
    `

    const row = rows[0]
    if (!row) {
      return runtimeFromEnv()
    }
    if (!row.llm_enabled || !row.active_provider_id || !row.provider_id || !row.provider_enabled) {
      return null
    }

    const provider = parseProviderSlug(row.provider_slug)
    if (!provider) {
      return null
    }

    let apiKey = envKeyForProvider(provider)

    if (row.token_ciphertext) {
      const { decryptToken } = await import('@/lib/news/llm-token-crypto')
      apiKey = decryptToken(row.token_ciphertext).trim()
    }

    return {
      provider,
      providerId: row.provider_id,
      providerName: row.provider_name,
      configVersion: row.config_version,
      apiKey: apiKey && apiKey.trim() ? apiKey.trim() : undefined,
      ...(provider === 'kimi'
        ? { baseURL: (process.env.KIMI_BASE_URL ?? KIMI_DEFAULT_BASE_URL).trim() }
        : {}),
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[ai-provider] falha ao resolver provider ativo do admin:',
        err instanceof Error ? err.message : 'erro desconhecido',
      )
      return null
    }
    return runtimeFromEnv()
  }
}
