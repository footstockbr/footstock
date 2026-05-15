// ============================================================================
// Foot Stock Motor — Teste unitário do job subscription-expiry (Wave 1 / Option C)
// Valida que o job invoca cronProxy('subscription-expiry') com sucesso.
// ============================================================================

import { subscriptionExpiryJob } from '../subscriptionExpiry'

jest.mock('../../cronProxy', () => ({
  cronProxy: jest.fn().mockResolvedValue(undefined),
}))

import { cronProxy } from '../../cronProxy'

describe('subscriptionExpiryJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('chama cronProxy com o nome kebab-case correto', async () => {
    await expect(subscriptionExpiryJob()).resolves.not.toThrow()
    expect(cronProxy).toHaveBeenCalledTimes(1)
    expect(cronProxy).toHaveBeenCalledWith('subscription-expiry')
  })

  test('propaga erro do cronProxy (scheduler captura via try/catch externo)', async () => {
    ;(cronProxy as jest.Mock).mockRejectedValueOnce(
      new Error('[cron-proxy] subscription-expiry falhou: HTTP 500')
    )
    await expect(subscriptionExpiryJob()).rejects.toThrow(
      '[cron-proxy] subscription-expiry falhou: HTTP 500'
    )
  })
})
