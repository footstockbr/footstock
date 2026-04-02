// ============================================================================
// Foot Stock — FlagCheck Service (ECA Digital)
// Integração com API FlagCheck para verificação de maioridade (18+)
// CPF enviado como hash SHA-256 — NUNCA em plaintext
// Rastreabilidade: INT-060, INT-109 | module-4, module-13
// ============================================================================

import { GATEWAY_TIMEOUT_MS } from '@/lib/constants/payment-security'

export interface FlagCheckResponse {
  isAdult: boolean
}

/**
 * Verifica se o CPF hasheado pertence a uma pessoa adulta (18+).
 * @param cpfHash SHA-256 do CPF concatenado com salt (NUNCA CPF bruto)
 * @returns { isAdult: boolean }
 * @throws Em caso de falha de rede ou erro do servidor FlagCheck
 */
export async function checkAge(cpfHash: string): Promise<FlagCheckResponse> {
  const apiUrl = process.env.FLAGCHECK_API_URL
  const apiKey = process.env.FLAGCHECK_API_KEY

  if (!apiUrl || !apiKey) {
    throw new Error('FlagCheck não configurado: FLAGCHECK_API_URL e FLAGCHECK_API_KEY obrigatórios')
  }

  const response = await fetch(`${apiUrl}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify({ cpfHash }),
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw { status: response.status, message: `FlagCheck error: ${response.statusText}` }
  }

  const data = await response.json()
  return { isAdult: Boolean(data.isAdult) }
}
