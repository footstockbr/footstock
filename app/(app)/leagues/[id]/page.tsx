import { redirect } from 'next/navigation'

export default async function LeaguesDetailAliasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/ligas/${id}`)
}
