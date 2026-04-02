// ============================================================================
// Foot Stock — Supabase Session Helpers
// ============================================================================

import { createBrowserClient } from '@supabase/ssr'
import { API_ROUTES } from '@/lib/constants/api'

let _client: ReturnType<typeof createBrowserClient> | null = null
let _missingPublicEnvWarned = false

function getPublicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}

/** Singleton do Supabase client para uso no browser */
export function getSupabaseClient() {
  if (!_client) {
    const { supabaseUrl, supabaseAnonKey } = getPublicEnv()
    if (!supabaseUrl || !supabaseAnonKey) {
      if (!_missingPublicEnvWarned) {
        console.error(
          'NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes para inicializar sessão.'
        )
        _missingPublicEnvWarned = true
      }
      throw new Error('Variáveis públicas do Supabase ausentes.')
    }
    _client = createBrowserClient(supabaseUrl, supabaseAnonKey)
  }
  return _client
}

/** Retorna a sessao atual (null se nao autenticado) */
export async function getSession() {
  const supabase = getSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

/** Retorna o usuario atual do Supabase (null se nao autenticado) */
export async function getCurrentUser() {
  const supabase = getSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** Observa mudancas de autenticacao */
export function onAuthStateChange(
  callback: (event: string, session: unknown) => void
) {
  const supabase = getSupabaseClient()
  return supabase.auth.onAuthStateChange(callback)
}

/** Encerra a sessao e redireciona */
export async function signOut() {
  let accessToken: string | null = null

  try {
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    accessToken = session?.access_token ?? null
  } catch {
    // Sem cliente Supabase válido (ex.: fallback DEV); segue logout server-side.
  }

  try {
    const headers: HeadersInit = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {}

    await fetch(API_ROUTES.AUTH.LOGOUT, {
      method: 'POST',
      headers,
    })
  } catch {
    // Ignora erro de rede e segue para limpeza local.
  }

  try {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
  } catch {
    // Se não houver sessão Supabase, ainda consideramos logout concluído.
  }

  if (typeof window !== 'undefined') {
    window.location.replace('/')
  }
}
