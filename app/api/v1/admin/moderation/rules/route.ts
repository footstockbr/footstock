// ============================================================================
// Foot Stock — GET /api/v1/admin/moderation/rules
//              PATCH /api/v1/admin/moderation/rules
// Gerenciamento das 5 regras de auto-moderação — SuperAdmin only
// Fonte: module-18/TASK-4/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { autoModeration, MODERATION_RULE_ID } from '@/lib/services/AutoModeration'
import type { ModerationRuleId } from '@/lib/services/AutoModeration'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const UpdateRuleSchema = z.object({
  ruleId: z.number().int().min(1).max(5),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
})

// ---------------------------------------------------------------------------
// GET /api/v1/admin/moderation/rules
// ---------------------------------------------------------------------------

async function getRulesHandler(_req: NextRequest) {
  const rules = await autoModeration.getRules()
  return NextResponse.json({ success: true, data: rules })
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/admin/moderation/rules
// ---------------------------------------------------------------------------

async function updateRuleHandler(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Body inválido.' } },
      { status: 400 }
    )
  }

  const parsed = UpdateRuleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: parsed.error.issues[0]?.message } },
      { status: 422 }
    )
  }

  const { ruleId, enabled, config } = parsed.data

  // Verificar que ruleId é válido
  const validIds = Object.values(MODERATION_RULE_ID)
  if (!validIds.includes(ruleId as ModerationRuleId)) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: `ruleId ${ruleId} inválido.` } },
      { status: 422 }
    )
  }

  const updates: Record<string, unknown> = {}
  if (enabled !== undefined) updates.enabled = enabled
  if (config !== undefined) updates.config = config

  const updated = await autoModeration.updateRule(ruleId as ModerationRuleId, updates)
  return NextResponse.json({ success: true, data: updated })
}

// ---------------------------------------------------------------------------
// Exportações — SuperAdmin only (content:moderate recurso existente ou forum)
// ---------------------------------------------------------------------------

export const GET = withAdmin('forum:moderate')(getRulesHandler)
export const PATCH = withAdmin('forum:moderate')(updateRuleHandler)
