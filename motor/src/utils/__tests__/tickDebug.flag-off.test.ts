/**
 * @jest-environment node
 *
 * TODO:REMOVE debug instrumentation
 * (loop 06-17-motor-footstock-correcoes-variacoes / T0.1)
 *
 * Garante que, com a flag MOTOR_TICK_DEBUG desligada (default), o tick não
 * emite nada (no-op, zero overhead em prod).
 */

jest.mock('../../config/env', () => ({ env: { MOTOR_TICK_DEBUG: false } }))

const mockDebug = jest.fn()
jest.mock('../../utils/logger', () => ({
  logger: { debug: mockDebug, info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

import { maybeEmitTickDebug, isTickDebugEnabled } from '../tickDebug'

describe('tickDebug — flag OFF', () => {
  it('isTickDebugEnabled é false quando a flag está desligada', () => {
    expect(isTickDebugEnabled()).toBe(false)
  })

  it('maybeEmitTickDebug retorna null e não loga', () => {
    const out = maybeEmitTickDebug({
      timestamp: 0,
      ticker: 'TST',
      agentImpact: 0,
      syntheticVolume: 0,
      stateVolume: 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      marketMakerDecision: null,
      ofiState: 0,
      layerResults: [],
    })
    expect(out).toBeNull()
    expect(mockDebug).not.toHaveBeenCalled()
  })
})
