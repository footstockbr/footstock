import type { Metadata } from 'next'
import { Users } from 'lucide-react'
import { getAuthUser } from '@/lib/auth'
import { UserList } from '@/components/admin/UserList'

export const metadata: Metadata = {
  title: 'Gestão de Usuários | Admin | Foot Stock',
  description: 'Gestão, moderação e controle de contas de usuários',
}

export default async function AdminUsuariosPage() {
  const auth = await getAuthUser()
  const currentAdminRole = auth?.user.adminRole ?? null

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
          <Users className="h-5 w-5 text-[#F0B90B]" />
          Gestão de Usuários
        </h1>
        <p className="text-sm text-[#929AA5] mt-0.5">Moderação e controle de contas — suspensão, promoção e reset de saldo</p>
      </div>

      <UserList currentAdminRole={currentAdminRole} />
    </div>
  )
}
