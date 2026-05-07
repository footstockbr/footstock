// ============================================================================
// Foot Stock Motor — Teste unitário do job subscription-expiry
// ============================================================================

import { subscriptionExpiryJob } from '../subscriptionExpiry'
import { logger } from '../../../utils/logger'

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))

describe('subscriptionExpiryJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('deve logar início e fim sem lançar erro', async () => {
    await expect(subscriptionExpiryJob()).resolves.not.toThrow()
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/subscription-expiry] Iniciando job...'
    )
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/subscription-expiry] Job concluído (stub).'
    )
  })
})
