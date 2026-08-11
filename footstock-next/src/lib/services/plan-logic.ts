// ============================================================================
// FootStock — plan-logic: 13 funções puras de negócio de planos
// Sem side effects, sem banco — input → output puros, testáveis isoladamente
// Cálculos de vigência em UTC (instante absoluto), independentes do fuso do
// processo. A exibição ao usuário converte para America/Sao_Paulo via
// @/lib/utils/format.
// ============================================================================

import type { PlanType } from '@/lib/enums'
import { PLAN_HIERARCHY } from '@/lib/enums'
import { getPlanAmountCents } from '@/lib/constants/plan-amounts-cents'

// ─── Tipos auxiliares ───────────────────────────────────────────────────────

export interface SubscriptionForLogic {
  planType: PlanType
  startsAt: Date
  expiresAt: Date
  status: string
  cancelledAt?: Date | null
  cancellationLockExpiresAt?: Date | null
}

// ─── 1. canUpgrade ──────────────────────────────────────────────────────────
/** true apenas para upgrades: JOGADOR→CRAQUE, JOGADOR→LENDA, CRAQUE→LENDA */
export function canUpgrade(currentPlan: PlanType, targetPlan: PlanType): boolean {
  return PLAN_HIERARCHY[targetPlan] > PLAN_HIERARCHY[currentPlan]
}

// ─── 2. canDowngrade ────────────────────────────────────────────────────────
/** Sempre false no checkout — downgrade só via cancelamento */
export function canDowngrade(_currentPlan: PlanType, _targetPlan: PlanType): boolean {
  return false
}

// ─── 3. calcBonusAmount ─────────────────────────────────────────────────────
/** Bônus FS$ inicial por plano */
export function calcBonusAmount(planType: PlanType): number {
  const bonuses: Record<PlanType, number> = {
    JOGADOR: 2000,
    CRAQUE: 5000,
    LENDA: 25000,
  }
  return bonuses[planType]
}

// ─── 3b. calcUpgradeBonusAmount ─────────────────────────────────────────────
/**
 * Bônus diferencial de upgrade (T-021 / CDC Art. 49).
 * Retorna o diferencial entre o plano novo e o anterior.
 * Exemplos: JOGADOR→CRAQUE=3000, JOGADOR→LENDA=23000, CRAQUE→LENDA=20000.
 * Retorna 0 para downgrades ou mesmo plano (não deve ocorrer em fluxo normal).
 */
export function calcUpgradeBonusAmount(fromPlan: PlanType, toPlan: PlanType): number {
  const diff = calcBonusAmount(toPlan) - calcBonusAmount(fromPlan)
  return Math.max(0, diff)
}

// ─── 3c. calcProRataResidualCents (M066 — upgrade pró-rata) ──────────────────
/**
 * Valor residual (em centavos) do tempo NÃO usado de um ciclo pago, calculado sobre a
 * janela REAL do período (currentPeriodStart/End quando existem; fallback startsAt/expiresAt).
 * Arredonda com Math.ceil A FAVOR do usuário e nunca excede o valor pago do ciclo.
 * Retorna 0 para janela inválida/expirada (windowEnd <= windowStart ou now >= windowEnd).
 */
export function calcProRataResidualCents(params: {
  amountCents: number
  windowStart: Date
  windowEnd: Date
  now: Date
}): number {
  const { amountCents, windowStart, windowEnd, now } = params
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0
  const totalMs = windowEnd.getTime() - windowStart.getTime()
  if (totalMs <= 0) return 0
  const remainingMs = Math.min(Math.max(windowEnd.getTime() - now.getTime(), 0), totalMs)
  if (remainingMs <= 0) return 0
  return Math.min(amountCents, Math.ceil((amountCents * remainingMs) / totalMs))
}

// Multiplicadores da compensação FS$ do upgrade (convenção 1 FS$ = R$1, mesma da comissão
// de afiliado). Copy SEMPRE "bônus promocional de migração" — nunca "reembolso/devolução"
// (expectativa de equivalência monetária + Lei 12.865/2013). Valores revisáveis por decisão
// de produto; o 1.3x do fallback compensa a falha do estorno em dinheiro (MP 3024).
export const UPGRADE_PRORATION_FS_MULTIPLIER = 1.2
export const UPGRADE_PRORATION_FALLBACK_FS_MULTIPLIER = 1.3

