// GET /api/cron/reconcile-news-impact
// Reenvia para o motor noticias administrativas salvas sem impacto aplicado.

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { newsInjectionService } from '@/lib/services/NewsInjectionService'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50

  try {
    const result = await newsInjectionService.reconcileUnappliedNews(limit)
    return NextResponse.json({
      success: result.failed === 0,
      ...result,
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reconcile-news-impact] Erro:', err)
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}
