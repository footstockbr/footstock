// GET /api/v1/admin/news/llm-providers/health — SUPER_ADMIN only
// Snapshot sanitizado (sem token). Sem probe pago.

import { NextRequest } from 'next/server'
import { ok, error as apiError } from '@/lib/api'
import { resolveSuperAdmin } from '@/lib/news/llm-admin-auth'
import { listProvidersAndConfig, sanitizeErrorMessage, getErrorCode } from '@/lib/news/llm-providers-service'

export async function GET(request: NextRequest) {
  const auth = await resolveSuperAdmin(request)
  if ('error' in auth) return auth.error

  try {
    const data = await listProvidersAndConfig()
    return ok({ health: data.health, configVersion: data.config.configVersion })
  } catch (err) {
    return apiError(getErrorCode(err), sanitizeErrorMessage(err), 500)
  }
}
