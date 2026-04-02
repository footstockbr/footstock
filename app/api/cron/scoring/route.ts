// module-20: Cron endpoint — recálculo de scores (Vercel Cron, 1h)
// Protegido por Bearer CRON_SECRET — nunca exposto publicamente

import { NextRequest, NextResponse } from 'next/server'
import { scoringJobService } from '@/lib/services/ScoringJobService'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[cron/scoring] CRON_SECRET não configurado')
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 401 })
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const result = await scoringJobService.recalcularTodasLigas()
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[cron/scoring] Erro inesperado:', err)
    return NextResponse.json(
      { error: 'Erro interno no job de scoring' },
      { status: 500 }
    )
  }
}
