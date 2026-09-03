// ============================================================================
// FootStock — Integration Tests: Auth Helpers
// Configura o mock de autenticação (Auth.js) para simular usuário autenticado
// nos testes de rota (route handlers do Next.js App Router).
//
// NUNCA chamar /auth/login para gerar tokens em testes de integração.
// Simular autenticação diretamente via mock de `@/lib/auth` getAuthUser.
// ============================================================================

import { NextRequest } from 'next/server'

import { getAuthUser, resolveAuthUser } from '@/lib/auth'
import { evaluateAccountAccess } from '@/lib/auth/account-status'

// ─── Mock Auth.js (getAuthUser) ───────────────────────────────────────────────

/**
 * Configura o mock para retornar um usuário autenticado específico.
 * Deve ser chamado em beforeEach para cada suite de testes de rota.
 *
 * Mocka os DOIS resolvedores de `@/lib/auth` (`getAuthUser` e `resolveAuthUser`),
 * porque as rotas de escrita de trading/social passaram a usar
 * `getAuthUserOrBlock` (src/lib/auth/require-active.ts), que consome
 * `resolveAuthUser`. Com o automock do jest, deixar o segundo de fora faria a
 * rota receber `undefined` e responder 500 -- falha de harness disfarcada de
 * falha de produto.
 *
 * A politica de conta bloqueada NAO e simulada: o mock chama o modulo real
 * (`evaluateAccountAccess`). Entao um teste que criar um usuario SUSPENDED ou
 * BANNED exercita a regra de verdade, e nao uma copia dela que pode divergir.
 *
 * Limite honesto do que este mock prova: ele cobre a POLITICA e a resposta da
 * rota, nao a leitura de `status` do banco dentro de `resolveAuthUser` -- essa
 * metade e coberta por tsc e pelo caminho `withAuth`. Como nao ha request HTTP
 * real aqui, o shape vai vazio e a politica trata como mutacao (fail-closed),
 * que e o mesmo default de qualquer chamador sem contexto.
 *
 * @param userId - ID do usuário (= ID no banco Prisma)
 * @param account - status/motivo da conta; ausente = conta ACTIVE
 */
export function mockAuthAsUser(
  userId: string,
  account: { status?: string | null; suspensionReason?: string | null } = {}
): void {
  const user = { id: userId, email: 'mock@integration-test.local', ...account }

  const mockResolve = resolveAuthUser as jest.Mock
  mockResolve.mockImplementation(async () => {
    const restriction = evaluateAccountAccess(account, {})
    return restriction
      ? { kind: 'blocked', restriction }
      : { kind: 'ok', userId, user }
  })

  const mockGetAuthUser = getAuthUser as jest.Mock
  mockGetAuthUser.mockImplementation(async () =>
    evaluateAccountAccess(account, {}) ? null : { userId, user }
  )
}

/**
 * Configura o mock para simular sessão inválida/ausente (401).
 */
export function mockAuthInvalid(): void {
  ;(getAuthUser as jest.Mock).mockResolvedValue(null)
  ;(resolveAuthUser as jest.Mock).mockResolvedValue({ kind: 'anonymous' })
}

/**
 * Configura o mock para simular ausência de usuário no banco (401).
 */
export function mockAuthUserNotFound(): void {
  ;(getAuthUser as jest.Mock).mockResolvedValue(null)
  ;(resolveAuthUser as jest.Mock).mockResolvedValue({ kind: 'anonymous' })
}

// ─── NextRequest Helper ───────────────────────────────────────────────────────

/**
 * Cria um NextRequest de verdade para testar route handlers.
 *
 * Devolve `NextRequest`, nao `Request`: as rotas leem `request.nextUrl` para
 * paginacao e filtro (`parsePagination(searchParams, ...)`), e num `Request` nu
 * essa propriedade e undefined -- o handler morria em
 * "Cannot destructure property 'searchParams'" e o teste registrava 500 como se
 * fosse falha da rota. `nextUrl` so existe na subclasse do Next.
 *
 * Exemplo:
 *   const req = buildNextRequest('POST', '/api/v1/orders', { ticker: 'URU3', ... })
 *   const res = await POST(req)
 */
export function buildNextRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  const url = `http://localhost:3000${path}`
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token-bypassed-by-mock',
      ...headers,
    },
  }

  if (body !== undefined && method !== 'GET') {
    options.body = JSON.stringify(body)
  }

  return new NextRequest(url, options)
}

/**
 * Extrai JSON do response de um route handler Next.js.
 */
export async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
