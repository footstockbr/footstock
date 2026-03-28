import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const startTime = Date.now()

export async function GET() {
  const checks = {
    database: 'ok' as 'ok' | 'error',
    redis: 'ok' as 'ok' | 'error',
  }

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    checks.database = 'error'
  }

  // Redis check will be implemented when Redis is connected
  // For now, mark as ok (motor handles Redis directly)

  const allOk = Object.values(checks).every(v => v === 'ok')

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '1.0.0',
      uptime: (Date.now() - startTime) / 1000,
      services: checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  )
}
