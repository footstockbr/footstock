// ============================================================================
// FootStock — Integration Tests: Auth Helpers
// Configura o mock de autenticação (Auth.js) para simular usuário autenticado
// nos testes de rota (route handlers do Next.js App Router).
//
// NUNCA chamar /auth/login para gerar tokens em testes de integração.
// Simular autenticação diretamente via mock de `@/lib/auth` getAuthUser.
// ============================================================================

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
 * Cria um NextRequest simulado para testar route handlers.
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
): Request {
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

  return new Request(url, options)
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
