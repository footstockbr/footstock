// PUT /api/v1/admin/news/llm-providers/[id]/token — SUPER_ADMIN only
// Grava/rotaciona a credencial de um provider existente (AES-256-GCM em repouso).
// Write-only: o token nunca volta na resposta, so `tokenConfigured`.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, error as apiError } from '@/lib/api'
import { adminAuditService } from '@/lib/services/shared'
import { resolveSuperAdmin } from '@/lib/news/llm-admin-auth'
import {
  getErrorCode,
  sanitizeErrorMessage,
  updateProviderToken,
} from '@/lib/news/llm-providers-service'

const tokenSchema = z.object({
  token: z.string().min(1).max(4096),
})

export async function PUT(
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
    return apiError('LLM-400', 'JSON invalido — envie token', 400)
  }

  const parsed = tokenSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('LLM-400', 'token obrigatorio (1 a 4096 caracteres)', 400)
  }

  try {
    const result = await updateProviderToken({
      id,
      token: parsed.data.token,
      adminId: auth.user.id,
    })
    // Auditoria sem qualquer fragmento da credencial — so o tamanho.
    await adminAuditService.log({
      adminId: auth.user.id,
      action: 'NEWS_LLM_PROVIDER_TOKEN_UPDATE',
      details: { providerId: id, tokenLength: parsed.data.token.trim().length },
    })
    return ok(result)
  } catch (err) {
    const code = getErrorCode(err)
    const status = code === 'LLM-404' ? 404 : code === 'LLM-002' ? 400 : 500
    return apiError(code, sanitizeErrorMessage(err), status)
  }
}
