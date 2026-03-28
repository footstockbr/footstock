import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/v1/health — PUBLIC
export async function GET() {
  const result = {
    status: 'ok' as 'ok' | 'degraded',
    services: {
      database: 'ok' as 'ok' | 'error',
      redis: 'unknown' as 'ok' | 'unknown',
      motor: 'unknown' as 'ok' | 'unknown',
    },
    timestamp: new Date().toISOString(),
  }

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    result.services.database = 'error'
    result.status = 'degraded'
  }

  const httpStatus = result.status === 'ok' ? 200 : 503
  return NextResponse.json(result, { status: httpStatus })
}
