// ============================================================================
// Foot Stock — GET + PATCH /api/v1/admin/assets/[ticker]
// Leitura e edição de um ativo (clube) pelo admin.
//
// SEGURANÇA:
//   • searchText é retornado SOMENTE neste endpoint (SUPER_ADMIN).
//   • O GET /api/v1/admin/assets (lista) nunca retorna searchText.
//   • financials é retornado completo — contém dados financeiros reais.
//   • Permissão mínima: SUPER_ADMIN.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

// Regex para cores hex #RRGGBB
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

// Schema de validação para PATCH
const assetUpdateSchema = z.object({
  displayName: z.string().min(2, 'Nome fictício muito curto').max(120).optional(),
  // realName: nome real do clube (server-only, admin only, NUNCA expor em endpoints públicos)
  realName: z.string().min(2, 'Nome real muito curto').max(100).optional().nullable(),
  division: z.enum(['SERIE_A', 'SERIE_B']).optional(),
  colorPrimary: z.string().regex(HEX_COLOR, 'Cor primária inválida (use #RRGGBB)').optional(),
  colorSecondary: z.string().regex(HEX_COLOR, 'Cor secundária inválida (use #RRGGBB)').optional(),
  logoUrl: z.string().url('URL de logo inválida').optional().nullable(),
  totalShares: z
    .number()
    .int('Total de ações deve ser inteiro')
    .positive('Total de ações deve ser positivo')
    .optional(),
  fairValue: z
    .number()
    .positive('Valor justo deve ser positivo')
    .optional(),
  ipoPrice: z
    .number()
    .positive('Preço IPO deve ser positivo')
    .optional(),
  // searchText: aliases internos de busca — server-only, NUNCA retornar ao cliente
  searchText: z.string().max(1000).optional(),
})

// Helper dev-mode: aceita cookie fs-admin-role quando não há sessão real
function devAuthFallback(request: NextRequest): { user: User; supabaseId: string } | null {
  if (process.env.NODE_ENV !== 'development') return null
  const adminRole = request.cookies.get('fs-admin-role')?.value
  if (!adminRole) return null
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
  return { user: dummyUser, supabaseId: 'dev-user' }
}

interface AssetParams {
  params: Promise<{ ticker: string }>
}

// ---------------------------------------------------------------------------
// GET — Retorna dados completos do ativo (SUPER_ADMIN)
// Inclui searchText (aliases internos), financials completo, cores, logoUrl
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest, { params }: AssetParams) {
  const { ticker } = await params
  let auth = await getAuthUser()
  if (!auth) auth = devAuthFallback(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-055', message: 'Apenas SUPER_ADMIN pode acessar dados completos de ativos.' } },
      { status: 403 }
    )
  }

  try {
    const asset = await prisma.asset.findUnique({
      where: { ticker: ticker.toUpperCase() },
      include: {
        aliases: {
          where: { isActive: true },
          select: { alias: true, isActive: true },
          orderBy: { alias: 'asc' },
        },
      },
    })

    if (!asset) {
      return NextResponse.json(
        { error: { code: 'ASSET-001', message: `Ativo ${ticker} não encontrado.` } },
        { status: 404 }
      )
    }

    // Retorna dados completos INCLUINDO realName, searchText e aliases (SUPER_ADMIN only)
    return ok({
      id: asset.id,
      ticker: asset.ticker,
      displayName: asset.displayName,
      // realName: nome real do clube (SUPER_ADMIN only — NUNCA expor em endpoints públicos)
      realName: asset.realName ?? null,
      clubSlug: asset.clubSlug,
      division: asset.division,
      cluster: asset.cluster,
      currentPrice: asset.currentPrice.toNumber(),
      openPrice: asset.openPrice.toNumber(),
      fairValue: asset.fairValue.toNumber(),
      totalShares: Number(asset.totalShares),
      currentSupply: Number(asset.currentSupply),
      colorPrimary: asset.colorPrimary,
      colorSecondary: asset.colorSecondary,
      logoUrl: asset.logoUrl ?? null,
      isActive: asset.isActive,
      isHalted: asset.isHalted,
      haltReason: asset.haltReason ?? null,
      sentiment: asset.sentiment,
      financials: asset.financials,
      // searchText: aliases internos (SUPER_ADMIN only — NUNCA expor no endpoint público)
      searchText: asset.searchText,
      // aliases: mapeamentos de ticker do mundo real para este ticker fictício
      aliases: asset.aliases.map((a) => a.alias),
      updatedAt: asset.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error('[admin/assets/[ticker]] GET error:', err)
    return errors.server()
  }
}

// ---------------------------------------------------------------------------
// PATCH — Atualiza campos editáveis do ativo (SUPER_ADMIN)
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: AssetParams) {
  const { ticker } = await params
  let auth = await getAuthUser()
  if (!auth) auth = devAuthFallback(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-055', message: 'Apenas SUPER_ADMIN pode editar ativos.' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const parsed = assetUpdateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VAL_001',
            message: 'Dados inválidos',
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 422 }
      )
    }

    const { displayName, realName, division, colorPrimary, colorSecondary, logoUrl, totalShares, fairValue, ipoPrice, searchText } =
      parsed.data

    // Construir updateData apenas com campos fornecidos
    const updateData: Record<string, unknown> = {}
    if (displayName !== undefined) updateData.displayName = displayName
    if (realName !== undefined) updateData.realName = realName ?? null
    if (division !== undefined) updateData.division = division
    if (colorPrimary !== undefined) updateData.colorPrimary = colorPrimary
    if (colorSecondary !== undefined) updateData.colorSecondary = colorSecondary
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl ?? null
    if (totalShares !== undefined) updateData.totalShares = BigInt(totalShares)
    if (fairValue !== undefined) updateData.fairValue = fairValue
    if (searchText !== undefined) updateData.searchText = searchText

    // ipoPrice vive dentro de financials (JSON patch)
    if (ipoPrice !== undefined) {
      const current = await prisma.asset.findUnique({
        where: { ticker: ticker.toUpperCase() },
        select: { financials: true },
      })
      const existingFinancials = (current?.financials as Record<string, unknown>) ?? {}
      updateData.financials = { ...existingFinancials, ipoPrice }
    }

    const asset = await prisma.asset.update({
      where: { ticker: ticker.toUpperCase() },
      data: updateData,
      select: {
        id: true,
        ticker: true,
        displayName: true,
        division: true,
        colorPrimary: true,
        colorSecondary: true,
        logoUrl: true,
        totalShares: true,
        fairValue: true,
        financials: true,
        updatedAt: true,
        // searchText e realName NÃO incluídos no select de retorno do PATCH
        // (o frontend precisa recarregar via GET se quiser os valores atualizados)
      },
    })

    return ok({
      id: asset.id,
      ticker: asset.ticker,
      displayName: asset.displayName,
      division: asset.division,
      colorPrimary: asset.colorPrimary,
      colorSecondary: asset.colorSecondary,
      logoUrl: asset.logoUrl ?? null,
      totalShares: Number(asset.totalShares),
      fairValue: asset.fairValue.toNumber(),
      financials: asset.financials,
      updatedAt: asset.updatedAt.toISOString(),
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'ASSET-001', message: `Ativo ${ticker} não encontrado.` } },
        { status: 404 }
      )
    }
    console.error('[admin/assets/[ticker]] PATCH error:', err)
    return errors.server()
  }
}
