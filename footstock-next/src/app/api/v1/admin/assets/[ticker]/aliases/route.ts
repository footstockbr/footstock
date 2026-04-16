// ============================================================================
// FootStock — POST /api/v1/admin/assets/[ticker]/aliases (T-031)
// Admin: adiciona alias a um ativo canônico.
//
// Permissão: SUPER_ADMIN
// Body: { alias: "FLA3" }
// Efeito: cria ou reativa AssetAlias, invalida cache Redis
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { errors } from '@/lib/api'
import { AliasService, addAliasSchema } from '@/services/AliasService'
import type { AdminRole } from '@/types'

interface AssetParams {
  params: Promise<{ ticker: string }>
}

// POST /api/v1/admin/assets/:ticker/aliases
export async function POST(request: NextRequest, { params }: AssetParams) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole as AdminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-055', message: 'Apenas SUPER_ADMIN pode gerenciar aliases de ativos.' } },
      { status: 403 }
    )
  }

  const { ticker } = await params

  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json(
        { error: { code: 'VAL_001', message: 'Body JSON inválido.' } },
        { status: 400 }
      )
    }

    const parsed = addAliasSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VAL_001',
            message: 'Alias inválido.',
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 422 }
      )
    }

    await AliasService.addAlias(ticker, parsed.data.alias)

    return NextResponse.json(
      {
        data: {
          ticker: ticker.toUpperCase(),
          alias: parsed.data.alias.toUpperCase(),
          message: `Alias ${parsed.data.alias.toUpperCase()} adicionado com sucesso.`,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao adicionar alias.'

    // Alias já existe (unique constraint)
    if (message.includes('Unique constraint') || (err as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: { code: 'ALIAS_001', message: 'Este alias já está cadastrado.' } },
        { status: 409 }
      )
    }

    // Erros de domínio (alias = ticker, alias é canônico, etc.)
    if (message.includes('não pode') || message.includes('inválido') || message.includes('já é um ticker')) {
      return NextResponse.json(
        { error: { code: 'ALIAS_002', message } },
        { status: 422 }
      )
    }

    console.error('[admin/assets/aliases] POST error:', err)
    return errors.server()
  }
}

// GET /api/v1/admin/assets/:ticker/aliases — lista aliases ativos
export async function GET(_request: NextRequest, { params }: AssetParams) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole as AdminRole, 'MONITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  const { ticker } = await params

  try {
    const aliases = await AliasService.getAliasesForTicker(ticker)
    return NextResponse.json({
      data: {
        ticker: ticker.toUpperCase(),
        aliases,
        count: aliases.length,
      },
    })
  } catch (err) {
    console.error('[admin/assets/aliases] GET error:', err)
    return errors.server()
  }
}
