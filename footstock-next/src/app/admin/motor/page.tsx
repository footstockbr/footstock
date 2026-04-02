'use client'

import { useQuery } from '@tanstack/react-query'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { MotorStateCard } from '@/components/admin/MotorStateCard'
import { ClubEditor } from '@/components/admin/ClubEditor'
import { NewsInjector } from '@/components/admin/NewsInjector'
import { ImpactMatrix } from '@/components/admin/ImpactMatrix'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { AdminMarketActionLog } from '@/lib/types/admin'

async function fetchAuditLog(): Promise<AdminMarketActionLog[]> {
  const res = await fetch('/api/v1/admin/audit?limit=20')
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

const ACTION_BADGE: Record<string, string> = {
  HALT_ASSET: 'bg-red-500/20 text-red-400',
  RELEASE_HALT: 'bg-emerald-500/20 text-emerald-400',
  NEWS_INJECT: 'bg-blue-500/20 text-blue-400',
  UNAUTHORIZED_ATTEMPT: 'bg-yellow-500/20 text-yellow-400',
  ADMIN_BROADCAST: 'bg-purple-500/20 text-purple-400',
}

function AuditLog() {
  const { data: actions, isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: fetchAuditLog,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <h2 className="text-sm font-semibold text-[#EAECEF] mb-3">Ações Recentes</h2>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : !actions?.length ? (
        <p className="text-xs text-[#929AA5] py-4 text-center">Nenhuma ação registrada ainda</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="text-[#929AA5] border-b border-[rgba(240,185,11,.08)]">
                <th className="text-left py-1.5 px-2 font-medium">Data/Hora</th>
                <th className="text-left py-1.5 px-2 font-medium">Admin</th>
                <th className="text-left py-1.5 px-2 font-medium">Ação</th>
                <th className="text-left py-1.5 px-2 font-medium">Ticker</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-b border-[rgba(240,185,11,.06)] last:border-0">
                  <td className="py-2 px-2 text-[#929AA5]">
                    {new Date(a.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="py-2 px-2 text-[#c5b99a]">{a.adminName ?? a.adminId.slice(0, 8)}</td>
                  <td className="py-2 px-2">
                    <span className={cn(
                      'text-[11px] font-medium px-1.5 py-0.5 rounded',
                      ACTION_BADGE[a.action] ?? 'bg-zinc-700/40 text-zinc-400'
                    )}>
                      {a.action}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-[#929AA5]">{a.targetTicker ?? '—'}</td>
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
  // O role virá do contexto/session — assumindo ADMIN para habilitar halt por padrão
  // Em produção, buscar do contexto de sessão
  const canHalt = true

  return (
    <div className="p-4 md:p-6 space-y-5">
      <AdminBreadcrumb />

      <div>
        <h1 className="text-xl font-bold text-[#EAECEF]">Motor de Mercado</h1>
        <p className="text-xs text-[#929AA5] mt-0.5">Estado, clubes, injeção de notícias e audit trail</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Coluna esquerda */}
        <div className="space-y-4">
          <MotorStateCard />
          <ClubEditor canHalt={canHalt} />
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <NewsInjector />
          <ImpactMatrix />
          <AuditLog />
        </div>
      </div>
    </div>
  )
}
