'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Save, Lock, Edit2, X, AlertTriangle } from 'lucide-react'
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

const SETTLEMENT_OPTIONS = ['D+0', 'D+1', 'D+2', 'D+15', 'D+30']

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

function MaskedInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '— não alterado —'}
          className="w-full bg-[#0B0E11] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-xs font-mono text-[#c5b99a] placeholder-[#929AA5] focus:outline-none focus:border-[#F0B90B] pr-8"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#929AA5] hover:text-[#F0B90B]"
          aria-label={visible ? 'Ocultar' : 'Mostrar'}
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

interface GatewayEditFormProps {
  gateway: GatewayConfig
  onSave: (updated: GatewayConfig) => void
  onCancel: () => void
  isSaving: boolean
}

function GatewayEditForm({ gateway, onSave, onCancel, isSaving }: GatewayEditFormProps) {
  const [form, setForm] = useState({
    splitPercent: gateway.splitPercent,
    creditFeePercent: gateway.creditFeePercent,
    creditSettlement: gateway.creditSettlement,
    debitFeePercent: gateway.debitFeePercent,
    debitSettlement: gateway.debitSettlement,
    pixFeePercent: gateway.pixFeePercent,
    pixSettlement: gateway.pixSettlement,
    webhookEndpoint: gateway.webhookEndpoint ?? '',
    webhookApiKey: '',
    webhookSecret: '',
    active: gateway.active,
  })

  // Re-auth gate
  const [password, setPassword] = useState('')
  const [authOk, setAuthOk] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  async function handleAuth() {
    if (!password.trim()) { setAuthError('Informe a senha'); return }
    setAuthLoading(true)
    setAuthError(null)
    try {
      const res = await fetch('/api/v1/admin/session/verify', { credentials: 'include' })
      if (res.ok) {
        setAuthOk(true)
      } else {
        setAuthError('Senha inválida — tente novamente')
      }
    } catch {
      setAuthError('Erro de conexão')
    } finally {
      setAuthLoading(false)
    }
  }

  function handleSubmit() {
    const updated: GatewayConfig = {
      ...gateway,
      ...form,
      webhookApiKey: form.webhookApiKey || gateway.webhookApiKey,
      webhookSecret: form.webhookSecret || gateway.webhookSecret,
    }
    onSave(updated)
  }

  if (!authOk) {
    return (
      <div data-testid={`admin-gateway-reauth-${gateway.code.toLowerCase()}`}
        className="p-4 bg-[#0B0E11] rounded-xl border border-[rgba(240,185,11,.15)] space-y-4">
        <div className="flex items-center gap-2 text-[#F0B90B]">
          <Lock className="h-4 w-4" />
          <p className="text-sm font-bold">Confirmação de identidade obrigatória</p>
        </div>
        <p className="text-xs text-[#929AA5]">
          Para editar a configuração de <strong className="text-[#EAECEF]">{GATEWAY_LABELS[gateway.code] ?? gateway.code}</strong>,
          confirme sua senha de acesso ao painel admin.
        </p>
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Senha do admin</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAuth() }}
            placeholder="Digite sua senha"
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
          />
        </div>
        {authError && (
          <p className="text-xs text-[#F6465D]">{authError}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={authLoading}
            onClick={() => void handleAuth()}
            className="px-4 py-2 bg-[#F0B90B] text-[#080b12] rounded-lg text-sm font-bold hover:bg-[#d4a309] transition-colors disabled:opacity-50"
          >
            {authLoading ? 'Verificando...' : 'Confirmar'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-[#2B2F36] text-[#929AA5] rounded-lg text-sm font-medium hover:text-[#EAECEF] transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-testid={`admin-gateway-edit-form-${gateway.code.toLowerCase()}`}
      className="p-4 bg-[#0B0E11] rounded-xl border border-[rgba(240,185,11,.15)] space-y-5">
      <div className="flex items-center gap-2 text-sm font-bold text-[#EAECEF]">
        <Edit2 className="h-4 w-4 text-[#F0B90B]" />
        Editando {GATEWAY_LABELS[gateway.code] ?? gateway.code}
      </div>

      {/* Status toggle */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-[#929AA5]">Status:</label>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
          className={cn(
            'px-3 py-1 rounded text-xs font-bold transition-colors',
            form.active
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          )}
        >
          {form.active ? 'Ativo' : 'Inativo'}
        </button>
      </div>

      {/* Financial config */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Split %</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={form.splitPercent}
            onChange={(e) => setForm((f) => ({ ...f, splitPercent: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-xs font-mono text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Taxa Crédito %</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={form.creditFeePercent}
            onChange={(e) => setForm((f) => ({ ...f, creditFeePercent: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-xs font-mono text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Liquidação Crédito</label>
          <select
            value={form.creditSettlement}
            onChange={(e) => setForm((f) => ({ ...f, creditSettlement: e.target.value }))}
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-xs text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
          >
            {SETTLEMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Taxa Débito %</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={form.debitFeePercent}
            onChange={(e) => setForm((f) => ({ ...f, debitFeePercent: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-xs font-mono text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Taxa PIX %</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={form.pixFeePercent}
            onChange={(e) => setForm((f) => ({ ...f, pixFeePercent: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-xs font-mono text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Liquidação PIX</label>
          <select
            value={form.pixSettlement}
            onChange={(e) => setForm((f) => ({ ...f, pixSettlement: e.target.value }))}
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-xs text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
          >
            {SETTLEMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Webhook & sensitive config */}
      <div className="border-t border-[rgba(240,185,11,.08)] pt-4 space-y-3">
        <div className="flex items-center gap-1.5 text-[11px] text-[#929AA5]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          <span>Campos sensíveis — deixe em branco para manter o valor atual</span>
        </div>
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Webhook Endpoint</label>
          <input
            type="url"
            value={form.webhookEndpoint}
            onChange={(e) => setForm((f) => ({ ...f, webhookEndpoint: e.target.value }))}
            placeholder="https://..."
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-xs font-mono text-[#c5b99a] placeholder-[#929AA5] focus:outline-none focus:border-[#F0B90B]"
          />
        </div>
        <MaskedInput
          label="API Key / Token"
          value={form.webhookApiKey}
          onChange={(v) => setForm((f) => ({ ...f, webhookApiKey: v }))}
          placeholder="Deixe em branco para manter"
        />
        <MaskedInput
          label="Webhook Secret"
          value={form.webhookSecret}
          onChange={(v) => setForm((f) => ({ ...f, webhookSecret: v }))}
          placeholder="Deixe em branco para manter"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleSubmit}
          className="flex items-center gap-2 px-4 py-2 bg-[#F0B90B] text-[#080b12] rounded-lg text-sm font-bold hover:bg-[#d4a309] transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Salvando...' : 'Salvar alterações'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 bg-[#2B2F36] text-[#929AA5] rounded-lg text-sm font-medium hover:text-[#EAECEF] transition-colors"
        >
          <X className="h-4 w-4" />
          Cancelar
        </button>
      </div>
    </div>
  )
}

interface ConfigGatewaysProps {
  adminId: string
}

export function ConfigGateways({ adminId: _adminId }: ConfigGatewaysProps) {
  const queryClient = useQueryClient()
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-gateways-config'],
    queryFn: fetchGateways,
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: (payload: GatewayData) => saveGateways(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin-gateways-config'], updated)
      queryClient.invalidateQueries({ queryKey: ['admin-gateways'] })
      queryClient.invalidateQueries({ queryKey: ['admin-gateways-full'] })
      setEditingCode(null)
      setSaveSuccess('Configuração salva com sucesso')
      setSaveError(null)
      setTimeout(() => setSaveSuccess(null), 4000)
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar')
    },
  })

  function handleSave(updated: GatewayConfig) {
    if (!data?.gateways) return
    const newGateways = data.gateways.map((g) => g.code === updated.code ? updated : g)
    mutation.mutate({ gateways: newGateways })
  }

  if (isLoading) {
    return (
      <div data-testid="admin-config-gateways-loading" className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="admin-config-gateways-error" className="p-4 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-sm text-[#F6465D]">
        Erro ao carregar configuração de gateways
      </div>
    )
  }

  return (
    <div data-testid="admin-config-gateways" className="space-y-4">
      {saveSuccess && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">
          <Save className="h-3.5 w-3.5" />
          {saveSuccess}
        </div>
      )}
      {saveError && (
        <div className="p-3 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-xs text-[#F6465D]">
          {saveError}
        </div>
      )}

      {(data?.gateways ?? []).map((gateway) => (
        <div
          key={gateway.code}
          data-testid={`admin-config-gateway-${gateway.code.toLowerCase()}`}
          className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-5 space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-bold"
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
              <span className={cn(
                'text-xs font-semibold px-2 py-0.5 rounded',
                gateway.active
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              )}>
                {gateway.active ? 'Ativo' : 'Inativo'}
              </span>
              {editingCode !== gateway.code && (
                <button
                  type="button"
                  onClick={() => { setEditingCode(gateway.code); setSaveError(null) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(240,185,11,.08)] text-[#F0B90B] border border-[rgba(240,185,11,.2)] rounded-lg text-xs font-medium hover:bg-[rgba(240,185,11,.15)] transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Editar
                </button>
              )}
            </div>
          </div>

          {/* Summary row */}
          {editingCode !== gateway.code && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-[#0B0E11] rounded-lg p-2.5">
                <p className="text-[9px] text-[#929AA5] uppercase tracking-wide">Split</p>
                <p className="text-base font-extrabold text-[#F0B90B] font-mono">{gateway.splitPercent}%</p>
              </div>
              <div className="bg-[#0B0E11] rounded-lg p-2.5">
                <p className="text-[9px] text-[#929AA5] uppercase tracking-wide">Crédito</p>
                <p className="text-sm font-bold text-[#EAECEF] font-mono">{gateway.creditFeePercent}%</p>
                <p className="text-[9px] text-[#929AA5]">{gateway.creditSettlement}</p>
              </div>
              <div className="bg-[#0B0E11] rounded-lg p-2.5">
                <p className="text-[9px] text-[#929AA5] uppercase tracking-wide">Débito</p>
                <p className="text-sm font-bold text-[#EAECEF] font-mono">{gateway.debitFeePercent}%</p>
                <p className="text-[9px] text-[#929AA5]">{gateway.debitSettlement}</p>
              </div>
              <div className="bg-[#0B0E11] rounded-lg p-2.5">
                <p className="text-[9px] text-[#929AA5] uppercase tracking-wide">PIX</p>
                <p className="text-sm font-bold text-[#EAECEF] font-mono">{gateway.pixFeePercent}%</p>
                <p className="text-[9px] text-[#929AA5]">{gateway.pixSettlement}</p>
              </div>
            </div>
          )}

          {/* Edit form (inline, replacing summary) */}
          {editingCode === gateway.code && (
            <GatewayEditForm
              gateway={gateway}
              onSave={handleSave}
              onCancel={() => setEditingCode(null)}
              isSaving={mutation.isPending}
            />
          )}
        </div>
      ))}
    </div>
  )
}
