// T-023: Client HTTP para FlagCheck API — verificação de maioridade via CPF
// Timeout: 2s por tentativa, 1 retry automático em caso de timeout ou erro 5xx.
// CPF enviado como hash SHA-256 — nunca em texto claro.

import { hashCPF } from '@/lib/utils/crypto'

export interface FlagCheckResult {
  isAdult: boolean
  method: 'flagcheck'
}

export interface FlagCheckError {
  type: 'UNAVAILABLE' | 'MINOR_DETECTED' | 'CONFIG_MISSING'
  message: string
}

const TIMEOUT_MS = 2000
const MAX_RETRIES = 1

/**
 * Chama a API FlagCheck para verificar se o CPF pertence a um maior de 18 anos.
 * O CPF é hasheado antes de ser enviado — a API nunca recebe o CPF em texto claro.
 *
 * @returns FlagCheckResult em caso de sucesso, FlagCheckError em caso de falha
 */
export async function verifyAgeViaFlagCheck(
  cpf: string
): Promise<{ ok: true; data: FlagCheckResult } | { ok: false; error: FlagCheckError }> {
  const apiUrl = process.env.FLAGCHECK_API_URL
  const apiKey = process.env.FLAGCHECK_API_KEY

  if (!apiUrl || !apiKey) {
    return {
      ok: false,
      error: {
        type: 'CONFIG_MISSING',
        message: 'FLAGCHECK_API_URL ou FLAGCHECK_API_KEY não configurados',
      },
    }
  }

  const cpfHash = hashCPF(cpf)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

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

      // Sucesso — parsear response
      if (response.ok) {
        const body = await response.json() as { isAdult: boolean }
        if (!body.isAdult) {
          return {
            ok: false,
            error: {
              type: 'MINOR_DETECTED',
              message: 'CPF identificado como menor de idade pela FlagCheck',
            },
          }
        }
        return {
          ok: true,
          data: { isAdult: true, method: 'flagcheck' },
        }
      }

      // Erro 4xx (exceto 429) — não faz retry, é erro definitivo
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          ok: false,
          error: {
            type: 'UNAVAILABLE',
            message: `FlagCheck retornou ${response.status}`,
          },
        }
      }

      // Erro 5xx ou 429 — tentar retry
      if (attempt < MAX_RETRIES) {
        console.warn(`[FlagCheck] Tentativa ${attempt + 1} falhou (HTTP ${response.status}), retentando...`)
        continue
      }

      return {
        ok: false,
        error: {
          type: 'UNAVAILABLE',
          message: `FlagCheck indisponível após ${MAX_RETRIES + 1} tentativas (HTTP ${response.status})`,
        },
      }
    } catch (err) {
      // Timeout (AbortError) ou erro de rede
      if (attempt < MAX_RETRIES) {
        const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'rede'
        console.warn(`[FlagCheck] Tentativa ${attempt + 1} falhou (${reason}), retentando...`)
        continue
      }

      return {
        ok: false,
        error: {
          type: 'UNAVAILABLE',
          message: `FlagCheck indisponível após ${MAX_RETRIES + 1} tentativas`,
        },
      }
    }
  }

  // Nunca deve chegar aqui, mas TypeScript exige return
  return {
    ok: false,
    error: { type: 'UNAVAILABLE', message: 'FlagCheck indisponível' },
  }
}
