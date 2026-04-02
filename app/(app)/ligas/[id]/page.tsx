import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { LeagueDetail } from '@/components/leagues/LeagueDetail'
import { AppLayout } from '@/components/layout'

interface Props {
  params: Promise<{ id: string }>
}

const getCachedLeagueMeta = unstable_cache(
  async (id: string) => {
    return prisma.league.findUnique({
      where: { id },
      select: { name: true, type: true },
    })
  },
  ['league-meta'],
  { tags: ['league'], revalidate: 3600 }
)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const league = await getCachedLeagueMeta(id)
  if (!league) notFound()
  return {
    title: `${league.name} — Foot Stock`,
    description: `Ranking e detalhes da liga ${league.name}`,
  }
}

export default async function LeagueDetailPage({ params }: Props) {
  const { id } = await params
  return (
    <AppLayout>
      <LeagueDetail leagueId={id} />
    </AppLayout>
  )
}
