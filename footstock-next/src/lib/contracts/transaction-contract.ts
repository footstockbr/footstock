// ============================================================================
// FootStock — Transaction Contract: Invariantes de Atomicidade + DTO de resposta
// Garante integridade financeira na cadeia de transações e centraliza o contrato
// de serialização da API de transações.
// ============================================================================

import type { Transaction } from '@prisma/client'

// ---------------------------------------------------------------------------
// Proveniencia do resultado realizado
// ---------------------------------------------------------------------------

/**
 * Procedencia do valor de `realizedPnl` exibido ao usuario.
 *
 * - `PERSISTED`     — snapshot gravado pelo motor na liquidacao (TRADE com
 *                     `realizedPnl` nao nulo). Numero conferido.
 * - `RECONSTRUCTED` — valor recalculado por replay historico. **Nenhum caminho
 *                     de codigo emite este valor nesta entrega.** O tipo o
 *                     declara para que o replay futuro ja encaixe no contrato
 *                     sem mudar a UI.
 * - `UNAVAILABLE`   — sem base para calcular (transacao legada sem snapshot).
 *                     A UI exibe texto explicativo em pt-BR, nunca zero
 *                     fabricado.
 *
 * O enum tecnico NUNCA chega ao usuario final; a camada de apresentacao
 * traduz cada valor para texto em portugues.
 */
export type PnlProvenance = 'PERSISTED' | 'RECONSTRUCTED' | 'UNAVAILABLE'

/**
 * Determina a proveniencia do resultado realizado de uma transacao TRADE.
 * BUY e outras linhas sem `realizedPnl` persistido retornam `UNAVAILABLE`.
 */
export function resolvePnlProvenance(realizedPnl: number | null): PnlProvenance {
  return realizedPnl !== null ? 'PERSISTED' : 'UNAVAILABLE'
}

/** Traduz a proveniencia tecnica para texto legivel em pt-BR. */
export function pnlProvenanceLabel(provenance: PnlProvenance): string {
  switch (provenance) {
    case 'PERSISTED':
      return 'Resultado confirmado na liquidação'
    case 'UNAVAILABLE':
      return 'Snapshot histórico indisponível — resultado não calculado'
    default:
      return 'Resultado reconstruído de histórico'
  }
}

export interface TransactionAssetRelation {
  ticker: string
  displayName: string
}

export interface TransactionOrderRelation {
  type: string
  executedAt: Date | null
}

// ---------------------------------------------------------------------------
// Tipos locais de auditoria
// ---------------------------------------------------------------------------

export interface TransactionRecord {
  id: string
  userId: string
  balanceBefore: number | null
  balanceAfter: number | null
  fsAmount: number | null
}

export interface BreakRecord {
  txId: string
  expected: number
  actual: number
  delta: number
}

export interface AuditReport {
  isConsistent: boolean
  breaks: BreakRecord[]
  totalTransactions: number
  auditedAt: Date
}

// ---------------------------------------------------------------------------
// DTO de transação exposto pela API
// ---------------------------------------------------------------------------

export interface TransactionDto {
  id: string
  userId: string
  orderId: string | null
  assetId: string | null
  type: string | null
  financialType: string
  side: string | null
  quantity: number | null
  price: number | null
  fee: number | null
  totalAmount: number
  fsAmount: number | null
  balanceBefore: number | null
  balanceAfter: number | null
  createdAt: string
  // Relações enriquecidas
  ticker: string | null
  displayName: string | null
  executedAt: string
  orderType: string | null
  timestampSource: 'ORDER_EXECUTED_AT' | 'TRANSACTION_CREATED_AT'
  // Campos financeiros canonicos
  grossAmount: number | null
  cashDelta: number | null
  // Snapshot de custo do motor (nullable: transacoes legadas podem nao ter)
  avgPriceAtExecution: number | null
  costBasisAmount: number | null
  realizedPnl: number | null
  pnlProvenance: PnlProvenance
}

export interface TransactionMeta {
  missingAssetCount: number
  missingOrderCount: number
  cashDeltaDivergenceCount: number
}

// ---------------------------------------------------------------------------
// Helpers financeiros
// ---------------------------------------------------------------------------

