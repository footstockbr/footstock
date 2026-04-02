import { redirect } from 'next/navigation'

export default async function AITickerAliasPage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const { ticker } = await params
  redirect(`/assessor?ticker=${encodeURIComponent(ticker)}`)
}
