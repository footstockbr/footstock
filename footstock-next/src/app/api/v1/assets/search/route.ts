// ============================================================================
// Foot Stock — GET /api/v1/assets/search?q=FLA3 (T-031)
// Busca de ativos com suporte a aliases de ticker.
//
// Fluxo de resolução:
//   1. Tenta resolver q como alias → ticker canônico (FLA3 → URU3)
//   2. Se não resolver como alias exato, faz busca parcial em ticker/displayName/searchText
//   3. Resposta sempre retorna ticker canônico (nunca o alias buscado)
//   4. Autocomplete: retorna ticker fictício + displayName
//
// Segurança:
//   - Requer auth
//   - searchText NUNCA retornado (SUPER_ADMIN apenas)
//   - campos sensíveis de identidade nunca retornados ao cliente
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, list } from '@/lib/api'
import { AliasService } from '@/services/AliasService'

const MAX_RESULTS = 10

// GET /api/v1/assets/search?q=FLA3
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: { code: 'SEARCH_001', message: 'Parâmetro q deve ter pelo menos 2 caracteres.' } },
      { status: 400 }
    )
  }

  const upper = q.toUpperCase()

  try {
    // 1. Tentar resolver como alias exato (FLA3 → URU3)
    const resolvedTicker = await AliasService.resolve(upper)

    if (resolvedTicker) {
      // Alias resolvido — retornar apenas o ativo canônico
      const asset = await prisma.asset.findUnique({
        where: { ticker: resolvedTicker, isActive: true },
        select: {
          id: true,
          ticker: true,
          displayName: true,
          division: true,
          currentPrice: true,
          isHalted: true,
          sentiment: true,
          colorPrimary: true,
          colorSecondary: true,
        },
      })

      if (!asset) {
        return list([], { page: 1, limit: MAX_RESULTS, total: 0, totalPages: 0, hasNext: false })
      }

      return list(
        [
          {
            id: asset.id,
            ticker: asset.ticker,
            displayName: asset.displayName,
            division: asset.division,
            currentPrice: asset.currentPrice.toNumber(),
            isHalted: asset.isHalted,
            sentiment: asset.sentiment,
            colors: { primary: asset.colorPrimary, secondary: asset.colorSecondary },
          },
        ],
        { page: 1, limit: MAX_RESULTS, total: 1, totalPages: 1, hasNext: false }
      )
    }

    // 2. Busca parcial em ticker + displayName (busca sem alias exato)
    // Nota: searchText é buscado mas NUNCA retornado (SUPER_ADMIN only)
    const assets = await prisma.asset.findMany({
      where: {
        isActive: true,
        OR: [
          { ticker: { contains: upper } },
          { displayName: { contains: q, mode: 'insensitive' } },
          // searchText: aliases internos de busca — usado para matching, nunca retornado
          { searchText: { contains: upper, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        ticker: true,
        displayName: true,
        division: true,
        currentPrice: true,
        isHalted: true,
        sentiment: true,
        colorPrimary: true,
        colorSecondary: true,
      },
      orderBy: [{ division: 'asc' }, { ticker: 'asc' }],
      take: MAX_RESULTS,
    })

    const serialized = assets.map((a) => ({
      id: a.id,
      ticker: a.ticker,
      displayName: a.displayName,
      division: a.division,
      currentPrice: a.currentPrice.toNumber(),
      isHalted: a.isHalted,
      sentiment: a.sentiment,
      colors: { primary: a.colorPrimary, secondary: a.colorSecondary },
    }))

    return list(serialized, {
      page: 1,
      limit: MAX_RESULTS,
      total: serialized.length,
      totalPages: 1,
      hasNext: false,
    })
  } catch (err) {
    console.error('[API] GET /assets/search error', err)
    return errors.server()
  }
}
