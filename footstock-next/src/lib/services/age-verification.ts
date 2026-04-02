import { calcAge } from '@/lib/utils/validators'

export interface AgeVerificationResult {
  isAdult: boolean
  verified: boolean
  method: 'flagcheck' | 'self_declaration' | 'date_only'
  message?: string
}

/**
 * Verifica se o usuário tem 18+ anos via FlagCheck API.
 * Retry 3x com backoff exponencial.
 * Se FlagCheck indisponível, bloqueia o cadastro (ECA Digital exige verificação técnica).
 *
 * NUNCA loga o CPF em plaintext.
 */
export async function verifyAge(
  cpf: string,
  birthDate: string
): Promise<AgeVerificationResult> {
  const ageFromDate = calcAge(birthDate)

  // Verificação rápida por data — fail fast para menores óbvios
  if (ageFromDate < 18) {
    return { isAdult: false, verified: true, method: 'date_only' }
  }

  // Sem FlagCheck configurado não é possível concluir verificação técnica
  if (!process.env.FLAGCHECK_API_URL || !process.env.FLAGCHECK_API_KEY) {
    return {
      isAdult: false,
      verified: false,
      method: 'self_declaration',
      message: 'Verificação automática indisponível. Tente novamente em instantes.',
    }
  }

  const flagCheckResult = await callFlagCheckWithRetry(cpf, 3)

  if (flagCheckResult.success) {
    return {
      isAdult: flagCheckResult.isAdult,
      verified: true,
      method: 'flagcheck',
    }
  }

  // Fallback: bloqueia cadastro sem verificação técnica concluída
  return {
    isAdult: false,
    verified: false,
    method: 'self_declaration',
    message: 'Verificação automática indisponível. Tente novamente em instantes.',
  }
}

interface FlagCheckResult {
  success: boolean
  isAdult: boolean
  error?: string
}

async function callFlagCheckWithRetry(
  cpf: string,
  maxRetries: number
): Promise<FlagCheckResult> {
  const cpfDigits = cpf.replace(/\D/g, '')

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${process.env.FLAGCHECK_API_URL}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.FLAGCHECK_API_KEY}`,
        },
        body: JSON.stringify({ cpf: cpfDigits }),
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) throw new Error(`FlagCheck HTTP ${response.status}`)

      const data = (await response.json()) as { is_adult: boolean }
      return { success: true, isAdult: data.is_adult }
    } catch (err) {
      if (attempt === maxRetries) {
        // Log sem CPF em plaintext
        console.warn(
          `[FlagCheck] Todas as ${maxRetries} tentativas falharam:`,
          (err as Error).message
        )
        return { success: false, isAdult: false, error: (err as Error).message }
      }
      // Backoff exponencial: 500ms, 1000ms, 2000ms
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 500))
    }
  }

  return { success: false, isAdult: false }
}
