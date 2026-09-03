// ============================================================================
// FootStock — Integration Tests: Auth Helpers
// Configura o mock de autenticação (Auth.js) para simular usuário autenticado
// nos testes de rota (route handlers do Next.js App Router).
//
// NUNCA chamar /auth/login para gerar tokens em testes de integração.
// Simular autenticação diretamente via mock de `@/lib/auth` getAuthUser.
// ============================================================================

import { NextRequest } from 'next/server'

import { getAuthUser } from '@/lib/auth'

// ─── Mock Auth.js (getAuthUser) ───────────────────────────────────────────────

/**
 * Configura o mock para retornar um usuário autenticado específico.
 * Deve ser chamado em beforeEach para cada suite de testes de rota.
 *
 * @param userId - ID do usuário (= ID no banco Prisma)
 */
export function mockAuthAsUser(userId: string): void {
  const mockGetAuthUser = getAuthUser as jest.Mock
  mockGetAuthUser.mockResolvedValue({
    userId,
    user: { id: userId, email: 'mock@integration-test.local' },
  })
}

/**
 * Configura o mock para simular sessão inválida/ausente (401).
 */
export function mockAuthInvalid(): void {
  const mockGetAuthUser = getAuthUser as jest.Mock
  mockGetAuthUser.mockResolvedValue(null)
}

/**
 * Configura o mock para simular ausência de usuário no banco (401).
 */
export function mockAuthUserNotFound(): void {
  const mockGetAuthUser = getAuthUser as jest.Mock
  mockGetAuthUser.mockResolvedValue(null)
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
