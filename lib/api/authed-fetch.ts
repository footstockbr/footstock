// ============================================================================
// Foot Stock — authedFetch
// Wrapper sobre fetch nativo que injeta automaticamente o Bearer token da sessão
// Supabase. Substitui chamadas diretas de fetch() para rotas protegidas.
// ============================================================================

import { getSupabaseClient } from '@/lib/auth/session'

type FetchArgs = Parameters<typeof fetch>

/**
 * fetch() com Authorization: Bearer injetado automaticamente.
 * Drop-in replacement para fetch() em Client Components.
 */
export async function authedFetch(input: FetchArgs[0], init?: FetchArgs[1]): Promise<Response> {
  let token: string | null = null

  try {
    const supabase = getSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token ?? null
  } catch {
    // Supabase indisponível ou env ausente — segue sem token
  }

  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(input, { ...init, headers })
}
