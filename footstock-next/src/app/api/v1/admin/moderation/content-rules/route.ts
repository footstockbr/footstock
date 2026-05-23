// ============================================================================
// FootStock — GET/PATCH /api/v1/admin/moderation/content-rules (T-028)
// Leitura e toggle das 5 regras de moderação de conteúdo configuráveis.
// Invalidação de cache Redis após toggle.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { moderationEngine } from '@/lib/services/ModerationEngine'

const PatchSchema = z.object({
  name: z.string().min(1).max(50),
  isEnabled: z.boolean(),
})

// GET — lista as 5 regras de conteúdo com estado atual
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json(
      { error: { code: 'AUTH-010', message: 'Não autorizado.' } },
      { status: 401 }
    )
  }
  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN_050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const rules = await prisma.contentModerationRule.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        isEnabled: true,
        updatedAt: true,
      },
    })
    return NextResponse.json({ success: true, data: rules })
  } catch {
    return NextResponse.json(
      { error: { code: 'SYS_001', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}

// PATCH — habilita/desabilita uma regra pelo nome
export async function PATCH(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json(
      { error: { code: 'AUTH-010', message: 'Não autorizado.' } },
      { status: 401 }
    )
  }
  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN_050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VAL_001', message: 'Dados inválidos.' } },
      { status: 422 }
    )
  }

  try {
    const updated = await prisma.contentModerationRule.update({
      where: { name: parsed.data.name },
      data: { isEnabled: parsed.data.isEnabled },
      select: {
        id: true,
        name: true,
        description: true,
        isEnabled: true,
        updatedAt: true,
      },
    })

    // Invalida cache do engine para que próximos posts usem novo estado
    await moderationEngine.invalidateCache()

    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Regra não encontrada.'
    return NextResponse.json(
      { error: { code: 'SYS_001', message: msg } },
      { status: 500 }
    )
  }
}
