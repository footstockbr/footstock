// GET/POST/PATCH /api/v1/admin/news/llm-providers — SUPER_ADMIN only
// Tokens nunca retornados; apenas tokenConfigured.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { ok, errors, error as apiError } from '@/lib/api'
import { adminAuditService } from '@/lib/services/shared'
import type { User, AdminRole } from '@/types'
import {
  applyProviderState,
  createProvider,
  getErrorCode,
  listProvidersAndConfig,
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

export async function GET(request: NextRequest) {
  const auth = await resolveSuperAdmin(request)
  if ('error' in auth) return auth.error

  try {
    const data = await listProvidersAndConfig()
    return ok(data)
  } catch (err) {
    console.error('[llm-providers GET]', sanitizeErrorMessage(err))
    return apiError(getErrorCode(err), sanitizeErrorMessage(err), 500)
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  token: z.string().min(1).max(4096),
})

export async function POST(request: NextRequest) {
  const auth = await resolveSuperAdmin(request)
  if ('error' in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('LLM-400', 'JSON invalido', 400)
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('LLM-400', 'Nome e token sao obrigatorios', 400)
  }

  try {
    const provider = await createProvider({
      name: parsed.data.name,
      token: parsed.data.token,
      adminId: auth.user.id,
    })
    await adminAuditService.log({
      adminId: auth.user.id,
      action: 'NEWS_LLM_PROVIDER_CREATE',
      details: { providerId: provider.id, name: provider.name, slug: provider.slug },
    })
    return ok({ provider }, 201)
  } catch (err) {
    const code = getErrorCode(err)
    const status = code === 'LLM-001' || code === 'LLM-002' || code === 'LLM-003' || code === 'LLM-004' ? 400 : 500
    return apiError(code, sanitizeErrorMessage(err), status)
  }
}

const patchSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  enabledMap: z.record(z.string(), z.boolean()),
  activeProviderId: z.string().nullable(),
})

export async function PATCH(request: NextRequest) {
  const auth = await resolveSuperAdmin(request)
  if ('error' in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('LLM-400', 'JSON invalido', 400)
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('LLM-400', 'Payload invalido', 400)
  }

  try {
    const result = await applyProviderState({
      expectedVersion: parsed.data.expectedVersion,
      enabledMap: parsed.data.enabledMap,
      activeProviderId: parsed.data.activeProviderId,
      adminId: auth.user.id,
    })
    await adminAuditService.log({
      adminId: auth.user.id,
      action: 'NEWS_LLM_PROVIDER_APPLY',
      details: {
        activeProviderId: result.config.activeProviderId,
        llmEnabled: result.config.llmEnabled,
        configVersion: result.config.configVersion,
      },
    })
    return ok(result)
  } catch (err) {
    const code = getErrorCode(err)
    const status = code === 'LLM-409' ? 409 : code === 'LLM-005' ? 400 : 500
    return apiError(code, sanitizeErrorMessage(err), status)
  }
}
