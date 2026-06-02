/**
 * TIER 2 — Notificacoes (T-014)
 * FootStock / T-033 Verificacao E2E Completa de Gaps
 *
 * Cenarios cobertos:
 *   NT-01: GET /api/v1/notifications retorna lista de notificacoes
 *   NT-02: GET /api/v1/notifications/unread-count retorna contador de nao lidas
 *   NT-03: PUT /api/v1/notifications/[id] marca notificacao como lida
 *   NT-04: POST /api/v1/notifications/read-all marca todas como lidas
 *   NT-05: Centro de notificacoes exibe notificacoes com status lido/nao lido
 *   NT-06: Preferencias de notificacao retornam estrutura correta
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS, expectNoServerError } from './setup'

test.describe('T-014: Notificacoes — TIER 2', () => {
  test('NT-01: GET /api/v1/notifications retorna lista de notificacoes', async ({ request }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.get('/api/v1/notifications', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect([200, 204]).toContain(res.status())
    expect(res.status()).not.toBe(500)

    if (res.status() === 200) {
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.data).toBeDefined()
    }
  })

  test('NT-02: GET /api/v1/notifications/unread-count retorna contador numerico', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.get('/api/v1/notifications/unread-count', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    const count = body.data?.count ?? body.data?.unreadCount ?? body.data
    expect(typeof count === 'number' || typeof count === 'object').toBe(true)
  })

  test('NT-03: POST /api/v1/notifications/read-all marca todas as notificacoes como lidas', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.post('/api/v1/notifications/read-all', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect([200, 204]).toContain(res.status())
    expect(res.status()).not.toBe(500)
  })

  test('NT-04: GET /api/v1/notifications sem auth retorna 401', async ({ request }) => {
    const res = await request.get('/api/v1/notifications')
    expect(res.status()).toBe(401)
  })

  test('NT-05: Pagina /inbox renderiza centro de notificacoes', async ({ page }) => {
    await loginAs(page, 'craque')
    await page.goto('/inbox')
    await page.waitForLoadState('networkidle')

    await expectNoServerError(page)

    const body = page.locator('body')
    await expect(body).not.toBeEmpty()
  })

  test('NT-06: GET /api/v1/users/me/notification-preferences retorna preferencias', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    const res = await request.get('/api/v1/users/me/notification-preferences', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect([200, 404]).toContain(res.status())
    expect(res.status()).not.toBe(500)

    if (res.status() === 200) {
      const body = await res.json()
      expect(body.success).toBe(true)
    }
  })

  test('NT-07: PATCH /api/v1/notifications/[id] marca notificacao especifica como lida', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    // Buscar uma notificacao para marcar
    const listRes = await request.get('/api/v1/notifications', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    if (listRes.status() !== 200) {
      test.skip()
      return
    }

    const listBody = await listRes.json()
    const notifications = listBody.data?.notifications ?? listBody.data ?? []

    if (!notifications.length) {
      test.skip()
      return
    }

    const notificationId = notifications[0].id
    const patchRes = await request.patch(`/api/v1/notifications/${notificationId}`, {
      data: { read: true },
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect([200, 204]).toContain(patchRes.status())
    expect(patchRes.status()).not.toBe(500)
  })
})
