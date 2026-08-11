// ============================================================================
// FootStock — News LLM health snapshot (sanitized, ephemeral)
// Consumido pela bolinha de status no Super Admin. Sem segredos.
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

export const LLM_HEALTH_COLORS = {
  healthy: '#2EBD85',
  insufficient_credits: '#F0B90B',
  error: '#F6465D',
  disabled: '#929AA5',
  unknown: '#929AA5',
} as const

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

export function isSnapshotFresh(snapshot: LlmHealthSnapshot, now = Date.now()): boolean {
  const exp = Date.parse(snapshot.expiresAt)
  if (!Number.isFinite(exp)) return false
  return exp > now
}

/**
 * Aceita evento de saude somente se providerId + configVersion baterem com o ativo.
 * Eventos atrasados (provider antigo ou versao antiga) sao rejeitados.
 */
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
  // Credito ESGOTADO = recusa efetiva por saldo (400/402 + mensagem de recusa).
  // Saldo baixo, "billing tier" de rate-limit ou erro de servidor que cite billing
  // nao entram aqui: viram error/rate_limited e nao param a operacao.
  if (
    (meta.status === undefined || meta.status === 400 || meta.status === 402) &&
    /credit balance (is )?too low|insufficient (funds|credits?|balance|quota)|(credits?|quota|balance) (has been |is |are )?(exhausted|depleted)|payment required/.test(
      msg,
    )
  ) {
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

export function healthAriaLabel(snapshot: LlmHealthSnapshot | null): string {
  if (!snapshot) return 'Status da IA desconhecido'
  switch (snapshot.state) {
    case 'healthy':
      return `IA saudavel (${snapshot.providerName ?? 'provider ativo'})`
    case 'insufficient_credits':
      return `IA com creditos insuficientes (${snapshot.providerName ?? 'provider ativo'})`
    case 'error':
      return `IA com erro (${snapshot.reasonCode})`
    case 'disabled':
      return 'IA desligada (somente Node)'
    default:
      return 'Status da IA desconhecido'
  }
}
