import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { prisma } from '@/lib/prisma'
import { tickerSchema } from '@/lib/validators/tickerSchema'
import { AssetDetailPage } from '@/components/market/AssetDetailPage'

type Props = { params: Promise<{ ticker: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker: rawTicker } = await params
  const tickerResult = tickerSchema.safeParse(rawTicker)
  if (!tickerResult.success) {
    return { title: 'Ativo não encontrado | Foot Stock' }
  }
  const ticker = tickerResult.data

  try {
    const asset = await prisma.asset.findUnique({ where: { ticker } })
    if (!asset) return { title: 'Ativo não encontrado | Foot Stock' }
    return {
      title: `${asset.ticker} — ${asset.name} | Foot Stock`,
      description: `Cotações, gráficos e análise de ${asset.name}. Preço atual: FS$${asset.currentPrice.toNumber().toFixed(2)}`,
      openGraph: {
        title: `${asset.name} | Foot Stock`,
        description: `Acompanhe ${asset.ticker} no simulador de trading de futebol.`,
      },
    }
  } catch {
    return { title: 'Foot Stock' }
  }
}

// Peso por categoria de impacto — notícias críticas pesam mais no score
const IMPACT_WEIGHT: Record<string, number> = {
  FINANCEIRA_CRITICA: 1.5,
  ESPORTIVA_MAJORITARIA: 1.2,
  MERCADO_ATIVOS: 1.1,
  INTEGRIDADE_SAUDE: 1.3,
  INSTITUCIONAL: 0.9,
  ESPORTIVA_MENOR: 0.7,
}

// Mapeamento enum → score numérico para o gauge
const SENTIMENT_SCORE: Record<string, number> = {
  BULLISH: 0.7,
  NEUTRAL: 0,
  BEARISH: -0.7,
}

export default async function AssetDetailServerPage({ params }: Props) {
  const { ticker: rawTicker } = await params
  const tickerResult = tickerSchema.safeParse(rawTicker)

  if (!tickerResult.success) notFound()
  const ticker = tickerResult.data

  let asset: Awaited<ReturnType<typeof prisma.asset.findUnique>> | null = null

  try {
    asset = await prisma.asset.findUnique({ where: { ticker } })
  } catch (err) {
    console.error('[SSR] Failed to load asset', { ticker, err })
    throw err
  }

  if (!asset) notFound()

  const currentPrice = asset.currentPrice.toNumber()
  const openPrice = asset.openPrice.toNumber()
  const fairValue = asset.fairValue.toNumber()
  const change24h = openPrice > 0
    ? parseFloat(((currentPrice - openPrice) / openPrice * 100).toFixed(2))
    : 0

  const fairValuePremium =
    fairValue > 0
      ? parseFloat(((currentPrice - fairValue) / fairValue * 100).toFixed(2))
      : null

  const financials = (asset.financials ?? {}) as Record<string, unknown>
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Consultas paralelas: volume, notícias recentes e lista de ativos para CompareMode
  const [volume24hAgg, recentNewsRows, allAssets] = await Promise.all([
    prisma.transaction.aggregate({
      where: { assetId: asset.id, createdAt: { gte: since24h } },
      _sum: { totalAmount: true },
    }),
    prisma.news.findMany({
      where: {
        assetIds: { has: asset.id },
        isPublished: true,
        publishedAt: { gte: since24h },
      },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: { title: true, sentiment: true, impact: true, publishedAt: true },
    }),
    prisma.asset.findMany({
      select: { ticker: true, name: true, colorPrimary: true, colorSecondary: true },
      where: { ticker: { not: ticker }, isActive: true },
      orderBy: { ticker: 'asc' },
    }),
  ])

  const volume24h = Number(volume24hAgg._sum.totalAmount ?? 0)

  // Score ponderado por impacto: BULLISH=+0.7, BEARISH=-0.7, NEUTRAL=0
  const sentimentScore =
    recentNewsRows.length > 0
      ? (() => {
          let weightedSum = 0
          let totalWeight = 0
          for (const n of recentNewsRows) {
            const w = IMPACT_WEIGHT[n.impact] ?? 1.0
            weightedSum += (SENTIMENT_SCORE[n.sentiment] ?? 0) * w
            totalWeight += w
          }
          return parseFloat((weightedSum / totalWeight).toFixed(3))
        })()
      : // Fallback: score fixo baseado no enum do ativo quando não há notícias
        (asset.sentiment === 'BULLISH' ? 0.3 : asset.sentiment === 'BEARISH' ? -0.3 : 0)

  const recentNews = recentNewsRows.map((n) => ({
    title: n.title,
    sentiment: n.sentiment as 'BULLISH' | 'NEUTRAL' | 'BEARISH',
    publishedAt: n.publishedAt?.toISOString() ?? new Date().toISOString(),
  }))

  const serializedAsset = {
    id: asset.id,
    ticker: asset.ticker,
    displayName: asset.name,
    division: asset.division as 'SERIE_A' | 'SERIE_B',
    currentPrice,
    openPrice,
    change24h,
    fairValue,
    currentSupply: Number(asset.currentSupply),
    totalShares: Number(asset.totalShares),
    isHalted: asset.isHalted,
    haltReason: asset.haltReason ?? null,
    colors: { primary: asset.colorPrimary, secondary: asset.colorSecondary },
    colorPrimary: asset.colorPrimary,
    financials: {
      ...financials,
      marketCap: currentPrice * Number(asset.currentSupply),
      ipoPrice: (financials.ipoPrice as number | null) ?? null,
      equityValue: (financials.equityValue as number | null) ?? null,
      freeFloat: (financials.freeFloat as number | null) ?? null,
      totalShares: Number(asset.totalShares),
    },
    fairValuePremium,
    sentiment: asset.sentiment as 'BULLISH' | 'NEUTRAL' | 'BEARISH',
    sentimentScore,
    recentNews,
    volume24h,
    updatedAt: asset.updatedAt.toISOString(),
    logoUrl: null as string | null,
  }

  const allAssetsForCompare = allAssets.map((a) => ({
    ticker: a.ticker,
    displayName: a.name,
    colors: { primary: a.colorPrimary, secondary: a.colorSecondary },
  }))

  const queryClient = new QueryClient()
  queryClient.setQueryData(['asset', ticker], serializedAsset)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AssetDetailPage
        asset={serializedAsset}
        allAssets={allAssetsForCompare}
      />
    </HydrationBoundary>
  )
}
