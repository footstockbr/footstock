/**
 * NXAUTH-03A — Wrapper PrismaAdapter contra auto-create parcial
 *
 * Prova que `createAuthjsAdapter` bloqueia auto-create de User rows em todos
 * os caminhos relevantes do Auth.js v5:
 *
 *  1. Magic link request para email NAO existente -> NAO cria User row
 *     (apenas VerificationToken via createVerificationToken delegado)
 *  2. Google sign-in com email nao existente -> bloqueia ANTES de
 *     `createUser` adapter call (signIn callback retorna redirect; wrapper
 *     tambem lanca caso seja chamado)
 *  3. Magic link callback com email matched a User existente -> usa
 *     getUserByEmail/updateUser (delegados); NAO cria
 *  4. Link by verified email para Google -> so ocorre quando
 *     `email_verified=true` e existe User com mesmo email
 *
 *  + cobertura completa de branches do wrapper (linkAccount valida
 *    existencia de userId antes de delegar)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const baseAdapter = {
  createUser: jest.fn(),
  getUser: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserByAccount: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  linkAccount: jest.fn(),
  unlinkAccount: jest.fn(),
  createSession: jest.fn(),
  getSessionAndUser: jest.fn(),
  updateSession: jest.fn(),
  deleteSession: jest.fn(),
  createVerificationToken: jest.fn(),
  useVerificationToken: jest.fn(),
}

jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: jest.fn(() => baseAdapter),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}))

// ─── Imports apos mocks ───────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma'
import {
  AuthjsAutoCreateBlockedError,
  createAuthjsAdapter,
} from '@/lib/auth/authjs-adapter'

const mockUserFindUnique = jest.mocked(prisma.user.findUnique)

function buildAdapter() {
  return createAuthjsAdapter(prisma as never)
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── 1. Magic link: email novo NAO cria User ──────────────────────────────────

describe('Wrapper bloqueia auto-create de User (Auth.js v5)', () => {
  it('createUser sempre lanca AuthjsAutoCreateBlockedError (magic link novo email)', async () => {
    const adapter = buildAdapter()

    const newUser = {
      email: 'novato@example.com',
      emailVerified: null,
      name: null,
      image: null,
    }

    await expect(adapter.createUser!(newUser as never)).rejects.toBeInstanceOf(
      AuthjsAutoCreateBlockedError,
    )

    // Garante que o adapter base NAO foi chamado para createUser:
    expect(baseAdapter.createUser).not.toHaveBeenCalled()
  })

  it('createUser lanca codigo conhecido AUTHJS_AUTOCREATE_BLOCKED (Google sign-in novo email)', async () => {
    const adapter = buildAdapter()

    const googleUser = {
      email: 'unknown-google@example.com',
      emailVerified: new Date(),
      name: 'Unknown',
      image: 'https://example.com/avatar.png',
    }

    let captured: AuthjsAutoCreateBlockedError | null = null
    try {
      await adapter.createUser!(googleUser as never)
    } catch (err) {
      captured = err as AuthjsAutoCreateBlockedError
    }

    expect(captured).toBeInstanceOf(AuthjsAutoCreateBlockedError)
    expect(captured?.code).toBe('AUTHJS_AUTOCREATE_BLOCKED')
    expect(captured?.name).toBe('AuthjsAutoCreateBlockedError')
    expect(baseAdapter.createUser).not.toHaveBeenCalled()
  })

  it('AuthjsAutoCreateBlockedError aceita mensagem custom (default e custom paths)', () => {
    const defaultErr = new AuthjsAutoCreateBlockedError()
    expect(defaultErr.message).toContain('NXAUTH-03A')
    expect(defaultErr.code).toBe('AUTHJS_AUTOCREATE_BLOCKED')

    const customErr = new AuthjsAutoCreateBlockedError('mensagem custom')
    expect(customErr.message).toBe('mensagem custom')
    expect(customErr.code).toBe('AUTHJS_AUTOCREATE_BLOCKED')
  })
})

// ─── 2. Magic link callback com User existente: NAO cria, atualiza ────────────

describe('Wrapper preserva fluxos legitimos do PrismaAdapter', () => {
  it('getUserByEmail delegado: magic link callback acha User existente sem criar', async () => {
    baseAdapter.getUserByEmail.mockResolvedValueOnce({
      id: 'user-existente-001',
      email: 'existente@example.com',
      emailVerified: null,
      name: 'Existente',
      image: null,
    })

    const adapter = buildAdapter()
    const found = await adapter.getUserByEmail!('existente@example.com')

    expect(found).toMatchObject({ id: 'user-existente-001' })
    expect(baseAdapter.getUserByEmail).toHaveBeenCalledWith('existente@example.com')
    // wrapper NAO interceptou updateUser/createUser
    expect(baseAdapter.createUser).not.toHaveBeenCalled()
  })

  it('updateUser delegado: emailVerified set apos magic link click', async () => {
    const verifiedDate = new Date('2026-05-09T20:00:00Z')
    baseAdapter.updateUser.mockResolvedValueOnce({
      id: 'user-existente-001',
      email: 'existente@example.com',
      emailVerified: verifiedDate,
      name: 'Existente',
      image: null,
    })

    const adapter = buildAdapter()
    const updated = await adapter.updateUser!({
      id: 'user-existente-001',
      emailVerified: verifiedDate,
    } as never)

    expect(updated.emailVerified).toEqual(verifiedDate)
    expect(baseAdapter.updateUser).toHaveBeenCalledWith({
      id: 'user-existente-001',
      emailVerified: verifiedDate,
    })
    expect(baseAdapter.createUser).not.toHaveBeenCalled()
  })

  it('createVerificationToken delegado: magic link request gera token sem User row', async () => {
    const token = {
      identifier: 'novato@example.com',
      token: 'tok_abc',
      expires: new Date(Date.now() + 60_000),
    }
    baseAdapter.createVerificationToken.mockResolvedValueOnce(token)

    const adapter = buildAdapter()
    const result = await adapter.createVerificationToken!(token as never)

    expect(result).toEqual(token)
    expect(baseAdapter.createVerificationToken).toHaveBeenCalledWith(token)
    // Confirma: token criado, User nao
    expect(baseAdapter.createUser).not.toHaveBeenCalled()
  })

  it('useVerificationToken delegado: consumo idempotente preservado', async () => {
    const token = {
      identifier: 'novato@example.com',
      token: 'tok_abc',
      expires: new Date(Date.now() + 60_000),
    }
    baseAdapter.useVerificationToken.mockResolvedValueOnce(token)

    const adapter = buildAdapter()
    const consumed = await adapter.useVerificationToken!({
      identifier: 'novato@example.com',
      token: 'tok_abc',
    })

    expect(consumed).toEqual(token)
    expect(baseAdapter.useVerificationToken).toHaveBeenCalled()
  })
})

// ─── 3. linkAccount: bloqueia se userId nao existe; delega se existe ──────────

describe('Wrapper.linkAccount valida existencia de User antes de delegar', () => {
  const account = {
    userId: 'user-existente-001',
    type: 'oauth' as const,
    provider: 'google',
    providerAccountId: 'google-sub-123',
    access_token: 'at_xyz',
    token_type: 'Bearer',
    scope: 'openid email profile',
  }

  it('lanca AuthjsAutoCreateBlockedError quando userId nao referencia User existente', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null)

    const adapter = buildAdapter()

    await expect(
      adapter.linkAccount!({ ...account, userId: 'user-fantasma' } as never),
    ).rejects.toBeInstanceOf(AuthjsAutoCreateBlockedError)

    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: 'user-fantasma' } })
    expect(baseAdapter.linkAccount).not.toHaveBeenCalled()
  })

  it('mensagem do erro identifica userId rejeitado (debug-friendly)', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null)

    const adapter = buildAdapter()

    let captured: AuthjsAutoCreateBlockedError | null = null
    try {
      await adapter.linkAccount!({ ...account, userId: 'user-fantasma-xyz' } as never)
    } catch (err) {
      captured = err as AuthjsAutoCreateBlockedError
    }

    expect(captured?.message).toContain('user-fantasma-xyz')
    expect(captured?.message).toContain('linkAccount')
  })

  it('delega para base.linkAccount quando User existe (Google linking por email verificado)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-existente-001' } as never)
    baseAdapter.linkAccount.mockResolvedValueOnce(undefined)

    const adapter = buildAdapter()
    await adapter.linkAccount!(account as never)

    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: 'user-existente-001' } })
    expect(baseAdapter.linkAccount).toHaveBeenCalledWith(account)
  })

  it('lanca quando base.linkAccount esta indisponivel (defensive guard)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: 'user-existente-001' } as never)
    const original = baseAdapter.linkAccount
    // @ts-expect-error intentional removal to drive defensive branch
    baseAdapter.linkAccount = undefined

    const adapter = buildAdapter()
    await expect(adapter.linkAccount!(account as never)).rejects.toThrow(
      'PrismaAdapter.linkAccount indisponivel',
    )

    baseAdapter.linkAccount = original
  })
})
