/**
 * clearDualCookies — higiene de cookies legados pós-decomissão Supabase
 *
 * Prova que `clearDualCookies` remove cookies de sessão Auth.js e cookies
 * `sb-*` legados, preservando cookies não relacionados.
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

jest.mock('@/lib/prisma', () => ({ prisma: {} }))

import { clearDualCookies } from '@/lib/auth'

describe('clearDualCookies', () => {
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
