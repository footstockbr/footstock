// ============================================================================
// FootStock — Order History Contract
// Contrato canonico do historico de ordens exposto por GET /api/v1/orders.
//
// Regra central (criterio 9 do brainstorm): a taxa NUNCA pode ser somada duas
// vezes. O motor grava DUAS linhas por ordem executada (ver
// `motor/src/engine/settlement.ts::_recordTradeAndFee`):
//
//   1. TRADE — linha canonica de caixa. `fsAmount` e o delta liquido ja
//      descontada a taxa, e `balanceBefore`/`balanceAfter` estao preenchidos.
//   2. FEE   — linha de memorando (`balanceBefore`/`balanceAfter` NULOS). Serve
//      para detalhar quanto da linha TRADE foi taxa. Somar o caixa dela por
//      cima do TRADE contaria a taxa duas vezes.
//
// Por isso `cashDelta` sai SEMPRE da linha TRADE e a linha FEE so e lida como
// fallback do VALOR da taxa quando `TRADE.fee` vem nulo. `Order.fee` e apenas a
// estimativa gravada na criacao da ordem: quando existe TRADE ele e ignorado
// (`financialSource: 'TRADE'`), e quando entra e sempre marcado como
// `ORDER_FALLBACK` + `feeKind: 'ESTIMATED'`.
// ============================================================================

import { computeCashDelta, computeGrossAmount, resolvePnlProvenance } from './transaction-contract'
import type { PnlProvenance } from './transaction-contract'

// ---------------------------------------------------------------------------
// Enumeracoes do contrato
// ---------------------------------------------------------------------------

/**
 * Procedencia do valor da taxa exibida.
 * - `EXECUTED`  — taxa efetivamente cobrada, lida da liquidacao (TRADE/FEE).
 * - `ESTIMATED` — estimativa gravada em `Order.fee` na criacao da ordem.
 */
export type OrderFeeKind = 'ESTIMATED' | 'EXECUTED'

/**
 * Fonte dos numeros financeiros do item.
 * - `TRADE`          — transacao TRADE da liquidacao (fonte canonica).
 * - `ORDER_FALLBACK` — ordem marcada como executada sem transacao TRADE
 *                      correspondente; usa `Order.fee`/`Order.executedPrice`.
 * - `NONE`           — ordem sem execucao. Nada de financeiro e fabricado.
 */
export type OrderFinancialSource = 'TRADE' | 'ORDER_FALLBACK' | 'NONE'

export const ORDER_FEE_KINDS: readonly OrderFeeKind[] = ['ESTIMATED', 'EXECUTED']
export const ORDER_FINANCIAL_SOURCES: readonly OrderFinancialSource[] = [
  'TRADE',
  'ORDER_FALLBACK',
  'NONE',
]

// ---------------------------------------------------------------------------
// Entrada da serializacao (estrutural: aceita objeto Prisma ou plain object)
// ---------------------------------------------------------------------------

interface DecimalLike {
  toNumber: () => number
}

type NumericInput = DecimalLike | number | null | undefined

/**
 * Subconjunto de `Transaction` necessario para reconstruir a liquidacao.
 * Estrutural de proposito: o teste monta objeto simples e a rota entrega o
 * registro do Prisma sem conversao intermediaria.
 */
export interface OrderSettlementTransaction {
  financialType: string
  quantity?: number | null
  price?: NumericInput
  fee?: NumericInput
  fsAmount?: NumericInput
  balanceBefore?: NumericInput
  balanceAfter?: NumericInput
  avgPriceAtExecution?: NumericInput
  costBasisAmount?: NumericInput
  realizedPnl?: NumericInput
}

export interface OrderHistoryAssetRef {
  ticker: string
  displayName: string
}

export interface OrderHistorySource {
  id: string
  assetId: string
  type: string
  side: string
  status: string
  quantity: number
  /** `Order.price` — preco SOLICITADO (limite). Nunca colapsar com o executado. */
  price?: NumericInput
  /** `Order.executedPrice` — preco EXECUTADO pelo motor. */
  executedPrice?: NumericInput
  /** `Order.fee` — estimativa gravada na criacao da ordem. */
  fee?: NumericInput
  createdAt: Date | string
  /** Hora SOLICITADA de agendamento (`Order.scheduledAt`). */
  scheduledAt?: Date | string | null
  /** Hora EXECUTADA (`Order.executedAt`). */
  executedAt?: Date | string | null
  groupId?: string | null
  /**
   * `Order.cancelReason` — motivo do cancelamento/expiracao (Fase 3).
   * Vocabulario fechado documentado em `docs/FASE3-ciclo-de-vida-da-ordem.md`.
   * Nulo em ordem que nunca saiu por cancelamento.
   */
  cancelReason?: string | null
  asset?: OrderHistoryAssetRef | null
  transactions?: OrderSettlementTransaction[] | null
}

