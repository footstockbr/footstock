// google-zkp-verification.ts — Integração Google ZKP para verificação de idade
// Alternativa ao FlagCheck (CL-308, CL-012)

export interface ZKPVerificationResult {
  verified: boolean
  method: 'google-zkp' | 'flagcheck' | 'fallback'
  ageAbove18: boolean | null
  error?: string
}

export class GoogleZKPVerification {
  private static readonly TIMEOUT_MS = 5000
  private static readonly GOOGLE_ZKP_API = process.env.GOOGLE_ZKP_API_URL ?? ''

  /**
   * Verifica idade via Google ZKP (Zero-Knowledge Proof)
   * Não revela a data exata — retorna apenas booleano
   */
  static async verifyAge(token: string): Promise<ZKPVerificationResult> {
    if (!this.GOOGLE_ZKP_API) {
      return { verified: false, method: 'google-zkp', ageAbove18: null, error: 'Google ZKP não configurado' }
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.TIMEOUT_MS)

      const response = await fetch(`${this.GOOGLE_ZKP_API}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) throw new Error(`ZKP API error: ${response.status}`)

      const data = await response.json()
      return {
        verified: true,
        method: 'google-zkp',
        ageAbove18: data.ageAbove18 ?? null,
      }
    } catch (error) {
      console.warn('[GoogleZKP] Falha, usando fallback FlagCheck:', error)
      return {
        verified: false,
        method: 'google-zkp',
        ageAbove18: null,
        error: error instanceof Error ? error.message : 'Erro na verificação ZKP',
      }
    }
  }
}
