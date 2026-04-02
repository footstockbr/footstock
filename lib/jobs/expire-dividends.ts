// ============================================================================
// Foot Stock — Job: expire-dividends (module-16)
// Expira dividendos PENDING após 7 dias SEM creditar saldo nem emitir notificação.
// Rastreabilidade: INT-073 / RN-DIV-001
// ============================================================================

import { prisma } from '@/lib/prisma'
import { DIVIDEND_STATUS } from '@/lib/enums'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Altera status de dividendos PENDING vencidos para EXPIRADO.
 * NÃO chama WalletService.credit — expiração não credita saldo.
 * NÃO emite DIVIDEND_CREDITED — expiração é silenciosa.
 */
export async function expirePendingDividends(): Promise<{ expired: number }> {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS)

  const result = await prisma.dividend.updateMany({
    where: {
      status: DIVIDEND_STATUS.PENDING,
      createdAt: { lte: sevenDaysAgo },
    },
    data: { status: DIVIDEND_STATUS.EXPIRADO },
  })

  console.log(`[ExpireDividends] ${result.count} dividendos expirados`)
  return { expired: result.count }
}
