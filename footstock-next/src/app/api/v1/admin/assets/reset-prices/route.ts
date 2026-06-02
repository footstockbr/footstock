// ============================================================================
// FootStock — POST /api/v1/admin/assets/reset-prices
// SuperAdmin: reseta precos de todos os ativos (ou apenas os que estao no
// floor) de volta ao fairValue canonico persistido no DB, com variacao ±5%.
//
// Body (opcional):
//   { "dryRun": true }             — simula sem gravar
//   { "onlyFloored": true }        — atualiza apenas ativos com preco <= floorThreshold
//   { "floorThreshold": 1.5 }      — threshold de floor (default: 1.5)
//   { "variationPct": 0 }          — variacao aleatoria 0-10% (default: 5%)
//
// Retorna lista de alteracoes (ticker, oldPrice, newPrice, fairValue, etc.)
//
// DESIGN: usa fairValue canonico do DB como ancora — nao recomputa formula.
// Isso garante que os precos sejam sempre restaurados para o valor correto
// independente de qual ticker esta no banco.
// ============================================================================

import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

const NUDGE_MIN_PRICE = 1.0

function applyVariation(price: number, variationPct: number): number {
  const factor = variationPct / 100
  const variation = Math.random() * factor * 2 - factor // [-variationPct%, +variationPct%]
  const adjusted = price * (1 + variation)
  return Math.max(NUDGE_MIN_PRICE, parseFloat(adjusted.toFixed(8)))
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return errors.forbidden('Apenas SuperAdmin pode resetar precos de ativos.')
  }

  const body = await request.json().catch(() => ({}))
  const dryRun        = body?.dryRun        === true
  const onlyFloored   = body?.onlyFloored   === true
  const floorThreshold = typeof body?.floorThreshold === 'number'
    ? body.floorThreshold
    : 1.5
  const variationPct = typeof body?.variationPct === 'number'
    ? Math.max(0, Math.min(20, body.variationPct))
    : 5

  try {
    // Lê todos os ativos ativos com fairValue do DB — fonte canônica
    const assets = await prisma.asset.findMany({
      where: {
        isActive: true,
        ...(onlyFloored ? { currentPrice: { lte: floorThreshold } } : {}),
      },
      select: {
        id: true,
        ticker: true,
        division: true,
        currentPrice: true,
        fairValue: true,
        marketCap: true,
        currentSupply: true,
      },
    })

    const changes: Array<{
      ticker: string
      division: string
      oldPrice: number
      newPrice: number
      fairValue: number
      variationPct: number
      oldMarketCap: number
      newMarketCap: number
    }> = []

    for (const asset of assets) {
      const oldPrice    = asset.currentPrice.toNumber()
      const fv          = asset.fairValue.toNumber()

      // Se fairValue nao esta disponivel ou e invalido, pula
      if (!fv || fv <= 0) continue

      const newPrice    = applyVariation(fv, variationPct)
      const supply      = Number(asset.currentSupply)
      const newMarketCap = parseFloat((newPrice * supply).toFixed(2))
      const varPct      = parseFloat((((newPrice - fv) / fv) * 100).toFixed(2))

      changes.push({
        ticker:       asset.ticker,
        division:     asset.division,
        oldPrice,
        newPrice,
        fairValue:    fv,
        variationPct: varPct,
        oldMarketCap: asset.marketCap.toNumber(),
        newMarketCap,
      })
    }

    if (!dryRun && changes.length > 0) {
      await prisma.$transaction(
        changes.map((change) =>
          prisma.asset.update({
            where: { ticker: change.ticker },
            data: {
              currentPrice: change.newPrice,
              openPrice:    change.newPrice,
              closePrice:   change.newPrice,
              marketCap:    change.newMarketCap,
              // fairValue NAO e alterado — e o anchor canonico do DB
            },
          })
        )
      )

      await prisma.adminMarketAction.create({
        data: {
          adminId: auth.user.id,
          action:  'RESET_PRICES',
          reason:  onlyFloored
            ? `Reset de ${changes.length} ativos floored (<= ${floorThreshold}) para fairValue +/- ${variationPct}%`
            : `Reset de ${changes.length} ativos para fairValue +/- ${variationPct}%`,
          details: {
            assetsUpdated: changes.length,
            onlyFloored,
            floorThreshold,
            variationPct,
            executedBy:  auth.user.email,
            executedAt:  new Date().toISOString(),
          },
        },
      })
    }

    return ok({
      dryRun,
      onlyFloored,
      floorThreshold,
      variationPct,
      assetsUpdated: changes.length,
      changes: changes.map((c) => ({
        ticker:       c.ticker,
        division:     c.division,
        oldPrice:     c.oldPrice,
        newPrice:     parseFloat(c.newPrice.toFixed(8)),
        fairValue:    c.fairValue,
        variationPct: c.variationPct,
        oldMarketCap: c.oldMarketCap,
        newMarketCap: c.newMarketCap,
      })),
    })
  } catch (err) {
    console.error('[admin/assets/reset-prices] Error:', err)
    return errors.server()
  }
}
