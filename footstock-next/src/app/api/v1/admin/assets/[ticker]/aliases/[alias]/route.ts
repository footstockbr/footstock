// ============================================================================
// Foot Stock — DELETE /api/v1/admin/assets/[ticker]/aliases/[alias] (T-031)
// Admin: remove (desativa) um alias de ativo.
//
// Permissão: SUPER_ADMIN
// Efeito: marca isActive=false, invalida cache Redis
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { errors } from '@/lib/api'
import { AliasService } from '@/services/AliasService'
import type { AdminRole } from '@/types'

interface AliasParams {
  params: Promise<{ ticker: string; alias: string }>
}

// DELETE /api/v1/admin/assets/:ticker/aliases/:alias
export async function DELETE(request: NextRequest, { params }: AliasParams) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole as AdminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-055', message: 'Apenas SUPER_ADMIN pode remover aliases de ativos.' } },
      { status: 403 }
    )
  }

  const { alias } = await params

  try {
    await AliasService.removeAlias(alias)

    return NextResponse.json(
      {
        data: {
          alias: alias.toUpperCase(),
          message: `Alias ${alias.toUpperCase()} removido com sucesso.`,
        },
      },
      { status: 200 }
    )
  } catch (err) {
    // Alias não encontrado (Prisma P2025)
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'ALIAS_003', message: `Alias ${alias.toUpperCase()} não encontrado.` } },
        { status: 404 }
      )
    }

    console.error('[admin/assets/aliases/[alias]] DELETE error:', err)
    return errors.server()
  }
}
