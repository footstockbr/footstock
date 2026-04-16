// ============================================================================
// FootStock — Transaction Contract: Invariantes de Atomicidade
// Garante integridade financeira na cadeia de transações.
// Rastreabilidade: INT-011, INT-018 / TASK-0/ST003
// ============================================================================

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
// Invariantes de verificação
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
