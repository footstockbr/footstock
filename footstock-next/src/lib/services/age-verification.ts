// T-023: Serviço de verificação de maioridade
// Modelo atual: autodeclaração por data de nascimento (confirmação do usuário).

import { calcAge } from '@/lib/utils/validators'

export interface AgeVerificationResult {
  isAdult: boolean
  verified: boolean
  method: 'self_declaration' | 'date_only'
}

/**
 * Verifica maioridade por data de nascimento declarada (autodeclaração).
 * Não persiste nada no banco — retorna apenas o resultado.
 */
export function verifyAge(birthDate: string): AgeVerificationResult {
  const age = calcAge(birthDate)
  return {
    isAdult: age >= 18,
    verified: true,
    method: 'self_declaration',
  }
}
