// ============================================================================
// FootStock — POST /api/v1/admin/assets/restore-from-seed
// SuperAdmin: restaura fairValue + currentPrice + closePrice para os valores
// canônicos do seed (fonte da verdade), corrigindo corrupção causada por
// chamadas anteriores ao reset-prices com fórmula incorreta.
//
// O que faz:
//   1. Atualiza fairValue, currentPrice, openPrice, closePrice no DB
//   2. Limpa halts (isHalted, haltReason, haltedUntil)
//   3. Publica ADJUST_PRICE no canal motor:control para cada ativo
//      (atualiza currentPrice + closePrice na memória do motor)
//
// IMPORTANTE: fairValue na memória do motor NÃO é atualizado pelo ADJUST_PRICE.
// Após chamar este endpoint, reinicie o serviço motor no Railway para que ele
// faça warm-start e carregue o fairValue correto do DB.
//
// Body: { "dryRun": true }
// ============================================================================

import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'
import { ok, errors } from '@/lib/api'
import { IPO_PRICING_2026 } from '@/lib/constants/ipo-pricing-2026'

// Fonte da verdade: tabela canônica de precificação IPO 2026 (doc Convocados 2025).
// Restaura fairValue (= Preço IPO) E número de cotas (totalShares/currentSupply).

export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return errors.forbidden('Apenas SuperAdmin pode restaurar preços do seed.')
  }

  const body = await request.json().catch(() => ({}))
  const dryRun = body?.dryRun === true

  try {
    const assets = await prisma.asset.findMany({
      where: { ticker: { in: Object.keys(IPO_PRICING_2026) } },
      select: { id: true, ticker: true, currentPrice: true, fairValue: true, currentSupply: true },
    })

    const changes: Array<{
      ticker:    string
      assetId:   string
      oldPrice:  number
      oldFV:     number
      newPrice:  number
      newShares: number
    }> = []

    for (const asset of assets) {
      const pricing = IPO_PRICING_2026[asset.ticker]
      if (!pricing) continue
      changes.push({
        ticker:    asset.ticker,
        assetId:   asset.id,
        oldPrice:  asset.currentPrice.toNumber(),
        oldFV:     asset.fairValue.toNumber(),
        newPrice:  pricing.fairValue,
        newShares: pricing.shares,
      })
    }

    if (!dryRun && changes.length > 0) {
      // 1. Atualiza DB — fairValue (= Preço IPO), preço, cotas e marketCap canônicos.
      //    openPrice TAMBÉM é resetado aqui porque é uma recalibração de IPO (não um
      //    cancelamento parcial): o preço de abertura passa a ser o novo Preço IPO.
      await prisma.$transaction(
        changes.map(c =>
          prisma.asset.update({
            where: { id: c.assetId },
            data: {
              fairValue:     c.newPrice,
              currentPrice:  c.newPrice,
              openPrice:     c.newPrice,
              closePrice:    c.newPrice,
              currentSupply: BigInt(c.newShares),
              totalShares:   BigInt(c.newShares),
              marketCap:     parseFloat((c.newPrice * c.newShares).toFixed(2)),
              isHalted:      false,
              haltReason:    null,
              haltedUntil:   null,
            },
          })
        )
      )

      // 2. Publica ADJUST_PRICE no canal motor:control
      //    O motor atualiza currentPrice + closePrice em memória imediatamente.
      //    OBS: fairValue na memória do motor SÓ é corrigido ao reiniciar o serviço.
      const pipeline = redisPublisher.pipeline()
      for (const c of changes) {
        pipeline.publish('motor:control', JSON.stringify({
          type:    'ADJUST_PRICE',
          assetId: c.assetId,
          adminId: auth.user.id,
          reason:  `restore-from-seed: ${c.ticker} fv ${c.oldFV.toFixed(2)} → ${c.newPrice.toFixed(2)}`,
          payload: { newPrice: c.newPrice },
          timestamp: Date.now(),
        }))
      }
      await pipeline.exec()

      await prisma.adminMarketAction.create({
        data: {
          adminId: auth.user.id,
          action:  'RESTORE_FROM_SEED',
          reason:  `Restaura fairValue + preços canônicos do seed para ${changes.length} ativos`,
          details: {
            assetsRestored: changes.length,
            executedBy:     auth.user.email,
            executedAt:     new Date().toISOString(),
            note:           'Reiniciar o serviço motor no Railway após esta operação',
          },
        },
      })
    }

    return ok({
      dryRun,
      assetsRestored: changes.length,
      note: dryRun
        ? 'Simulação — nenhuma alteração gravada.'
        : 'DB atualizado e ADJUST_PRICE enviado ao motor. REINICIE O SERVIÇO MOTOR no Railway para corrigir o fairValue na memória do processo.',
      changes: changes.map(c => ({
        ticker:   c.ticker,
        oldPrice: c.oldPrice,
        oldFV:    c.oldFV,
        newPrice: c.newPrice,
        delta:    parseFloat((c.newPrice - c.oldPrice).toFixed(2)),
      })),
    })
  } catch (err) {
    console.error('[admin/assets/restore-from-seed] Error:', err)
    return errors.server()
  }
}
