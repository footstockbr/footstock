'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { canAccess } from '@/lib/auth/canAccess'
import { FinancialDashboard } from '@/components/admin/FinancialDashboard'
import type { AdminRole as CanonicalAdminRole } from '@/lib/enums'
import { ADMIN_ROLE } from '@/lib/enums'
import { ROUTES } from '@/lib/constants'

type AdminRole = 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'MONITOR' | 'EDITOR' | 'MODERADOR'
type Settlement = 'D+30' | 'D+15' | 'D+2' | 'D+1' | 'D+0'

interface GatewayConfig {
  code: 'MERCADO_PAGO' | 'PAGSEGURO' | 'PAYPAL'
  name: string
  icon: string
  color: string
  active: boolean
  splitPercent: number
  creditFeePercent: number
  creditSettlement: Settlement
  debitFeePercent: number
  debitSettlement: Settlement
  pixFeePercent: number
  pixSettlement: Settlement
  webhookEndpoint?: string
  webhookApiKey?: string | null
  webhookSecret?: string | null
}

const SETTLEMENT_OPTIONS: Settlement[] = ['D+30', 'D+15', 'D+2', 'D+1', 'D+0']

export default function AdminFinanceiroPage() {
  const router = useRouter()
  const [isAuthorizing, setIsAuthorizing] = useState(true)
  const [role, setRole] = useState<AdminRole | null>(null)
  const [gateways, setGateways] = useState<GatewayConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canEdit = role === ADMIN_ROLE.SUPER_ADMIN

  useEffect(() => {
    async function load() {
      try {
        const verifyRes = await apiClient.get('/api/v1/admin/session/verify')
        const verifyJson = verifyRes.data as { adminRole?: CanonicalAdminRole }
        if (!verifyJson.adminRole || !canAccess(verifyJson.adminRole, 'financial:read')) {
          router.replace(ROUTES.ADMIN)
          return
        }
      } catch {
        router.replace(ROUTES.ADMIN_LOGIN)
        return
      } finally {
        setIsAuthorizing(false)
      }

      setIsLoading(true)
      setError(null)
      setSuccess(null)

      try {
        const [sessionRes, configRes] = await Promise.all([
          apiClient.get('/api/v1/admin/session/verify'),
          apiClient.get('/api/v1/admin/gateways/config'),
        ])

        const sessionJson = sessionRes.data as { adminRole?: AdminRole }
        setRole(sessionJson.adminRole ?? null)

        const configJson = configRes.data as { data?: { gateways?: GatewayConfig[] } }
        setGateways(configJson.data?.gateways ?? [])
      } catch {
        setError('Erro de conexao ao carregar dados financeiros.')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [router])

  if (isAuthorizing) {
    return (
      <section className="space-y-4">
        <div className="skeleton h-24 w-full rounded-xl" aria-hidden="true" />
        <div className="skeleton h-64 w-full rounded-xl" aria-hidden="true" />
      </section>
    )
  }

  function updateGateway(index: number, patch: Partial<GatewayConfig>) {
    setGateways((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await apiClient.patch('/api/v1/admin/gateways/config', { gateways })
      const data = res.data as { data?: { gateways?: GatewayConfig[] } }
      setGateways(data.data?.gateways ?? gateways)
      setSuccess('Configuracoes de gateways atualizadas com sucesso.')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setError(axiosErr.response?.data?.error?.message ?? 'Falha ao salvar configuracoes de gateway.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h1 className="text-lg font-semibold text-zinc-100">Financeiro e Gateways</h1>
        <p className="mt-2 text-sm text-zinc-400">
          ADMINISTRADOR pode consultar dados financeiros. Apenas SUPER_ADMIN pode alterar configuracoes de gateway.
        </p>
      </header>

      {/* ── Seção 1: Dashboard Financeiro ───────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Dashboard Financeiro
        </h2>
        <FinancialDashboard />
      </div>

      {/* ── Seção 2: Configuração de Gateways ───────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Configuração de Gateways
        </h2>

        {!canEdit && !isLoading && (
          <p className="rounded-md border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-300">
            Conta em modo leitura: alteracoes de gateway exigem role SUPER_ADMIN.
          </p>
        )}

        {error && <p className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
        {success && <p className="rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{success}</p>}

        {isLoading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">Carregando...</div>
        ) : (
          gateways.map((gateway, index) => (
            <article key={gateway.code} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-100">{gateway.name}</h3>
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={gateway.active}
                    onChange={(e) => updateGateway(index, { active: e.target.checked })}
                    disabled={!canEdit}
                  />
                  Ativo
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-xs text-zinc-400">
                  Cor
                  <input
                    type="text"
                    value={gateway.color}
                    onChange={(e) => updateGateway(index, { color: e.target.value })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  />
                </label>

                <label className="text-xs text-zinc-400">
                  Split (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={gateway.splitPercent}
                    onChange={(e) => updateGateway(index, { splitPercent: Number(e.target.value) })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  />
                </label>

                <label className="text-xs text-zinc-400">
                  Webhook endpoint
                  <input
                    type="url"
                    value={gateway.webhookEndpoint ?? ''}
                    onChange={(e) => updateGateway(index, { webhookEndpoint: e.target.value })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-zinc-400">
                  API key (mascarada)
                  <input
                    type="text"
                    value={gateway.webhookApiKey ?? ''}
                    onChange={(e) => updateGateway(index, { webhookApiKey: e.target.value })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  />
                </label>

                <label className="text-xs text-zinc-400">
                  Webhook secret (mascarado)
                  <input
                    type="text"
                    value={gateway.webhookSecret ?? ''}
                    onChange={(e) => updateGateway(index, { webhookSecret: e.target.value })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-xs text-zinc-400">
                  Taxa credito (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={gateway.creditFeePercent}
                    onChange={(e) => updateGateway(index, { creditFeePercent: Number(e.target.value) })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  />
                </label>

                <label className="text-xs text-zinc-400">
                  Liquidacao credito
                  <select
                    value={gateway.creditSettlement}
                    onChange={(e) => updateGateway(index, { creditSettlement: e.target.value as Settlement })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  >
                    {SETTLEMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-zinc-400">
                  Taxa debito (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={gateway.debitFeePercent}
                    onChange={(e) => updateGateway(index, { debitFeePercent: Number(e.target.value) })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  />
                </label>

                <label className="text-xs text-zinc-400">
                  Liquidacao debito
                  <select
                    value={gateway.debitSettlement}
                    onChange={(e) => updateGateway(index, { debitSettlement: e.target.value as Settlement })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  >
                    {SETTLEMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-zinc-400">
                  Taxa pix (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={gateway.pixFeePercent}
                    onChange={(e) => updateGateway(index, { pixFeePercent: Number(e.target.value) })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  />
                </label>

                <label className="text-xs text-zinc-400">
                  Liquidacao pix
                  <select
                    value={gateway.pixSettlement}
                    onChange={(e) => updateGateway(index, { pixSettlement: e.target.value as Settlement })}
                    disabled={!canEdit}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100 disabled:opacity-70"
                  >
                    {SETTLEMENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>
            </article>
          ))
        )}

        {canEdit && gateways.length > 0 && (
          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-md bg-[#F0B90B] px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
          >
            {isSaving ? 'Salvando...' : 'Salvar configuracoes'}
          </button>
        )}
      </div>
    </section>
  )
}
