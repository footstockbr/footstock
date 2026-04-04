// ============================================================================
// Foot Stock — GET /api/health
// Endpoint de saúde para monitoramento e smoke tests.
// Não requer autenticação — acessível por load balancers e uptime monitors.
// ============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const start = Date.now()

  let dbStatus: 'ok' | 'error' = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    dbStatus = 'error'
  }

  const latencyMs = Date.now() - start
  const status = dbStatus === 'ok' ? 'ok' : 'degraded'

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.4.0',
      checks: {
        database: dbStatus,
      },
      latencyMs,
    },
    { status: status === 'ok' ? 200 : 503 }
  )
}
