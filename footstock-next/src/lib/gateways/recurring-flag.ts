// ============================================================================
// FootStock — Feature flag de recorrencia real (loop 06-24, Task 004)
// SSoT de LEITURA do flag `recurring_enabled.{gateway}` (default OFF / INV-4).
// Persistido como campo `recurringEnabled` por gateway no blob de config ja
// existente em Redis (`admin:gateway:config:v1`), reusando o canal de config
// de gateways (decisao registrada no review-created da task 004).
// ============================================================================

import { redisPublisher } from '@/lib/redis'

const REDIS_KEY = 'admin:gateway:config:v1'

/**
 * Le o flag de recorrencia de um gateway a partir do blob de config em Redis.
 *
 * INV-4 (default OFF): qualquer caminho de ausencia ou erro resolve para `false`.
 * - chave Redis ausente            -> false
 * - JSON malformado                -> false
 * - shape inesperado               -> false
 * - gateway nao encontrado no blob -> false
 * - `recurringEnabled` ausente     -> false (so `=== true` liga)
 * - excecao de I/O do Redis        -> false (log + degradacao segura, Zero Silencio)
 *
 * Ligar o flag exige aceite em sandbox (item 009 verde); nasce OFF em
 * `buildDefaultConfig()` e so vira ON via PATCH SUPER_ADMIN.
 *
 * @param gatewayCode codigo canonico do gateway (MERCADO_PAGO | PAGSEGURO | PAYPAL)
 * @returns true somente quando o flag esta explicitamente ON para o gateway
 */
export async function isRecurringEnabled(gatewayCode: string): Promise<boolean> {
  const code = gatewayCode.toUpperCase()
  try {
    const raw = await redisPublisher.get(REDIS_KEY)
    if (!raw) return false

    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return false
    }

    if (typeof json !== 'object' || json === null) return false
    const gateways = (json as { gateways?: unknown }).gateways
    if (!Array.isArray(gateways)) return false

    const entry = gateways.find(
      (g): g is { code?: unknown; recurringEnabled?: unknown } =>
        typeof g === 'object' && g !== null && (g as { code?: unknown }).code === code
    )
    if (!entry) return false

    return entry.recurringEnabled === true
  } catch (error) {
    // Degradacao segura: indisponibilidade do Redis nunca liga recorrencia.
    console.error(`[recurring-flag] Falha ao ler flag de recorrencia (gateway=${code}); resolvendo OFF:`, error)
    return false
  }
}
