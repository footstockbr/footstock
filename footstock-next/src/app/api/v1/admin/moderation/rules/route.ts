// ============================================================================
// FootStock — GET /api/v1/admin/moderation/rules
//              PATCH /api/v1/admin/moderation/rules
// Leitura e atualização das 5 regras de auto-moderação configuráveis.
// Persistência: Redis (primário) → DB (backup). Falha silenciosa.
// Rastreabilidade: FDD noticias-comunidade §5, module-18/TASK-4
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { autoModeration, type ModerationRuleId } from '@/lib/services/AutoModeration'

const PatchSchema = z.object({
  id: z.number().int().min(1).max(5),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).optional(),
})

// GET — lista todas as 5 regras
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: { code: 'AUTH-010', message: 'Não autorizado.' } }, { status: 401 })
  }
  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return NextResponse.json({ error: { code: 'ADMIN_050', message: 'Permissão insuficiente.' } }, { status: 403 })
  }

  try {
    const rules = await autoModeration.getRules()
    return NextResponse.json({ success: true, data: rules })
  } catch {
    return NextResponse.json({ error: { code: 'SYS_001', message: 'Erro interno.' } }, { status: 500 })
  }
}

// PATCH — habilita/desabilita uma regra ou atualiza sua config
export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: { code: 'AUTH-010', message: 'Não autorizado.' } }, { status: 401 })
  }
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN_050', message: 'Apenas SUPER_ADMIN pode alterar regras de auto-moderação.' } },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VAL_001', message: 'Dados inválidos.' } }, { status: 422 })
  }

  try {
    const updated = await autoModeration.updateRule(
      parsed.data.id as ModerationRuleId,
      {
        enabled: parsed.data.enabled,
        ...(parsed.data.config ? { config: parsed.data.config } : {}),
      }
    )
    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro interno.'
    return NextResponse.json({ error: { code: 'SYS_001', message: msg } }, { status: 500 })
  }
}
