import { requireAdminResource } from '@/lib/auth/requireAdminResource'
import { SponsorsPageClient } from '@/components/admin/SponsorsPageClient'

export const metadata = {
  title: 'Patrocinadores e Banners — Foot Stock Admin',
}

export default async function AdminPatrocinadoresPage() {
  await requireAdminResource('assets:write')
  return <SponsorsPageClient />
}
