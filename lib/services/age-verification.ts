import { calcAge } from '@/lib/utils/formatDate'
import { prisma } from '@/lib/prisma'

export interface AgeVerificationResult {
  isAdult: boolean
  verified: boolean
  verifiedAt: string
  verificationMethod: 'api' | 'self_declaration' | 'birthdate'
  error?: string
  /** @deprecated Use verificationMethod */
  method?: 'flagcheck' | 'self_declaration' | 'date_only'
  message?: string
}

/**
 * Verifica se o usuario tem 18+ anos via FlagCheck API.
 * Retry 3x com backoff exponencial.
 * Se FlagCheck indisponivel, bloqueia o cadastro (ECA Digital exige verificacao tecnica).
 *
 * NUNCA envia o CPF em plaintext para logs — apenas para a API FlagCheck.
 */
export async function verifyAge(cpf: string, birthDate: string): Promise<AgeVerificationResult> {
  const ageFromDate = calcAge(birthDate)
  const now = new Date().toISOString()

  // Verificacao basica por data (cliente) — fail fast para menores obvios
  if (ageFromDate < 18) {
    return { isAdult: false, verified: true, verifiedAt: now, verificationMethod: 'birthdate', method: 'date_only' }
  }

  // Tentar FlagCheck API
  const flagCheckResult = await callFlagCheckWithRetry(cpf, 3)

  if (flagCheckResult.success) {
    return {
      isAdult: flagCheckResult.isAdult,
      verified: true,
      verifiedAt: now,
      verificationMethod: 'api',
      method: 'flagcheck',
    }
  }

  // Fallback: sem verificacao tecnica nao pode concluir cadastro
  return {
    isAdult: false,
    verified: false,
    verifiedAt: now,
    verificationMethod: 'self_declaration',
    method: 'self_declaration',
    message: 'Verificacao automatica indisponivel. Tente novamente em instantes.',
  }
}

interface FlagCheckResult {
  success: boolean
  isAdult: boolean
  error?: string
}

async function callFlagCheckWithRetry(cpf: string, maxRetries: number): Promise<FlagCheckResult> {
  const apiUrl = process.env.FLAGCHECK_API_URL
  const apiKey = process.env.FLAGCHECK_API_KEY

  // Se FlagCheck nao esta configurado, fallback imediato
  if (!apiUrl || !apiKey) {
    return { success: false, isAdult: false, error: 'FlagCheck not configured' }
  }

  const cpfDigits = cpf.replace(/\D/g, '')

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${apiUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ cpf: cpfDigits }),
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) throw new Error(`FlagCheck HTTP ${response.status}`)

      const data = await response.json() as { is_adult: boolean }
      return { success: true, isAdult: data.is_adult }
    } catch (err) {
      if (attempt === maxRetries) {
        console.warn(`[FlagCheck] Todas as ${maxRetries} tentativas falharam:`, (err as Error).message)
        return { success: false, isAdult: false, error: String(err) }
      }
      // Backoff exponencial: 500ms, 1000ms, 2000ms
      await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 500))
    }
  }

  return { success: false, isAdult: false }
}

/**
 * Verifica a maioridade de um usuário já registrado no banco.
 * Atualiza `ageVerificationPending` conforme resultado.
 * Rastreabilidade: TASK-2/ST004, INT-109
 */
export async function verifyAgeForUser(
  userId: string,
  birthDate: Date,
  cpfForVerification?: string
): Promise<AgeVerificationResult> {
  const birthDateStr = birthDate.toISOString().split('T')[0] ?? birthDate.toISOString()
  const cpf = cpfForVerification ?? ''

  const result = await verifyAge(cpf, birthDateStr)

  // Atualizar flag no banco conforme resultado
  const pending = !result.isAdult || result.verificationMethod === 'self_declaration'
  await prisma.user.update({
    where: { id: userId },
    data: { ageVerificationPending: pending },
  }).catch(() => { /* silencioso — não bloquear cadastro */ })

  return result
}
