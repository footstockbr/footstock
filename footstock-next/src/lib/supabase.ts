import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

import {
  recordLegacyAuthCall,
  type LegacyAuthOperation,
} from '@/lib/observability/legacy-auth-counter'

// ---------------------------------------------------------------------------
// NXAUTH-08A — instrumentação de auth legacy
// ---------------------------------------------------------------------------
// Toda chamada a `client.auth.X` ou `client.auth.admin.X` passa por um Proxy
// que incrementa contadores Redis antes de delegar para o método real. Os
// contadores destravam o sunset gate de NXAUTH-09.
// ---------------------------------------------------------------------------

const TRACKED_AUTH_OPERATIONS = new Set<string>([
  'getUser',
  'signInWithPassword',
  'setSession',
  'refreshSession',
  'signOut',
  'resetPasswordForEmail',
  'exchangeCodeForSession',
  'updateUser',
])

const TRACKED_ADMIN_OPERATIONS = new Set<string>([
  'createUser',
  'deleteUser',
  'updateUserById',
  'inviteUserByEmail',
])

function instrumentMethod<T extends (...args: unknown[]) => unknown>(
  fn: T,
  operation: LegacyAuthOperation,
  thisArg: unknown,
): T {
  return ((...args: unknown[]) => {
    // Fire-and-forget — nunca bloquear a auth path real.
    void recordLegacyAuthCall(operation)
    return (fn as (...a: unknown[]) => unknown).apply(thisArg, args)
  }) as T
}

function wrapAdmin<TAdmin extends object>(admin: TAdmin): TAdmin {
  return new Proxy(admin, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof prop !== 'string' || typeof value !== 'function') return value
      if (!TRACKED_ADMIN_OPERATIONS.has(prop)) return value
      return instrumentMethod(
        value as (...a: unknown[]) => unknown,
        `admin.${prop}` as LegacyAuthOperation,
        target,
      )
    },
  })
}

function wrapAuth<TAuth extends object>(auth: TAuth): TAuth {
  return new Proxy(auth, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'admin' && value && typeof value === 'object') {
        return wrapAdmin(value as object)
      }
      if (typeof prop !== 'string' || typeof value !== 'function') return value
      if (!TRACKED_AUTH_OPERATIONS.has(prop)) return value
      return instrumentMethod(
        value as (...a: unknown[]) => unknown,
        prop as LegacyAuthOperation,
        target,
      )
    },
  })
}

function instrumentClient<TClient extends { auth: object }>(client: TClient): TClient {
  // Substitui `auth` por um Proxy instrumentado. Mantém demais APIs intactas.
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'auth') {
        const auth = Reflect.get(target, prop, receiver)
        return auth ? wrapAuth(auth as object) : auth
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

// Cliente de servidor (usa cookies de sessão)
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  const raw = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignorado em Server Components — sem impacto em API Routes
          }
        },
      },
    }
  )

  return instrumentClient(raw)
}

// Cliente admin (service role, sem RLS)
const _supabaseAdminRaw: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export const supabaseAdmin = instrumentClient(_supabaseAdminRaw)
