// ============================================================================
// FootStock — GET /api/v1/positions/:ticker/sell-preview
// Preview de venda: inventario coerente + preco corrente ja atrasado por plano.
//
// Fonte unica do modal SELL (OrderForm). Antes desta rota o modal lia preco de
// `useMarketTick` e nao conhecia inventario: o usuario so descobria o bloqueio
// depois do POST, via ORDER_050.
//
// Regras nao negociaveis:
//  - Sem posicao NAO e 404. E 200 com hasPosition:false e avgPrice:null. O
//    ativo existe; a posicao e que nao. 404 fica reservado a ativo inexistente.
//  - `currentPrice` sempre sai de applyPriceDelay(). Nenhum caminho devolve
//    Asset.currentPrice cru: JOGADOR/CRAQUE jamais veem preco real.
//  - Buffer frio -> 503 PRICE_BUFFERING, nunca preco atual como fallback.
// ============================================================================

import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { error, errors, ok } from '@/lib/api'
import { tickerSchema } from '@/lib/validators/tickerSchema'
import { applyPriceDelay, getDelayLabel, getCacheHint } from '@/lib/services/DelayService'
import { orderService } from '@/lib/services/OrderService'
import { AliasService } from '@/services/AliasService'
import { buildSellPreviewDto } from '@/lib/contracts/sell-preview-contract'
import type { PlanType } from '@/lib/enums'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  // 401 AUTH-001
  const authResult = await getAuthUser()
  if (!authResult) return errors.unauthorized()

  // 403 STAFF_CANNOT_TRADE — ADMIN/CLUB_PARTNER nao operam, logo nao tem
  // preview de venda. Mesmo gate de POST /api/v1/orders, aplicado antes de
  // qualquer leitura de ativo para nao vazar existencia por diferenca de status.
  const { userType, planType: rawPlanType } = authResult.user
  if (userType === 'ADMIN' || userType === 'CLUB_PARTNER' || !rawPlanType) {
    return error(
      'STAFF_CANNOT_TRADE',
      'Contas administrativas/institucionais nao podem operar ordens.',
      403,
    )
  }
  const planType = rawPlanType as PlanType

  // 422 ASSET_051 — formato de ticker invalido (antes de tocar o banco).
  const { ticker: rawTicker } = await params
  const tickerResult = tickerSchema.safeParse(rawTicker)
  if (!tickerResult.success) {
    console.warn('[SECURITY] Invalid ticker attempt /sell-preview:', {
      raw: rawTicker,
      ip: request.headers.get('x-forwarded-for'),
      userId: authResult.userId,
    })
    return error('ASSET_051', 'Ativo inválido.', 422)
  }

  // 404 ASSET_080 — alias nao resolve (FLA3 -> URU3, XYZ9 -> null).
  const resolvedTicker = await AliasService.resolve(tickerResult.data)
  if (!resolvedTicker) {
    return error('ASSET_080', 'Ativo não encontrado.', 404)
  }

  try {
    const asset = await prisma.asset.findUnique({
      where: { ticker: resolvedTicker },
      select: { id: true, ticker: true, displayName: true, currentPrice: true },
    })

    // 404 ASSET_080 — alias resolveu mas o ativo sumiu do catalogo.
    if (!asset) {
      return error('ASSET_080', 'Ativo não encontrado.', 404)
    }

    const availability = await orderService.getSellAvailability(authResult.userId, asset.id)

    // Unica leitura de Asset.currentPrice na rota, e ela e ARGUMENTO de
    // applyPriceDelay. A resposta consome exclusivamente `delayed.currentPrice`.
    const delayed = await applyPriceDelay(
      {
        id: asset.id,
        ticker: asset.ticker,
        displayName: asset.displayName,
        currentPrice: asset.currentPrice.toNumber(),
      },
      planType,
    )

    // 503 PRICE_BUFFERING — buffer de delay ainda aquecendo. Sem fallback para
    // preco real: preferimos negar o preview a mentir o preco.
    if (delayed.status === 'BUFFERING') {
      return error(
        'PRICE_BUFFERING',
        `Dados com atraso de ${getDelayLabel(planType)} ainda não disponíveis. O sistema está aquecendo o buffer. Tente novamente em alguns instantes.`,
        503,
      )
    }

    const dto = buildSellPreviewDto({
      assetId: asset.id,
      ticker: asset.ticker,
      displayName: asset.displayName,
      ownedQty: availability.ownedQty,
      reservedQty: availability.reservedQty,
      availableQty: availability.availableQty,
      avgPrice: availability.avgPrice,
      positionId: availability.positionId,
      positionStatus: availability.positionStatus,
      delayedPrice: {
        currentPrice: delayed.currentPrice,
        timestamp: delayed.timestamp,
        isDelayed: delayed.isDelayed,
        delayMinutes: delayed.delayMinutes,
      },
    })

    const response = ok(dto)
    response.headers.set('Cache-Control', getCacheHint(planType))
    return response
  } catch (err) {
    // 500 SYS-001
    console.error('[API] GET /positions/[ticker]/sell-preview error', err)
    return errors.server()
  }
}
