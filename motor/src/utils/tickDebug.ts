// ============================================================================
// FootStock Motor — Instrumentação de debug por tick
//
// TODO:REMOVE debug instrumentation
// (loop 06-17-motor-footstock-correcoes-variacoes / T0.1)
//
// Log estruturado por tick ATRÁS DA FLAG `MOTOR_TICK_DEBUG` (default OFF).
// Não altera fórmula de preço nem side effects do tick: apenas LÊ campos já
// computados e emite um registro plano. Os mesmos campos são a fonte que o
// harness de medição (Item 003) consome.
//
// Reversão: remover este arquivo + a chamada em MarketEngine.runTick() e a
// flag em config/env.ts (ou simplesmente manter MOTOR_TICK_DEBUG desligada).
// ============================================================================

import { env } from '../config/env'
import { getTickDt } from '../engine/tick-dt'
import { logger } from './logger'
import type { AgentDecision } from '../agents/BaseAgent'
import type { LayerResult } from '../types/motor.types'

/** Decisão do MarketMaker sanitizada para o log (somente campos conhecidos). */
export interface TickDebugMarketMakerDecision {
  side: string
  quantity: number
  priceModifier: number
  reason: string
}

/** Registro estruturado emitido por tick quando a flag está ligada. */
export interface TickDebugRecord {
  ts: string
  ticker: string
  agentImpact: number
  syntheticVolume: number
  stateVolume: number
  pendingBuyVolume: number
  pendingSellVolume: number
  marketMakerDecision: TickDebugMarketMakerDecision | null
  ofiState: number
  l5VolumeRatio: number
  garchLastReturn: number
  dtEffective: number
}

/** Inputs crus capturados no corpo do tick (já computados pelo motor). */
export interface TickDebugInput {
  timestamp: number | string | Date
  ticker: string
  agentImpact: number
  syntheticVolume: number
  stateVolume: number
  pendingBuyVolume: number
  pendingSellVolume: number
  marketMakerDecision: AgentDecision | null
  ofiState: number
  layerResults: LayerResult[]
}

/** True quando a flag de debug por tick está ligada. */
export function isTickDebugEnabled(): boolean {
  return env.MOTOR_TICK_DEBUG === true
}

/**
 * DT efetivo do tick reportado no log de debug. Usa a MESMA resolução explícita
 * que L1/L2/L3 consomem (`getTickDt()`, T3.3): default-safe legacy 5/390, override
 * `MOTOR_TICK_DT_SECONDS` ou flag de recalibração. Desde T3.4 a resolução nunca
 * lança e sempre devolve um DT finito > 0 (override inválido vira warn + fallback),
 * então o reporte segue o mesmo DT que as camadas usam. O try/catch e o guard
 * permanecem como salvaguarda: o log de debug nunca pode derrubar o tick.
 */
export function effectiveDt(): number {
  try {
    const dt = getTickDt()
    return Number.isFinite(dt) && dt > 0 ? dt : 1
  } catch {
    return 1
  }
}

/** Coage qualquer valor para um número finito (0 quando NaN/undefined/inf). */
function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Procura uma métrica numérica em layerResults pela chave de metadata.
 * Retorna o primeiro valor finito encontrado, ou 0 quando ausente.
 * `l5.volumeRatio` vem do L5_KyleLambda; `garch.lastReturn` do L3 GARCH.
 */
export function findLayerMetric(layerResults: LayerResult[], key: string): number {
  if (!Array.isArray(layerResults)) return 0
  for (const result of layerResults) {
    const metric = result?.metadata?.[key]
    if (typeof metric === 'number' && Number.isFinite(metric)) {
      return metric
    }
  }
  return 0
}

/** ISO 8601 a partir de number|string|Date, defensivo contra valores inválidos. */
function toIso(timestamp: number | string | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const ms = date.getTime()
  return Number.isFinite(ms) ? date.toISOString() : new Date(0).toISOString()
}

/**
 * Monta o registro de debug a partir dos inputs do tick. Função PURA: não
 * lança, não muta inputs, nunca retorna NaN/undefined nos campos numéricos.
 * NÃO inclui segredos/env (apenas campos de mercado explicitamente listados).
 */
export function buildTickDebugRecord(input: TickDebugInput): TickDebugRecord {
  const mm = input.marketMakerDecision
  return {
    ts: toIso(input.timestamp),
    ticker: String(input.ticker ?? ''),
    agentImpact: finiteNumber(input.agentImpact),
    syntheticVolume: finiteNumber(input.syntheticVolume),
    stateVolume: finiteNumber(input.stateVolume),
    pendingBuyVolume: finiteNumber(input.pendingBuyVolume),
    pendingSellVolume: finiteNumber(input.pendingSellVolume),
    marketMakerDecision: mm
      ? {
          side: String(mm.side),
          quantity: finiteNumber(mm.quantity),
          priceModifier: finiteNumber(mm.priceModifier),
          reason: String(mm.reason),
        }
      : null,
    ofiState: finiteNumber(input.ofiState),
    l5VolumeRatio: findLayerMetric(input.layerResults, 'volumeRatio'),
    garchLastReturn: findLayerMetric(input.layerResults, 'lastReturn'),
    dtEffective: effectiveDt(),
  }
}

/** Emite o registro de debug via logger (canal estruturado, scope tick-debug). */
export function emitTickDebug(record: TickDebugRecord): void {
  logger.debug(JSON.stringify({ scope: 'tick-debug', ...record }))
}

/**
 * Helper único para o motor: se a flag estiver ligada, monta e emite o registro
 * e retorna-o (para testes); caso contrário, no-op retornando null.
 */
export function maybeEmitTickDebug(input: TickDebugInput): TickDebugRecord | null {
  if (!isTickDebugEnabled()) return null
  const record = buildTickDebugRecord(input)
  emitTickDebug(record)
  return record
}
