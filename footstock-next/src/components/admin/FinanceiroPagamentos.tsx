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

  // Config modal state
  const [configGateway, setConfigGateway] = useState<GatewayConfig | null>(null)
  const [configForm, setConfigForm] = useState<Partial<GatewayConfig>>({})
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

  const openConfig = (gw: GatewayConfig) => {
    setConfigGateway(gw)
    setConfigForm({ ...gw })
    setConfigError(null)
  }

  const saveConfig = async () => {
    if (!configGateway) return
    setConfigSaving(true)
    setConfigError(null)
    try {
      const updatedGateways = gatewayList.map((g) =>
        g.code === configGateway.code ? { ...g, ...configForm } : g
      )
      const res = await fetch('/api/v1/admin/gateways/config', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateways: updatedGateways }),
      })
      if (!res.ok) {
        const json = await res.json()
        setConfigError(json?.error?.message ?? 'Erro ao salvar')
        return
      }
      setConfigGateway(null)
      window.location.reload()
    } catch {
      setConfigError('Erro de rede. Tente novamente.')
    } finally {
      setConfigSaving(false)
    }
  }

  const SETTLEMENTS = ['D+0', 'D+1', 'D+2', 'D+15', 'D+30'] as const

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
                onClick={() => openConfig(gateway)}
                data-testid={`admin-financeiro-gateway-config-${gateway.code}-button`}
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

      {/* Gateway Config Modal */}
      {configGateway && (
        <div
          data-testid="admin-financeiro-gateway-config-modal"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setConfigGateway(null)}
        >
          <div
            style={{
              background: '#1E2329',
              border: '1px solid rgba(240,185,11,.15)',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#EAECEF', fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
              {configGateway.name}
            </h2>
            <p style={{ color: '#929AA5', fontSize: '11px', marginBottom: '20px' }}>
              Configuração de taxas e webhook
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Split */}
              <div>
                <label style={{ fontSize: '10px', color: '#929AA5', display: 'block', marginBottom: '3px' }}>
                  SPLIT % (participação no volume total)
                </label>
                <input
                  type="number" min={0} max={100} step={0.01}
                  value={configForm.splitPercent ?? 0}
                  onChange={(e) => setConfigForm({ ...configForm, splitPercent: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', background: '#181A20', border: '1px solid rgba(240,185,11,.12)', borderRadius: '6px', color: '#EAECEF', padding: '7px 10px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Fees grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {([
                  { label: 'TAXA CRÉDITO %', feeKey: 'creditFeePercent', setKey: 'creditSettlement', sLabel: 'LIQUIDAÇÃO' },
                  { label: 'TAXA DÉBITO %',  feeKey: 'debitFeePercent',  setKey: 'debitSettlement',  sLabel: 'LIQUIDAÇÃO' },
                  { label: 'TAXA PIX %',     feeKey: 'pixFeePercent',    setKey: 'pixSettlement',    sLabel: 'LIQUIDAÇÃO' },
                ] as const).map(({ label, feeKey, setKey, sLabel }) => (
                  <div key={feeKey}>
                    <label style={{ fontSize: '10px', color: '#929AA5', display: 'block', marginBottom: '3px' }}>{label}</label>
                    <input
                      type="number" min={0} max={100} step={0.01}
                      value={(configForm[feeKey] as number) ?? 0}
                      onChange={(e) => setConfigForm({ ...configForm, [feeKey]: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', background: '#181A20', border: '1px solid rgba(240,185,11,.12)', borderRadius: '6px', color: '#EAECEF', padding: '7px 8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <label style={{ fontSize: '10px', color: '#929AA5', display: 'block', marginTop: '5px', marginBottom: '3px' }}>{sLabel}</label>
                    <select
                      value={(configForm[setKey] as string) ?? 'D+1'}
                      onChange={(e) => setConfigForm({ ...configForm, [setKey]: e.target.value })}
                      style={{ width: '100%', background: '#181A20', border: '1px solid rgba(240,185,11,.12)', borderRadius: '6px', color: '#EAECEF', padding: '7px 8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                    >
                      {SETTLEMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Webhook endpoint */}
              <div>
                <label style={{ fontSize: '10px', color: '#929AA5', display: 'block', marginBottom: '3px' }}>WEBHOOK ENDPOINT</label>
                <input
                  type="url"
                  value={configForm.webhookEndpoint ?? ''}
                  onChange={(e) => setConfigForm({ ...configForm, webhookEndpoint: e.target.value })}
                  placeholder="https://..."
                  style={{ width: '100%', background: '#181A20', border: '1px solid rgba(240,185,11,.12)', borderRadius: '6px', color: '#EAECEF', padding: '7px 10px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {configError && (
                <p style={{ fontSize: '12px', color: '#F6465D', margin: 0 }}>{configError}</p>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  data-testid="admin-financeiro-gateway-config-cancel-button"
                  onClick={() => setConfigGateway(null)}
                  style={{ flex: 1, padding: '9px', borderRadius: '6px', fontSize: '12px', background: 'transparent', border: '1px solid rgba(240,185,11,.2)', color: '#929AA5', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  data-testid="admin-financeiro-gateway-config-save-button"
                  onClick={saveConfig}
                  disabled={configSaving}
                  style={{ flex: 1, padding: '9px', borderRadius: '6px', fontSize: '12px', background: configSaving ? 'rgba(240,185,11,.4)' : '#F0B90B', border: 'none', color: '#080B12', fontWeight: 700, cursor: configSaving ? 'not-allowed' : 'pointer' }}
                >
                  {configSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
