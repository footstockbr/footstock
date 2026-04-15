'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, CheckCircle, XCircle, Save, Lock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface GatewayConfig {
  code: string
  name: string
  color: string
  active: boolean
  splitPercent: number
  creditFeePercent: number
  creditSettlement: string
  debitFeePercent: number
  debitSettlement: string
  pixFeePercent: number
  pixSettlement: string
  webhookEndpoint?: string | null
  webhookApiKey?: string | null
  webhookSecret?: string | null
}

interface GatewayData {
  gateways: GatewayConfig[]
}

const GATEWAY_LABELS: Record<string, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  PAGSEGURO: 'PagSeguro',
  PAYPAL: 'PayPal',
}

async function fetchGateways(): Promise<GatewayData> {
  const res = await fetch('/api/v1/admin/gateways/config', { credentials: 'include' })
  if (!res.ok) throw new Error('Erro ao carregar gateways')
  const { data } = await res.json()
  return data
}

async function saveGateways(payload: GatewayData): Promise<GatewayData> {
  const res = await fetch('/api/v1/admin/gateways/config', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error?.message ?? 'Erro ao salvar')
  }
  const { data } = await res.json()
  return data
}

function MaskedField({ value, label }: { value: string | null | undefined; label: string }) {
  const [visible, setVisible] = useState(false)
  const display = value ?? '—'

  return (
    <div className="bg-[#0B0E11] rounded-lg p-3 border border-[rgba(240,185,11,.08)]">
      <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="text-xs font-mono text-[#c5b99a] flex-1 truncate">
          {visible ? display : (display === '—' ? '—' : display.replace(/./g, '*').slice(0, 20))}
        </code>
        {display !== '—' && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="text-[#929AA5] hover:text-[#F0B90B] transition-colors flex-shrink-0"
            aria-label={visible ? 'Ocultar' : 'Mostrar'}
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  )
}

interface GatewayCardProps {
  gateway: GatewayConfig
  onToggle: (code: string, active: boolean) => void
  isSaving: boolean
}

function GatewayCard({ gateway, onToggle, isSaving }: GatewayCardProps) {
  return (
    <div
      data-testid={`admin-gateway-card-${gateway.code.toLowerCase()}`}
      className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold"
            style={{ backgroundColor: `${gateway.color}22`, borderColor: `${gateway.color}44`, borderWidth: '1px' }}
          >
            {(GATEWAY_LABELS[gateway.code] ?? gateway.code).charAt(0)}
          </div>
          <div>
            <p className="text-sm font-bold text-[#EAECEF]">{GATEWAY_LABELS[gateway.code] ?? gateway.code}</p>
            <p className="text-[11px] text-[#929AA5]">{gateway.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {gateway.active ? (
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400" />
            )}
            <span className={cn('text-xs font-semibold', gateway.active ? 'text-emerald-400' : 'text-red-400')}>
              {gateway.active ? 'Ativo' : 'Inativo'}
            </span>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onToggle(gateway.code, !gateway.active)}
            className={cn(
              'px-3 py-1 rounded text-xs font-medium transition-colors',
              isSaving
                ? 'opacity-50 cursor-not-allowed bg-[#2B2F36] text-[#929AA5]'
                : gateway.active
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
            )}
          >
            {gateway.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>

      {/* Split & Fees */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-[#0B0E11] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Split</p>
          <p className="text-lg font-extrabold text-[#F0B90B] font-mono">{gateway.splitPercent}%</p>
        </div>
        <div className="bg-[#0B0E11] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Taxa Crédito</p>
          <p className="text-sm font-bold text-[#EAECEF] font-mono">{gateway.creditFeePercent}%</p>
          <p className="text-[9px] text-[#929AA5] mt-0.5">{gateway.creditSettlement}</p>
        </div>
        <div className="bg-[#0B0E11] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Taxa Débito</p>
          <p className="text-sm font-bold text-[#EAECEF] font-mono">{gateway.debitFeePercent}%</p>
          <p className="text-[9px] text-[#929AA5] mt-0.5">{gateway.debitSettlement}</p>
        </div>
        <div className="bg-[#0B0E11] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Taxa PIX</p>
          <p className="text-sm font-bold text-[#EAECEF] font-mono">{gateway.pixFeePercent}%</p>
          <p className="text-[9px] text-[#929AA5] mt-0.5">{gateway.pixSettlement}</p>
        </div>
      </div>

      {/* Masked sensitive fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MaskedField label="API Key" value={gateway.webhookApiKey} />
        <MaskedField label="Webhook Secret" value={gateway.webhookSecret} />
        <MaskedField label="Webhook Endpoint" value={gateway.webhookEndpoint} />
      </div>

      {/* SUPER_ADMIN edit notice */}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-[#929AA5]">
        <Lock className="h-3 w-3" />
        <span>Para editar chaves e secrets, acesse <strong className="text-[#F0B90B]">Configurações &gt; Gateways</strong></span>
      </div>
    </div>
  )
}

export function FinanceiroGateways() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-gateways-full'],
    queryFn: fetchGateways,
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: (payload: GatewayData) => saveGateways(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin-gateways-full'], updated)
      queryClient.invalidateQueries({ queryKey: ['admin-gateways'] })
    },
  })

  function handleToggle(code: string, active: boolean) {
    if (!data?.gateways) return
    const updated = data.gateways.map((g) => g.code === code ? { ...g, active } : g)
    mutation.mutate({ gateways: updated })
  }

  if (isLoading) {
    return (
      <div data-testid="admin-financeiro-gateways-loading" className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="admin-financeiro-gateways-error" className="p-4 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-sm text-[#F6465D]">
        Erro ao carregar configuração de gateways
      </div>
    )
  }

  return (
    <div data-testid="admin-financeiro-gateways" className="space-y-4">
      {/* Notice */}
      <div className="flex items-start gap-2 p-3 bg-[rgba(240,185,11,.06)] border border-[rgba(240,185,11,.15)] rounded-lg">
        <Lock className="h-4 w-4 text-[#F0B90B] mt-0.5 flex-shrink-0" />
        <p className="text-xs text-[#929AA5]">
          Visível apenas para <strong className="text-[#F0B90B]">SUPER_ADMIN</strong>.
          Para editar API keys, secrets e webhooks, use a seção <strong className="text-[#F0B90B]">Configurações</strong>.
        </p>
      </div>

      {mutation.isError && (
        <div className="p-3 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-xs text-[#F6465D]">
          {mutation.error instanceof Error ? mutation.error.message : 'Erro ao salvar alteração'}
        </div>
      )}

      {mutation.isSuccess && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">
          <Save className="h-3.5 w-3.5" />
          Alteração salva com sucesso
        </div>
      )}

      {(data?.gateways ?? []).map((gateway) => (
        <GatewayCard
          key={gateway.code}
          gateway={gateway}
          onToggle={handleToggle}
          isSaving={mutation.isPending}
        />
      ))}
    </div>
  )
}
