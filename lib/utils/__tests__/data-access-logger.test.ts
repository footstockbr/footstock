// ============================================================================
// Foot Stock — Testes unitários: withDataAccessLog HOF
// Cobre: fire-and-forget, erro no log não propaga, admin access tracking
// Rastreabilidade: TASK-5/GAP-06
// ============================================================================

// ─── Mock: ConsentService ────────────────────────────────────────────────────

// Polyfill setImmediate for Jest JSDOM environment
if (typeof globalThis.setImmediate === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).setImmediate = (fn: (...fnArgs: unknown[]) => void, ...args: unknown[]) => setTimeout(fn, 0, ...args)
}

jest.mock('@/lib/services/ConsentService', () => ({
  consentService: {
    logDataAccess: jest.fn().mockResolvedValue(undefined),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { consentService: mockConsentService } = require('@/lib/services/ConsentService')
const mockLogDataAccess = mockConsentService.logDataAccess as jest.Mock

// ─── Mock: middleware ────────────────────────────────────────────────────────

jest.mock('@/app/api/middleware', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAuth: jest.fn((handler: (...args: any[]) => any) => handler),
}))

import { withDataAccessLog } from '../data-access-logger'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReq(pathname = '/api/v1/users/me'): any {
  return {
    nextUrl: { pathname },
    headers: {
      get: jest.fn((key: string) => {
        if (key === 'x-forwarded-for') return '10.0.0.1'
        return null
      }),
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCtx(userId = 'user-123'): any {
  return { user: { id: userId } }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeResponse(): any {
  return { status: 200, body: 'ok' }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('withDataAccessLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('retorna a response do handler original', async () => {
    const expectedResponse = makeResponse()
    const handler = jest.fn().mockResolvedValue(expectedResponse)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = withDataAccessLog(handler, 'profile') as any
    const result = await wrapped(makeReq(), makeCtx())

    expect(result).toBe(expectedResponse)
  })

  test('registra log com dataType correto', async () => {
    const handler = jest.fn().mockResolvedValue(makeResponse())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = withDataAccessLog(handler, 'profile') as any
    await wrapped(makeReq(), makeCtx('user-456'))

    // Trigger setImmediate
    jest.runAllTimers()

    expect(mockLogDataAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-456',
        accessedBy: 'user-456',
        dataType: 'profile',
        endpoint: '/api/v1/users/me',
      })
    )
  })

  test('usa getTargetUserId para admin access', async () => {
    const handler = jest.fn().mockResolvedValue(makeResponse())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getTarget = (_ctx: any) => 'target-user-789'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = withDataAccessLog(handler, 'admin_view', getTarget) as any
    await wrapped(makeReq('/api/admin/users/789'), makeCtx('admin-001'))

    jest.runAllTimers()

    expect(mockLogDataAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'target-user-789',
        accessedBy: 'admin-001',
        reason: 'admin_access',
      })
    )
  })

  test('self-access não tem reason admin_access', async () => {
    const handler = jest.fn().mockResolvedValue(makeResponse())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = withDataAccessLog(handler, 'profile') as any
    await wrapped(makeReq(), makeCtx('user-123'))

    jest.runAllTimers()

    expect(mockLogDataAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        accessedBy: 'user-123',
        reason: undefined,
      })
    )
  })

  test('captura IP do x-forwarded-for', async () => {
    const handler = jest.fn().mockResolvedValue(makeResponse())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = withDataAccessLog(handler, 'profile') as any
    await wrapped(makeReq(), makeCtx())

    jest.runAllTimers()

    expect(mockLogDataAccess).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '10.0.0.1' })
    )
  })
})
