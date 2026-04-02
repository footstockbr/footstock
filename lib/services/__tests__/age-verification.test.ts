/**
 * Testes unitarios — verifyAge (FlagCheck + fallback)
 * Cenarios: date_only (menor), flagcheck success, flagcheck false, indisponibilidade de verificacao
 */

// Mock global.fetch antes de importar o modulo
const mockFetch = jest.fn()
global.fetch = mockFetch

// Mock AbortSignal.timeout se nao existir (Node < 17.3)
if (!AbortSignal.timeout) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(AbortSignal as any).timeout = (ms: number) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), ms)
    return controller.signal
  }
}

import { verifyAge } from '../age-verification'

describe('verifyAge', () => {
  const ADULT_CPF = '529.982.247-25'
  const ADULT_DATE = '1990-01-01'
  const MINOR_DATE = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 17)
    return d.toISOString().split('T')[0]!
  })()

  beforeEach(() => {
    mockFetch.mockReset()
    delete process.env.FLAGCHECK_API_URL
    delete process.env.FLAGCHECK_API_KEY
  })

  test('menor de 18 anos retorna isAdult false (date_only) sem chamar FlagCheck', async () => {
    const result = await verifyAge(ADULT_CPF, MINOR_DATE)
    expect(result.isAdult).toBe(false)
    expect(result.verified).toBe(true)
    expect(result.method).toBe('date_only')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('FlagCheck sucesso: is_adult true retorna method flagcheck', async () => {
    process.env.FLAGCHECK_API_URL = 'https://flagcheck.test'
    process.env.FLAGCHECK_API_KEY = 'test-key'
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ is_adult: true }),
    })
    const result = await verifyAge(ADULT_CPF, ADULT_DATE)
    expect(result.isAdult).toBe(true)
    expect(result.method).toBe('flagcheck')
    expect(result.verified).toBe(true)
  })

  test('FlagCheck retorna nao adulto (fraude de data de nascimento)', async () => {
    process.env.FLAGCHECK_API_URL = 'https://flagcheck.test'
    process.env.FLAGCHECK_API_KEY = 'test-key'
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ is_adult: false }),
    })
    const result = await verifyAge(ADULT_CPF, ADULT_DATE)
    expect(result.isAdult).toBe(false)
    expect(result.method).toBe('flagcheck')
  })

  test('FlagCheck nao configurado → bloqueia verificacao (self_declaration pendente)', async () => {
    const result = await verifyAge(ADULT_CPF, ADULT_DATE)
    expect(result.method).toBe('self_declaration')
    expect(result.verified).toBe(false)
    expect(result.isAdult).toBe(false)
  })

  test('FlagCheck falha 3x → bloqueia verificacao (self_declaration pendente)', async () => {
    process.env.FLAGCHECK_API_URL = 'https://flagcheck.test'
    process.env.FLAGCHECK_API_KEY = 'test-key'
    mockFetch.mockRejectedValue(new Error('Network error'))
    const result = await verifyAge(ADULT_CPF, ADULT_DATE)
    expect(result.method).toBe('self_declaration')
    expect(result.verified).toBe(false)
    expect(result.isAdult).toBe(false)
  }, 30000) // timeout alto por causa do backoff exponencial
})

// ─── verifyAgeForUser (TASK-6/GAP-11) ────���─────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      update: jest.fn().mockResolvedValue({}),
    },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

import { verifyAgeForUser } from '../age-verification'

describe('verifyAgeForUser', () => {
  const USER_ID = 'user-vaf-123'
  const ADULT_BIRTHDATE = new Date('1990-01-01')
  const MINOR_BIRTHDATE = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 16)
    return d
  })()

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
    delete process.env.FLAGCHECK_API_URL
    delete process.env.FLAGCHECK_API_KEY
  })

  test('adulto com FlagCheck: atualiza ageVerificationPending para false', async () => {
    process.env.FLAGCHECK_API_URL = 'https://flagcheck.test'
    process.env.FLAGCHECK_API_KEY = 'test-key'
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ is_adult: true }),
    })

    const result = await verifyAgeForUser(USER_ID, ADULT_BIRTHDATE)
    expect(result.isAdult).toBe(true)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { ageVerificationPending: false },
    })
  })

  test('menor: atualiza ageVerificationPending para true', async () => {
    const result = await verifyAgeForUser(USER_ID, MINOR_BIRTHDATE)
    expect(result.isAdult).toBe(false)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { ageVerificationPending: true },
    })
  })

  test('falha no update do banco nao propaga erro (catch silencioso)', async () => {
    mockPrisma.user.update.mockRejectedValue(new Error('DB offline'))
    // Nao deve lancar
    const result = await verifyAgeForUser(USER_ID, ADULT_BIRTHDATE)
    expect(result).toBeDefined()
    expect(result.verificationMethod).toBe('self_declaration')
    expect(result.isAdult).toBe(false)
  })
})
