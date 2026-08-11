/**
 * @jest-environment node
 */
import {
  buildHealthSnapshot,
  isSnapshotFresh,
  shouldAcceptHealthEvent,
  classifyHttpErrorToHealth,
  healthAriaLabel,
} from '@/lib/news/llm-health'

describe('llm-health', () => {
  it('freshness: expired snapshot is not fresh', () => {
    const snap = buildHealthSnapshot({
      providerId: 'p1',
      providerName: 'Kimi',
      configVersion: 1,
      state: 'healthy',
      reasonCode: 'ok',
      observedAt: new Date(Date.now() - 200_000),
      ttlMs: 90_000,
    })
    expect(isSnapshotFresh(snap)).toBe(false)
  })

  it('rejects delayed events by providerId + configVersion', () => {
    const active = { providerId: 'p1', configVersion: 3, llmEnabled: true }
    expect(shouldAcceptHealthEvent({ providerId: 'p1', configVersion: 3 }, active)).toBe(true)
    expect(shouldAcceptHealthEvent({ providerId: 'p2', configVersion: 3 }, active)).toBe(false)
    expect(shouldAcceptHealthEvent({ providerId: 'p1', configVersion: 2 }, active)).toBe(false)
    expect(
      shouldAcceptHealthEvent(
        { providerId: 'p1', configVersion: 3 },
        { ...active, llmEnabled: false },
      ),
    ).toBe(false)
  })

  it('classifies credit / auth / timeout', () => {
    expect(classifyHttpErrorToHealth({ message: 'credit balance is too low' }).state).toBe(
      'insufficient_credits',
    )
    // Saldo BAIXO / billing citado em rate-limit ou erro de servidor NÃO é crédito
    // esgotado: a operação só para quando a API recusa por saldo (400/402).
    expect(
      classifyHttpErrorToHealth({ status: 429, message: 'billing tier rate limit' }).reasonCode,
    ).toBe('rate_limited')
    expect(
      classifyHttpErrorToHealth({ status: 500, message: 'billing service unavailable' }).reasonCode,
    ).toBe('server_error')
    expect(
      classifyHttpErrorToHealth({ status: 400, message: 'credit balance is too low' }).state,
    ).toBe('insufficient_credits')
    expect(classifyHttpErrorToHealth({ status: 401 }).reasonCode).toBe('auth_invalid')
    expect(classifyHttpErrorToHealth({ aborted: true }).reasonCode).toBe('timeout')
    expect(classifyHttpErrorToHealth({ status: 503 }).reasonCode).toBe('server_error')
  })

  it('aria labels cover four states', () => {
    const base = {
      providerId: 'p',
      providerName: 'Kimi',
      configVersion: 1,
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000).toISOString(),
      reasonCode: 'ok' as const,
    }
    expect(healthAriaLabel({ ...base, state: 'healthy' })).toMatch(/saudavel/i)
    expect(healthAriaLabel({ ...base, state: 'insufficient_credits', reasonCode: 'credit_exhausted' })).toMatch(
      /creditos/i,
    )
    expect(healthAriaLabel({ ...base, state: 'error', reasonCode: 'auth_invalid' })).toMatch(/erro/i)
    expect(healthAriaLabel({ ...base, state: 'disabled', reasonCode: 'llm_disabled_by_admin' })).toMatch(
      /desligada/i,
    )
  })
})
