// ============================================================================
// Foot Stock — Supabase Session Helpers
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

let _client: ReturnType<typeof createClient> | null = null

/** Singleton do Supabase client para uso no browser */
export function getSupabaseClient() {
  if (!_client) {
    _client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
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
  const supabase = getSupabaseClient()
  await supabase.auth.signOut()
  if (typeof window !== 'undefined') {
    window.location.href = '/'
  }
}
