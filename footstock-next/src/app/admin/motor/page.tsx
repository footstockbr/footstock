// Server Component — lê adminRole do auth e passa para o client
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { ROUTES } from '@/lib/constants/routes'
import type { AdminRole } from '@/types'
import MotorPageClient from './MotorPageClient'

export default async function AdminMotorPage() {
  const auth = await getAuthUser()

  let adminRole: AdminRole | null = null

  if (auth?.user.adminRole) {
    adminRole = auth.user.adminRole as AdminRole
  } else if (process.env.NODE_ENV === 'development') {
    const cookieStore = await cookies()
    const devRole = cookieStore.get('fs-admin-role')?.value
    if (devRole) adminRole = devRole as AdminRole
  }

  if (!adminRole) redirect(ROUTES.LOGIN)

  return (
    <div data-testid="page-admin-motor">
      <MotorPageClient adminRole={adminRole} />
    </div>
  )
}
