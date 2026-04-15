'use client'

import { useState } from 'react'
import { Settings, Shield } from 'lucide-react'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { cn } from '@/lib/utils'
import { ConfigGateways } from './ConfigGateways'
import { ConfigAdmins } from './ConfigAdmins'

type ConfigTab = 'gateways' | 'admins'

const TABS: { id: ConfigTab; label: string; icon: React.ElementType }[] = [
  { id: 'gateways', label: 'Gateways', icon: Settings },
  { id: 'admins', label: 'Administradores', icon: Shield },
]

interface ConfiguracoesClientProps {
  adminId: string
}

export function ConfiguracoesClient({ adminId }: ConfiguracoesClientProps) {
  const [activeTab, setActiveTab] = useState<ConfigTab>('gateways')

  return (
    <div className="space-y-5">
      <AdminBreadcrumb />

      <div data-testid="admin-configuracoes-header">
        <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
          <Settings className="h-5 w-5 text-[#F0B90B]" />
          Configurações
        </h1>
        <p className="text-xs text-[#929AA5] mt-0.5">
          Acesso restrito — apenas <strong className="text-[#F0B90B]">SUPER_ADMIN</strong>
        </p>
      </div>

      {/* Tabs */}
      <div data-testid="admin-configuracoes-tabs" className="flex gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              data-testid={`admin-configuracoes-tab-${tab.id}-button`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-[#F0B90B] text-[#080b12]'
                  : 'bg-[#1E2329] text-[#929AA5] border border-[rgba(240,185,11,.1)] hover:border-[rgba(240,185,11,.3)]'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === 'gateways' && (
        <ConfigGateways adminId={adminId} />
      )}
      {activeTab === 'admins' && (
        <ConfigAdmins adminId={adminId} />
      )}
    </div>
  )
}
