// GET/POST/PATCH /api/v1/admin/news/llm-providers — SUPER_ADMIN only
// Tokens nunca retornados; apenas tokenConfigured.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, error as apiError } from '@/lib/api'
import { adminAuditService } from '@/lib/services/shared'
import { resolveSuperAdmin } from '@/lib/news/llm-admin-auth'
import {
  applyProviderState,
  createProvider,
  getErrorCode,
  listProvidersAndConfig,
  sanitizeErrorMessage,
} from '@/lib/news/llm-providers-service'

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
