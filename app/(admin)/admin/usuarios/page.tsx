'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { canAccess } from '@/lib/auth/canAccess'
import type { AdminRole as CanonicalAdminRole } from '@/lib/enums'
import { JogadoresTab } from '@/components/admin/usuarios/JogadoresTab'
import { AdminsTab } from '@/components/admin/usuarios/AdminsTab'
import type { AdminRole, Tab } from '@/components/admin/usuarios/types'

export default function AdminUsuariosPage() {
  const router = useRouter()
  const [isAuthorizing, setIsAuthorizing] = useState(true)
  const [sessionRole, setSessionRole] = useState<AdminRole | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('jogadores')

  const isSuperAdmin = sessionRole === 'SUPER_ADMIN'

  useEffect(() => {
    async function boot() {
      try {
        const res = await apiClient.get('/api/v1/admin/session/verify')
        const json = res.data as { adminRole?: CanonicalAdminRole }
        if (!json.adminRole || !canAccess(json.adminRole, 'users:read')) {
          router.replace('/admin')
          return
        }
        setSessionRole(json.adminRole as AdminRole)
      } catch {
        router.replace('/admin/login')
      } finally {
        setIsAuthorizing(false)
      }
    }
    void boot()
  }, [router])

  if (isAuthorizing) {
    return (
      <section className="space-y-4">
        <div className="skeleton h-24 w-full rounded-xl" aria-hidden="true" />
        <div className="skeleton h-72 w-full rounded-xl" aria-hidden="true" />
      </section>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'jogadores', label: 'Jogadores' },
    { id: 'administradores', label: 'Administradores' },
  ]

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h1 className="text-lg font-semibold text-zinc-100">Gerenciamento de Usuários</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Gerencie jogadores e contas administrativas da plataforma.
        </p>
      </header>

      <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[#F0B90B] text-zinc-950'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'jogadores' ? (
        <JogadoresTab sessionRole={sessionRole} />
      ) : (
        <AdminsTab sessionRole={sessionRole} isSuperAdmin={isSuperAdmin} />
      )}
    </section>
  )
}
