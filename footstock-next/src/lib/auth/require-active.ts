import 'server-only'

import type { NextResponse } from 'next/server'

import { resolveAuthUser } from '@/lib/auth'
import { errors } from '@/lib/api'
import type { User } from '@/types'

/**
 * Variante de `getAuthUser()` que distingue os dois motivos de negativa:
 *
 *   - nao autenticado         -> 401 AUTH-001 (`errors.unauthorized`)
 *   - conta suspensa/banida   -> 403 AUTH-014/AUTH-015 com o motivo da sancao
 *
 * O cookie NAO e invalidado no caso 403 (decisao 2026-09-03): a conta suspensa
 * por lapso de assinatura precisa continuar navegando para chegar ao checkout e
 * se reativar. Derrubar a sessao mandaria o usuario para o login, onde
 * `auth-credentials.ts:80` o barra -- becos sem saida, que e exatamente o que a
 * regra Zero Fluxos Incompletos proibe.
 *
 * Uso nas rotas:
 *
 *   const auth = await getAuthUserOrBlock()
 *   if ('response' in auth) return auth.response
 *   // auth.user / auth.userId daqui para baixo
 */
export async function getAuthUserOrBlock(): Promise<
  { user: User; userId: string } | { response: NextResponse }
> {
  const resolution = await resolveAuthUser()

  if (resolution.kind === 'ok') {
    return { user: resolution.user, userId: resolution.userId }
  }

  if (resolution.kind === 'blocked') {
    const { code, message, reason } = resolution.restriction
    return { response: errors.accountBlocked(code, message, reason) }
  }

  return { response: errors.unauthorized() }
}
