// ============================================================================
// Foot Stock Motor — Teste unitário do job scoring (Wave 3 / Option C)
// ============================================================================

import { scoringJob } from '../scoring'

jest.mock('../../cronProxy', () => ({
  cronProxy: jest.fn().mockResolvedValue(undefined),
}))

import { cronProxy } from '../../cronProxy'

describe('scoringJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('chama cronProxy("scoring") (default apiVersion v0)', async () => {
    await expect(scoringJob()).resolves.not.toThrow()
    expect(cronProxy).toHaveBeenCalledTimes(1)
    expect(cronProxy).toHaveBeenCalledWith('scoring')
  })
})
