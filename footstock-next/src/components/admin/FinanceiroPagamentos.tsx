'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import type { GatewayConfig } from '@/lib/types/admin'
import { getGatewayMeta } from '@/lib/constants/admin-ui'
import { formatBRLValue } from '@/lib/utils/format'

interface FinancialData {
  mrr: number
}

interface GatewayData {
  gateways: GatewayConfig[]
}

interface GatewayMetric {
  gateway: string
  revenue: number
  percentage: number
  count: number
}

interface PaymentMetricsResponse {
  totalRevenue: number
  gateways: GatewayMetric[]
}

const formatBRL = formatBRLValue

async function fetchPaymentMetrics() {
  const res = await fetch('/api/v1/admin/payments/metrics', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data as PaymentMetricsResponse
}

async function updateGateway(code: string, action: 'enable' | 'disable' | 'toggle') {
  const res = await fetch(`/api/v1/admin/gateways/${code}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!res.ok) throw new Error('Failed')
  return res.json()
}

export function FinanceiroPagamentos({
  financial,
  gateways,
}: {
  financial: FinancialData
  gateways: GatewayData
}) {
  const { data: metrics } = useQuery({
    queryKey: ['payment-metrics'],
    queryFn: fetchPaymentMetrics,
    staleTime: 60_000,
  })

  const gatewayList = gateways.gateways || []
  const [activeUpdate, setActiveUpdate] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: ({ code, action }: { code: string; action: 'enable' | 'disable' | 'toggle' }) =>
      updateGateway(code, action),
    onSuccess: () => {
      setActiveUpdate(null)
      // Refetch metrics após atualizar
      setTimeout(() => {
        window.location.reload()
      }, 500)
    },
  })

  return (
    <div className="space-y-3">
      {gatewayList.map((gateway) => {
        // Usa dados reais de metrics se disponível
        const metric = metrics?.gateways.find(g => g.gateway === gateway.code)
        const pct = metric?.percentage ?? 0
        const revenue = metric?.revenue ?? 0
        const emoji = getGatewayMeta(gateway.code).emoji

        return (
          <div
            key={gateway.code}
            className="bg-[#1E2329] rounded-xl border p-4 transition-all"
            style={{
              borderColor: gateway.active ? `${gateway.color}88` : 'rgba(240,185,11,.1)',
              backgroundColor: gateway.active ? '#1E2329' : '#1A1D23',
            }}
          >
            {/* Header with icon and status */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                style={{
                  backgroundColor: `${gateway.color}22`,
                  borderColor: `${gateway.color}44`,
                  borderWidth: '1px',
                }}
              >
                {emoji}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-bold text-[#EAECEF]">{gateway.name}</span>
                  <span
                    className="px-2 py-0.5 rounded text-[9px] font-bold"
                    style={{
                      backgroundColor: gateway.active ? 'rgba(46,189,133,.15)' : 'rgba(146,154,165,.15)',
                      color: gateway.active ? '#2EBD85' : '#929AA5',
                    }}
                  >
                    {gateway.active ? '● ATIVO' : 'INATIVO'}
                  </span>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-[#0B0E11]/50 rounded border border-[rgba(240,185,11,.08)] p-2 text-center">
                <div className="text-[9px] text-[#929AA5] mb-1">PARTICIPAÇÃO</div>
                <div className="text-xs font-bold" style={{ color: gateway.color, fontFamily: 'monospace' }}>
                  {pct}%
                </div>
              </div>
              <div className="bg-[#0B0E11]/50 rounded border border-[rgba(240,185,11,.08)] p-2 text-center">
                <div className="text-[9px] text-[#929AA5] mb-1">RECEITA/MÊS</div>
                <div className="text-xs font-bold text-[#EAECEF] font-mono">R${formatBRL(revenue / 100)}</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-[#0B0E11]/50 rounded-full h-2 mb-3 overflow-hidden border border-[rgba(240,185,11,.08)]">
              <div
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: gateway.color,
                }}
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                className="text-[10px]"
                disabled={updateMutation.isPending}
              >
                ⚙ Configurar
              </Button>
              <Button
                variant={gateway.active ? 'destructive' : 'primary'}
                size="sm"
                fullWidth
                className="text-[10px]"
                disabled={updateMutation.isPending || activeUpdate === gateway.code}
                onClick={() => {
                  setActiveUpdate(gateway.code)
                  updateMutation.mutate({
                    code: gateway.code,
                    action: gateway.active ? 'disable' : 'enable',
                  })
                }}
              >
                {activeUpdate === gateway.code ? '⏳ Atualizando...' : gateway.active ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
