// ============================================================================
// Foot Stock — plan-logic: 13 funções puras de negócio de planos
// Sem side effects, sem banco — input → output puros, testáveis isoladamente
// Todos os cálculos de data em UTC para evitar bugs de timezone
// ============================================================================

import type { PlanType } from '@/lib/enums'
import { PLAN_HIERARCHY } from '@/lib/enums'

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

// ─── 4. calcSubscriptionAmount ──────────────────────────────────────────────
/** Valor da assinatura em centavos BRL (Int — PCI-DSS) */
export function calcSubscriptionAmount(planType: PlanType, period: 'monthly' | 'yearly'): number {
  const amounts: Record<PlanType, Record<'monthly' | 'yearly', number>> = {
    JOGADOR: { monthly: 0, yearly: 0 },
    CRAQUE:  { monthly: 1990, yearly: 17910 }, // R$19,90 / R$179,10 (-25%)
    LENDA:   { monthly: 3990, yearly: 35910 }, // R$39,90 / R$359,10 (-25%)
  }
  return amounts[planType][period]
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
/** Data de expiração da trava: cancellationRequest + 48h exatos (UTC) */
export function getCancellationLockExpiry(cancellationRequestDate: Date): Date {
  const fortyEightHours = 48 * 60 * 60 * 1000
  return new Date(cancellationRequestDate.getTime() + fortyEightHours)
}

// ─── 11. getBlockedFeatures ─────────────────────────────────────────────────
/** Features bloqueadas IMEDIATAMENTE ao entrar em CANCELLATION_LOCK */
export function getBlockedFeatures(fromPlan: PlanType): string[] {
  if (fromPlan === 'LENDA') {
    return ['ordens limitadas', 'ordens agendadas', 'OCO', 'short selling', 'alavancagem 2x', 'assessor IA', 'ligas PRO']
  }
  if (fromPlan === 'CRAQUE') {
    return ['ordens limitadas', 'ordens agendadas']
  }
  return []
}

// ─── 12. getCompulsoryLiquidationPositions ──────────────────────────────────
/** Tipos de posição em venda compulsória após 48h de CANCELLATION_LOCK */
export function getCompulsoryLiquidationPositions(fromPlan: PlanType): string[] {
  if (fromPlan === 'LENDA') return ['SHORT', 'LEVERAGED', 'OCO']
  return []
}

// ─── 13. isCancellationLockExpired ──────────────────────────────────────────
/** Verifica se as 48h de trava expiraram */
export function isCancellationLockExpired(subscription: SubscriptionForLogic, now: Date): boolean {
  if (!subscription.cancellationLockExpiresAt) return false
  return subscription.cancellationLockExpiresAt.getTime() <= now.getTime()
}