// ---------------------------------------------------------------------------
// DTO exposto pela API
// ---------------------------------------------------------------------------

export interface OrderHistoryDto {
  id: string
  assetId: string
  asset: OrderHistoryAssetRef | null
  type: string
  side: string
  status: string
  quantity: number
  /** Preco solicitado (limite). `null` em ordem a mercado. */
  requestedPrice: number | null
  /** Preco executado. `null` enquanto a ordem nao executou. */
  executedPrice: number | null
  fee: number | null
  feeKind: OrderFeeKind | null
  /** `quantity * price` da execucao, bruto de taxas. */
  grossAmount: number | null
  /** Delta de caixa observado na liquidacao (ja liquido de taxa). */
  cashDelta: number | null
  /** Resultado liquido com sinal por lado: SELL positivo, BUY negativo. */
  netAmount: number | null
  financialSource: OrderFinancialSource
  createdAt: string
  executedAt: string | null
  scheduledAt: string | null
  groupId: string | null
  /**
   * Motivo do encerramento nao-executado. Preenchido apenas quando o motor, o
   * job de expiracao ou o proprio usuario encerrou a ordem (Fase 3).
   * `null` em ordem viva, executada ou cancelada antes da Fase 3 (legado).
   */
  cancelReason: string | null
  // Snapshot de custo do motor (nullable: ordens legadas podem nao ter)
  avgPriceAtExecution: number | null
  costBasisAmount: number | null
  realizedPnl: number | null
  pnlProvenance: PnlProvenance
}

