// ============================================================================
// Foot Stock — Integration Tests: Auth Helpers
// Configura o mock de Supabase para simular usuário autenticado nos testes
// de rota (route handlers do Next.js App Router).
//
// NUNCA chamar /auth/login para gerar tokens em testes de integração.
// Simular autenticação diretamente via mock do @supabase/ssr.
// ============================================================================

import { createServerClient } from '@supabase/ssr'

// ─── Mock Supabase Client ─────────────────────────────────────────────────────

/**
 * Configura o mock do Supabase para retornar um usuário autenticado específico.
 * Deve ser chamado em beforeEach para cada suite de testes de rota.
 *
 * @param supabaseUserId - ID do usuário no Supabase (= ID no banco Prisma)
 */
export function mockAuthAsUser(supabaseUserId: string): void {
  const mockCreateClient = createServerClient as jest.Mock
  mockCreateClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: supabaseUserId, email: 'mock@supabase.local' } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
        error: null,
      }),
    },
  })
}

/**
 * Configura o mock do Supabase para simular token inválido (401).
 */
export function mockAuthInvalid(): void {
  const mockCreateClient = createServerClient as jest.Mock
  mockCreateClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
    },
  })
}

/**
 * Configura o mock do Supabase para simular ausência de usuário no banco (401).
 */
export function mockAuthUserNotFound(): void {
  const mockCreateClient = createServerClient as jest.Mock
  mockCreateClient.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'nonexistent-supabase-id' } },
        error: null,
      }),
    },
  })
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
