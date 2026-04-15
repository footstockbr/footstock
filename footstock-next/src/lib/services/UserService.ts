// ============================================================================
// Foot Stock — UserService
// Operações de saldo com locking otimista via campo `version`.
// Rastreabilidade: T-032 / Locking Otimista
//
// Padrão CAS (Compare-And-Swap):
//   UPDATE users
//     SET fs_balance = fs_balance - $amount, version = version + 1
//   WHERE id = $userId AND version = $currentVersion AND fs_balance >= $amount
//
// Se rowsAffected == 0:
//   - version mudou → ConcurrentUpdateError (409) → retryable
//   - saldo insuficiente → InsufficientBalanceError (402) → não retryable
// ============================================================================

import { prisma } from '@/lib/prisma'
import { retryWithBackoff, ConcurrentUpdateError, InsufficientBalanceError } from '@/lib/utils/retryWithBackoff'
import type { User } from '@prisma/client'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface BalanceOperationResult {
  userId: string
  newVersion: number
  newBalance: number
}

// ---------------------------------------------------------------------------
// UserService
// ---------------------------------------------------------------------------

export class UserService {
  /**
   * Deduz `amount` do saldo FS$ do usuário com locking otimista.
   *
   * - Faz retry automático (até 3 tentativas, backoff 50/100/200ms) em conflito de versão.
   * - Lança `InsufficientBalanceError` (402) se saldo insuficiente (sem retry).
   * - Lança `ConcurrentUpdateError` (409) se 3 conflitos consecutivos.
   */
  async deductBalance(userId: string, amount: number): Promise<BalanceOperationResult> {
    return retryWithBackoff(
      () => this._deductBalanceOnce(userId, amount),
      { context: { userId, operation: 'deductBalance', amount } },
    )
  }

  /**
   * Credita `amount` ao saldo FS$ do usuário com locking otimista.
   * Operação usada em refunds, prêmios e créditos manuais.
   */
  async creditBalance(userId: string, amount: number): Promise<BalanceOperationResult> {
    return retryWithBackoff(
      () => this._creditBalanceOnce(userId, amount),
      { context: { userId, operation: 'creditBalance', amount } },
    )
  }

  /**
   * Zera o saldo FS$ do usuário (operação administrativa).
   * Requer que o caller tenha validado permissão de admin antes de invocar.
   */
  async resetBalance(userId: string): Promise<BalanceOperationResult> {
    return retryWithBackoff(
      () => this._resetBalanceOnce(userId),
      { context: { userId, operation: 'resetBalance' } },
    )
  }

  /**
   * Credita bônus de assinatura ao saldo FS$ (chamado por cron job).
   * Idêntico a `creditBalance` mas com contexto de logging diferente.
   */
  async creditBonus(userId: string, amount: number): Promise<BalanceOperationResult> {
    return retryWithBackoff(
      () => this._creditBalanceOnce(userId, amount),
      { context: { userId, operation: 'creditBonus', amount } },
    )
  }

  // ---------------------------------------------------------------------------
  // Operações atômicas internas (uma tentativa cada)
  // ---------------------------------------------------------------------------

  private async _deductBalanceOnce(userId: string, amount: number): Promise<BalanceOperationResult> {
    // Buscar versão atual antes do CAS (necessário para re-fetch em cada retry)
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fsBalance: true, version: true },
    })
    if (!current) throw new Error(`Usuário não encontrado: ${userId}`)

    const result = await prisma.user.updateMany({
      where: {
        id: userId,
        version: current.version,
        fsBalance: { gte: amount },
      },
      data: {
        fsBalance: { decrement: amount },
        version: { increment: 1 },
      },
    })

    if (result.count === 0) {
      // Determinar causa: re-buscar estado atual para diagnóstico
      const after = await prisma.user.findUnique({
        where: { id: userId },
        select: { fsBalance: true, version: true },
      })

      // Se version mudou → outro processo atualizou entre o SELECT e o UPDATE → retry
      if (!after || after.version !== current.version) {
        throw new ConcurrentUpdateError()
      }

      // Version igual mas update falhou → saldo insuficiente
      throw new InsufficientBalanceError(
        `Saldo FS$ insuficiente. Disponível: ${after ? Number(after.fsBalance) : 0}. Necessário: ${amount}.`,
      )
    }

    return {
      userId,
      newVersion: current.version + 1,
      newBalance: Number(current.fsBalance) - amount,
    }
  }

  private async _creditBalanceOnce(userId: string, amount: number): Promise<BalanceOperationResult> {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fsBalance: true, version: true },
    })
    if (!current) throw new Error(`Usuário não encontrado: ${userId}`)

    const result = await prisma.user.updateMany({
      where: { id: userId, version: current.version },
      data: {
        fsBalance: { increment: amount },
        version: { increment: 1 },
      },
    })

    if (result.count === 0) {
      throw new ConcurrentUpdateError()
    }

    return {
      userId,
      newVersion: current.version + 1,
      newBalance: Number(current.fsBalance) + amount,
    }
  }

  private async _resetBalanceOnce(userId: string): Promise<BalanceOperationResult> {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, version: true },
    })
    if (!current) throw new Error(`Usuário não encontrado: ${userId}`)

    const result = await prisma.user.updateMany({
      where: { id: userId, version: current.version },
      data: {
        fsBalance: 0,
        version: { increment: 1 },
      },
    })

    if (result.count === 0) {
      throw new ConcurrentUpdateError()
    }

    return {
      userId,
      newVersion: current.version + 1,
      newBalance: 0,
    }
  }

  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } })
  }
}

export const userService = new UserService()
