/**
 * Global setup E2E — autentica 1x por usuario e grava storageState em disco.
 * Evita o rate limit de login (20 req / 15 min por IP) quando N testes
 * precisam de sessao autenticada.
 */
import { request } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { USERS, resetDailyOrderCounter } from './setup'

async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
  const dir = path.resolve('tests/e2e/.auth')
  fs.mkdirSync(dir, { recursive: true })

  for (const key of ['jogador', 'craque'] as const) {
    const ctx = await request.newContext({ baseURL })
    if (!USERS[key].password) {
      throw new Error(`global-setup: senha ausente para ${key} (defina TEST_*_PASSWORD ou DEV_TEST_PASSWORD)`)
    }
    const res = await ctx.post('/api/v1/auth/login', {
      data: { email: USERS[key].email, password: USERS[key].password },
    })
    if (!res.ok()) {
      throw new Error(`global-setup: login ${key} falhou: ${res.status()} ${(await res.text()).slice(0, 200)}`)
    }
    const body = await res.json()
    const userId = body?.data?.user?.id as string | undefined
    if (userId) await resetDailyOrderCounter(userId)
    await ctx.storageState({ path: path.join(dir, `${key}.json`) })
    await ctx.dispose()
  }
}

export default globalSetup
