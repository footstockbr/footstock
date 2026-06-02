// ============================================================================
// FootStock Motor — Teste unitário do job session-transition
// ============================================================================

import { sessionTransitionJob } from '../sessionTransition'
import { logger } from '../../../utils/logger'

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}))

describe('sessionTransitionJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('deve logar início e fim sem lançar erro', async () => {
    await expect(sessionTransitionJob()).resolves.not.toThrow()
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/session-transition] Iniciando job...'
    )
    expect(logger.info).toHaveBeenCalledWith(
      '[cron/session-transition] Job concluído (stub).'
    )
  })
})