/** Converte residual em centavos para crédito FS$ (2 casas), aplicando o multiplicador. */
export function residualToFsCredit(residualCents: number, multiplier: number): number {
  if (!Number.isFinite(residualCents) || residualCents <= 0) return 0
  return Math.round(residualCents * multiplier) / 100
}

// ─── 4. calcSubscriptionAmount ──────────────────────────────────────────────
/**
 * Valor da assinatura em centavos BRL (Int — PCI-DSS).
 * FIX-12: delega na SSoT `PLAN_AMOUNTS_CENTS` para que cobranca e display leiam
 * do MESMO modulo (invariante "preco exibido == amountCents/100 cobrado").
 */
export function calcSubscriptionAmount(planType: PlanType, period: 'monthly' | 'yearly'): number {
  return getPlanAmountCents(planType, period)
}

// ─── 5. isWithinCoolingOff ──────────────────────────────────────────────────
/** CDC Art. 49: elegível para reembolso se dentro de 7 dias corridos (UTC) */
export function isWithinCoolingOff(subscription: SubscriptionForLogic, now: Date): boolean {
  const startsAtUTC = subscription.startsAt.getTime()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return now.getTime() <= startsAtUTC + sevenDays
}

// ─── 6. shouldSuspendAccount ────────────────────────────────────────────────
/** Período de graça: expirou mas ainda dentro dos 7 dias adicionais */
export function shouldSuspendAccount(subscription: SubscriptionForLogic, now: Date): boolean {
  if (subscription.status !== 'ACTIVE') return false
  const expiresUTC = subscription.expiresAt.getTime()
  const nowUTC = now.getTime()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return expiresUTC < nowUTC && nowUTC <= expiresUTC + sevenDays
}

// ─── 7. shouldDowngradeToJogador ────────────────────────────────────────────
/** Período de graça expirou — downgrade definitivo para Jogador */
export function shouldDowngradeToJogador(subscription: SubscriptionForLogic, now: Date): boolean {
  if (!['EXPIRED', 'SUSPENDED'].includes(subscription.status)) return false
  const expiresUTC = subscription.expiresAt.getTime()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return now.getTime() > expiresUTC + sevenDays
}

// ─── 8. getRestrictedPositionTypes ──────────────────────────────────────────
/** Tipos de posição incompatíveis com o plano de destino */
export function getRestrictedPositionTypes(fromPlan: PlanType, toPlan: PlanType): string[] {
  if (fromPlan === 'LENDA' && toPlan === 'JOGADOR') return ['SHORT', 'LEVERAGED']
  if (fromPlan === 'LENDA' && toPlan === 'CRAQUE') return ['SHORT', 'LEVERAGED']
  return []
}

// ─── 9. shouldEnterCancellationLock ─────────────────────────────────────────
/** Cancelamento fora do período de arrependimento aciona trava de 48h */
export function shouldEnterCancellationLock(subscription: SubscriptionForLogic, now: Date): boolean {
  return !isWithinCoolingOff(subscription, now)
}

// ─── 10. getCancellationLockExpiry ──────────────────────────────────────────
/**
 * Data de expiração da trava (T+7d): após este prazo sem revert → CANCELLED.
 * Todos os cálculos em UTC para evitar bugs de timezone/DST.
 */
export function getCancellationLockExpiry(lockStartedAt: Date): Date {
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return new Date(lockStartedAt.getTime() + sevenDays)
}

// FIX-10 (2026-06-22): removidas as 4 funcoes orfas da liquidacao forcada T+48h
// (getForcedLiquidationAt, getBlockedFeatures, getCompulsoryLiquidationPositions,
// isCancellationLockExpired). Eram codigo morto: dependiam de forcedLiquidationAt,
// que nunca e setado non-null. getRestrictedPositionTypes (sec. 8) preservada.
