// ============================================================================
// FootStock — Market: info pública do Circuit Breaker (limiar + estado)
// GET /api/v1/market/circuit-breaker-info → { thresholdPct, enabled, haltDurationMin }
// ----------------------------------------------------------------------------
// Read-only para a UI do investidor (ex.: banner de ativo suspenso em
// AssetDetailPage), refletindo o MESMO limiar configurado no admin (SSoT
// motor:layers:config:v1). Sem isto o texto "atinge 8%" ficaria hardcoded e
// divergiria do valor real após o admin alterar o limiar.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ok, errors } from '@/lib/api'
import { readCircuitBreakerConfig } from '@/lib/motor/circuit-breaker-config'

export async function GET(_req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { config } = await readCircuitBreakerConfig()
    return ok({
      enabled: config.enabled,
      thresholdPct: Math.round(config.halt_trigger * 100 * 100) / 100, // 0.08 → 8
      haltDurationMin: Math.round((config.halt_duration_s / 60) * 10) / 10, // 300s → 5
    })
  } catch (err) {
    console.error('[market/circuit-breaker-info] error:', err)
    return errors.server()
  }
}
