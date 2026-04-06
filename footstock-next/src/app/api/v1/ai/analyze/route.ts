import { NextRequest } from 'next/server'
import { getAuthUser, hasPlan } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { getAIAnalyzeRateLimit } from '@/lib/ratelimit'
import type { AIAnalysis } from '@/types'

// GET /api/v1/ai/analyze?ticker=URU3
// Plano mínimo: CRAQUE
// Rate limit: 10 req/hora por userId
// Cache Redis TTL 30 min por ticker+plano
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasPlan(auth.user.planType, 'CRAQUE')) {
    return errors.forbidden(
      'O Assessor IA está disponível a partir do plano Craque.',
      'CRAQUE'
    )
  }

  // Rate limit: 10 req/h por userId (conforme INTAKE — controle billing Anthropic)
  const rateLimiter = getAIAnalyzeRateLimit()
  const { success, reset } = await rateLimiter.limit(auth.user.id)
  if (!success) {
    const resetAt = new Date(reset).toISOString()
    return errors.rateLimit('Limite de análises atingido. Tente novamente em breve.', resetAt)
  }

  const ticker = request.nextUrl.searchParams.get('ticker')

  if (!ticker) {
    return errors.validation('Parâmetro ticker é obrigatório.')
  }

  try {
    const asset = await prisma.asset.findUnique({
      where: { ticker: ticker.toUpperCase() },
    })

    if (!asset) return errors.notFound('Ativo não encontrado.')

    const recentNews = await prisma.news.findMany({
      where: { assetIds: { has: ticker.toUpperCase() } },
      orderBy: { publishedAt: 'desc' },
      take: 5,
    })

    // TODO: Implementar via /auto-flow execute
    // 1. Verificar cache Redis (TTL 30 min) por ticker+planType
    // 2. Chamar Claude Sonnet (LENDA com web_search; CRAQUE sem)
    // 3. Parsear resposta estruturada
    // 4. Armazenar no cache Redis

    const sentimentToAsset = (s: string): AIAnalysis['sentimentoGeral'] => {
      if (s === 'BULLISH') return 'BULLISH'
      if (s === 'BEARISH') return 'BEARISH'
      return 'NEUTRO'
    }

    const analysis: AIAnalysis = {
      ticker: asset.ticker,
      clubName: asset.name,
      resumo: 'Análise em desenvolvimento. Execute /auto-flow execute para implementar.',
      pontosPositivos: [],
      pontosNegativos: [],
      sentimentoGeral: asset.sentiment as AIAnalysis['sentimentoGeral'],
      recomendacao: 'MANTER',
      nivelRisco: 'MEDIO',
      noticiasRecentes: recentNews.map((n) => ({
        titulo: n.title,
        sentimento: sentimentToAsset(n.sentiment),
        emoji: n.sentiment === 'BULLISH' ? '📈' : n.sentiment === 'BEARISH' ? '📉' : '➡️',
      })),
    }

    return ok(analysis)
  } catch {
    return errors.server('Assessor indisponível. Tente em breve.')
  }
}
