import { requireAdminResource } from '@/lib/auth/requireAdminResource'
import { ModerationPageClient } from '@/components/admin/ModerationPageClient'

export const metadata = {
  title: 'Moderação — Foot Stock Admin',
}

export default async function AdminModeracaoPage() {
  await requireAdminResource('forum:moderate')

  return <ModerationPageClient />
}
