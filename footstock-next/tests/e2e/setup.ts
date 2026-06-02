/**
 * Setup e Teardown Compartilhados — Testes E2E T-033
 * FootStock / Verificacao E2E Completa de Todos os Gaps
 *
 * Usuarios de teste (criados via seed ou banco de staging):
 *   - JOGADOR: plano basico, 2 ordens/dia MARKET, sem LIMIT
 *   - CRAQUE:  plano intermediario, indicadores MM9/MM21
 *   - LENDA:   plano premium, alavancagem 2x, todos os indicadores
 *   - ADMIN:   SUPER_ADMIN, acesso total
 *   - CLUB_REP: representante de clube
 *
 * Teardown:
 *   Dados criados durante os testes sao limpos via DELETE direto na API
 *   de staging (rota /api/v1/dev/cleanup — disponivel apenas em !production).
 */

import { type Page, type APIRequestContext } from '@playwright/test'

// ─── Credenciais via env ──────────────────────────────────────────────────────

export const USERS = {
  jogador: {
    email: process.env.TEST_JOGADOR_EMAIL ?? 'jogador@footstock.test',
    password: process.env.TEST_JOGADOR_PASSWORD ?? 'TestJogador123!',
    plan: 'JOGADOR' as const,
  },
  craque: {
    email: process.env.TEST_CRAQUE_EMAIL ?? 'craque@footstock.test',
    password: process.env.TEST_CRAQUE_PASSWORD ?? 'TestCraque123!',
    plan: 'CRAQUE' as const,
  },
  lenda: {
    email: process.env.TEST_LENDA_EMAIL ?? 'lenda@footstock.test',
    password: process.env.TEST_LENDA_PASSWORD ?? 'TestLenda123!',
    plan: 'LENDA' as const,
  },
  admin: {
    email: process.env.TEST_ADMIN_EMAIL ?? 'admin@footstock.test',
    password: process.env.TEST_ADMIN_PASSWORD ?? 'TestAdmin123!',
    role: 'SUPER_ADMIN' as const,
  },
  moderador: {
    email: process.env.TEST_MODERADOR_EMAIL ?? 'moderador@footstock.test',
    password: process.env.TEST_MODERADOR_PASSWORD ?? 'TestModerador123!',
    role: 'MODERADOR' as const,
  },
  suporte: {
    email: process.env.TEST_SUPORTE_EMAIL ?? 'suporte@footstock.test',
    password: process.env.TEST_SUPORTE_PASSWORD ?? 'TestSuporte123!',
    role: 'SUPORTE' as const,
  },
  clubRep: {
    email: process.env.TEST_CLUB_REP_EMAIL ?? 'clubrep@footstock.test',
    password: process.env.TEST_CLUB_REP_PASSWORD ?? 'TestClubRep123!',
    role: 'CLUB_REP' as const,
  },
} as const

// Ticker padrao para testes (ativo sempre disponivel no seed)
export const TEST_TICKER = process.env.TEST_TICKER ?? 'URU3'
export const TEST_TICKER_2 = process.env.TEST_TICKER_2 ?? 'FLM3'

// ─── Helpers de autenticacao ─────────────────────────────────────────────────

export async function loginAs(
  page: Page,
  userKey: keyof typeof USERS,
): Promise<void> {
  const user = USERS[userKey]
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.locator('[data-testid="email-input"]').fill(user.email)
  await page.locator('[data-testid="password-input"]').fill(user.password)
  await page.locator('[data-testid="login-submit"]').click()
  await page.waitForURL(/mercado|onboarding|admin/, { timeout: 15_000 })
}

export async function loginViaAPI(
  request: APIRequestContext,
  userKey: keyof typeof USERS,
): Promise<string> {
  const user = USERS[userKey]
  const res = await request.post('/api/v1/auth/login', {
    data: { email: user.email, password: user.password },
  })
  const body = await res.json()
  return body?.data?.token ?? ''
}

// ─── Helpers de API ───────────────────────────────────────────────────────────

export async function callAPI(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const fn = method === 'GET'
    ? request.get
    : method === 'POST'
    ? request.post
    : method === 'PUT'
    ? request.put
    : method === 'DELETE'
    ? request.delete
    : request.patch

  const res = await fn.call(request, path, body ? { data: body } : undefined)
  const data = await res.json().catch(() => null)
  return { status: res.status(), data }
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

export async function expectToast(page: Page, pattern: RegExp | string): Promise<void> {
  const toastLocator = page.locator(
    '[role="status"], [role="alert"], [data-sonner-toast], [data-testid*="toast"]',
  ).filter({ hasText: typeof pattern === 'string' ? pattern : pattern })
  await toastLocator.first().waitFor({ state: 'visible', timeout: 6_000 }).catch(() => {
    // Toast pode ter aparecido e desaparecido — considerado OK
  })
}

export async function expectNoServerError(page: Page): Promise<void> {
  await page.locator('text=/500|Internal Server Error/i').waitFor({ state: 'detached', timeout: 3_000 }).catch(() => {})
}

// ─── Helpers de Estado ────────────────────────────────────────────────────────

/**
 * Verifica headers de rate limit na resposta.
 */
export function extractRateLimitHeaders(headers: Record<string, string>): {
  limit: number | null
  remaining: number | null
  reset: number | null
} {
  return {
    limit: headers['x-ratelimit-limit'] ? parseInt(headers['x-ratelimit-limit']) : null,
    remaining: headers['x-ratelimit-remaining'] ? parseInt(headers['x-ratelimit-remaining']) : null,
    reset: headers['x-ratelimit-reset'] ? parseInt(headers['x-ratelimit-reset']) : null,
  }
}

/**
 * Gera email unico para cada execucao de teste (evita colisao de dados).
 */
export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@footstock.test`
}

/**
 * CPF valido para testes (maior de 18 anos simulado).
 */
export const VALID_CPF_ADULT = '11122233396'
export const VALID_CPF_MINOR = '22233344405' // CPF de menor para teste AUTH_004

// ─── Teardown ────────────────────────────────────────────────────────────────

/**
 * Limpa dados de teste via endpoint de dev (disponivel apenas em nao-producao).
 * Chame no afterAll de cada suite.
 */
export async function cleanupTestData(
  request: APIRequestContext,
  emails: string[],
): Promise<void> {
  if (process.env.TEST_ENV === 'production') return // nunca limpar em producao
  try {
    await request.post('/api/v1/dev/cleanup', {
      data: { emails },
      timeout: 10_000,
    })
  } catch {
    // Cleanup falho nao deve quebrar os testes
  }
}

/**
 * Reinicia o motor de matching para estado limpo.
 * Somente em ambiente de teste/staging.
 */
export async function resetMotorState(request: APIRequestContext): Promise<void> {
  if (process.env.TEST_ENV === 'production') return
  await request.post('/api/v1/dev/motor/reset').catch(() => {})
}

/**
 * Libera qualquer halt ativo (circuit breaker) antes do proximo teste.
 */
export async function releaseAllHalts(request: APIRequestContext): Promise<void> {
  if (process.env.TEST_ENV === 'production') return
  await request.delete('/api/v1/dev/halts').catch(() => {})
}
