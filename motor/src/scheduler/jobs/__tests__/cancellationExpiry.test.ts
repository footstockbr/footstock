// ============================================================================
// Foot Stock Motor — Teste unitário do job cancellation-expiry (Option C)
// Valida que o job invoca cronProxy('cancellation-expiry') (deixou de ser stub).
// ============================================================================

import { cancellationExpiryJob } from '../cancellationExpiry'

jest.mock('../../cronProxy', () => ({
  cronProxy: jest.fn().mockResolvedValue(undefined),
}))

import { cronProxy } from '../../cronProxy'

describe('cancellationExpiryJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('chama cronProxy com o nome kebab-case correto', async () => {
    await expect(cancellationExpiryJob()).resolves.not.toThrow()
    expect(cronProxy).toHaveBeenCalledTimes(1)
    expect(cronProxy).toHaveBeenCalledWith('cancellation-expiry')
  })

  test('propaga erro do cronProxy (scheduler captura via try/catch externo)', async () => {
    ;(cronProxy as jest.Mock).mockRejectedValueOnce(
      new Error('[cron-proxy] cancellation-expiry falhou: HTTP 500')
    )
    await expect(cancellationExpiryJob()).rejects.toThrow(
      '[cron-proxy] cancellation-expiry falhou: HTTP 500'
    )
  })
})
