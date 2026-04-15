import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

const HaltAssetSchema = z.object({
  reason: z.string().min(5).max(100),
})

function serializeAsset(a: {
  id: string; ticker: string; displayName: string; division: string
  currentPrice: { toNumber(): number }; fairValue: { toNumber(): number }
  currentSupply: bigint; totalShares: bigint; isHalted: boolean
  haltReason: string | null; colorPrimary: string; colorSecondary: string
  financials: unknown; sentiment: string; updatedAt: Date
}) {
  return {
    id: a.id,
    ticker: a.ticker,
    displayName: a.displayName,
    division: a.division,
    currentPrice: a.currentPrice.toNumber(),
    fairValue: a.fairValue.toNumber(),
    currentSupply: Number(a.currentSupply),
    totalShares: Number(a.totalShares),
    isHalted: a.isHalted,
    haltReason: a.haltReason ?? null,
    colors: { primary: a.colorPrimary, secondary: a.colorSecondary },
    financials: a.financials,
    sentiment: a.sentiment,
    updatedAt: a.updatedAt.toISOString(),
  }
}

// POST /api/v1/admin/assets/:ticker/halt — ADMIN+
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  const { ticker } = await params

  try {
    const body = await request.json()
    const parsed = HaltAssetSchema.safeParse(body)
    if (!parsed.success) return errors.validation()

    const asset = await prisma.asset.findUnique({ where: { ticker: ticker.toUpperCase() } })
    if (!asset) return errors.notFound('Ativo não encontrado.')

    const halted = await prisma.asset.update({
      where: { ticker: ticker.toUpperCase() },
      data: { isHalted: true, haltReason: parsed.data.reason },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'HALT_ASSET',
        ticker: ticker.toUpperCase(),
        details: { reason: parsed.data.reason },
      },
    })

    return ok(serializeAsset(halted))
  } catch {
    return errors.server()
  }
}

// DELETE /api/v1/admin/assets/:ticker/halt — ADMIN+
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  const { ticker } = await params

  try {
    const asset = await prisma.asset.findUnique({ where: { ticker: ticker.toUpperCase() } })
    if (!asset) return errors.notFound('Ativo não encontrado.')

    const released = await prisma.asset.update({
      where: { ticker: ticker.toUpperCase() },
      data: { isHalted: false, haltReason: null },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'RELEASE_HALT',
        ticker: ticker.toUpperCase(),
        details: {},
      },
    })

    return ok(serializeAsset(released))
  } catch {
    return errors.server()
  }
}