/** Campos obrigatorios do DTO. Consumido por testes de contrato. */
export const ORDER_HISTORY_DTO_FIELDS: readonly (keyof OrderHistoryDto)[] = [
  'id',
  'assetId',
  'asset',
  'type',
  'side',
  'status',
  'quantity',
  'requestedPrice',
  'executedPrice',
  'fee',
  'feeKind',
  'grossAmount',
  'cashDelta',
  'netAmount',
  'financialSource',
  'createdAt',
  'executedAt',
  'scheduledAt',
  'groupId',
  'cancelReason',
  'avgPriceAtExecution',
  'costBasisAmount',
  'realizedPnl',
  'pnlProvenance',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNumberOrNull(value: NumericInput): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return value.toNumber()
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Resultado liquido com sinal por lado da operacao.
 * SELL entra caixa (`+ (bruto - taxa)`), BUY sai caixa (`- (bruto + taxa)`).
 * Em compra alavancada esse numero difere de `cashDelta` de proposito: o
 * `netAmount` mede a operacao inteira, o `cashDelta` mede o caixa movimentado.
 */
export function computeOrderNetAmount(
  side: string,
  grossAmount: number | null,
  fee: number | null,
): number | null {
  if (grossAmount === null) return null
  const feeValue = fee ?? 0
  if (side === 'SELL') return round2(grossAmount - feeValue)
  return round2(-(grossAmount + feeValue))
}

export interface OrderFinancials {
  fee: number | null
  feeKind: OrderFeeKind | null
  grossAmount: number | null
  cashDelta: number | null
  netAmount: number | null
  financialSource: OrderFinancialSource
  avgPriceAtExecution: number | null
  costBasisAmount: number | null
  realizedPnl: number | null
  pnlProvenance: PnlProvenance
}

/**
 * Deriva os numeros financeiros de uma ordem a partir da liquidacao.
 * Invariante: no ramo TRADE, `Order.fee` NAO e lido em nenhuma hipotese.
 */
export function resolveOrderFinancials(order: OrderHistorySource): OrderFinancials {
  const transactions = order.transactions ?? []
  const trade = transactions.find((tx) => tx.financialType === 'TRADE') ?? null
  const feeRow = transactions.find((tx) => tx.financialType === 'FEE') ?? null
  const executedPrice = toNumberOrNull(order.executedPrice)

  if (trade) {
    // Taxa: preferimos a coluna `fee` do proprio TRADE. Se vier nula, usamos o
    // valor absoluto da linha FEE (memorando). `Order.fee` fica fora daqui.
    const tradeFee = toNumberOrNull(trade.fee)
    const feeRowAmount = toNumberOrNull(feeRow?.fsAmount ?? feeRow?.fee ?? null)
    const fee = tradeFee ?? (feeRowAmount !== null ? Math.abs(feeRowAmount) : null)

    const grossAmount = computeGrossAmount(
      trade.quantity ?? order.quantity,
      toNumberOrNull(trade.price) ?? executedPrice,
    )

    // Caixa vem SO da linha TRADE: ela ja esta liquida da taxa. Somar a linha
    // FEE aqui contaria a taxa duas vezes.
    const cashDelta = computeCashDelta(
      toNumberOrNull(trade.balanceBefore),
      toNumberOrNull(trade.balanceAfter),
      toNumberOrNull(trade.fsAmount),
    )

    return {
      fee,
      feeKind: fee === null ? null : 'EXECUTED',
      grossAmount,
      cashDelta,
      netAmount: computeOrderNetAmount(order.side, grossAmount, fee),
      financialSource: 'TRADE',
      avgPriceAtExecution: toNumberOrNull(trade.avgPriceAtExecution ?? null),
      costBasisAmount: toNumberOrNull(trade.costBasisAmount ?? null),
      realizedPnl: toNumberOrNull(trade.realizedPnl ?? null),
      pnlProvenance: resolvePnlProvenance(toNumberOrNull(trade.realizedPnl ?? null)),
    }
  }

  const executedAt = toIsoOrNull(order.executedAt ?? null)
  const hasExecution = executedPrice !== null || executedAt !== null

  if (hasExecution) {
    // Ordem executada sem transacao TRADE carregada/gravada. Usamos a
    // estimativa da ordem, sempre etiquetada como fallback estimado.
    const fee = toNumberOrNull(order.fee)
    const grossAmount = computeGrossAmount(order.quantity, executedPrice)
    return {
      fee,
      feeKind: fee === null ? null : 'ESTIMATED',
      grossAmount,
      // Sem linha de liquidacao nao existe caixa observado. Nao inventamos.
      cashDelta: null,
      netAmount: computeOrderNetAmount(order.side, grossAmount, fee),
      financialSource: 'ORDER_FALLBACK',
      avgPriceAtExecution: null,
      costBasisAmount: null,
      realizedPnl: null,
      pnlProvenance: 'UNAVAILABLE',
    }
  }

  // Ordem sem execucao: so a taxa estimada da criacao, nada de caixa.
  const fee = toNumberOrNull(order.fee)
  return {
    fee,
    feeKind: fee === null ? null : 'ESTIMATED',
    grossAmount: null,
    cashDelta: null,
    netAmount: null,
    financialSource: 'NONE',
    avgPriceAtExecution: null,
    costBasisAmount: null,
    realizedPnl: null,
    pnlProvenance: 'UNAVAILABLE',
  }
}

/**
 * Serializa uma ordem para o DTO de historico.
 * Mantem preco/hora SOLICITADOS separados de preco/hora EXECUTADOS
 * (criterio 5 do brainstorm): `requestedPrice`/`createdAt`/`scheduledAt` de um
 * lado, `executedPrice`/`executedAt` do outro. Nenhum dos dois pares e
 * colapsado ou preenchido com o valor do outro.
 */
export function serializeOrderHistory(order: OrderHistorySource): OrderHistoryDto {
  const financials = resolveOrderFinancials(order)
  const isExecutedSource = financials.financialSource !== 'NONE'

  return {
    id: order.id,
    assetId: order.assetId,
    asset: order.asset
      ? { ticker: order.asset.ticker, displayName: order.asset.displayName }
      : null,
    type: order.type,
    side: order.side,
    status: order.status,
    quantity: order.quantity,
    requestedPrice: toNumberOrNull(order.price),
    executedPrice: isExecutedSource ? toNumberOrNull(order.executedPrice) : null,
    fee: financials.fee,
    feeKind: financials.feeKind,
    grossAmount: financials.grossAmount,
    cashDelta: financials.cashDelta,
    netAmount: financials.netAmount,
    financialSource: financials.financialSource,
    createdAt: toIsoOrNull(order.createdAt) ?? new Date(0).toISOString(),
    executedAt: isExecutedSource ? toIsoOrNull(order.executedAt ?? null) : null,
    scheduledAt: toIsoOrNull(order.scheduledAt ?? null),
    groupId: order.groupId ?? null,
    cancelReason: order.cancelReason ?? null,
    avgPriceAtExecution: financials.avgPriceAtExecution,
    costBasisAmount: financials.costBasisAmount,
    realizedPnl: financials.realizedPnl,
    pnlProvenance: financials.pnlProvenance,
  }
}
