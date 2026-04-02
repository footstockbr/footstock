'use client'

// ============================================================================
// Foot Stock — /admin/lgpd (DPO Dashboard)
// Painel de conformidade LGPD para o Data Protection Officer.
// Protegido por canAccess(role, 'admin:audit').
// Rastreabilidade: G023
// ============================================================================

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { canAccess } from '@/lib/auth/canAccess'
import type { AdminRole } from '@/lib/enums'

interface ConsentStats {
  active: number
  revoked: number
}

interface ExportStats {
  pending: number
  completed: number
  failed: number
}

interface DataAccessEntry {
  id: string
  userId: string
  accessedBy: string
  dataType: string
  endpoint: string
  reason: string | null
  createdAt: string
}

interface AccountDeletion {
  id: string
  email: string
  deletedAt: string
  reason: string | null
}

interface RetentionIndicator {
  label: string
  count: number
  policy: string
}

export default function LGPDDashboardPage() {
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null)
  const [consentStats, setConsentStats] = useState<ConsentStats>({ active: 0, revoked: 0 })
  const [exportStats, setExportStats] = useState<ExportStats>({ pending: 0, completed: 0, failed: 0 })
  const [accessLogs, setAccessLogs] = useState<DataAccessEntry[]>([])
  const [deletions, setDeletions] = useState<AccountDeletion[]>([])
  const [retention, setRetention] = useState<RetentionIndicator[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const res = await apiClient.get('/api/v1/admin/lgpd/dashboard')
        const data = res.data

        setAdminRole(data.adminRole ?? null)
        setConsentStats(data.consents ?? { active: 0, revoked: 0 })
        setExportStats(data.exports ?? { pending: 0, completed: 0, failed: 0 })
        setAccessLogs(data.accessLogs ?? [])
        setDeletions(data.deletions ?? [])
        setRetention(data.retention ?? [])
      } catch (err) {
        console.error('[LGPD Dashboard] Erro:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <AdminBreadcrumb items={[{ label: 'LGPD' }]} />
        <div className="animate-pulse space-y-4 mt-6">
          <div className="h-24 bg-zinc-800 rounded-xl" />
          <div className="h-24 bg-zinc-800 rounded-xl" />
          <div className="h-64 bg-zinc-800 rounded-xl" />
        </div>
      </div>
    )
  }

  if (adminRole && !canAccess(adminRole, 'admin:audit')) {
    return (
      <div className="p-6">
        <AdminBreadcrumb items={[{ label: 'LGPD' }]} />
        <div className="mt-6 rounded-xl border border-red-900/30 bg-red-900/10 p-6 text-center">
          <p className="text-sm text-red-400">
            Acesso restrito. Somente administradores com permissao admin:audit podem visualizar este painel.
          </p>
        </div>
      </div>
    )
  }

  async function handleExportReport() {
    setExporting(true)
    try {
      const res = await apiClient.post('/api/v1/admin/lgpd/export-report', null, { responseType: 'blob' })
      const blob = res.data as Blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lgpd-report-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[LGPD] Erro ao exportar:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <AdminBreadcrumb items={[{ label: 'LGPD / DPO Dashboard' }]} />

      <div className="flex items-center justify-between mt-6 mb-6">
        <h1 className="text-xl font-bold text-zinc-100">Painel LGPD</h1>
        <button
          onClick={handleExportReport}
          disabled={exporting}
          className="px-4 py-2 rounded-lg bg-[#F0B90B] text-[#0B0E11] text-sm font-semibold disabled:opacity-50"
        >
          {exporting ? 'Exportando...' : 'Exportar Relatorio LGPD'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="Consentimentos Ativos" value={consentStats.active} color="green" />
        <KPICard label="Consentimentos Revogados" value={consentStats.revoked} color="red" />
        <KPICard label="Exportacoes Pendentes" value={exportStats.pending} color="yellow" />
        <KPICard label="Exportacoes Concluidas" value={exportStats.completed} color="green" />
      </div>

      {/* Data Retention Indicators */}
      {retention.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-zinc-200 mb-3">Retencao de Dados</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {retention.map((r) => (
              <div key={r.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-medium text-zinc-300">{r.label}</p>
                <p className="text-2xl font-bold font-mono text-zinc-100 mt-1">{r.count}</p>
                <p className="text-xs text-zinc-500 mt-1">{r.policy}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Data Access Audit Log */}
      <section className="mb-6">
        <h2 className="text-base font-semibold text-zinc-200 mb-3">Auditoria de Acesso a PII</h2>
        {accessLogs.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">Nenhum registro de acesso encontrado.</p>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                  <th className="p-3 font-medium">Data</th>
                  <th className="p-3 font-medium">Tipo</th>
                  <th className="p-3 font-medium">Acessado por</th>
                  <th className="p-3 font-medium">Endpoint</th>
                  <th className="p-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {accessLogs.slice(0, 50).map((log) => (
                  <tr key={log.id} className="border-b border-zinc-800/50 last:border-0">
                    <td className="p-3 font-mono text-xs text-zinc-400">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-300">
                        {log.dataType}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-zinc-400">{log.accessedBy}</td>
                    <td className="p-3 text-xs text-zinc-400">{log.endpoint}</td>
                    <td className="p-3 text-xs text-zinc-500">{log.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Account Deletions Timeline */}
      <section className="mb-6">
        <h2 className="text-base font-semibold text-zinc-200 mb-3">Exclusoes de Conta</h2>
        {deletions.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-6">Nenhuma exclusao de conta registrada.</p>
        ) : (
          <div className="space-y-2">
            {deletions.map((d) => (
              <div key={d.id} className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">{d.email}</p>
                  <p className="text-xs text-zinc-500">{d.reason ?? 'Solicitacao do titular'}</p>
                </div>
                <p className="text-xs text-zinc-500 font-mono shrink-0">
                  {new Date(d.deletedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI Card interno
// ---------------------------------------------------------------------------

function KPICard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'green' | 'red' | 'yellow'
}) {
  const colorMap = {
    green: 'border-emerald-900/30 text-emerald-400',
    red: 'border-red-900/30 text-red-400',
    yellow: 'border-yellow-900/30 text-yellow-400',
  }

  return (
    <div className={`rounded-xl border bg-zinc-900 p-4 ${colorMap[color]}`}>
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono">{value}</p>
    </div>
  )
}
