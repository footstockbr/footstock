// ============================================================================
// Foot Stock — Job: monthly-dividends (module-16)
// Módulo reutilizável para calcular dividendos financeiros mensais.
// Testável sem HTTP (importado pelo handler do Vercel Cron).
// Rastreabilidade: INT-073
// ============================================================================

import { dividendService } from '@/lib/services/DividendService'

/**
 * Executa o cálculo de dividendos financeiros para o mês atual.
 * Usa formato "YYYY-MM" para garantir idempotência.
 */
export async function runMonthlyDividends(): Promise<{ processed: number; skipped: number }> {
  const now = new Date()
  const processingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  console.log(`[CronJob] monthly-dividends iniciado: processingMonth=${processingMonth}`)
  const result = await dividendService.calcularDividendoFinanceiro(processingMonth)
  console.log(`[CronJob] monthly-dividends concluído:`, result)
  return result
}
