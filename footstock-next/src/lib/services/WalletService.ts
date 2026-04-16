// ============================================================================
// FootStock — WalletService (module-16)
// Crédito e consulta de saldo FS$ do usuário via Prisma.
// Rastreabilidade: INT-072, INT-073
// ============================================================================

import { prisma } from '@/lib/prisma'

/**
 * Credita amount no saldo FS$ do usuário.
 * Usa tx Prisma quando chamado dentro de prisma.$transaction, senão usa conexão global.
 */
export async function creditWallet(
  userId: string,
  amount: number,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<number> {
  const db = tx ?? prisma

  const user = await (db as typeof prisma).user.findUniqueOrThrow({ where: { id: userId } })
  const newBalance = Number(user.fsBalance) + amount
  await (db as typeof prisma).user.update({
    where: { id: userId },
    data: { fsBalance: newBalance },
  })
  return newBalance
}

/** Retorna saldo FS$ atual do usuário. */
export async function getWalletBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  return Number(user.fsBalance)
}
