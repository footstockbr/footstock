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

// Fairvalues canônicos do seed (prisma/seeds/admin-demo/assets.seed.ts)
// Fonte da verdade — não alterar sem atualizar o seed também.
const SEED_FAIR_VALUES: Record<string, number> = {
  // Série A
  URU3: 120.00,
  POR4: 110.00,
  TIM3: 105.00,
  GAL3: 100.00,
  TRI4:  95.00,
  FOG3:  70.00,
  COL3:  65.00,
  IMO3:  60.00,
  RAP3:  58.00,
  GUE4:  55.00,
  TRI3:  52.00,
  BAL4:  50.00,
  MAL4:  35.00,
  TOR3:  32.00,
  FUR3:  28.00,
  LEM3:  22.00,
  VOA4:  20.00,
  LEB3:  18.00,
  CON3:  15.00,
  LEA3:  12.00,
  // Série B
  COE3:  12.00,
  LEP4:  11.50,
  DRA3:  11.00,
  VOZ3:  10.50,
  PER3:  10.00,
  GAP3:   9.50,
  LEI3:   9.00,
  IND4:   8.50,
  PAN3:   8.00,
  CAV4:   7.50,
  LEI4:   7.00,
  TIG4:   6.50,
  DOU4:   6.00,
  TUB3:   6.00,
  NAF3:   5.50,
  TIV3:   5.00,
  FAS3:   5.00,
  MAC4:   4.50,
  ABT4:   4.00,
  TIS3:   4.00,
}

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
      where: { ticker: { in: Object.keys(SEED_FAIR_VALUES) } },
      select: { id: true, ticker: true, currentPrice: true, fairValue: true, currentSupply: true },
    })

    const changes: Array<{
      ticker:   string
      assetId:  string
      oldPrice: number
      oldFV:    number
      newPrice: number
    }> = []

    for (const asset of assets) {
      const correctFV = SEED_FAIR_VALUES[asset.ticker]
      if (!correctFV) continue
      changes.push({
        ticker:   asset.ticker,
        assetId:  asset.id,
        oldPrice: asset.currentPrice.toNumber(),
        oldFV:    asset.fairValue.toNumber(),
        newPrice: correctFV,
      })
    }

    if (!dryRun && changes.length > 0) {
      // 1. Atualiza DB — inclui fairValue (fonte corrompida pelo antigo reset-prices)
      await prisma.$transaction(
        changes.map(c =>
          prisma.asset.update({
            where: { id: c.assetId },
            data: {
              fairValue:    c.newPrice,
              currentPrice: c.newPrice,
              // openPrice NAO é alterado: pertence ao motor (resetado via PRE_OPENING).
              // Alterar aqui cria divergência: DB.openPrice=70 mas motor.memory.openPrice=1.02
              // → change% na UI fica errada (ex: -98%) mesmo com preço correto.
              closePrice:   c.newPrice,
              isHalted:     false,
              haltReason:   null,
              haltedUntil:  null,
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
