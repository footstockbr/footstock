// T-023: Cron endpoint — retry de verificação de maioridade via FlagCheck
// Protegido por Bearer CRON_SECRET — nunca exposto publicamente
// Frequência recomendada: a cada 15 minutos (Vercel Cron)

import { NextRequest, NextResponse } from 'next/server'
import { retryAgeVerificationJob } from '@/lib/jobs/retry-age-verification'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[cron/age-verification-retry] CRON_SECRET não configurado')
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 401 })
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const result = await retryAgeVerificationJob()
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[cron/age-verification-retry] Erro inesperado:', err)
    return NextResponse.json(
      { error: 'Erro interno no job de retry de verificação de idade' },
      { status: 500 }
    )
  }
}
