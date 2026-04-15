// ============================================================================
// Foot Stock — Job: financialDividendCron (T-007)
// Processa dividendos financeiros periódicos com as 3 modalidades corretas.
// Usa FinancialPeriodicDividendService (T-007) em vez do legado.
// Rastreabilidade: T-007 §3
// ============================================================================

import { financialPeriodicDividendService } from '@/lib/services/dividends/FinancialPeriodicDividendService'

/**
 * Executa dividendo financeiro periódico para o mês atual.
 * Critérios: BULLISH + debtRatio < 0.3 + freeFloat > 0.4 + não halted.
 * CRAQUE/LENDA: crédito direto. JOGADOR: yield_differential_pending.
 * Idempotente por processingMonth + type=FINANCIAL_PERIODIC.
 */
export async function runFinancialDividendCron(): Promise<{
  processingMonth: string
  eligible: number
  processed: number
  failed: number
  skipped: number
  totalDistributed: number
}> {
  const now = new Date()
  const processingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  console.log(`[CronJob] financialDividendCron iniciado: processingMonth=${processingMonth}`)
  const result = await financialPeriodicDividendService.process(processingMonth)
  console.log(`[CronJob] financialDividendCron concluído:`, result)
  return result
}
