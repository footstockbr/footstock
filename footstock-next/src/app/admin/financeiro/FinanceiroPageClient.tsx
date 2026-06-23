'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FinanceiroResume } from '@/components/admin/FinanceiroResume'
import { FinanceiroAssinaturas } from '@/components/admin/FinanceiroAssinaturas'
import { FinanceiroPagamentos } from '@/components/admin/FinanceiroPagamentos'
import { FinanceiroMovimentacoes } from '@/components/admin/FinanceiroMovimentacoes'
import {
  FinanceiroWebhooks,
  fetchRejected24hCount,
  WEBHOOKS_REJECTED_24H_KEY,
} from '@/components/admin/FinanceiroWebhooks'
import { AdminFinanceiroStats } from '@/components/admin/AdminFinanceiroStats'
import { FinanceiroGateways } from './FinanceiroGateways'

type FinTab = 'resumo' | 'assinaturas' | 'pagamentos' | 'movimentacoes' | 'webhooks' | 'gateways'

interface FinanceiroPageClientProps {
  isSuperAdmin: boolean
}

const BASE_TABS: { id: FinTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'assinaturas', label: 'Assinaturas' },
  { id: 'pagamentos', label: 'Pagamentos' },
  { id: 'movimentacoes', label: 'Movimentações' },
  { id: 'webhooks', label: 'Webhooks' },
]

const GATEWAY_TAB: { id: FinTab; label: string } = { id: 'gateways', label: 'Gateways' }

async function fetchFinancial() {
  const res = await fetch('/api/v1/admin/financial', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

async function fetchSubscriptions() {
  const res = await fetch('/api/v1/admin/subscriptions', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

async function fetchGateways() {
  const res = await fetch('/api/v1/admin/gateways/config', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

export default function FinanceiroPageClient({ isSuperAdmin }: FinanceiroPageClientProps) {
  const [activeTab, setActiveTab] = useState<FinTab>('resumo')

  const tabs = isSuperAdmin ? [...BASE_TABS, GATEWAY_TAB] : BASE_TABS

  const { data: financial, isLoading: financialLoading, error: financialError } = useQuery({
    queryKey: ['admin-financial'],
    queryFn: fetchFinancial,
    staleTime: 60_000,
  })

  const { data: subscriptions, isLoading: subsLoading } = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: fetchSubscriptions,
    staleTime: 60_000,
  })

  const { data: gateways, isLoading: gatewaysLoading } = useQuery({
    queryKey: ['admin-gateways'],
    queryFn: fetchGateways,
    staleTime: 60_000,
  })

  // Badge 24h da aba Webhooks: rejeitados nas ultimas 24h (count via meta.total).
  const { data: rejected24h } = useQuery({
    queryKey: WEBHOOKS_REJECTED_24H_KEY,
    queryFn: fetchRejected24hCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const isLoading = financialLoading || subsLoading || gatewaysLoading

  return (
    <div data-testid="page-admin-financeiro" className="p-4 md:p-6 space-y-5">
      <AdminBreadcrumb />

      <div data-testid="admin-financeiro-header">
        <h1 className="text-xl font-bold text-[#EAECEF]">Financeiro</h1>
        <p className="text-xs text-[#929AA5] mt-0.5">Receita, assinaturas e gateways de pagamento</p>
      </div>

      <AdminFinanceiroStats />

      {/* Tabs */}
      <div data-testid="admin-financeiro-tabs" className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-testid={`admin-financeiro-tab-${tab.id}-button`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-1.5 rounded text-xs font-medium transition-all',
              activeTab === tab.id
                ? 'bg-[#F0B90B] text-[#080b12]'
                : 'bg-[#1E2329] text-[#929AA5] border border-[rgba(240,185,11,.1)] hover:border-[rgba(240,185,11,.3)]'
            )}
          >
            {tab.label}
            {tab.id === 'webhooks' && (rejected24h ?? 0) > 0 && (
              <span
                data-testid="admin-financeiro-tab-webhooks-badge"
                className={cn(
                  'ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold align-middle',
                  activeTab === 'webhooks'
                    ? 'bg-[#080b12]/20 text-[#080b12]'
                    : 'bg-[#F6465D]/20 text-[#F6465D]'
                )}
              >
                {rejected24h}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error State */}
      {financialError && (
        <div data-testid="admin-financeiro-error" className="flex items-center gap-3 p-4 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-sm text-[#F6465D]">
          <span>Erro ao carregar dados financeiros</span>
        </div>
      )}

      {activeTab === 'movimentacoes' ? (
        <FinanceiroMovimentacoes />
      ) : activeTab === 'webhooks' ? (
        <FinanceiroWebhooks />
      ) : activeTab === 'gateways' && isSuperAdmin ? (
        <FinanceiroGateways />
      ) : isLoading ? (
        <div data-testid="admin-financeiro-loading" className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          {activeTab === 'resumo' && financial && gateways && (
            <FinanceiroResume financial={financial} gateways={gateways} />
          )}

          {activeTab === 'assinaturas' && financial && subscriptions && (
            <FinanceiroAssinaturas financial={financial} subscriptions={subscriptions} />
          )}

          {activeTab === 'pagamentos' && financial && gateways && (
            <FinanceiroPagamentos financial={financial} gateways={gateways} />
          )}
        </>
      )}
    </div>
  )
}
