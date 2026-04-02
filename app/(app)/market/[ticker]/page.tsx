import { redirect } from 'next/navigation'

export default async function MarketTickerAliasPage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const { ticker } = await params
  redirect(`/mercado/${ticker}`)
}
