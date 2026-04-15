// Server Component — lê adminRole e passa isSuperAdmin para o client
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { ROUTES } from '@/lib/constants/routes'
import type { Metadata } from 'next'
import FinanceiroPageClient from './FinanceiroPageClient'

export const metadata: Metadata = {
  title: 'Financeiro | Admin | Foot Stock',
  description: 'Receita, assinaturas e gateways de pagamento',
}

export default async function AdminFinanceiroPage() {
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

  const isSuperAdmin = adminRole === 'SUPER_ADMIN'

  return <FinanceiroPageClient isSuperAdmin={isSuperAdmin} />
}
