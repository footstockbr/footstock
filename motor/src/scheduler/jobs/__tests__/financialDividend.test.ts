// ============================================================================
// Foot Stock Motor — Teste unitário do job financial-dividend
// ============================================================================

import { financialDividendJob } from '../financialDividend'
import { logger } from '../../../utils/logger'

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))

describe('financialDividendJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('deve logar início e fim sem lançar erro', async () => {
    await expect(financialDividendJob()).resolves.not.toThrow()
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/financial-dividend] Iniciando job...'
    )
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/financial-dividend] Job concluído (stub).'
    )
  })
})