function decimalToNumber(value: { toNumber: () => number } | null | undefined): number | null {
  return value?.toNumber() ?? null
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Calcula o valor bruto de uma transacao de TRADE.
 * grossAmount = round(quantity * price, 2)
 */
export function computeGrossAmount(quantity: number | null, price: number | null): number | null {
  if (quantity === null || price === null) return null
  return round2(quantity * price)
}

/**
 * Calcula o delta de caixa da transacao.
 * Prioriza a diferenca observada entre saldos; fallback para fsAmount.
 */
export function computeCashDelta(
  balanceBefore: number | null,
  balanceAfter: number | null,
  fsAmount: number | null,
): number | null {
  if (balanceBefore !== null && balanceAfter !== null) {
    return round2(balanceAfter - balanceBefore)
  }
  if (fsAmount !== null) return round2(fsAmount)
  return null
}

// ---------------------------------------------------------------------------
// Serializacao
// ---------------------------------------------------------------------------

export function serializeTransaction(
  tx: Transaction & { asset?: TransactionAssetRelation | null; order?: TransactionOrderRelation | null },
): TransactionDto {
  const price = decimalToNumber(tx.price)
  const fee = decimalToNumber(tx.fee)
  const fsAmount = decimalToNumber(tx.fsAmount)
  const balanceBefore = decimalToNumber(tx.balanceBefore)
  const balanceAfter = decimalToNumber(tx.balanceAfter)
  const avgPriceAtExecution = decimalToNumber(tx.avgPriceAtExecution)
  const costBasisAmount = decimalToNumber(tx.costBasisAmount)
  const realizedPnl = decimalToNumber(tx.realizedPnl)

  const ticker = tx.asset?.ticker ?? null
  const displayName = tx.asset?.displayName ?? null
  const orderExecutedAt = tx.order?.executedAt ?? null
  const executedAt = orderExecutedAt?.toISOString() ?? tx.createdAt.toISOString()
  const timestampSource: TransactionDto['timestampSource'] = orderExecutedAt
    ? 'ORDER_EXECUTED_AT'
    : 'TRANSACTION_CREATED_AT'

  return {
    id: tx.id,
    userId: tx.userId,
    orderId: tx.orderId ?? null,
    assetId: tx.assetId ?? null,
    type: tx.type ?? null,
    financialType: tx.financialType,
    side: tx.side ?? null,
    quantity: tx.quantity ?? null,
    price,
    fee,
    totalAmount: tx.totalAmount.toNumber(),
    fsAmount,
    balanceBefore,
    balanceAfter,
    createdAt: tx.createdAt.toISOString(),
    ticker,
    displayName,
    executedAt,
    orderType: tx.order?.type ?? tx.type ?? null,
    timestampSource,
    grossAmount: computeGrossAmount(tx.quantity ?? null, price),
    cashDelta: computeCashDelta(balanceBefore, balanceAfter, fsAmount),
    avgPriceAtExecution,
    costBasisAmount,
    realizedPnl,
    pnlProvenance: resolvePnlProvenance(realizedPnl),
  }
}

// ---------------------------------------------------------------------------
// Filtros da listagem de transacoes
// ---------------------------------------------------------------------------

// Transaction.type usa o enum OrderType; Transaction.financialType usa FinancialType.
// BONUS inclui creditos de upgrade (T-021), dividendos futuros, etc.
export const VALID_TRANSACTION_TYPES = [
  'MARKET',
  'LIMIT',
  'STOP_LOSS',
  'TAKE_PROFIT',
  'OCO',
  'SCHEDULED',
] as const

export const VALID_FINANCIAL_TYPES = [
  'TRADE',
  'BONUS',
  'DEPOSIT',
  'WITHDRAWAL',
  'SHORT_INTEREST',
  'MARGIN_BLOCKED',
  'SHORT_CLOSE',
  'LEVERAGE_INTEREST',
  'FEE',
] as const

export interface TransactionFilters {
  type: string | null
  financialType: string | null
  assetId: string | null
  /** Limite inicial INCLUSIVO aplicado sobre `Transaction.createdAt` (gte). */
  from: Date | null
  /** Limite final EXCLUSIVO aplicado sobre `Transaction.createdAt` (lt). */
  to: Date | null
}

/** Projecao serializavel dos filtros ativos, exposta no meta da resposta. */
export interface TransactionFiltersMeta {
  type: string | null
  financialType: string | null
  assetId: string | null
  from: string | null
  to: string | null
}

export type ParsedTransactionFilters =
  | { ok: true; filters: TransactionFilters }
  | { ok: false; message: string }

/**
 * Converte um parametro de data em `Date`.
 * Data nua (`YYYY-MM-DD`) e lida no fuso do produto (America/Sao_Paulo).
 * hipotese: o Brasil nao tem horario de verao desde 2019, entao o deslocamento
 * fixo -03:00 e estavel; se voltar a existir DST isto precisa de tz database.
 * Valor com fuso explicito (ISO completo) e respeitado como veio.
 */
function parseFilterDate(raw: string): Date | null {
  const value = raw.trim()
  if (!value) return null
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const parsed = new Date(isBareDate ? `${value}T00:00:00.000-03:00` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Valida e normaliza os filtros de `GET /api/v1/transactions`.
 * `from` e INCLUSIVO e `to` e EXCLUSIVO: uma transacao exatamente em `from`
 * entra no resultado e uma exatamente em `to` fica de fora. Isso deixa o filtro
 * "dia inteiro" sem ambiguidade de milissegundo na virada.
 * Retorna `{ ok: false, message }` para o caller responder 422/VAL-001.
 */
export function parseTransactionFilters(searchParams: URLSearchParams): ParsedTransactionFilters {
  const type = searchParams.get('type')
  const financialType = searchParams.get('financialType')
  const assetId = searchParams.get('assetId')
  const rawFrom = searchParams.get('from')
  const rawTo = searchParams.get('to')

  if (type && !(VALID_TRANSACTION_TYPES as readonly string[]).includes(type)) {
    return { ok: false, message: 'Tipo de transação inválido.' }
  }

  if (financialType && !(VALID_FINANCIAL_TYPES as readonly string[]).includes(financialType)) {
    return { ok: false, message: 'Tipo financeiro inválido.' }
  }

  const from = rawFrom ? parseFilterDate(rawFrom) : null
  if (rawFrom && from === null) {
    return { ok: false, message: 'Data inicial inválida.' }
  }

  const to = rawTo ? parseFilterDate(rawTo) : null
  if (rawTo && to === null) {
    return { ok: false, message: 'Data final inválida.' }
  }

  if (from && to && from.getTime() >= to.getTime()) {
    return { ok: false, message: 'A data inicial deve ser anterior à data final.' }
  }

  return {
    ok: true,
    filters: {
      type: type ?? null,
      financialType: financialType ?? null,
      assetId: assetId ?? null,
      from,
      to,
    },
  }
}

/**
 * Projeta os filtros ativos para o meta da resposta.
 * Campo proprio de proposito: `buildTransactionMeta` continua recebendo apenas
 * `TransactionDto[]` e agregando contadores de auditoria.
 */
export function buildTransactionFiltersMeta(filters: TransactionFilters): TransactionFiltersMeta {
  return {
    type: filters.type,
    financialType: filters.financialType,
    assetId: filters.assetId,
    from: filters.from ? filters.from.toISOString() : null,
    to: filters.to ? filters.to.toISOString() : null,
  }
}

export function buildTransactionMeta(items: TransactionDto[]): TransactionMeta {
  let missingAssetCount = 0
  let missingOrderCount = 0
  let cashDeltaDivergenceCount = 0

  for (const item of items) {
    if (item.assetId && !item.ticker) missingAssetCount++
    if (item.orderId && !item.orderType) missingOrderCount++

    // Divergencia: cashDelta derivado de saldos difere de fsAmount (quando ambos existem).
    if (item.balanceBefore !== null && item.balanceAfter !== null && item.fsAmount !== null) {
      const derived = round2(item.balanceAfter - item.balanceBefore)
      if (Math.abs(derived - item.fsAmount) > 0.001) {
        cashDeltaDivergenceCount++
      }
    }
  }

  return { missingAssetCount, missingOrderCount, cashDeltaDivergenceCount }
}

// ---------------------------------------------------------------------------
// Invariantes de verificacao
// ---------------------------------------------------------------------------

/**
 * Verifica se os campos de saldo de uma transação são consistentes.
 * balanceAfter deve ser igual a balanceBefore + fsAmount.
 */
export function verifyBalanceConsistency(tx: TransactionRecord): boolean {
  if (tx.balanceBefore === null || tx.balanceAfter === null || tx.fsAmount === null) {
    return true // campos ausentes = transação legada, não auditar
  }
  const expected = tx.balanceBefore + tx.fsAmount
  return Math.abs(tx.balanceAfter - expected) < 0.001 // tolerância de 0.001 para ponto flutuante
}

/**
 * Verifica que o saldo nunca ficou negativo.
 */
export function verifyNonNegativeBalance(fsBalance: number): boolean {
  return fsBalance >= 0
}

/**
 * Verifica que a margem bloqueada é não-negativa.
 */
export function verifyMarginConsistency(marginBlocked: number, fsBalance: number): boolean {
  return marginBlocked >= 0 && fsBalance >= 0
}

// ---------------------------------------------------------------------------
// Auditoria completa de cadeia de transações
// ---------------------------------------------------------------------------

/**
 * Audita a integridade da cadeia de transações de um usuário.
 * Verifica que tx[n].balanceBefore === tx[n-1].balanceAfter para toda a cadeia.
 *
 * Uso pelo admin: GET /api/v1/admin/users/:id/audit
 */
export async function auditTransactionIntegrity(
  userId: string,
  fetchTransactions: (uid: string) => Promise<TransactionRecord[]>,
): Promise<AuditReport> {
  const transactions = await fetchTransactions(userId)
  const breaks: BreakRecord[] = []

  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1]
    const curr = transactions[i]
    if (!prev || !curr) continue

    if (prev.balanceAfter === null || curr.balanceBefore === null) continue

    const delta = curr.balanceBefore - prev.balanceAfter
    if (Math.abs(delta) > 0.001) {
      breaks.push({
        txId: curr.id,
        expected: prev.balanceAfter,
        actual: curr.balanceBefore,
        delta,
      })
    }
  }

  return {
    isConsistent: breaks.length === 0,
    breaks,
    totalTransactions: transactions.length,
    auditedAt: new Date(),
  }
}
