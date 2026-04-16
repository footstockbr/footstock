import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { TrophyList } from '@/components/leagues/TrophyList'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = {
  title: 'Meus Troféus — FootStock',
  description: 'Troféus conquistados em Ligas PRO.',
}

export default async function TrofeusPage() {
  const auth = await getAuthUser()
  if (!auth) redirect(ROUTES.LOGIN)

  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-[#EAECEF]">Meus Troféus</h1>
      </div>

      <p className="text-xs text-gray-600">
        Troféus são meramente cosméticos e não representam valor monetário.
      </p>

      <TrophyList />

      <div className="h-4" />
    </div>
  )
}
