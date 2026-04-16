'use client'

// ============================================================================
// FootStock — Admin LGPD / DPO Dashboard
// Rastreabilidade: G023, LGPD Art. 18, Art. 23
// Acesso: admin:audit (SUPER_ADMIN, ADMINISTRADOR)
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, Users, Download, FileText, Shield, RefreshCw } from 'lucide-react'

interface ConsentStats { active: number; revoked: number }
interface ExportStats { pending: number; completed: number; failed: number }
interface RetentionItem { label: string; count: number; policy: string }
interface AccessLog {
  id: string; userId: string; accessedBy: string; dataType: string;
  endpoint: string; reason: string; ipAddress: string | null; createdAt: string
}
interface DeletionRecord { id: string; email: string; deletedAt: string; reason: string; type?: 'lgpd_deletion' | 'suspended' | 'banned' }

interface DashboardData {
  consents: ConsentStats
  exports: ExportStats
  accessLogs: AccessLog[]
  deletions: DeletionRecord[]
  retention: RetentionItem[]
}

type Tab = 'overview' | 'access-logs' | 'deletions' | 'retention'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'access-logs', label: 'Logs de Acesso' },
  { id: 'deletions', label: 'Exclusões' },
  { id: 'retention', label: 'Retenção' },
]

function StatCard({ title, value, sub, icon: Icon, alert }: {
  title: string; value: number | string; sub?: string;
  icon: React.ElementType; alert?: boolean
}) {
  return (
    <div style={{
      background: '#1E2329',
      border: `1px solid ${alert ? 'rgba(246,70,93,.3)' : 'rgba(240,185,11,.12)'}`,
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon size={16} color={alert ? '#F6465D' : '#F0B90B'} />
        <span style={{ fontSize: '12px', color: '#929AA5' }}>{title}</span>
      </div>
      <span style={{ fontSize: '24px', fontWeight: 700, color: alert ? '#F6465D' : '#EAECEF', fontFamily: 'monospace' }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: '11px', color: '#707A8A' }}>{sub}</span>}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminLgpdPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [refreshing, setRefreshing] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const downloadReport = useCallback(async () => {
    setDownloading(true)
    try {
      const res = await fetch('/api/v1/admin/lgpd/export-report', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/)
      const filename = filenameMatch?.[1] ?? `lgpd-report-${new Date().toISOString().slice(0, 10)}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      alert('Erro ao gerar relatório LGPD.')
    } finally {
      setDownloading(false)
    }
  }, [])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/lgpd/dashboard', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados LGPD.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    color: active ? '#F0B90B' : '#929AA5',
    background: active ? 'rgba(240,185,11,.08)' : 'transparent',
    border: active ? '1px solid rgba(240,185,11,.2)' : '1px solid transparent',
    borderRadius: '6px',
    cursor: 'pointer',
  })

  return (
    <div data-testid="admin-lgpd-page" style={{ padding: '24px', maxWidth: '1200px' }}>
      <AdminBreadcrumb />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={20} color="#F0B90B" />
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#EAECEF', margin: 0 }}>
              LGPD / DPO Dashboard
            </h1>
            <p style={{ fontSize: '12px', color: '#929AA5', margin: 0 }}>
              Dados de consentimento, exportação e acesso a PII
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={downloadReport}
            disabled={downloading}
            aria-label="Exportar relatório LGPD"
            data-testid="lgpd-export-report-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 12px', background: 'rgba(46,189,133,.08)',
              border: '1px solid rgba(46,189,133,.3)', borderRadius: '6px',
              color: '#2EBD85', fontSize: '12px', cursor: downloading ? 'not-allowed' : 'pointer',
              opacity: downloading ? 0.6 : 1, fontWeight: 600,
            }}
          >
            <Download size={13} />
            {downloading ? 'Gerando...' : 'Exportar Relatório LGPD'}
          </button>
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            aria-label="Atualizar dados"
            data-testid="lgpd-refresh-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 12px', background: 'rgba(240,185,11,.08)',
              border: '1px solid rgba(240,185,11,.2)', borderRadius: '6px',
              color: '#F0B90B', fontSize: '12px', cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" style={tabStyle(tab === t.id)} onClick={() => setTab(t.id)} data-testid={`lgpd-tab-${t.id}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map((n) => <Skeleton key={n} className="h-20 w-full rounded-xl" />)}
        </div>
      )}

      {!loading && error && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(246,70,93,.08)', border: '1px solid rgba(246,70,93,.3)',
          borderRadius: '10px', padding: '16px',
        }}>
          <AlertTriangle size={16} color="#F6465D" />
          <span style={{ color: '#F6465D', fontSize: '13px' }}>{error}</span>
          <button type="button" onClick={() => fetchData()} style={{
            marginLeft: 'auto', fontSize: '12px', color: '#F6465D', background: 'transparent',
            border: '1px solid rgba(246,70,93,.3)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
          }}>
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Overview tab */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                <StatCard title="Consentimentos Ativos" value={data.consents.active} icon={Users} />
                <StatCard title="Consentimentos Revogados" value={data.consents.revoked} icon={Users} />
                <StatCard title="Exportações Pendentes" value={data.exports.pending} icon={Download} alert={data.exports.pending > 0} />
                <StatCard title="Exportações Completas" value={data.exports.completed} icon={Download} />
                <StatCard title="Exportações com Falha" value={data.exports.failed} icon={Download} alert={data.exports.failed > 0} />
              </div>

              <div style={{
                background: '#1E2329', border: '1px solid rgba(240,185,11,.12)', borderRadius: '12px', padding: '16px',
              }}>
                <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#EAECEF', margin: '0 0 12px' }}>
                  Indicadores de Retenção
                </h2>
                {data.retention.map((item) => (
                  <div key={item.label} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0', borderBottom: '1px solid rgba(240,185,11,.06)',
                  }}>
                    <div>
                      <p style={{ fontSize: '13px', color: '#EAECEF', margin: 0 }}>{item.label}</p>
                      <p style={{ fontSize: '11px', color: '#707A8A', margin: '2px 0 0' }}>{item.policy}</p>
                    </div>
                    <span style={{
                      fontSize: '18px', fontWeight: 700, fontFamily: 'monospace',
                      color: item.count > 0 ? '#F0B90B' : '#2EBD85',
                    }}>
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Access logs tab */}
          {tab === 'access-logs' && (
            <div style={{ background: '#1E2329', border: '1px solid rgba(240,185,11,.12)', borderRadius: '12px', overflow: 'hidden' }} data-testid="lgpd-access-logs-table">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(240,185,11,.08)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={14} color="#F0B90B" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#EAECEF' }}>
                  Últimos {data.accessLogs.length} acessos a PII
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(240,185,11,.04)' }}>
                      {['Tipo', 'Endpoint', 'Motivo', 'IP', 'Data'].map((h) => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#929AA5', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.accessLogs.map((log) => (
                      <tr key={log.id} style={{ borderTop: '1px solid rgba(240,185,11,.04)' }}>
                        <td style={{ padding: '10px 14px', color: '#EAECEF', whiteSpace: 'nowrap' }}>{log.dataType}</td>
                        <td style={{ padding: '10px 14px', color: '#929AA5', fontFamily: 'monospace', fontSize: '11px' }}>{log.endpoint}</td>
                        <td style={{ padding: '10px 14px', color: '#929AA5' }}>{log.reason}</td>
                        <td style={{ padding: '10px 14px', color: '#707A8A', fontFamily: 'monospace', fontSize: '11px' }}>
                          {log.ipAddress ?? '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#707A8A', whiteSpace: 'nowrap' }}>
                          {formatDate(log.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.accessLogs.length === 0 && (
                  <p style={{ color: '#707A8A', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
                    Nenhum log registrado.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Deletions tab */}
          {tab === 'deletions' && (
            <div style={{ background: '#1E2329', border: '1px solid rgba(240,185,11,.12)', borderRadius: '12px', overflow: 'hidden' }} data-testid="lgpd-deletions-table">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(240,185,11,.08)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={14} color="#F0B90B" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#EAECEF' }}>
                  Exclusoes LGPD e contas suspensas/banidas ({data.deletions.length})
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(240,185,11,.04)' }}>
                      {['Tipo', 'Email / ID', 'Motivo', 'Data'].map((h) => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#929AA5', fontWeight: 600 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.deletions.map((d) => {
                      const isLgpd = d.type === 'lgpd_deletion'
                      const badgeColor = isLgpd ? '#2EBD85' : '#F6465D'
                      const badgeLabel = isLgpd ? 'Art. 18' : d.type === 'banned' ? 'Banido' : 'Suspenso'
                      return (
                        <tr key={d.id} style={{ borderTop: '1px solid rgba(240,185,11,.04)' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              fontSize: '10px', fontWeight: 700, color: badgeColor,
                              background: `${badgeColor}18`, padding: '2px 6px', borderRadius: '3px',
                            }}>
                              {badgeLabel}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: isLgpd ? '#707A8A' : '#EAECEF', fontFamily: 'monospace', fontSize: '11px' }}>
                            {d.email}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#929AA5' }}>{d.reason}</td>
                          <td style={{ padding: '10px 14px', color: '#707A8A', whiteSpace: 'nowrap' }}>
                            {formatDate(d.deletedAt)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {data.deletions.length === 0 && (
                  <p style={{ color: '#707A8A', fontSize: '13px', textAlign: 'center', padding: '32px 0' }}>
                    Nenhuma exclusão ou suspensão registrada.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Retention tab */}
          {tab === 'retention' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.retention.map((item) => (
                <div key={item.label} style={{
                  background: '#1E2329',
                  border: `1px solid ${item.count > 0 ? 'rgba(240,185,11,.2)' : 'rgba(46,189,133,.15)'}`,
                  borderRadius: '12px', padding: '16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#EAECEF', margin: 0 }}>{item.label}</p>
                    <p style={{ fontSize: '12px', color: '#929AA5', margin: '4px 0 0' }}>{item.policy}</p>
                  </div>
                  <span style={{
                    fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', flexShrink: 0,
                    color: item.count > 0 ? '#F0B90B' : '#2EBD85',
                  }}>
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
