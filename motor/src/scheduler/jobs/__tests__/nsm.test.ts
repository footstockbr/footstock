// ============================================================================
// Foot Stock Motor — Teste unitário do job nsm (Wave 3 / Option C)
// Valida que o job invoca cronProxy com apiVersion v1.
// ============================================================================

import { nsmJob } from '../nsm'

jest.mock('../../cronProxy', () => ({
  cronProxy: jest.fn().mockResolvedValue(undefined),
}))

import { cronProxy } from '../../cronProxy'

describe('nsmJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('chama cronProxy("nsm", apiVersion v1)', async () => {
    await expect(nsmJob()).resolves.not.toThrow()
    expect(cronProxy).toHaveBeenCalledTimes(1)
    expect(cronProxy).toHaveBeenCalledWith('nsm', { apiVersion: 'v1' })
  })
})
