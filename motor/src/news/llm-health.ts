// ============================================================================
// FootStock Motor — LLM health snapshot helpers
// ============================================================================

export type LlmHealthState =
  | 'healthy'
  | 'insufficient_credits'
  | 'error'
  | 'disabled'
  | 'unknown'

export type LlmHealthReasonCode =
  | 'ok'
  | 'llm_disabled_by_admin'
  | 'no_active_provider'
  | 'credit_exhausted'
  | 'auth_invalid'
  | 'rate_limited'
  | 'timeout'
  | 'server_error'
  | 'empty_response'
  | 'parse_invalid'
  | 'stale'
  | 'no_event'
  | 'unknown_error'

export interface LlmHealthSnapshot {
  providerId: string | null
  providerName: string | null
  configVersion: number
  state: LlmHealthState
  reasonCode: LlmHealthReasonCode
  observedAt: string
  expiresAt: string
}

export const LLM_HEALTH_REDIS_KEY = 'news:llm:health:v1'
export const LLM_HEALTH_TTL_SECONDS = 120
export const LLM_HEALTH_FRESHNESS_MS = 90_000

export function buildHealthSnapshot(input: {
  providerId: string | null
  providerName: string | null
  configVersion: number
  state: LlmHealthState
  reasonCode: LlmHealthReasonCode
  observedAt?: Date
  ttlMs?: number
}): LlmHealthSnapshot {
  const observed = input.observedAt ?? new Date()
  const ttl = input.ttlMs ?? LLM_HEALTH_FRESHNESS_MS
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    configVersion: input.configVersion,
    state: input.state,
    reasonCode: input.reasonCode,
    observedAt: observed.toISOString(),
    expiresAt: new Date(observed.getTime() + ttl).toISOString(),
  }
}

export function shouldAcceptHealthEvent(
  event: { providerId: string | null; configVersion: number },
  active: { providerId: string | null; configVersion: number; llmEnabled: boolean },
): boolean {
  if (!active.llmEnabled) return false
  if (!active.providerId) return false
  if (event.providerId !== active.providerId) return false
  if (event.configVersion !== active.configVersion) return false
  return true
}

export function classifyHttpErrorToHealth(meta: {
  status?: number
  message?: string
  aborted?: boolean
  parseValid?: boolean
  emptyText?: boolean
}): { state: LlmHealthState; reasonCode: LlmHealthReasonCode } {
  const msg = (meta.message ?? '').toLowerCase()
  if (/credit balance|insufficient (funds|credits?)|billing/.test(msg)) {
    return { state: 'insufficient_credits', reasonCode: 'credit_exhausted' }
  }
  if (meta.aborted) return { state: 'error', reasonCode: 'timeout' }
  if (meta.status === 401 || meta.status === 403) return { state: 'error', reasonCode: 'auth_invalid' }
  if (meta.status === 429) return { state: 'error', reasonCode: 'rate_limited' }
  if (meta.status && meta.status >= 500) return { state: 'error', reasonCode: 'server_error' }
  if (meta.emptyText) return { state: 'error', reasonCode: 'empty_response' }
  if (meta.parseValid === false) return { state: 'error', reasonCode: 'parse_invalid' }
  return { state: 'error', reasonCode: 'unknown_error' }
}
