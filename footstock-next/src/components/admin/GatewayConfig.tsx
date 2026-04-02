'use client'

import { CheckCircle, AlertCircle, Clock } from 'lucide-react'

interface GatewayStatus {
  gateway: string
  lastActivity: string | null
  transactionCount: number
}

interface GatewayConfigProps {
  gatewayStatus: GatewayStatus[]
}

function getGatewayHealth(lastActivity: string | null): 'online' | 'degraded' | 'offline' {
  if (!lastActivity) return 'offline'
  const diffMs = Date.now() - new Date(lastActivity).getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  if (diffHours < 24) return 'online'
  if (diffHours < 72) return 'degraded'
  return 'offline'
}

const STATUS_CONFIG = {
  online: {
    label: 'Online',
    icon: CheckCircle,
    textColor: 'text-[#4ade80]',
    bgColor: 'bg-[rgba(74,222,128,.1)]',
    dotColor: 'bg-[#4ade80]',
  },
  degraded: {
    label: 'Degradado',
    icon: AlertCircle,
    textColor: 'text-[#f59e0b]',
    bgColor: 'bg-[rgba(245,158,11,.1)]',
    dotColor: 'bg-[#f59e0b]',
  },
  offline: {
    label: 'Offline',
    icon: AlertCircle,
    textColor: 'text-[#F6465D]',
    bgColor: 'bg-[rgba(239,68,68,.1)]',
    dotColor: 'bg-[#F6465D]',
  },
}

const GATEWAY_LABELS: Record<string, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  PAGSEGURO: 'PagSeguro',
  PAYPAL: 'PayPal',
}

export function GatewayConfig({ gatewayStatus }: GatewayConfigProps) {
  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <h2 className="text-sm font-medium text-[#EAECEF] mb-4">Status dos Gateways</h2>

      {gatewayStatus.length === 0 ? (
        <div className="text-sm text-[#929AA5] text-center py-6">
          Nenhum gateway com atividade registrada
        </div>
      ) : (
        <div className="space-y-3">
          {gatewayStatus.map((g) => {
            const health = getGatewayHealth(g.lastActivity)
            const config = STATUS_CONFIG[health]
            const Icon = config.icon

            return (
              <div
                key={g.gateway}
                className={`flex items-center justify-between p-3 rounded-lg ${config.bgColor}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dotColor} ${health === 'online' ? 'animate-pulse' : ''}`} />
                  <div>
                    <p className="text-sm font-medium text-[#EAECEF]">
                      {GATEWAY_LABELS[g.gateway] ?? g.gateway}
                    </p>
                    {g.lastActivity && (
                      <p className="text-xs text-[#929AA5] flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        Última atividade: {new Date(g.lastActivity).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#929AA5]">{g.transactionCount} trans.</span>
                  <div className={`flex items-center gap-1 ${config.textColor}`}>
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium">{config.label}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
