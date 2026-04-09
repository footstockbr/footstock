'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FinanceiroResume } from '@/components/admin/FinanceiroResume'
import { FinanceiroAssinaturas } from '@/components/admin/FinanceiroAssinaturas'
import { FinanceiroPagamentos } from '@/components/admin/FinanceiroPagamentos'

type FinTab = 'resumo' | 'assinaturas' | 'pagamentos'

const TABS: { id: FinTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'assinaturas', label: 'Assinaturas' },
  { id: 'pagamentos', label: 'Pagamentos' },
]

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

export default function AdminFinanceiroPage() {
  const [activeTab, setActiveTab] = useState<FinTab>('resumo')

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

  const isLoading = financialLoading || subsLoading || gatewaysLoading

  return (
    <div className="p-4 md:p-6 space-y-5">
      <AdminBreadcrumb />

      <div>
        <h1 className="text-xl font-bold text-[#EAECEF]">Financeiro</h1>
        <p className="text-xs text-[#929AA5] mt-0.5">Receita, assinaturas e gateways de pagamento</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-1.5 rounded text-xs font-medium transition-all',
              activeTab === tab.id
                ? 'bg-[#F0B90B] text-[#080b12]'
                : 'bg-[#1E2329] text-[#929AA5] border border-[rgba(240,185,11,.1)] hover:border-[rgba(240,185,11,.3)]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error State */}
      {financialError && (
        <div className="flex items-center gap-3 p-4 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-sm text-[#F6465D]">
          <span>⚠ Erro ao carregar dados financeiros</span>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="space-y-3">
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
