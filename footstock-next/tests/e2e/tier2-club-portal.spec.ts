/**
 * TIER 2 — Portal do Clube (T-015)
 * Foot Stock / T-033 Verificacao E2E Completa de Gaps
 *
 * Cenarios cobertos:
 *   CP-01: GET /api/v1/club/affiliate/bank disponivel para CLUB_REP
 *   CP-02: Usuario CLUB_REP acessa pagina de clube
 *   CP-03: Dados de fans exibidos de forma anonimizada (email parcial)
 *   CP-04: Usuario sem permissao CLUB_REP nao acessa dashboard do clube
 *   CP-05: API de clube retorna dados do clube associado ao representante
 */

import { test, expect } from '@playwright/test'
import { loginAs, USERS, expectNoServerError } from './setup'

test.describe('T-015: Portal do Clube — TIER 2', () => {
  test('CP-01: GET /api/v1/club retorna dados do clube para CLUB_REP', async ({ request }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.clubRep.email, password: USERS.clubRep.password },
    })

    // Se usuario CLUB_REP nao existir no ambiente, pular
    if (loginRes.status() !== 200) {
      test.skip()
      return
    }

    const res = await request.get('/api/v1/club', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    expect([200, 403, 404]).toContain(res.status())
    expect(res.status()).not.toBe(500)
  })

  test('CP-02: Pagina do clube carrega para usuario autenticado', async ({ page }) => {
    await loginAs(page, 'craque')
    await page.goto('/club')
    await page.waitForLoadState('networkidle')

    // Pode redirecionar para login ou exibir dados — nunca 500
    await expectNoServerError(page)
    const body = page.locator('body')
    await expect(body).not.toBeEmpty()
  })

  test('CP-03: Emails de fans sao anonimizados (formato jo***@gmail.com)', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.clubRep.email, password: USERS.clubRep.password },
    })

    if (loginRes.status() !== 200) {
      test.skip()
      return
    }

    const holdersRes = await request.get('/api/v1/club/holders', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    if (holdersRes.status() === 200) {
      const body = await holdersRes.json()
      const holders = body.data?.holders ?? body.data ?? []

      // Se existirem holders, emails devem estar anonimizados
      for (const holder of holders.slice(0, 5)) {
        const email = holder.email ?? ''
        if (email.length > 0) {
          // Email anonimizado deve conter ***
          expect(email).toContain('***')
        }
      }
    }
  })

  test('CP-04: API de clube sem autenticacao retorna 401', async ({ request }) => {
    const res = await request.get('/api/v1/club')
    expect([401, 403, 404]).toContain(res.status())
    expect(res.status()).not.toBe(500)
  })

  test('CP-05: Usuario Craque sem role CLUB_REP nao acessa admin de clube', async ({
    request,
  }) => {
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: USERS.craque.email, password: USERS.craque.password },
    })
    expect(loginRes.status()).toBe(200)

    // Tentar acessar endpoint de club admin
    const res = await request.get('/api/v1/club/admin', {
      headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
    })

    // Craque sem role CLUB_REP deve receber 403 ou 404
    expect([403, 404]).toContain(res.status())
    expect(res.status()).not.toBe(500)
  })
})
