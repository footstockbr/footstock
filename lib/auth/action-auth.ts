// ============================================================================
// Foot Stock — Auth Helper para Server Actions
// Verifica sessão admin e RBAC sem redirecionar — retorna ActionResult.
// Uso: const result = await getAdminActionUser('motor:control')
//      if (!result.user) return result.actionError
// ============================================================================

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@/lib/prisma'
import { canAccess, type AdminResource } from '@/lib/auth/canAccess'
import { actionError, type ActionResult } from '@/lib/action-utils'
import type { AdminRole } from '@/lib/enums'

type AdminUser = {
  id: string
  adminRole: AdminRole
}

type ActionAuthResult<T = never> =
  | { user: AdminUser; actionError: null }
  | { user: null; actionError: ActionResult<T> }

/**
 * Verifica sessão e permissão RBAC para uso em Server Actions.
 * Retorna { user } em sucesso ou { actionError } para retorno imediato.
 *
 * @example
 * const auth = await getAdminActionUser('motor:control')
 * if (!auth.user) return auth.actionError
 */
export async function getAdminActionUser<T = never>(
  resource: AdminResource
): Promise<ActionAuthResult<T>> {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // No-op em Server Actions
        },
      },
    }
  )

  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser()

  const devAuthEmail =
    process.env.NODE_ENV !== 'production'
      ? cookieStore.get('fs_dev_auth')?.value
      : null

  // Busca adminRole — SEMPRE via DB, nunca via JWT claims
  const dbUser = sessionUser
    ? await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: { id: true, adminRole: true },
      })
    : devAuthEmail
    ? await prisma.user.findUnique({
        where: { email: devAuthEmail },
        select: { id: true, adminRole: true },
      })
    : null

  if (!dbUser?.adminRole) {
    return { user: null, actionError: actionError('Não autorizado') }
  }

  if (!canAccess(dbUser.adminRole as AdminRole, resource)) {
    return {
      user: null,
      actionError: actionError('Sem permissão para esta operação'),
    }
  }

  return {
    user: { id: dbUser.id, adminRole: dbUser.adminRole as AdminRole },
    actionError: null,
  }
}
