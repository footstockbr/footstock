// ============================================================================
// Foot Stock — GET /api/v1/health — Health Check Básico (público)
// Sem autenticação. Usado por Uptime Robot / BetterStack a cada 30s.
// NUNCA expõe detalhes de erro (stack traces, connection strings, IPs internos).
// Rastreabilidade: INT-110, module-27/TASK-2
// ============================================================================

import { NextResponse } from 'next/server'
import { runAllChecks } from '@/lib/monitoring/health'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { db, redis, motor } = await runAllChecks()

  const allOk = db.status === 'ok' && redis.status === 'ok' && motor.status === 'ok'

  const body = {
    api: 'ok',
    db: db.status,
    redis: redis.status,
    motor: motor.status === 'ok' ? 'online' : 'error',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0',
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(body, {
    status: allOk ? 200 : 503,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  })
}
