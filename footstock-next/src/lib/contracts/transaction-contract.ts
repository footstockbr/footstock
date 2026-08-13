// ============================================================================
// FootStock — Transaction Contract: Invariantes de Atomicidade + DTO de resposta
// Garante integridade financeira na cadeia de transações e centraliza o contrato
// de serialização da API de transações.
// ============================================================================

import type { Transaction } from '@prisma/client'

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
