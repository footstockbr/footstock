'use client'
// ============================================================================
// Foot Stock — /admin/motor (Controle do Motor)
// Status, gestão de ativos, injeção de notícias, audit trail.
// Rastreabilidade: INT-086, TASK-3/ST011
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { MotorStateCard } from '@/components/admin/MotorStateCard'
import { ClubEditor } from '@/components/admin/ClubEditor'
import { NewsInjector } from '@/components/admin/NewsInjector'
import { ImpactMatrix } from '@/components/admin/ImpactMatrix'
import { canAccess } from '@/lib/auth/canAccess'
import { cn } from '@/lib/utils/cn'
import type { AdminMarketActionLog } from '@/lib/types/admin'
import type { AdminRole } from '@/lib/enums'
import { NOTIFICATION_POLL_MS } from '@/lib/constants/timing'

const ACTION_BADGE: Record<string, string> = {
  HALT_ASSET: 'bg-red-500/20 text-red-400',
  RELEASE_HALT: 'bg-emerald-500/20 text-emerald-400',
  INJECT_NEWS: 'bg-blue-500/20 text-blue-400',
  UNAUTHORIZED_ATTEMPT: 'bg-yellow-500/20 text-yellow-400',
  ADMIN_BROADCAST: 'bg-purple-500/20 text-purple-400',
}

function AuditLog() {
  const [actions, setActions] = useState<AdminMarketActionLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isForbidden, setIsForbidden] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/v1/admin/audit?limit=20')
        if (res.status === 403) {
          setIsForbidden(true)
          setActions([])
          return
        }
        if (!res.ok) return
        setIsForbidden(false)
        const json = await res.json()
        setActions(json.data)
      } finally {
        setIsLoading(false)
      }
    }
    load()
    const interval = setInterval(load, NOTIFICATION_POLL_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">Ações Recentes</h3>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-9 w-full rounded" aria-hidden="true" />
          ))}
        </div>
      ) : isForbidden ? (
        <p className="py-4 text-center text-xs text-zinc-500">
          Seu perfil possui acesso de leitura ao motor, mas não ao audit trail administrativo.
        </p>
      ) : actions.length === 0 ? (
        <p className="py-4 text-center text-xs text-zinc-500">Nenhuma ação registrada ainda</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs" aria-label="Histórico de ações administrativas">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-2 py-1.5 text-left font-medium">Data/Hora</th>
                <th className="px-2 py-1.5 text-left font-medium">Admin</th>
                <th className="px-2 py-1.5 text-left font-medium">Ação</th>
                <th className="px-2 py-1.5 text-left font-medium">Ticker</th>
              </tr>
            </thead>
            <tbody>
              {actions.map(a => (
                <tr key={a.id} className="border-b border-zinc-800/50 last:border-0">
                  <td className="px-2 py-2 text-zinc-500">
                    {new Date(a.createdAt).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-2 py-2 text-zinc-300">
                    {a.admin?.name ?? a.adminId.slice(0, 8)}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[11px] font-medium',
                        ACTION_BADGE[a.action] ?? 'bg-zinc-700/40 text-zinc-400'
                      )}
                    >
                      {a.action}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-zinc-500">{a.ticker ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function AdminMotorPage() {
  const router = useRouter()
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null)
  const [isAuthorizing, setIsAuthorizing] = useState(true)
  const canControlMotor = adminRole === 'SUPER_ADMIN' || adminRole === 'ADMINISTRADOR'

  useEffect(() => {
    async function loadRole() {
      try {
        const res = await fetch('/api/v1/admin/session/verify')
        if (!res.ok) {
          router.replace('/admin/login')
          return
        }
        const json = (await res.json()) as { adminRole?: AdminRole }
        if (!json.adminRole || !canAccess(json.adminRole, 'motor:read')) {
          router.replace('/admin')
          return
        }
        setAdminRole(json.adminRole)
      } catch {
        router.replace('/admin/login')
      } finally {
        setIsAuthorizing(false)
      }
    }

    void loadRole()
  }, [router])

  if (isAuthorizing) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-6 w-48 rounded" aria-hidden="true" />
        <div className="skeleton h-24 w-full rounded-xl" aria-hidden="true" />
        <div className="skeleton h-64 w-full rounded-xl" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <AdminBreadcrumb />

      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Motor de Mercado</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Estado, gestão de clubes, injeção de notícias e audit trail.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <MotorStateCard />
          <ClubEditor canHalt={canControlMotor} />
        </div>
        <div className="space-y-4">
          {canControlMotor ? (
            <NewsInjector />
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-semibold text-zinc-100">Injeção de Notícias</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Modo leitura: apenas SUPER_ADMIN e ADMINISTRADOR podem injetar notícias no motor.
              </p>
            </div>
          )}
          <ImpactMatrix />
          <AuditLog />
        </div>
      </div>
    </div>
  )
}
