// minorProfilingGuard — ECA: proibido profilamento comportamental de menores de 18 anos

import { MIN_AGE_FOR_PROFILING } from '@/lib/constants/compliance'

export type ProfilingAction =
  | 'analytics'
  | 'behavioral_tracking'
  | 'recommendation'
  | 'ad_targeting'
  | 'preference_profiling'

/** Ações que são permitidas independentemente da idade */
const ALWAYS_ALLOWED: ProfilingAction[] = []

/** Calcula a idade em anos a partir da data de nascimento */
function calculateAge(birthDate: Date): number {
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

/**
 * Verifica se uma ação de profilamento é permitida para o usuário.
 * Retorna false se o usuário for menor de 18 anos.
 */
export function minorProfilingGuard(
  user: { birthDate?: Date | string | null },
  action: ProfilingAction
): boolean {
  if (ALWAYS_ALLOWED.includes(action)) return true
  if (!user.birthDate) return true // sem data de nascimento: permitir (verificação mais permissiva)

  const birthDate = user.birthDate instanceof Date ? user.birthDate : new Date(user.birthDate)
  const age = calculateAge(birthDate)

  if (age < MIN_AGE_FOR_PROFILING) {
    // Log para auditoria (em produção, enviar para serviço de auditoria)
    console.warn(`[MinorProfilingGuard] Ação '${action}' bloqueada para usuário menor de ${MIN_AGE_FOR_PROFILING} anos`)
    return false
  }

  return true
}

/** Verifica se o usuário é menor de idade */
export function isMinor(user: { birthDate?: Date | string | null }): boolean {
  if (!user.birthDate) return false
  const birthDate = user.birthDate instanceof Date ? user.birthDate : new Date(user.birthDate)
  return calculateAge(birthDate) < MIN_AGE_FOR_PROFILING
}
