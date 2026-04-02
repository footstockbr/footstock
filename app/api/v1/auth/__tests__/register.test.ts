/**
 * @jest-environment node
 *
 * Testes de integracao — POST /api/v1/auth/register
 * Cenarios: VAL-001, REG-001, REG-002, REG-003, AGE-001, SYS-006, SYS-001
 */

// ---------- Mocks ----------
const mockPrismaUser = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
}
const mockPrismaConsent = { createMany: jest.fn() }

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: mockPrismaUser,
    consent: mockPrismaConsent,
  },
}))

jest.mock('@/lib/services/age-verification', () => ({
  verifyAge: jest.fn().mockResolvedValue({
    isAdult: true,
    verified: true,
    method: 'flagcheck',
  }),
}))

jest.mock('@/lib/ratelimit', () => ({
  registerRateLimit: {
    limit: jest.fn().mockResolvedValue({ success: true }),
  },
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        createUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'supabase-uid-123' } },
          error: null,
        }),
      },
      signInWithPassword: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'at-123',
            refresh_token: 'rt-123',
            expires_at: 9999999999,
          },
        },
      }),
    },
  })),
}))

// Mock env vars
process.env.CPF_HASH_SALT = 'test-salt-minimum-32-characters-here!!'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

import { NextRequest } from 'next/server'

const validPayload = {
  name: 'Joao Silva',
  email: 'joao@test.com',
  password: 'Teste123!',
  confirmPassword: 'Teste123!',
  cpf: '529.982.247-25',
  birthDate: '1990-01-01',
  phone: '(11) 99999-9999',
  favoriteClub: 'FLM3',
  consents: { terms: true, privacy: true },
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/v1/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrismaUser.findUnique.mockResolvedValue(null)
    mockPrismaUser.findFirst.mockResolvedValue(null)
    mockPrismaUser.create.mockResolvedValue({
      id: 'supabase-uid-123',
      email: 'joao@test.com',
      name: 'Joao Silva',
      planType: 'JOGADOR',
    })
    mockPrismaConsent.createMany.mockResolvedValue({ count: 4 })
  })

  test('payload valido retorna 201 com user e session', async () => {
    const { POST } = await import('../register/route')
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.data.user.id).toBe('supabase-uid-123')
    expect(data.data.requiresOnboarding).toBe(true)
    expect(data.data.session).toBeTruthy()
  })

  test('payload invalido (sem email) retorna 400 com VAL-001', async () => {
    const { POST } = await import('../register/route')
    const res = await POST(
      makeRequest({ ...validPayload, email: '' })
    )
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.code).toBe('VAL-001')
  })

  test('email duplicado retorna 409 com REG-002', async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce({ id: 'existing' })
    const { POST } = await import('../register/route')
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error.code).toBe('REG-002')
  })

  test('CPF duplicado (via hash) retorna 409 com REG-001', async () => {
    mockPrismaUser.findUnique.mockResolvedValue(null) // email ok
    mockPrismaUser.findFirst.mockResolvedValueOnce({ id: 'existing-cpf' })
    const { POST } = await import('../register/route')
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error.code).toBe('REG-001')
  })

  test('rate limit excedido retorna 429 com REG-003', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerRateLimit } = require('@/lib/ratelimit')
    registerRateLimit.limit.mockResolvedValueOnce({ success: false })
    const { POST } = await import('../register/route')
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(429)
    const data = await res.json()
    expect(data.error.code).toBe('REG-003')
  })

  test('menor de idade retorna 400 com AGE-001', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { verifyAge } = require('@/lib/services/age-verification')
    verifyAge.mockResolvedValueOnce({
      isAdult: false,
      verified: true,
      method: 'date_only',
    })
    const { POST } = await import('../register/route')
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.code).toBe('AGE-001')
  })

  test('falha de verificacao tecnica retorna 503 com SYS-006', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { verifyAge } = require('@/lib/services/age-verification')
    verifyAge.mockResolvedValueOnce({
      isAdult: false,
      verified: false,
      method: 'self_declaration',
    })
    const { POST } = await import('../register/route')
    const res = await POST(makeRequest(validPayload))
    expect(res.status).toBe(503)
    const data = await res.json()
    expect(data.error.code).toBe('SYS-006')
  })

  test('consentimentos LGPD salvos com 4 registros', async () => {
    const { POST } = await import('../register/route')
    await POST(makeRequest(validPayload))
    expect(mockPrismaConsent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ purpose: 'ESSENTIAL', granted: true }),
        expect.objectContaining({ purpose: 'MARKETING', granted: false }),
        expect.objectContaining({ purpose: 'ANALYTICS', granted: false }),
        expect.objectContaining({ purpose: 'DATA_TERCEIROS', granted: false }),
      ]),
    })
  })

  test('CPF nunca armazenado em plaintext — apenas hash', async () => {
    const { POST } = await import('../register/route')
    await POST(makeRequest(validPayload))
    const createCall = mockPrismaUser.create.mock.calls[0]?.[0]
    expect(createCall?.data?.cpfHash).toBeDefined()
    expect(createCall?.data?.cpfHash).toHaveLength(64) // SHA-256 hex
    // Garantir que o CPF original nunca aparece nos dados do prisma.create
    expect(JSON.stringify(createCall)).not.toContain('529.982.247-25')
    expect(JSON.stringify(createCall)).not.toContain('52998224725')
  })
})
