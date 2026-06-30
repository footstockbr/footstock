// ============================================================================
// FootStock Motor — AdminMarketActions
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
      case 'FORCE_CIRCUIT_BREAKER':
        return this.handleForceCircuitBreaker(action)
      default:
        return { success: false, message: `Ação desconhecida: ${(action as AdminAction).type}` }
    }
  }

  private async handlePauseAsset(action: AdminAction): Promise<{ success: boolean; message: string }> {
    if (!action.assetId) return { success: false, message: 'assetId obrigatório' }

    this.engine.pauseAsset(action.assetId, 'HALT_ASSET')
    await this.prisma.asset.update({
      where: { id: action.assetId },
      data: { isHalted: true, haltReason: 'HALT_ASSET', haltedUntil: null },
    })
    await this.auditLogger.log(action)

    return { success: true, message: `Ativo ${action.assetId} pausado` }
  }

  private async handleResumeAsset(action: AdminAction): Promise<{ success: boolean; message: string }> {
    if (!action.assetId) return { success: false, message: 'assetId obrigatório' }

    await this.prisma.asset.update({
      where: { id: action.assetId },
      data: { isHalted: false, haltReason: null, haltedUntil: null },
    })
    this.engine.resumeAsset(action.assetId)
    await this.auditLogger.log(action)

    return { success: true, message: `Ativo ${action.assetId} retomado` }
  }

  private async handleInjectNews(action: AdminAction): Promise<{ success: boolean; message: string }> {
    if (!action.assetId) return { success: false, message: 'assetId obrigatório' }

    const { impact, magnitude, durationTicks, sentiment } = action.payload as {
      impact: string
      magnitude: number
      durationTicks: number
      sentiment?: number
    }

    // Sinal derivado do sentimento (numérico) ou do campo impact (string)
    const isNegative = (sentiment !== undefined && sentiment < 0) || impact === 'NEGATIVE'
    const signedMagnitude = isNegative ? -Math.abs(magnitude) : magnitude
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

    this.engine.adjustPrice(action.assetId, newPrice, { adminId: action.adminId, reason: action.reason })
    await this.auditLogger.log(action, previousPrice, newPrice)

    return {
      success: true,
      message: `Preço ajustado: ${previousPrice} → ${newPrice}`,
    }
  }

  private async handleHaltAll(action: AdminAction): Promise<{ success: boolean; message: string }> {
    // Persistencia duravel + mutacao de memoria centralizadas em engine.haltAll
    // (DB-first, Task 003). Em falha de persistencia o engine re-lanca e a acao
    // retorna success=false sem pausa fantasma so-em-memoria.
    try {
      const count = await this.engine.haltAll()
      await this.auditLogger.log(action)
      return { success: true, message: `HALT_ALL: ${count} ativos pausados` }
    } catch (err) {
      return { success: false, message: `HALT_ALL falhou ao persistir: ${(err as Error).message}` }
    }
  }

  private async handleResumeAll(action: AdminAction): Promise<{ success: boolean; message: string }> {
    // engine.resumeAll retoma APENAS halts de admin (haltReason='HALT_ALL'),
    // preservando suspensoes de CIRCUIT_BREAKER. Persistencia DB-first interna.
    try {
      const count = await this.engine.resumeAll()
      await this.auditLogger.log(action)
      return { success: true, message: `RESUME_ALL: ${count} ativos retomados` }
    } catch (err) {
      return { success: false, message: `RESUME_ALL falhou ao persistir: ${(err as Error).message}` }
    }
  }

  private async handleForceCircuitBreaker(action: AdminAction): Promise<{ success: boolean; message: string }> {
    if (!action.assetId) return { success: false, message: 'assetId obrigatório' }

    const asset = await this.prisma.asset.findUnique({
      where: { id: action.assetId },
      select: { ticker: true, isHalted: true },
    })

    if (!asset) return { success: false, message: 'Ativo não encontrado' }
    if (asset.isHalted) return { success: false, message: `${asset.ticker} já está suspenso` }

    // Pausar no motor (memória com haltReason) e persistir no banco
    this.engine.pauseAsset(action.assetId, 'FORCE_CIRCUIT_BREAKER')

    await this.prisma.asset.update({
      where: { id: action.assetId },
      data: { isHalted: true, haltReason: 'FORCE_CIRCUIT_BREAKER' },
    })

    await this.auditLogger.log(action)

    logger.info(`[admin-actions] FORCE_CIRCUIT_BREAKER aplicado em ${asset.ticker} por admin ${action.adminId}`)
    return { success: true, message: `Circuit breaker forçado em ${asset.ticker}` }
  }
}
