// ============================================================================
// Foot Stock Motor — Teste unitário do job cancellation-expiry
// ============================================================================

import { cancellationExpiryJob } from '../cancellationExpiry'
import { logger } from '../../../utils/logger'

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))

describe('cancellationExpiryJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('deve logar início e fim sem lançar erro', async () => {
    await expect(cancellationExpiryJob()).resolves.not.toThrow()
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/cancellation-expiry] Iniciando job...'
    )
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/cancellation-expiry] Job concluído (stub).'
    )
  })
})
