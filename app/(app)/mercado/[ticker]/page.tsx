// ============================================================================
// Foot Stock — /mercado/[ticker] (detalhe do ativo)
// Server Component: busca dados via Prisma e repassa para cliente.
// ============================================================================

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { AppLayout } from '@/components/layout'
import { SponsorBanner } from '@/components/banners/SponsorBanner'
import { AssetDetailPage, type SerializedAsset } from '@/components/market/AssetDetailPage'
import { prisma } from '@/lib/prisma'
import { getClubDisplayName } from '@/lib/constants/clubs'

// ---------------------------------------------------------------------------
// ISR: pré-gera as 40 páginas de ticker no build; revalida a cada hora
// ---------------------------------------------------------------------------

export const revalidate = 3600
export const dynamicParams = false

export async function generateStaticParams() {
  const assets = await prisma.asset.findMany({
    where: { isActive: true },
    select: { ticker: true },
  })
  return assets.map((a) => ({ ticker: a.ticker.toLowerCase() }))
}

// ---------------------------------------------------------------------------
// Cache Prisma cross-request com tag para revalidação on-demand
// ---------------------------------------------------------------------------

const getCachedAsset = unstable_cache(
  async (ticker: string) => {
    return prisma.asset.findFirst({
      where: { ticker, isActive: true },
      select: {
        id: true,
        ticker: true,
        name: true,
        division: true,
        cluster: true,
        currentPrice: true,
        openPrice: true,
        closePrice: true,
        volume: true,
        marketCap: true,
        colorPrimary: true,
        colorSecondary: true,
        logoUrl: true,
      },
    })
  },
  ['asset'],
  { tags: ['asset'], revalidate: 3600 }
)

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  params: Promise<{ ticker: string }>
}

// ---------------------------------------------------------------------------
// Metadata dinâmica
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params
  const upper = ticker.toUpperCase()
  const displayName = getClubDisplayName(upper)

  return {
    title: `${upper} — ${displayName} | Foot Stock`,
    description: `Acompanhe ${displayName} (${upper}) em tempo real: gráfico, order book, estatísticas e sentimento de mercado.`,
    openGraph: {
      title: `${upper} — Detalhe do Ativo | Foot Stock`,
      description: `Preços, gráficos e order book de ${displayName} no Foot Stock.`,
    },
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function MercadoDetalhe({ params }: Props) {
  const { ticker } = await params
  const upper = ticker.toUpperCase()

  // Busca asset no banco via unstable_cache (cross-request cache + tag para revalidação)
  const asset = await getCachedAsset(upper)

  if (!asset) {
    notFound()
  }

  // Serializar Decimal → number (Next.js não serializa Prisma Decimal automaticamente)
  const serialized: SerializedAsset = {
    id: asset.id,
    ticker: asset.ticker,
    name: asset.name,
    division: asset.division as SerializedAsset['division'],
    cluster: asset.cluster,
    currentPrice: Number(asset.currentPrice),
    openPrice: Number(asset.openPrice),
    closePrice: Number(asset.closePrice),
    volume: Number(asset.volume),
    marketCap: Number(asset.marketCap),
    colorPrimary: asset.colorPrimary,
    colorSecondary: asset.colorSecondary,
    logoUrl: asset.logoUrl ?? null,
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-24 lg:pb-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Conteúdo principal */}
          <div className="flex-1 min-w-0">
            <AssetDetailPage ticker={upper} assetData={serialized} />
          </div>

          {/* Sidebar */}
          <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-4">
            <SponsorBanner position="detail_bot" />
          </aside>
        </div>
      </div>
    </AppLayout>
  )
}
