// ============================================================================
// Foot Stock Motor — Teste unitário do job card-updater
// ============================================================================

import { cardUpdaterJob } from '../cardUpdater'
import { logger } from '../../../utils/logger'

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))

describe('cardUpdaterJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('deve logar início e fim sem lançar erro', async () => {
    await expect(cardUpdaterJob()).resolves.not.toThrow()
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/card-updater] Iniciando job...'
    )
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/card-updater] Job concluído (stub).'
    )
  })
})
