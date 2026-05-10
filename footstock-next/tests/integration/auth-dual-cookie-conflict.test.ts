/**
 * NXAUTH-04A — Kill switch + detecção de conflito Auth.js vs Supabase
 *
 * Prova `detectIdentityConflict` e `handleIdentityConflict` em 4 cenários:
 *  1. Apenas Auth.js cookie -> autentica OK (sem conflito)
 *  2. Apenas Supabase cookie -> fallback OK (sem conflito)
 *  3. AMBOS apontando para mesmo users.id (mesmo email) -> Auth.js preferred sem warning
 *  4. AMBOS apontando para users.id diferentes -> 401 + cookies limpos + Sentry capture
 *
 * + comportamento do kill switch AUTH_DUAL_COOKIE_STRICT=false (recovery mode).
 */

const cookieStoreCookies: { name: string; value: string }[] = []
const deletedCookies: string[] = []

function resetCookieStore(initial: { name: string; value: string }[] = []) {
  cookieStoreCookies.length = 0
  cookieStoreCookies.push(...initial)
  deletedCookies.length = 0
}

jest.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => cookieStoreCookies.slice(),
    delete: (name: string) => {
      deletedCookies.push(name)
      const idx = cookieStoreCookies.findIndex((c) => c.name === name)
      if (idx >= 0) cookieStoreCookies.splice(idx, 1)
    },
  }),
}))

const sentryCaptureMessage = jest.fn()
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => sentryCaptureMessage(...args),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseServerClient: jest.fn(),
}))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))

jest.mock('@/lib/env', () => {
  const state: { AUTH_DUAL_COOKIE_STRICT: 'true' | 'false' } = {
    AUTH_DUAL_COOKIE_STRICT: 'true',
  }
  return {
    __envState: state,
    env: state,
  }
})

const envState = (jest.requireMock('@/lib/env') as { __envState: { AUTH_DUAL_COOKIE_STRICT: 'true' | 'false' } }).__envState

import {
  detectIdentityConflict,
  clearDualCookies,
  handleIdentityConflict,
} from '@/lib/auth'

describe('NXAUTH-04A — detectIdentityConflict', () => {
  it('returns false when only Auth.js identity present (Supabase null)', () => {
    expect(
      detectIdentityConflict({ id: 'u1', email: 'a@x.com' }, null),
    ).toBe(false)
  })

  it('returns false when only Supabase identity present (Auth.js null)', () => {
    expect(
      detectIdentityConflict(null, { id: 'u1', email: 'a@x.com' }),
    ).toBe(false)
  })

  it('returns false when both identities match by id and email', () => {
    expect(
      detectIdentityConflict(
        { id: 'u1', email: 'A@X.com' },
        { id: 'u1', email: 'a@x.com' },
      ),
    ).toBe(false)
  })

  it('returns true when ids diverge', () => {
    expect(
      detectIdentityConflict(
        { id: 'u1', email: 'a@x.com' },
        { id: 'u2', email: 'a@x.com' },
      ),
    ).toBe(true)
  })

  it('returns true when emails diverge for matching id', () => {
    expect(
      detectIdentityConflict(
        { id: 'u1', email: 'a@x.com' },
        { id: 'u1', email: 'b@x.com' },
      ),
    ).toBe(true)
  })

  it('tolerates missing emails (id parity sufficient)', () => {
    expect(
      detectIdentityConflict(
        { id: 'u1', email: undefined },
        { id: 'u1', email: null },
      ),
    ).toBe(false)
  })
})

describe('NXAUTH-04A — clearDualCookies', () => {
  beforeEach(() => {
    sentryCaptureMessage.mockReset()
  })

  it('removes only Auth.js + Supabase cookies, preserving unrelated ones', async () => {
    resetCookieStore([
      { name: 'sb-access-token', value: 'x' },
      { name: 'sb-refresh-token', value: 'y' },
      { name: 'next-auth.session-token', value: 'z' },
      { name: '__Secure-authjs.session-token', value: 'w' },
      { name: 'fs_dev_auth', value: 'pedro@x.com' },
      { name: 'cart_id', value: '42' },
    ])

    await clearDualCookies()

    expect(deletedCookies.sort()).toEqual(
      [
        'sb-access-token',
        'sb-refresh-token',
        'next-auth.session-token',
        '__Secure-authjs.session-token',
      ].sort(),
    )
    expect(cookieStoreCookies.map((c) => c.name).sort()).toEqual(
      ['cart_id', 'fs_dev_auth'].sort(),
    )
  })
})

describe('NXAUTH-04A — handleIdentityConflict', () => {
  beforeEach(() => {
    sentryCaptureMessage.mockReset()
    envState.AUTH_DUAL_COOKIE_STRICT = 'true'
  })

  it('strict mode (default): clears cookies, captures Sentry, returns null', async () => {
    resetCookieStore([
      { name: 'sb-access-token', value: 'x' },
      { name: 'next-auth.session-token', value: 'z' },
    ])

    const out = await handleIdentityConflict(
      { user: { id: 'u1' } },
      { id: 'u1', email: 'a@x.com' },
      { id: 'u2', email: 'b@x.com' },
    )

    expect(out).toBeNull()
    expect(deletedCookies).toEqual(
      expect.arrayContaining(['sb-access-token', 'next-auth.session-token']),
    )
    expect(sentryCaptureMessage).toHaveBeenCalledTimes(1)
    const [msg, opts] = sentryCaptureMessage.mock.calls[0] as [
      string,
      { level: string; tags: Record<string, string>; extra: Record<string, unknown> },
    ]
    expect(msg).toBe('auth.dual_cookie_identity_conflict')
    expect(opts.level).toBe('warning')
    expect(opts.tags).toMatchObject({ source: 'auth', kind: 'dual_cookie_conflict' })
    // PII guard: emails NÃO devem aparecer crus em extra.
    expect(JSON.stringify(opts.extra)).not.toContain('a@x.com')
    expect(JSON.stringify(opts.extra)).not.toContain('b@x.com')
  })

  it('recovery mode (AUTH_DUAL_COOKIE_STRICT=false): logs but returns preferred', async () => {
    envState.AUTH_DUAL_COOKIE_STRICT = 'false'
    resetCookieStore([
      { name: 'sb-access-token', value: 'x' },
      { name: 'next-auth.session-token', value: 'z' },
    ])
    const preferred = { user: { id: 'u1' } }

    const out = await handleIdentityConflict(
      preferred,
      { id: 'u1', email: 'a@x.com' },
      { id: 'u2', email: 'b@x.com' },
    )

    expect(out).toBe(preferred)
    expect(deletedCookies).toEqual([])
    expect(sentryCaptureMessage).toHaveBeenCalledTimes(1)
  })
})
