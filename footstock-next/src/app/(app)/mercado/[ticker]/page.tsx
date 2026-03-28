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
      title: `${asset.ticker} — ${asset.displayName} | Foot Stock`,
      description: `Cotações, gráficos e análise de ${asset.displayName}. Preço atual: FS$${asset.currentPrice.toNumber().toFixed(2)}`,
      openGraph: {
        title: `${asset.displayName} | Foot Stock`,
        description: `Acompanhe ${asset.ticker} no simulador de trading de futebol.`,
      },
    }
  } catch {
    return { title: 'Foot Stock' }
  }
}

export default async function AssetDetailServerPage({ params }: Props) {
  const { ticker: rawTicker } = await params
  const tickerResult = tickerSchema.safeParse(rawTicker)

  if (!tickerResult.success) {
    notFound()
  }
  const ticker = tickerResult.data

  let asset: Awaited<ReturnType<typeof prisma.asset.findUnique>> | null = null

  try {
    asset = await prisma.asset.findUnique({ where: { ticker } })
  } catch (err) {
    console.error('[SSR] Failed to load asset', { ticker, err })
    throw err // Next.js error boundary → renders error.tsx
  }

  if (!asset) notFound()

  const currentPrice = asset.currentPrice.toNumber()
  const currentSupply = Number(asset.currentSupply)
  const fairValue = asset.fairValue.toNumber()
  const fairValuePremium =
    fairValue > 0
      ? Number(((currentPrice - fairValue) / fairValue * 100).toFixed(2))
      : null

  const financials = (asset.financials ?? {}) as Record<string, unknown>

  const serializedAsset = {
    id: asset.id,
    ticker: asset.ticker,
    displayName: asset.displayName,
    division: asset.division as 'A' | 'B',
    currentPrice,
    fairValue,
    currentSupply,
    totalShares: Number(asset.totalShares),
    isHalted: asset.isHalted,
    haltReason: asset.haltReason ?? null,
    colors: asset.colors as { primary: string; secondary: string },
    financials: {
      ...financials,
      marketCap: currentPrice * currentSupply,
      ipoPrice: (financials.ipoPrice as number | null) ?? null,
      equityValue: (financials.equityValue as number | null) ?? null,
      freeFloat: (financials.freeFloat as number | null) ?? null,
      totalShares: Number(asset.totalShares),
    },
    fairValuePremium,
    sentiment: asset.sentiment as 'BULLISH' | 'NEUTRO' | 'BEARISH',
    updatedAt: asset.updatedAt.toISOString(),
    logoUrl: null as string | null,
  }

  // Fetch all assets for CompareMode (lightweight list)
  const allAssets = await prisma.asset.findMany({
    select: { ticker: true, displayName: true, colors: true },
    where: { ticker: { not: ticker } },
    orderBy: { ticker: 'asc' },
  })

  const allAssetsForCompare = allAssets.map((a) => ({
    ticker: a.ticker,
    displayName: a.displayName,
    colors: a.colors as { primary: string; secondary: string },
  }))

  // Pre-populate React Query cache for instant client hydration
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
