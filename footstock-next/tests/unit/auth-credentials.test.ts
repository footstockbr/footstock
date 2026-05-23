/**
 * Unit tests para `authorizeCredentials` + `backfillPasswordHash`
 * (src/lib/auth-credentials.ts).
 *
 * Cobertura:
 *  1. payload Zod invalido -> null + dummy bcrypt rodado (timing defense)
 *  2. user nao existe -> null + dummy bcrypt rodado
 *  3. user sem passwordHash -> null + dummy bcrypt rodado (caller fara
 *     fallback Supabase + backfill)
 *  4. user com passwordHash, senha errada -> null (bcrypt real rodou)
 *  5. user com passwordHash, senha correta -> AuthorizedUser shape completo
 *  6. backfillPasswordHash aplica quando passwordHash is null
 *  7. backfillPasswordHash retorna applied=false em race (segundo concorrente)
 */

import bcrypt from 'bcryptjs'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFindUnique = jest.fn()
const mockUpdateMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}))

import {
  authorizeCredentials,
  backfillPasswordHash,
} from '@/lib/auth-credentials'

beforeEach(() => {
  mockFindUnique.mockReset()
  mockUpdateMany.mockReset()
})

describe('authorizeCredentials', () => {
  test('1) payload invalido (email malformado) retorna null e roda dummy bcrypt', async () => {
    const spy = jest.spyOn(bcrypt, 'compare')
    const out = await authorizeCredentials({ email: 'not-an-email', password: 'whatever' })
    expect(out).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1) // timing defense aplicado
    expect(mockFindUnique).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test('2) user nao existe retorna null e roda dummy bcrypt', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const spy = jest.spyOn(bcrypt, 'compare')
    const out = await authorizeCredentials({ email: 'ghost@x.com', password: 'whatever' })
    expect(out).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  test('3) user sem passwordHash retorna null e roda dummy bcrypt', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'u1', email: 'a@b.com', passwordHash: null,
      name: 'A', adminRole: null, planType: 'FAN', userType: 'NORMAL', favoriteClub: null,
    })
    const spy = jest.spyOn(bcrypt, 'compare')
    const out = await authorizeCredentials({ email: 'a@b.com', password: 'whatever' })
    expect(out).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  test('4) user com hash mas senha errada retorna null', async () => {
    const hash = await bcrypt.hash('correct-horse', 4)
    mockFindUnique.mockResolvedValueOnce({
      id: 'u2', email: 'a@b.com', passwordHash: hash,
      name: 'A', adminRole: null, planType: 'FAN', userType: 'NORMAL', favoriteClub: null,
    })
    const out = await authorizeCredentials({ email: 'a@b.com', password: 'wrong-password' })
    expect(out).toBeNull()
  })

  test('5) user com hash e senha correta retorna shape AuthorizedUser', async () => {
    const hash = await bcrypt.hash('correct-horse', 4)
    mockFindUnique.mockResolvedValueOnce({
      id: 'u3', email: 'a@b.com', passwordHash: hash,
      name: 'A', adminRole: 'SUPERADMIN', planType: 'LENDA',
      userType: 'ADMIN', favoriteClub: 'FLAM', status: 'ACTIVE',
    })
    const out = await authorizeCredentials({ email: 'a@b.com', password: 'correct-horse' })
    expect(out).toEqual({
      id: 'u3',
      email: 'a@b.com',
      name: 'A',
      adminRole: 'SUPERADMIN',
      planType: 'LENDA',
      userType: 'ADMIN',
      favoriteClub: 'FLAM',
    })
  })
})

describe('backfillPasswordHash', () => {
  test('6) updateMany com where passwordHash:null aplica em primeira chamada', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 })
    const result = await backfillPasswordHash('u1', 'plaintext')
    expect(result).toEqual({ applied: true })
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'u1', passwordHash: null }),
        data: expect.objectContaining({
          passwordHash: expect.any(String),
          updatedAt: expect.any(Date),
        }),
      }),
    )
  })

  test('7) segundo concorrente race-safe vira no-op (count=0 -> applied=false)', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 })
    const result = await backfillPasswordHash('u1', 'plaintext')
    expect(result).toEqual({ applied: false })
  })

  test('7b) erro de DB nao lanca, retorna applied=false', async () => {
    mockUpdateMany.mockRejectedValueOnce(new Error('db down'))
    const result = await backfillPasswordHash('u1', 'plaintext')
    expect(result).toEqual({ applied: false })
  })
})

describe('timing defense (regressao)', () => {
  test('user nao existe e user-com-hash-senha-errada ambos rodam bcrypt.compare uma vez', async () => {
    // not-found: 1 compare (dummy)
    mockFindUnique.mockResolvedValueOnce(null)
    const spy1 = jest.spyOn(bcrypt, 'compare')
    await authorizeCredentials({ email: 'ghost@x.com', password: 'x12345678' })
    expect(spy1).toHaveBeenCalledTimes(1)
    spy1.mockRestore()

    // wrong-password: 1 compare (real)
    const hash = await bcrypt.hash('correct', 4)
    mockFindUnique.mockResolvedValueOnce({
      id: 'u', email: 'a@b.com', passwordHash: hash,
      name: null, adminRole: null, planType: 'FAN', userType: 'NORMAL', favoriteClub: null,
    })
    const spy2 = jest.spyOn(bcrypt, 'compare')
    await authorizeCredentials({ email: 'a@b.com', password: 'wrong' })
    expect(spy2).toHaveBeenCalledTimes(1)
    spy2.mockRestore()
  })
})
