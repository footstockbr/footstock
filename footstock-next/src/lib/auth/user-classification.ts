// ============================================================================
// User classification — staff (sem planType) vs player (com planType).
//
// Eixos ortogonais:
//   - userType:  NORMAL | ADMIN | CLUB_PARTNER | TIME_PARCEIRO | INFLUENCIADOR
//   - adminRole: SUPER_ADMIN | ADMINISTRADOR | MONITOR | EDITOR | MODERADOR
//                | CLUB_PARTNER | null
//   - planType:  JOGADOR | CRAQUE | LENDA | null  (null = staff)
//
// Regra canonica (brief INTAKE.md secao "Usuarios"):
//   Plano e conceito de player. Staff (ADMIN/CLUB_PARTNER) NAO tem planType.
// ============================================================================

import { PLAN_TYPE, STAFF_USER_TYPES, USER_TYPE, type PlanType, type UserType } from '@/lib/enums'

export interface UserClassification {
  userType: UserType | string | null | undefined
  adminRole?: string | null
  planType?: PlanType | null
}

export interface StaffUser extends UserClassification {
  userType: 'ADMIN' | 'CLUB_PARTNER'
  planType: null
}

export interface PlayerUser extends UserClassification {
  userType: 'NORMAL' | 'TIME_PARCEIRO' | 'INFLUENCIADOR'
  planType: PlanType
}

/** True se o usuario e staff (sem planType, sem trading/assinatura). */
export function isStaffUser(u: UserClassification | null | undefined): u is StaffUser {
  if (!u) return false
  const t = u.userType
  return t === USER_TYPE.ADMIN || t === USER_TYPE.CLUB_PARTNER
}

/** True se o usuario e player (tem planType, faz trading). */
export function isPlayerUser(u: UserClassification | null | undefined): u is PlayerUser {
  if (!u) return false
  return !isStaffUser(u)
}

/**
 * Lanca erro 403 se o usuario for staff. Use em endpoints player-only:
 * payments/checkout, orders, leagues/join, leverage, short.
 */
export function assertPlayerUser(
  u: UserClassification | null | undefined,
  errorCode: string = 'STAFF_NOT_ALLOWED',
): asserts u is PlayerUser {
  if (isStaffUser(u)) {
    const err = new Error('Operacao indisponivel para contas administrativas/institucionais.') as Error & {
      code?: string
      statusCode?: number
    }
    err.code = errorCode
    err.statusCode = 403
    throw err
  }
}

/**
 * Retorna o plano efetivo para gates de UI/conteudo (ex: delay de cotacao,
 * acesso ao assessor). Staff recebe LENDA-equivalent (acesso pleno);
 * player sem plano recebe JOGADOR (defensivo).
 */
export function effectivePlanForGating(u: UserClassification | null | undefined): PlanType {
  if (!u) return PLAN_TYPE.JOGADOR
  if (isStaffUser(u)) return PLAN_TYPE.LENDA
  return u.planType ?? PLAN_TYPE.JOGADOR
}

/**
 * Retorna o saldo FS$ inicial padrao do perfil. Players escalam por plano;
 * staff recebe valor fixo (ferramenta operacional, nao trading real).
 */
export function balanceForUser(u: UserClassification | null | undefined): number {
  if (!u) return 2000
  if (isStaffUser(u)) return 10000
  switch (u.planType) {
    case PLAN_TYPE.LENDA:
      return 25000
    case PLAN_TYPE.CRAQUE:
      return 5000
    default:
      return 2000
  }
}

/** Predicate util para queries Prisma: where: { userType: { in: STAFF_USER_TYPES } } */
export { STAFF_USER_TYPES }
