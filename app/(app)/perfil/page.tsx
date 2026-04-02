import type { Metadata } from 'next'
import { AppLayout } from '@/components/layout'
import { ProfilePageClient } from '@/components/profile/ProfilePageClient'

export const metadata: Metadata = {
  title: 'Perfil | Foot Stock',
  description: 'Dados da sua conta e atalhos de configuração.',
}

export default function PerfilPage() {
  return (
    <AppLayout>
      <main className="px-4 pt-4 pb-24">
        <ProfilePageClient />
      </main>
    </AppLayout>
  )
}
