// ============================================================================
// Foot Stock Motor — AdminMarketActions
// Handler que processa ações admin e as aplica no MarketEngine.
// Cada ação é auditada via AuditLogger.
// ============================================================================

import type { MarketEngine } from '../engine/MarketEngine'
import type { AuditLogger } from './AuditLogger'
import type { AdminAction } from '../types/motor.types'
import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

export class AdminMarketActions {
  constructor(
    private engine: MarketEngine,
    private auditLogger: AuditLogger,
    private prisma: PrismaClient
  ) {}

  async handle(action: AdminAction): Promise<{ success: boolean; message: string }> {
    logger.info(`[admin-actions] Processando: ${action.type} | admin: ${action.adminId}`)

    switch (action.type) {
      case 'PAUSE_ASSET':
        return this.handlePauseAsset(action)
      case 'RESUME_ASSET':
        return this.handleResumeAsset(action)
      case 'INJECT_NEWS':
        return this.handleInjectNews(action)
      case 'ADJUST_PRICE':
        return this.handleAdjustPrice(action)
      case 'HALT_ALL':
        return this.handleHaltAll(action)
      case 'RESUME_ALL':
        return this.handleResumeAll(action)
      default:
        return { success: false, message: `Ação desconhecida: ${(action as AdminAction).type}` }
    }
  }

  private async handlePauseAsset(action: AdminAction): Promise<{ success: boolean; message: string }> {
    if (!action.assetId) return { success: false, message: 'assetId obrigatório' }

    this.engine.pauseAsset(action.assetId)
    await this.auditLogger.log(action)

    return { success: true, message: `Ativo ${action.assetId} pausado` }
  }

  private async handleResumeAsset(action: AdminAction): Promise<{ success: boolean; message: string }> {
    if (!action.assetId) return { success: false, message: 'assetId obrigatório' }

    this.engine.resumeAsset(action.assetId)
    await this.auditLogger.log(action)

    return { success: true, message: `Ativo ${action.assetId} retomado` }
  }

  private async handleInjectNews(action: AdminAction): Promise<{ success: boolean; message: string }> {
    if (!action.assetId) return { success: false, message: 'assetId obrigatório' }

    const { impact, magnitude, durationTicks } = action.payload as {
      impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
      magnitude: number
      durationTicks: number
    }

    const signedMagnitude = impact === 'NEGATIVE' ? -Math.abs(magnitude) : magnitude
    this.engine.injectNewsImpact(action.assetId, signedMagnitude, durationTicks ?? 10)
    await this.auditLogger.log(action)

    return {
      success: true,
      message: `Notícia ${impact} injetada no ativo ${action.assetId} (${durationTicks} ticks)`,
    }
  }

  private async handleAdjustPrice(action: AdminAction): Promise<{ success: boolean; message: string }> {
    if (!action.assetId) return { success: false, message: 'assetId obrigatório' }

    const { newPrice } = action.payload as { newPrice: number }
    if (!newPrice || newPrice <= 0) {
      return { success: false, message: 'newPrice deve ser positivo' }
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: action.assetId },
      select: { currentPrice: true },
    })

    const previousPrice = asset ? Number(asset.currentPrice) : undefined

    await this.prisma.asset.update({
      where: { id: action.assetId },
      data: { currentPrice: newPrice, closePrice: newPrice },
    })

    this.engine.adjustPrice(action.assetId, newPrice)
    await this.auditLogger.log(action, previousPrice, newPrice)

    return {
      success: true,
      message: `Preço ajustado: ${previousPrice} → ${newPrice}`,
    }
  }

  private async handleHaltAll(action: AdminAction): Promise<{ success: boolean; message: string }> {
    const count = this.engine.haltAll()
    await this.auditLogger.log(action)
    return { success: true, message: `HALT_ALL: ${count} ativos pausados` }
  }

  private async handleResumeAll(action: AdminAction): Promise<{ success: boolean; message: string }> {
    const count = this.engine.resumeAll()
    await this.auditLogger.log(action)
    return { success: true, message: `RESUME_ALL: ${count} ativos retomados` }
  }
}
