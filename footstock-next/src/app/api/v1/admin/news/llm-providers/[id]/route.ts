// DELETE /api/v1/admin/news/llm-providers/[id] — SUPER_ADMIN only
// Exige confirmName nominal. Se ativo, Node-only atomico + limpa credencial.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { ok, errors, error as apiError } from '@/lib/api'
import { adminAuditService } from '@/lib/services/shared'
import type { User, AdminRole } from '@/types'
import {
  deleteProvider,
  getErrorCode,
  sanitizeErrorMessage,
} from '@/lib/news/llm-providers-service'

async function resolveSuperAdmin(request: NextRequest) {
  let auth = await getAuthUser()

  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser: User = {
        id: 'dev-user',
        email: 'dev@foot-stock.test',
        name: 'Dev User',
        phone: null,
        birthDate: '',
        favoriteClub: '',
        favoriteClubDisplayName: null,
        userType: 'NORMAL',
        investorProfile: 'INICIANTE',
        planType: 'JOGADOR',
        fsBalance: 0,
        marginBlocked: 0,
        tourCompleted: false,
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return { error: errors.unauthorized() }
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN' as AdminRole)) {
    return {
      error: NextResponse.json(
        { error: { code: 'ADMIN-050', message: 'Permissão insuficiente. Apenas SUPER_ADMIN pode acessar.' } },
        { status: 403 },
      ),
    }
  }

  return { user: auth.user }
}

const deleteSchema = z.object({
  confirmName: z.string().min(1).max(80),
})

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  const auth = await resolveSuperAdmin(request)
  if ('error' in auth) return auth.error

  const params = await Promise.resolve(context.params)
  const id = params.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('LLM-400', 'JSON invalido — envie confirmName', 400)
  }

  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('LLM-400', 'confirmName obrigatorio', 400)
  }

  try {
    const result = await deleteProvider({
      id,
      confirmName: parsed.data.confirmName,
      adminId: auth.user.id,
    })
    await adminAuditService.log({
      adminId: auth.user.id,
      action: 'NEWS_LLM_PROVIDER_DELETE',
      details: { providerId: id, name: parsed.data.confirmName },
    })
    return ok(result)
  } catch (err) {
    const code = getErrorCode(err)
    const status =
      code === 'LLM-404' ? 404 : code === 'LLM-006' ? 400 : 500
    return apiError(code, sanitizeErrorMessage(err), status)
  }
}
