// GET + PATCH /api/v1/admin/ai-prompt-config — SUPER_ADMIN only
// Reads/updates the singleton ai_prompt_configs row (id='default')
// Redis cache: ai:prompt-config (TTL 1h), invalidated on PATCH

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

const CACHE_KEY = 'ai:prompt-config'
const CACHE_TTL = 3600 // 1h

interface PromptConfigRow {
  id: string
  persona: string
  context: string
  analysis_guidelines: string
  risk_criteria: string
  tone: string
  extra_instructions: string
  updated_at: Date
  updated_by: string | null
}

const EDITABLE_FIELDS = [
  'persona',
  'context',
  'analysis_guidelines',
  'risk_criteria',
  'tone',
  'extra_instructions',
] as const

type EditableField = (typeof EDITABLE_FIELDS)[number]

/** Resolve auth with dev cookie fallback (same pattern as other admin routes) */
async function resolveAdmin(request: NextRequest) {
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
        ageVerificationPending: false,
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return { error: errors.unauthorized() }
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN' as AdminRole)) {
    return {
      error: NextResponse.json(
        { error: { code: 'ADMIN-050', message: 'Permissão insuficiente. Apenas SUPER_ADMIN pode acessar.' } },
        { status: 403 }
      ),
    }
  }

  return { user: auth.user }
}

function toDto(config: PromptConfigRow) {
  return {
    persona: config.persona,
    context: config.context,
    analysisGuidelines: config.analysis_guidelines,
    riskCriteria: config.risk_criteria,
    tone: config.tone,
    extraInstructions: config.extra_instructions,
    updatedAt: config.updated_at,
    updatedBy: config.updated_by,
  }
}

// GET /api/v1/admin/ai-prompt-config
export async function GET(request: NextRequest) {
  const auth = await resolveAdmin(request)
  if ('error' in auth) return auth.error

  // Try cache first
  try {
    const cached = await redis.get(CACHE_KEY)
    if (cached) {
      return ok(JSON.parse(cached as string))
    }
  } catch {
    // Redis unavailable
  }

  try {
    const rows = await prisma.$queryRaw<PromptConfigRow[]>`
      SELECT id, persona, context, analysis_guidelines, risk_criteria, tone, extra_instructions, updated_at, updated_by
      FROM ai_prompt_configs
      WHERE id = 'default'
      LIMIT 1
    `

    if (!rows.length) {
      return errors.notFound('Configuração de prompt não encontrada. Execute a migration M048.')
    }

    const dto = toDto(rows[0])

    try {
      await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(dto))
    } catch { /* ignore */ }

    return ok(dto)
  } catch (err) {
    console.error('[ai-prompt-config] GET error:', err)
    return errors.server()
  }
}

// PATCH /api/v1/admin/ai-prompt-config
export async function PATCH(request: NextRequest) {
  const auth = await resolveAdmin(request)
  if ('error' in auth) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return errors.validation('JSON inválido no corpo da requisição.')
  }

  // Validate: only editable fields, all must be strings
  const updates: Partial<Record<EditableField, string>> = {}
  for (const key of Object.keys(body)) {
    const field = key === 'analysisGuidelines' ? 'analysis_guidelines'
      : key === 'riskCriteria' ? 'risk_criteria'
      : key === 'extraInstructions' ? 'extra_instructions'
      : key as EditableField

    if (!EDITABLE_FIELDS.includes(field)) {
      return errors.validation(`Campo "${key}" não é editável.`)
    }
    if (typeof body[key] !== 'string') {
      return errors.validation(`Campo "${key}" deve ser uma string.`)
    }
    updates[field] = body[key] as string
  }

  if (Object.keys(updates).length === 0) {
    return errors.validation('Nenhum campo para atualizar.')
  }

  try {
    const setClauses: string[] = []
    const values: unknown[] = []
    let paramIdx = 1

    for (const [field, value] of Object.entries(updates)) {
      setClauses.push(`"${field}" = $${paramIdx}`)
      values.push(value)
      paramIdx++
    }

    setClauses.push(`"updated_at" = NOW()`)
    setClauses.push(`"updated_by" = $${paramIdx}`)
    values.push(auth.user.id)

    const query = `UPDATE ai_prompt_configs SET ${setClauses.join(', ')} WHERE id = 'default'`
    await prisma.$executeRawUnsafe(query, ...values)

    // Invalidate caches (prompt config + all analysis caches)
    try {
      await redis.del(CACHE_KEY)
    } catch { /* ignore */ }

    // Return updated config
    const rows = await prisma.$queryRaw<PromptConfigRow[]>`
      SELECT id, persona, context, analysis_guidelines, risk_criteria, tone, extra_instructions, updated_at, updated_by
      FROM ai_prompt_configs
      WHERE id = 'default'
      LIMIT 1
    `

    const dto = toDto(rows[0])

    try {
      await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(dto))
    } catch { /* ignore */ }

    return ok(dto)
  } catch (err) {
    console.error('[ai-prompt-config] PATCH error:', err)
    return errors.server()
  }
}
