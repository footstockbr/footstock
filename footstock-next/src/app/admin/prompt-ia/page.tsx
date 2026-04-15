// Server Component — Prompt Assessor IA, exclusiva SUPER_ADMIN
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { ROUTES } from '@/lib/constants/routes'
import type { Metadata } from 'next'
import { PromptIAClient } from './PromptIAClient'

export const metadata: Metadata = {
  title: 'Prompt Assessor IA | Admin | Foot Stock',
  description: 'Configuração do prompt do assessor de IA — exclusivo SUPER_ADMIN',
  robots: 'noindex, nofollow',
}

export default async function AdminPromptIAPage() {
  const auth = await getAuthUser()

  let adminRole: string | null = null

  if (auth?.user.adminRole) {
    adminRole = auth.user.adminRole
  } else if (process.env.NODE_ENV === 'development') {
    const cookieStore = await cookies()
    const devRole = cookieStore.get('fs-admin-role')?.value
    if (devRole) adminRole = devRole
  }

  if (!adminRole) redirect(ROUTES.LOGIN)

  if (adminRole !== 'SUPER_ADMIN') {
    redirect(ROUTES.ADMIN)
  }

  return (
    <div data-testid="page-admin-prompt-ia" className="p-4 md:p-6">
      <PromptIAClient />
    </div>
  )
}
