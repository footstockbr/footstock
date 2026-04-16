import type { Metadata } from 'next'
import { LeagueDetail } from '@/components/leagues/LeagueDetail'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Liga — FootStock`,
    description: `Veja o ranking e detalhes da liga ${id}`,
  }
}

export default async function LeagueDetailPage({ params }: Props) {
  const { id } = await params
  return (
    <div data-testid="page-liga-detail">
      <LeagueDetail leagueId={id} />
    </div>
  )
}
