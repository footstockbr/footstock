// ============================================================================
// Auth.js v5 session reader — decodifica cookie `(__Secure-)authjs.session-token`
// ----------------------------------------------------------------------------
// Lido por getAuthUser (lib/auth.ts e lib/auth/server.ts) e por outros helpers
// que precisam resolver a identidade do usuario antes de fallback para Supabase.
//
// Importacao DIRETA via `@auth/core/jwt` evita circular import com `@/auth`
// (lib/auth.ts <-> auth.ts) — auth.ts depende de lib/auth para conflict
// detection helpers.
//
// Contrato deve casar com /api/v1/auth/login (mesmo salt + secret + cookie name).
// ============================================================================

import 'server-only'

import { cookies } from 'next/headers'

const AUTHJS_COOKIE_PROD = '__Secure-authjs.session-token'
const AUTHJS_COOKIE_DEV = 'authjs.session-token'

export type AuthjsSessionPayload = {
  id: string
  email?: string | null
}

export async function readAuthjsSession(): Promise<AuthjsSessionPayload | null> {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null

  let cookieStore: Awaited<ReturnType<typeof cookies>>
  try {
    cookieStore = await cookies()
  } catch {
    return null
  }

  // Tenta ambos os nomes (prod + dev) — robustez quando NODE_ENV nao bate
  // exatamente com o cookie presente (ex: preview deploys, teste com curl).
  const cookieNames = [AUTHJS_COOKIE_PROD, AUTHJS_COOKIE_DEV]

  const presentCookies = cookieNames
    .map((name) => ({ name, value: cookieStore.get(name)?.value }))
    .filter((c): c is { name: string; value: string } => Boolean(c.value))

  if (presentCookies.length === 0) return null

  // Dynamic import: @auth/core/jwt e ESM-only e quebra parse do Jest no
  // import top-level. Lazy load mantem testes que nao tocam o cookie verdes
  // sem precisar customizar transformIgnorePatterns.
  const { decode } = await import('@auth/core/jwt')

  for (const { name, value } of presentCookies) {
    try {
      const decoded = await decode({ token: value, secret, salt: name })
      if (decoded?.id) {
        return {
          id: String(decoded.id),
          email: (decoded.email as string | null | undefined) ?? null,
        }
      }
      if (decoded?.sub) {
        return {
          id: String(decoded.sub),
          email: (decoded.email as string | null | undefined) ?? null,
        }
      }
    } catch {
      // salt errado / token corrompido — tenta proximo nome
    }
  }

  return null
}

/**
 * Decodifica um JWE Auth.js recebido como Bearer token (clientes nativos
 * Expo/iOS/Android, que nao podem ler cookies HttpOnly). O token e o mesmo
 * `access_token` emitido por /api/v1/auth/login (encode com salt = nome do
 * cookie). Tenta ambos os salts (prod + dev) para robustez cross-ambiente.
 */
export async function decodeAuthjsToken(
  rawToken: string,
): Promise<AuthjsSessionPayload | null> {
  const secret = process.env.AUTH_SECRET
  if (!secret || !rawToken) return null

  const { decode } = await import('@auth/core/jwt')

  for (const salt of [AUTHJS_COOKIE_PROD, AUTHJS_COOKIE_DEV]) {
    try {
      const decoded = await decode({ token: rawToken, secret, salt })
      const id = decoded?.id ?? decoded?.sub
      if (id) {
        return {
          id: String(id),
          email: (decoded?.email as string | null | undefined) ?? null,
        }
      }
    } catch {
      // salt errado / token corrompido — tenta proximo salt
    }
  }

  return null
}
