// T-023: Serviço de verificação de maioridade
// Ordem de prioridade: FlagCheck API → autodeclaração (fallback)

import { calcAge } from '@/lib/utils/validators'
import { verifyAgeViaFlagCheck } from '@/lib/services/FlagCheckService'
import { prisma } from '@/lib/prisma'

export interface AgeVerificationResult {
  isAdult: boolean
  verified: boolean
  method: 'flagcheck' | 'self_declaration' | 'date_only'
  pending: boolean
}

/**
 * Verifica maioridade por data de nascimento (autodeclaração).
 * Usado como pré-check rápido e fallback quando FlagCheck não está disponível.
 */
export function verifyAge(birthDate: string): AgeVerificationResult {
  const age = calcAge(birthDate)
  return {
    isAdult: age >= 18,
    verified: true,
    method: 'self_declaration',
    pending: false,
  }
}

/**
 * Verifica maioridade via FlagCheck API + fallback autodeclaração.
 * NÃO persiste nada no banco — retorna apenas o resultado.
 * A persistência (AgeVerification record) deve ser feita pelo caller
 * dentro da transaction do Prisma, APÓS o User ser criado.
 *
 * Fluxo:
 * 1. Se FlagCheck disponível e CPF é menor → bloqueia (isAdult=false, pending=false)
 * 2. Se FlagCheck disponível e CPF é maior → sucesso (isAdult=true, pending=false)
 * 3. Se FlagCheck indisponível + birthDate >= 18 → aceita com pending=true
 * 4. Se FlagCheck indisponível + birthDate < 18 → bloqueia
 */
export async function verifyAgeWithFlagCheck(
  cpf: string,
  birthDate: string
): Promise<AgeVerificationResult> {
  // 1. Tentar FlagCheck
  const flagResult = await verifyAgeViaFlagCheck(cpf)

  if (flagResult.ok) {
    // FlagCheck confirmou: maior de idade
    return { isAdult: true, verified: true, method: 'flagcheck', pending: false }
  }

  // FlagCheck detectou menor
  if (flagResult.error.type === 'MINOR_DETECTED') {
    return { isAdult: false, verified: true, method: 'flagcheck', pending: false }
  }

  // FlagCheck indisponível (UNAVAILABLE ou CONFIG_MISSING) — fallback
  const age = calcAge(birthDate)
  if (age < 18) {
    // Menor mesmo por autodeclaração — bloquear sem hesitar
    return { isAdult: false, verified: true, method: 'self_declaration', pending: false }
  }

  // Maior por autodeclaração, mas FlagCheck não confirmou — pendente
  return { isAdult: true, verified: false, method: 'self_declaration', pending: true }
}

/**
 * Retry de verificação FlagCheck para um usuário com verificação pendente.
 * Usado pelo cron job de retry.
 *
 * @returns true se verificação concluída (sucesso ou menor), false se ainda indisponível
 */
export async function retryFlagCheckVerification(
  userId: string,
  cpfHash: string
): Promise<{ resolved: boolean; isAdult: boolean }> {
  const apiUrl = process.env.FLAGCHECK_API_URL
  const apiKey = process.env.FLAGCHECK_API_KEY

  if (!apiUrl || !apiKey) {
    return { resolved: false, isAdult: false }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000)

    const response = await fetch(`${apiUrl}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ cpfHash }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return { resolved: false, isAdult: false }
    }

    const body = await response.json() as { isAdult: boolean }

    // Registrar resultado
    await prisma.ageVerification.create({
      data: {
        userId,
        cpfHash,
        isAdult: body.isAdult,
        method: 'FLAGCHECK',
        verifiedAt: new Date(),
      },
    })

    // Atualizar flag do usuário
    if (body.isAdult) {
      await prisma.user.update({
        where: { id: userId },
        data: { ageVerificationPending: false },
      })
    } else {
      // Menor detectado — suspender conta
      await prisma.user.update({
        where: { id: userId },
        data: {
          ageVerificationPending: false,
          status: 'SUSPENDED',
          suspensionReason: 'Menor de idade identificado pela verificação FlagCheck',
        },
      })
    }

    return { resolved: true, isAdult: body.isAdult }
  } catch {
    return { resolved: false, isAdult: false }
  }
}
