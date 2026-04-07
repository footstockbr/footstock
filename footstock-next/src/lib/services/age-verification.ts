import { calcAge } from '@/lib/utils/validators'

export interface AgeVerificationResult {
  isAdult: boolean
  verified: boolean
  method: 'self_declaration' | 'date_only'
}

/**
 * Verifica se o usuário tem 18+ anos com base na data de nascimento declarada.
 * A confirmação da veracidade é responsabilidade do usuário (autodeclaração na tela de confirmação).
 */
export function verifyAge(birthDate: string): AgeVerificationResult {
  const age = calcAge(birthDate)
  return {
    isAdult: age >= 18,
    verified: true,
    method: 'self_declaration',
  }
}
