// ============================================================================
// FootStock — AI Provider resolver (toggle Anthropic <-> Kimi)
// Centraliza a escolha de provider de LLM via env AI_PROVIDER, consumido pelo
// AIAdvisorService (Assessor IA) e pelo NewsSentimentClassifier.
//
// O Kimi "for coding" expoe um endpoint Anthropic-compativel
// (https://api.kimi.com/coding + /v1/messages, auth via x-api-key, formato de
// resposta Anthropic incluindo content blocks, usage/cache, count_tokens e o
// server-tool web_search_20250305). Por isso o mesmo @anthropic-ai/sdk atende os
// dois providers: muda apenas baseURL + apiKey + nome do modelo. Nenhuma feature
// (web search do plano LENDA, retries, timeout) precisa ser degradada no Kimi.
//
// Default: kimi (toggle "virado para o Kimi" — decisao operacional 2026-06-25).
// ============================================================================

export type AIProvider = 'anthropic' | 'kimi'

// Endpoint Anthropic-compativel do Kimi. O SDK acrescenta /v1/messages ao baseURL.
const KIMI_DEFAULT_BASE_URL = 'https://api.kimi.com/coding'
const KIMI_DEFAULT_MODEL = 'kimi-for-coding'

/** Provider de LLM ativo. Default 'kimi'; qualquer valor != 'anthropic' resolve para kimi. */
export function getAIProvider(): AIProvider {
  return (process.env.AI_PROVIDER ?? 'kimi').trim().toLowerCase() === 'anthropic'
    ? 'anthropic'
    : 'kimi'
}

/** Chave de API da credencial do provider ATIVO (Kimi ou Anthropic). undefined se ausente. */
export function getActiveAIKey(): string | undefined {
  const key = getAIProvider() === 'kimi' ? process.env.KIMI_API_KEY : process.env.ANTHROPIC_API_KEY
  return key && key.trim() ? key : undefined
}

/** true quando a credencial do provider ativo esta configurada. */
export function hasAIKey(): boolean {
  return Boolean(getActiveAIKey())
}

export interface AIClientOptions {
  apiKey: string | undefined
  baseURL?: string
}

/**
 * Options prontas para `new Anthropic({ ...aiClientOptions() })` apontando ao
 * provider ativo. Quando kimi, injeta o baseURL do endpoint Anthropic-compativel.
 */
export function aiClientOptions(): AIClientOptions {
  if (getAIProvider() === 'kimi') {
    return {
      apiKey: process.env.KIMI_API_KEY,
      baseURL: (process.env.KIMI_BASE_URL ?? KIMI_DEFAULT_BASE_URL).trim(),
    }
  }
  return { apiKey: process.env.ANTHROPIC_API_KEY }
}

/**
 * Mapeia o modelo Claude solicitado para o modelo concreto do provider ativo.
 * Anthropic: retorna o modelo recebido. Kimi: usa KIMI_MODEL ou o default 'kimi-for-coding'.
 */
export function resolveModel(anthropicModel: string): string {
  if (getAIProvider() === 'kimi') {
    return (process.env.KIMI_MODEL ?? KIMI_DEFAULT_MODEL).trim()
  }
  return anthropicModel
}
