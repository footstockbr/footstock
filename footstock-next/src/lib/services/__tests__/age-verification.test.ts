/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
// Mock do validators para controlar calcAge
jest.mock('@/lib/utils/validators', () => ({
  calcAge: jest.fn().mockReturnValue(25), // adulto por padrão
}))

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

if (!AbortSignal.timeout) {
  ;(AbortSignal as any).timeout = (ms: number) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), ms)
    return controller.signal
  }
}

describe('verifyAge', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    const { calcAge } = require('@/lib/utils/validators')
    calcAge.mockReturnValue(25) // reset para adulto
    process.env = {
      ...OLD_ENV,
      FLAGCHECK_API_URL: 'https://api.flagcheck.example',
      FLAGCHECK_API_KEY: 'test-key',
    }
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  test('retorna date_only para menor de 18 (sem chamar FlagCheck)', async () => {
    const { calcAge } = require('@/lib/utils/validators')
    calcAge.mockReturnValue(17)
    const { verifyAge } = require('../age-verification')
    const result = await verifyAge('529.982.247-25', '2010-01-01')
    expect(result.method).toBe('date_only')
    expect(result.isAdult).toBe(false)
    expect(result.verified).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('retorna flagcheck quando FlagCheck confirma adulto', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ is_adult: true }),
    })
    const { verifyAge } = require('../age-verification')
    const result = await verifyAge('52998224725', '2000-01-01')
    expect(result.method).toBe('flagcheck')
    expect(result.isAdult).toBe(true)
    expect(result.verified).toBe(true)
  })

  test('retorna self_declaration quando FlagCheck falha 3x', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const { verifyAge } = require('../age-verification')
    const result = await verifyAge('52998224725', '2000-01-01')
    expect(result.method).toBe('self_declaration')
    expect(result.isAdult).toBe(false)
    expect(result.verified).toBe(false)
  })

  test('retorna self_declaration quando FLAGCHECK não configurado', async () => {
    delete process.env.FLAGCHECK_API_URL
    delete process.env.FLAGCHECK_API_KEY
    const { verifyAge } = require('../age-verification')
    const result = await verifyAge('52998224725', '2000-01-01')
    expect(result.method).toBe('self_declaration')
    expect(result.verified).toBe(false)
    expect(result.isAdult).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
