'use client'

import { TrendingUp, TrendingDown, Users, AlertTriangle } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { formatBRL } from '@/lib/utils/format'

interface MRRHistory {
  date: string
  value: number
}

interface MRRDashboardProps {
  mrr: number
  arr: number
  churnRate: number
  newSubscriptions24h: number
  cancelledThisMonth: number
  cancelledPrevMonth: number
  mrrHistory: MRRHistory[]
}

export function MRRDashboard({
  mrr,
  arr,
  churnRate,
  newSubscriptions24h,
  cancelledThisMonth,
  cancelledPrevMonth,
  mrrHistory,
}: MRRDashboardProps) {
  const churnImproving = cancelledThisMonth <= cancelledPrevMonth

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <p className="text-xs text-[#929AA5] mb-1">MRR</p>
          <p className="text-xl font-bold text-[#F0B90B]">{formatBRL(mrr)}</p>
          <p className="text-xs text-[#707A8A] mt-1">Receita Mensal Recorrente</p>
        </div>
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <p className="text-xs text-[#929AA5] mb-1">ARR</p>
          <p className="text-xl font-bold text-[#EAECEF]">{formatBRL(arr)}</p>
          <p className="text-xs text-[#707A8A] mt-1">Receita Anual (projeção)</p>
        </div>
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <p className="text-xs text-[#929AA5] mb-1">Churn Rate</p>
          <div className="flex items-center gap-1.5">
            <p className={`text-xl font-bold ${churnRate > 5 ? 'text-[#F6465D]' : 'text-[#4ade80]'}`}>
              {churnRate.toFixed(1)}%
            </p>
            {churnImproving
              ? <TrendingDown className="h-4 w-4 text-[#4ade80]" />
              : <TrendingUp className="h-4 w-4 text-[#F6465D]" />
            }
          </div>
          <p className="text-xs text-[#707A8A] mt-1">Últimos 30 dias</p>
          <p
            className="text-[10px] text-[#4a5568] mt-1 leading-tight"
            title="cancelamentos_mês / assinantes_início_mês × 100"
          >
            cancelamentos / assinantes × 100
          </p>
        </div>
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <p className="text-xs text-[#929AA5] mb-1">Novas Assinaturas</p>
          <div className="flex items-center gap-1.5">
            <p className="text-xl font-bold text-[#4ade80]">{newSubscriptions24h}</p>
            <Users className="h-4 w-4 text-[#4ade80]" />
          </div>
          <p className="text-xs text-[#707A8A] mt-1">Últimas 24h</p>
        </div>
      </div>

      {/* Gráfico de linha MRR */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h3 className="text-sm font-medium text-[#EAECEF] mb-4">MRR — Últimos 30 dias</h3>
        <div className="h-48 sm:h-64" role="img" aria-label="Gráfico de MRR dos últimos 30 dias">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mrrHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,185,11,.06)" />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => {
                  const d = new Date(v)
                  return `${d.getDate()}/${d.getMonth() + 1}`
                }}
                tick={{ fontSize: 10, fill: '#929AA5' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 10, fill: '#929AA5' }}
                tickLine={false}
                axisLine={false}
                width={45}
              />
              <Tooltip
                contentStyle={{ background: '#1a1815', border: '1px solid rgba(240,185,11,.2)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#F0B90B' }}
                formatter={(value) => [formatBRL(Number(value)), 'Receita']}
                labelFormatter={(label) => {
                  const d = new Date(String(label))
                  return d.toLocaleDateString('pt-BR')
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#F0B90B"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#F0B90B' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {mrr === 0 && (
          <div className="flex items-center gap-2 mt-2 text-xs text-[#929AA5]">
            <AlertTriangle className="h-3.5 w-3.5 text-[#F0B90B]" />
            Sem assinaturas ativas no momento
          </div>
        )}
      </div>
    </div>
  )
}
