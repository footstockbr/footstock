// ============================================================================
// GET /api/v1/assets/clubs-for-selection
//
// Endpoint especial para o wizard de cadastro (Step 3 — Seleção de Clube).
// Retorna lista de clubes com displayName E realName para que o usuário possa
// identificar seu clube do coração antes de completar o cadastro.
//
// SEGURANÇA:
//   • realName é exibido SOMENTE neste endpoint
//   • Rate limiting por IP (via ratelimit compartilhado com /auth/register)
//   • Sem autenticação — usuário ainda não completou cadastro
//   • Nenhum dado sensível além de (ticker, displayName, realName)
//
// T-024: Nomes Fictícios de Clubes e Aliases de Ticker
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRegisterRateLimit } from '@/lib/ratelimit'

export async function GET(request: NextRequest) {
  // Rate limiting por IP — mesmo bucket do registro para prevenir scraping
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { success: withinLimit } = await getRegisterRateLimit().limit(`clubs-selection:${ip}`)
  if (!withinLimit) {
    return NextResponse.json(
      { error: { code: 'RATE_001', message: 'Muitas requisições. Aguarde alguns instantes.' } },
      { status: 429 }
    )
  }

  try {
    const assets = await prisma.asset.findMany({
      where: { isActive: true },
      select: {
        ticker: true,
        displayName: true,
        realName: true,
        division: true,
        colorPrimary: true,
        colorSecondary: true,
      },
      orderBy: [{ division: 'asc' }, { ticker: 'asc' }],
    })

    const clubs = assets.map((a) => ({
      ticker: a.ticker,
      displayName: a.displayName,
      // realName pode ser null para ativos sintéticos — retorna displayName como fallback
      realName: a.realName ?? a.displayName,
      division: a.division,
      colors: { primary: a.colorPrimary, secondary: a.colorSecondary },
    }))

    const response = NextResponse.json({ data: clubs })
    // Cache público curto — lista muda raramente, mas não deve ser stale por muito tempo
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    return response
  } catch (err) {
    console.error('[API] GET /assets/clubs-for-selection error', err)
    return NextResponse.json(
      { error: { code: 'SERVER_001', message: 'Erro interno. Tente novamente.' } },
      { status: 500 }
    )
  }
}
